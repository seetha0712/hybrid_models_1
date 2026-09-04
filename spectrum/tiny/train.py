"""Train the tiny model from scratch.

    modal run spectrum/tiny/train.py --dataset txn --epochs 6            # T4, ~8 min
    modal run spectrum/tiny/train.py --dataset banking77 --epochs 12
    python -m spectrum.tiny.train --local data/fixtures/txn_fixture.jsonl --epochs 3 --out .artifacts/tiny_fixture   # CPU, seconds

Writes to <out>/: tokenizer.json, labels.json, config.json, model.pt, train_log.json, metrics.json
(metrics.json comes from spectrum.tiny.infer.evaluate, run right after training).
"""
from __future__ import annotations

import argparse
import json
import math
import random
import time
from pathlib import Path

from spectrum.data.schema import Row, label_names, load_rows


def train_core(rows: list[Row], out_dir: str | Path, *, epochs: int = 6, batch_size: int = 256, lr: float = 3e-3,
               seed: int = 42, device: str | None = None, cfg_overrides: dict | None = None, log_every: int = 50) -> dict:
    import numpy as np
    import torch

    from spectrum.tiny import tokenizer as T
    from spectrum.tiny.model import TinyConfig, build, count_params

    torch.manual_seed(seed)
    random.seed(seed)
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    train_rows = [r for r in rows if r.split == "train"]
    labels = label_names(rows)
    tok = T.train_tokenizer((r.text for r in train_rows), labels)
    T.save(tok, labels, out_dir)
    codec = T.Codec(tok, labels)

    cfg = TinyConfig(vocab_size=codec.vocab_size, **(cfg_overrides or {}))
    model = build(cfg, codec.label_ids).to(device)
    n_params = count_params(model)
    (out_dir / "config.json").write_text(json.dumps({**cfg.to_dict(), "n_params": n_params, "labels": labels}, indent=2))

    ids, pos = codec.encode_batch([r.text for r in train_rows])
    X = torch.tensor(ids, dtype=torch.long)
    P = torch.tensor(pos, dtype=torch.long)
    Y = torch.tensor([codec.label_to_idx[r.label] for r in train_rows], dtype=torch.long)
    n = len(train_rows)
    steps_per_epoch = max(1, math.ceil(n / batch_size))
    total_steps = steps_per_epoch * epochs
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.1, betas=(0.9, 0.95))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=total_steps, pct_start=min(0.3, 300 / max(total_steps, 1)))

    log = []
    t0 = time.time()
    step = 0
    model.train()
    for ep in range(epochs):
        perm = torch.randperm(n)
        for b in range(steps_per_epoch):
            idx = perm[b * batch_size:(b + 1) * batch_size]
            xb, pb, yb = X[idx].to(device), P[idx].to(device), Y[idx].to(device)
            loss, parts = model.loss(xb, pb, yb, codec.pad_id)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            step += 1
            if step % log_every == 0 or step == total_steps:
                rec = {"step": step, "epoch": ep, "loss": round(loss.item(), 4), **{k: round(v, 4) for k, v in parts.items()}, "lr": sched.get_last_lr()[0], "elapsed_s": round(time.time() - t0, 1)}
                log.append(rec)
                print(json.dumps(rec))
    torch.save(model.state_dict(), out_dir / "model.pt")
    summary = {"n_train": n, "n_params": n_params, "epochs": epochs, "batch_size": batch_size, "lr": lr, "device": device,
               "train_seconds": round(time.time() - t0, 1), "final_loss": log[-1]["loss"] if log else None, "log": log}
    (out_dir / "train_log.json").write_text(json.dumps(summary, indent=2))
    return summary


def _cli() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", required=True, help="path to canonical JSONL")
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--batch-size", type=int, default=256)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--layers", type=int, default=None)
    ap.add_argument("--d-model", type=int, default=None)
    a = ap.parse_args()
    ov = {k: v for k, v in (("n_layers", a.layers), ("d_model", a.d_model)) if v is not None}
    rows = load_rows(a.local)
    s = train_core(rows, a.out, epochs=a.epochs, batch_size=a.batch_size, lr=a.lr, cfg_overrides=ov, device="cpu", log_every=5)
    from spectrum.tiny.infer import evaluate

    m = evaluate(a.out, rows, latency=True)
    print(json.dumps({k: v for k, v in m.items() if k != "per_class"}, indent=2))
    print(f"params={s['n_params']:,} train_seconds={s['train_seconds']}")


# ---------------------------------------------------------------- Modal entrypoint
try:
    from spectrum import common

    app = common.app

    @app.function(image=common.gpu_image, gpu="T4", volumes=common.VOLUMES, timeout=3600)
    def train_remote(dataset: str, epochs: int, batch_size: int, lr: float, layers: int | None, d_model: int | None) -> dict:
        common.ensure_dirs()
        rows = load_rows(f"{common.VOL_DATA}/{dataset}.jsonl")
        out = f"{common.VOL_TINY}/{dataset}"
        ov = {k: v for k, v in (("n_layers", layers), ("d_model", d_model)) if v is not None}
        s = train_core(rows, out, epochs=epochs, batch_size=batch_size, lr=lr, cfg_overrides=ov)
        common.commit()
        return {k: v for k, v in s.items() if k != "log"}

    @app.function(image=common.cpu_image, volumes=common.VOLUMES, timeout=1800, cpu=2, memory=4096)
    def eval_remote(dataset: str) -> dict:
        """Evaluate on CPU (2 cores) so latency/throughput reflect the serving tier, not the T4."""
        from spectrum.tiny.infer import evaluate

        rows = load_rows(f"{common.VOL_DATA}/{dataset}.jsonl")
        m = evaluate(f"{common.VOL_TINY}/{dataset}", rows, latency=True, cores=2, gib=4)
        common.commit()
        return {k: v for k, v in m.items() if k != "per_class"}

    @app.local_entrypoint()
    def train_main(dataset: str = "txn", epochs: int = 6, batch_size: int = 256, lr: float = 3e-3, layers: int = None, d_model: int = None, skip_train: bool = False):
        if not skip_train:
            print(json.dumps(train_remote.remote(dataset, epochs, batch_size, lr, layers, d_model), indent=2))
        print(json.dumps(eval_remote.remote(dataset), indent=2))
except Exception:  # pragma: no cover - `modal` not importable in some minimal envs
    pass

if __name__ == "__main__":
    _cli()
