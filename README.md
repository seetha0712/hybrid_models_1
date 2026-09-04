# The Model Spectrum — live

A working demo of a **hybrid model strategy** for a bank: the same narrow task run through every
rung of the model spectrum, with a live gateway that scrubs PII, routes each request to the
cheapest adequate tier, escalates on low confidence, and shows the token P&L.

| Rung | What runs | Technique | Weights trained? |
|---|---|---|---|
| R1 frontier flagship | Claude Sonnet 5 / Opus 5 | prompt engineering + in-context learning (zero-shot + few-shot) | no |
| R2 frontier small tier | Claude Haiku 4.5 | same, with a cached ≥4k-token few-shot system prompt | no |
| R3 architecture levers | gateway: intent router (linear probe), cascade, prompt caching, batch API | logistic-regression head on frozen embeddings | head only |
| R4 open weights as-is | Qwen3-1.7B on a T4 (Modal, scale-to-zero) | prompting only | no |
| R5 fine-tuned SLM | Qwen3-0.6B + LoRA · DistilBERT PII guardrail | PEFT/LoRA SFT · full fine-tune (token classification) | adapters · all |
| R5/R6 owned tiny model | **1,722,368-parameter decoder trained from scratch** (the JPMorgan "Better with Less" pattern) | training from random init, supervised + auxiliary LM loss | all |

Everything is evaluated on **public datasets** (see `data/README.md`): US-bank-statement-format
transactions (68k, 17 categories), Banking77 (13k genuine customer queries, 77 intents) and
ai4privacy FinPII (human-validated PII spans). Nothing in the benchmark is synthetic except
the unit-test fixtures and the `draft` router intent, both flagged.

```
apps/web/      Next.js UI (Vercel)          spectrum/        Python package (Modal)
results/       committed results JSON       data/            dataset notes, CSV contract, test fixtures
scripts/       smoke / warm / sync          docs/            runbook, architecture, costs, model cards
tests/         pytest (no network)
```

## Quick start (Mac)

**One command for everything:** see `docs/LOCAL_SETUP.md` — clone, fill `.env`, run `./scripts/run_all.sh --phase all`.

```bash
python3.11 -m venv .venv && . .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -e ".[train,serve,dev]"
pytest                                  # 39 tests, no network
python -m spectrum.tiny.train --local data/fixtures/txn_fixture.jsonl --epochs 30 --batch-size 32 --out .artifacts/tiny_fixture   # CPU, ~30 s

pip install modal && modal setup        # once
modal secret create anthropic ANTHROPIC_API_KEY=sk-ant-...
modal secret create demo-key DEMO_KEY=$(openssl rand -hex 16)
```

## Phase 1 — the JPMorgan replica (owned tiny model vs LoRA vs frontier in-context learning)

```bash
modal run spectrum/data/hf_loaders.py --inspect            # prints columns + 3 rows of every dataset (do this first)
modal run spectrum/data/hf_loaders.py --dataset txn        # 68k statement-format transactions -> Volume
modal run spectrum/data/hf_loaders.py --dataset banking77  # real-data anchor
modal run spectrum/tiny/train.py --dataset txn --epochs 6  # T4 ≈ 8 min, then CPU eval + latency
modal run spectrum/tiny/train.py --dataset banking77 --epochs 12
modal run spectrum/baselines/claude_eval.py --dataset txn --models haiku,sonnet --n 1000   # batch API, ≈ $3
modal run spectrum/baselines/claude_eval.py --dataset txn --models opus --n 300 --yes     # optional
modal run spectrum/baselines/lora_qwen.py --dataset txn --n-train 20000                  # T4 ≈ 15 min
modal run spectrum/eval.py --phase 1 && git add results && git commit -m "phase 1 results"
```

## Phase 2 — gateway, router, token P&L

```bash
modal run spectrum/router/corpus.py            # real corpora -> router_corpus.jsonl (prints per-intent source report)
modal run spectrum/router/train_intent.py      # linear probe, seconds
modal deploy spectrum/deploy.py                # gateway (CPU) + Qwen3-1.7B (T4, scale-to-zero)
python scripts/smoke.py --base https://<ws>--model-spectrum-web.modal.run --key $DEMO_KEY
curl -X POST $BASE/batch_view -H "X-Demo-Key: $DEMO_KEY" -d '{"n_slm":10000,"n_api":200}'   # the $/1M moment
modal run spectrum/eval.py --phase 2
```

## Phase 3 — PII guardrail

```bash
modal run spectrum/pii/hf_pii.py --max-rows 20000
modal run spectrum/pii/train_pii.py --epochs 3         # T4 ≈ 10 min; writes results/phase3_pii_eval.json
modal deploy spectrum/deploy.py                        # gateway now loads the model (was regex-only)
```

## UI (Vercel)

```bash
cd apps/web && npm install
NEXT_PUBLIC_API_BASE=https://<ws>--model-spectrum-web.modal.run NEXT_PUBLIC_DEMO_KEY=$DEMO_KEY npm run dev
```
Set the same two variables in the Vercel project (root directory `apps/web`). The UI renders the
committed `results/*.json` when Modal is cold or unreachable and shows an "offline" badge.

## Demo day

`docs/DEMO_RUNBOOK.md`. Short version: `./scripts/warm.sh $BASE $DEMO_KEY` one hour before,
`MIN_CONTAINERS=0 modal deploy spectrum/deploy.py` after.

## Costs

See `docs/COSTS.md`. Whole build ≈ $17 (Modal's $30/month free credit covers the compute;
Claude spend ≈ $5–10). `results/pricing.json` is the single price source for Python and TypeScript.

## Status of the committed results

`results/*.json` carry `"status": "placeholder"` until the Modal runs above replace them; the
placeholders come from the 200-row test fixtures and are labelled as such in the UI.
