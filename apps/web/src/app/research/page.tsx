// Research write-up for the Model Spectrum demo. Static server component. Every figure is derived
// from the committed measurement JSON in src/data so the page cannot drift from the results.
import Link from "next/link";
import B from "@/data/phase1_benchmark.json";
import R from "@/data/phase2_router_eval.json";
import P from "@/data/phase3_pii_eval.json";
import Bv from "@/data/phase2_batch_view.json";

export const metadata = {
  title: "The Model Spectrum: a cost study of owned, tuned and frontier models on one bank task",
  description:
    "A reproducible study measuring accuracy, latency and cost across a small owned model, a LoRA-tuned SLM, open weights and three frontier tiers on a real transaction-classification workload, with a routing gateway and a PII guardrail.",
};

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

// ---------- small presentational helpers ----------
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

// ---------- Figure 1: the spectrum ladder with an inline log cost bar ----------
const LADDER = [
  { tier: "R1", model: "Claude Opus 5 / Sonnet 5", technique: "prompting and in-context learning", trained: "no", cost: opus.cost_per_1m_usd as number, color: "var(--series-6)" },
  { tier: "R2", model: "Claude Haiku 4.5", technique: "prompting with a cached few-shot prompt", trained: "no", cost: haiku.cost_per_1m_usd as number, color: "var(--series-5)" },
  { tier: "R3", model: "Gateway: router, cascade, cache, batch", technique: "linear probe on frozen embeddings", trained: "head only", cost: NaN, color: "var(--series-4)" },
  { tier: "R4", model: "Qwen3-1.7B open weights", technique: "prompting only, on our own GPU", trained: "no", cost: NaN, color: "var(--series-3)" },
  { tier: "R5", model: "Qwen3-0.6B with LoRA", technique: "parameter-efficient fine-tuning", trained: "adapters", cost: lora.cost_per_1m_usd as number, color: "var(--series-2)" },
  { tier: "R6", model: "1.7M-parameter decoder from scratch", technique: "trained from random initialisation", trained: "all weights", cost: tiny.cost_per_1m_usd as number, color: "var(--series-1)" },
];
function LadderFigure() {
  const lo = log10(0.05), hi = log10(5000);
  const barW = (c: number) => Math.max(2, ((log10(c) - lo) / (hi - lo)) * 100);
  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {LADDER.map((r) => (
        <div key={r.tier} style={{ display: "grid", gridTemplateColumns: "2.4rem minmax(0,12rem) 1fr", gap: "0.6rem", alignItems: "center", padding: "0.4rem 0", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 700, color: r.color }}>{r.tier}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: "0.86rem", fontWeight: 600 }}>{r.model}</span>
            <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)" }}>{r.technique} ({r.trained})</span>
          </span>
          <span>
            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ height: 12, width: `${Number.isNaN(r.cost) ? 0 : barW(r.cost)}%`, background: r.color, borderRadius: 3, opacity: 0.85 }} />
              <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                {Number.isNaN(r.cost) ? "architecture layer" : `$${(r.cost as number).toLocaleString("en-US", { maximumFractionDigits: 2 })} / 1M`}
              </span>
            </span>
          </span>
        </div>
      ))}
      <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.2rem", paddingTop: "0.4rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
        Cost bars are on a logarithmic scale. The lowest and highest rungs differ by more than four orders of magnitude on the same task.
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
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Request lifecycle through the gateway" style={{ fontFamily: "system-ui, sans-serif" }}>
      {steps.map((st, i) => {
        const x = i * (bw + gap);
        return (
          <g key={st.t}>
            <rect x={x} y={y} width={bw} height={bh} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
            <text x={x + bw / 2} y={y + 26} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text-primary)">{st.t}</text>
            <text x={x + bw / 2} y={y + 46} textAnchor="middle" fontSize="11.5" fill="var(--text-muted)">{st.s}</text>
            {i < n - 1 && (
              <path d={`M ${x + bw + 2} ${y + bh / 2} l ${gap - 4} 0`} stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#arrow)" />
            )}
          </g>
        );
      })}
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted)" />
        </marker>
      </defs>
      <text x={bw + gap + bw / 2} y={20} textAnchor="middle" fontSize="11" fill="var(--series-1)">no raw PII leaves the perimeter</text>
      <text x={w / 2} y={h - 6} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
        Every hop records tokens, latency and cost, so each answer arrives with a line-item receipt.
      </text>
    </svg>
  );
}

