"""Regex baseline the fine-tuned model is compared against (and unioned with at serve time
for the high-precision numeric patterns). It cannot find names, which is the point."""
from __future__ import annotations

import re

_PATTERNS = {
    "EMAIL": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "CARD": re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)"),
    "PHONE": re.compile(r"(?<!\w)(?:\+?\d{1,3}[ -]?)?(?:\(?\d{2,4}\)?[ -]?)\d{3,4}[ -]?\d{3,4}(?!\w)"),
    "ACCT": re.compile(r"(?<!\d)(?:[A-Z]{2}\d{2}[A-Z0-9]{11,30}|\d{8,12})(?!\d)"),
    "DOB": re.compile(r"(?<!\d)(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})(?!\d)"),
}


def _luhn(s: str) -> bool:
    d = [int(c) for c in s if c.isdigit()]
    if len(d) < 13:
        return False
    total, alt = 0, False
    for x in reversed(d):
        if alt:
            x *= 2
            if x > 9:
                x -= 9
        total += x
        alt = not alt
    return total % 10 == 0


def find(text: str) -> list[dict]:
    found = []
    for lab, pat in _PATTERNS.items():
        for m in pat.finditer(text):
            if lab == "CARD" and not _luhn(m.group()):
                continue
            found.append({"start": m.start(), "end": m.end(), "label": lab, "text": m.group()})
    found.sort(key=lambda d: (d["start"], -(d["end"] - d["start"])))
    out, last = [], -1
    for f in found:
        if f["start"] >= last:
            out.append(f); last = f["end"]
    return out
