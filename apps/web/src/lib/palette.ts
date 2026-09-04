// Fixed categorical order (validated palette, see dataviz reference). Colour follows the entity.
export const TIER_ORDER = ["R5_SLM", "R2_HAIKU", "R4_OPEN", "R1_SONNET", "R1_OPUS", "R5_PII"] as const;
export const TIER_COLOR: Record<string, string> = {
  R5_SLM: "var(--series-1)", R2_HAIKU: "var(--series-2)", R4_OPEN: "var(--series-3)", R1_SONNET: "var(--series-4)", R1_OPUS: "var(--series-5)", R5_PII: "var(--series-6)",
};
export const TIER_LABEL: Record<string, string> = {
  R5_SLM: "R5 owned tiny model", R5_PII: "R5 PII guardrail", R4_OPEN: "R4 open weights (Qwen3-1.7B)", R2_HAIKU: "R2 Claude Haiku 4.5", R1_SONNET: "R1 Claude Sonnet 5", R1_OPUS: "R1 Claude Opus 5",
};
export const MODEL_COLOR: Record<string, string> = { tiny: "var(--series-1)", lora: "var(--series-2)", haiku: "var(--series-3)", sonnet: "var(--series-4)", opus: "var(--series-5)" };
export const ENTITY_COLOR: Record<string, string> = { PER: "var(--series-1)", ACCT: "var(--series-2)", CARD: "var(--series-3)", PHONE: "var(--series-4)", EMAIL: "var(--series-5)", ADDR: "var(--series-6)", DOB: "var(--series-2)", OTHER: "var(--text-muted)" };
