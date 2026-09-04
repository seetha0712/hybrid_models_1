"""One wrapper around the Anthropic Messages API used by every frontier tier (R1/R2).

Technique: prompt engineering + in-context learning only. No Claude weights are trained.
- `system_blocks` are frozen constants (no timestamps) with `cache_control` on the last block
  so repeated calls hit the prompt cache (>=4096 tokens needed on Haiku 4.5 to cache at all).
- JSON answers use `output_config.format` (json_schema); no assistant prefill (400 on 4.6+).
- `stop_reason == "refusal"` is returned to the caller as a failed hop (HTTP 200, not an error).
- Every call returns usage in the API's own vocabulary and the USD cost from pricing.json.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any

from spectrum.pricing import Usage, claude_cost

MODELS = {
    "haiku": "claude-haiku-4-5",
    "sonnet": "claude-sonnet-5",
    "opus": "claude-opus-5",
}


@dataclass
class ClaudeResult:
    model: str
    text: str
    json: dict | None
    usage: Usage
    cost_usd: float
    latency_ms: float
    stop_reason: str
    ok: bool
    error: str | None = None
    raw: Any = field(default=None, repr=False)

    def hop(self, tier: str) -> dict:
        return {"tier": tier, "model": self.model, "tokens": self.usage.as_dict(), "latency_ms": round(self.latency_ms, 1),
                "cost_usd": self.cost_usd, "stop_reason": self.stop_reason, "ok": self.ok, "error": self.error}


def system_blocks(text: str) -> list[dict]:
    """A single cached system block. Keep `text` byte-identical between calls."""
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


def _thinking_kwargs(model: str, effort: str | None) -> dict:
    """Haiku 4.5: no thinking. Sonnet 5: disable for classification-type calls. Opus 5: adaptive
    thinking stays on (disabling it has known failure modes); cap spend with effort."""
    if model == MODELS["haiku"]:
        return {}
    if model == MODELS["sonnet"]:
        return {"thinking": {"type": "disabled"}} if effort is None else {"output_config": {"effort": effort}}
    return {"output_config": {"effort": effort or "low"}}


def call_claude(client: Any, *, model: str, system: list[dict], user: str, schema: dict | None = None,
                max_tokens: int = 512, effort: str | None = None, temperature: float | None = None) -> ClaudeResult:
    kwargs: dict[str, Any] = dict(model=model, max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": user}])
    th = _thinking_kwargs(model, effort)
    if schema is not None:
        oc = th.pop("output_config", {})
        oc["format"] = {"type": "json_schema", "schema": schema}
        kwargs["output_config"] = oc
    kwargs.update(th)
    if temperature is not None and model == MODELS["haiku"]:
        kwargs["temperature"] = temperature
    t0 = time.perf_counter()
    try:
        resp = client.messages.create(**kwargs)
    except Exception as e:  # rate limit / connection / 4xx — the caller decides whether to cascade
        return ClaudeResult(model=model, text="", json=None, usage=Usage(), cost_usd=0.0,
                            latency_ms=(time.perf_counter() - t0) * 1000, stop_reason="error", ok=False, error=f"{type(e).__name__}: {e}")
    latency = (time.perf_counter() - t0) * 1000
    usage = Usage.from_api(resp.usage)
    text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
    parsed = None
    ok = resp.stop_reason not in ("refusal", "max_tokens")
    err = None
    if schema is not None and ok:
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            ok, err = False, f"json: {e}"
    if resp.stop_reason == "refusal":
        err = f"refusal: {getattr(getattr(resp, 'stop_details', None), 'category', None)}"
    return ClaudeResult(model=model, text=text, json=parsed, usage=usage, cost_usd=claude_cost(model, usage),
                        latency_ms=latency, stop_reason=resp.stop_reason or "", ok=ok, error=err, raw=resp)


def count_tokens(client: Any, *, model: str, system: list[dict], user: str) -> int:
    r = client.messages.count_tokens(model=model, system=system, messages=[{"role": "user", "content": user}])
    return int(r.input_tokens)


def make_client() -> Any:
    import anthropic

    return anthropic.Anthropic(max_retries=2)
