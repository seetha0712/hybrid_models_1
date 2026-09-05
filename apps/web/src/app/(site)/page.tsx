import Link from "next/link";
import bench from "@/data/phase1_benchmark.json";
import replay from "@/data/phase2_replay_sample.json";
import pii from "@/data/phase3_pii_eval.json";
import { StatTile, Section } from "@/components/ui";
import { fmtPct, fmtUsd, fmtNum } from "@/lib/pricing";
import type { Benchmark, PiiEval } from "@/lib/types";

const B = bench as unknown as Benchmark;
const P = pii as unknown as PiiEval;
const tiny = B.models.find((m) => m.id === "tiny");
const flag = B.models.find((m) => m.id === "sonnet") || B.models.find((m) => m.id === "haiku");
const R = replay as any;

const rungs = [
  ["R1", "Frontier flagship", "Claude Sonnet 5 / Opus 5", "in-context learning · no training", "var(--series-5)"],
  ["R2", "Frontier small tier", "Claude Haiku 4.5", "in-context learning · cached few-shot prompt", "var(--series-2)"],
  ["R3", "Architecture levers", "gateway: guard → router → cascade · prompt cache · batch API", "linear probe (frozen embeddings + LR head)", "var(--text-muted)"],
  ["R4", "Open weights as-is", "Qwen3-1.7B on a T4, scale-to-zero", "prompting only", "var(--series-3)"],
  ["R5", "Fine-tuned SLMs", "Qwen3-0.6B + LoRA · DistilBERT PII guard", "PEFT/LoRA SFT · full fine-tune", "var(--series-4)"],
  ["R5/R6", "Owned tiny model", "1.72M-param decoder", "trained from scratch (random init)", "var(--series-1)"],
];

export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Don't switch models. Build the spectrum.</h1>
      <p className="muted mt-1 max-w-3xl">The same narrow task run through every rung, one gateway that scrubs PII and routes each request to the cheapest adequate tier, and a token P&amp;L that shows what the policy saves. Every number is measured; placeholders say so.</p>
      <div className="grid md:grid-cols-4 gap-3 mt-4">
        <StatTile label="Owned tiny model" value={`${fmtNum(tiny?.params)} params`} sub={`${fmtPct(tiny?.accuracy)} accuracy · ${tiny?.latency_ms?.p50 ?? "—"} ms p50`} color="var(--series-1)" />
        <StatTile label="Cost per 1M tasks, owned" value={fmtUsd(tiny?.cost_per_1m_usd, 2)} sub="CPU marginal, 2 cores" color="var(--series-1)" />
        <StatTile label="Cost per 1M tasks, frontier" value={fmtUsd(flag?.cost_per_1m_usd ?? null, 0)} sub={flag ? `${flag.label}, live cached` : "run Phase 1"} color="var(--series-5)" />
        <StatTile label="PII sent to frontier" value="0" sub={`${fmtNum(R?.metrics?.pii_blocked_total)} entities redacted in the replay`} color="var(--series-6)" />
      </div>
      <Section title="Six ways to run a language model — what this demo actually does on each rung">
        <table className="data"><thead><tr><th>Rung</th><th>Name</th><th>Runs here</th><th>Learning technique</th></tr></thead>
          <tbody>{rungs.map(([r, n, w, t, c]) => <tr key={r}><td><span className="swatch" style={{ background: c }} />{r}</td><td>{n}</td><td>{w}</td><td className="muted">{t}</td></tr>)}</tbody></table>
      </Section>
      <Section title="The ten-minute walk">
        <ol className="list-decimal ml-5 space-y-1 text-sm">
          <li><Link href="/spectrum" className="underline">Spectrum</Link> — the JPMorgan replica: from-scratch vs LoRA vs Claude few-shot; toggle unseen merchants.</li>
          <li><Link href="/guardrail" className="underline">Guardrail</Link> — paste a chat with a card number; zero PII reaches the frontier. Regex F1 on names: {fmtPct(P.regex_only?.per_label?.PER?.f1 ?? 0)}.</li>
          <li><Link href="/router" className="underline">Router</Link> — route five requests, force one to Opus, slide "everything on the flagship".</li>
          <li><Link href="/batch" className="underline">Batch</Link> — 10,000 transactions through the owned model vs the frontier sample.</li>
          <li><Link href="/underwrite" className="underline">Underwrite</Link> — frontier prices fall 10× a year; watch the crossover move.</li>
        </ol>
      </Section>
    </div>
  );
}
