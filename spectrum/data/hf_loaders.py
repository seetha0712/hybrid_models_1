"""Hugging Face loaders -> canonical JSONL on the Modal Volume.

    modal run spectrum/data/hf_loaders.py --dataset txn
    modal run spectrum/data/hf_loaders.py --dataset banking77
    modal run spectrum/data/hf_loaders.py --inspect          # print schemas + 3 rows of each dataset

Splits: `train`, `test`, and (for txn) `test_unseen` = rows whose merchant key never
appears in train, so the benchmark can show how each rung copes with merchants it has
never seen. Few-shot examples for the Claude prompts are sampled from `train` only.
"""
from __future__ import annotations

import hashlib
import json
import random
from collections import Counter

from spectrum import common
from spectrum.data.registry import DATASETS, get
from spectrum.data.schema import Row, merchant_key, write_jsonl

app = common.app


def _pick(columns: list[str], candidates: list[str]) -> str:
    for c in candidates:
        if c in columns:
            return c
    lowered = {c.lower(): c for c in columns}
    for c in candidates:
        if c.lower() in lowered:
            return lowered[c.lower()]
    raise KeyError(f"none of {candidates} in columns {columns}")


def _rows_from_hf(name: str) -> tuple[list[Row], dict]:
    from datasets import ClassLabel, load_dataset

    cfg = get(name)
    ds = load_dataset(cfg["hf_id"])
    info = {"hf_id": cfg["hf_id"], "splits": {k: len(v) for k, v in ds.items()}}
    first = next(iter(ds.values()))
    text_col = _pick(first.column_names, cfg["text_columns"])
    label_col = _pick(first.column_names, cfg["label_columns"])
    info.update({"text_column": text_col, "label_column": label_col, "columns": first.column_names})
    feat = first.features[label_col]
    names = feat.names if isinstance(feat, ClassLabel) else None

    rows: list[Row] = []
    for split_name, part in ds.items():
        for i, ex in enumerate(part):
            text = str(ex[text_col]).strip()
            lab = ex[label_col]
            label = names[int(lab)] if names is not None else str(lab).strip()
            rid = hashlib.sha1(f"{name}:{split_name}:{i}:{text}".encode()).hexdigest()[:12]
            rows.append(Row(id=rid, text=text, label=label.lower().replace(" ", "_"),
                            split="test" if split_name.startswith("test") else "train",
                            group=merchant_key(text), meta={"hf_split": split_name}))
    return rows, info


def assign_splits(rows: list[Row], *, test_fraction: float, unseen_group_fraction: float, seed: int = 42) -> list[Row]:
    """Deterministic split. If the dataset has no official test split, carve `test_fraction`
    stratified by label. Then move `unseen_group_fraction` of merchant groups entirely into
    `test_unseen` (removed from train)."""
    rng = random.Random(seed)
    has_official_test = any(r.split == "test" for r in rows)
    if not has_official_test and test_fraction > 0:
        by_label: dict[str, list[Row]] = {}
        for r in rows:
            by_label.setdefault(r.label, []).append(r)
        for lab, rs in by_label.items():
            rng.shuffle(rs)
            k = max(1, int(len(rs) * test_fraction))
            for r in rs[:k]:
                r.split = "test"
    if unseen_group_fraction > 0:
        groups = sorted({r.group for r in rows if r.group})
        rng.shuffle(groups)
        k = int(len(groups) * unseen_group_fraction)
        unseen = set(groups[:k])
        for r in rows:
            if r.group in unseen:
                r.split = "test_unseen"
    return rows


def summarize(rows: list[Row]) -> dict:
    c = Counter(r.split for r in rows)
    labels = Counter(r.label for r in rows)
    return {"n": len(rows), "splits": dict(c), "n_labels": len(labels), "labels": dict(labels.most_common())}


@app.function(image=common.cpu_image, volumes=common.VOLUMES, secrets=common._optional_hf_secret(), timeout=1800, cpu=2, memory=4096)
def load_to_volume(dataset: str) -> dict:
    common.ensure_dirs()
    cfg = get(dataset)
    rows, info = _rows_from_hf(dataset)
    rows = assign_splits(rows, test_fraction=cfg["test_fraction"], unseen_group_fraction=cfg["unseen_group_fraction"])
    out = f"{common.VOL_DATA}/{dataset}.jsonl"
    n = write_jsonl(rows, out)
    summary = {"dataset": dataset, "path": out, "written": n, **info, **summarize(rows)}
    with open(f"{common.VOL_DATA}/{dataset}.meta.json", "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    common.commit()
    return summary


@app.function(image=common.cpu_image, volumes=common.VOLUMES, secrets=common._optional_hf_secret(), timeout=1800, cpu=2, memory=4096)
def inspect_datasets() -> dict:
    """Print column names and three example rows of every registered dataset (and the PII set)."""
    from datasets import load_dataset

    out = {}
    ids = [c["hf_id"] for c in DATASETS.values()] + ["ai4privacy/pii-masking-300k"]
    for hf_id in ids:
        try:
            ds = load_dataset(hf_id)
            part = next(iter(ds.values()))
            out[hf_id] = {"splits": {k: len(v) for k, v in ds.items()}, "columns": part.column_names,
                          "examples": [part[i] for i in range(min(3, len(part)))]}
        except Exception as e:  # keep going so one bad id does not hide the others
            out[hf_id] = {"error": repr(e)}
    print(json.dumps(out, indent=2, ensure_ascii=False, default=str)[:20000])
    return out


@app.local_entrypoint()
def data_main(dataset: str = "txn", inspect: bool = False):
    if inspect:
        inspect_datasets.remote()
        return
    print(json.dumps(load_to_volume.remote(dataset), indent=2, ensure_ascii=False)[:4000])
