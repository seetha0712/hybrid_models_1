import { describe, expect, it } from "vitest";
import { z } from "zod";
import bench from "@/data/phase1_benchmark.json";
import replay from "@/data/phase2_replay_sample.json";
import batch from "@/data/phase2_batch_view.json";
import pii from "@/data/phase3_pii_eval.json";
import router from "@/data/phase2_router_eval.json";

const num = z.number().nullable();
const Bench = z.object({ status: z.enum(["measured", "placeholder"]), dataset: z.object({}).passthrough(), models: z.array(z.object({ id: z.string(), label: z.string(), tier: z.string(), params: num, accuracy: num, macro_f1: num, cost_per_1m_usd: num, per_class: z.array(z.object({ c: z.string(), f1: z.number() })) }).passthrough()).min(1) }).passthrough();
const Replay = z.object({ rows: z.array(z.object({ request_id: z.string(), final_tier: z.string(), hops: z.array(z.object({ tier: z.string() }).passthrough()), total_cost_usd: z.number(), pii: z.object({ redacted_count: z.number(), sent_to_frontier: z.number() }) }).passthrough()) }).passthrough();
const Batch = z.object({ slm: z.object({ cost_per_1m_usd: num, accuracy: num }).passthrough(), api: z.array(z.object({ tier: z.string(), cost_per_1m_usd: num }).passthrough()) }).passthrough();
const Pii = z.object({ regex_only: z.object({ f1: z.number(), per_label: z.record(z.object({ f1: z.number(), support: z.number() })) }).passthrough(), model_union_regex: z.object({ f1: num }).passthrough() }).passthrough();
const Router = z.object({ labels: z.array(z.string()).length(8), confusion: z.array(z.array(z.number())) }).passthrough();

describe("committed results match the UI contract", () => {
  it("phase1", () => expect(Bench.safeParse(bench).success).toBe(true));
  it("replay", () => expect(Replay.safeParse(replay).success).toBe(true));
  it("batch", () => expect(Batch.safeParse(batch).success).toBe(true));
  it("pii", () => expect(Pii.safeParse(pii).success).toBe(true));
  it("router", () => expect(Router.safeParse(router).success).toBe(true));
  it("pii never reaches the frontier in the replay", () => expect((replay as any).rows.every((r: any) => r.pii.sent_to_frontier === 0)).toBe(true));
});
