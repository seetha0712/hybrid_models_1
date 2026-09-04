"""Swap-in contract for a firm CSV (see data/README.md).

Required column: `narration` (or `text`). Optional: `category` (or `label`), `amount`,
`currency`, `date`. An optional label_map.json {raw_label: canonical_label} renames labels.
Rows with unknown labels are reported and dropped, never silently kept.
"""
from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

from spectrum.data.schema import Row, merchant_key

TEXT_COLS = ("narration", "text", "description")
LABEL_COLS = ("category", "label")


class CSVContractError(ValueError):
    pass


def load_csv(path: str | Path, *, label_map: str | Path | None = None, allowed_labels: set[str] | None = None) -> tuple[list[Row], dict]:
    path = Path(path)
    lmap = json.loads(Path(label_map).read_text()) if label_map else {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        cols = [c.strip() for c in (reader.fieldnames or [])]
        text_col = next((c for c in TEXT_COLS if c in cols), None)
        if text_col is None:
            raise CSVContractError(f"CSV needs one of {TEXT_COLS} columns; found {cols}")
        label_col = next((c for c in LABEL_COLS if c in cols), None)
        rows, unknown, empty = [], {}, 0
        for i, rec in enumerate(reader):
            text = (rec.get(text_col) or "").strip()
            if not text:
                empty += 1
                continue
            raw = (rec.get(label_col) or "").strip() if label_col else ""
            label = lmap.get(raw, raw).lower().replace(" ", "_")
            if allowed_labels is not None and label not in allowed_labels:
                unknown[raw] = unknown.get(raw, 0) + 1
                continue
            rid = hashlib.sha1(f"csv:{i}:{text}".encode()).hexdigest()[:12]
            meta = {k: rec[k] for k in ("amount", "currency", "date") if k in rec and rec[k]}
            rows.append(Row(id=rid, text=text, label=label or "unlabelled", split="train", group=merchant_key(text), meta=meta))
    report = {"rows": len(rows), "dropped_empty": empty, "dropped_unknown_labels": unknown, "text_column": text_col, "label_column": label_col}
    return rows, report
