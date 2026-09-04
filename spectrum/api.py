"""The gateway: one FastAPI app on Modal exposing every endpoint the Vercel UI calls.

    modal deploy spectrum/api.py
    MIN_CONTAINERS=1 modal deploy spectrum/api.py     # keep the CPU container warm for the demo

Auth: header X-Demo-Key must equal the DEMO_KEY secret (or DEMO_KEY unset -> open, dev only).
"""

import json
import os
import time
import uuid

import modal

from spectrum import common
from spectrum.router.logstore import LogStore, metrics
from spectrum.router.policy import TIER_MODEL, estimate_tokens, plan, should_escalate

app = common.app
MIN_CONTAINERS = int(os.environ.get("MIN_CONTAINERS", "0"))
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,https://*.vercel.app").split(",")]


def build_app(*, tiers, intent_clf, store: LogStore, demo_key: str | None, version: str, txn_meta: dict | None = None):
    """Pure FastAPI factory (tested locally with fakes; wired to real components below)."""
    from fastapi import Depends, FastAPI, Header, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field

    api = FastAPI(title="The Model Spectrum — gateway", version=version)
    api.add_middleware(CORSMiddleware, allow_origins=[o for o in ALLOWED_ORIGINS if "*" not in o], allow_origin_regex=r"https://.*\.vercel\.app",
                       allow_methods=["*"], allow_headers=["content-type", "x-demo-key"])

    bucket: dict[str, list[float]] = {}

    def auth(request: Request, x_demo_key: str | None = Header(default=None)):
        if demo_key and x_demo_key != demo_key:
            raise HTTPException(401, "bad or missing X-Demo-Key")
        ip = request.client.host if request.client else "?"
        now = time.time()
        q = [t for t in bucket.get(ip, []) if now - t < 60]
        if len(q) >= 60:
            raise HTTPException(429, "rate limit: 60 requests/minute per IP")
        q.append(now); bucket[ip] = q

    class Classify(BaseModel):
        narrations: list[str] = Field(max_length=512)

    class Text(BaseModel):
        text: str = Field(max_length=20000)

    class Gen(BaseModel):
        prompt: str = Field(max_length=8000)
        max_new_tokens: int = 256

    class Route(BaseModel):
        text: str = Field(max_length=20000)
        force_tier: str | None = None
        session_id: str | None = None

    class BatchView(BaseModel):
        n_slm: int = 10000
        n_api: int = 200

    @api.get("/health")
    def health():
        return {"ok": True, "tiers": tiers.status(), "version": version, "txn_dataset": txn_meta}

    @api.post("/classify_txn", dependencies=[Depends(auth)])
    def classify_txn(body: Classify):
        if not tiers.tiny:
            raise HTTPException(503, "tiny model not loaded; run modal run spectrum/tiny/train.py")
        t0 = time.perf_counter()
        res = tiers.tiny.predict(body.narrations)
        wall = time.perf_counter() - t0
        from spectrum.pricing import modal_cpu_cost
        return {"results": [{"category": r["label"], "confidence": r["confidence"], "top3": r["top3"]} for r in res],
                "latency_ms": round(wall * 1000, 1), "cost_usd": modal_cpu_cost(cores=2, gib=4, seconds=wall), "model": TIER_MODEL["R5_SLM"], "n_params": tiers.tiny.n_params}

    @api.post("/pii", dependencies=[Depends(auth)])
    def pii(body: Text):
        if not tiers.redactor:
            raise HTTPException(503, "redactor not loaded")
        return tiers.redactor.redact(body.text)

    @api.post("/openweights", dependencies=[Depends(auth)])
    def openweights(body: Gen):
        if not tiers.ow:
            raise HTTPException(503, "open-weights tier not deployed")
        return tiers.ow.generate.remote("You are a concise financial assistant.", body.prompt, body.max_new_tokens)

    @api.post("/route", dependencies=[Depends(auth)])
    def route(body: Route):
        rid = uuid.uuid4().hex[:12]
        t0 = time.perf_counter()
        hops: list[dict] = []
        # 1. guard
        red = tiers.redactor.redact(body.text) if tiers.redactor else {"redacted": body.text, "entities": [], "surrogate_map": {}, "latency_ms": 0, "model": "none"}
        clean = red["redacted"]
        # 2. intent
        ic = intent_clf.predict([clean])[0] if intent_clf else {"intent": "chat", "confidence": 0.0, "top3": []}
        n_tok = estimate_tokens(clean)
        chain = plan(ic["intent"], ic["confidence"], n_tokens=n_tok, force_tier=body.force_tier)
        answer, final_tier, escalated = "", chain[-1], False
        for i, tier in enumerate(chain):
            ans, conf, hop = tiers.call(tier, text=clean, intent=ic["intent"])
            hop["escalated"] = i > 0
            hops.append(hop)
            final_tier = tier
            if hop.get("ok") and not should_escalate(tier, ok=hop.get("ok", False), confidence=conf):
                answer = ans; break
            if i == len(chain) - 1:
                answer = ans if hop.get("ok") else f"(no tier could answer: {hop.get('error')})"
            else:
                escalated = True
        from spectrum.pii.redact import deredact
        answer = deredact(answer, red["surrogate_map"])
        total_cost = round(sum(h.get("cost_usd", 0) for h in hops), 8)
        row = {"request_id": rid, "text_preview": clean[:120], "intent": ic["intent"], "intent_confidence": ic["confidence"], "intent_top3": ic.get("top3"),
               "plan": chain, "hops": hops, "final_tier": final_tier, "escalated": escalated, "n_tokens_est": n_tok,
               "pii": {"redacted_count": len(red["entities"]), "sent_to_frontier": 0, "guard_ms": red["latency_ms"], "guard_model": red["model"]},
               "total_cost_usd": total_cost, "total_latency_ms": round((time.perf_counter() - t0) * 1000, 1), "session_id": body.session_id}
        store.append(row)
        return {**row, "answer": answer, "redacted_input": clean, "entities": red["entities"]}

    @api.get("/metrics", dependencies=[Depends(auth)])
    def get_metrics(since: float | None = None):
        return metrics(store.rows(since=since))

    @api.get("/replay", dependencies=[Depends(auth)])
    def replay(n: int = 300):
        return {"rows": store.rows(n=n)}

    @api.post("/batch_view", dependencies=[Depends(auth)])
    def batch_view(body: BatchView):
        """10k transactions through the owned SLM vs a sample through Haiku/Sonnet, extrapolated to 1M."""
        from spectrum.baselines.claude_eval import latency_sample, stratified_subset
        from spectrum.data.schema import load_rows
        from spectrum.pricing import claude_cost, modal_cpu_cost

        if not tiers.tiny:
            raise HTTPException(503, "tiny model not loaded")
        rows = load_rows(f"{common.VOL_DATA}/txn.jsonl")
        test = [r for r in rows if r.split != "train"]
        sample = (test * ((body.n_slm // max(len(test), 1)) + 1))[:body.n_slm]
        t0 = time.perf_counter()
        preds = tiers.tiny.predict([r.text for r in sample], batch_size=256)
        wall = time.perf_counter() - t0
        acc = sum(p["label"] == r.label for p, r in zip(preds, sample)) / len(sample)
        slm = {"tier": "R5_SLM", "model": TIER_MODEL["R5_SLM"], "n": len(sample), "accuracy": round(acc, 4), "wall_s": round(wall, 2),
               "cost_usd": modal_cpu_cost(cores=2, gib=4, seconds=wall), "throughput_per_s": round(len(sample) / wall, 1)}
        slm["cost_per_1m_usd"] = round(slm["cost_usd"] / len(sample) * 1e6, 4)
        out = {"slm": slm, "api": [], "generated_at": time.time()}
        if tiers.claude and tiers.txn_system:
            sub = stratified_subset(rows, body.n_api)
            for key, model in (("R2_HAIKU", "claude-haiku-4-5"), ("R1_SONNET", "claude-sonnet-5")):
                ls = latency_sample(tiers.claude, model=model, system=tiers.txn_system, rows=sub, n=body.n_api)
                per = claude_cost(model, {k: int(v) for k, v in ls["avg_tokens"].items()})
                out["api"].append({"tier": key, "model": model, "n": ls["n"], "latency_ms": {"p50": ls["p50"], "p95": ls["p95"]},
                                   "avg_tokens": ls["avg_tokens"], "cost_per_task_usd": round(per, 8), "cost_per_1m_usd": round(per * 1e6, 2)})
        os.makedirs(common.VOL_RESULTS, exist_ok=True)
        with open(f"{common.VOL_RESULTS}/phase2_batch_view.json", "w") as f:
            json.dump(out, f, indent=1)
        common.commit()
        return out

    return api


# ------------------------------------------------------------------ Modal wiring
@app.function(image=common.cpu_image, volumes=common.VOLUMES, secrets=[common.anthropic_secret, common.demo_secret], cpu=2, memory=4096,
              timeout=600, scaledown_window=900, min_containers=MIN_CONTAINERS, max_containers=1)
@modal.concurrent(max_inputs=8)
@modal.asgi_app()
def web():
    common.ensure_dirs()
    tiny = redactor = intent_clf = None
    txn_meta = None
    try:
        from spectrum.tiny.infer import TinyClassifier
        tiny = TinyClassifier(f"{common.VOL_TINY}/txn")
    except Exception as e:
        print("tiny model unavailable:", e)
    try:
        from spectrum.pii.redact import Redactor
        redactor = Redactor(common.VOL_PII)
    except Exception as e:
        print("redactor unavailable, regex only:", e)
        from spectrum.pii.redact import Redactor
        redactor = Redactor(None)
    try:
        from spectrum.router.train_intent import IntentClassifier
        intent_clf = IntentClassifier(common.VOL_ROUTER)
    except Exception as e:
        print("intent classifier unavailable:", e)
    txn_system = None
    try:
        from spectrum.data.schema import label_names, load_rows
        from spectrum.prompts import classification_system_prompt
        rows = load_rows(f"{common.VOL_DATA}/txn.jsonl")
        txn_system = classification_system_prompt("txn", label_names(rows), rows)
        txn_meta = json.load(open(f"{common.VOL_DATA}/txn.meta.json")) if os.path.exists(f"{common.VOL_DATA}/txn.meta.json") else None
        if txn_meta:
            txn_meta = {k: txn_meta[k] for k in ("dataset", "hf_id", "n", "splits", "n_labels") if k in txn_meta}
    except Exception as e:
        print("txn prompt unavailable:", e)
    claude = None
    if os.environ.get("ANTHROPIC_API_KEY"):
        from spectrum.claude_client import make_client
        claude = make_client()
    ow = None
    try:  # looked up by name so api.py never imports the GPU module
        ow = modal.Cls.from_name(common.APP_NAME, "OpenWeights")()
    except Exception as e:
        print("openweights unavailable:", e)
    from spectrum.router.tiers import Tiers
    tiers = Tiers(tiny=tiny, redactor=redactor, claude_client=claude, openweights=ow, txn_system_prompt=txn_system)
    store = LogStore(f"{common.VOL_LOGS}/requests.jsonl", commit_fn=common.commit)
    return build_app(tiers=tiers, intent_clf=intent_clf, store=store, demo_key=os.environ.get("DEMO_KEY"), version="0.1.0", txn_meta=txn_meta)
