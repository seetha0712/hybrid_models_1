"""Request log (JSONL on the Volume) + aggregates for /metrics and the what-if replay.

One row per routed request: {ts, request_id, intent, intent_confidence, hops[], final_tier,
total_cost_usd, total_latency_ms, pii{redacted_count, sent_to_frontier}, n_tokens_est}.
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

from spectrum.pricing import claude_cost, load_pricing


class LogStore:
    def __init__(self, path: str | Path, commit_fn=None, commit_every: int = 10):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._rows: list[dict] = []
        self._commit_fn = commit_fn
        self._commit_every = commit_every
        self._since_commit = 0
        if self.path.exists():
            with open(self.path, encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        try:
                            self._rows.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass

    def append(self, row: dict) -> None:
        row = {"ts": time.time(), **row}
        with self._lock:
            self._rows.append(row)
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            self._since_commit += 1
            if self._commit_fn and self._since_commit >= self._commit_every:
                try:
                    self._commit_fn()
                finally:
                    self._since_commit = 0

    def rows(self, n: int | None = None, since: float | None = None) -> list[dict]:
        rs = self._rows if since is None else [r for r in self._rows if r.get("ts", 0) >= since]
        return rs[-n:] if n else list(rs)

    def clear(self) -> None:
        with self._lock:
            self._rows.clear()
            if self.path.exists():
                os.remove(self.path)


def what_if_costs(row: dict) -> dict:
    """Recompute one request under alternative policies using its recorded tokens.
    all_flagship: everything on Sonnet 5 with the same input/output sizes and no cache.
    all_small:    the cheapest tier that could have answered (R5/R4 marginal rates)."""
    p = load_pricing()
    hops = row.get("hops", [])
    tin = sum(h.get("tokens", {}).get("in", 0) + h.get("tokens", {}).get("cache_read", 0) + h.get("tokens", {}).get("cache_write", 0) for h in hops) or row.get("n_tokens_est", 0)
    tout = sum(h.get("tokens", {}).get("out", 0) for h in hops) or 40
    flagship = claude_cost("claude-sonnet-5", {"in": tin, "cache_write": 0, "cache_read": 0, "out": tout})
    small_rate = p["self_hosted_defaults"]["variable_per_task_usd"]
    return {"policy": row.get("total_cost_usd", 0.0), "all_flagship": round(flagship, 8), "all_small": small_rate}


def metrics(rows: list[dict]) -> dict:
    by: dict[str, dict] = {}
    cum, c_pol = [], 0.0
    c_flag = c_small = 0.0
    pii_blocked = 0
    for r in rows:
        ft = r.get("final_tier", "?")
        b = by.setdefault(ft, {"tier": ft, "tasks": 0, "cost_usd": 0.0, "latencies": [], "tokens_in": 0, "tokens_out": 0, "cache_read": 0, "escalations": 0})
        b["tasks"] += 1
        b["cost_usd"] += r.get("total_cost_usd", 0.0)
        b["latencies"].append(r.get("total_latency_ms", 0.0))
        for h in r.get("hops", []):
            t = h.get("tokens", {})
            b["tokens_in"] += t.get("in", 0) + t.get("cache_write", 0)
            b["cache_read"] += t.get("cache_read", 0)
            b["tokens_out"] += t.get("out", 0)
        b["escalations"] += max(0, len(r.get("hops", [])) - 1)
        w = what_if_costs(r)
        c_pol += w["policy"]; c_flag += w["all_flagship"]; c_small += w["all_small"]
        cum.append({"t": r.get("ts"), "policy_usd": round(c_pol, 6), "flagship_usd": round(c_flag, 6), "small_usd": round(c_small, 6)})
        pii_blocked += r.get("pii", {}).get("redacted_count", 0)
    out = []
    for b in by.values():
        lat = sorted(b.pop("latencies"))
        b["cost_per_task_usd"] = round(b["cost_usd"] / b["tasks"], 8)
        b["cost_usd"] = round(b["cost_usd"], 6)
        b["p50_ms"] = round(lat[len(lat) // 2], 1) if lat else None
        b["p95_ms"] = round(lat[max(0, int(len(lat) * 0.95) - 1)], 1) if lat else None
        out.append(b)
    out.sort(key=lambda b: -b["tasks"])
    return {"by_tier": out, "cumulative": cum, "pii_blocked_total": pii_blocked, "n": len(rows),
            "totals": {"policy_usd": round(c_pol, 6), "all_flagship_usd": round(c_flag, 6), "all_small_usd": round(c_small, 6)}}
