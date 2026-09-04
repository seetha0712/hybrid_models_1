from spectrum.router.logstore import LogStore, metrics, what_if_costs


def _row(tier, cost, hops):
    return {"request_id": "r", "final_tier": tier, "total_cost_usd": cost, "total_latency_ms": 100.0, "hops": hops, "pii": {"redacted_count": 2, "sent_to_frontier": 0}}


def test_logstore_roundtrip_and_metrics(tmp_path):
    calls = []
    s = LogStore(tmp_path / "log.jsonl", commit_fn=lambda: calls.append(1), commit_every=2)
    s.append(_row("R5_SLM", 0.0000001, [{"tier": "R5_SLM", "tokens": {"in": 0, "cache_write": 0, "cache_read": 0, "out": 0}}]))
    s.append(_row("R2_HAIKU", 0.0006, [{"tier": "R5_SLM", "tokens": {}}, {"tier": "R2_HAIKU", "tokens": {"in": 100, "cache_write": 0, "cache_read": 4200, "out": 20}}]))
    assert calls == [1]
    s2 = LogStore(tmp_path / "log.jsonl")
    assert len(s2.rows()) == 2
    m = metrics(s2.rows())
    assert m["n"] == 2 and m["pii_blocked_total"] == 4
    tiers = {b["tier"]: b for b in m["by_tier"]}
    assert tiers["R2_HAIKU"]["escalations"] == 1
    assert m["totals"]["all_flagship_usd"] > m["totals"]["policy_usd"]
    w = what_if_costs(s2.rows()[1])
    assert w["all_flagship"] > w["policy"]
