"""Assemble the router training corpus from REAL public corpora (one request type each).

    modal run spectrum/router/corpus.py

Sources (all Hugging Face, loaded inside Modal):
  chat             PolyAI/banking77 queries (genuine customer questions)
  txn_categorise   the transaction dataset already on the Volume (bare narrations + instruction-wrapped)
  pii_redact       ai4privacy/pii-masking-300k source texts (English) wrapped as "redact"/"mask" requests
  complex_analysis TheFinAI/flare-finqa questions (numeric reasoning over filings)
  summarise        eloukas/edgar-corpus 10-K section excerpts wrapped as "summarise"
  doc_classify     eloukas/edgar-corpus excerpts of different sections wrapped as "what document is this"
  code             code_search_net (python) docstrings wrapped as "write a function that ..."
  draft            data/draft_templates.yaml — the ONLY templated intent (no public source exists); flagged in meta
Each source contributes up to N_PER rows; whatever fails to load is reported, not silently skipped.
"""
from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path

from spectrum import common
from spectrum.data.schema import Row, load_rows, write_jsonl

app = common.app
N_PER = 250
INTENTS = ["txn_categorise", "pii_redact", "doc_classify", "summarise", "draft", "complex_analysis", "code", "chat"]

_TXN_WRAP = ["Categorise this transaction: {t}", "What spending category is this? {t}", "{t}", "Tag the merchant category for: {t}", "{t}"]
_PII_WRAP = ["Redact any personal data before I send this on: {t}", "Mask PII in the following: {t}", "Remove names, account and card numbers: {t}"]
_SUM_WRAP = ["Summarise this in three lines: {t}", "Give me the key points of the following filing excerpt: {t}", "TL;DR: {t}"]
_DOC_WRAP = ["What type of document is this excerpt from? {t}", "Classify this document: {t}", "Is this a risk-factor section, MD&A, or something else? {t}"]
_CODE_WRAP = ["Write a Python function that {t}", "Implement: {t}", "I need code to {t}"]
_FINQA_WRAP = ["{t}", "Work through this and explain your reasoning: {t}", "{t} Show the calculation."]


def _rid(prefix: str, text: str) -> str:
    return prefix + hashlib.sha1(text.encode()).hexdigest()[:10]


def _first_str(ex: dict, candidates: list[str]) -> str | None:
    for c in candidates:
        v = ex.get(c)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _take(iterable, n: int, fn) -> list[str]:
    out = []
    for ex in iterable:
        s = fn(ex)
        if s:
            out.append(s)
        if len(out) >= n:
            break
    return out


