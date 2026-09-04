"""Redaction: entities -> placeholders + surrogate map; de-redaction restores the originals in
the tier's answer. The model path uses the fine-tuned token classifier; regex is unioned for
the numeric patterns (cards, IBANs) where it is near-perfect."""
from __future__ import annotations

import re
import time
from pathlib import Path

from spectrum.pii import regex_baseline


def merge(a: list[dict], b: list[dict]) -> list[dict]:
    # On overlap prefer a specific label over the catch-all OTHER, then the longer span. This lets the
    # near-perfect numeric regex (CARD/ACCT/…) win over a model span that only reached OTHER on the
    # same digits, so cards redact as [CARD_n] rather than [OTHER_n].
    allspans = sorted(a + b, key=lambda d: (d["start"], d["label"] == "OTHER", -(d["end"] - d["start"])))
    out, last = [], -1
    for s in allspans:
        if s["start"] >= last:
            out.append(s); last = s["end"]
    return out


def apply(text: str, entities: list[dict]) -> tuple[str, dict[str, str]]:
    counters: dict[str, int] = {}
    surrogate: dict[str, str] = {}
    pieces, pos = [], 0
    for e in sorted(entities, key=lambda d: d["start"]):
        counters[e["label"]] = counters.get(e["label"], 0) + 1
        ph = f"[{e['label']}_{counters[e['label']]}]"
        surrogate[ph] = text[e["start"]:e["end"]]
        pieces.append(text[pos:e["start"]]); pieces.append(ph)
        pos = e["end"]
    pieces.append(text[pos:])
    return "".join(pieces), surrogate


def deredact(answer: str, surrogate: dict[str, str]) -> str:
    if not surrogate:
        return answer
    pat = re.compile("|".join(re.escape(k) for k in sorted(surrogate, key=len, reverse=True)))
    return pat.sub(lambda m: surrogate[m.group()], answer)


class Redactor:
    """`model_dir=None` -> regex only (used in tests and before Phase 3 artefacts exist)."""

    def __init__(self, model_dir: str | Path | None = None, threads: int = 2):
        self.pipe = None
        self.model_name = "regex"
        if model_dir and Path(model_dir, "config.json").exists():
            import torch
            from transformers import pipeline

            torch.set_num_threads(threads)
            self.pipe = pipeline("token-classification", model=str(model_dir), aggregation_strategy="simple", device=-1)
            self.model_name = "distilbert-pii+regex"

    def entities(self, text: str) -> list[dict]:
        rx = regex_baseline.find(text)
        if self.pipe is None:
            return rx
        ml = []
        for e in self.pipe(text):
            lab = e["entity_group"]
            if lab == "O":
                continue
            ml.append({"start": int(e["start"]), "end": int(e["end"]), "label": lab, "text": text[int(e["start"]):int(e["end"])], "score": round(float(e["score"]), 3)})
        return merge(ml, rx)

    def redact(self, text: str) -> dict:
        t0 = time.perf_counter()
        ents = self.entities(text)
        red, sur = apply(text, ents)
        return {"entities": ents, "redacted": red, "surrogate_map": sur, "latency_ms": round((time.perf_counter() - t0) * 1000, 1), "model": self.model_name}
