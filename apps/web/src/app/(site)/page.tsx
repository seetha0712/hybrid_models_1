import Link from "next/link";
import bench from "@/data/phase1_benchmark.json";
import replay from "@/data/phase2_replay_sample.json";
import pii from "@/data/phase3_pii_eval.json";
import { StatTile, Section } from "@/components/ui";
import { fmtPct, fmtUsd, fmtNum } from "@/lib/pricing";
import type { Benchmark, PiiEval } from "@/lib/types";
import { getT } from "@/lib/i18n-server";
import type { MsgKey } from "@/lib/messages";

const B = bench as unknown as Benchmark;
const P = pii as unknown as PiiEval;
const tiny = B.models.find((m) => m.id === "tiny");
const flag = B.models.find((m) => m.id === "sonnet") || B.models.find((m) => m.id === "haiku");
const R = replay as any;

const rungs: [string, MsgKey, string, string, string][] = [
  ["R1", "rung.r1", "Claude Sonnet 5 / Opus 5", "in-context learning · no training", "var(--series-5)"],
  ["R2", "rung.r2", "Claude Haiku 4.5", "in-context learning · cached few-shot prompt", "var(--series-2)"],
  ["R3", "rung.r3", "gateway: guard → router → cascade · prompt cache · batch API", "linear probe (frozen embeddings + LR head)", "var(--text-muted)"],
  ["R4", "rung.r4", "Qwen3-1.7B on a T4, scale-to-zero", "prompting only", "var(--series-3)"],
  ["R5", "rung.r5", "Qwen3-0.6B + LoRA · DistilBERT PII guard", "PEFT/LoRA SFT · full fine-tune", "var(--series-4)"],
  ["R5/R6", "rung.r56", "1.72M-param decoder", "trained from scratch (random init)", "var(--series-1)"],
];

export default async function Home() {
  const t = await getT();
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t("home.title")}</h1>
      <p className="muted mt-1 max-w-3xl">{t("home.intro")}</p>
      <div className="grid md:grid-cols-4 gap-3 mt-4">
        <StatTile label={t("home.stat.owned")} value={`${fmtNum(tiny?.params)} params`} sub={`${fmtPct(tiny?.accuracy)} · ${tiny?.latency_ms?.p50 ?? "—"} ms p50`} color="var(--series-1)" />
        <StatTile label={t("home.stat.costOwned")} value={fmtUsd(tiny?.cost_per_1m_usd, 2)} sub={t("home.stat.costOwned.sub")} color="var(--series-1)" />
        <StatTile label={t("home.stat.costFrontier")} value={fmtUsd(flag?.cost_per_1m_usd ?? null, 0)} sub={flag ? `${flag.label}` : "run Phase 1"} color="var(--series-5)" />
        <StatTile label={t("home.stat.piiSent")} value="0" sub={`${fmtNum(R?.metrics?.pii_blocked_total)} ${t("home.stat.piiSent.sub")}`} color="var(--series-6)" />
      </div>
      <Section title={t("home.section.rungs")}>
        <table className="data"><thead><tr><th>{t("home.th.rung")}</th><th>{t("home.th.name")}</th><th>{t("home.th.runs")}</th><th>{t("home.th.technique")}</th></tr></thead>
          <tbody>{rungs.map(([r, nameKey, w, tech, c]) => <tr key={r}><td><span className="swatch" style={{ background: c }} />{r}</td><td>{t(nameKey)}</td><td>{w}</td><td className="muted">{tech}</td></tr>)}</tbody></table>
      </Section>
      <Section title={t("home.section.walk")}>
        <ol className="list-decimal ml-5 space-y-1 text-sm">
          <li><Link href="/spectrum" className="underline">{t("nav.spectrum")}</Link> — {t("home.walk.spectrum")}</li>
          <li><Link href="/guardrail" className="underline">{t("nav.guardrail")}</Link> — {t("home.walk.guardrail")} {fmtPct(P.regex_only?.per_label?.PER?.f1 ?? 0)}.</li>
          <li><Link href="/router" className="underline">{t("nav.router")}</Link> — {t("home.walk.router")}</li>
          <li><Link href="/batch" className="underline">{t("nav.batch")}</Link> — {t("home.walk.batch")}</li>
          <li><Link href="/underwrite" className="underline">{t("nav.underwrite")}</Link> — {t("home.walk.underwrite")}</li>
        </ol>
      </Section>
    </div>
  );
}
