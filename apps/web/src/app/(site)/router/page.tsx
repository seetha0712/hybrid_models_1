"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import replay from "@/data/phase2_replay_sample.json";
import routerEval from "@/data/phase2_router_eval.json";
import { Note, Section, StatTile, Swatch, Tip } from "@/components/ui";
import { api, isConfigured } from "@/lib/api";
import { TIER_COLOR, TIER_LABEL, TIER_ORDER } from "@/lib/palette";
import { claudeCost, fmtAxisUsd, fmtNum, fmtPct, fmtUsd, PRICING } from "@/lib/pricing";
import type { RouteResponse, RouteRow, RouterEval } from "@/lib/types";

const RP = replay as any;
const RE = routerEval as unknown as RouterEval;
const SCRIPTED = [
  "Categorise this transaction: WHOLE FOODS MKT #10 SEATTLE WA",
  "Categorise this transaction: SQ *NEW VENDOR 8821 AUSTIN TX",
  "Summarise in three lines: The company reported revenue growth of 12% driven by services; operating margin compressed by 80bps due to input costs; guidance for the full year was maintained.",
  "Draft a polite email to Ana Ruiz (ana@example.com, card 4111 1111 1111 1111) about the fee change on her account.",
  "Analyse the two hedging strategies (rolling 3-month FX forwards vs a 1-year option collar) for a JPY-funded USD asset and recommend one with the key risks.",
];

function whatIf(rows: RouteRow[], pctFlagship: number) {
  // Replays each logged request: with probability pctFlagship it is priced as if sent to Sonnet 5 with the same tokens.
  let policy = 0, flagship = 0, small = 0, blended = 0;
  rows.forEach((r, i) => {
    const tin = r.hops.reduce((a, h) => a + (h.tokens?.in || 0) + (h.tokens?.cache_read || 0) + (h.tokens?.cache_write || 0), 0) || r.n_tokens_est;
    const tout = r.hops.reduce((a, h) => a + (h.tokens?.out || 0), 0) || 40;
    const f = claudeCost("claude-sonnet-5", { in: tin, cache_write: 0, cache_read: 0, out: tout });
    policy += r.total_cost_usd; flagship += f; small += PRICING.self_hosted_defaults.variable_per_task_usd;
    blended += (i % 100) < pctFlagship ? f : r.total_cost_usd;
  });
  return { policy, flagship, small, blended };
}

