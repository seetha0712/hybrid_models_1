"""Load ai4privacy/pii-masking-300k (FinPII subset where identifiable) -> canonical PII JSONL.

    modal run spectrum/pii/hf_pii.py --max-rows 20000

Canonical row: {id, text, spans:[{start,end,label}], split, language, source}
The dataset ships `privacy_mask` span annotations (label,start,end,value); fine labels are
collapsed to the guardrail taxonomy. Non-English rows are kept (the encoder is multilingual)
but the demo texts are English. No Japanese exists in this dataset; see data/README.md.
"""
from __future__ import annotations

import hashlib
import json

from spectrum import common
from spectrum.pii.labels import collapse

app = common.app
HF_ID = "ai4privacy/pii-masking-300k"


def _spans(ex: dict, text: str) -> list[dict]:
    pm = ex.get("privacy_mask")
    if isinstance(pm, str):
        try:
            pm = json.loads(pm)
        except json.JSONDecodeError:
            pm = []
    out = []
    for m in pm or []:
        if not isinstance(m, dict):
            continue
        s, e = m.get("start"), m.get("end")
        lab = m.get("label") or m.get("label_name") or ""
        if s is None or e is None:
            v = m.get("value")
            if v and v in text:
                s = text.index(v); e = s + len(v)
            else:
                continue
        if 0 <= int(s) < int(e) <= len(text):
            out.append({"start": int(s), "end": int(e), "label": collapse(lab), "fine": str(lab)})
    out.sort(key=lambda d: d["start"])
    # drop overlaps (keep the earlier, longer span)
    clean, last_end = [], -1
    for sp in out:
        if sp["start"] >= last_end:
            clean.append(sp); last_end = sp["end"]
    return clean


def convert(max_rows: int, prefer_fin: bool = True) -> tuple[list[dict], dict]:
    from datasets import load_dataset

    ds = load_dataset(HF_ID)
    rows, info = [], {"hf_id": HF_ID, "splits": {k: len(v) for k, v in ds.items()}}
    first = next(iter(ds.values()))
    info["columns"] = first.column_names
    text_col = next((c for c in ("source_text", "text", "unmasked_text") if c in first.column_names), None)
    if text_col is None:
        raise KeyError(f"no text column in {first.column_names}")
    subset_col = next((c for c in ("set", "subset", "source", "dataset") if c in first.column_names), None)
    for split_name, part in ds.items():
        for i, ex in enumerate(part):
            if len(rows) >= max_rows:
                break
            if prefer_fin and subset_col and "fin" not in str(ex.get(subset_col, "")).lower():
                continue
            text = str(ex[text_col])
            spans = _spans(ex, text)
            rid = hashlib.sha1(f"{HF_ID}:{split_name}:{i}".encode()).hexdigest()[:12]
            rows.append({"id": rid, "text": text, "spans": spans, "split": "test" if "valid" in split_name or "test" in split_name else "train",
                         "language": str(ex.get("language", ex.get("locale", "en"))), "source": str(ex.get(subset_col, "")) if subset_col else HF_ID})
    if not rows and prefer_fin:
        return convert(max_rows, prefer_fin=False)
    if not any(r["split"] == "test" for r in rows):
        for i, r in enumerate(rows):
            if i % 10 == 0:
                r["split"] = "test"
    info["n"] = len(rows)
    info["fine_labels_seen"] = sorted({sp["fine"] for r in rows for sp in r["spans"]})[:100]
    return rows, info


@app.function(image=common.cpu_image, volumes=common.VOLUMES, secrets=common._optional_hf_secret(), timeout=3600, cpu=2, memory=8192)
def load_remote(max_rows: int = 20000) -> dict:
    common.ensure_dirs()
    rows, info = convert(max_rows)
    with open(f"{common.VOL_DATA}/pii.jsonl", "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(f"{common.VOL_DATA}/pii.meta.json", "w") as f:
        json.dump(info, f, indent=2)
    common.commit()
    print(json.dumps(info, indent=2)[:3000])
    return info


@app.local_entrypoint()
def pii_data_main(max_rows: int = 20000):
    load_remote.remote(max_rows)
