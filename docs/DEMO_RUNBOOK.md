# Demo runbook (10 minutes in front of the visitor)

## T-60 min
1. `./scripts/warm.sh https://<ws>--model-spectrum-web.modal.run $DEMO_KEY` (deploys with `MIN_CONTAINERS=1`, pings all tiers).
2. `python scripts/smoke.py --base $BASE --key $DEMO_KEY` — all PASS, note the cost line.
3. Open the Vercel URL; the live badge must be green for slm / pii / openweights / claude.
4. Open a second tab on `/batch` and click **Run live** once (pre-warms the batch view, ~1 min).

## The storyline
1. **Spectrum tab** — "We reproduced the JPMorgan result": the 1.7M-parameter model we trained
   from scratch versus LoRA versus Claude few-shot. Toggle *unseen merchants*: the frontier wins
   there, which is exactly why the gateway escalates.
2. **Guardrail tab** — paste a chat with a name, card number and email. Zero PII reaches the frontier.
3. **Router tab** — five scripted requests (in `docs/DEMO_RUNBOOK.md` → below), one forced to Opus.
   Watch the route trace and the cost line. Move the what-if slider: "everything on the flagship".
4. **Batch tab** — 10,000 transactions through the owned model vs the frontier sample: the $/1M moment.
5. **Underwrite tab** — drag "frontier price ÷10 per year": the crossover moves right; re-underwrite annually.
6. Close on the durable layer: data, private evals, the guard — they outlive every model swap.

Scripted requests:
- `Categorise this transaction: WHOLE FOODS MKT #10 SEATTLE WA`
- `Categorise this transaction: SQ *NEW VENDOR 8821 AUSTIN TX` (escalates: unseen merchant)
- `Summarise in three lines: <paste a 10-K paragraph>`
- `Draft a polite email to Ana Ruiz (ana@example.com, card 4111 1111 1111 1111) about the fee change` (guard fires)
- `Analyse the two hedging strategies below and recommend one ...` then the same with **force tier = Opus**

## T+0
`MIN_CONTAINERS=0 modal deploy spectrum/deploy.py` — stop paying for warm containers.
`modal run spectrum/eval.py --phase 2 && ./scripts/sync_results.sh && git commit -am "demo traffic"` to keep the replay.

## If something is cold
The UI shows "offline — recorded results" and disables live inputs; the Spectrum, Underwrite and
Guardrail tabs still tell the story from the committed JSON. Click **Warm up** in the header.
