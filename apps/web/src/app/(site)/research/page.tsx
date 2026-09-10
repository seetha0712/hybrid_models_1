// Research write-up for the Model Spectrum experiment. Static server component. Figures and tables
// are derived from the committed measurement JSON in src/data so the page cannot drift from results.
// Sample rows are genuine records loaded from the public datasets, shown for inspection.
import Link from "next/link";
import { getLocale } from "@/lib/i18n-server";
import B from "@/data/phase1_benchmark.json";
import R from "@/data/phase2_router_eval.json";
import P from "@/data/phase3_pii_eval.json";
import Bv from "@/data/phase2_batch_view.json";

export const metadata = {
  title: "The Model Spectrum: measuring the price of intelligence on one bank task",
  description:
    "An experiment by Seetha measuring accuracy, latency and cost across an owned model trained from scratch, a LoRA-tuned small model, open weights and three frontier tiers on a real transaction-classification workload, with a routing gateway and a PII guardrail.",
};

const SEETHA_URL = "https://seetha-model-spectrum.vercel.app";
const GATEWAY = "https://seetha0712--model-spectrum-web.modal.run";
const log10 = (x: number) => Math.log(x) / Math.LN10;
const fmtInt = (n: number) => n.toLocaleString("en-US");
const pct = (x: number) => (x * 100).toFixed(2) + "%";

type Model = {
  id: string; label: string; tier: string; technique?: string | null;
  params?: number | null; accuracy?: number | null; accuracy_unseen?: number | null;
  macro_f1?: number | null; cost_per_1m_usd?: number | null;
  latency_ms?: { p50?: number | null; p95?: number | null } | null;
};
const models = (B.models as Model[]).filter((m) => typeof m.cost_per_1m_usd === "number");
const byId = (id: string) => models.find((m) => m.id === id);
const tiny = byId("tiny")!, lora = byId("lora")!, haiku = byId("haiku")!, sonnet = byId("sonnet")!, opus = byId("opus")!;
const costRatio = (a: Model, b: Model) => Math.round((a.cost_per_1m_usd as number) / (b.cost_per_1m_usd as number));

// ---------- presentational helpers ----------
function Fig({ n, caption, children }: { n: number; caption: string; children: React.ReactNode }) {
  return (
    <figure style={{ margin: "1.6rem 0", padding: "0.9rem 1rem", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-1)" }}>
      {children}
      <figcaption style={{ marginTop: "0.7rem", fontSize: "0.82rem", color: "var(--text-muted)", fontFamily: "system-ui, sans-serif" }}>
        <strong style={{ color: "var(--text-secondary)" }}>Figure {n}.</strong> {caption}
      </figcaption>
    </figure>
  );
}
function H({ n, id, children }: { n: string; id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} style={{ fontSize: "1.18rem", fontWeight: 700, marginTop: "2.2rem", marginBottom: "0.6rem", scrollMarginTop: "5rem" }}>
      <span style={{ color: "var(--text-muted)", fontWeight: 600, marginRight: "0.5rem" }}>{n}</span>{children}
    </h2>
  );
}
const sysFont = { fontFamily: "system-ui, sans-serif" } as const;
const capNote = { fontSize: "0.78rem", color: "var(--text-muted)", ...sysFont, marginTop: "0.4rem" } as const;

// ---------- Figure 1: the spectrum ladder ----------
const LADDER = [
  { tier: "R1", model: "Claude Opus 5 / Sonnet 5", technique: "prompting and in-context learning", trained: "no", cost: opus.cost_per_1m_usd as number, color: "var(--series-6)" },
  { tier: "R2", model: "Claude Haiku 4.5", technique: "prompting with a cached few-shot prompt", trained: "no", cost: haiku.cost_per_1m_usd as number, color: "var(--series-5)" },
  { tier: "R3", model: "Gateway: router, cascade, cache, batch", technique: "linear probe on frozen embeddings", trained: "head only", cost: NaN, color: "var(--series-4)" },
  { tier: "R4", model: "Qwen3-1.7B open weights", technique: "prompting only, on a private GPU", trained: "no", cost: NaN, color: "var(--series-3)" },
  { tier: "R5", model: "Qwen3-0.6B with LoRA", technique: "parameter-efficient fine-tuning", trained: "adapters", cost: lora.cost_per_1m_usd as number, color: "var(--series-2)" },
  { tier: "R6", model: "1.7M-parameter decoder from scratch", technique: "trained from random initialisation", trained: "all weights", cost: tiny.cost_per_1m_usd as number, color: "var(--series-1)" },
];
function LadderFigure() {
  const lo = log10(0.05), hi = log10(5000);
  const barW = (c: number) => Math.max(2, ((log10(c) - lo) / (hi - lo)) * 100);
  return (
    <div style={sysFont}>
      {LADDER.map((r) => (
        <div key={r.tier} style={{ display: "grid", gridTemplateColumns: "2.4rem minmax(0,12rem) 1fr", gap: "0.6rem", alignItems: "center", padding: "0.4rem 0", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 700, color: r.color }}>{r.tier}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: "0.86rem", fontWeight: 600 }}>{r.model}</span>
            <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)" }}>{r.technique} ({r.trained})</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ height: 12, width: `${Number.isNaN(r.cost) ? 0 : barW(r.cost)}%`, background: r.color, borderRadius: 3, opacity: 0.85 }} />
            <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              {Number.isNaN(r.cost) ? "architecture layer" : `$${(r.cost as number).toLocaleString("en-US", { maximumFractionDigits: 2 })} / 1M`}
            </span>
          </span>
        </div>
      ))}
      <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.2rem", paddingTop: "0.4rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
        Cost bars use a logarithmic scale. The lowest and highest rungs differ by more than four orders of magnitude on the same task.
      </div>
    </div>
  );
}

// ---------- Figure 2: request lifecycle ----------
function LifecycleFigure() {
  const steps = [
    { t: "Request", s: "raw text arrives" },
    { t: "PII guard", s: "redact before anything else" },
    { t: "Intent router", s: "pick the workload class" },
    { t: "Tier cascade", s: "cheapest adequate model first" },
    { t: "Escalate", s: "only if confidence is low" },
    { t: "De-redact", s: "restore entities in the answer" },
  ];
  const w = 960, h = 150, n = steps.length, gap = 14;
  const bw = (w - gap * (n - 1)) / n, bh = 66, y = 34;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Request lifecycle through the gateway" style={sysFont}>
      {steps.map((st, i) => {
        const x = i * (bw + gap);
        return (
          <g key={st.t}>
            <rect x={x} y={y} width={bw} height={bh} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
            <text x={x + bw / 2} y={y + 26} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text-primary)">{st.t}</text>
            <text x={x + bw / 2} y={y + 46} textAnchor="middle" fontSize="11.5" fill="var(--text-muted)">{st.s}</text>
            {i < n - 1 && <path d={`M ${x + bw + 2} ${y + bh / 2} l ${gap - 4} 0`} stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#arrow)" />}
          </g>
        );
      })}
      <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted)" /></marker></defs>
      <text x={bw + gap + bw / 2} y={20} textAnchor="middle" fontSize="11" fill="var(--series-1)">no raw personal data leaves the perimeter</text>
      <text x={w / 2} y={h - 6} textAnchor="middle" fontSize="11" fill="var(--text-muted)">Every hop records tokens, latency and cost, so each answer arrives with a line-item receipt.</text>
    </svg>
  );
}

