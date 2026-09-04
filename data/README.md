# Data

Real public datasets first; synthetic text only where no public source exists, and then flagged.

| Use | Dataset | Rows / classes | Licence | Notes |
|---|---|---|---|---|
| Transaction categorisation (Phase 1, primary) | [DoDataThings/us-bank-transaction-categories-v2](https://huggingface.co/datasets/DoDataThings/us-bank-transaction-categories-v2) | 68k / 17 | check dataset card | Statement-format descriptions with 500+ real merchant names; generated to match real US statement formats. Genuine bank narrations are never public (customer data) — say so in the demo. |
| Real-data anchor (Phase 1, second config) | [PolyAI/banking77](https://huggingface.co/datasets/PolyAI/banking77) | 13,083 / 77 | CC-BY-4.0 | Genuine online-banking customer queries; published leaderboard numbers exist (fine-tuned BERT-class ≈ 93%). |
| PII guardrail (Phase 3) | [ai4privacy/pii-masking-300k](https://huggingface.co/datasets/ai4privacy/pii-masking-300k) (FinPII subset when identifiable) | up to 80k | see dataset card | Human-validated spans; EN/FR/DE/IT/ES/NL. **No Japanese.** Fine labels collapse to PER/ACCT/CARD/PHONE/EMAIL/ADDR/DOB/OTHER (`spectrum/pii/labels.py`). |
| Router corpus (Phase 2) | banking77 · the transaction set · ai4privacy texts · [TheFinAI/flare-finqa](https://huggingface.co/datasets/TheFinAI/flare-finqa) · [eloukas/edgar-corpus](https://huggingface.co/datasets/eloukas/edgar-corpus) · [code_search_net](https://huggingface.co/datasets/code_search_net) | ~250 per intent | per source | Instruction wrappers are added around real texts; `spectrum/router/corpus.py` prints exactly which source loaded for each intent. |
| `draft` intent | `data/draft_templates.yaml` | 250 | — | The only templated intent (no public corpus of "draft me a note" requests). Flagged `meta.templated=true`. |
| Unit-test fixtures | `data/fixtures/*.jsonl` (from `spectrum/data/fixtures.py`) | 200 / 96 / 60 | — | Synthetic, deterministic, **tests and offline UI only**. Never used for reported numbers. |

Run `modal run spectrum/data/hf_loaders.py --inspect` first: it prints each dataset's columns and
three rows, so you can confirm the auto-detected text/label columns before training.

## Bringing your own CSV (firm data, later)

`spectrum/data/csv_loader.py` accepts:

- required column `narration` (or `text`)
- optional `category` (or `label`), `amount`, `currency`, `date`
- optional `label_map.json` `{ "raw label": "canonical_label" }`

Rows with unknown labels are reported and dropped, never silently kept. Use
`python -m spectrum.tiny.train --local your.jsonl ...` after converting with the loader, or run
the same on Modal. Firm data must never be sent to the frontier tiers except through the PII
guard; check firm policy before moving any of it onto a personal machine or a cloud account.
