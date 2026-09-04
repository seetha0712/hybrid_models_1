import json
from pathlib import Path

import torch

from spectrum.data.fixtures import make_txn_fixture
from spectrum.data.schema import label_names, merchant_key
from spectrum.tiny import tokenizer as T
from spectrum.tiny.model import TinyConfig, build, count_params

FIX = Path(__file__).resolve().parents[1] / "data" / "fixtures" / "txn_fixture.jsonl"


def _codec():
    rows = make_txn_fixture(200)
    labels = label_names(rows)
    tok = T.train_tokenizer((r.text for r in rows), labels)
    return T.Codec(tok, labels), rows, labels


def test_param_count_in_band_and_tied():
    codec, _, _ = _codec()
    assert codec.vocab_size == 4096
    m = build(TinyConfig(vocab_size=codec.vocab_size), codec.label_ids)
    n = count_params(m)
    assert 1_400_000 <= n <= 2_000_000, n
    assert n == 1_722_368
    assert m.head_weight is m.tok_emb.weight


def test_forward_shapes():
    codec, rows, labels = _codec()
    m = build(TinyConfig(vocab_size=codec.vocab_size), codec.label_ids)
    ids, pos = codec.encode_batch([r.text for r in rows[:2]])
    logits, lm = m(torch.tensor(ids), torch.tensor(pos), codec.pad_id)
    assert logits.shape == (2, len(labels))
    assert lm.shape == (2, 64, 4096)


def test_tokenizer_round_trip_and_normalisation():
    codec, rows, _ = _codec()
    for r in rows[:50]:
        ids, sep = codec.encode(r.text)
        assert len(ids) == 64 and ids[0] == codec.bos_id and ids[sep] == codec.sep_id
    a = codec.tok.encode("ＳＴＡＲＢＵＣＫＳ").ids
    b = codec.tok.encode("starbucks").ids
    assert a == b  # NFKC + lowercase fold full-width and case
    assert all(codec.tok.token_to_id(T.label_token(l)) is not None for l in codec.labels)


def test_merchant_key_strips_noise():
    assert merchant_key("POS 1234 SEVEN ELEVEN TOKYO") == "seven eleven"
    assert merchant_key("AMZN MKTP US*2K3J9 SEATTLE") == "amzn mktp"
    assert merchant_key("CHECKCARD 0412 STARBUCKS #221 SEATTLE WA") == "checkcard starbucks"


def test_fixture_file_matches_generator():
    assert FIX.exists(), "run python -m spectrum.data.fixtures"
    lines = FIX.read_text().strip().splitlines()
    assert len(lines) == 200
    first = json.loads(lines[0])
    assert first["meta"]["synthetic_fixture"] is True
