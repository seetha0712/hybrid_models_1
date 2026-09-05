"""Tier callers used by the gateway. Each returns (answer, confidence, hop_dict).

R5_SLM  -> spectrum.tiny.infer.TinyClassifier (CPU, in-process)
R5_PII  -> spectrum.pii.redact.Redactor (CPU, in-process)
R4_OPEN -> spectrum.openweights.serve.OpenWeights (remote Modal class on a T4)
R2/R1   -> spectrum.claude_client.call_claude (Anthropic API, cached system prompts)
"""
from __future__ import annotations

import time
from typing import Any

from spectrum.claude_client import call_claude, system_blocks
from spectrum.pricing import modal_cpu_cost
from spectrum.prompts import CLASSIFY_SCHEMA, INTENT_SYSTEM_PROMPTS, ROUTER_ANSWER_SCHEMA, classification_user_prompt
from spectrum.router.policy import TIER_MODEL

SLM_CORES, SLM_GIB = 2, 4


class Tiers:
    def __init__(self, *, tiny=None, redactor=None, claude_client=None, openweights=None, txn_system_prompt: str | None = None):
        self.tiny = tiny
        self.redactor = redactor
        self.claude = claude_client
        self.ow = openweights
        self.txn_system = system_blocks(txn_system_prompt) if txn_system_prompt else None

    def status(self) -> dict:
        return {"slm": "warm" if self.tiny else "down", "pii": "warm" if self.redactor and self.redactor.pipe else ("regex" if self.redactor else "down"),
                "openweights": "configured" if self.ow else "down", "claude": "configured" if self.claude else "down"}

    def call(self, tier: str, *, text: str, intent: str) -> tuple[str, Any, dict]:
        if tier == "R5_SLM":
            return self._slm(text)
        if tier == "R5_PII":
            return self._pii(text)
        if tier == "R4_OPEN":
            return self._open(text, intent)
        return self._claude(tier, text, intent)

    def _slm(self, text: str):
        if not self.tiny:
            return "", None, {"tier": "R5_SLM", "model": TIER_MODEL["R5_SLM"], "ok": False, "error": "tiny model not loaded", "tokens": {}, "latency_ms": 0, "cost_usd": 0}
        t0 = time.perf_counter()
        p = self.tiny.predict([text])[0]
        wall = time.perf_counter() - t0
        hop = {"tier": "R5_SLM", "model": TIER_MODEL["R5_SLM"], "ok": True, "tokens": {}, "latency_ms": round(wall * 1000, 1),
               "cost_usd": modal_cpu_cost(cores=SLM_CORES, gib=SLM_GIB, seconds=wall), "confidence": p["confidence"], "top3": p["top3"]}
        return p["label"], p["confidence"], hop

    def _pii(self, text: str):
        if not self.redactor:
            return "", None, {"tier": "R5_PII", "model": TIER_MODEL["R5_PII"], "ok": False, "error": "redactor not loaded", "tokens": {}, "latency_ms": 0, "cost_usd": 0}
        r = self.redactor.redact(text)
        hop = {"tier": "R5_PII", "model": r["model"], "ok": True, "tokens": {}, "latency_ms": r["latency_ms"],
               "cost_usd": modal_cpu_cost(cores=SLM_CORES, gib=SLM_GIB, seconds=r["latency_ms"] / 1000), "confidence": "high", "entities": len(r["entities"])}
        return r["redacted"], "high", hop

    def _open(self, text: str, intent: str):
        if not self.ow:
            return "", None, {"tier": "R4_OPEN", "model": TIER_MODEL["R4_OPEN"], "ok": False, "error": "openweights not configured", "tokens": {}, "latency_ms": 0, "cost_usd": 0}
        sys_prompt = INTENT_SYSTEM_PROMPTS.get(intent, INTENT_SYSTEM_PROMPTS["chat"])
        t0 = time.perf_counter()
        try:
            r = self.ow.generate.remote(sys_prompt, text)
        except Exception as e:
            return "", None, {"tier": "R4_OPEN", "model": TIER_MODEL["R4_OPEN"], "ok": False, "error": f"{type(e).__name__}: {e}", "tokens": {}, "latency_ms": round((time.perf_counter() - t0) * 1000, 1), "cost_usd": 0}
        hop = {"tier": "R4_OPEN", "model": r["model"], "ok": True, "tokens": {"in": r["prompt_tokens"], "cache_write": 0, "cache_read": 0, "out": r["completion_tokens"]},
               "latency_ms": round((time.perf_counter() - t0) * 1000, 1), "gpu_ms": r["latency_ms"], "cost_usd": r["cost_usd"], "confidence": r["confidence"]}
        return r["text"], r["confidence"], hop

    def _claude(self, tier: str, text: str, intent: str):
        model = TIER_MODEL[tier]
        if not self.claude:
            return "", None, {"tier": tier, "model": model, "ok": False, "error": "no ANTHROPIC_API_KEY", "tokens": {}, "latency_ms": 0, "cost_usd": 0}
        if intent == "txn_categorise" and self.txn_system:
            res = call_claude(self.claude, model=model, system=self.txn_system, user=classification_user_prompt(text), schema=CLASSIFY_SCHEMA, max_tokens=64)
            answer = (res.json or {}).get("category", res.text)
            conf = (res.json or {}).get("confidence")
        else:
            sys_prompt = INTENT_SYSTEM_PROMPTS.get(intent, INTENT_SYSTEM_PROMPTS["chat"])
            effort = "low" if tier == "R1_OPUS" else None
            # Reasoning tiers spend output tokens on internal thinking before the answer, so the budget
            # must cover both. Opus (adaptive thinking on) needs the most; 1024 truncates it to nothing.
            max_tokens = 8192 if tier == "R1_OPUS" else 2048
            res = call_claude(self.claude, model=model, system=system_blocks(sys_prompt), user=text, schema=ROUTER_ANSWER_SCHEMA, max_tokens=max_tokens, effort=effort)
            answer = (res.json or {}).get("answer", res.text)
            conf = (res.json or {}).get("confidence")
        hop = res.hop(tier)
        hop["confidence"] = conf
        return answer, conf, hop
