# Local setup on the Mac (runs Modal + Vercel, updates Git)

```bash
git clone -b claude/hybrid-model-strategy-ursjw5 https://github.com/seetha0712/hybrid_models_1 \
  /Users/seetha/llmprojects/hybrid_models_1_local
cd /Users/seetha/llmprojects/hybrid_models_1_local
cp .env.example .env        # fill in ANTHROPIC_API_KEY, MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, DEMO_KEY (+ VERCEL_TOKEN)
code .                      # VS Code
./scripts/run_all.sh --dry-run --phase all   # preview the command sequence
./scripts/run_all.sh --phase all             # ≈ 1 h wall clock, ≈ $17 (Modal free credit covers most)
```

Prerequisites: Python 3.11+ (`python3 --version`), Node 22 (`node --version`), git. The script
creates `.venv`, installs the package, logs Modal in from `.env`, and creates the Modal secrets.

What the script does, in order (each step skipped once done):
1. **Phase 1** — inspect datasets, load the transaction set and Banking77 to the Modal Volume,
   train the from-scratch tiny model on a T4 for both, run Claude Haiku/Sonnet batch evals
   (Opus with `RUN_OPUS=1`), LoRA-tune Qwen3-0.6B, write `results/phase1_benchmark.json`.
2. **Phase 2** — build the router corpus from real datasets, train the intent probe.
3. **Phase 3** — load ai4privacy FinPII, fine-tune the DistilBERT guardrail.
4. **Deploy** — `modal deploy spectrum/deploy.py`, detect the gateway URL (saved to `.env`),
   smoke test, run the 10k-vs-frontier batch view, regenerate all `results/*.json`.
5. **Web** — build `apps/web`; with `VERCEL_TOKEN` set, link the Vercel project, set
   `NEXT_PUBLIC_API_BASE` / `NEXT_PUBLIC_DEMO_KEY`, deploy to production and print the URL.
6. **Git** — commit `results/` and `apps/web/src/data/` and push (`GIT_PUSH=0` to skip).

If something fails: read the step output, fix, re-run the same command. Markers live in
`.artifacts/state/`; `--force` re-runs everything. Demo-day warm-up: `./scripts/warm.sh $GATEWAY_URL $DEMO_KEY`;
after the demo: `MIN_CONTAINERS=0 modal deploy spectrum/deploy.py`.

Or, in VS Code, open Claude Code in this folder and say "run everything" — `CLAUDE.md` tells it
to use `scripts/run_all.sh` and never to print or commit `.env`.
