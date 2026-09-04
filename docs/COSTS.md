# Costs (budget $50)

Rates (`results/pricing.json`, verify before the demo): Claude Haiku 4.5 $1/$5, Sonnet 5 $2/$10,
Opus 5 $5/$25 per 1M tokens (cache reads 0.1x, cache writes 1.25x, batch 0.5x). Modal: $30/month
free credit on Starter, per-second billing, CPU ≈ $0.047/core-hour, T4 ≈ $0.59/hour.

| Phase | Item | Compute | Claude tokens | USD |
|---|---|---|---|---|
| 1 | dataset load + tokenizer | CPU 5 min | — | 0.02 |
| 1 | tiny model train + eval, 3 iterations | T4 3×10 min | — | 0.30 |
| 1 | LoRA Qwen3-0.6B + eval | T4 25 min | — | 0.25 |
| 1 | frontier batch eval, 1k rows × Haiku + Sonnet (+ Opus 300) | — | ~1.1M in / 20k out each, batch | 4.00 |
| 1 | live latency samples 30 × 3 models | — | 0.1M | 0.20 |
| 2 | router corpus + linear probe | CPU 10 min | — | 0.05 |
| 2 | Qwen3-1.7B download + serve tests | T4 30 min | — | 0.30 |
| 2 | /route dev testing ~300 calls | CPU | ~0.6M mixed, cached | 1.50 |
| 2 | batch view (10k SLM + 400 API) | CPU 3 min | 0.4M | 0.70 |
| 3 | PII fine-tune + eval | T4 10 min | — | 0.10 |
| all | image builds / debugging | CPU | — | 1.50 |
| **build** | | | | **≈ 9** |
| rehearsal ×2 | gateway warm 2 h + T4 warm 1.5 h + ~80 live calls | | | 4.4 |
| demo day | same for 2 h + live batch view | | | 3.0 |
| **total** | | | | **≈ 17** |

Guards: every `modal run` prints its cost; `claude_eval.py` stops when the estimate exceeds
`--max-usd` (default $6) unless `--yes`; the gateway is keyed and rate-limited; `MIN_CONTAINERS`
defaults to 0 so nothing idles.
