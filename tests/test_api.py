"""Gateway behaviour with fake tiers (no network, no Modal)."""
from fastapi.testclient import TestClient

from spectrum.api import build_app
from spectrum.pii.redact import Redactor
from spectrum.router.logstore import LogStore


class FakeTiny:
    n_params = 1_722_368

    def predict(self, texts, batch_size=256):
        return [{"label": "groceries", "confidence": 0.97 if "WHOLE" in t else 0.42, "top3": [["groceries", 0.97], ["restaurants", 0.02], ["coffee", 0.01]]} for t in texts]


class FakeIntent:
    def predict(self, texts):
        t = texts[0].lower()
        if "categor" in t or "whole foods" in t:
            return [{"intent": "txn_categorise", "confidence": 0.93, "top3": []}]
        if "analy" in t:
            return [{"intent": "complex_analysis", "confidence": 0.9, "top3": []}]
        return [{"intent": "chat", "confidence": 0.3, "top3": []}]


class FakeTiers:
    def __init__(self):
        self.tiny = FakeTiny(); self.redactor = Redactor(None); self.claude = object(); self.ow = None; self.txn_system = None
        self.calls = []

    def status(self):
        return {"slm": "warm", "pii": "regex", "openweights": "down", "claude": "configured"}

    def call(self, tier, *, text, intent):
        self.calls.append(tier)
        if tier == "R5_SLM":
            p = self.tiny.predict([text])[0]
            return p["label"], p["confidence"], {"tier": tier, "model": "tiny", "ok": True, "tokens": {}, "latency_ms": 3.0, "cost_usd": 1e-7, "confidence": p["confidence"]}
        if tier == "R1_OPUS":
            return "Recommend strategy B. [EMAIL_1] will be notified.", "high", {"tier": tier, "model": "claude-opus-5", "ok": True, "tokens": {"in": 300, "cache_write": 0, "cache_read": 0, "out": 80}, "latency_ms": 2500.0, "cost_usd": 0.0035, "confidence": "high"}
        return f"answer from {tier}", "high", {"tier": tier, "model": "m", "ok": True, "tokens": {"in": 100, "cache_write": 0, "cache_read": 4200, "out": 20}, "latency_ms": 900.0, "cost_usd": 0.0006, "confidence": "high"}


def _client(tmp_path, key="k"):
    tiers = FakeTiers()
    api = build_app(tiers=tiers, intent_clf=FakeIntent(), store=LogStore(tmp_path / "log.jsonl"), demo_key=key, version="test")
    return TestClient(api), tiers


def test_auth_required(tmp_path):
    c, _ = _client(tmp_path)
    assert c.get("/health").status_code == 200
    assert c.post("/classify_txn", json={"narrations": ["x"]}).status_code == 401
    assert c.post("/classify_txn", json={"narrations": ["x"]}, headers={"X-Demo-Key": "k"}).status_code == 200


def test_route_stays_on_slm_when_confident(tmp_path):
    c, tiers = _client(tmp_path)
    r = c.post("/route", json={"text": "Categorise: WHOLE FOODS MKT #10 SEATTLE"}, headers={"X-Demo-Key": "k"}).json()
    assert r["final_tier"] == "R5_SLM" and not r["escalated"] and r["answer"] == "groceries"
    assert tiers.calls == ["R5_SLM"]


def test_route_escalates_on_low_slm_confidence(tmp_path):
    c, tiers = _client(tmp_path)
    r = c.post("/route", json={"text": "Categorise: SQ *UNKNOWN VENDOR 8821"}, headers={"X-Demo-Key": "k"}).json()
    assert [h["tier"] for h in r["hops"]] == ["R5_SLM", "R2_HAIKU"]
    assert r["escalated"] and r["final_tier"] == "R2_HAIKU"


def test_route_redacts_before_frontier_and_deredacts_answer(tmp_path):
    c, tiers = _client(tmp_path)
    r = c.post("/route", json={"text": "Analyse this for ana@example.com and card 4111 1111 1111 1111"}, headers={"X-Demo-Key": "k"}).json()
    assert r["final_tier"] == "R1_OPUS"
    assert "example.com" not in r["redacted_input"] and "[EMAIL_1]" in r["redacted_input"]
    assert r["pii"]["redacted_count"] == 2 and r["pii"]["sent_to_frontier"] == 0
    assert "ana@example.com" in r["answer"]  # de-redacted for the user
    m = c.get("/metrics", headers={"X-Demo-Key": "k"}).json()
    assert m["n"] == 1 and m["pii_blocked_total"] == 2 and m["totals"]["all_flagship_usd"] > 0


def test_force_tier_and_replay(tmp_path):
    c, _ = _client(tmp_path)
    r = c.post("/route", json={"text": "hello", "force_tier": "R1_SONNET"}, headers={"X-Demo-Key": "k"}).json()
    assert r["plan"] == ["R1_SONNET"]
    assert len(c.get("/replay?n=10", headers={"X-Demo-Key": "k"}).json()["rows"]) == 1
