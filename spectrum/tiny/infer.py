"""CPU inference + evaluation for the tiny model."""
from __future__ import annotations

import json
import statistics
import time
from pathlib import Path

from spectrum.data.schema import Row
from spectrum.pricing import modal_cpu_cost, per_million


class TinyClassifier:
    def __init__(self, model_dir: str | Path, threads: int = 2):
        import torch

        from spectrum.tiny import tokenizer as T
        from spectrum.tiny.model import TinyConfig, build

        torch.set_num_threads(threads)
        d = Path(model_dir)
        tok, labels = T.load(d)
        self.codec = T.Codec(tok, labels)
        cfg = json.loads((d / "config.json").read_text())
        c = TinyConfig(**{k: cfg[k] for k in TinyConfig.__dataclass_fields__ if k in cfg})
        self.model = build(c, self.codec.label_ids)
        self.model.load_state_dict(torch.load(d / "model.pt", map_location="cpu"))
        self.model.eval()
        self.labels = labels
        self.n_params = cfg.get("n_params")
        self._torch = torch

    def predict(self, texts: list[str], batch_size: int = 256) -> list[dict]:
        torch = self._torch
        out = []
        with torch.inference_mode():
            for i in range(0, len(texts), batch_size):
                chunk = texts[i:i + batch_size]
                ids, pos = self.codec.encode_batch(chunk)
                logits, _ = self.model(torch.tensor(ids), torch.tensor(pos), self.codec.pad_id)
                probs = torch.softmax(logits, dim=-1)
                top = torch.topk(probs, k=min(3, probs.size(-1)), dim=-1)
                for p, ix in zip(top.values.tolist(), top.indices.tolist()):
                    out.append({"label": self.labels[ix[0]], "confidence": round(p[0], 4),
                                "top3": [[self.labels[j], round(q, 4)] for q, j in zip(p, ix)]})
        return out


def evaluate(model_dir: str | Path, rows: list[Row], *, latency: bool = False, cores: int = 2, gib: int = 4, threads: int = 2) -> dict:
    from sklearn.metrics import accuracy_score, f1_score

    clf = TinyClassifier(model_dir, threads=threads)
    out: dict = {"model": "tiny-decoder", "n_params": clf.n_params, "labels": clf.labels}
    for split in ("test", "test_unseen"):
        rs = [r for r in rows if r.split == split]
        if not rs:
            continue
        preds = [p["label"] for p in clf.predict([r.text for r in rs])]
        gold = [r.label for r in rs]
        key = "" if split == "test" else "_unseen"
        out[f"accuracy{key}"] = round(accuracy_score(gold, preds), 4)
        out[f"macro_f1{key}"] = round(f1_score(gold, preds, average="macro", zero_division=0), 4)
        out[f"n{key}"] = len(rs)
        if split == "test":
            per = f1_score(gold, preds, average=None, labels=clf.labels, zero_division=0)
            out["per_class"] = [{"c": l, "f1": round(float(v), 4)} for l, v in zip(clf.labels, per)]
    if latency:
        sample = [r.text for r in rows if r.split != "train"][:200] or [r.text for r in rows][:200]
        clf.predict(sample[:8])  # warm-up
        lat = []
        for t in sample[:100]:
            t0 = time.perf_counter()
            clf.predict([t])
            lat.append((time.perf_counter() - t0) * 1000)
        lat.sort()
        big = (sample * 20)[:2048]
        t0 = time.perf_counter()
        clf.predict(big, batch_size=256)
        secs = time.perf_counter() - t0
        thr = len(big) / secs
        cost_item = modal_cpu_cost(cores=cores, gib=gib, seconds=1.0) / thr
        out["latency_ms"] = {"p50": round(statistics.median(lat), 2), "p95": round(lat[int(len(lat) * 0.95) - 1], 2)}
        out["throughput_per_s_batch256"] = round(thr, 1)
        out["cost_per_1m_usd"] = {"marginal": round(per_million(cost_item), 4), "cores": cores, "gib": gib}
    Path(model_dir, "metrics.json").write_text(json.dumps(out, indent=2))
    return out
