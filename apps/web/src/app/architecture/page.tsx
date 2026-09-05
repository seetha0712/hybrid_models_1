// Architecture and training detail for the Model Spectrum experiment. Static server component.
// Diagram-first: system assembly, the full routing decision, redaction and router logic, and the
// training configuration of every component. Neutral voice, no second person.
import Link from "next/link";

export const metadata = {
  title: "Architecture and training detail - The Model Spectrum",
  description: "How the gateway is assembled, how each query is routed, how redaction and classification are decided, and the exact training configuration of every model.",
};

const sysFont = { fontFamily: "system-ui, sans-serif" } as const;
const serif = { fontFamily: 'Georgia, "Times New Roman", Cambria, serif' } as const;
const p = { fontSize: "1.0rem", lineHeight: 1.68, margin: "0.8rem 0", color: "var(--text-primary)" } as const;
const cap = { fontSize: "0.78rem", color: "var(--text-muted)", ...sysFont, marginTop: "0.4rem" } as const;

function H({ n, id, children }: { n: string; id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} style={{ fontSize: "1.16rem", fontWeight: 700, marginTop: "2.1rem", marginBottom: "0.5rem", scrollMarginTop: "5rem" }}>
      <span style={{ color: "var(--text-muted)", fontWeight: 600, marginRight: "0.5rem" }}>{n}</span>{children}
    </h2>
  );
}
function Fig({ n, caption, children }: { n: number; caption: string; children: React.ReactNode }) {
  return (
    <figure style={{ margin: "1.4rem 0", padding: "0.9rem 1rem", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-1)" }}>
      {children}
      <figcaption style={cap}><strong style={{ color: "var(--text-secondary)" }}>Figure {n}.</strong> {caption}</figcaption>
    </figure>
  );
}

// tier styling shared by the path diagram
const TIER_META: Record<string, { c: string; name: string; where: string }> = {
  R5_SLM: { c: "var(--series-1)", name: "owned 1.7M decoder", where: "CPU, in-process" },
  R5_PII: { c: "var(--series-4)", name: "DistilBERT guard", where: "CPU, in-process" },
  R4_OPEN: { c: "var(--series-3)", name: "Qwen3-1.7B", where: "private T4 GPU" },
  R2_HAIKU: { c: "var(--series-5)", name: "Claude Haiku 4.5", where: "Anthropic API" },
  R1_SONNET: { c: "var(--series-6)", name: "Claude Sonnet 5", where: "Anthropic API" },
  R1_OPUS: { c: "var(--series-2)", name: "Claude Opus 5", where: "Anthropic API" },
  ANY: { c: "var(--text-muted)", name: "any single tier", where: "chosen for the demo" },
};
function Chip({ tier }: { tier: string }) {
  const m = TIER_META[tier];
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", padding: "0.3rem 0.55rem", borderRadius: 8, border: `1px solid ${m.c}`, background: "var(--surface-1)", minWidth: 118 }}>
      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: m.c }}>{tier === "ANY" ? "force" : tier}</span>
      <span style={{ fontSize: "0.78rem", color: "var(--text-primary)" }}>{m.name}</span>
      <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>{m.where}</span>
    </span>
  );
}

