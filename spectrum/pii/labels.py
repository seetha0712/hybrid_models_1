"""Label taxonomy for the guardrail and the collapse map from ai4privacy's fine-grained
labels. Unknown fine labels fall into OTHER (still redacted)."""
from __future__ import annotations

ENTITY_TYPES = ["PER", "ACCT", "CARD", "PHONE", "EMAIL", "ADDR", "DOB", "OTHER"]
BIO = ["O"] + [f"{p}-{t}" for t in ENTITY_TYPES for p in ("B", "I")]
BIO2ID = {l: i for i, l in enumerate(BIO)}

_COLLAPSE = {
    "PER": ["FIRSTNAME", "LASTNAME", "MIDDLENAME", "NAME", "GIVENNAME", "SURNAME", "FULLNAME", "USERNAME", "PREFIX", "TITLE"],
    "ACCT": ["ACCOUNTNUMBER", "ACCOUNTNAME", "IBAN", "BIC", "SWIFT", "ROUTINGNUMBER", "SORTCODE", "BANKACCOUNT"],
    "CARD": ["CREDITCARDNUMBER", "CREDITCARDCVV", "CREDITCARDISSUER", "CARDNUMBER", "MASKEDNUMBER"],
    "PHONE": ["PHONENUMBER", "PHONE", "PHONEIMEI", "MOBILE", "TELEPHONENUMBER"],
    "EMAIL": ["EMAIL", "EMAILADDRESS"],
    "ADDR": ["STREET", "STREETADDRESS", "CITY", "STATE", "COUNTY", "ZIPCODE", "POSTCODE", "BUILDINGNUMBER", "SECONDARYADDRESS", "ADDRESS", "GPSCOORDINATES", "NEARBYGPSCOORDINATE"],
    "DOB": ["DOB", "DATEOFBIRTH", "BIRTHDATE"],
}
FINE2COARSE = {fine: coarse for coarse, fines in _COLLAPSE.items() for fine in fines}


def collapse(fine_label: str) -> str:
    key = "".join(ch for ch in str(fine_label).upper() if ch.isalnum())
    for k in (key, key.rstrip("0123456789")):
        if k in FINE2COARSE:
            return FINE2COARSE[k]
    return "OTHER"
