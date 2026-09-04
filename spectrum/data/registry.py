"""Dataset configs. Each config names a Hugging Face dataset and the candidate column
names for text and label (loaders auto-detect, then print what they picked)."""
from __future__ import annotations

DATASETS: dict[str, dict] = {
    "txn": {
        "hf_id": "DoDataThings/us-bank-transaction-categories-v2",
        "description": "68k US-bank-statement-format transaction descriptions, 17 categories, 500+ real merchant names (generated to match real statement formats; not customer data).",
        "text_columns": ["description", "transaction_description", "Description", "text", "narration"],
        "label_columns": ["category", "Category", "label", "label_text", "category_name"],
        "unseen_group_fraction": 0.15,
        "test_fraction": 0.12,
        "license_note": "Check the dataset card licence before external use.",
    },
    "banking77": {
        "hf_id": "PolyAI/banking77",
        "description": "13,083 genuine online-banking customer queries, 77 intents (Casanueva et al. 2020). CC-BY-4.0.",
        "text_columns": ["text"],
        "label_columns": ["label"],
        "unseen_group_fraction": 0.0,  # no merchant notion; official train/test split is kept
        "test_fraction": 0.0,
        "license_note": "CC-BY-4.0",
    },
}


def get(name: str) -> dict:
    if name not in DATASETS:
        raise KeyError(f"unknown dataset {name!r}; known: {sorted(DATASETS)}")
    return DATASETS[name]
