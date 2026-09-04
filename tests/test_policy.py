import pytest

from spectrum.router.policy import CHAINS, INTENT_MIN, MAX_HOPS, SLM_MIN, estimate_tokens, plan, should_escalate

CASES = [
    ("txn_categorise", 0.95, 0, None, ["R5_SLM", "R2_HAIKU"]),
    ("complex_analysis", 0.9, 0, None, ["R1_OPUS"]),
    ("summarise", 0.9, 0, None, ["R4_OPEN", "R2_HAIKU"]),          # capped at MAX_HOPS
    ("summarise", 0.9, 9000, None, ["R2_HAIKU", "R1_SONNET"]),     # long input skips R4
    ("chat", 0.4, 0, None, ["R2_HAIKU", "R1_SONNET"]),             # below INTENT_MIN
    ("nonsense", 0.99, 0, None, ["R2_HAIKU", "R1_SONNET"]),
    ("txn_categorise", 0.99, 0, "R1_OPUS", ["R1_OPUS"]),           # forced
    ("pii_redact", 0.99, 0, None, ["R5_PII"]),
]


@pytest.mark.parametrize("intent,conf,ntok,force,expected", CASES)
def test_plan(intent, conf, ntok, force, expected):
    assert plan(intent, conf, n_tokens=ntok, force_tier=force) == expected


def test_every_chain_is_within_hop_limit_and_known():
    for chain in CHAINS.values():
        assert 1 <= len(chain)
        assert len(plan("x", 1.0)) <= MAX_HOPS


def test_escalation_rules():
    assert should_escalate("R5_SLM", ok=True, confidence=SLM_MIN - 0.01)
    assert not should_escalate("R5_SLM", ok=True, confidence=0.95)
    assert should_escalate("R2_HAIKU", ok=True, confidence="low")
    assert not should_escalate("R2_HAIKU", ok=True, confidence="medium")
    assert should_escalate("R1_SONNET", ok=False, confidence="high")
    assert not should_escalate("R5_PII", ok=True, confidence=None)


def test_force_unknown_tier_rejected():
    with pytest.raises(ValueError):
        plan("chat", 0.9, force_tier="R9")


def test_estimate_tokens_handles_cjk():
    assert estimate_tokens("hello world") < estimate_tokens("こんにちは世界、本日の取引について")
    assert INTENT_MIN < 1.0