// ---------- Figure 3: accuracy vs cost ----------
function ScatterFigure() {
  const w = 760, h = 420, M = { l: 58, r: 20, t: 24, b: 54 };
  const pw = w - M.l - M.r, ph = h - M.t - M.b;
  const xlo = -1.35, xhi = 3.75, ylo = 0.74, yhi = 1.0;
  const X = (c: number) => M.l + ((log10(c) - xlo) / (xhi - xlo)) * pw;
  const Y = (a: number) => M.t + ((yhi - a) / (yhi - ylo)) * ph;
  const xticks = [0.05, 0.5, 5, 50, 500, 5000];
  const yticks = [0.75, 0.8, 0.85, 0.9, 0.95, 1.0];
  const pts = [
    { m: tiny, c: "var(--series-1)" }, { m: lora, c: "var(--series-2)" },
    { m: haiku, c: "var(--series-5)" }, { m: sonnet, c: "var(--series-3)" }, { m: opus, c: "var(--series-6)" },
  ];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Accuracy versus cost per one million classifications" style={sysFont}>
      {yticks.map((t) => (
        <g key={t}>
          <line x1={M.l} y1={Y(t)} x2={w - M.r} y2={Y(t)} stroke="var(--grid)" />
          <text x={M.l - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{Math.round(t * 100)}%</text>
        </g>
      ))}
      {xticks.map((t) => (
        <g key={t}>
          <line x1={X(t)} y1={M.t} x2={X(t)} y2={h - M.b} stroke="var(--grid)" />
          <text x={X(t)} y={h - M.b + 18} textAnchor="middle" fontSize="11" fill="var(--text-muted)">${t < 1 ? t : fmtInt(t)}</text>
        </g>
      ))}
      <text x={M.l + pw / 2} y={h - 8} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">cost per 1,000,000 classifications (log scale, USD)</text>
      <text transform={`translate(14 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">accuracy</text>
      {pts.map(({ m, c }) => typeof m.accuracy_unseen === "number" ? (
        <line key={"c" + m.id} x1={X(m.cost_per_1m_usd as number)} y1={Y(m.accuracy as number)} x2={X(m.cost_per_1m_usd as number)} y2={Y(m.accuracy_unseen as number)} stroke={c} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
      ) : null)}
      {pts.map(({ m, c }) => (
        <g key={m.id}>
          {typeof m.accuracy_unseen === "number" && <circle cx={X(m.cost_per_1m_usd as number)} cy={Y(m.accuracy_unseen as number)} r={5} fill="var(--surface-1)" stroke={c} strokeWidth={2} />}
          <circle cx={X(m.cost_per_1m_usd as number)} cy={Y(m.accuracy as number)} r={7} fill={c} />
          <text x={X(m.cost_per_1m_usd as number) + (m.id === "tiny" ? 12 : 0)} y={Y(m.accuracy as number) - 12} textAnchor={m.id === "tiny" ? "start" : "middle"} fontSize="11.5" fontWeight="700" fill="var(--text-primary)">{m.label}</text>
        </g>
      ))}
      <g transform={`translate(${w - M.r - 190} ${M.t + 6})`} fontSize="11" fill="var(--text-secondary)">
        <circle cx={6} cy={0} r={6} fill="var(--text-muted)" /><text x={18} y={4}>filled: seen test split</text>
        <circle cx={6} cy={18} r={5} fill="var(--surface-1)" stroke="var(--text-muted)" strokeWidth={2} /><text x={18} y={22}>hollow: unseen merchants</text>
      </g>
    </svg>
  );
}

// ---------- Figure 4: PII guardrail ----------
function PiiFigure() {
  const reg = P.regex_only, mod = P.model_union_regex;
  const rows = [{ k: "precision", a: reg.precision, b: mod.precision }, { k: "recall", a: reg.recall, b: mod.recall }, { k: "F1", a: reg.f1, b: mod.f1 }];
  const w = 640, rowH = 46, top = 10, barMax = 360, x0 = 150;
  return (
    <svg viewBox={`0 0 ${w} ${top + rows.length * rowH + 26}`} width="100%" role="img" aria-label="PII detection, regex baseline versus learned model" style={sysFont}>
      {rows.map((r, i) => {
        const y = top + i * rowH;
        return (
          <g key={r.k}>
            <text x={0} y={y + 20} fontSize="12.5" fontWeight="600" fill="var(--text-secondary)">{r.k}</text>
            <rect x={x0} y={y + 4} width={r.a * barMax} height={13} rx={3} fill="var(--series-4)" />
            <text x={x0 + r.a * barMax + 6} y={y + 15} fontSize="11" fill="var(--text-muted)">{(r.a * 100).toFixed(1)}% regex only</text>
            <rect x={x0} y={y + 20} width={r.b * barMax} height={13} rx={3} fill="var(--series-1)" />
            <text x={x0 + r.b * barMax + 6} y={y + 31} fontSize="11" fill="var(--text-muted)">{(r.b * 100).toFixed(1)}% learned plus regex</text>
          </g>
        );
      })}
      <text x={x0} y={top + rows.length * rowH + 18} fontSize="11" fill="var(--text-muted)">Entity-level scores on {fmtInt(P.n_test)} held-out documents. Regex alone recovers almost nothing beyond email addresses.</text>
    </svg>
  );
}

// ---------- Figure 5: re-underwriting schematic ----------
function UnderwriteFigure() {
  const w = 720, h = 300, M = { l: 46, r: 18, t: 18, b: 40 };
  const pw = w - M.l - M.r, ph = h - M.t - M.b;
  const X = (u: number) => M.l + u * pw;
  const Y = (v: number) => M.t + (1 - v) * ph;
  const flagship = (u: number) => 0.30 + u * 0.95;
  const small = (u: number) => 0.02 + u * 0.95;
  const self = (u: number) => Math.max(0.02 + u * 0.95, 0.62);
  const line = (f: (u: number) => number) => Array.from({ length: 41 }, (_, i) => `${X(i / 40)},${Y(f(i / 40))}`).join(" ");
  const xc = 0.63;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Monthly cost by volume for three ways to run one workload" style={sysFont}>
      <line x1={M.l} y1={M.t} x2={M.l} y2={h - M.b} stroke="var(--border)" />
      <line x1={M.l} y1={h - M.b} x2={w - M.r} y2={h - M.b} stroke="var(--border)" />
      <text x={M.l + pw / 2} y={h - 8} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">monthly volume (log)</text>
      <text transform={`translate(12 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">monthly cost (log)</text>
      <rect x={X(xc)} y={M.t} width={X(1) - X(xc)} height={ph} fill="var(--series-1)" opacity={0.06} />
      <polyline points={line(flagship)} fill="none" stroke="var(--series-6)" strokeWidth={2.5} />
      <polyline points={line(small)} fill="none" stroke="var(--series-3)" strokeWidth={2.5} />
      <polyline points={line(self)} fill="none" stroke="var(--series-1)" strokeWidth={2.5} />
      <circle cx={X(xc)} cy={Y(self(xc))} r={4.5} fill="var(--series-1)" />
      <text x={X(xc)} y={Y(self(xc)) - 10} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">crossover</text>
      <path d={`M ${X(xc)} ${h - M.b - 6} l 60 0`} stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#arrow2)" />
      <text x={X(xc) + 30} y={h - M.b - 12} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">moves right as frontier prices fall</text>
      <g fontSize="11.5" fill="var(--text-secondary)">
        <text x={w - M.r} y={Y(flagship(1)) + 4} textAnchor="end">flagship API</text>
        <text x={w - M.r} y={Y(small(1)) + 4} textAnchor="end">small tier API</text>
        <text x={M.l + 8} y={Y(self(0)) - 8}>self-hosted SLM</text>
      </g>
      <defs><marker id="arrow2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted)" /></marker></defs>
    </svg>
  );
}

// ---------- build stages ----------
const STAGES = [
  { n: "0", t: "Environment", does: "Create an isolated Python environment, install the package, authenticate to the compute provider and register the API secrets.", makes: "a reproducible toolchain" },
  { n: "1", t: "Data and baselines", does: "Load the transaction and Banking77 corpora to a persistent volume, train the 1.7M-parameter decoder from random initialisation on a T4 GPU, run the three frontier tiers through in-context learning, and fine-tune the LoRA adapter.", makes: "phase1_benchmark.json" },
  { n: "2", t: "Router", does: "Assemble the eight-class routing corpus from the public sources listed below and train a calibrated linear probe on frozen sentence embeddings.", makes: "phase2_router_eval.json" },
  { n: "3", t: "Privacy guardrail", does: "Load the ai4privacy PII spans and fine-tune a DistilBERT token classifier, combined with high-precision regular expressions.", makes: "phase3_pii_eval.json" },
  { n: "4", t: "Gateway", does: "Deploy the classification, routing and privacy endpoints plus the open-weights tier to serverless GPUs that scale to zero, then smoke-test every endpoint for schema, latency and cost.", makes: "a live, keyed API" },
  { n: "5", t: "Interface", does: "Build the web interface, deploy it to a global edge network, and place the entire site behind a password gate.", makes: "this site" },
];
function StagesBlock() {
  return (
    <div style={sysFont}>
      {STAGES.map((s, i) => (
        <div key={s.n} style={{ display: "grid", gridTemplateColumns: "2.2rem 1fr", gap: "0.8rem", padding: "0.7rem 0", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
          <span style={{ display: "flex", alignItems: "flex-start" }}>
            <span style={{ width: "1.9rem", height: "1.9rem", borderRadius: "50%", background: "var(--surface-2)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--series-1)" }}>{s.n}</span>
          </span>
          <span>
            <span style={{ fontWeight: 700 }}>{s.t}</span>
            <span style={{ display: "block", fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.5, marginTop: "0.15rem" }}>{s.does}</span>
            <span style={{ display: "block", fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>produces: <span className="mono">{s.makes}</span></span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- dataset sample rows (genuine records loaded from the public datasets) ----------
const TXN_SAMPLES = [
  ["[debit] NORTHWESTERN MUTUAL EFT PYMT PPD ID: 9901629141", "Insurance"],
  ["[debit] MTG PMT PENFED CU", "Mortgage"],
  ["[debit] BETMGM 147 PARK BLVD UNION CITY 94587 CA USA", "Entertainment"],
  ["[debit] REPUBLIC SERVICES 222 MISSION CT CHICAGO 60601 IL USA", "Utilities"],
  ["[debit] PUBLIX 7860 UNIVERSITY LN OAKLAND 94601 CA USA", "Groceries"],
];
const B77_SAMPLES = [
  ["I am still waiting on my card?", "card_arrival"],
  ["My card has been found. Is there any way to put it back into the app?", "card_linking"],
  ["What is my money worth in other countries?", "exchange_rate"],
  ["I was charged extra for the exchange rate on my payment.", "card_payment_wrong_exchange_rate"],
  ["Why is there an extra fee on my statement?", "extra_charge_on_statement"],
];
const PII_SAMPLES = [
  ["- Meeting at 2:33 PM / N23 - Meeting at 11:29pm / wennmann27 - Meeting at 4:45 PM", "- Meeting at [TIME] / [USERNAME] - Meeting at [TIME] / [USERNAME] - Meeting at [TIME]"],
  ["Hi, Ana Ruiz here, card 4111 1111 1111 1111, mail ana@example.com", "Hi, [PER_1] [PER_2] here, card [CARD_1], mail [EMAIL_1]"],
];
const ROUTER_SAMPLES = [
  ["complex_analysis", "virattt/financial-qa-10K", "What area did NVIDIA initially focus on before expanding to other computationally intensive fields?"],
  ["summarise / doc_classify", "EDGAR-CORPUS-Financial-Summarization", "FINANCIAL STATEMENTS AND SUPPLEMENTARY DATA INDEX TO CONSOLIDATED FINANCIAL STATEMENTS ..."],
  ["code", "code-search-net (python)", "Estimate discontinuity in basis of low resolution image segmentation."],
];
function SampleTable({ head, rows, mono }: { head: string[]; rows: string[][]; mono?: boolean }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data" style={{ ...sysFont, fontSize: "0.82rem", width: "100%" }}>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={mono && j === 0 ? "mono" : undefined} style={{ color: j === 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ResearchPage() {
  const ja = (await getLocale()) === "ja";
  const serif = { fontFamily: 'Georgia, "Times New Roman", Cambria, serif' } as const;
  const p = { fontSize: "1.02rem", lineHeight: 1.72, margin: "0.9rem 0", color: "var(--text-primary)", textAlign: "justify" as const };
  return (
    <article style={{ maxWidth: 860, margin: "0 auto", ...serif }}>
      {/* Title block */}
      <header style={{ borderBottom: "2px solid var(--border)", paddingBottom: "1rem" }}>
        <p style={{ ...sysFont, fontSize: "0.8rem", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--series-1)", fontWeight: 700, margin: 0 }}>
          {ja ? "Seetha による実験" : "Experiment by Seetha"}
        </p>
        <h1 style={{ fontSize: "1.7rem", lineHeight: 1.22, fontWeight: 700, margin: "0.5rem 0 0.4rem" }}>
          {ja ? "モデル・スペクトラム：単一の銀行タスクで知能の価格を測る" : "The Model Spectrum: measuring the price of intelligence on a single bank task"}
        </h1>
        <p style={{ fontSize: "1.0rem", color: "var(--text-secondary)", margin: 0 }}>
          {ja ? "ゼロから学習した自社モデル、LoRAでチューニングした小型言語モデル、オープンウェイト、そして3つのフロンティア階層を、精度・レイテンシ・コストで比較し、プライバシーガードレール付きの単一ルーティングゲートウェイの背後に組み込みます。" : "An owned model trained from scratch, a LoRA-tuned small language model, open weights and three frontier tiers, compared on accuracy, latency and cost, then wired behind one routing gateway with a privacy guardrail."}
        </p>
        <p style={{ ...sysFont, fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.5rem", marginBottom: 0 }}>{ja ? "2026年9月 — 再現可能なビルド — すべての図はコミット済みの計測ファイルから生成" : "September 2026 - reproducible build - every figure is generated from committed measurement files"}</p>
      </header>

      {/* Plain-language lede */}
      <section style={{ margin: "1.2rem 0", padding: "0.9rem 1rem", borderLeft: "3px solid var(--series-1)", background: "var(--surface-1)" }}>
        <p style={{ ...p, margin: 0, fontSize: "1.0rem" }}>
          {ja ? "要点：銀行は膨大な数の取引明細をいくつかの支出カテゴリに分類する必要があります。本実験はその単一タスクを、ゼロから作った小型モデルから最大級の商用モデルまで6通りの方法で実行し、それぞれの精度・速度・コストを測定します。結論は、慣れたデータでは小型モデルが最も精度が高く最も安価であり、大型モデルは未見の入力でのみ優位であること、そして小さなルーティング層とプライバシーフィルタを加えれば、システムはほぼ常に安価な選択肢を使い、まれな難問にのみ高価な選択肢を残せる、というものです。" : "In brief: a bank has to sort huge numbers of transaction descriptions into a few spending categories. This experiment runs that one task through six ways of doing it, from a tiny model built from scratch up to the largest commercial models, and measures how accurate, how fast and how expensive each one is. The finding is that the tiny model is the most accurate and the cheapest on familiar data, the large models are only better on inputs never seen before, and a small routing layer plus a privacy filter lets a system use the cheap option almost always while keeping the expensive option for the rare hard case."}
        </p>
      </section>

      {/* Abstract */}
      <section style={{ margin: "1.2rem 0", padding: "1rem 1.1rem", background: "var(--surface-2)", borderRadius: 10 }}>
        <h2 style={{ ...sysFont, fontSize: "0.8rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 0.4rem" }}>{ja ? "要旨" : "Abstract"}</h2>
        <p style={{ ...p, margin: 0, fontSize: "0.98rem" }}>
          {ja ? <>大規模言語モデルのインターフェースは、狭く高処理量の分類タスクをフロンティアモデルで解くことを容易にし、同時に数桁の過払いも容易にします。本実験は1つの具体的なワークロード、すなわち銀行明細の取引記述を{B.dataset.n_labels}クラスに分類するタスクを取り上げ、ランダム初期化から学習した{fmtInt(tiny.params as number)}パラメータのデコーダから Claude Opus 5 まで、選択肢の全スペクトラムで実行します。分布内のテスト分割では、自社モデルは{pct(tiny.accuracy as number)}の精度に達し、ここで測定したどのフロンティア階層よりも高く、100万件分類あたりのコストは約{fmtInt(costRatio(sonnet, tiny))}分の1、レイテンシは約{Math.round((sonnet.latency_ms!.p50 as number) / (tiny.latency_ms!.p50 as number))}分の1です。限界は学習時に一度も見ていない加盟店で現れ、自社モデルは{pct(tiny.accuracy_unseen as number)}まで低下する一方、フロンティア階層は{pct(sonnet.accuracy_unseen as number)}以上を維持します。小さな意図ルーター（精度{pct(R.accuracy)}）と確信度起動のカスケードにより、一般的なケースでは安価な経路を保ち、難しい末端にのみフロンティア呼び出しを予約します。またファインチューニング済みガードレールは、個人データの項目レベル検出を正規表現のみの再現率{(P.regex_only.recall * 100).toFixed(1)}%から{(P.model_union_regex.recall * 100).toFixed(1)}%へ引き上げます。これはそもそもテキストを第三者モデルに送るための前提条件です。以下のすべての図は本リポジトリのコードで生成され、末尾にリンクしたデモでライブに再現されます。</> : <>Large language model interfaces make it easy to solve a narrow, high-volume classification task with a frontier model, and easy to overpay for it by several orders of magnitude. This experiment takes one concrete workload, categorising bank-statement transaction descriptions into {B.dataset.n_labels} classes, and runs it through the full spectrum of options, from a {fmtInt(tiny.params as number)}-parameter decoder trained from random initialisation up to Claude Opus 5. On the in-distribution test split the owned model reaches {pct(tiny.accuracy as number)} accuracy, higher than every frontier tier measured here, at roughly {fmtInt(costRatio(sonnet, tiny))} times lower cost per million classifications and about {Math.round((sonnet.latency_ms!.p50 as number) / (tiny.latency_ms!.p50 as number))} times lower latency. The limit appears on merchants never seen in training, where the owned model falls to {pct(tiny.accuracy_unseen as number)} while the frontier tiers hold above {pct(sonnet.accuracy_unseen as number)}. A small intent router ({pct(R.accuracy)} accuracy) with a confidence-triggered cascade keeps the cheap path for the common case and reserves frontier calls for the hard tail, and a fine-tuned guardrail lifts entity-level detection of personal data from {(P.regex_only.recall * 100).toFixed(1)} percent recall with regular expressions to {(P.model_union_regex.recall * 100).toFixed(1)} percent, which is the precondition for sending text to a third-party model at all. Every figure below is produced by the code in this repository and reproduced live in the demo linked at the end.</>}
        </p>
      </section>

      <H n="1" id="s1">{ja ? "なぜ1つのタスクをすべての階層で実行するのか" : "Why run one task through every tier"}</H>
      <p style={p}>
        {ja ? "取引分類は、内製か購入かを検証する良いストレステストです。狭く、反復的で、規模が巨大だからです。リテール銀行は毎月、数億件のカード・口座明細を固定の支出カテゴリに分類します。タスクは年ごとにほとんど変わらず、ラベル集合は小さく、精度の基準もよく理解されています。この組み合わせこそ、汎用フロンティアモデルが最も非効率になる領域です。はるかに小さいモデルで十分答えられる問いに対し、フラッグシップのトークン価格を何度も支払うことになるからです。" : "Transaction categorisation is a good stress test for build-versus-buy because it is narrow, repetitive and enormous. A retail bank classifies hundreds of millions of card and account narrations a month into a fixed set of spending categories. The task barely changes from year to year, the label set is small and the accuracy bar is well understood. That combination is exactly where a general-purpose frontier model is least efficient: flagship token prices are paid again and again to answer a question that a far smaller model already answers well."}
      </p>
      <p style={p}>
        {ja ? "最初にフロンティアのインターフェースに手を伸ばすのは依然として合理的です。学習データのパイプラインもGPUも評価環境も不要で、初日から動くからです。ここでの問いは、フロンティアモデルがそのタスクをこなせるか否かではありません。明らかにこなせます。問いは、処理量が現実的になったときにそのタスクが実際にいくらかかるのか、そしてそのコストのうちどれだけが精度を犠牲にせず回避できるのか、です。それに答えるため、本実験はあらかじめ立場を選ばず、同一データで全階層を測定します。" : "Reaching for a frontier interface is still rational at the start, because it needs no training data pipeline, no GPUs and no evaluation harness, and it works on day one. The question here is not whether the frontier model can do the task. It plainly can. The question is what the task actually costs once volume is real, and how much of that cost is avoidable without giving up accuracy. To answer it, the experiment measures the whole ladder on identical data rather than choosing a side in advance."}
      </p>

      <H n="2" id="s2">{ja ? "スペクトラム" : "The spectrum"}</H>
      <p style={p}>
        {ja ? "選択肢は、上端のマネージドなフロンティアインターフェースから下端の手作りモデルまで、階層として整理されます。上位の階層はコール単価が高く、準備は少なくて済みます。下位の階層はコール単価がはるかに安く、データ・学習・運用を要します。中間の階層はモデルではなくアーキテクチャです。ルーター、カスケード、プロンプトキャッシュ、バッチ送信であり、いずれも存在するモデルを変えずに経済性を変えます。" : "The options are organised as rungs, from managed frontier interfaces at the top to a hand-built model at the bottom. Higher rungs cost more per call and require less setup. Lower rungs cost far less per call and require data, training and operations. The middle rungs are architecture rather than models: a router, a cascade, prompt caching and batch submission, all of which change the economics without changing which models exist."}
      </p>
      <Fig n={1} caption={ja ? "本ワークロードにおけるスペクトラムの各階層。コストバーは対数軸で100万件分類あたりの実測米ドルを示します。R3とR4は単一の価格付きモデルではなく、アーキテクチャおよびオープンウェイトの層です。" : "The rungs of the spectrum for this workload. Cost bars show measured US dollars per one million classifications on a logarithmic axis; R3 and R4 are architecture and open-weight layers rather than a single priced model."}>
        <LadderFigure />
      </Fig>

      <H n="3" id="s3">{ja ? "ゲートウェイ" : "The gateway"}</H>
      <p style={p}>
        {ja ? "スペクトラムは、リクエストごとにどの階層を使うかを何かが判断して初めて役立ちます。それがゲートウェイの役割です。すべてのリクエストに固定の手順を適用します。まず個人データをマスキングし、以降の処理が生の識別子を見ないようにします。次にリクエストをワークロード種別に分類し、試すべき階層の順序付きリストを参照します。最も安価で十分な階層をまず呼び出し、その階層の自己申告の確信度を確認し、確信度が低いか呼び出しが失敗した場合にのみ1段階エスカレーションします。最後に回答内のマスキング項目を復元し、トークン単位のコスト明細とともに結果を返します。" : "A spectrum is only useful if something decides, per request, which rung to use. That is the job of the gateway. It applies a fixed sequence to every request. First it redacts personal data, so that whatever happens next never sees raw identifiers. Then it classifies the request into a workload type and looks up an ordered list of tiers to try. It calls the cheapest adequate tier first, inspects that tier self-reported confidence, and escalates one step only when confidence is low or the call fails. Finally it restores the redacted entities in the answer and returns the result together with a token-level cost receipt."}
      </p>
      <Fig n={2} caption={ja ? "単一リクエストの経路。プライバシーガードはいかなるモデル呼び出しよりも前に動作し、ルーターがワークロード種別を選び、カスケードは安価な階層が確信を持てない場合にのみ追加コストを費やします。" : "The path of a single request. The privacy guard runs before any model call, the router selects the workload class, and the cascade spends more only when the cheap tier is unsure."}>
        <LifecycleFigure />
      </Fig>
      <p style={p}>
        {ja ? "2つの設計判断が価値の大半を担います。カスケードにより、リクエストの限界コストは一律のフロンティア料金ではなく、その難易度に連動します。ガードレールにより、唯一の第三者コンポーネントであるフロンティア階層はマスキング済みテキストのみを受け取ります。これは規制対象データで利用するための前提条件です。" : "Two design choices carry most of the value. The cascade means the marginal cost of a request tracks its difficulty rather than a flat frontier rate. The guardrail means the frontier tiers, which are the only third-party components, receive redacted text and nothing else, which is a precondition for using them on regulated data."}
      </p>

      <H n="4" id="s4">{ja ? "段階ごとの構築方法" : "How it was built, stage by stage"}</H>
      <p style={p}>
        {ja ? "システムは単一の再現可能なパイプラインで生成されます。各段階はマネージドな計算資源で動作し、結果を共有ボリュームに書き込み、冪等です。そのため失敗した段階は、前の段階を繰り返さずに修復・再実行できます。段階は以下のとおりです。" : "The system is produced by a single reproducible pipeline. Each stage runs on managed compute, writes its result to a shared volume, and is idempotent, so a failed step can be repaired and re-run without repeating the ones before it. The stages are as follows."}
      </p>
      <Fig n={3} caption={ja ? "構築パイプライン。学習と評価はサーバーレスGPUで行い、結果はJSONとしてコミットされ、ゲートウェイが配信して本サイトで描画されます。" : "The build pipeline. Training and evaluation happen on serverless GPUs; the results are committed as JSON and then served by the gateway and rendered on this site."}>
        <StagesBlock />
      </Fig>

      <H n="5" id="s5">{ja ? "データセット" : "Datasets"}</H>
      <p style={p}>
        {ja ? <>すべてのモデルは同一の公開データで評価します。主要なワークロードは、{fmtInt(B.dataset.n)}件の銀行明細形式の取引記述を{B.dataset.n_labels}カテゴリに分類したものです。2つのテストセットをホールドアウトします。標準分割と、識別子が学習に一切現れない加盟店からなるより難しい分割で、後者は各階層が記憶ではなく真に新規の入力にどう対処するかを測ります。表1はすべてのコーパス、その出所、役割、適用した正確な変換を列挙します。2つのソースは完全に自然発生ではないものとして扱います。取引セットは顧客記録からではなく実際の明細書フォーマットに合わせて生成され、ルーターの1クラスはテンプレートによるものです。</> : <>All models are evaluated on the same public data. The primary workload is a set of {fmtInt(B.dataset.n)} bank-statement-format transaction descriptions across {B.dataset.n_labels} categories. Two test sets are held out: a standard split, and a harder split of merchants whose identifiers never appear in training, which measures how each rung copes with genuinely novel inputs rather than memorised ones. Table 1 lists every corpus, its source, its role and the exact transformations applied. Two sources are marked as not fully organic and are treated accordingly: the transaction set is generated to match real statement formats rather than taken from customer records, and one router class is templated.</>}
      </p>
      <div style={{ overflowX: "auto", margin: "1.1rem 0" }}>
        <table className="data" style={{ ...sysFont, fontSize: "0.82rem" }}>
          <thead><tr><th>Dataset</th><th>Source (Hugging Face)</th><th>Role</th><th>Size used</th><th>Transformation applied</th></tr></thead>
          <tbody>
            <tr>
              <td>US bank transactions</td>
              <td className="mono">DoDataThings/us-bank-transaction-categories-v2</td>
              <td>Primary task: classify narrations into {B.dataset.n_labels} spending categories</td>
              <td className="mono">{fmtInt(B.dataset.n)} rows, {B.dataset.n_labels} classes</td>
              <td>Detected the narration and category columns automatically; lowercased labels and replaced spaces with underscores; carved a 12 percent stratified test split, then moved 15 percent of merchants wholesale into a separate unseen-merchant split so none of their narrations appear in training.</td>
            </tr>
            <tr>
              <td>Banking77</td>
              <td className="mono">legacy-datasets/banking77</td>
              <td>Real-data anchor: 77 fine-grained banking intents written by genuine customers</td>
              <td className="mono">13,083 rows, 77 classes</td>
              <td>Used the parquet mirror of PolyAI/banking77 because the original ships a loader script that current tooling refuses; mapped integer class ids to their names and normalised them; kept the official train and test split.</td>
            </tr>
            <tr>
              <td>ai4privacy PII</td>
              <td className="mono">ai4privacy/pii-masking-300k</td>
              <td>Guardrail training: human-validated spans of personal data for token classification</td>
              <td className="mono">{fmtInt(P.n_train + P.n_test)} rows ({fmtInt(P.n_train)} train / {fmtInt(P.n_test)} test)</td>
              <td>Filtered to English; collapsed the fine-grained labels into eight coarse types (person, account, card, phone, email, address, date of birth, other); converted character spans into BIO token tags aligned to the tokenizer offsets.</td>
            </tr>
          </tbody>
        </table>
        <p style={capNote}>{ja ? "表1. 学習と評価に用いたすべてのコーパスと、その出所および適用した変換。" : "Table 1. Every corpus used for training and evaluation, with its source and the transformations applied."}</p>
      </div>
      <p style={p}>
        {ja ? <>ルーターは、実在する公開ソースからワークロード種別ごとに1つずつ組み立てた別コーパスで学習するため、分類器は合成プロンプトではなく本物の言い回しから学びます。各クラスは最大250例を提供します。表2はその構成を示します。いくつかのソースは再現性のために選んだparquetミラーであり、テンプレート化されているのはドラフト作成クラスのみで、これは隠さず明示しています。</> : <>The router is trained on a separate corpus assembled one workload class at a time from real public sources, so the classifier learns from genuine phrasing rather than synthetic prompts. Each class contributes up to 250 examples. Table 2 shows the composition. Several sources are parquet mirrors chosen for reproducibility, and only the drafting class is templated, which is flagged rather than hidden.</>}
      </p>
      <div style={{ overflowX: "auto", margin: "1.1rem 0" }}>
        <table className="data" style={{ ...sysFont, fontSize: "0.82rem" }}>
          <thead><tr><th>Router class</th><th>Source</th><th>How it becomes a request</th></tr></thead>
          <tbody>
            {[
              ["txn_categorise", "US bank transactions (from the volume)", "narration wrapped as a categorise-this-transaction instruction"],
              ["chat", "legacy-datasets/banking77", "genuine customer questions, used as written"],
              ["pii_redact", "ai4privacy/pii-masking-300k", "source text wrapped as a redact-or-mask instruction"],
              ["summarise", "kritsadaK/EDGAR-CORPUS-Financial-Summarization", "10-K excerpts wrapped as a summarise instruction"],
              ["doc_classify", "kritsadaK/EDGAR-CORPUS-Financial-Summarization", "different 10-K excerpts wrapped as a what-document-is-this question"],
              ["complex_analysis", "virattt/financial-qa-10K", "numeric reasoning questions over company filings"],
              ["code", "code-search-net/code_search_net (python)", "docstrings wrapped as a write-a-function request"],
              ["draft", "data/draft_templates.yaml", "templated, the only synthetic class, flagged as such"],
            ].map(([cls, src, how]) => (
              <tr key={cls}><td className="mono">{cls}</td><td style={{ color: "var(--text-secondary)" }}>{src}</td><td style={{ color: "var(--text-muted)" }}>{how}</td></tr>
            ))}
          </tbody>
        </table>
        <p style={capNote}>{ja ? <>表2. ルーターコーパス。{R.labels.length}クラスにわたる{fmtInt(R.n_train + R.n_test)}例を上記のソースから組み立て、学習{fmtInt(R.n_train)}件・テスト{fmtInt(R.n_test)}件に分割。</> : <>Table 2. The router corpus, {fmtInt(R.n_train + R.n_test)} examples across {R.labels.length} classes, assembled from the sources above and split into {fmtInt(R.n_train)} train and {fmtInt(R.n_test)} test.</>}</p>
      </div>

      <H n="6" id="s6">{ja ? "サンプル行" : "Sample rows"}</H>
      <p style={p}>
        {ja ? "以下の記録は公開データセットから読み込んだ実際の行であり、入力とラベルを鵜呑みにせず直接確認できるよう示しています。" : "The records below are genuine rows loaded from the public datasets, shown so the inputs and labels can be inspected directly rather than taken on trust."}
      </p>
      <div style={{ margin: "0.6rem 0 0.2rem" }}>
        <p style={{ ...sysFont, fontSize: "0.9rem", fontWeight: 700, margin: "0.8rem 0 0.3rem" }}>{ja ? "取引（明細から支出カテゴリへ）" : "Transactions (narration to spending category)"}</p>
        <SampleTable head={["Narration", "Category"]} rows={TXN_SAMPLES} mono />
        <p style={capNote}>{ja ? "角括弧の先頭マーカーはソースの書式の一部であり、そのまま保持しています。" : "The leading marker in brackets is part of the source formatting and is kept as-is."}</p>
      </div>
      <div style={{ margin: "0.6rem 0 0.2rem" }}>
        <p style={{ ...sysFont, fontSize: "0.9rem", fontWeight: 700, margin: "0.8rem 0 0.3rem" }}>{ja ? "Banking77（顧客の質問から意図へ）" : "Banking77 (customer question to intent)"}</p>
        <SampleTable head={["Question", "Intent (1 of 77)"]} rows={B77_SAMPLES} />
      </div>
      <div style={{ margin: "0.6rem 0 0.2rem" }}>
        <p style={{ ...sysFont, fontSize: "0.9rem", fontWeight: 700, margin: "0.8rem 0 0.3rem" }}>{ja ? "個人データ（マスキング前から後へ）" : "Personal data (before to after redaction)"}</p>
        <SampleTable head={["Original text", "After the guardrail"]} rows={PII_SAMPLES} mono />
        <p style={capNote}>{ja ? "1組目は ai4privacy の学習例、2組目はカードとメールを含むテスト文字列に対する稼働中ガードレールのライブ出力です。" : "The first pair is a training example from ai4privacy; the second is the live output of the deployed guardrail on the card-and-email test string."}</p>
      </div>
      <div style={{ margin: "0.6rem 0 0.2rem" }}>
        <p style={{ ...sysFont, fontSize: "0.9rem", fontWeight: 700, margin: "0.8rem 0 0.3rem" }}>{ja ? "ルーターコーパス（ソースデータセット3件からの実際の行）" : "Router corpus (a genuine row from three of the source datasets)"}</p>
        <SampleTable head={["Class", "Source", "Example row"]} rows={ROUTER_SAMPLES} mono />
      </div>

      <H n="7" id="s7">{ja ? "結果" : "Results"}</H>
      <p style={p}>
        {ja ? <>中心的な結果は、精度とコストの関係です。標準テスト分割では、自社モデルが最も精度が高く、かつ最も安価な選択肢であり、その差は大きく開いています。図4を左から右へ読むと、自社モデルからフロンティア階層へ移るにつれてコストは数千倍になり、この分布内データでは精度はむしろ悪化します。</> : <>The central result is the relationship between accuracy and cost. On the standard test split the owned model is both the most accurate and the least expensive option by a wide margin. Reading left to right in Figure 4, moving from the owned model to the frontier tiers multiplies cost by thousands while nudging accuracy in the wrong direction on this in-distribution data.</>}
      </p>
      <Fig n={4} caption={ja ? "100万件分類あたりコストに対する精度。塗りつぶしの点は標準テスト分割、白抜きの点は未知の加盟店分割です。自社モデルの破線の落ち込みこそがカスケードの根拠です。慣れた入力では無敵で、新規の入力で最も弱くなります。" : "Accuracy against cost per one million classifications. Filled points are the standard test split; hollow points are the unseen-merchant split. The dashed drop for the owned model is the whole argument for the cascade: it is unbeaten on familiar inputs and weakest on novel ones."}>
        <ScatterFigure />
      </Fig>
      <p style={p}>
        {ja ? <>白抜きの点が物語の後半を語ります。未知の加盟店では、自社モデルは{pct(tiny.accuracy as number)}から{pct(tiny.accuracy_unseen as number)}へ低下する一方、Sonnetは{pct(sonnet.accuracy_unseen as number)}を維持します。フロンティアモデルは見せられたことのない入力にも一般化しますが、小さな専門家モデルはそうではありません。これは専門家モデルを捨てる理由ではありません。ゲートウェイがエスカレーションする理由です。小さなモデルが大きく慣れた大多数をほぼ無償で処理し、高価な汎用モデルは、その価格に見合う少数のリクエストにのみ対価を払います。</> : <>The hollow points tell the second half of the story. On unseen merchants the owned model falls from {pct(tiny.accuracy as number)} to {pct(tiny.accuracy_unseen as number)}, while Sonnet holds {pct(sonnet.accuracy_unseen as number)}. A frontier model generalises to inputs it was never shown; a tiny specialist does not. This is not a reason to abandon the specialist. It is the reason the gateway escalates: the tiny model handles the large, familiar majority almost for free, and the expensive generalist is paid for only on the minority of requests where it earns its price.</>}
      </p>
      <p style={p}>
        {ja ? <>これを可能にするルーターは、{R.labels.length}のワークロード種別にわたり精度{pct(R.accuracy)}、マクロF1 {R.macro_f1.toFixed(3)}に達し、{fmtInt(R.n_train)}例で{R.train_seconds.toFixed(0)}秒で学習しました。較正も良好で、信頼性表では高確信度の予測はほぼ常に正しく、これによりゲートウェイは自信のあるルートを信頼し、不確かなルートを疑うことができます。</> : <>The router that makes this possible reaches {pct(R.accuracy)} accuracy and a macro F1 of {R.macro_f1.toFixed(3)} across {R.labels.length} workload classes, trained in {R.train_seconds.toFixed(0)} seconds on {fmtInt(R.n_train)} examples. It is also well calibrated: in the reliability table the high-confidence predictions are correct essentially all of the time, which is what lets the gateway trust a confident route and question an unsure one.</>}
      </p>
      <p style={p}>
        {ja ? <>ガードレールは設計全体の静かな前提条件です。通常最初に試される正規表現のみでは、メールアドレス程度しか捉えられず、項目レベルの再現率は{(P.regex_only.recall * 100).toFixed(1)}%にとどまります。同じ正規表現とファインチューニング済みモデルを組み合わせると、1文書あたり約{P.latency_ms.p50}ミリ秒で、再現率{(P.model_union_regex.recall * 100).toFixed(1)}%、適合率{(P.model_union_regex.precision * 100).toFixed(1)}%に達します。この向上がなければ、顧客テキストを第三者に送ることは正当化できません。あればこそ、外に出るのはマスキング済みテキストのみになります。</> : <>The guardrail is the quiet precondition for the whole design. Regular expressions alone, the usual first attempt, catch email addresses and little else, giving entity-level recall of {(P.regex_only.recall * 100).toFixed(1)} percent. The fine-tuned model combined with those same expressions reaches {(P.model_union_regex.recall * 100).toFixed(1)} percent recall at {(P.model_union_regex.precision * 100).toFixed(1)} percent precision, in about {P.latency_ms.p50} milliseconds per document. Without that lift, sending any customer text to a third party would be indefensible; with it, only redacted text ever leaves.</>}
      </p>
      <Fig n={5} caption={ja ? "ホールドアウト文書における個人データの項目レベル検出。学習済みモデルと正規表現の併用により、パターンマッチングでは見えない項目、特に氏名と住所を回収します。" : "Entity-level detection of personal data on held-out documents. A learned model plus regular expressions recovers the entities that pattern matching cannot see, notably names and addresses."}>
        <PiiFigure />
      </Fig>

      <div style={{ overflowX: "auto", margin: "1.4rem 0" }}>
        <table className="data" style={{ ...sysFont, fontSize: "0.86rem" }}>
          <thead><tr><th>Model</th><th>Technique</th><th>Params</th><th>Accuracy</th><th>Unseen</th><th>Macro F1</th><th>p50 ms</th><th>$ / 1M</th></tr></thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td>{m.label}</td>
                <td style={{ color: "var(--text-muted)" }}>{m.technique}</td>
                <td className="mono">{m.params ? fmtInt(m.params) : "n/a"}</td>
                <td className="mono">{pct(m.accuracy as number)}</td>
                <td className="mono">{typeof m.accuracy_unseen === "number" ? pct(m.accuracy_unseen) : "n/a"}</td>
                <td className="mono">{(m.macro_f1 as number).toFixed(3)}</td>
                <td className="mono">{m.latency_ms?.p50 ?? "n/a"}</td>
                <td className="mono">${(m.cost_per_1m_usd as number).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={capNote}>{ja ? <>表3. 取引タスクの実測結果。フロンティアの行はキャッシュ済みプロンプトによる文脈内学習、自社およびLoRAの行は学習済みです。稼働中の自社モデルを通した{fmtInt(Bv.slm.n)}件の取引のライブサンプルは、毎秒{Bv.slm.throughput_per_s}件で精度{pct(Bv.slm.accuracy)}を再現します。</> : <>Table 3. Measured results on the transaction task. Frontier rows use in-context learning with a cached prompt; the owned and LoRA rows are trained. A live sample of {fmtInt(Bv.slm.n)} transactions through the deployed owned model reproduces {pct(Bv.slm.accuracy)} accuracy at {Bv.slm.throughput_per_s} per second.</>}</p>
      </div>

      <H n="8" id="s8">{ja ? "経済性は毎年変わる" : "The economics change every year"}</H>
      <p style={p}>
        {ja ? "今日取った費用比較は、動く標的のスナップショットにすぎません。一定の能力水準に対するフロンティア価格は、急激かつ繰り返し低下しており、ここでは年約10分の1としてモデル化します。これは内製か購入かに具体的な帰結をもたらします。小型モデルの自社ホスティングは、概ね固定の月額費用（常時起動の計算プールとそれを運用する人員）と、タスクあたり非常に低い変動費を伴います。フロンティアのインターフェースはその逆で、固定費はほぼゼロ、変動費が規模で支配的になります。自社保有がレンタルを上回る処理量は、この2曲線の交点であり、レンタル側の曲線が下がり続けるため、その交点は毎年より高い処理量へ移動します。" : "A cost comparison taken today is a snapshot of a moving target. Frontier prices for a fixed level of capability have fallen sharply and repeatedly, modelled here as roughly a tenfold reduction per year. That has a specific consequence for build-versus-buy. Self-hosting a small model carries a largely fixed monthly cost, a warm pool of compute plus the people to run it, and a very low variable cost per task. A frontier interface is the reverse: near-zero fixed cost and a variable cost that dominates at scale. The volume at which owning beats renting is the crossover of those two curves, and because the rented curve keeps dropping, that crossover moves to higher volumes every year."}
      </p>
      <Fig n={6} caption={ja ? "処理量別の月間コストの例示。自社ホスティングが有利になるのは損益分岐点を超えた場合のみで、フロンティア価格の低下とともに分岐点は右へ移動します。数値を設定できる対話版はコスト評価タブにあります。" : "Illustrative monthly cost by volume. Self-hosting wins only above the crossover, and the crossover slides right as frontier prices fall. The interactive version, with configurable numbers, is on the Underwrite tab."}>
        <UnderwriteFigure />
      </Fig>
      <p style={p}>
        {ja ? "そこから導かれる実務上の原則は、2年以上にわたり基準を満たすものだけを内製し、その判断を恒久的なものとせず毎年再評価することです。現在の価格と処理量では自社モデルが正当化されるワークロードでも、フロンティア価格がさらに2回下がれば正当化されないかもしれず、その逆もまた然りです。" : "The practical rule that follows is to build only what clears the bar for two or more years, and to re-underwrite the decision annually rather than treat it as permanent. A workload that justifies an owned model at present prices and volumes may not justify one after two more rounds of frontier price cuts, and the reverse holds as well."}
      </p>

      <H n="9" id="s9">{ja ? "本実験が示すこと" : "What this demonstrates"}</H>
      <p style={p}>
        {ja ? "上記の測定は3つの主張を支持します。第一に、狭く高処理量のタスクでは、小型の自社モデルが分布内データでフロンティアの精度に匹敵または上回り、コストは約4桁、レイテンシは約2桁低くできます。第二に、フロンティアの優位は実在するが狭く、新規入力に集中するため、ルーターと確信度カスケードにより、難しい末端でフロンティア級の精度を保ちつつコスト削減の大半を得られます。第三に、小さなファインチューニング済みガードレールこそが、これらすべてを規制対象データと両立させます。生の顧客テキストを第三者に送るのか、マスキング済みテキストのみを送るのか、という違いだからです。" : "Three claims are supported by the measurements above. First, for a narrow, high-volume task a small owned model can match or beat frontier accuracy on in-distribution data at roughly four orders of magnitude lower cost and two orders of magnitude lower latency. Second, the frontier advantage is real but narrow, concentrated on novel inputs, so a router plus a confidence cascade captures most of the cost saving while preserving frontier-level accuracy on the hard tail. Third, a small fine-tuned guardrail is what makes any of this compatible with regulated data, because it is the difference between sending raw customer text to a third party and sending only redacted text."}
      </p>

      <H n="10" id="s10">{ja ? "限界" : "Limitations"}</H>
      <p style={p}>
        {ja ? "取引データセットは顧客記録から取得したものではなく、実際の明細書フォーマットに合わせて生成されており、結果は銀行台帳での本番ベンチマークではなく、パターンの忠実な複製として読むべきです。結果は単一のタスク系統について報告しています。論旨は他の狭い分類ワークロードにも一般化しますが、正確な数値は一般化しません。未知の加盟店での自社モデルの弱点は本物の限界であり、ここでは除去ではなくエスカレーションで対処しています。コスト数値は変動する定価と計算単価に依存し、これこそが第8節の年次再評価の要点です。まだ測定が実行されていない箇所では、デモは推定値を事実として提示せず、暫定値として表示します。" : "The transaction dataset is generated to match real statement formats rather than drawn from customer records, and the results should be read as a faithful replica of the pattern rather than a production benchmark on a bank ledger. Results are reported on a single task family; the argument generalises to other narrow classification workloads but the exact numbers will not. The owned-model weakness on unseen merchants is a genuine limit, addressed here by escalation rather than removed. Cost figures depend on list prices and compute rates that change, which is precisely the point of the annual re-underwriting in Section 8. Where a measurement has not yet been run, the demo labels the value as a placeholder rather than presenting an estimate as fact."}
      </p>

      <H n="11" id="s11">{ja ? "ライブで再現する" : "Reproduce it live"}</H>
      <p style={p}>
        {ja ? "本ページのすべての図はコミット済みの計測ファイルから再生成され、同じ数値がライブのゲートウェイから配信されます。以下のページは各節に対応する対話版です。" : "Every figure here is regenerated from committed measurement files, and the same numbers are served by a live gateway. The pages below are the interactive counterparts to each section."}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.6rem", ...sysFont, margin: "1rem 0 0.4rem" }}>
        {[
          ["/spectrum", ja ? "スペクトラム" : "Spectrum", ja ? "モデル一覧をライブで" : "the full model table, live"],
          ["/router", ja ? "ルーター" : "Router", ja ? "リクエストをルーティングしエスカレーションを見る" : "route a request and watch it escalate"],
          ["/guardrail", ja ? "ガードレール" : "Guardrail", ja ? "実テキストの個人データをマスキング" : "redact personal data in real text"],
          ["/batch", ja ? "バッチ" : "Batch", ja ? "1万件の取引 対 フロンティア" : "ten thousand transactions versus frontier"],
          ["/underwrite", ja ? "コスト評価" : "Underwrite", ja ? "数値を設定できる損益分岐点" : "the crossover with configurable numbers"],
        ].map(([href, title, sub]) => (
          <Link key={href} href={href} style={{ display: "block", padding: "0.7rem 0.8rem", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", textDecoration: "none" }}>
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)" }}>{sub}</span>
          </Link>
        ))}
      </div>
      <p style={{ ...capNote, marginTop: "0.6rem" }}>
        {ja ? <>本サイトは <span className="mono">{SEETHA_URL}</span> で配信されています。ライブのゲートウェイAPIは <span className="mono">{GATEWAY}</span> で配信され、デモキーで保護されています。データセットは公開の米国銀行取引カテゴリセット、Banking77、ai4privacy PIIコーパス、および表2に挙げた金融・コードコーパスです。</> : <>This site is served at <span className="mono">{SEETHA_URL}</span>. The live gateway API is served at <span className="mono">{GATEWAY}</span> and is protected by a demo key. The datasets are the public US-bank-transaction categories set, Banking77, the ai4privacy PII corpus, and the financial and code corpora listed in Table 2.</>}
      </p>

      <H n="12" id="s12">{ja ? "背景と参考文献" : "Background and references"}</H>
      <p style={p}>
        {ja ? <>自社モデルの階層は、JPMorgan Chase が公表した結果を再現したものです。<em>Better with Less</em> において著者らは、金融取引理解のタスクで、エンコーダのみ・デコーダのみ・エンコーダ-デコーダの各アーキテクチャを、3つのアプローチ（事前学習済み大型モデル、ファインチューニング済み大型モデル、ゼロから学習した小型モデル）にわたり比較しました。LLaMA3-8b、Flan-T5、SBERT といった大型モデルは、タスク向けに作った小型モデルを有意には上回らず、小型モデルの方が高速かつ安価に動きました。本番環境では、彼らのデコーダのみの独自モデルが取引カバレッジを14%改善し、年間1,300万ドル超を節約しました。</> : <>The owned-model rung reproduces a published result from JPMorgan Chase. In <em>Better with Less</em>, the authors compared encoder-only, decoder-only and encoder-decoder architectures across three approaches, a pretrained large model, a fine-tuned large model, and a small model trained from scratch, on the task of financial transaction understanding. Large models such as LLaMA3-8b, Flan-T5 and SBERT did not meaningfully beat a small model built for the task, and the small model was faster and cheaper to run. In production their decoder-only proprietary model improved transaction coverage by 14 percent and saved more than 13 million dollars a year.</>}
      </p>
      <p style={p}>
        {ja ? "ここで導く推論は、本実験が公開データで検証するものです。狭く高処理量のタスクでは、ゼロから学習したコンパクトなモデルがわずかなコストでフロンティアモデルに匹敵または上回り、フロンティアモデルの残余の優位は、毎リクエストにフロンティア価格を払うのではなくエスカレーションで扱えるほど狭い、というものです。本サイトの100万件あたりコストの数値は、論文からの引用ではなく、表1で直接測定したものです。" : "The inference drawn here is the one this experiment tests on public data: for a narrow, high-volume task a compact model trained from scratch can match or beat a frontier model at a fraction of the cost, and the residual advantage of the frontier model is narrow enough to handle by escalation rather than by paying frontier prices on every request. The cost-per-million figures on this site are measured directly, in Table 1, rather than taken from the paper."}
      </p>
      <ul style={{ ...p, paddingLeft: "1.2rem" }}>
        <li>Ding, W., Narendra, S., Shi, X., Ratnaparkhi, A., Yang, C., Sabzevar, N., Yin, Z. <em>Better with Less: Small Proprietary Models Surpass Large Language Models in Financial Transaction Understanding.</em> JPMorgan Chase, arXiv:2509.25803, 2025. <a href="https://arxiv.org/abs/2509.25803" target="_blank" rel="noreferrer" style={{ color: "var(--series-1)" }}>arxiv.org/abs/2509.25803</a></li>
        <li>Datasets: DoDataThings/us-bank-transaction-categories-v2; legacy-datasets/banking77; ai4privacy/pii-masking-300k; virattt/financial-qa-10K; kritsadaK/EDGAR-CORPUS-Financial-Summarization; code-search-net/code_search_net.</li>
      </ul>
    </article>
  );
}
