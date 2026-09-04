# Project instructions for Claude Code (local sessions)

This repo is "The Model Spectrum — live", a hybrid-model-strategy demo. Read `README.md`
first, then `docs/LOCAL_SETUP.md`.

## How to run everything
- Credentials live in `.env` (copy of `.env.example`). Never print, log, or commit `.env`.
- `./scripts/run_all.sh --phase all` runs Modal training + evals, deploys the gateway and the
  Qwen3-1.7B tier, smoke-tests, regenerates `results/*.json`, builds and deploys the UI to
  Vercel, and commits + pushes the measured results. Steps are idempotent via markers in
  `.artifacts/state/`; use `--force` to redo, `--dry-run` to preview, `--phase 1|2|3|deploy|web|git`.
- If a step fails, read its output, fix, and re-run the same command: completed steps are skipped.

## Layout
`spectrum/` Python package (Modal entrypoints: `spectrum/data/hf_loaders.py`, `spectrum/tiny/train.py`,
`spectrum/baselines/*.py`, `spectrum/router/*.py`, `spectrum/pii/*.py`, `spectrum/deploy.py`,
`spectrum/eval.py`) · `apps/web/` Next.js UI · `results/` committed results JSON (single price
source: `results/pricing.json`) · `tests/` pytest (no network) · `scripts/` run_all, smoke, warm, sync.

## Rules
- Tests must stay green: `pytest` (repo root) and `npm test && npm run build` (apps/web).
- Claude calls go through `spectrum/claude_client.py` (cached frozen system prompts, JSON schema
  output, no prefill). Model IDs: claude-haiku-4-5, claude-sonnet-5, claude-opus-5.
- Every reported number must come from a measured run; placeholders keep `"status": "placeholder"`.
- Cost guards: `claude_eval.py` stops above `--max-usd` (default $6) without `--yes`; the Modal
  gateway is keyed (`X-Demo-Key`) and defaults to `MIN_CONTAINERS=0`.
- After a demo: `MIN_CONTAINERS=0 modal deploy spectrum/deploy.py`.
