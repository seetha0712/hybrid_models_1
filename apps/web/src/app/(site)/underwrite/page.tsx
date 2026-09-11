"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Section, StatTile, Tip } from "@/components/ui";
import { fmtNum, fmtUsd, PRICING, reunderwrite } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
import ExtractionScenario from "@/components/ExtractionScenario";

const Slider = ({ label, v, set, min, max, step, fmt }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step: number; fmt: (n: number) => string }) => (
  <label className="text-sm block"><div className="flex justify-between"><span>{label}</span><span className="mono">{fmt(v)}</span></div><input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} className="w-full" /></label>
);

// ---------------- Tab 1: the crossover model ----------------
function CrossoverTab() {
  const t = useT();
  const [tokens, setTokens] = useState(PRICING.tokens_per_task_default);
  const [flag, setFlag] = useState(12);
  const [small, setSmall] = useState(2.2);
  const [fixed, setFixed] = useState(PRICING.self_hosted_defaults.fixed_month_usd);
  const [variable, setVariable] = useState(PRICING.self_hosted_defaults.variable_per_task_usd * 1e6);
  const [years, setYears] = useState(0);
  const [volume, setVolume] = useState(6);
  const data = useMemo(() => Array.from({ length: 41 }, (_, i) => { const v = Math.pow(10, 3 + i * 0.15); const r = reunderwrite({ monthlyVolume: v, tokensPerTask: tokens, flagshipPerMtok: flag, smallPerMtok: small, selfFixedMonth: fixed, selfVariablePerTask: variable / 1e6, yearsAhead: years }); return { v, ...r }; }), [tokens, flag, small, fixed, variable, years]);
  const at = reunderwrite({ monthlyVolume: Math.pow(10, volume), tokensPerTask: tokens, flagshipPerMtok: flag, smallPerMtok: small, selfFixedMonth: fixed, selfVariablePerTask: variable / 1e6, yearsAhead: years });
  const opx = Math.pow(10, volume);
  return (
    <div>
      <details className="card mt-3" style={{ padding: "0.8rem 1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>{t("uw.howToRead")}</summary>
        <ul className="text-sm mt-2" style={{ lineHeight: 1.6, paddingLeft: "1.1rem", listStyle: "disc" }}>
          <li>{t("uw.read.1")}</li>
          <li>{t("uw.read.2")}</li>
          <li>{t("uw.read.3")}</li>
          <li>{t("uw.read.4")}</li>
          <li>{t("uw.read.5")}</li>
          <li>{t("uw.read.6")}</li>
        </ul>
      </details>
      <div className="grid md:grid-cols-3 gap-4 mt-3">
        <div className="card space-y-3">
          <Slider label={t("uw.slider.years")} v={years} set={setYears} min={0} max={3} step={0.25} fmt={(n) => `${n} y`} />
          <Slider label={t("uw.slider.tokens")} v={tokens} set={setTokens} min={100} max={5000} step={100} fmt={(n) => fmtNum(n)} />
          <Slider label={t("uw.slider.flag")} v={flag} set={setFlag} min={1} max={40} step={0.5} fmt={(n) => fmtUsd(n, 1)} />
          <Slider label={t("uw.slider.small")} v={small} set={setSmall} min={0.2} max={10} step={0.1} fmt={(n) => fmtUsd(n, 1)} />
          <Slider label={t("uw.slider.fixed")} v={fixed} set={setFixed} min={0} max={5000} step={10} fmt={(n) => fmtUsd(n, 0)} />
          <Slider label={t("uw.slider.variable")} v={variable} set={setVariable} min={0} max={50} step={0.5} fmt={(n) => fmtUsd(n, 1)} />
          <Slider label={t("uw.slider.volume")} v={volume} set={setVolume} min={3} max={9} step={0.1} fmt={(n) => fmtNum(Math.pow(10, n))} />
        </div>
        <div className="md:col-span-2">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label={t("uw.stat.flagship")} value={fmtUsd(at.flagship, 0)} color="var(--series-2)" />
            <StatTile label={t("uw.stat.smallTier")} value={fmtUsd(at.small_tier, 0)} color="var(--series-3)" />
            <StatTile label={t("uw.stat.selfHosted")} value={fmtUsd(at.self_hosted, 0)} sub={Number.isFinite(at.crossover_volume_vs_small_tier) ? `> ${fmtNum(at.crossover_volume_vs_small_tier)} / mo` : "—"} color="var(--series-1)" />
          </div>
          <Section title={t("uw.section.chart")}>
            <div style={{ height: 320 }}><ResponsiveContainer><LineChart data={data} margin={{ left: 10, right: 20 }}>
              <CartesianGrid /><XAxis dataKey="v" scale="log" domain={["auto", "auto"]} type="number" tickFormatter={(v) => fmtNum(v)} /><YAxis scale="log" domain={["auto", "auto"]} tickFormatter={(v) => fmtUsd(v, 0)} width={80} />
              <Tooltip content={<Tip fmt={(v) => fmtUsd(v, 0)} />} labelFormatter={(v) => `${fmtNum(v)} tasks / month`} /><Legend />
              <Line type="monotone" dataKey="flagship" name="flagship API" stroke="var(--series-2)" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="small_tier" name="small tier API" stroke="var(--series-3)" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="self_hosted" name="self-hosted SLM" stroke="var(--series-1)" dot={false} strokeWidth={2} />
              <ReferenceLine x={opx} stroke="var(--text-muted)" strokeDasharray="4 4" />
              <ReferenceDot x={opx} y={at.flagship} r={5} fill="var(--series-2)" stroke="var(--surface-1)" strokeWidth={1.5} />
              <ReferenceDot x={opx} y={at.small_tier} r={5} fill="var(--series-3)" stroke="var(--surface-1)" strokeWidth={1.5} />
              <ReferenceDot x={opx} y={at.self_hosted} r={5} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={1.5} />
            </LineChart></ResponsiveContainer></div>
            <p className="muted text-xs mt-2"><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "var(--text-secondary)", marginRight: 5, verticalAlign: "middle" }} />{t("uw.dotCaption")} ({fmtNum(opx)} / mo)</p>
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function Underwrite() {
  const t = useT();
  const [tab, setTab] = useState<"crossover" | "scenario">("crossover");
  const tabBtn = (key: "crossover" | "scenario", label: string) => (
    <button onClick={() => setTab(key)} aria-pressed={tab === key} style={{ padding: "0.4rem 0.8rem", borderRadius: 8, border: "1px solid var(--border)", background: tab === key ? "var(--series-1)" : "var(--surface-1)", color: tab === key ? "#fff" : "var(--text-secondary)", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}>{label}</button>
  );
  return (
    <div>
      <h1 className="text-xl font-semibold">{t("uw.title")}</h1>
      <p className="muted text-sm">{t("uw.intro")}</p>
      <div className="flex gap-2 mt-3">{tabBtn("crossover", t("uw.tab.crossover"))}{tabBtn("scenario", t("uw.tab.scenario"))}</div>
      {tab === "crossover" ? <CrossoverTab /> : <ExtractionScenario />}
    </div>
  );
}