// ---------- Figure 1: system assembly ----------
function AssemblyFigure() {
  const box = (x: number, y: number, w: number, h: number, title: string, sub?: string, stroke = "var(--border)", fill = "var(--surface-2)") => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7} fill={fill} stroke={stroke} />
      <text x={x + w / 2} y={sub ? y + h / 2 - 3 : y + h / 2 + 4} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--text-primary)">{title}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">{sub}</text>}
    </g>
  );
  const sub = ["Auth + rate limit (demo key, 60/min/IP)", "PII redactor (in-process, CPU)", "Intent router (in-process, CPU)", "Owned SLM classifier (in-process, CPU)", "Cascade controller", "Request log + token P&L"];
  return (
    <svg viewBox="0 0 960 372" width="100%" role="img" aria-label="System assembly of the gateway and its tiers" style={sysFont}>
      {box(8, 150, 150, 64, "Web app", "Vercel, password-gated", "var(--series-1)")}
      <rect x={196} y={20} width={440} height={332} rx={10} fill="none" stroke="var(--series-1)" strokeWidth={1.5} />
      <text x={416} y={38} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--series-1)">Gateway (Modal ASGI, 2 CPU, scale-to-zero)</text>
      {sub.map((s, i) => box(214, 50 + i * 48, 404, 38, s, undefined, "var(--border)", "var(--surface-1)"))}
      {box(682, 30, 268, 70, "Model + data volume", "tiny, LoRA, PII, router, logs", "var(--series-4)")}
      {box(682, 150, 268, 70, "Open-weights tier", "Qwen3-1.7B on a T4, scale-to-zero", "var(--series-3)")}
      {box(682, 270, 268, 70, "Anthropic API", "Haiku 4.5, Sonnet 5, Opus 5", "var(--series-6)")}
      {/* arrows */}
      <defs><marker id="a" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted)" /></marker></defs>
      <path d="M158 182 L196 182" stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#a)" />
      <path d="M636 70 L682 66" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 3" markerEnd="url(#a)" />
      <text x={660} y={56} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">load at start</text>
      <path d="M636 190 L682 186" stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#a)" />
      <text x={660} y={178} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">R4 hop</text>
      <path d="M636 300 L682 304" stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#a)" />
      <text x={660} y={296} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">R2 / R1 hop</text>
    </svg>
  );
}

// ---------- Figure 3: every query path ----------
type Path = { q: string; note: string; chain: string[]; esc: string };
const PATHS: Path[] = [
  { q: "txn_categorise", note: "transaction narration", chain: ["R5_SLM", "R2_HAIKU"], esc: "escalates if the owned model top probability is below 0.80, or it fails" },
  { q: "pii_redact", note: "redaction request", chain: ["R5_PII"], esc: "terminal: the guard is the answer, never escalates" },
  { q: "chat", note: "customer question", chain: ["R4_OPEN", "R2_HAIKU"], esc: "escalates if the open model reports low confidence, or it fails" },
  { q: "doc_classify", note: "which document type", chain: ["R4_OPEN", "R2_HAIKU"], esc: "escalates if the open model reports low confidence, or it fails" },
  { q: "summarise", note: "summarise a filing", chain: ["R4_OPEN", "R2_HAIKU"], esc: "low confidence or failure; a third tier (Sonnet) is configured but the two-hop cap stops here" },
  { q: "draft", note: "draft a message", chain: ["R2_HAIKU", "R1_SONNET"], esc: "escalates if Haiku reports low confidence, or it fails" },
  { q: "code", note: "write code", chain: ["R1_SONNET"], esc: "single tier" },
  { q: "complex_analysis", note: "reason over numbers", chain: ["R1_OPUS"], esc: "single tier" },
];
const SPECIAL: Path[] = [
  { q: "low-confidence route", note: "router confidence below 0.55, or an unknown intent", chain: ["R2_HAIKU", "R1_SONNET"], esc: "escalates if Haiku reports low confidence, or it fails" },
  { q: "very long input", note: "estimated above 6000 tokens", chain: ["R2_HAIKU", "R1_SONNET"], esc: "the on-prem tiers are dropped; Haiku then Sonnet" },
  { q: "forced tier (demo)", note: "force_tier is set", chain: ["ANY"], esc: "planning is bypassed; exactly one hop" },
];
function PathRow({ path }: { path: Path }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 190px) 1fr", gap: "0.8rem", alignItems: "center", padding: "0.6rem 0", borderTop: "1px solid var(--border)" }}>
      <div>
        <div className="mono" style={{ fontSize: "0.82rem", fontWeight: 700 }}>{path.q}</div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{path.note}</div>
      </div>
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
          {path.chain.map((t, i) => (
            <span key={t + i} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              {i > 0 && <span aria-hidden style={{ color: "var(--text-muted)", fontWeight: 700 }}>{"→"}</span>}
              <Chip tier={t} />
            </span>
          ))}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{path.esc}</div>
      </div>
    </div>
  );
}
function PathsFigure() {
  return (
    <div style={sysFont}>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Routed by predicted intent</div>
      {PATHS.map((pp) => <PathRow key={pp.q} path={pp} />)}
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", margin: "0.9rem 0 0.2rem" }}>Overrides applied before the per-intent chain</div>
      {SPECIAL.map((pp) => <PathRow key={pp.q} path={pp} />)}
      <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.4rem", paddingTop: "0.4rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
        The first chip is the primary tier; the arrow shows the single escalation step. Every chain is capped at two hops. The privacy guard in Figure 4 runs before all of these.
      </div>
    </div>
  );
}

