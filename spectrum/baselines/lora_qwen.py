"""LoRA (PEFT) supervised fine-tune of Qwen3-0.6B on the classification task, then eval.

    modal run spectrum/baselines/lora_qwen.py --dataset txn --n-train 20000

Technique: parameter-efficient fine-tuning. The 0.6B base is frozen; rank-16 adapters on
q/k/v/o (~2M trainable params) learn prompt -> label. Runs on a T4 in ~10-15 min (fp16).
Writes adapters to <VOL_LORA>/<dataset> and <VOL_RESULTS>/lora_<dataset>.json.
"""
from __future__ import annotations

import json
import random
import statistics
import time

from spectrum import common
from spectrum.data.schema import Row, label_names, load_rows
from spectrum.pricing import modal_cpu_cost, modal_gpu_cost

app = common.app
BASE = "Qwen/Qwen3-0.6B"


def _prompt(text: str) -> str:
    return f"Categorise the bank transaction.\ntext: {text}\ncategory:"


def train_core(rows: list[Row], out_dir: str, *, n_train: int, epochs: int, seed: int = 42) -> dict:
    import torch
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer

    rng = random.Random(seed)
    train = [r for r in rows if r.split == "train"]
    rng.shuffle(train)
    train = train[:n_train]
    tok = AutoTokenizer.from_pretrained(BASE)
    tok.pad_token = tok.pad_token or tok.eos_token
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    model = AutoModelForCausalLM.from_pretrained(BASE, dtype=dtype)
    model = get_peft_model(model, LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, target_modules=["q_proj", "k_proj", "v_proj", "o_proj"], task_type="CAUSAL_LM"))
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)

    def encode(r: Row):
        p = tok(_prompt(r.text), add_special_tokens=False)["input_ids"]
        a = tok(" " + r.label + tok.eos_token, add_special_tokens=False)["input_ids"]
        ids = (p + a)[:96]
        labels = ([-100] * len(p) + a)[:96]
        return ids, labels

    data = [encode(r) for r in train]
    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=2e-4, weight_decay=0.0)
    scaler = torch.amp.GradScaler("cuda") if device == "cuda" else None
    bs, t0, step = 32, time.time(), 0
    model.train()
    for ep in range(epochs):
        rng.shuffle(data)
        for i in range(0, len(data), bs):
            chunk = data[i:i + bs]
            L = max(len(x) for x, _ in chunk)
            ids = torch.tensor([x + [tok.pad_token_id] * (L - len(x)) for x, _ in chunk], device=device)
            lab = torch.tensor([y + [-100] * (L - len(y)) for _, y in chunk], device=device)
            att = (ids != tok.pad_token_id).long()
            with torch.autocast(device_type=device, dtype=torch.float16, enabled=device == "cuda"):
                loss = model(input_ids=ids, attention_mask=att, labels=lab).loss
            opt.zero_grad(set_to_none=True)
            if scaler:
                scaler.scale(loss).backward(); scaler.step(opt); scaler.update()
            else:
                loss.backward(); opt.step()
            step += 1
            if step % 50 == 0:
                print(json.dumps({"step": step, "loss": round(loss.item(), 4), "elapsed_s": round(time.time() - t0, 1)}))
    model.save_pretrained(out_dir)
    tok.save_pretrained(out_dir)
    return {"base": BASE, "trainable_params": trainable, "n_train": len(train), "epochs": epochs, "train_seconds": round(time.time() - t0, 1), "device": device}


