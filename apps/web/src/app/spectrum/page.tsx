"use client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import bench from "@/data/phase1_benchmark.json";
import { Note, Section, StatTile, Swatch, Tip } from "@/components/ui";
import { api, isConfigured } from "@/lib/api";
import { MODEL_COLOR } from "@/lib/palette";
import { fmtAxisUsd, fmtNum, fmtPct, fmtUsd } from "@/lib/pricing";
import type { Benchmark } from "@/lib/types";

const B = bench as unknown as Benchmark;

export default function Spectrum() {
  const [unseen, setUnseen] = useState(false);
  const [text, setText] = useState("AMZN MKTP US*2K3J9 SEATTLE WA");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const models = B.models.filter((m) => m.accuracy != null || m.id === "tiny");
  const acc = useMemo(() => models.map((m) => ({ name: m.label, id: m.id, v: unseen ? m.accuracy_unseen : m.accuracy })), [models, unseen]);
  const cost = models.filter((m) => m.cost_per_1m_usd != null).map((m) => ({ name: m.label, id: m.id, v: m.cost_per_1m_usd as number }));
  const classify = async () => { setBusy(true); try { setRes(await api.classify([text])); } catch (e: any) { setRes({ error: String(e) }); } finally { setBusy(false); } };
  return (
    <div>
      <h1 className="text-xl font-semibold">Phase 1 · the JPMorgan replica</h1>
      <p className="muted text-sm">Dataset: {B.dataset.hf_id || B.dataset.dataset} · {fmtNum(B.dataset.n)} rows · {B.dataset.n_labels} classes · results {B.status} ({B.generated_at})</p>
      <Note status={B.status} note={B.note} />
      <div className="grid md:grid-cols-5 gap-3 mt-3">
        {B.models.map((m) => (
          <StatTile key={m.id} label={m.label} color={MODEL_COLOR[m.id]} value={fmtPct(unseen ? m.accuracy_unseen : m.accuracy)}
            sub={<span>{m.params ? `${fmtNum(m.params)} params` : "undisclosed size"} · p50 {m.latency_ms?.p50 ?? "—"} ms · {fmtUsd(m.cost_per_1m_usd, 2)}/1M<br /><span style={{ opacity: .8 }}>{m.technique}</span></span>} />
        ))}
      </div>
      <Section title={unseen ? "Accuracy on merchants never seen in training" : "Accuracy on the test split"} right={<label className="text-sm flex items-center gap-2"><input type="checkbox" checked={unseen} onChange={(e) => setUnseen(e.target.checked)} /> unseen merchants</label>}>
        <div style={{ height: 240 }}>
          <ResponsiveContainer><BarChart data={acc} layout="vertical" margin={{ left: 40, right: 40 }} barSize={18}>
            <CartesianGrid horizontal={false} /><XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} /><YAxis type="category" dataKey="name" width={200} />
            <Tooltip content={<Tip fmt={(v) => fmtPct(v)} />} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="v" name="accuracy" radius={[0, 4, 4, 0]} label={{ position: "right", formatter: (v: any) => (v == null ? "—" : fmtPct(v)), fill: "var(--text-secondary)", fontSize: 12 }}>
              {acc.map((d) => <Cell key={d.id} fill={MODEL_COLOR[d.id]} />)}</Bar>
          </BarChart></ResponsiveContainer>
        </div>
        <p className="muted text-xs">Frontier models are expected to win on unseen merchants: that gap is why the gateway escalates low-confidence items instead of trusting the tiny model everywhere.</p>
      </Section>
      <Section title="Cost per one million classifications (log scale)">
        <div style={{ height: 220 }}>
          <ResponsiveContainer><BarChart data={cost} layout="vertical" margin={{ left: 40, right: 60 }} barSize={18}>
            <CartesianGrid horizontal={false} /><XAxis type="number" scale="log" domain={[0.01, "auto"]} tickFormatter={fmtAxisUsd} /><YAxis type="category" dataKey="name" width={200} />
            <Tooltip content={<Tip fmt={(v) => fmtUsd(v, 2)} />} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="v" name="$ / 1M" radius={[0, 4, 4, 0]} label={{ position: "right", formatter: (v: any) => fmtUsd(v, 2), fill: "var(--text-secondary)", fontSize: 12 }}>
              {cost.map((d) => <Cell key={d.id} fill={MODEL_COLOR[d.id]} />)}</Bar>
          </BarChart></ResponsiveContainer>
        </div>
        <p className="muted text-xs">Owned model: Modal CPU rate ÷ measured throughput (marginal, no warm-pool floor). Frontier: measured tokens × list price with the cached system prompt. JPMorgan's production figure was $0.24 vs $812.</p>
      </Section>
      <Section title="Model table">
        <div className="overflow-x-auto"><table className="data"><thead><tr><th>Model</th><th>Tier</th><th>Technique</th><th>Params</th><th>Acc.</th><th>Macro-F1</th><th>Unseen</th><th>p50 / p95 ms</th><th>$ / 1M</th><th>Train</th></tr></thead>
          <tbody>{B.models.map((m) => <tr key={m.id}><td><Swatch color={MODEL_COLOR[m.id]} label={m.label} /></td><td>{m.tier}</td><td className="muted">{m.technique}</td><td className="mono">{m.params ? fmtNum(m.params) : "—"}{m.trainable_params ? ` (${fmtNum(m.trainable_params)} trainable)` : ""}</td><td className="mono">{fmtPct(m.accuracy)}</td><td className="mono">{fmtPct(m.macro_f1)}</td><td className="mono">{fmtPct(m.accuracy_unseen)}</td><td className="mono">{m.latency_ms?.p50 ?? "—"} / {m.latency_ms?.p95 ?? "—"}</td><td className="mono">{fmtUsd(m.cost_per_1m_usd, 2)}</td><td className="mono">{m.train_seconds ? `${fmtNum(m.train_seconds)} s ${m.train_device || ""}` : "—"}</td></tr>)}</tbody></table></div>
      </Section>
      <Section title="Classify a narration with the owned model (live)">
        <div className="flex gap-2 flex-wrap"><input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 min-w-[280px]" /><button className="btn btn-primary" onClick={classify} disabled={busy || !isConfigured()}>{busy ? "…" : "Classify"}</button></div>
        {!isConfigured() && <p className="muted text-xs mt-2">Offline: set NEXT_PUBLIC_API_BASE to enable live calls.</p>}
        {res && <pre className="mono text-xs mt-2 overflow-x-auto">{JSON.stringify(res, null, 1)}</pre>}
      </Section>
      {B.models[0]?.per_class?.length > 0 && (
        <Section title="Per-class F1 (owned model)">
          <div className="flex flex-wrap gap-1">{B.models[0].per_class.map((c) => <span key={c.c} className="chip" title={`F1 ${c.f1}`}><span className="swatch" style={{ background: `color-mix(in oklab, var(--series-1) ${Math.round(c.f1 * 100)}%, var(--surface-2))` }} />{c.c} <span className="mono">{c.f1.toFixed(2)}</span></span>)}</div>
        </Section>
      )}
    </div>
  );
}
