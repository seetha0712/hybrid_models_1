#!/usr/bin/env python3
"""Smoke-test the deployed gateway: every endpoint, schema, latency budget, cache hit, and cost.

    python scripts/smoke.py --base https://<workspace>--model-spectrum-web.modal.run --key $DEMO_KEY
"""
from __future__ import annotations

import argparse
import json
import sys
import time

import httpx


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--skip-openweights", action="store_true")
    a = ap.parse_args()
    H = {"X-Demo-Key": a.key}
    c = httpx.Client(base_url=a.base.rstrip("/"), timeout=90)
    fails, cost = [], 0.0

    def check(name, cond, detail=""):
        print(("PASS " if cond else "FAIL ") + name + (f"  {detail}" if detail else ""))
        if not cond:
            fails.append(name)

    h = c.get("/health").json()
    check("health", h.get("ok") is True, json.dumps(h.get("tiers")))

    t0 = time.perf_counter(); r = c.post("/classify_txn", json={"narrations": ["WHOLE FOODS MKT #10 SEATTLE WA", "STARBUCKS #221 AUSTIN TX"]}, headers=H)
    ms = (time.perf_counter() - t0) * 1000
    j = r.json() if r.status_code == 200 else {}
    check("classify_txn 200 + schema", r.status_code == 200 and "results" in j and "category" in j["results"][0], f"{ms:.0f}ms p={j.get('n_params')}")
    check("classify_txn latency < 300ms warm", ms < 300, f"{ms:.0f}ms")

    r = c.post("/pii", json={"text": "Hi, Ana Ruiz here, card 4111 1111 1111 1111, mail ana@example.com"}, headers=H)
    j = r.json() if r.status_code == 200 else {}
    check("pii redacts card+email", r.status_code == 200 and "[CARD_1]" in j.get("redacted", "") and "[EMAIL_1]" in j.get("redacted", ""), j.get("model"))
    check("pii latency < 200ms", j.get("latency_ms", 1e9) < 200, f"{j.get('latency_ms')}ms")

    if not a.skip_openweights:
        t0 = time.perf_counter(); r = c.post("/openweights", json={"prompt": "One line: what is a CSA in derivatives?", "max_new_tokens": 60}, headers=H)
        ms = (time.perf_counter() - t0) * 1000
        j = r.json() if r.status_code == 200 else {}
        check("openweights answers", r.status_code == 200 and bool(j.get("text")), f"{ms:.0f}ms (cold start if > 20s)")
        cost += j.get("cost_usd", 0)

    seen_cache = False
    for i in range(2):
        t0 = time.perf_counter(); r = c.post("/route", json={"text": "Categorise this transaction: SQ *NEW VENDOR 8821 AUSTIN TX"}, headers=H)
        ms = (time.perf_counter() - t0) * 1000
        j = r.json() if r.status_code == 200 else {}
        check(f"route txn #{i+1}", r.status_code == 200 and j.get("final_tier") in ("R5_SLM", "R2_HAIKU"), f"{ms:.0f}ms tier={j.get('final_tier')} hops={[h['tier'] for h in j.get('hops', [])]}")
        cost += j.get("total_cost_usd", 0)
        for hop in j.get("hops", []):
            if hop.get("tier") == "R2_HAIKU" and hop.get("tokens", {}).get("cache_read", 0) > 0:
                seen_cache = True
    r = c.post("/route", json={"text": "Draft a polite email to Ana Ruiz (ana@example.com) about the fee change.", "force_tier": "R2_HAIKU"}, headers=H)
    j = r.json() if r.status_code == 200 else {}
    check("route redacts before frontier", r.status_code == 200 and j.get("pii", {}).get("sent_to_frontier") == 0 and j.get("pii", {}).get("redacted_count", 0) >= 1, f"redacted={j.get('pii', {}).get('redacted_count')}")
    check("route haiku path < 4s", j.get("total_latency_ms", 1e9) < 4000, f"{j.get('total_latency_ms')}ms")
    cost += j.get("total_cost_usd", 0)
    r = c.post("/route", json={"text": "Draft a polite email to the client about the fee change.", "force_tier": "R2_HAIKU"}, headers=H)
    j = r.json() if r.status_code == 200 else {}
    for hop in j.get("hops", []):
        if hop.get("tokens", {}).get("cache_read", 0) > 0:
            seen_cache = True
    cost += j.get("total_cost_usd", 0)
    check("prompt cache hit observed on a Claude hop", seen_cache, "(Haiku needs a >=4096-token system prompt; only the txn prompt is that long)")
    m = c.get("/metrics", headers=H).json()
    check("metrics", "by_tier" in m and m.get("n", 0) >= 3, f"n={m.get('n')}")
    print(f"\nsmoke cost ≈ ${cost:.4f}; failures: {fails or 'none'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
