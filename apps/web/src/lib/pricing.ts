// Mirror of spectrum/pricing.py. Checked against tests/fixtures/pricing_cases.json in pricing.test.ts.
import pricing from "@/data/pricing.json";

export type Usage = { in: number; cache_write: number; cache_read: number; out: number };
type ClaudePrice = { input: number; output: number; cache_write_mult: number; cache_read_mult: number; cache_min_tokens: number; label: string; tier: string };
const P = pricing as unknown as {
  claude: Record<string, ClaudePrice>; batch_discount: number;
  modal: { cpu_per_core_hour: number; mem_per_gib_hour: number; gpu_per_hour: Record<string, number> };
  self_hosted_defaults: { fixed_month_usd: number; variable_per_task_usd: number };
  tokens_per_task_default: number; frontier_deflation_per_year: number; as_of: string;
};
export const PRICING = P;

export function claudeCost(model: string, u: Usage, batch = false): number {
  const m = P.claude[model];
  if (!m) throw new Error(`unknown model ${model}`);
  let c = (u.in * m.input + u.cache_write * m.input * m.cache_write_mult + u.cache_read * m.input * m.cache_read_mult + u.out * m.output) / 1e6;
  if (batch) c *= P.batch_discount;
  return Math.round(c * 1e10) / 1e10;
}
export function modalCpuCost(cores: number, gib: number, seconds: number): number {
  return Math.round(((cores * P.modal.cpu_per_core_hour + gib * P.modal.mem_per_gib_hour) * seconds / 3600) * 1e10) / 1e10;
}
export function modalGpuCost(gpu: string, seconds: number): number {
  return Math.round((P.modal.gpu_per_hour[gpu] * seconds / 3600) * 1e10) / 1e10;
}
export function reunderwrite(a: { monthlyVolume: number; tokensPerTask: number; flagshipPerMtok: number; smallPerMtok: number; selfFixedMonth: number; selfVariablePerTask: number; yearsAhead?: number; deflation?: number }) {
  const d = a.deflation ?? P.frontier_deflation_per_year;
  const y = a.yearsAhead ?? 0;
  const f = a.flagshipPerMtok / Math.pow(d, y);
  const s = a.smallPerMtok / Math.pow(d, y);
  const t = a.tokensPerTask / 1e6;
  const denom = t * s - a.selfVariablePerTask;
  return {
    flagship: a.monthlyVolume * t * f,
    small_tier: a.monthlyVolume * t * s,
    self_hosted: a.selfFixedMonth + a.monthlyVolume * a.selfVariablePerTask,
    crossover_volume_vs_small_tier: denom > 0 ? a.selfFixedMonth / denom : Infinity,
  };
}
export const fmtUsd = (v: number | null | undefined, digits = 4) => (v == null || Number.isNaN(v) ? "—" : v < 0.01 && v > 0 ? `$${v.toExponential(2)}` : `$${v.toLocaleString(undefined, { maximumFractionDigits: digits })}`);
export const fmtNum = (v: number | null | undefined, digits = 0) => (v == null || Number.isNaN(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: digits }));
export const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

// Axis formatter for log-scale dollar axes: never rounds a small value to "$0", never uses exponent notation.
export const fmtAxisUsd = (v: number) => {
  if (v == null || Number.isNaN(v)) return "";
  if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${Number(v.toPrecision(1)).toString()}`;
};