// ---------- Figure 3: accuracy vs cost ----------
function ScatterFigure() {
  const w = 760, h = 420, M = { l: 58, r: 20, t: 24, b: 54 };
  const pw = w - M.l - M.r, ph = h - M.t - M.b;
  const xlo = -1.35, xhi = 3.75; // log10 cost domain, ~0.045 to ~5600
  const ylo = 0.74, yhi = 1.0;
  const X = (c: number) => M.l + ((log10(c) - xlo) / (xhi - xlo)) * pw;
  const Y = (a: number) => M.t + ((yhi - a) / (yhi - ylo)) * ph;
  const xticks = [0.05, 0.5, 5, 50, 500, 5000];
  const yticks = [0.75, 0.8, 0.85, 0.9, 0.95, 1.0];
  const pts = [
    { m: tiny, c: "var(--series-1)" }, { m: lora, c: "var(--series-2)" },
    { m: haiku, c: "var(--series-5)" }, { m: sonnet, c: "var(--series-3)" }, { m: opus, c: "var(--series-6)" },
  ];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Accuracy versus cost per one million classifications" style={{ fontFamily: "system-ui, sans-serif" }}>
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
      {/* seen to unseen connectors */}
      {pts.map(({ m, c }) => (
        typeof m.accuracy_unseen === "number" ? (
          <line key={"c" + m.id} x1={X(m.cost_per_1m_usd as number)} y1={Y(m.accuracy as number)} x2={X(m.cost_per_1m_usd as number)} y2={Y(m.accuracy_unseen as number)} stroke={c} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
        ) : null
      ))}
      {pts.map(({ m, c }) => (
        <g key={m.id}>
          {typeof m.accuracy_unseen === "number" && (
            <circle cx={X(m.cost_per_1m_usd as number)} cy={Y(m.accuracy_unseen as number)} r={5} fill="var(--surface-1)" stroke={c} strokeWidth={2} />
          )}
          <circle cx={X(m.cost_per_1m_usd as number)} cy={Y(m.accuracy as number)} r={7} fill={c} />
          <text x={X(m.cost_per_1m_usd as number) + (m.id === "tiny" ? 12 : 0)} y={Y(m.accuracy as number) - 12} textAnchor={m.id === "tiny" ? "start" : "middle"} fontSize="11.5" fontWeight="700" fill="var(--text-primary)">{m.label}</text>
        </g>
      ))}
      {/* legend */}
      <g transform={`translate(${w - M.r - 190} ${M.t + 6})`} fontSize="11" fill="var(--text-secondary)">
        <circle cx={6} cy={0} r={6} fill="var(--text-muted)" /><text x={18} y={4}>filled: seen test split</text>
        <circle cx={6} cy={18} r={5} fill="var(--surface-1)" stroke="var(--text-muted)" strokeWidth={2} /><text x={18} y={22}>hollow: unseen merchants</text>
      </g>
    </svg>
  );
}

