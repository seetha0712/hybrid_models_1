"""Frontier baselines via the Message Batches API (50% off) + a small synchronous latency sample.

    modal run spectrum/baselines/claude_eval.py --dataset txn --models haiku,sonnet --n 1000
    modal run spectrum/baselines/claude_eval.py --dataset txn --models opus --n 300 --yes

Technique: in-context learning only (zero-shot instructions + few-shot examples from TRAIN).
Cost guard: the estimated cost is printed and the run stops if it exceeds --max-usd without --yes.
Writes <VOL_RESULTS>/claude_<dataset>_<model>.json.
"""
from __future__ import annotations

import json
import random
import statistics
import time

from spectrum import common
from spectrum.claude_client import MODELS, call_claude, count_tokens, make_client, system_blocks
from spectrum.data.schema import Row, label_names, load_rows
from spectrum.pricing import Usage, claude_cost, load_pricing
from spectrum.prompts import CLASSIFY_SCHEMA, classification_system_prompt, classification_user_prompt

app = common.app


def stratified_subset(rows: list[Row], n: int, seed: int = 42) -> list[Row]:
    rng = random.Random(seed)
    test = [r for r in rows if r.split in ("test", "test_unseen")]
    by = {}
    for r in test:
        by.setdefault(r.label, []).append(r)
    out = []
    k = max(1, n // max(len(by), 1))
    for lab in sorted(by):
        rs = by[lab][:]
        rng.shuffle(rs)
        out.extend(rs[:k])
    rest = [r for r in test if r not in out]
    rng.shuffle(rest)
    out.extend(rest[: max(0, n - len(out))])
    return out[:n]


def _normalise(s: str, labels: list[str]) -> str:
    s = (s or "").strip().lower().replace(" ", "_")
    if s in labels:
        return s
    for l in labels:  # tolerate "category: x" or minor decoration
        if l in s:
            return l
    return "__unparseable__"


def run_batch(client, *, model: str, system: list[dict], rows: list[Row], labels: list[str], poll_s: int = 15) -> tuple[dict, list[dict]]:
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request

    def params(r: Row):
        p = dict(model=model, max_tokens=64, system=system, messages=[{"role": "user", "content": classification_user_prompt(r.text)}],
                 output_config={"format": {"type": "json_schema", "schema": CLASSIFY_SCHEMA}})
        if model == MODELS["sonnet"]:
            p["thinking"] = {"type": "disabled"}
        if model == MODELS["opus"]:
            p["output_config"]["effort"] = "low"
        return MessageCreateParamsNonStreaming(**p)

    reqs = [Request(custom_id=f"{r.id}", params=params(r)) for r in rows]
    batch = client.messages.batches.create(requests=reqs)
    print(f"batch {batch.id} created with {len(reqs)} requests")
    while True:
        b = client.messages.batches.retrieve(batch.id)
        if b.processing_status == "ended":
            break
        time.sleep(poll_s)
    by_id = {r.id: r for r in rows}
    per_row, totals = [], Usage()
    agg = {"in": 0, "cache_write": 0, "cache_read": 0, "out": 0}
    for res in client.messages.batches.results(batch.id):
        r = by_id[res.custom_id]
        rec = {"id": r.id, "gold": r.label, "split": r.split, "pred": "__error__", "confidence": None}
        if res.result.type == "succeeded":
            msg = res.result.message
            text = next((c.text for c in msg.content if c.type == "text"), "")
            u = Usage.from_api(msg.usage)
            for k, v in u.as_dict().items():
                agg[k] += v
            rec["usage"] = u.as_dict()
            if msg.stop_reason == "refusal":
                rec["pred"] = "__refusal__"
            else:
                try:
                    j = json.loads(text)
                    rec["pred"] = _normalise(j.get("category"), labels)
                    rec["confidence"] = j.get("confidence")
                except Exception:
                    rec["pred"] = _normalise(text, labels)
        else:
            rec["error"] = res.result.type
        per_row.append(rec)
    return {"batch_id": batch.id, "usage": agg}, per_row


def score(per_row: list[dict], labels: list[str]) -> dict:
    from sklearn.metrics import accuracy_score, f1_score

    out = {}
    for split, key in (("test", ""), ("test_unseen", "_unseen")):
        rs = [r for r in per_row if r["split"] == split] if split != "test" else [r for r in per_row if r["split"] in ("test",)]
        if not rs:
            continue
        gold = [r["gold"] for r in rs]
        pred = [r["pred"] for r in rs]
        out[f"accuracy{key}"] = round(accuracy_score(gold, pred), 4)
        out[f"macro_f1{key}"] = round(f1_score(gold, pred, average="macro", labels=labels, zero_division=0), 4)
        out[f"n{key}"] = len(rs)
    allrows = per_row
    out["accuracy_all"] = round(sum(r["gold"] == r["pred"] for r in allrows) / max(len(allrows), 1), 4)
    out["unparseable"] = sum(r["pred"] in ("__unparseable__", "__error__", "__refusal__") for r in allrows)
    per = f1_score([r["gold"] for r in allrows], [r["pred"] for r in allrows], average=None, labels=labels, zero_division=0)
    out["per_class"] = [{"c": l, "f1": round(float(v), 4)} for l, v in zip(labels, per)]
    return out


def latency_sample(client, *, model: str, system: list[dict], rows: list[Row], n: int = 30) -> dict:
    lat, usages = [], []
    for r in rows[:n]:
        res = call_claude(client, model=model, system=system, user=classification_user_prompt(r.text), schema=CLASSIFY_SCHEMA, max_tokens=64)
        if res.ok:
            lat.append(res.latency_ms)
            usages.append(res.usage.as_dict())
    lat.sort()
    cache_reads = sum(u["cache_read"] for u in usages[1:])
    return {"p50": round(statistics.median(lat), 1) if lat else None, "p95": round(lat[int(len(lat) * 0.95) - 1], 1) if len(lat) >= 2 else None,
            "n": len(lat), "cache_read_tokens_after_first": cache_reads, "avg_tokens": {k: round(sum(u[k] for u in usages) / max(len(usages), 1), 1) for k in ("in", "cache_write", "cache_read", "out")}}


@app.function(image=common.cpu_image, volumes=common.VOLUMES, secrets=[common.anthropic_secret], timeout=3 * 3600, cpu=1, memory=2048)
def evaluate_remote(dataset: str, model_key: str, n: int, max_usd: float, yes: bool, latency_n: int) -> dict:
    common.ensure_dirs()
    rows = load_rows(f"{common.VOL_DATA}/{dataset}.jsonl")
    labels = label_names(rows)
    model = MODELS[model_key]
    system_text = classification_system_prompt(dataset, labels, rows)
    system = system_blocks(system_text)
    client = make_client()
    subset = stratified_subset(rows, n)
    sys_tokens = count_tokens(client, model=model, system=system, user=classification_user_prompt(subset[0].text))
    p = load_pricing()["claude"][model]
    est = claude_cost(model, Usage(input_tokens=sys_tokens + 40, output_tokens=20), batch=True) * len(subset)
    print(f"model={model} system_tokens≈{sys_tokens} (cache_min={p['cache_min_tokens']}) rows={len(subset)} est_batch_cost=${est:.3f}")
    if sys_tokens < p["cache_min_tokens"]:
        print("WARNING: system prompt below cache minimum; live calls will not hit the cache")
    if est > max_usd and not yes:
        raise SystemExit(f"estimated ${est:.2f} > --max-usd {max_usd}; re-run with --yes")
    meta, per_row = run_batch(client, model=model, system=system, rows=subset, labels=labels)
    metrics = score(per_row, labels)
    batch_cost = claude_cost(model, meta["usage"], batch=True)
    lat = latency_sample(client, model=model, system=system, rows=subset, n=latency_n) if latency_n else {}
    live_cost_per_item = claude_cost(model, {k: int(v) for k, v in lat.get("avg_tokens", {}).items()}) if lat else None
    out = {"model": model, "model_key": model_key, "dataset": dataset, "technique": "in-context learning (zero-shot + few-shot), no training",
           "n_eval": len(subset), "system_prompt_tokens": sys_tokens, **metrics, "batch": {**meta, "cost_usd": round(batch_cost, 4)},
           "latency_ms": {"p50": lat.get("p50"), "p95": lat.get("p95")}, "latency_sample": lat,
           "cost_per_1m_usd": {"batch": round(batch_cost / max(len(subset), 1) * 1e6, 2),
                                "live_cached": round(live_cost_per_item * 1e6, 2) if live_cost_per_item else None},
           "per_row": per_row}
    path = f"{common.VOL_RESULTS}/claude_{dataset}_{model_key}.json"
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    common.commit()
    print(json.dumps({k: v for k, v in out.items() if k not in ("per_row", "per_class", "latency_sample")}, indent=2))
    return {k: v for k, v in out.items() if k not in ("per_row",)}


@app.local_entrypoint()
def claude_eval_main(dataset: str = "txn", models: str = "haiku,sonnet", n: int = 1000, max_usd: float = 6.0, yes: bool = False, latency_n: int = 30):
    for mk in [m.strip() for m in models.split(",") if m.strip()]:
        evaluate_remote.remote(dataset, mk, n, max_usd, yes, latency_n)
