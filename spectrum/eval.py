"""Assemble the committed results/*.json from artefacts on the Volume.

    modal run spectrum/eval.py --phase 1          # results/phase1_benchmark.json
    modal run spectrum/eval.py --phase 2          # router eval + replay sample + batch view (if present)
    modal run spectrum/eval.py --phase 3          # pii eval
    modal run spectrum/eval.py --phase all
Then: scripts/sync_results.sh (copies results/ into apps/web/src/data) and commit.
"""
from __future__ import annotations

import json
import os
import time

from spectrum import common
from spectrum.pricing import load_pricing

app = common.app


def _load(path: str) -> dict | None:
    return json.load(open(path)) if os.path.exists(path) else None


def assemble_phase1(dataset: str = "txn") -> dict:
    p = load_pricing()
    out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "status": "measured", "dataset": _load(f"{common.VOL_DATA}/{dataset}.meta.json") or {"dataset": dataset}, "models": []}
    if "labels" in out["dataset"]:
        out["dataset"]["labels"] = list(out["dataset"]["labels"])[:100]
    tiny = _load(f"{common.VOL_TINY}/{dataset}/metrics.json")
    tlog = _load(f"{common.VOL_TINY}/{dataset}/train_log.json")
    if tiny:
        out["models"].append({"id": "tiny", "label": "Owned tiny model (from scratch)", "tier": "R5", "technique": "training from scratch (random init), supervised + aux LM loss",
                              "params": tiny.get("n_params"), "accuracy": tiny.get("accuracy"), "macro_f1": tiny.get("macro_f1"), "accuracy_unseen": tiny.get("accuracy_unseen"),
                              "per_class": tiny.get("per_class"), "latency_ms": tiny.get("latency_ms"), "cost_per_1m_usd": tiny.get("cost_per_1m_usd", {}).get("marginal"),
                              "throughput_per_s": tiny.get("throughput_per_s_batch256"), "train_seconds": (tlog or {}).get("train_seconds"), "train_device": (tlog or {}).get("device")})
    lora = _load(f"{common.VOL_RESULTS}/lora_{dataset}.json")
    if lora:
        cpu = lora.get("cpu", {})
        out["models"].append({"id": "lora", "label": "Qwen3-0.6B + LoRA", "tier": "R5", "technique": lora.get("technique"), "params": 600_000_000, "trainable_params": lora.get("trainable_params"),
                              "accuracy": lora.get("accuracy"), "macro_f1": lora.get("macro_f1"), "accuracy_unseen": lora.get("accuracy_unseen"), "per_class": lora.get("per_class"),
                              "latency_ms": {"p50": (cpu.get("latency_ms") or lora.get("latency_ms", {})).get("p50_batched64_per_item")},
                              "cost_per_1m_usd": next(iter((cpu.get("cost_per_1m_usd") or lora.get("cost_per_1m_usd") or {}).values()), None),
                              "train_seconds": lora.get("train_seconds"), "train_device": lora.get("device"), "unparseable": lora.get("unparseable")})
    for key, label, tier in (("haiku", "Claude Haiku 4.5", "R2"), ("sonnet", "Claude Sonnet 5", "R1"), ("opus", "Claude Opus 5", "R1")):
        c = _load(f"{common.VOL_RESULTS}/claude_{dataset}_{key}.json")
        if c:
            out["models"].append({"id": key, "label": label, "tier": tier, "technique": c.get("technique"), "params": None, "accuracy": c.get("accuracy"), "macro_f1": c.get("macro_f1"),
                                  "accuracy_unseen": c.get("accuracy_unseen"), "per_class": c.get("per_class"), "latency_ms": c.get("latency_ms"),
                                  "cost_per_1m_usd": (c.get("cost_per_1m_usd") or {}).get("live_cached"), "cost_per_1m_batch_usd": (c.get("cost_per_1m_usd") or {}).get("batch"),
                                  "n_eval": c.get("n_eval"), "system_prompt_tokens": c.get("system_prompt_tokens"), "unparseable": c.get("unparseable"),
                                  "cache_read_tokens_after_first": (c.get("latency_sample") or {}).get("cache_read_tokens_after_first")})
    out["pricing_as_of"] = p.get("as_of")
    return out


@app.function(image=common.cpu_image, volumes=common.VOLUMES, timeout=1800, cpu=2, memory=4096)
def assemble_remote(phase: str, dataset: str) -> dict:
    common.ensure_dirs()
    outputs = {}
    if phase in ("1", "all"):
        outputs["phase1_benchmark.json"] = assemble_phase1(dataset)
        if dataset == "txn" and os.path.exists(f"{common.VOL_TINY}/banking77/metrics.json"):
            outputs["phase1_benchmark_banking77.json"] = assemble_phase1("banking77")
    if phase in ("2", "all"):
        r = _load(f"{common.VOL_RESULTS}/phase2_router_eval.json")
        if r:
            outputs["phase2_router_eval.json"] = r
        from spectrum.router.logstore import LogStore, metrics
        store = LogStore(f"{common.VOL_LOGS}/requests.jsonl")
        rows = store.rows(n=300)
        if rows:
            outputs["phase2_replay_sample.json"] = {"status": "measured", "rows": rows, "metrics": metrics(rows)}
        b = _load(f"{common.VOL_RESULTS}/phase2_batch_view.json")
        if b:
            outputs["phase2_batch_view.json"] = {"status": "measured", **b}
    if phase in ("3", "all"):
        pass  # written by spectrum/pii/train_pii.py's local entrypoint directly into results/
    for name, obj in outputs.items():
        with open(f"{common.VOL_RESULTS}/{name}", "w") as f:
            json.dump(obj, f, indent=1)
    common.commit()
    return outputs


@app.local_entrypoint()
def eval_main(phase: str = "all", dataset: str = "txn"):
    outs = assemble_remote.remote(phase, dataset)
    os.makedirs("results", exist_ok=True)
    for name, obj in outs.items():
        with open(f"results/{name}", "w") as f:
            json.dump(obj, f, indent=1)
        print("wrote results/" + name)