// ---------- Figure 4: redaction decision ----------
function RedactionFigure() {
  const box = (x: number, y: number, w: number, h: number, t: string, s?: string, stroke = "var(--border)") => (
    <g><rect x={x} y={y} width={w} height={h} rx={7} fill="var(--surface-1)" stroke={stroke} />
      <text x={x + w / 2} y={s ? y + h / 2 - 3 : y + h / 2 + 4} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--text-primary)">{t}</text>
      {s && <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">{s}</text>}</g>
  );
  return (
    <svg viewBox="0 0 960 220" width="100%" role="img" aria-label="How redaction is decided" style={sysFont}>
      <defs><marker id="r" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--text-muted)" /></marker></defs>
      {box(8, 90, 120, 48, "Input text")}
      {box(170, 40, 190, 48, "Regex detectors", "email, card (Luhn), phone, account, DOB", "var(--series-4)")}
      {box(170, 140, 190, 48, "DistilBERT tagger", "BIO over 8 entity types", "var(--series-1)")}
      {box(400, 90, 150, 48, "Merge spans", "specific beats OTHER")}
      {box(590, 90, 170, 48, "Apply placeholders", "[TYPE_n] + surrogate map")}
      {box(800, 90, 150, 48, "Redacted text", "flows onward", "var(--series-3)")}
      <path d="M128 108 L170 70" stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#r)" />
      <path d="M128 120 L170 158" stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#r)" />
      <path d="M360 64 L400 106" stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#r)" />
      <path d="M360 164 L400 120" stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#r)" />
      <path d="M550 114 L590 114" stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#r)" />
      <path d="M760 114 L800 114" stroke="var(--text-muted)" strokeWidth={1.5} markerEnd="url(#r)" />
      <text x={480} y={205} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">The surrogate map is kept so the original entities can be restored in the final answer (de-redaction).</text>
    </svg>
  );
}

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <table className="data" style={{ ...sysFont, fontSize: "0.84rem", width: "100%" }}>
      <tbody>{rows.map(([k, v]) => (
        <tr key={k}><td style={{ width: "34%", color: "var(--text-secondary)", fontWeight: 600, verticalAlign: "top" }}>{k}</td><td style={{ color: "var(--text-primary)" }}>{v}</td></tr>
      ))}</tbody>
    </table>
  );
}
function ConfigCard({ title, color, rows }: { title: string; color: string; rows: [string, string][] }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "0.7rem 0.9rem", margin: "0.9rem 0", background: "var(--surface-1)" }}>
      <div style={{ ...sysFont, fontWeight: 700, marginBottom: "0.3rem" }}>{title}</div>
      <div style={{ overflowX: "auto" }}><KV rows={rows} /></div>
    </div>
  );
}

