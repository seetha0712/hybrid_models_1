"""Full fine-tune of distilbert-base-multilingual-cased for PII token classification.

    modal run spectrum/pii/train_pii.py --epochs 3 --max-rows 20000     # T4, ~10 min

Technique: supervised transfer learning; every weight of the pretrained encoder is updated.
Char spans -> BIO tags via the fast tokenizer's offset_mapping. Metrics: entity-level F1
(seqeval) for the model, the regex baseline, and the union. Writes <VOL_PII>/ and
<VOL_RESULTS>/phase3_pii_eval.json.
"""
from __future__ import annotations

import json
import time

from spectrum import common
from spectrum.pii.labels import BIO, BIO2ID

app = common.app
BASE = "distilbert-base-multilingual-cased"
MAX_LEN = 128


def spans_to_bio(text: str, spans: list[dict], offsets: list[tuple[int, int]]) -> list[int]:
    tags = []
    for (s, e) in offsets:
        if s == e:  # special tokens
            tags.append(-100); continue
        lab = "O"
        for sp in spans:
            if s < sp["end"] and e > sp["start"]:
                lab = ("B-" if s <= sp["start"] else "I-") + sp["label"]
                break
        tags.append(BIO2ID[lab])
    return tags


def load_pii_rows(path: str) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def entity_f1(rows: list[dict], predict_fn) -> dict:
    """Entity-level exact-match precision/recall/F1 over (start,end,label) triples."""
    tp = fp = fn = 0
    by_lab: dict[str, list[int]] = {}
    for r in rows:
        gold = {(s["start"], s["end"], s["label"]) for s in r["spans"]}
        pred = {(e["start"], e["end"], e["label"]) for e in predict_fn(r["text"])}
        for lab in {g[2] for g in gold} | {p[2] for p in pred}:
            g = {x for x in gold if x[2] == lab}; p = {x for x in pred if x[2] == lab}
            c = by_lab.setdefault(lab, [0, 0, 0])
            c[0] += len(g & p); c[1] += len(p - g); c[2] += len(g - p)
        tp += len(gold & pred); fp += len(pred - gold); fn += len(gold - pred)
    P = tp / max(tp + fp, 1); R = tp / max(tp + fn, 1)
    out = {"precision": round(P, 4), "recall": round(R, 4), "f1": round(2 * P * R / max(P + R, 1e-9), 4), "n": len(rows)}
    out["per_label"] = {lab: {"f1": round(2 * c[0] / max(2 * c[0] + c[1] + c[2], 1), 4), "support": c[0] + c[2]} for lab, c in sorted(by_lab.items())}
    return out


def train_core(rows: list[dict], out_dir: str, *, epochs: int = 3, lr: float = 5e-5, batch: int = 32) -> dict:
    import numpy as np
    import torch
    from datasets import Dataset
    from transformers import AutoModelForTokenClassification, AutoTokenizer, DataCollatorForTokenClassification, Trainer, TrainingArguments

    tok = AutoTokenizer.from_pretrained(BASE)
    tr = [r for r in rows if r["split"] == "train"]
    te = [r for r in rows if r["split"] == "test"]

    def enc(batch_rows):
        e = tok([r["text"] for r in batch_rows], truncation=True, max_length=MAX_LEN, return_offsets_mapping=True)
        e["labels"] = [spans_to_bio(r["text"], r["spans"], offs) for r, offs in zip(batch_rows, e["offset_mapping"])]
        e.pop("offset_mapping")
        return e

    def to_ds(rs):
        d = enc(rs)
        return Dataset.from_dict({k: d[k] for k in ("input_ids", "attention_mask", "labels")})

    dtr, dte = to_ds(tr), to_ds(te)
    model = AutoModelForTokenClassification.from_pretrained(BASE, num_labels=len(BIO), id2label=dict(enumerate(BIO)), label2id=BIO2ID)
    args = TrainingArguments(output_dir=f"{out_dir}/_trainer", per_device_train_batch_size=batch, per_device_eval_batch_size=64, num_train_epochs=epochs,
                             learning_rate=lr, weight_decay=0.01, warmup_ratio=0.06, logging_steps=50, save_strategy="no", report_to=[],
                             fp16=torch.cuda.is_available(), dataloader_num_workers=2)
    trainer = Trainer(model=model, args=args, train_dataset=dtr, data_collator=DataCollatorForTokenClassification(tok))
    t0 = time.time()
    trainer.train()
    train_s = time.time() - t0
    model.save_pretrained(out_dir); tok.save_pretrained(out_dir)
    n_params = sum(p.numel() for p in model.parameters())
    # token-level seqeval on the test set
    from seqeval.metrics import classification_report, f1_score

    preds = trainer.predict(dte)
    P = np.argmax(preds.predictions, -1)
    y_true, y_pred = [], []
    for pr, lab in zip(P, dte["labels"]):
        y_true.append([BIO[l] for l in lab if l != -100]); y_pred.append([BIO[p] for p, l in zip(pr, lab) if l != -100])
    return {"base": BASE, "technique": "full supervised fine-tuning (token classification)", "n_params": n_params, "n_train": len(tr), "n_test": len(te),
            "epochs": epochs, "train_seconds": round(train_s, 1), "token_level_seqeval_f1": round(float(f1_score(y_true, y_pred)), 4),
            "seqeval_report": classification_report(y_true, y_pred, output_dict=True, zero_division=0)}


@app.function(image=common.gpu_image, gpu="T4", volumes=common.VOLUMES, timeout=3 * 3600)
def train_remote(epochs: int, max_rows: int) -> dict:
    common.ensure_dirs()
    rows = load_pii_rows(f"{common.VOL_DATA}/pii.jsonl")[:max_rows]
    res = train_core(rows, common.VOL_PII, epochs=epochs)
    common.commit()
    return res


@app.function(image=common.cpu_image, volumes=common.VOLUMES, timeout=3600, cpu=2, memory=4096)
def eval_remote(max_rows: int) -> dict:
    """Entity-level comparison on CPU: model vs regex vs union, plus serving latency."""
    from spectrum.pii import regex_baseline
    from spectrum.pii.redact import Redactor

    rows = [r for r in load_pii_rows(f"{common.VOL_DATA}/pii.jsonl")[:max_rows] if r["split"] == "test"][:2000]
    red = Redactor(common.VOL_PII)
    model_only = Redactor(None)  # placeholder for signature symmetry
    res = {"model_union_regex": entity_f1(rows, red.entities), "regex_only": entity_f1(rows, regex_baseline.find)}
    lat = []
    for r in rows[:100]:
        t0 = time.perf_counter(); red.entities(r["text"]); lat.append((time.perf_counter() - t0) * 1000)
    lat.sort()
    res["latency_ms"] = {"p50": round(lat[len(lat) // 2], 1), "p95": round(lat[int(len(lat) * 0.95) - 1], 1)}
    return res


@app.local_entrypoint()
def pii_train_main(epochs: int = 3, max_rows: int = 20000):
    tr = train_remote.remote(epochs, max_rows)
    ev = eval_remote.remote(max_rows)
    out = {**{k: v for k, v in tr.items() if k != "seqeval_report"}, **ev, "seqeval_report": tr.get("seqeval_report")}
    print(json.dumps({k: v for k, v in out.items() if k != "seqeval_report"}, indent=2))
    # persisted by eval.py --phase 3 (reads both); keep a copy here too
    import modal  # noqa

    with open("results/phase3_pii_eval.json", "w") as f:
        json.dump(out, f, indent=1)
    print("wrote results/phase3_pii_eval.json")