def evaluate_core(rows: list[Row], adapter_dir: str, *, n_eval: int = 5000, device: str | None = None, threads: int = 4) -> dict:
    import torch
    from peft import PeftModel
    from sklearn.metrics import accuracy_score, f1_score
    from transformers import AutoModelForCausalLM, AutoTokenizer

    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    torch.set_num_threads(threads)
    tok = AutoTokenizer.from_pretrained(adapter_dir)
    tok.padding_side = "left"
    base = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float16 if device == "cuda" else torch.float32)
    model = PeftModel.from_pretrained(base, adapter_dir).to(device).eval()
    labels = label_names(rows)
    test = [r for r in rows if r.split in ("test", "test_unseen")][:n_eval]

    def norm(s: str) -> str:
        s = s.strip().lower().replace(" ", "_").split("\n")[0]
        return s if s in labels else next((l for l in labels if l in s), "__unparseable__")

    preds, lat = [], []
    with torch.inference_mode():
        for i in range(0, len(test), 64):
            chunk = test[i:i + 64]
            enc = tok([_prompt(r.text) for r in chunk], return_tensors="pt", padding=True).to(device)
            t0 = time.perf_counter()
            out = model.generate(**enc, max_new_tokens=8, do_sample=False, pad_token_id=tok.pad_token_id)
            lat.append((time.perf_counter() - t0) * 1000 / len(chunk))
            for row_ids in out[:, enc["input_ids"].shape[1]:]:
                preds.append(norm(tok.decode(row_ids, skip_special_tokens=True)))
    res = {"model": f"{BASE}+LoRA", "technique": "PEFT/LoRA supervised fine-tuning of a pretrained 0.6B base", "n_eval": len(test)}
    for split, key in (("test", ""), ("test_unseen", "_unseen")):
        idx = [i for i, r in enumerate(test) if r.split == split]
        if idx:
            g = [test[i].label for i in idx]; p = [preds[i] for i in idx]
            res[f"accuracy{key}"] = round(accuracy_score(g, p), 4)
            res[f"macro_f1{key}"] = round(f1_score(g, p, average="macro", labels=labels, zero_division=0), 4)
            res[f"n{key}"] = len(idx)
    per = f1_score([r.label for r in test], preds, average=None, labels=labels, zero_division=0)
    res["per_class"] = [{"c": l, "f1": round(float(v), 4)} for l, v in zip(labels, per)]
    res["unparseable"] = sum(p == "__unparseable__" for p in preds)
    per_item_ms = statistics.median(lat)
    res["latency_ms"] = {"p50_batched64_per_item": round(per_item_ms, 2), "device": device}
    if device == "cuda":
        res["cost_per_1m_usd"] = {"marginal_T4_batched": round(modal_gpu_cost(gpu="T4", seconds=per_item_ms / 1000) * 1e6, 2)}
    else:
        res["cost_per_1m_usd"] = {"marginal_cpu4_batched": round(modal_cpu_cost(cores=4, gib=8, seconds=per_item_ms / 1000) * 1e6, 2)}
    return res


@app.function(image=common.gpu_image, gpu="T4", volumes=common.VOLUMES, secrets=common._optional_hf_secret(), timeout=3 * 3600)
def train_and_eval_remote(dataset: str, n_train: int, epochs: int, n_eval: int) -> dict:
    common.ensure_dirs()
    rows = load_rows(f"{common.VOL_DATA}/{dataset}.jsonl")
    out = f"{common.VOL_LORA}/{dataset}"
    tr = train_core(rows, out, n_train=n_train, epochs=epochs)
    ev = evaluate_core(rows, out, n_eval=n_eval)
    res = {**tr, **ev, "dataset": dataset}
    with open(f"{common.VOL_RESULTS}/lora_{dataset}.json", "w") as f:
        json.dump(res, f, indent=1)
    common.commit()
    print(json.dumps({k: v for k, v in res.items() if k != "per_class"}, indent=2))
    return res


@app.function(image=common.cpu_image, volumes=common.VOLUMES, timeout=3600, cpu=4, memory=8192)
def cpu_latency_remote(dataset: str, n_eval: int = 256) -> dict:
    """Serving-tier numbers for the LoRA model on CPU (4 cores), for the $/1M comparison."""
    rows = load_rows(f"{common.VOL_DATA}/{dataset}.jsonl")
    res = evaluate_core(rows, f"{common.VOL_LORA}/{dataset}", n_eval=n_eval, device="cpu")
    path = f"{common.VOL_RESULTS}/lora_{dataset}.json"
    with open(path) as f:
        prev = json.load(f)
    prev["cpu"] = {k: res[k] for k in ("latency_ms", "cost_per_1m_usd")}
    with open(path, "w") as f:
        json.dump(prev, f, indent=1)
    common.commit()
    return prev["cpu"]


@app.local_entrypoint()
def lora_main(dataset: str = "txn", n_train: int = 20000, epochs: int = 1, n_eval: int = 5000, cpu_latency: bool = True):
    train_and_eval_remote.remote(dataset, n_train, epochs, n_eval)
    if cpu_latency:
        print(json.dumps(cpu_latency_remote.remote(dataset), indent=2))