export default function ArchitecturePage() {
  return (
    <article style={{ maxWidth: 900, margin: "0 auto", ...serif }}>
      <header style={{ borderBottom: "2px solid var(--border)", paddingBottom: "0.9rem" }}>
        <p style={{ ...sysFont, fontSize: "0.8rem", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--series-1)", fontWeight: 700, margin: 0 }}>Experiment by Seetha</p>
        <h1 style={{ fontSize: "1.55rem", lineHeight: 1.22, fontWeight: 700, margin: "0.45rem 0 0.35rem" }}>Architecture and training detail</h1>
        <p style={{ fontSize: "0.98rem", color: "var(--text-secondary)", margin: 0 }}>
          How the gateway is assembled, how every query is routed, how redaction and classification are decided, and the exact training configuration of each model.
        </p>
      </header>

      <H n="1" id="a1">System assembly</H>
      <p style={p}>
        A single gateway serves all traffic. It runs as a small server on shared CPU that scales to zero when idle. When a container starts, it loads the trained artefacts from a shared volume: the owned classifier, the privacy model, the intent probe, and the frozen few-shot prompt used by the frontier tiers. If the privacy model is missing it falls back to regular expressions alone. Two tiers live outside the gateway: the open-weights model runs as a separate GPU service that also scales to zero, and the frontier tiers are the Anthropic API. The classifier, the guard and the router run inside the gateway process on CPU; the two heavier tiers are called out over the network only when the plan requires them.
      </p>
      <Fig n={1} caption="The gateway loads its models from the volume at startup, answers the cheap tiers in-process on CPU, and reaches out to the GPU service or the Anthropic API only for the tiers a request actually needs. Access needs a demo key and is rate limited.">
        <AssemblyFigure />
      </Fig>

      <H n="2" id="a2">How a query is decided</H>
      <p style={p}>
        Every call to the routing endpoint follows the same fixed procedure. The steps below list the exact thresholds used.
      </p>
      <ol style={{ ...p, paddingLeft: "1.3rem" }}>
        <li style={{ margin: "0.4rem 0" }}><strong>Redact.</strong> The privacy guard runs first and replaces every detected identifier with a placeholder. Only the redacted text continues. Nothing downstream sees a raw identifier.</li>
        <li style={{ margin: "0.4rem 0" }}><strong>Classify intent.</strong> The redacted text is embedded and passed to the calibrated probe, which returns an intent and a confidence between zero and one.</li>
        <li style={{ margin: "0.4rem 0" }}><strong>Plan the chain.</strong> If a tier is forced, that single tier is used. Otherwise, if the intent is unknown or the confidence is below <span className="mono">0.55</span>, the request takes the general path Haiku then Sonnet. Otherwise it takes the chain configured for that intent. If the input is estimated above <span className="mono">6000</span> tokens, the on-prem tiers are removed from the chain. The chain is capped at <span className="mono">2</span> hops.</li>
        <li style={{ margin: "0.4rem 0" }}><strong>Run the cascade.</strong> The tiers in the chain are called in order. After each hop the controller escalates one step if the call failed, if the owned model top probability is below <span className="mono">0.80</span>, or if a language-model tier reports <span className="mono">low</span> confidence. The first adequate hop wins; otherwise the last hop answers.</li>
        <li style={{ margin: "0.4rem 0" }}><strong>De-redact and report.</strong> The placeholders in the answer are replaced with the original entities, and the response carries a per-hop receipt of tokens, latency and cost.</li>
      </ol>

      <H n="3" id="a3">Every path a query can take</H>
      <p style={p}>
        The router recognises eight workload classes, each with its own chain. Three overrides can change the chain before it runs: a forced tier, a low-confidence or unknown intent, and a very long input. Figure 3 shows all of them, with the condition that triggers the single escalation step in each.
      </p>
      <Fig n={3} caption="Every routing path. Colour marks where each tier runs: blue and yellow are on CPU inside the gateway, aqua is the private GPU, and the magenta and violet tiers are the frontier API. The cascade never exceeds two hops.">
        <PathsFigure />
      </Fig>

      <H n="4" id="a4">How redaction is decided</H>
      <p style={p}>
        Redaction combines two detectors. High-precision regular expressions catch structured identifiers: email addresses, card numbers validated with the Luhn checksum, phone numbers, account and routing numbers, and dates of birth. The fine-tuned DistilBERT tagger catches the rest, in particular names and addresses, which pattern matching cannot see. The two sets of spans are merged into a non-overlapping list, and on any overlap a specific label is preferred over the catch-all OTHER, so a card number is labelled as a card rather than as generic text. Each surviving span is replaced with a numbered placeholder such as <span className="mono">[CARD_1]</span>, and the mapping from placeholder to original is kept so the final answer can be restored. Because this runs before the router and before any model call, no raw identifier reaches the classifier, the on-prem tiers, the GPU service or the frontier API.
      </p>
      <Fig n={4} caption="The redaction path. Regular expressions and the learned tagger run in parallel, their spans are merged with a preference for specific labels, and only redacted text moves on. The surrogate map enables exact restoration afterwards.">
        <RedactionFigure />
      </Fig>

      <H n="5" id="a5">How classification and routing are decided</H>
      <p style={p}>
        Two different classifiers are involved, and it helps to keep them separate. The owned model in the R5 tier decides the spending category of a transaction. The router decides the workload class of an arbitrary request, which determines the tier chain. The router is a linear probe: a frozen multilingual sentence encoder turns the redacted text into a fixed vector, and a calibrated logistic-regression head assigns a probability to each of the eight classes. The predicted class is the highest probability, and the confidence is that probability. Calibration matters here, because the plan trusts the number: high-confidence routes are correct almost always, so a low confidence can safely be diverted to the general frontier path rather than to a specialised chain that might be wrong. The owned classifier reports its own confidence as the softmax maximum over the label set, and the cascade escalates when that maximum is below 0.80, which is how novel merchants are handed up to a stronger model.
      </p>

      <H n="6" id="a6">Training and configuration</H>
      <p style={p}>
        The trainable components and their exact settings are listed below. Every model is trained on serverless GPUs and evaluated with the protocol described in the paper.
      </p>
      <ConfigCard title="Owned tiny decoder (R5 / R6) - trained from scratch" color="var(--series-1)" rows={[
        ["Type", "Pre-layernorm causal Transformer decoder, random initialisation"],
        ["Parameters", "1,722,368 total"],
        ["Shape", "6 layers, model width 128, 4 attention heads, feed-forward 512, context 64 tokens"],
        ["Embeddings", "Input and output embeddings tied; learned positional embeddings"],
        ["Prediction head", "Label read at the <sep> position, scored only against the per-class label-token embeddings"],
        ["Tokenizer", "Byte-level BPE, fixed vocabulary 4096, NFKC and lowercase, one special token per class plus pad/bos/sep"],
        ["Objective", "Cross-entropy on the label plus 0.1 times an auxiliary next-token loss on the narration"],
        ["Optimiser", "AdamW, learning rate 3e-3, weight decay 0.1, betas 0.9 and 0.95, one-cycle schedule, gradient clip 1.0"],
        ["Batch and epochs", "256; 6 epochs for transactions, 12 for Banking77; seed 42"],
        ["Hardware and time", "One T4 GPU, about 107 seconds; latency measured on 2 CPU cores"],
        ["Confidence", "Softmax maximum over the label logits"],
      ]} />
      <ConfigCard title="LoRA small language model (R5)" color="var(--series-2)" rows={[
        ["Base", "Qwen3-0.6B, frozen, half precision"],
        ["Adapter", "LoRA rank 16, alpha 32, dropout 0.05, on the query, key, value and output projections"],
        ["Trainable", "4,587,520 of 600,000,000 parameters, about 0.76 percent"],
        ["Format", "Prompt 'Categorise the bank transaction ... category:' then the label; loss masked to the label tokens; maximum length 96"],
        ["Optimiser", "AdamW, learning rate 2e-4, batch 32, 1 epoch, half-precision autocast"],
        ["Inference", "Left-padded, greedy, up to 8 new tokens, batches of 64; output snapped to the nearest label"],
        ["Hardware and time", "One T4 GPU, about 280 seconds"],
      ]} />
      <ConfigCard title="Privacy guardrail (R5-PII)" color="var(--series-4)" rows={[
        ["Base", "distilbert-base-multilingual-cased, about 134.7M parameters, full fine-tune"],
        ["Task", "Token classification with BIO tags over 8 coarse types (person, account, card, phone, email, address, date of birth, other), 17 tags"],
        ["Config", "Maximum length 128, batch 32, 3 epochs, learning rate 5e-5, weight decay 0.01, 6 percent warmup, half precision"],
        ["Serving", "Model spans unioned with high-precision regular expressions; median latency about 90 milliseconds per document"],
        ["Hardware and time", "One T4 GPU, about 165 seconds"],
      ]} />
      <ConfigCard title="Intent router (R3)" color="var(--series-5)" rows={[
        ["Encoder", "paraphrase-multilingual-MiniLM-L12-v2, frozen, embeddings L2-normalised"],
        ["Head", "Logistic regression (C = 2.0), wrapped in five-fold probability calibration"],
        ["Trained", "Head only, 1600 examples, about 37 seconds"],
        ["Output", "Intent, calibrated confidence, and the top three classes"],
        ["Thresholds used by the plan", "Route as uncertain below 0.55 confidence; escalate the owned model below 0.80; long-input cut-off 6000 tokens; at most 2 hops"],
      ]} />
      <ConfigCard title="Open-weights tier (R4)" color="var(--series-3)" rows={[
        ["Model", "Qwen3-1.7B, half precision, scaled dot-product attention, served on a T4"],
        ["Serving", "Separate GPU service, scale-to-zero (0 warm by default, up to 2 containers), 4 concurrent inputs, 600-second idle window"],
        ["Latency", "Cold start about 35 to 60 seconds; warm about 1.5 to 4 seconds"],
        ["Generation", "Chat template, thinking disabled, greedy, up to 256 new tokens, JSON answer with a confidence field"],
      ]} />
      <ConfigCard title="Frontier tiers (R2 / R1) - in-context learning only" color="var(--series-6)" rows={[
        ["Models", "Claude Haiku 4.5 (R2), Claude Sonnet 5 and Claude Opus 5 (R1)"],
        ["Technique", "No weights trained; a frozen system prompt of instructions plus 60 stratified few-shot examples from the training split"],
        ["Caching", "The prompt is padded with more training rows until it clears the 4096-token cache minimum and is byte-identical across calls, so the prompt cache is reused"],
        ["Output", "JSON schema with a category or answer and a high, medium or low confidence; no assistant prefill; Sonnet reasoning disabled; Opus effort low; up to 64 tokens for classification"],
        ["Cost basis", "Measured tokens times list price with the cache discount; a 50 percent batch path exists, and a synchronous cached path is used when the batch queue is slow"],
      ]} />

      <H n="7" id="a7">Where each tier runs and how it is billed</H>
      <div style={{ overflowX: "auto", margin: "0.8rem 0" }}>
        <table className="data" style={{ ...sysFont, fontSize: "0.84rem" }}>
          <thead><tr><th>Tier</th><th>Model</th><th>Where it runs</th><th>How it is invoked</th><th>Cost basis</th></tr></thead>
          <tbody>
            {[
              ["R6/R5", "owned 1.7M decoder", "gateway CPU, in-process", "direct function call", "CPU seconds / throughput"],
              ["R5-PII", "DistilBERT guard", "gateway CPU, in-process", "direct function call", "CPU seconds / throughput"],
              ["R4", "Qwen3-1.7B", "private T4 GPU service", "network call to the GPU class", "T4 seconds per call"],
              ["R2", "Claude Haiku 4.5", "Anthropic API", "HTTPS with a cached prompt", "tokens times list price"],
              ["R1", "Claude Sonnet 5 / Opus 5", "Anthropic API", "HTTPS with a cached prompt", "tokens times list price"],
            ].map((r) => <tr key={r[0] + r[1]}>{r.map((c, j) => <td key={j} className={j <= 1 ? "mono" : undefined} style={{ color: j === 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>{c}</td>)}</tr>)}
          </tbody>
        </table>
        <p style={cap}>Table 1. The physical placement and billing of each tier. The first two never leave the gateway; the last three are called only when the plan reaches them.</p>
      </div>

      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", ...sysFont, marginTop: "1.4rem" }}>
        <Link href="/research" style={{ padding: "0.6rem 0.9rem", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", fontWeight: 700, color: "var(--text-primary)", background: "var(--surface-1)" }}>Read the full write-up</Link>
        <Link href="/router" style={{ padding: "0.6rem 0.9rem", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", fontWeight: 700, color: "var(--text-primary)", background: "var(--surface-1)" }}>Watch a request route, live</Link>
        <Link href="/guardrail" style={{ padding: "0.6rem 0.9rem", border: "1px solid var(--border)", borderRadius: 8, textDecoration: "none", fontWeight: 700, color: "var(--text-primary)", background: "var(--surface-1)" }}>Try the redaction guard</Link>
      </div>
    </article>
  );
}
