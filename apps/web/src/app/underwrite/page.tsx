"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Section, StatTile, Tip } from "@/components/ui";
import { fmtNum, fmtUsd, PRICING, reunderwrite } from "@/lib/pricing";

const Slider = ({ label, v, set, min, max, step, fmt }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step: number; fmt: (n: number) => string }) => (
  <label className="text-sm block"><div className="flex justify-between"><span>{label}</span><span className="mono">{fmt(v)}</span></div><input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} className="w-full" /></label>
);

export default function Underwrite() {
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
      <h1 className="text-xl font-semibold">Re-underwrite annually</h1>
      <p className="muted text-sm">Monthly cost by volume for three ways to run one workload. Frontier prices deflate ~{PRICING.frontier_deflation_per_year}× per year at fixed capability, so the crossover where self-hosting wins moves right every year: build only what clears the bar for two or more years.</p>
      <details className="card mt-3" style={{ padding: "0.8rem 1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>How to read this chart</summary>
        <ul className="text-sm mt-2" style={{ lineHeight: 1.6, paddingLeft: "1.1rem", listStyle: "disc" }}>
          <li>Three cost curves are compared: renting the flagship model, renting a smaller model, and self-hosting a small owned model.</li>
          <li>Both axes are logarithmic. The horizontal axis is monthly task volume; the vertical axis is monthly cost.</li>
          <li>The two rented curves start near zero and rise in proportion to volume. The self-hosted curve is nearly flat at low volume, because a warm pool of compute and the staff to run it are a fixed monthly cost, then rises slowly as volume grows.</li>
          <li>The crossover is the volume at which the self-hosted curve falls below the small-tier curve. Below it, renting is cheaper; above it, owning is cheaper. The tiles above the chart report the monthly cost of each option at the selected volume, and the crossover volume.</li>
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
