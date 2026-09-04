"""Routing policy: pure functions, no I/O, fully unit-tested.

Tiers:  R5_SLM (tiny owned model) · R5_PII (guardrail) · R4_OPEN (Qwen3-1.7B on our GPU)
        R2_HAIKU · R1_SONNET · R1_OPUS
Rules:
  1. PII guard always runs first (handled by the gateway, not here).
  2. intent confidence < INTENT_MIN -> treat as uncertain -> R2_HAIKU (cheap generalist).
  3. Tier self-confidence below the threshold ("low", or SLM max-prob < SLM_MIN) -> escalate one step.
  4. Max MAX_HOPS hops. Inputs longer than LONG_INPUT_TOKENS skip R4/R5.
  5. `force_tier` overrides everything (demo: "show the same request on Opus").
"""
from __future__ import annotations

TIERS = ["R5_SLM", "R5_PII", "R4_OPEN", "R2_HAIKU", "R1_SONNET", "R1_OPUS"]
INTENT_MIN = 0.55
SLM_MIN = 0.80
MAX_HOPS = 2
LONG_INPUT_TOKENS = 6000

CHAINS: dict[str, list[str]] = {
    "txn_categorise": ["R5_SLM", "R2_HAIKU"],
    "pii_redact": ["R5_PII"],
    "doc_classify": ["R4_OPEN", "R2_HAIKU"],
    "chat": ["R4_OPEN", "R2_HAIKU"],
    "summarise": ["R4_OPEN", "R2_HAIKU", "R1_SONNET"],
    "draft": ["R2_HAIKU", "R1_SONNET"],
    "code": ["R1_SONNET"],
    "complex_analysis": ["R1_OPUS"],
}
UNCERTAIN_CHAIN = ["R2_HAIKU", "R1_SONNET"]
TIER_MODEL = {"R2_HAIKU": "claude-haiku-4-5", "R1_SONNET": "claude-sonnet-5", "R1_OPUS": "claude-opus-5",
              "R4_OPEN": "Qwen/Qwen3-1.7B", "R5_SLM": "tiny-decoder-1.7M", "R5_PII": "distilbert-pii"}


def estimate_tokens(text: str) -> int:
    """Cheap length proxy: ~3.5 chars/token for English, ~1.6 for CJK-heavy text."""
    cjk = sum(1 for ch in text if "぀" <= ch <= "鿿")
    other = len(text) - cjk
    return int(other / 3.5 + cjk / 1.6) + 1


def plan(intent: str, intent_conf: float, *, n_tokens: int = 0, force_tier: str | None = None) -> list[str]:
    """Ordered list of tiers to try (first = primary, rest = escalation path)."""
    if force_tier:
        if force_tier not in TIERS:
            raise ValueError(f"unknown tier {force_tier}")
        return [force_tier]
    if intent not in CHAINS or intent_conf < INTENT_MIN:
        chain = list(UNCERTAIN_CHAIN)
    else:
        chain = list(CHAINS[intent])
    if n_tokens > LONG_INPUT_TOKENS:
        chain = [t for t in chain if t not in ("R4_OPEN", "R5_SLM")] or ["R2_HAIKU", "R1_SONNET"]
    return chain[:MAX_HOPS]


def should_escalate(tier: str, *, ok: bool, confidence: str | float | None) -> bool:
    if not ok:
        return True
    if tier == "R5_SLM":
        return confidence is None or float(confidence) < SLM_MIN
    if tier == "R5_PII":
        return False
    return confidence == "low"
