"""Intent classifier: frozen sentence-embedding model + calibrated logistic regression.

    modal run spectrum/router/train_intent.py

Technique: a linear probe. No neural weights are updated; the multilingual MiniLM encoder is
used as a fixed feature extractor and only the logistic-regression head is fitted (seconds).
Writes <VOL_ROUTER>/{clf.joblib,labels.json} and <VOL_RESULTS>/phase2_router_eval.json.
"""
from __future__ import annotations

import json
import time

from spectrum import common
from spectrum.data.schema import Row, load_rows

app = common.app
ENCODER = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


class IntentClassifier:
    def __init__(self, model_dir: str):
        import joblib
        from sentence_transformers import SentenceTransformer

        self.enc = SentenceTransformer(ENCODER)
        self.clf = joblib.load(f"{model_dir}/clf.joblib")
        self.labels = json.loads(open(f"{model_dir}/labels.json").read())

    def predict(self, texts: list[str]) -> list[dict]:
        X = self.enc.encode(texts, normalize_embeddings=True, batch_size=64)
        P = self.clf.predict_proba(X)
        out = []
        for p in P:
            order = p.argsort()[::-1]
            out.append({"intent": self.labels[order[0]], "confidence": round(float(p[order[0]]), 4),
                        "top3": [[self.labels[i], round(float(p[i]), 4)] for i in order[:3]]})
        return out


def train_core(rows: list[Row], out_dir: str) -> dict:
    import joblib
    import numpy as np
    from sentence_transformers import SentenceTransformer
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

    import os
    os.makedirs(out_dir, exist_ok=True)
    enc = SentenceTransformer(ENCODER)
    labels = sorted({r.label for r in rows})
    idx = {l: i for i, l in enumerate(labels)}
    tr = [r for r in rows if r.split == "train"]
    te = [r for r in rows if r.split == "test"]
    t0 = time.time()
    Xtr = enc.encode([r.text for r in tr], normalize_embeddings=True, batch_size=64)
    Xte = enc.encode([r.text for r in te], normalize_embeddings=True, batch_size=64)
    ytr = np.array([idx[r.label] for r in tr]); yte = np.array([idx[r.label] for r in te])
    clf = CalibratedClassifierCV(LogisticRegression(C=2.0, max_iter=2000), cv=5)
    clf.fit(Xtr, ytr)
    P = clf.predict_proba(Xte)
    pred = P.argmax(1)
    joblib.dump(clf, f"{out_dir}/clf.joblib")
    open(f"{out_dir}/labels.json", "w").write(json.dumps(labels))
    conf = P.max(1)
    bins = []
    for lo in np.arange(0.3, 1.0, 0.1):
        m = (conf >= lo) & (conf < lo + 0.1)
        if m.sum():
            bins.append({"bin": f"{lo:.1f}-{lo + 0.1:.1f}", "n": int(m.sum()), "accuracy": round(float((pred[m] == yte[m]).mean()), 3)})
    res = {"encoder": ENCODER, "technique": "frozen embeddings + calibrated logistic regression (linear probe)",
           "n_train": len(tr), "n_test": len(te), "labels": labels, "accuracy": round(float(accuracy_score(yte, pred)), 4),
           "macro_f1": round(float(f1_score(yte, pred, average="macro")), 4),
           "confusion": confusion_matrix(yte, pred, labels=list(range(len(labels)))).tolist(), "reliability": bins,
           "train_seconds": round(time.time() - t0, 1)}
    return res


@app.function(image=common.cpu_image, volumes=common.VOLUMES, timeout=1800, cpu=2, memory=8192)
def train_remote() -> dict:
    common.ensure_dirs()
    rows = load_rows(f"{common.VOL_DATA}/router_corpus.jsonl")
    res = train_core(rows, common.VOL_ROUTER)
    with open(f"{common.VOL_RESULTS}/phase2_router_eval.json", "w") as f:
        json.dump(res, f, indent=1)
    common.commit()
    print(json.dumps({k: v for k, v in res.items() if k != "confusion"}, indent=2))
    return res


@app.local_entrypoint()
def intent_main():
    train_remote.remote()
