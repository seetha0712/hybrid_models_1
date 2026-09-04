"""The Model Spectrum, live — Modal-side package.

Sub-packages:
  data        real-dataset loaders (Hugging Face) + CSV swap-in contract
  tiny        the from-scratch ~1.7M-parameter decoder (owned SLM, rung R5/R6)
  baselines   Claude batch evaluation (in-context learning, R1/R2) and a LoRA-tuned Qwen3-0.6B (R5)
  router      intent classifier (linear probe), routing policy, tier callers, request log
  pii         PII guardrail token classifier (full fine-tune of DistilBERT), regex baseline, redaction
  openweights Qwen3-1.7B served as-is on a T4 (R4)
Top-level modules: common (Modal app/images/volume), pricing (cost formulas), claude_client, api, eval.
"""

__version__ = "0.1.0"