// ---------- Figure 4: PII guardrail, regex vs learned ----------
function PiiFigure() {
  const reg = P.regex_only, mod = P.model_union_regex;
  const rows = [
    { k: "precision", a: reg.precision, b: mod.precision },
    { k: "recall", a: reg.recall, b: mod.recall },
    { k: "F1", a: reg.f1, b: mod.f1 },
  ];
  const w = 640, rowH = 46, top = 10, barMax = 360, x0 = 150;
  return (
    <svg viewBox={`0 0 ${w} ${top + rows.length * rowH + 26}`} width="100%" role="img" aria-label="PII detection, regex baseline versus learned model" style={{ fontFamily: "system-ui, sans-serif" }}>
      {rows.map((r, i) => {
        const y = top + i * rowH;
        return (
          <g key={r.k}>
            <text x={0} y={y + 20} fontSize="12.5" fontWeight="600" fill="var(--text-secondary)">{r.k}</text>
            <rect x={x0} y={y + 4} width={r.a * barMax} height={13} rx={3} fill="var(--series-4)" />
            <text x={x0 + r.a * barMax + 6} y={y + 15} fontSize="11" fill="var(--text-muted)">{(r.a * 100).toFixed(1)}% regex only</text>
            <rect x={x0} y={y + 20} width={r.b * barMax} height={13} rx={3} fill="var(--series-1)" />
            <text x={x0 + r.b * barMax + 6} y={y + 31} fontSize="11" fill="var(--text-muted)">{(r.b * 100).toFixed(1)}% learned + regex</text>
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
  const X = (u: number) => M.l + u * pw; // u in 0..1 (log volume)
  const Y = (v: number) => M.t + (1 - v) * ph; // v in 0..1 (log cost)
  // three illustrative lines in log-log space
  const flagship = (u: number) => 0.30 + u * 0.95;
  const small = (u: number) => 0.02 + u * 0.95;
  const self = (u: number) => Math.max(0.02 + u * 0.95, 0.62); // fixed floor then linear
  const line = (f: (u: number) => number) => Array.from({ length: 41 }, (_, i) => `${X(i / 40)},${Y(f(i / 40))}`).join(" ");
  // crossover of self and small: 0.62 = 0.02 + u*0.95 -> u ~ 0.63
  const xc = 0.63;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Monthly cost by volume for three ways to run one workload" style={{ fontFamily: "system-ui, sans-serif" }}>
      <line x1={M.l} y1={M.t} x2={M.l} y2={h - M.b} stroke="var(--border)" />
      <line x1={M.l} y1={h - M.b} x2={w - M.r} y2={h - M.b} stroke="var(--border)" />
      <text x={M.l + pw / 2} y={h - 8} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">monthly volume (log)</text>
      <text transform={`translate(12 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">monthly cost (log)</text>
      {/* build zone */}
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
      <defs>
        <marker id="arrow2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted)" /></marker>
      </defs>
    </svg>
  );
}

export default function ResearchPage() {
  const serif = { fontFamily: 'Georgia, "Times New Roman", Cambria, serif' } as const;
  const p = { fontSize: "1.02rem", lineHeight: 1.72, margin: "0.9rem 0", color: "var(--text-primary)", textAlign: "justify" as const };
  return (
    <article style={{ maxWidth: 860, margin: "0 auto", ...serif }}>
      {/* Title block */}
      <header style={{ borderBottom: "2px solid var(--border)", paddingBottom: "1rem" }}>
        <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", margin: 0 }}>
          Applied ML Platform note - September 2026
        </p>
        <h1 style={{ fontSize: "1.7rem", lineHeight: 1.22, fontWeight: 700, margin: "0.5rem 0 0.4rem" }}>
          The Model Spectrum: measuring the price of intelligence on a single bank task
        </h1>
        <p style={{ fontSize: "1.0rem", color: "var(--text-secondary)", margin: 0 }}>
          An owned model trained from scratch, a LoRA-tuned small language model, open weights and three frontier tiers, compared on accuracy, latency and cost, then wired behind one routing gateway with a privacy guardrail.
        </p>
      </header>

      {/* Abstract */}
      <section style={{ margin: "1.4rem 0", padding: "1rem 1.1rem", background: "var(--surface-2)", borderRadius: 10 }}>
        <h2 style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 0.4rem" }}>Abstract</h2>
        <p style={{ ...p, margin: 0, fontSize: "0.98rem" }}>
          Large language model interfaces make it easy to solve narrow, high-volume classification tasks with a frontier model, and easy to overpay for it by several orders of magnitude. We take one concrete workload, categorising bank-statement transaction descriptions into {B.dataset.n_labels} classes, and run it through the full spectrum of options, from a {fmtInt(tiny.params as number)}-parameter decoder trained from random initialisation up to Claude Opus 5. On the in-distribution test split the owned model reaches {pct(tiny.accuracy as number)} accuracy, higher than every frontier tier we measured, at roughly {fmtInt(costRatio(sonnet, tiny))} times lower cost per million classifications and about {Math.round((sonnet.latency_ms!.p50 as number) / (tiny.latency_ms!.p50 as number))} times lower latency. The catch appears on merchants never seen in training, where the owned model falls to {pct(tiny.accuracy_unseen as number)} while the frontier tiers hold above {pct(sonnet.accuracy_unseen as number)}. We show that a small intent router ({pct(R.accuracy)} accuracy) plus a confidence-triggered cascade keeps the cheap path for the common case and reserves frontier calls for the hard tail, and that a fine-tuned guardrail lifts entity-level PII recall from {(P.regex_only.recall * 100).toFixed(1)} percent with regular expressions to {(P.model_union_regex.recall * 100).toFixed(1)} percent, which is what makes it defensible to send text to a third-party model at all. Every number on this page is produced by the code in this repository and is reproduced live in the demo linked at the end.
        </p>
      </section>

      <H n="1" id="s1">Why run one task through every tier</H>
      <p style={p}>
        Transaction categorisation is a good stress test for build-versus-buy because it is narrow, repetitive and enormous. A retail bank classifies hundreds of millions of card and account narrations a month into a fixed set of spending categories. The task barely changes from year to year, the label set is small and the accuracy bar is well understood. That combination is exactly where a general-purpose frontier model is least efficient: you pay flagship token prices, again and again, to answer a question a far smaller model already answers well.
      </p>
      <p style={p}>
        The instinct to reach for a frontier API is still rational at the start. It needs no training data pipeline, no GPUs and no evaluation harness, and it works on day one. The question this study asks is not whether the frontier model can do the task. It plainly can. The question is what the task actually costs once volume is real, and how much of that cost is avoidable without giving up accuracy. To answer it we refuse to pick a side in advance and instead measure the whole ladder on identical data.
      </p>

      <H n="2" id="s2">The spectrum</H>
      <p style={p}>
        We organise the options as rungs, from managed frontier APIs at the top to a hand-built model at the bottom. Higher rungs cost more per call and require less of you. Lower rungs cost far less per call and require data, training and operations. The middle rungs are architecture rather than models: a router, a cascade, prompt caching and batch submission, all of which change the economics without changing which models exist.
      </p>
      <Fig n={1} caption="The rungs of the spectrum for this workload. Cost bars show measured US dollars per one million classifications on a logarithmic axis; R3 and R4 are architecture and open-weight layers rather than a single priced model.">
        <LadderFigure />
      </Fig>

      <H n="3" id="s3">The gateway</H>
      <p style={p}>
        A spectrum is only useful if something decides, per request, which rung to use. That is the job of the gateway. It applies a fixed sequence to every request. First it redacts personal data, so that whatever happens next never sees raw identifiers. Then it classifies the request into a workload type and looks up an ordered list of tiers to try. It calls the cheapest adequate tier first, inspects that tier self-reported confidence, and escalates one step only when confidence is low or the call fails. Finally it restores the redacted entities in the answer and returns the result together with a token-level cost receipt.
      </p>
      <Fig n={2} caption="The path of a single request. The privacy guard runs before any model call, the router picks the workload class, and the cascade spends more only when the cheap tier is unsure.">
        <LifecycleFigure />
      </Fig>
      <p style={p}>
        Two design choices carry most of the value. The cascade means the marginal cost of a request tracks its difficulty rather than a flat frontier rate. The guardrail means the frontier tiers, which are the only third-party components, receive redacted text and nothing else, which is a precondition for using them on regulated data.
      </p>

      <H n="4" id="s4">Data and method</H>
      <p style={p}>
        All models are evaluated on the same public data. The primary workload is a set of {fmtInt(B.dataset.n)} bank-statement-format transaction descriptions across {B.dataset.n_labels} categories. We hold out two test sets: a standard split, and a harder split of merchants whose identifiers never appear in training, which measures how each rung copes with genuinely novel inputs rather than memorised ones. The owned model is a compact decoder trained from random initialisation with a supervised objective and an auxiliary language-modelling loss. The small language model is Qwen3-0.6B adapted with LoRA, training only {fmtInt((lora as unknown as { trainable_params: number }).trainable_params)} of its {fmtInt(lora.params as number)} parameters. The frontier tiers are used purely through prompting and in-context learning, with a cached few-shot instruction block and no weight updates. The router is a calibrated logistic-regression head on frozen multilingual sentence embeddings. The guardrail is a DistilBERT token classifier fine-tuned on human-validated PII spans and combined with high-precision regular expressions for numeric patterns such as card numbers.
      </p>
      <p style={p}>
        Because the provenance of the data matters as much as the models, Table 2 lists every corpus we used, where it came from, what role it plays, and exactly how we changed it before training or evaluation. Two sources are labelled as not fully organic and are treated accordingly: the transaction set is generated to match real statement formats rather than taken from customer records, and one router intent is templated. Everything else is drawn from published corpora and used with only mechanical reshaping.
      </p>
      <div style={{ overflowX: "auto", margin: "1.1rem 0" }}>
        <table className="data" style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.82rem" }}>
          <thead>
            <tr><th>Dataset</th><th>Source (Hugging Face)</th><th>What it is for</th><th>Size used</th><th>How we modified it</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>US bank transactions</td>
              <td className="mono">DoDataThings/us-bank-transaction-categories-v2</td>
              <td>Primary task: classify statement narrations into {B.dataset.n_labels} spending categories</td>
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
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "system-ui, sans-serif", marginTop: "0.4rem" }}>
          Table 2. Every corpus used for training and evaluation, with its source and the transformations applied.
        </p>
      </div>
      <p style={p}>
        The router is trained on a separate corpus that we assemble ourselves, one workload class at a time, from real public sources so that the classifier learns from genuine phrasing rather than synthetic prompts. Each class contributes up to 250 examples. Table 3 shows the composition. Several sources are parquet mirrors chosen for reproducibility, and only the drafting class is templated, which we flag rather than hide.
      </p>
      <div style={{ overflowX: "auto", margin: "1.1rem 0" }}>
        <table className="data" style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.82rem" }}>
          <thead>
            <tr><th>Router class</th><th>Source</th><th>How it becomes a request</th></tr>
          </thead>
          <tbody>
            {[
              ["txn_categorise", "US bank transactions (from our volume)", "narration wrapped as a categorise-this-transaction instruction"],
              ["chat", "legacy-datasets/banking77", "genuine customer questions, used as written"],
              ["pii_redact", "ai4privacy/pii-masking-300k", "source text wrapped as a redact-or-mask instruction"],
              ["summarise", "kritsadaK/EDGAR-CORPUS-Financial-Summarization", "10-K excerpts wrapped as a summarise instruction"],
              ["doc_classify", "kritsadaK/EDGAR-CORPUS-Financial-Summarization", "different 10-K excerpts wrapped as a what-document-is-this question"],
              ["complex_analysis", "virattt/financial-qa-10K", "numeric reasoning questions over company filings"],
              ["code", "code-search-net/code_search_net (python)", "docstrings wrapped as a write-a-function request"],
              ["draft", "data/draft_templates.yaml", "templated, the only synthetic class, flagged as such"],
            ].map(([cls, src, how]) => (
              <tr key={cls}>
                <td className="mono">{cls}</td>
                <td style={{ color: "var(--text-secondary)" }}>{src}</td>
                <td style={{ color: "var(--text-muted)" }}>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "system-ui, sans-serif", marginTop: "0.4rem" }}>
          Table 3. The router corpus, {fmtInt(R.n_train + R.n_test)} examples across {R.labels.length} classes, assembled from the sources above and split into {fmtInt(R.n_train)} train and {fmtInt(R.n_test)} test.
        </p>
      </div>
      <p style={p}>
        Cost is computed one way for everyone and is never hypothetical. For the owned and open models it is the measured compute rate divided by measured throughput. For the frontier tiers it is the measured token usage multiplied by list price, including the discount from prompt caching. Reporting a single, mechanical cost figure per model is what makes the comparison fair.
      </p>

      <H n="5" id="s5">Results</H>
      <p style={p}>
        The central result is the relationship between accuracy and cost. On the standard test split the owned model is both the most accurate and the least expensive option by a wide margin. Reading left to right in Figure 3, moving from the owned model to the frontier tiers multiplies cost by thousands while nudging accuracy in the wrong direction on this in-distribution data.
      </p>
      <Fig n={3} caption="Accuracy against cost per one million classifications. Filled points are the standard test split; hollow points are the unseen-merchant split. The dashed drop for the owned model is the whole argument for the cascade: it is unbeaten on familiar inputs and weakest on novel ones.">
        <ScatterFigure />
      </Fig>
      <p style={p}>
        The hollow points tell the second half of the story. On unseen merchants the owned model falls from {pct(tiny.accuracy as number)} to {pct(tiny.accuracy_unseen as number)}, while Sonnet holds {pct(sonnet.accuracy_unseen as number)}. A frontier model generalises to inputs it was never shown; a tiny specialist does not. This is not a reason to abandon the specialist. It is the reason the gateway escalates: the tiny model handles the large, familiar majority almost for free, and the expensive generalist is paid for only on the minority of requests where it earns its price.
      </p>
      <p style={p}>
        The router that makes this possible reaches {pct(R.accuracy)} accuracy and a macro F1 of {R.macro_f1.toFixed(3)} across {R.labels.length} workload classes, trained in {R.train_seconds.toFixed(0)} seconds on {fmtInt(R.n_train)} examples. It is also well calibrated: in the reliability table the high-confidence predictions are correct essentially all of the time, which is what lets the gateway trust a confident route and question an unsure one.
      </p>
      <p style={p}>
        The guardrail is the quiet precondition for the whole design. Regular expressions alone, the usual first attempt, catch email addresses and little else, giving entity-level recall of {(P.regex_only.recall * 100).toFixed(1)} percent. The fine-tuned model combined with those same expressions reaches {(P.model_union_regex.recall * 100).toFixed(1)} percent recall at {(P.model_union_regex.precision * 100).toFixed(1)} percent precision, in about {P.latency_ms.p50} milliseconds per document. Without that lift, sending any customer text to a third party would be indefensible; with it, only redacted text ever leaves.
      </p>
      <Fig n={4} caption="Entity-level PII detection on held-out documents. A learned model plus regular expressions recovers the entities that pattern matching cannot see, notably names and addresses.">
        <PiiFigure />
      </Fig>

      <div style={{ overflowX: "auto", margin: "1.4rem 0" }}>
        <table className="data" style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.86rem" }}>
          <thead>
            <tr><th>Model</th><th>Technique</th><th>Params</th><th>Accuracy</th><th>Unseen</th><th>Macro F1</th><th>p50 ms</th><th>$ / 1M</th></tr>
          </thead>
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
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "system-ui, sans-serif", marginTop: "0.4rem" }}>
          Table 1. Measured results on the transaction task. Frontier rows use in-context learning with a cached prompt; the owned and LoRA rows are trained. A live sample of {fmtInt(Bv.slm.n)} transactions through the deployed owned model reproduces {pct(Bv.slm.accuracy)} accuracy at {Bv.slm.throughput_per_s} per second.
        </p>
      </div>

      <H n="6" id="s6">The economics change every year</H>
      <p style={p}>
        A cost comparison taken today is a snapshot of a moving target. Frontier prices for a fixed level of capability have fallen sharply and repeatedly; we model this as roughly a tenfold reduction per year. That has a specific consequence for build-versus-buy. Self-hosting a small model carries a largely fixed monthly cost, a warm pool of compute plus the people to run it, and a very low variable cost per task. A frontier API is the reverse: near-zero fixed cost and a variable cost that dominates at scale. The volume at which owning beats renting is the crossover of those two curves, and because the rented curve keeps dropping, that crossover moves to higher volumes every year.
      </p>
      <Fig n={5} caption="Illustrative monthly cost by volume. Self-hosting wins only above the crossover, and the crossover slides right as frontier prices fall. The interactive version, with your own numbers, is on the Underwrite tab.">
        <UnderwriteFigure />
      </Fig>
      <p style={p}>
        The practical rule that follows is to build only what clears the bar for two or more years, and to re-underwrite the decision annually rather than treat it as permanent. A workload that justifies an owned model at today prices and today volumes may not justify one after two more rounds of frontier price cuts, and vice versa.
      </p>

      <H n="7" id="s7">What this demonstrates</H>
      <p style={p}>
        Three claims are supported by the measurements above. First, for a narrow, high-volume task a small owned model can match or beat frontier accuracy on in-distribution data at roughly four orders of magnitude lower cost and two orders of magnitude lower latency. Second, the frontier advantage is real but narrow, concentrated on novel inputs, so a router plus a confidence cascade captures most of the cost saving while preserving frontier-level accuracy on the hard tail. Third, a small fine-tuned guardrail is what makes any of this compatible with regulated data, because it is the difference between sending raw customer text to a third party and sending only redacted text.
      </p>

      <H n="8" id="s8">Limitations</H>
      <p style={p}>
        The transaction dataset is generated to match real statement formats rather than drawn from customer records, and the results should be read as a faithful replica of the pattern rather than a production benchmark on a bank ledger. Results are reported on a single task family; the argument generalises to other narrow classification workloads but the exact numbers will not. The owned-model weakness on unseen merchants is a genuine limit, addressed here by escalation rather than removed. Cost figures depend on list prices and compute rates that change, which is precisely the point of the annual re-underwriting in Section 6. Where a measurement has not yet been run, the demo labels the value as a placeholder rather than presenting an estimate as fact.
      </p>

      <H n="9" id="s9">Reproduce it live</H>
      <p style={p}>
        Every figure here is regenerated from committed measurement files, and the same numbers are served by a live gateway. The pages below are the interactive counterparts to each section.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.6rem", fontFamily: "system-ui, sans-serif", margin: "1rem 0 0.4rem" }}>
        {[
          ["/spectrum", "Spectrum", "the full model table, live"],
          ["/router", "Router", "route a request and watch it escalate"],
          ["/guardrail", "Guardrail", "redact PII in real text"],
          ["/batch", "Batch", "ten thousand transactions versus frontier"],
          ["/underwrite", "Underwrite", "the crossover with your own numbers"],
        ].map(([href, title, sub]) => (
          <Link key={href} href={href} style={{ display: "block", padding: "0.7rem 0.8rem", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", textDecoration: "none" }}>
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)" }}>{sub}</span>
          </Link>
        ))}
      </div>
      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontFamily: "system-ui, sans-serif", marginTop: "0.6rem" }}>
        The live gateway API is served at <span className="mono">{GATEWAY}</span> and is protected by a demo key. The datasets are the public US-bank-transaction categories set, Banking77, and the ai4privacy PII corpus. The owned-model pattern follows the published JPMorgan &ldquo;Better with Less&rdquo; work, whose reported production figure was 0.24 dollars against 812 dollars per unit of the same comparison.
      </p>
    </article>
  );
}
