# Model cards

## Owned tiny model (R5/R6) — `spectrum/tiny`
Decoder-only transformer, pre-LN, 6 layers, d_model 128, 4 heads, d_ff 512, context 64, learned
positions, tied embeddings, byte-level BPE vocab fixed at 4096 (padded with unused tokens so the
size never depends on the dataset). **1,722,368 parameters.** Trained **from scratch** (random
init) with cross-entropy on the label token read at `<sep>` plus 0.1 × auxiliary next-token loss
over the input tokens. AdamW 3e-3 one-cycle, batch 256, 6 epochs. Confidence = softmax max over
label logits; the gateway escalates below 0.80. Serving: CPU, 2 cores, batch 256.
Not a language model in the general sense: it only knows this task.

## Qwen3-0.6B + LoRA (R5) — `spectrum/baselines/lora_qwen.py`
Pretrained 0.6B base frozen; rank-16 LoRA (alpha 32) on q/k/v/o, ~2M trainable parameters, 1 epoch
over 20k rows, fp16 on a T4. Greedy decoding of the label string. Shows what parameter-efficient
fine-tuning buys over the from-scratch model on unseen merchants, at ~350x the size.

## PII guardrail (R5) — `spectrum/pii`
`distilbert-base-multilingual-cased`, full fine-tune for token classification (17 BIO tags over
PER/ACCT/CARD/PHONE/EMAIL/ADDR/DOB/OTHER), 3 epochs on ai4privacy FinPII. Served in-process on
CPU, unioned with a Luhn-checked regex layer for cards/IBANs. Reported: entity-level P/R/F1 vs the
regex baseline; the regex cannot find names, which is the case for the model.

## Intent router (R3) — `spectrum/router/train_intent.py`
`paraphrase-multilingual-MiniLM-L12-v2` sentence embeddings (frozen) + `CalibratedClassifierCV`
over logistic regression. 8 intents, ~250 real examples each. Calibrated probabilities feed the
0.55 uncertainty threshold.

## Open weights as-is (R4) — `spectrum/openweights/serve.py`
`Qwen/Qwen3-1.7B`, fp16, `transformers`, thinking disabled, greedy, on a Modal T4 with
scale-to-zero. No training. Asked for `{answer, confidence}` JSON; `low` confidence escalates.

## Frontier tiers (R1/R2) — `spectrum/claude_client.py`
Claude Haiku 4.5 / Sonnet 5 / Opus 5 via the Anthropic Messages API. Zero-shot instructions +
few-shot examples in a frozen, cached system prompt (≥4,200 tokens for the transaction task so
Haiku's 4,096-token cache minimum is met). JSON-schema outputs, no prefill, refusals cascade.

## Safety note
Fine-tuning can erode a base model's safety alignment; in production every fine-tuned model
(here: the LoRA model and the guardrail) would be re-certified after each training run. The tiny
model has no general capability to erode. See the companion report, §8 Reliability.
