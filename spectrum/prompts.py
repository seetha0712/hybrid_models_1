"""Frozen prompt builders. Whatever these return must be byte-identical across calls for the
prompt cache to work, so: no timestamps, sorted labels, deterministic example sampling.

The classification system prompt is padded with worked examples until it clears the
Haiku 4.5 cache minimum (4096 tokens); `MIN_CACHE_CHARS` is a conservative char proxy
(~3.3 chars/token for this kind of text); the batch eval verifies with count_tokens.
"""
from __future__ import annotations

import random

from spectrum.data.schema import Row

MIN_CACHE_CHARS = 4300 * 3.3

CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {"category": {"type": "string"}, "confidence": {"type": "string", "enum": ["high", "medium", "low"]}},
    "required": ["category", "confidence"],
    "additionalProperties": False,
}


def classification_system_prompt(task_name: str, labels: list[str], train_rows: list[Row], *, n_examples: int = 60,
                                 seed: int = 42, task_description: str | None = None) -> str:
    """Zero-shot instructions + few-shot examples (in-context learning). Examples are sampled
    from TRAIN rows only, stratified by label, and the sample is deterministic."""
    rng = random.Random(seed)
    by_label: dict[str, list[Row]] = {}
    for r in train_rows:
        if r.split == "train":
            by_label.setdefault(r.label, []).append(r)
    examples: list[Row] = []
    labs = sorted(by_label)
    per = max(1, n_examples // max(len(labs), 1))
    for lab in labs:
        rs = by_label[lab][:]
        rng.shuffle(rs)
        examples.extend(rs[:per])
    rng.shuffle(examples)
    desc = task_description or f"You classify short {task_name} texts into exactly one category."
    lines = [
        desc,
        "Answer with JSON: {\"category\": <one of the categories below, verbatim>, \"confidence\": \"high\"|\"medium\"|\"low\"}.",
        "Use \"low\" confidence when the text is ambiguous or the merchant/intent is unfamiliar.",
        "",
        "Categories:",
        *[f"- {l}" for l in sorted(labels)],
        "",
        "Worked examples:",
    ]
    for r in examples:
        lines.append(f"text: {r.text}\ncategory: {r.label}")
    text = "\n".join(lines)
    # Pad with additional examples (cycling) until we clear the cache minimum; still all train rows.
    pool = [r for rs in by_label.values() for r in rs]
    rng.shuffle(pool)
    i = 0
    while len(text) < MIN_CACHE_CHARS and pool:
        r = pool[i % len(pool)]
        text += f"\ntext: {r.text}\ncategory: {r.label}"
        i += 1
    return text


def classification_user_prompt(text: str) -> str:
    return f"text: {text}"


ROUTER_ANSWER_SCHEMA = {
    "type": "object",
    "properties": {"answer": {"type": "string"}, "confidence": {"type": "string", "enum": ["high", "medium", "low"]}},
    "required": ["answer", "confidence"],
    "additionalProperties": False,
}

INTENT_SYSTEM_PROMPTS: dict[str, str] = {
    "summarise": "You are a concise financial summariser for a bank's staff. Summarise the user's text in at most 3 sentences, preserving numbers. Reply as JSON {answer, confidence}; confidence is your own certainty that the summary is faithful.",
    "draft": "You draft short, polite, professional messages for bank staff. Reply as JSON {answer, confidence}.",
    "complex_analysis": "You are a senior analyst. Reason step by step about the request, then give a clear recommendation with the key risks. Reply as JSON {answer, confidence}.",
    "code": "You are a careful software engineer. Return working code with a one-line explanation. Reply as JSON {answer, confidence}.",
    "chat": "You are a helpful retail-banking assistant. Answer briefly and accurately; if the answer depends on account-specific data you cannot see, say what the customer should do. Reply as JSON {answer, confidence}.",
    "doc_classify": "You classify financial documents by type (e.g. ISDA master agreement, CSA, term sheet, KYC form, research note, invoice, other). Reply as JSON {answer, confidence} where answer is the document type.",
}
