"""Modal app, images, volume, secrets and shared paths.

Every Modal entrypoint imports `app` from here so `modal deploy spectrum/api.py` and
`modal run spectrum/tiny/train.py` all attach to the same app and Volume.

Secrets (create once in the Modal dashboard or CLI):
  modal secret create anthropic ANTHROPIC_API_KEY=sk-ant-...
  modal secret create demo-key DEMO_KEY=<random string>      # shared header for the public endpoints
Optional:
  modal secret create huggingface HF_TOKEN=hf_...            # only needed for gated datasets/models
"""
from __future__ import annotations

import os
from pathlib import Path

import modal

APP_NAME = "model-spectrum"
app = modal.App(APP_NAME)

VOL_NAME = "spectrum-artifacts"
volume = modal.Volume.from_name(VOL_NAME, create_if_missing=True)
VOL = "/vol"  # mount point inside containers

# Layout on the Volume
VOL_DATA = f"{VOL}/data"          # canonical JSONL per dataset config
VOL_TINY = f"{VOL}/tiny"          # tiny-model checkpoints per dataset config
VOL_LORA = f"{VOL}/lora"          # LoRA adapters
VOL_ROUTER = f"{VOL}/router"      # intent classifier
VOL_PII = f"{VOL}/pii"            # PII token classifier
VOL_HF = f"{VOL}/hf"              # HF_HOME cache (datasets + open-weights)
VOL_LOGS = f"{VOL}/logs"          # request log JSONL
VOL_RESULTS = f"{VOL}/results"    # regenerated results/*.json

REPO_ROOT = Path(__file__).resolve().parent.parent

anthropic_secret = modal.Secret.from_name("anthropic")
demo_secret = modal.Secret.from_name("demo-key")


def _optional_hf_secret() -> list[modal.Secret]:
    """The HF token is optional; every dataset used here is public."""
    try:
        return [modal.Secret.from_name("huggingface")]
    except Exception:  # pragma: no cover - only hit when the secret does not exist
        return []


COMMON_PIP = [
    "numpy>=1.26",
    "pyyaml>=6",
    "pydantic>=2.7",
    "anthropic>=1.0",
    "fastapi[standard]>=0.115",
    "httpx>=0.27",
    "pandas>=2.2",
    "scikit-learn>=1.6",
    "joblib>=1.4",
]

TRAIN_PIP = [
    "tokenizers>=0.21",
    "transformers>=4.51,<6",
    "datasets>=3.0",
    "sentence-transformers>=3.3",
    "seqeval>=1.2",
    "accelerate>=1.0",
    "peft>=0.15",
    "hf_transfer>=0.1.8",
]

_ENV = {"HF_HOME": VOL_HF, "HF_HUB_ENABLE_HF_TRANSFER": "1", "TOKENIZERS_PARALLELISM": "false"}


def _with_source(img: modal.Image) -> modal.Image:
    return (
        img.add_local_file(REPO_ROOT / "results" / "pricing.json", "/root/results/pricing.json")
        .add_local_dir(REPO_ROOT / "data", "/root/data")
        .add_local_python_source("spectrum")
    )


# CPU image: torch CPU wheel keeps the image small and cold starts short.
cpu_image = _with_source(
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch>=2.5", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install(*COMMON_PIP, *TRAIN_PIP)
    .env(_ENV)
)

# GPU image: CUDA torch for the T4 jobs (tiny-model training, LoRA, PII fine-tune, Qwen3-1.7B serving).
gpu_image = _with_source(
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch>=2.5")
    .pip_install(*COMMON_PIP, *TRAIN_PIP)
    .env(_ENV)
)

VOLUMES = {VOL: volume}


def ensure_dirs() -> None:
    for d in (VOL_DATA, VOL_TINY, VOL_LORA, VOL_ROUTER, VOL_PII, VOL_HF, VOL_LOGS, VOL_RESULTS):
        os.makedirs(d, exist_ok=True)


def commit() -> None:
    """Persist Volume writes so other containers (and `modal volume get`) can see them."""
    volume.commit()
