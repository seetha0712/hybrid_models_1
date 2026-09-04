"""Canonical row schema shared by every loader, trainer and evaluator."""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Iterator

SPLITS = ("train", "test", "test_unseen")


@dataclass
class Row:
    id: str
    text: str
    label: str
    split: str = "train"
    group: str | None = None  # e.g. merchant key; used for the unseen-merchant split
    meta: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)


def write_jsonl(rows: Iterable[Row], path: str | Path) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(r.to_json() + "\n")
            n += 1
    return n


def read_jsonl(path: str | Path) -> Iterator[Row]:
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            yield Row(**{k: d.get(k) for k in ("id", "text", "label", "split", "group", "meta")})


def load_rows(path: str | Path) -> list[Row]:
    return list(read_jsonl(path))


_NON_ALPHA = re.compile(r"[^A-Za-z぀-ヿ一-鿿]+")


def merchant_key(text: str) -> str:
    """Coarse merchant identity used for the held-out-merchant split: the first two
    alphabetic tokens after stripping card-network prefixes, digits and punctuation.
    'AMZN MKTP US*2K3J9 SEATTLE' -> 'amzn mktp'; 'POS 1234 SEVEN ELEVEN TOKYO' -> 'seven eleven'."""
    stop = {"pos", "visa", "debit", "credit", "card", "purchase", "payment", "chk", "ach", "tst", "sq", "dd", "ppd", "web", "recurring"}
    toks = [t.lower() for t in _NON_ALPHA.sub(" ", text).split() if len(t) > 1]
    toks = [t for t in toks if t not in stop]
    return " ".join(toks[:2]) if toks else "unknown"


def label_names(rows: Iterable[Row]) -> list[str]:
    return sorted({r.label for r in rows})
