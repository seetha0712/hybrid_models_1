# Architecture

```
Browser (Vercel, Next.js)  ──X-Demo-Key──▶  Modal gateway  (spectrum/api.py, CPU container, scale-to-zero)
   │ static results/*.json fallback             │
   │                                            ├─ PII guard      spectrum/pii/redact.py   (DistilBERT fine-tune ∪ regex)  in-process
   │                                            ├─ intent router  spectrum/router/train_intent.py (MiniLM embeddings + LR)  in-process
   │                                            ├─ policy         spectrum/router/policy.py  (chains, thresholds, cascade)
   │                                            ├─ R5 owned SLM   spectrum/tiny/infer.py     (1.7M-param decoder, CPU)     in-process
   │                                            ├─ R4 open weights spectrum/openweights/serve.py (Qwen3-1.7B, T4)          modal.Cls.from_name
   │                                            ├─ R2/R1 Claude   spectrum/claude_client.py  (cached system, JSON schema)  Anthropic API
   │                                            └─ log            spectrum/router/logstore.py (JSONL on the Volume) → /metrics, what-if
Training jobs (modal run): data/hf_loaders.py · tiny/train.py (T4) · baselines/claude_eval.py (Batches API) ·
baselines/lora_qwen.py (T4) · router/corpus.py + train_intent.py (CPU) · pii/hf_pii.py + train_pii.py (T4) · eval.py
Artefacts live on the Modal Volume `spectrum-artifacts` (/vol/{data,tiny,lora,router,pii,hf,logs,results}).
```

Request flow for `POST /route`: redact → classify intent → `plan()` → call tiers in order → `should_escalate()` →
de-redact the answer → append the log row → respond with hops, cost, latency, PII counters.

Design rules: prompts are frozen constants (cache), every Claude call uses `output_config.format`,
no prefill, `stop_reason=="refusal"` is a failed hop that cascades, and `results/pricing.json` is
the only place a price lives (Python and TypeScript both read it; a shared fixture proves parity).
