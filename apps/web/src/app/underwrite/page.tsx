"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Section, StatTile, Tip } from "@/components/ui";
import { fmtNum, fmtUsd, PRICING, reunderwrite } from "@/lib/pricing";

const Slider = ({ label, v, set, min, max, step, fmt }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step: number; fmt: (n: number) => string }) => (
  <label className="text-sm block"><div className="flex justify-between"><span>{label}</span><span className="mono">{fmt(v)}</span></div><input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} className="w-full" /></label>
);

const Num = ({ label, v, set, min = 0, step = 1, hint }: { label: string; v: number; set: (n: number) => void; min?: number; step?: number; hint?: string }) => (
  <label className="text-sm block">
    <div className="flex justify-between"><span>{label}</span></div>
    <input type="number" min={min} step={step} value={v} onChange={(e) => set(Math.max(min, Number(e.target.value) || 0))} className="w-full mono" style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)" }} />
    {hint && <span className="muted" style={{ fontSize: "0.7rem" }}>{hint}</span>}
  </label>
);

const fmtTok = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : fmtNum(Math.round(n)));

// ---------------- Tab 1: the crossover model ----------------
function CrossoverTab() {
  const [tokens, setTokens] = useState(PRICING.tokens_per_task_default);
  const [flag, setFlag] = useState(12);
  const [small, setSmall] = useState(2.2);
  const [fixed, setFixed] = useState(PRICING.self_hosted_defaults.fixed_month_usd);
  const [variable, setVariable] = useState(PRICING.self_hosted_defaults.variable_per_task_usd * 1e6);
  const [years, setYears] = useState(0);
  const [volume, setVolume] = useState(6);
  const data = useMemo(() => Array.from({ length: 41 }, (_, i) => { const v = Math.pow(10, 3 + i * 0.15); const r = reunderwrite({ monthlyVolume: v, tokensPerTask: tokens, flagshipPerMtok: flag, smallPerMtok: small, selfFixedMonth: fixed, selfVariablePerTask: variable / 1e6, yearsAhead: years }); return { v, ...r }; }), [tokens, flag, small, fixed, variable, years]);
  const at = reunderwrite({ monthlyVolume: Math.pow(10, volume), tokensPerTask: tokens, flagshipPerMtok: flag, smallPerMtok: small, selfFixedMonth: fixed, selfVariablePerTask: variable / 1e6, yearsAhead: years });
  return (
    <div>
      <details className="card mt-3" style={{ padding: "0.8rem 1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>How to read this chart</summary>
        <ul className="text-sm mt-2" style={{ lineHeight: 1.6, paddingLeft: "1.1rem", listStyle: "disc" }}>
          <li>Three cost curves are compared: renting the flagship model, renting a smaller model, and self-hosting a small owned model.</li>
          <li>Both axes are logarithmic. The horizontal axis is monthly task volume; the vertical axis is monthly cost.</li>
          <li>The two rented curves start near zero and rise in proportion to volume. The self-hosted curve is nearly flat at low volume, because a warm pool of compute and the staff to run it are a fixed monthly cost, then rises slowly as volume grows.</li>
          <li>The crossover is the volume at which the self-hosted curve falls below the small-tier curve. Below it, renting is cheaper; above it, owning is cheaper. The tiles report the monthly cost of each option at the selected volume, and the crossover volume.</li>
          <li>The years-ahead control divides frontier prices by about {PRICING.frontier_deflation_per_year}× per year. Moving it forward slides the crossover to the right, which shrinks the set of workloads worth owning.</li>
          <li>Reading rule: build only when the self-hosted curve is clearly the lowest at the operating volume and stays lowest one to two years into the future. Otherwise rent.</li>
        </ul>
      </details>
      <div className="grid md:grid-cols-3 gap-4 mt-3">
        <div className="card space-y-3">
          <Slider label="Years ahead (frontier ÷10 / yr)" v={years} set={setYears} min={0} max={3} step={0.25} fmt={(n) => `${n} y`} />
          <Slider label="Tokens per task" v={tokens} set={setTokens} min={100} max={5000} step={100} fmt={(n) => fmtNum(n)} />
          <Slider label="Flagship blended $/M tokens (today)" v={flag} set={setFlag} min={1} max={40} step={0.5} fmt={(n) => fmtUsd(n, 1)} />
          <Slider label="Small tier blended $/M tokens (today)" v={small} set={setSmall} min={0.2} max={10} step={0.1} fmt={(n) => fmtUsd(n, 1)} />
          <Slider label="Self-hosted fixed $/month (warm pool + MLOps)" v={fixed} set={setFixed} min={0} max={5000} step={10} fmt={(n) => fmtUsd(n, 0)} />
          <Slider label="Self-hosted variable $/M tasks" v={variable} set={setVariable} min={0} max={50} step={0.5} fmt={(n) => fmtUsd(n, 1)} />
          <Slider label="Your volume (log10 tasks / month)" v={volume} set={setVolume} min={3} max={9} step={0.1} fmt={(n) => fmtNum(Math.pow(10, n))} />
        </div>
        <div className="md:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Flagship / month" value={fmtUsd(at.flagship, 0)} color="var(--series-2)" />
            <StatTile label="Small tier / month" value={fmtUsd(at.small_tier, 0)} color="var(--series-3)" />
            <StatTile label="Self-hosted / month" value={fmtUsd(at.self_hosted, 0)} sub={Number.isFinite(at.crossover_volume_vs_small_tier) ? `beats small tier above ${fmtNum(at.crossover_volume_vs_small_tier)} tasks / month` : "never beats the small tier at these prices"} color="var(--series-1)" />
          </div>
          <Section title="Monthly cost vs volume (log–log)">
            <div style={{ height: 320 }}><ResponsiveContainer><LineChart data={data} margin={{ left: 10, right: 20 }}>
              <CartesianGrid /><XAxis dataKey="v" scale="log" domain={["auto", "auto"]} type="number" tickFormatter={(v) => fmtNum(v)} /><YAxis scale="log" domain={["auto", "auto"]} tickFormatter={(v) => fmtUsd(v, 0)} width={80} />
              <Tooltip content={<Tip fmt={(v) => fmtUsd(v, 0)} />} labelFormatter={(v) => `${fmtNum(v)} tasks / month`} /><Legend />
              <Line type="monotone" dataKey="flagship" name="flagship API" stroke="var(--series-2)" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="small_tier" name="small tier API" stroke="var(--series-3)" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="self_hosted" name="self-hosted SLM" stroke="var(--series-1)" dot={false} strokeWidth={2} />
              <ReferenceLine x={Math.pow(10, volume)} stroke="var(--text-muted)" strokeDasharray="4 4" label={{ value: "you", fill: "var(--text-secondary)", fontSize: 11 }} />
            </LineChart></ResponsiveContainer></div>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ---------------- Tab 2: legal contract extraction scenario ----------------
function ScenarioTab() {
  const [users, setUsers] = useState(100);
  const [perDay, setPerDay] = useState(10);
  const [days, setDays] = useState(250);
  const [pages, setPages] = useState(50);
  const [clauses, setClauses] = useState(100);
  const [promptSets, setPromptSets] = useState(8);
  const [tokPerSet, setTokPerSet] = useState(800);
  const [reexec, setReexec] = useState(25);
  const [flag, setFlag] = useState(12);
  const [small, setSmall] = useState(2.2);
  const [fixedMo, setFixedMo] = useState(PRICING.self_hosted_defaults.fixed_month_usd);
  const [varTask, setVarTask] = useState(PRICING.self_hosted_defaults.variable_per_task_usd * 1e6); // $/M tasks

  const m = useMemo(() => {
    const tasksDay = users * perDay;
    const tasksYear = tasksDay * days;
    const effCalls = promptSets * (1 + reexec / 100);
    const callsDay = tasksDay * effCalls;
    const callsYear = tasksYear * effCalls;
    const tokensPerTask = effCalls * tokPerSet;
    const tokensYear = tasksYear * tokensPerTask;
    const flagYear = (tokensYear / 1e6) * flag;
    const smallYear = (tokensYear / 1e6) * small;
    const selfYear = fixedMo * 12 + tasksYear * (varTask / 1e6);
    return { tasksDay, tasksYear, effCalls, callsDay, callsYear, tokensPerTask, tokensYear, flagYear, smallYear, selfYear };
  }, [users, perDay, days, promptSets, tokPerSet, reexec, flag, small, fixedMo, varTask]);

  const options = [
    { k: "Flagship API", v: m.flagYear, c: "var(--series-2)" },
    { k: "Small tier API", v: m.smallYear, c: "var(--series-3)" },
    { k: "Self-hosted SLM", v: m.selfYear, c: "var(--series-1)" },
  ];
  const maxCost = Math.max(...options.map((o) => o.v), 1);
  const cheapest = options.reduce((a, b) => (b.v < a.v ? b : a));

  // funnel stages: [running total, label] with a multiplier tag before each (except first)
  const stages = [
    { mult: "", val: fmtNum(users), lab: "users" },
    { mult: `× ${perDay}/day`, val: fmtNum(m.tasksDay), lab: "contracts / day" },
    { mult: `× ${days} days`, val: fmtNum(m.tasksYear), lab: "extractions / year" },
    { mult: `× ${promptSets} prompt sets`, val: fmtNum(m.tasksYear * promptSets), lab: "base API calls / year" },
    { mult: `× 1.${String(reexec).padStart(2, "0")} re-exec`, val: fmtNum(Math.round(m.callsYear)), lab: "API calls / year" },
    { mult: `× ${tokPerSet} tokens`, val: fmtTok(m.tokensYear), lab: "tokens / year" },
  ];

  return (
    <div className="mt-3">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card space-y-2">
          <div className="text-sm font-semibold">Workload</div>
          <Num label="Users" v={users} set={setUsers} />
          <Num label="Contracts per user per day" v={perDay} set={setPerDay} />
          <Num label="Working days per year" v={days} set={setDays} />
          <Num label="Pages per document" v={pages} set={setPages} hint="context only; RAG feeds retrieved chunks, not the whole file" />
          <Num label="Clauses to extract per document" v={clauses} set={setClauses} hint="context only" />
          <div className="text-sm font-semibold mt-2">RAG shape</div>
          <Num label="Prompt sets (API calls) per extraction" v={promptSets} set={setPromptSets} />
          <Num label="Tokens per prompt set (~1 page)" v={tokPerSet} set={setTokPerSet} step={50} hint="input + output for one call; ~1 page of dense text" />
          <Num label="Re-execution rate (%)" v={reexec} set={setReexec} hint="share of calls retried in a day; multiplies calls and tokens" />
          <div className="text-sm font-semibold mt-2">Prices</div>
          <Num label="Flagship $/M tokens" v={flag} set={setFlag} step={0.5} />
          <Num label="Small tier $/M tokens" v={small} set={setSmall} step={0.1} />
          <Num label="Self-hosted fixed $/month" v={fixedMo} set={setFixedMo} step={10} hint="warm pool + MLOps for an owned small model" />
          <Num label="Self-hosted variable $/M tasks" v={varTask} set={setVarTask} step={0.5} />
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Extractions / year" value={fmtNum(m.tasksYear)} sub={`${fmtNum(m.tasksDay)} / day`} color="var(--series-1)" />
            <StatTile label="Effective calls / task" value={m.effCalls.toFixed(1)} sub={`${promptSets} sets + ${reexec}% retries`} color="var(--series-4)" />
            <StatTile label="API calls / year" value={fmtNum(Math.round(m.callsYear))} sub={`${fmtNum(Math.round(m.callsDay))} / day`} color="var(--series-5)" />
            <StatTile label="Tokens / year" value={fmtTok(m.tokensYear)} sub={`${fmtNum(Math.round(m.tokensPerTask))} / extraction`} color="var(--series-6)" />
          </div>

          <Section title="From users to tokens (annual)">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "0.4rem" }}>
              {stages.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  {i > 0 && <span className="muted mono" style={{ fontSize: "0.68rem", whiteSpace: "nowrap" }}>{s.mult}</span>}
                  {i > 0 && <span aria-hidden className="muted" style={{ fontWeight: 700 }}>{"→"}</span>}
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.4rem 0.6rem", background: "var(--surface-1)", minWidth: 92, textAlign: "center" }}>
                    <div className="mono" style={{ fontWeight: 700, fontSize: "0.9rem" }}>{s.val}</div>
                    <div className="muted" style={{ fontSize: "0.66rem" }}>{s.lab}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="muted text-xs mt-2">Each extraction is one task. The {reexec}% re-execution multiplies both the API calls and the tokens by 1.{String(reexec).padStart(2, "0")}. Cost depends on total tokens, so calls and token size enter the same product.</p>
          </Section>

          <Section title="Annual cost, three ways to run it">
            <div className="space-y-2">
              {options.map((o) => (
                <div key={o.k} style={{ display: "grid", gridTemplateColumns: "9.5rem 1fr 6rem", gap: "0.6rem", alignItems: "center" }}>
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{o.k}{o.k === cheapest.k ? " (cheapest)" : ""}</span>
                  <span style={{ background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                    <span style={{ display: "block", height: 16, width: `${Math.max(2, (o.v / maxCost) * 100)}%`, background: o.c, opacity: o.k === cheapest.k ? 1 : 0.6 }} />
                  </span>
                  <span className="mono text-sm" style={{ textAlign: "right", fontWeight: o.k === cheapest.k ? 700 : 400 }}>{fmtUsd(o.v, 0)}</span>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="data text-sm" style={{ width: "100%" }}>
                <thead><tr><th>Option</th><th>Per year</th><th>Per month</th><th>Per extraction</th></tr></thead>
                <tbody>
                  {options.map((o) => (
                    <tr key={o.k}><td>{o.k}</td><td className="mono">{fmtUsd(o.v, 0)}</td><td className="mono">{fmtUsd(o.v / 12, 0)}</td><td className="mono">{fmtUsd(o.v / Math.max(m.tasksYear, 1), 4)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted text-xs mt-2">
              With these defaults the small-tier API is the cheapest, because {fmtNum(m.tasksYear)} extractions a year is a modest volume next to the fixed cost of owning a model. Self-hosting overtakes it only at higher volume or larger per-task token counts; raise the users, the contracts per day, or the tokens per prompt set to see the crossover. The self-hosted line is a cost view only and does not claim a small owned model matches frontier quality on complex legal extraction.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function Underwrite() {
  const [tab, setTab] = useState<"crossover" | "scenario">("crossover");
  const tabBtn = (key: "crossover" | "scenario", label: string) => (
    <button onClick={() => setTab(key)} aria-selected={tab === key} style={{ padding: "0.4rem 0.8rem", borderRadius: 8, border: "1px solid var(--border)", background: tab === key ? "var(--series-1)" : "var(--surface-1)", color: tab === key ? "#fff" : "var(--text-secondary)", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}>{label}</button>
  );
  return (
    <div>
      <h1 className="text-xl font-semibold">Re-underwrite annually</h1>
      <p className="muted text-sm">Two views of the same question. The crossover model shows when owning beats renting for a generic workload; the extraction scenario prices one concrete workload end to end. Frontier prices deflate ~{PRICING.frontier_deflation_per_year}× per year at fixed capability, so build only what clears the bar for two or more years.</p>
      <div className="flex gap-2 mt-3">{tabBtn("crossover", "Crossover model")}{tabBtn("scenario", "Contract extraction scenario")}</div>
      {tab === "crossover" ? <CrossoverTab /> : <ScenarioTab />}
    </div>
  );
}