def build(rng: random.Random, n_per: int = N_PER) -> tuple[list[Row], dict]:
    from datasets import load_dataset

    report: dict[str, str] = {}
    rows: list[Row] = []

    def add(intent: str, texts: list[str], source: str, templated: bool = False):
        for t in texts[:n_per]:
            rows.append(Row(id=_rid(intent[:3], t), text=t[:1200], label=intent, meta={"source": source, "templated": templated}))
        report[intent] = f"{min(len(texts), n_per)} rows from {source}"

    # chat <- banking77 (real). legacy-datasets mirror is parquet (PolyAI/banking77 ships a script,
    # which datasets>=4 refuses).
    try:
        ds = load_dataset("legacy-datasets/banking77", split="train")
        texts = [ex["text"] for ex in ds]
        rng.shuffle(texts)
        add("chat", texts, "legacy-datasets/banking77")
    except Exception as e:
        report["chat"] = f"FAILED {e!r}"

    # txn_categorise <- transaction dataset on the Volume
    try:
        tr = [r.text for r in load_rows(f"{common.VOL_DATA}/txn.jsonl") if r.split == "train"]
        rng.shuffle(tr)
        add("txn_categorise", [rng.choice(_TXN_WRAP).format(t=t) for t in tr[:n_per]], "DoDataThings/us-bank-transaction-categories-v2 (+instruction wrappers)")
    except Exception as e:
        report["txn_categorise"] = f"FAILED {e!r}"

    # pii_redact <- ai4privacy source texts
    try:
        ds = load_dataset("ai4privacy/pii-masking-300k", split="train", streaming=True)
        texts = _take(ds, n_per * 3, lambda ex: _first_str(ex, ["source_text", "text"]) if str(ex.get("language", ex.get("locale", "en"))).lower().startswith("en") else None)
        rng.shuffle(texts)
        add("pii_redact", [rng.choice(_PII_WRAP).format(t=t[:600]) for t in texts[:n_per]], "ai4privacy/pii-masking-300k (+instruction wrappers)")
    except Exception as e:
        report["pii_redact"] = f"FAILED {e!r}"

    # complex_analysis <- financial 10-K reasoning questions. virattt/financial-qa-10K is parquet and
    # ungated (TheFinAI/flare-finqa is gated; the original FinQA repos ship loader scripts).
    try:
        ds = load_dataset("virattt/financial-qa-10K", split="train")
        texts = _take(ds, n_per * 2, lambda ex: _first_str(ex, ["question", "query", "text"]))
        rng.shuffle(texts)
        add("complex_analysis", [rng.choice(_FINQA_WRAP).format(t=t[:900]) for t in texts[:n_per]], "virattt/financial-qa-10K")
    except Exception as e:
        report["complex_analysis"] = f"FAILED {e!r}"

    # summarise + doc_classify <- EDGAR 10-K excerpts (streamed). eloukas/edgar-corpus ships a loader
    # script (refused by datasets>=4); this mirror is parquet with the 10-K text under `input`.
    try:
        ds = load_dataset("kritsadaK/EDGAR-CORPUS-Financial-Summarization", split="train", streaming=True)
        excerpts = []
        for ex in ds:
            v = _first_str(ex, ["input", "text", "document"])
            if v and len(v) > 400:
                excerpts.append(v[:500])
            if len(excerpts) >= n_per * 3:
                break
        rng.shuffle(excerpts)
        add("summarise", [rng.choice(_SUM_WRAP).format(t=t) for t in excerpts[:n_per]], "kritsadaK/EDGAR-CORPUS-Financial-Summarization (+instruction wrappers)")
        add("doc_classify", [rng.choice(_DOC_WRAP).format(t=t) for t in excerpts[n_per:2 * n_per]], "kritsadaK/EDGAR-CORPUS-Financial-Summarization (+instruction wrappers)")
    except Exception as e:
        report["summarise"] = report["doc_classify"] = f"FAILED {e!r}"

    # code <- CodeSearchNet python docstrings. code-search-net/code_search_net is the parquet mirror
    # (the bare `code_search_net` id now resolves to an invalid loader-script URI under datasets>=4).
    try:
        ds = load_dataset("code-search-net/code_search_net", "python", split="train", streaming=True)
        texts = _take(ds, n_per * 2, lambda ex: (_first_str(ex, ["func_documentation_string"]) or "").split("\n")[0][:200] or None)
        texts = [t for t in texts if len(t) > 20]
        rng.shuffle(texts)
        add("code", [rng.choice(_CODE_WRAP).format(t=t[0].lower() + t[1:]) for t in texts[:n_per]], "code-search-net/code_search_net/python (+instruction wrappers)")
    except Exception as e:
        report["code"] = f"FAILED {e!r}"

    # draft <- templated (no public source)
    try:
        import yaml

        tpl = yaml.safe_load(Path("/root/data/draft_templates.yaml").read_text()) if Path("/root/data/draft_templates.yaml").exists() else yaml.safe_load((common.REPO_ROOT / "data" / "draft_templates.yaml").read_text())
        texts = []
        for _ in range(n_per):
            t = rng.choice(tpl["templates"])
            texts.append(t.format(**{k: rng.choice(v) for k, v in tpl["slots"].items()}))
        add("draft", texts, "data/draft_templates.yaml (templated)", templated=True)
    except Exception as e:
        report["draft"] = f"FAILED {e!r}"

    rng.shuffle(rows)
    for i, r in enumerate(rows):
        r.split = "test" if i % 5 == 0 else "train"
    return rows, report


@app.function(image=common.cpu_image, volumes=common.VOLUMES, secrets=common._optional_hf_secret(), timeout=3600, cpu=2, memory=8192)
def build_remote(seed: int = 42) -> dict:
    common.ensure_dirs()
    rows, report = build(random.Random(seed))
    n = write_jsonl(rows, f"{common.VOL_DATA}/router_corpus.jsonl")
    with open(f"{common.VOL_DATA}/router_corpus.meta.json", "w") as f:
        json.dump({"n": n, "report": report}, f, indent=2)
    common.commit()
    print(json.dumps({"n": n, "report": report}, indent=2))
    return {"n": n, "report": report}


@app.local_entrypoint()
def corpus_main():
    build_remote.remote()
