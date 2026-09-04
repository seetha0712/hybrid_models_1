import { describe, expect, it } from "vitest";
import cases from "@/data/pricing_cases.json";
import { claudeCost, modalCpuCost, modalGpuCost, reunderwrite } from "./pricing";

describe("pricing parity with Python", () => {
  for (const c of (cases as any).claude) it(c.name, () => expect(claudeCost(c.model, c.usage, c.batch)).toBeCloseTo(c.expected, 9));
  for (const c of (cases as any).modal_cpu) it(c.name, () => expect(modalCpuCost(c.cores, c.gib, c.seconds)).toBeCloseTo(c.expected, 9));
  for (const c of (cases as any).modal_gpu) it(c.name, () => expect(modalGpuCost(c.gpu, c.seconds)).toBeCloseTo(c.expected, 9));
  it("crossover moves right with deflation", () => {
    const base = { monthlyVolume: 1e6, tokensPerTask: 1000, flagshipPerMtok: 10, smallPerMtok: 2, selfFixedMonth: 430, selfVariablePerTask: 5e-6 };
    expect(reunderwrite({ ...base, yearsAhead: 1 }).crossover_volume_vs_small_tier).toBeGreaterThan(reunderwrite(base).crossover_volume_vs_small_tier);
  });
});
