"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import piiEval from "@/data/phase3_pii_eval.json";
import { Note, Section, StatTile, Tip } from "@/components/ui";
import { api, isConfigured } from "@/lib/api";
import { ENTITY_COLOR } from "@/lib/palette";
import { fmtNum, fmtPct } from "@/lib/pricing";
import type { PiiEval, PiiResponse } from "@/lib/types";

const E = piiEval as unknown as PiiEval;
const SAMPLE = "Hi, this is Ana Ruiz. My account 48213377 was charged twice on 2025-03-15. Card ending 4111 1111 1111 1111. Call me on +1 415 555 0134 or ana.ruiz@example.com. I live at 12 Harbour Street, Sydney.";

function Highlight({ text, ents }: { text: string; ents: PiiResponse["entities"] }) {
  const out = []; let pos = 0;
  for (const e of [...ents].sort((a, b) => a.start - b.start)) { out.push(<span key={`t${pos}`}>{text.slice(pos, e.start)}</span>); out.push(<span key={`e${e.start}`} className="ent" style={{ borderColor: ENTITY_COLOR[e.label] || "var(--text-muted)", background: `color-mix(in oklab, ${ENTITY_COLOR[e.label] || "var(--text-muted)"} 18%, transparent)` }} title={e.label}>{text.slice(e.start, e.end)}</span>); pos = e.end; }
  out.push(<span key="tail">{text.slice(pos)}</span>);
  return <div className="text-sm leading-7">{out}</div>;
}

export default function Guardrail() {
  const [text, setText] = useState(SAMPLE);
  const [res, setRes] = useState<PiiResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const run = async () => { setBusy(true); try { const r = await api.pii(text); setRes(r); setCount((c) => c + r.entities.length); } catch (e) { alert(String(e)); } finally { setBusy(false); } };
  const labels = Array.from(new Set([...Object.keys(E.regex_only?.per_label || {}), ...Object.keys(E.model_union_regex?.per_label || {})]));
  const data = labels.map((l) => ({ label: l, model: E.model_union_regex?.per_label?.[l]?.f1 ?? null, regex: E.regex_only?.per_label?.[l]?.f1 ?? null }));
  return (
    <div>
      <h1 className="text-xl font-semibold">Phase 3 · the PII guardrail</h1>
      <p className="muted text-sm">A {E.base} token classifier (full fine-tune) runs in front of every frontier call; numeric patterns are unioned with a Luhn-checked regex. The frontier only ever sees placeholders; the answer is de-redacted on the way back.</p>
      <Note status={E.status} note={E.note} />
      <div className="grid md:grid-cols-4 gap-3 mt-3">
        <StatTile label="Entity F1 · model ∪ regex" value={fmtPct(E.model_union_regex?.f1)} sub={`${fmtNum(E.model_union_regex?.n)} held-out texts`} color="var(--series-1)" />
        <StatTile label="Entity F1 · regex only" value={fmtPct(E.regex_only?.f1)} sub={`names: ${fmtPct(E.regex_only?.per_label?.PER?.f1 ?? 0)}`} color="var(--series-2)" />
        <StatTile label="Guard latency p50" value={E.latency_ms?.p50 != null ? `${E.latency_ms.p50} ms` : "—"} sub="CPU, 2 threads" />
        <StatTile label="PII sent to frontier (this session)" value="0" sub={`${count} entities redacted live`} color="var(--series-6)" />
      </div>
      <Section title="Try it" right={<button className="btn btn-primary" onClick={run} disabled={busy || !isConfigured()}>{busy ? "…" : "Redact"}</button>}>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        {!isConfigured() && <p className="muted text-xs mt-2">Offline: set NEXT_PUBLIC_API_BASE to enable live calls.</p>}
        {res && (
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <div className="card"><div className="muted text-xs uppercase">raw · {res.entities.length} entities found by {res.model} in {res.latency_ms} ms</div><Highlight text={text} ents={res.entities} /></div>
            <div className="card"><div className="muted text-xs uppercase">what the frontier model receives</div><div className="text-sm leading-7 mono">{res.redacted}</div></div>
            <div className="md:col-span-2"><table className="data"><thead><tr><th>Label</th><th>Text</th><th>Score</th></tr></thead><tbody>{res.entities.map((e, i) => <tr key={i}><td><span className="swatch" style={{ background: ENTITY_COLOR[e.label] }} />{e.label}</td><td className="mono">{text.slice(e.start, e.end)}</td><td className="mono">{e.score ?? "regex"}</td></tr>)}</tbody></table></div>
          </div>
        )}
      </Section>
      <Section title="Entity-level F1 by label: fine-tuned model vs regex">
        <div style={{ height: 240 }}><ResponsiveContainer><BarChart data={data} margin={{ left: 10, right: 10 }} barGap={2} barSize={18}>
          <CartesianGrid vertical={false} /><XAxis dataKey="label" /><YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={50} />
          <Tooltip content={<Tip fmt={(v) => fmtPct(v)} />} cursor={{ fill: "var(--surface-2)" }} /><Legend />
          <Bar dataKey="model" name="model ∪ regex" fill="var(--series-1)" radius={[4, 4, 0, 0]} /><Bar dataKey="regex" name="regex only" fill="var(--series-2)" radius={[4, 4, 0, 0]} />
        </BarChart></ResponsiveContainer></div>
        <p className="muted text-xs">Regex cannot find names or addresses; that gap is the case for the model. Dataset: ai4privacy FinPII (human-validated, six languages, no Japanese).</p>
      </Section>
    </div>
  );
}
