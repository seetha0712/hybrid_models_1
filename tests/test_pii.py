import json
from pathlib import Path

from spectrum.pii import regex_baseline
from spectrum.pii.labels import BIO, collapse
from spectrum.pii.redact import Redactor, apply, deredact, merge
from spectrum.pii.train_pii import entity_f1, spans_to_bio

FIX = Path(__file__).resolve().parents[1] / "data" / "fixtures" / "pii_fixture.jsonl"


def test_collapse_map():
    assert collapse("FIRSTNAME") == "PER" and collapse("creditcardnumber") == "CARD" and collapse("ACCOUNTNUMBER") == "ACCT"
    assert collapse("SSN") == "OTHER"
    assert len(BIO) == 17


def test_regex_finds_numeric_pii_not_names():
    t = "Ana Ruiz, card 4111 1111 1111 1111, call +1 415 555 0134, mail ana@example.com, born 1985-03-15"
    labs = {e["label"] for e in regex_baseline.find(t)}
    assert {"CARD", "PHONE", "EMAIL", "DOB"} <= labs
    assert "PER" not in labs


def test_redact_and_deredact_roundtrip():
    t = "Contact ana@example.com or 4111 1111 1111 1111"
    r = Redactor(None).redact(t)
    assert "[EMAIL_1]" in r["redacted"] and "[CARD_1]" in r["redacted"]
    assert "example.com" not in r["redacted"]
    assert deredact("Send to [EMAIL_1] and charge [CARD_1].", r["surrogate_map"]) == "Send to ana@example.com and charge 4111 1111 1111 1111."


def test_merge_prefers_non_overlapping_earliest_longest():
    a = [{"start": 0, "end": 5, "label": "PER"}]
    b = [{"start": 3, "end": 8, "label": "ACCT"}, {"start": 10, "end": 12, "label": "DOB"}]
    m = merge(a, b)
    assert [(x["start"], x["end"]) for x in m] == [(0, 5), (10, 12)]


def test_spans_to_bio_alignment():
    text = "Hi Ana Ruiz here"
    spans = [{"start": 3, "end": 11, "label": "PER"}]
    offsets = [(0, 0), (0, 2), (3, 6), (7, 11), (12, 16), (0, 0)]
    tags = spans_to_bio(text, spans, offsets)
    assert tags[0] == -100 and tags[-1] == -100
    assert [BIO[t] for t in tags[1:5]] == ["O", "B-PER", "I-PER", "O"]


def test_entity_f1_on_fixture_regex_baseline():
    rows = [json.loads(l) for l in FIX.read_text().splitlines() if l.strip()]
    res = entity_f1(rows, regex_baseline.find)
    assert res["per_label"]["EMAIL"]["f1"] > 0.9
    assert res["per_label"]["PER"]["f1"] == 0.0  # regex cannot find names: the argument for the model
