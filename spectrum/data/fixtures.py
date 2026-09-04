"""Deterministic 200-row fixtures for unit tests and the offline UI. TEST DATA ONLY —
the real datasets are loaded from Hugging Face by hf_loaders.py. Kept tiny and obviously
synthetic so nobody mistakes it for a benchmark.

    python -m spectrum.data.fixtures   # regenerates data/fixtures/*.jsonl
"""
from __future__ import annotations

import random
from pathlib import Path

from spectrum.data.schema import Row, merchant_key, write_jsonl

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "data" / "fixtures"

_MERCHANTS = {
    "groceries": ["WHOLE FOODS MKT", "TRADER JOES", "SAFEWAY", "KROGER", "ALDI"],
    "restaurants": ["CHIPOTLE", "OLIVE GARDEN", "PANERA BREAD", "SUSHI ZEN", "TST* THAI HOUSE"],
    "coffee": ["STARBUCKS", "BLUE BOTTLE", "PEETS COFFEE", "DUNKIN"],
    "shopping_online": ["AMZN MKTP US", "EBAY O*", "ETSY.COM", "WAYFAIR"],
    "fuel": ["SHELL OIL", "CHEVRON", "EXXONMOBIL", "BP#8821"],
    "transport": ["UBER TRIP", "LYFT RIDE", "MTA NYCT PAYGO", "BART CLIPPER"],
    "utilities": ["PG&E WEBPAY", "CON EDISON", "COMCAST CABLE", "VERIZON WRLS"],
    "subscriptions": ["NETFLIX.COM", "SPOTIFY USA", "APPLE.COM/BILL", "ADOBE INC"],
    "healthcare": ["CVS PHARMACY", "WALGREENS", "KAISER PERMANENTE", "ONE MEDICAL"],
    "income": ["PAYROLL ACME CORP", "DIRECT DEP NOMURA", "IRS TREAS 310 TAX REF"],
    "transfer": ["ZELLE TO", "VENMO PAYMENT", "ONLINE TRANSFER TO SAV"],
    "fees": ["MONTHLY SERVICE FEE", "ATM FEE", "OVERDRAFT FEE", "WIRE FEE"],
}
_CITIES = ["SEATTLE WA", "NEW YORK NY", "AUSTIN TX", "SAN JOSE CA", "CHICAGO IL", "TOKYO JP"]
_PREFIX = ["", "POS ", "DEBIT CARD PURCHASE ", "CHECKCARD 0412 ", "SQ *", "PAYPAL *"]


def make_txn_fixture(n: int = 200, seed: int = 7) -> list[Row]:
    rng = random.Random(seed)
    rows = []
    for i in range(n):
        cat = rng.choice(list(_MERCHANTS))
        m = rng.choice(_MERCHANTS[cat])
        store = f"#{rng.randint(100, 9999)}" if rng.random() < 0.5 else ""
        ref = f" *{rng.choice('ABCDEFGHJKLMNPQRSTUVWXYZ')}{rng.randint(10000, 99999)}" if rng.random() < 0.3 else ""
        amt = round(rng.lognormvariate(3.0, 1.0), 2)
        text = f"{rng.choice(_PREFIX)}{m}{store}{ref} {rng.choice(_CITIES)}".strip()
        text = text[:32] if rng.random() < 0.2 else text
        split = "train" if i < int(n * 0.8) else "test"
        rows.append(Row(id=f"fx{i:04d}", text=text, label=cat, split=split, group=merchant_key(text),
                        meta={"amount": amt, "currency": "USD", "synthetic_fixture": True}))
    return rows


def make_intent_fixture(n_per: int = 12, seed: int = 11) -> list[Row]:
    rng = random.Random(seed)
    seeds = {
        "txn_categorise": ["Categorise this transaction: {t}", "What category is '{t}'?", "Tag: {t}"],
        "pii_redact": ["Redact PII: My name is Ana Ruiz, card 4111 1111 1111 1111", "Mask personal data in: call me on +1 415 555 0134"],
        "doc_classify": ["Is this an ISDA, CSA or term sheet? 'This Master Agreement dated...'", "Classify document: 'Know Your Customer form for...'"],
        "summarise": ["Summarise this filing excerpt: {long}", "Give me a 3-line summary of: {long}"],
        "draft": ["Draft a polite email declining the meeting", "Write a short note to the client about the fee change"],
        "complex_analysis": ["Compare the two hedging strategies and recommend one with reasoning", "Analyse the credit memo and list the risks"],
        "code": ["Write a Python function to parse ISO dates", "Fix this SQL: select * form trades"],
        "chat": ["I am still waiting on my card?", "How do I change my PIN?", "Why was my transfer declined?"],
    }
    txns = [r.text for r in make_txn_fixture(40)]
    long = "The company reported revenue growth of 12% driven by services; operating margin compressed by 80bps due to input costs."
    rows = []
    i = 0
    for intent, temps in seeds.items():
        for _ in range(n_per):
            t = rng.choice(temps).format(t=rng.choice(txns), long=long)
            rows.append(Row(id=f"ix{i:04d}", text=t, label=intent, split="train" if rng.random() < 0.8 else "test",
                            meta={"synthetic_fixture": True}))
            i += 1
    return rows


def make_pii_fixture(n: int = 60, seed: int = 5) -> list[dict]:
    """Rows in the PII canonical format: text + character spans."""
    rng = random.Random(seed)
    names = ["Ana Ruiz", "John Carter", "Priya Nair", "Kenji Sato", "Maria Silva"]
    out = []
    for i in range(n):
        name = rng.choice(names)
        acct = f"{rng.randint(10000000, 99999999)}"
        phone = f"+1 {rng.randint(200, 999)} 555 {rng.randint(1000, 9999)}"
        email = f"{name.split()[0].lower()}.{name.split()[1].lower()}@example.com"
        t = f"Hello, this is {name}. My account {acct} was charged twice. Call {phone} or email {email}."
        spans = []
        for val, lab in ((name, "PER"), (acct, "ACCT"), (phone, "PHONE"), (email, "EMAIL")):
            s = t.index(val)
            spans.append({"start": s, "end": s + len(val), "label": lab})
        out.append({"id": f"px{i:04d}", "text": t, "spans": spans, "split": "train" if i < int(n * 0.8) else "test", "language": "en"})
    return out


def main() -> None:
    import json

    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    n1 = write_jsonl(make_txn_fixture(), FIXTURE_DIR / "txn_fixture.jsonl")
    n2 = write_jsonl(make_intent_fixture(), FIXTURE_DIR / "intent_fixture.jsonl")
    pii = make_pii_fixture()
    with open(FIXTURE_DIR / "pii_fixture.jsonl", "w", encoding="utf-8") as f:
        for r in pii:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"wrote {n1} txn, {n2} intent, {len(pii)} pii fixture rows to {FIXTURE_DIR}")


if __name__ == "__main__":
    main()