export default function Router() {
  const [rows, setRows] = useState<RouteRow[]>(RP.rows);
  const [live, setLive] = useState(false);
  const [text, setText] = useState(SCRIPTED[0]);
  const [force, setForce] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<RouteResponse | null>(null);
  const [pct, setPct] = useState(0);
  useEffect(() => { if (isConfigured()) api.replay(300).then((r) => { if (r.rows.length) { setRows(r.rows); setLive(true); } }).catch(() => {}); }, []);
  const send = async () => {
    setBusy(true);
    try { const r = await api.route(text, force || undefined); setLast(r); setRows((rs) => [...rs, r]); setLive(true); } catch (e: any) { setLast({ answer: `error: ${e}` } as any); } finally { setBusy(false); }
  };
  const byTier = useMemo(() => {
    const m: Record<string, { tier: string; tasks: number; cost: number; lat: number[]; esc: number }> = {};
    rows.forEach((r) => { const b = (m[r.final_tier] ||= { tier: r.final_tier, tasks: 0, cost: 0, lat: [], esc: 0 }); b.tasks++; b.cost += r.total_cost_usd; b.lat.push(r.total_latency_ms); b.esc += Math.max(0, r.hops.length - 1); });
    return TIER_ORDER.filter((t) => m[t]).map((t) => { const b = m[t]; const l = [...b.lat].sort((a, c) => a - c); return { ...b, per: b.cost / b.tasks, p50: l[Math.floor(l.length / 2)] }; });
  }, [rows]);
  const cum = useMemo(() => { let p = 0, f = 0, s = 0; return rows.map((r, i) => { const w = whatIf([r], 0); p += w.policy; f += w.flagship; s += w.small; return { i: i + 1, policy: p, flagship: f, small: s }; }); }, [rows]);
  const wi = whatIf(rows, pct);
  return (
    <div>
      <h1 className="text-xl font-semibold">Phase 2 · gateway, router, token P&amp;L</h1>
      <p className="muted text-sm">guard → intent (linear probe, {RE.accuracy != null ? `${fmtPct(RE.accuracy)} on ${RE.n_test} held-out real requests` : "not yet trained"}) → cheapest adequate tier → escalate on low confidence. {live ? "Showing live logged traffic." : "Showing the recorded replay."}</p>
      <Note status={live ? "measured" : RP.status} note={RP.note} />
      <Section title="Send a request">
        <div className="flex flex-wrap gap-1 mb-2">{SCRIPTED.map((s, i) => <button key={i} className="btn" onClick={() => setText(s)}>script {i + 1}</button>)}</div>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2 mt-2 items-center flex-wrap">
          <select value={force} onChange={(e) => setForce(e.target.value)}><option value="">policy decides</option>{TIER_ORDER.filter((t) => t !== "R5_PII").map((t) => <option key={t} value={t}>force {TIER_LABEL[t]}</option>)}</select>
          <button className="btn btn-primary" onClick={send} disabled={busy || !isConfigured()}>{busy ? "routing…" : "Route"}</button>
          {!isConfigured() && <span className="muted text-xs">offline: set NEXT_PUBLIC_API_BASE</span>}
        </div>
        {last && last.hops && (
          <div className="mt-3 grid md:grid-cols-3 gap-3">
            <div className="card md:col-span-1">
              <div className="muted text-xs uppercase">route trace</div>
              <div className="text-sm mt-1"><span className="chip"><span className="swatch" style={{ background: TIER_COLOR.R5_PII }} />guard: {last.pii.redacted_count} redacted · {last.pii.guard_ms} ms</span></div>
              <div className="text-sm mt-1"><span className="chip">intent: {last.intent} <span className="mono">{fmtPct(last.intent_confidence)}</span></span></div>
              {last.hops.map((h, i) => <div key={i} className="text-sm mt-1"><span className="chip"><span className="swatch" style={{ background: TIER_COLOR[h.tier] }} />{h.escalated ? "↳ " : ""}{TIER_LABEL[h.tier]} · {h.ok ? `conf ${h.confidence ?? "—"}` : `failed: ${h.error}`} · {h.latency_ms} ms · {fmtUsd(h.cost_usd, 6)}</span></div>)}
              <div className="mono text-sm mt-2">total {fmtUsd(last.total_cost_usd, 6)} · {fmtNum(last.total_latency_ms)} ms · PII to frontier: {last.pii.sent_to_frontier}</div>
            </div>
            <div className="card md:col-span-2"><div className="muted text-xs uppercase">answer</div><div className="text-sm mt-1 whitespace-pre-wrap">{last.answer}</div>{last.redacted_input && last.redacted_input !== text && <div className="muted text-xs mt-2">sent upstream as: <span className="mono">{last.redacted_input}</span></div>}</div>
          </div>
        )}
      </Section>
      <div className="grid md:grid-cols-4 gap-3 mt-4">
        <StatTile label="Requests" value={fmtNum(rows.length)} sub={`${rows.filter((r) => r.escalated).length} escalated`} />
        <StatTile label="Spent under policy" value={fmtUsd(wi.policy, 4)} color="var(--series-1)" />
        <StatTile label="Same traffic, all flagship" value={fmtUsd(wi.flagship, 4)} sub={`${wi.policy > 0 ? (wi.flagship / wi.policy).toFixed(1) : "—"}× the policy bill`} color="var(--series-2)" />
        <StatTile label="PII entities sent to frontier" value="0" sub={`${fmtNum(rows.reduce((a, r) => a + (r.pii?.redacted_count || 0), 0))} redacted by the guard`} color="var(--series-6)" />
      </div>
      <Section title="What if we forced a share of traffic to the flagship?" right={<span className="mono text-sm">{pct}% → {fmtUsd(wi.blended, 4)}</span>}>
        <input type="range" min={0} max={100} value={pct} onChange={(e) => setPct(+e.target.value)} className="w-full" />
        <div className="muted text-xs">0% = current policy · 100% = everything on Claude Sonnet 5 with the same token counts. All-small floor: {fmtUsd(wi.small, 6)}.</div>
      </Section>
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Cost per completed task, by final tier">
          <div style={{ height: 220 }}><ResponsiveContainer><BarChart data={byTier} layout="vertical" margin={{ left: 20, right: 70 }} barSize={16}>
            <CartesianGrid horizontal={false} /><XAxis type="number" scale="log" domain={["auto", "auto"]} tickFormatter={fmtAxisUsd} /><YAxis type="category" dataKey="tier" width={90} tickFormatter={(t) => t.replace("_", " ")} />
            <Tooltip content={<Tip fmt={(v) => fmtUsd(v, 6)} />} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="per" name="$ per task" radius={[0, 4, 4, 0]} label={{ position: "right", formatter: (v: any) => fmtUsd(v, 5), fill: "var(--text-secondary)", fontSize: 11 }}>{byTier.map((b) => <Cell key={b.tier} fill={TIER_COLOR[b.tier]} />)}</Bar>
          </BarChart></ResponsiveContainer></div>
          <table className="data mt-2"><thead><tr><th>Tier</th><th>Tasks</th><th>$ / task</th><th>p50 ms</th><th>Escalations</th></tr></thead><tbody>{byTier.map((b) => <tr key={b.tier}><td><Swatch color={TIER_COLOR[b.tier]} label={TIER_LABEL[b.tier]} /></td><td className="mono">{b.tasks}</td><td className="mono">{fmtUsd(b.per, 6)}</td><td className="mono">{fmtNum(b.p50)}</td><td className="mono">{b.esc}</td></tr>)}</tbody></table>
        </Section>
        <Section title="Cumulative token P&L">
          <div style={{ height: 260 }}><ResponsiveContainer><AreaChart data={cum} margin={{ left: 10, right: 10 }}>
            <CartesianGrid vertical={false} /><XAxis dataKey="i" /><YAxis tickFormatter={fmtAxisUsd} width={70} />
            <Tooltip content={<Tip fmt={(v) => fmtUsd(v, 4)} />} /><Legend />
            <Area type="monotone" dataKey="flagship" name="all flagship" stroke="var(--series-2)" fill="var(--series-2)" fillOpacity={0.12} strokeWidth={2} />
            <Area type="monotone" dataKey="policy" name="policy" stroke="var(--series-1)" fill="var(--series-1)" fillOpacity={0.2} strokeWidth={2} />
            <Area type="monotone" dataKey="small" name="all small" stroke="var(--series-3)" fill="var(--series-3)" fillOpacity={0.1} strokeWidth={2} />
          </AreaChart></ResponsiveContainer></div>
        </Section>
      </div>
      <Section title="Last requests">
        <div className="overflow-x-auto"><table className="data"><thead><tr><th>Request</th><th>Intent</th><th>Path</th><th>$</th><th>ms</th><th>PII</th></tr></thead>
          <tbody>{[...rows].reverse().slice(0, 25).map((r) => <tr key={r.request_id}><td className="max-w-[360px] truncate">{r.text_preview}</td><td>{r.intent} <span className="muted mono">{fmtPct(r.intent_confidence)}</span></td><td>{r.hops.map((h, i) => <span key={i}><span className="swatch" style={{ background: TIER_COLOR[h.tier] }} />{h.tier}{i < r.hops.length - 1 ? " → " : ""}</span>)}</td><td className="mono">{fmtUsd(r.total_cost_usd, 6)}</td><td className="mono">{fmtNum(r.total_latency_ms)}</td><td className="mono">{r.pii?.redacted_count || 0}</td></tr>)}</tbody></table></div>
      </Section>
      {RE.reliability?.length > 0 && <Section title="Router calibration (held-out real requests)"><div className="flex flex-wrap gap-1">{RE.reliability.map((b) => <span key={b.bin} className="chip">conf {b.bin}: <span className="mono">{fmtPct(b.accuracy)}</span> (n={b.n})</span>)}</div></Section>}
    </div>
  );
}
