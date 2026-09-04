from spectrum.data.fixtures import make_txn_fixture
from spectrum.data.schema import label_names
from spectrum.prompts import MIN_CACHE_CHARS, classification_system_prompt, classification_user_prompt


def test_system_prompt_is_frozen_and_uses_train_only():
    rows = make_txn_fixture(200)
    labels = label_names(rows)
    a = classification_system_prompt("txn", labels, rows)
    b = classification_system_prompt("txn", labels, rows)
    assert a == b  # byte-identical => cacheable
    assert len(a) >= MIN_CACHE_CHARS
    test_texts = {r.text for r in rows if r.split != "train"}
    train_texts = {r.text for r in rows if r.split == "train"}
    leaked = [t for t in test_texts if t not in train_texts and f"text: {t}\n" in a]
    assert not leaked, leaked[:3]
    for l in labels:
        assert f"- {l}" in a


def test_user_prompt_shape():
    assert classification_user_prompt("STARBUCKS #1") == "text: STARBUCKS #1"
