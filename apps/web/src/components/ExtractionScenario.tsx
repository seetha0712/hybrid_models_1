"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Section, StatTile, Tip } from "@/components/ui";
import { fmtNum, fmtUsd, PRICING } from "@/lib/pricing";
import { useT } from "@/lib/i18n";

const Num = ({ label, v, set, min = 0, step = 1, hint }: { label: string; v: number; set: (n: number) => void; min?: number; step?: number; hint?: string }) => (
  <label className="text-sm block">
    <div className="flex justify-between"><span>{label}</span></div>
    <input type="number" min={min} step={step} value={v} onChange={(e) => set(Math.max(min, Number(e.target.value) || 0))} className="w-full mono" style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)" }} />
    {hint && <span className="muted" style={{ fontSize: "0.7rem" }}>{hint}</span>}
  </label>
);
const fmtTok = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : fmtNum(Math.round(n)));

const FRONTIER = [
  { key: "Claude Haiku 4.5", id: "claude-haiku-4-5", c: "var(--series-5)" },
  { key: "Claude Sonnet 5", id: "claude-sonnet-5", c: "var(--series-3)" },
  { key: "Claude Opus 5", id: "claude-opus-5", c: "var(--series-6)" },
];
export default function ExtractionScenario() {
  const t = useT();
  const [users, setUsers] = useState(100);
  const [perDay, setPerDay] = useState(10);
  const [days, setDays] = useState(250);
  const [pages, setPages] = useState(50);
  const [clauses, setClauses] = useState(100);
  const [promptSets, setPromptSets] = useState(8);
  const [inSet, setInSet] = useState(800);
  const [outSet, setOutSet] = useState(200);
  const [reexec, setReexec] = useState(25);
  // self-hosted breakdown
  const gpuTypes = Object.keys(PRICING.modal.gpu_per_hour);
  const [gpuType, setGpuType] = useState("L4");
  const [gpus, setGpus] = useState(1);
  const [hoursMo, setHoursMo] = useState(730);
  const [mlops, setMlops] = useState(15000);
  const [evalGov, setEvalGov] = useState(5000);
  const [fleet, setFleet] = useState(20);
  const [retrainsYr, setRetrainsYr] = useState(4);
  const [costPerRetrain, setCostPerRetrain] = useState(600);

  const m = useMemo(() => {
    const tasksDay = users * perDay;
    const tasksYear = tasksDay * days;
    const effCalls = promptSets * (1 + reexec / 100);
    const callsDay = tasksDay * effCalls;
    const callsYear = tasksYear * effCalls;
    const inTokensYear = callsYear * inSet;
    const outTokensYear = callsYear * outSet;
    const perCall = (id: string) => (inSet / 1e6) * PRICING.claude[id].input + (outSet / 1e6) * PRICING.claude[id].output;
    const perExtraction = (id: string) => effCalls * perCall(id);
    const computeMo = gpus * (PRICING.modal.gpu_per_hour[gpuType] ?? 0) * hoursMo;
    const sharedFullMo = computeMo + mlops + evalGov;              // full in-house platform, all models
    const perModelSharedMo = sharedFullMo / Math.max(fleet, 1);    // apportioned to one workload
    const retrainMo = (retrainsYr * costPerRetrain) / 12;          // per model, not shared
    const fixedMo = perModelSharedMo + retrainMo;                  // this workload, monthly
    const selfYear = fixedMo * 12;
    const front = FRONTIER.map((t) => ({ ...t, per: perExtraction(t.id), perCall: perCall(t.id), year: tasksYear * perExtraction(t.id), inP: PRICING.claude[t.id].input, outP: PRICING.claude[t.id].output }));
    const cheapest = front.reduce((a, b) => (b.year < a.year ? b : a));
    const callsCross = cheapest.perCall > 0 ? selfYear / cheapest.perCall : null; // crossover in API calls / year (self is flat)
    return { tasksDay, tasksYear, effCalls, callsDay, callsYear, inTokensYear, outTokensYear, computeMo, sharedFullMo, perModelSharedMo, retrainMo, fixedMo, selfYear, front, cheapest, callsCross };
  }, [users, perDay, days, promptSets, inSet, outSet, reexec, gpus, gpuType, hoursMo, mlops, evalGov, fleet, retrainsYr, costPerRetrain]);

  const options = [...m.front.map((t) => ({ k: t.key, v: t.year, c: t.c })), { k: "Self-hosted SLM", v: m.selfYear, c: "var(--series-1)" }];
  const maxCost = Math.max(...options.map((o) => o.v), 1);
  const cheapestOpt = options.reduce((a, b) => (b.v < a.v ? b : a));

  const chart = useMemo(() => Array.from({ length: 41 }, (_, i) => {
    const calls = Math.pow(10, 4 + i * (5 / 40)); // 1e4 .. 1e9 API calls / year
    const row: Record<string, number> = { calls, self_hosted: m.selfYear };
    m.front.forEach((t) => { row[t.id] = calls * t.perCall; });
    return row;
  }), [m]);

  const stages = [
    { mult: "", val: fmtNum(users), lab: t("ex.lab.users") },
    { mult: `× ${perDay}/day`, val: fmtNum(m.tasksDay), lab: t("ex.lab.perDay") },
    { mult: `× ${days} days`, val: fmtNum(m.tasksYear), lab: t("ex.lab.perYear") },
    { mult: `× ${promptSets} prompt sets`, val: fmtNum(m.tasksYear * promptSets), lab: t("ex.lab.baseCalls") },
    { mult: `× 1.${String(reexec).padStart(2, "0")} re-exec`, val: fmtNum(Math.round(m.callsYear)), lab: t("ex.lab.apiCalls") },
  ];

  return (
    <div className="mt-3">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card space-y-2">
          <div className="text-sm font-semibold">{t("ex.workload")}</div>
          <Num label={t("ex.users")} v={users} set={setUsers} />
          <Num label={t("ex.perDay")} v={perDay} set={setPerDay} />
          <Num label={t("ex.days")} v={days} set={setDays} />
          <Num label={t("ex.pages")} v={pages} set={setPages} hint={t("ex.pages.hint")} />
          <Num label={t("ex.clauses")} v={clauses} set={setClauses} hint={t("ex.clauses.hint")} />
          <div className="text-sm font-semibold mt-2">{t("ex.ragShape")}</div>
          <Num label={t("ex.promptSets")} v={promptSets} set={setPromptSets} />
          <Num label={t("ex.inSet")} v={inSet} set={setInSet} step={50} hint={t("ex.inSet.hint")} />
          <Num label={t("ex.outSet")} v={outSet} set={setOutSet} step={50} hint={t("ex.outSet.hint")} />
          <Num label={t("ex.reexec")} v={reexec} set={setReexec} hint={t("ex.reexec.hint")} />
          <div style={{ marginTop: "0.6rem", border: "1px solid var(--series-1)", borderRadius: 8, padding: "0.6rem", background: "color-mix(in oklab, var(--series-1) 6%, var(--surface-1))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#fff", background: "var(--series-1)", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.03em" }}>{t("ex.inhouseOnly")}</span>
              <span className="text-sm font-semibold">{t("ex.selfCostTitle")}</span>
            </div>
            <p className="muted" style={{ fontSize: "0.7rem", marginBottom: "0.5rem" }}>{t("ex.selfCostNote")}</p>
            <div className="space-y-2">
              <label className="text-sm block"><div className="flex justify-between"><span>{t("ex.gpuType")}</span><span className="mono">{fmtUsd(PRICING.modal.gpu_per_hour[gpuType] ?? 0, 2)}/hr</span></div>
                <select value={gpuType} onChange={(e) => setGpuType(e.target.value)} className="w-full mono" style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)" }}>
                  {gpuTypes.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <Num label={t("ex.gpus")} v={gpus} set={setGpus} hint={t("ex.gpus.hint")} />
              <Num label={t("ex.hoursMo")} v={hoursMo} set={setHoursMo} step={10} hint={t("ex.hoursMo.hint")} />
              <Num label={t("ex.mlops")} v={mlops} set={setMlops} step={500} hint={t("ex.mlops.hint")} />
              <Num label={t("ex.evalGov")} v={evalGov} set={setEvalGov} step={250} hint={t("ex.evalGov.hint")} />
              <Num label={t("ex.fleet")} v={fleet} set={setFleet} min={1} hint={t("ex.fleet.hint")} />
              <Num label={t("ex.retrainsYr")} v={retrainsYr} set={setRetrainsYr} hint={t("ex.retrainsYr.hint")} />
              <Num label={t("ex.costPerRetrain")} v={costPerRetrain} set={setCostPerRetrain} step={50} hint={t("ex.costPerRetrain.hint")} />
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label={t("ex.stat.extractions")} value={fmtNum(m.tasksYear)} sub={`${fmtNum(m.tasksDay)} ${t("ex.stat.perDay")}`} color="var(--series-1)" />
            <StatTile label={t("ex.stat.apiCalls")} value={fmtNum(Math.round(m.callsYear))} sub={`${m.effCalls.toFixed(1)} ${t("ex.stat.perExtraction")}`} color="var(--series-5)" />
            <StatTile label={t("ex.stat.inTokens")} value={fmtTok(m.inTokensYear)} sub={`${fmtNum(inSet)} ${t("ex.stat.perCall")}`} color="var(--series-3)" />
            <StatTile label={t("ex.stat.outTokens")} value={fmtTok(m.outTokensYear)} sub={`${fmtNum(outSet)} ${t("ex.stat.perCall")}`} color="var(--series-6)" />
          </div>

          <Section title={t("ex.sec.funnel")}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
              {stages.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  {i > 0 && <span className="muted mono" style={{ fontSize: "0.66rem", whiteSpace: "nowrap" }}>{s.mult}</span>}
                  {i > 0 && <span aria-hidden className="muted" style={{ fontWeight: 700 }}>{"→"}</span>}
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.4rem 0.55rem", background: "var(--surface-1)", minWidth: 88, textAlign: "center" }}>
                    <div className="mono" style={{ fontWeight: 700, fontSize: "0.86rem" }}>{s.val}</div>
                    <div className="muted" style={{ fontSize: "0.64rem" }}>{s.lab}</div>
                  </div>
                </div>
              ))}
              <span aria-hidden className="muted" style={{ fontWeight: 700 }}>{"→"}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <div style={{ border: "1px solid var(--series-3)", borderRadius: 8, padding: "0.3rem 0.55rem", background: "var(--surface-1)", minWidth: 120, textAlign: "center" }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: "0.86rem" }}>{fmtTok(m.inTokensYear)}</div><div className="muted" style={{ fontSize: "0.64rem" }}>{t("ex.lab.inTokYr")} (× {inSet})</div>
                </div>
                <div style={{ border: "1px solid var(--series-6)", borderRadius: 8, padding: "0.3rem 0.55rem", background: "var(--surface-1)", minWidth: 120, textAlign: "center" }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: "0.86rem" }}>{fmtTok(m.outTokensYear)}</div><div className="muted" style={{ fontSize: "0.64rem" }}>{t("ex.lab.outTokYr")} (× {outSet})</div>
                </div>
              </div>
            </div>
            <p className="muted text-xs mt-2">{t("ex.funnel.caption")}</p>
          </Section>

          <Section title={t("ex.sec.byOption")}>
            <div className="space-y-2">
              {options.map((o) => (
                <div key={o.k} style={{ display: "grid", gridTemplateColumns: "10.5rem 1fr 6rem", gap: "0.6rem", alignItems: "center" }}>
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{o.k === "Self-hosted SLM" ? t("ex.selfHostedSLM") : o.k}{o.k === cheapestOpt.k ? " " + t("ex.cheapest") : ""}</span>
                  <span style={{ background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}><span style={{ display: "block", height: 16, width: `${Math.max(2, (o.v / maxCost) * 100)}%`, background: o.c, opacity: o.k === cheapestOpt.k ? 1 : 0.6 }} /></span>
                  <span className="mono text-sm" style={{ textAlign: "right", fontWeight: o.k === cheapestOpt.k ? 700 : 400 }}>{fmtUsd(o.v, 0)}</span>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="data text-sm" style={{ width: "100%" }}>
                <thead><tr><th>{t("ex.th.option")}</th><th>{t("ex.th.priceBasis")}</th><th>{t("ex.th.perYear")}</th><th>{t("ex.th.perMonth")}</th><th>{t("ex.th.perExtraction")}</th></tr></thead>
                <tbody>
                  {m.front.map((f) => (
                    <tr key={f.id}><td>{f.key}</td><td className="mono">${f.inP}/${f.outP} per M (in/out)</td><td className="mono">{fmtUsd(f.year, 0)}</td><td className="mono">{fmtUsd(f.year / 12, 0)}</td><td className="mono">{fmtUsd(f.per, 4)}</td></tr>
                  ))}
                  <tr><td>{t("ex.selfHostedSLM")}</td><td className="mono">{t("ex.priceBasis.self")}</td><td className="mono">{fmtUsd(m.selfYear, 0)}</td><td className="mono">{fmtUsd(m.fixedMo, 0)}</td><td className="mono">{fmtUsd(m.selfYear / Math.max(m.tasksYear, 1), 4)}</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={t("ex.sec.breakdown")}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#fff", background: "var(--series-1)", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.03em" }}>{t("ex.inhouseOnly")}</span>
              <span className="muted text-xs">{t("ex.breakdown.note")}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="data text-sm" style={{ width: "100%" }}>
                <tbody>
                  <tr><td>{t("ex.row.gpu")}</td><td className="mono">{gpus} × {gpuType} × {fmtUsd(PRICING.modal.gpu_per_hour[gpuType] ?? 0, 2)}/hr × {fmtNum(hoursMo)} hr</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.computeMo, 0)} / mo</td></tr>
                  <tr><td>{t("ex.row.mlops")}</td><td className="mono">{t("ex.wholeTeam")}</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(mlops, 0)} / mo</td></tr>
                  <tr><td>{t("ex.row.eval")}</td><td className="mono">{t("ex.wholeTeam")}</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(evalGov, 0)} / mo</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>{t("ex.row.fullPlatform")}</td><td className="mono">compute + MLOps + eval</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.sharedFullMo, 0)} / mo</td></tr>
                  <tr style={{ color: "var(--series-1)", fontWeight: 700 }}><td>{t("ex.row.apportioned")}</td><td className="mono">÷ {fmtNum(fleet)} {t("ex.models")}</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.perModelSharedMo, 0)} / mo</td></tr>
                  <tr><td>{t("ex.row.retrain")}</td><td className="mono">{fmtNum(retrainsYr)} × {fmtUsd(costPerRetrain, 0)} ÷ 12</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.retrainMo, 0)} / mo</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>{t("ex.row.workloadTotal")}</td><td className="mono">share + retraining</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.fixedMo, 0)} / mo</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>{t("ex.row.annual")}</td><td className="mono">× 12</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.selfYear, 0)} / yr</td></tr>
                </tbody>
              </table>
            </div>
            <p className="muted text-xs mt-2">{t("ex.breakdown.para")}</p>
          </Section>

          <Section title={t("ex.sec.crossover")}>
            <div style={{ height: 300 }}><ResponsiveContainer><LineChart data={chart} margin={{ left: 10, right: 20 }}>
              <CartesianGrid /><XAxis dataKey="calls" scale="log" domain={["auto", "auto"]} type="number" tickFormatter={(v) => fmtNum(v)} /><YAxis scale="log" domain={["auto", "auto"]} tickFormatter={(v) => fmtUsd(v, 0)} width={80} />
              <Tooltip content={<Tip fmt={(v) => fmtUsd(v, 0)} />} labelFormatter={(v) => `${fmtNum(v)} API calls / year`} /><Legend />
              {m.front.map((f) => <Line key={f.id} type="monotone" dataKey={f.id} name={f.key} stroke={f.c} dot={false} strokeWidth={2} />)}
              <Line type="monotone" dataKey="self_hosted" name={t("ex.selfHostedLine")} stroke="var(--series-1)" dot={false} strokeWidth={2} strokeDasharray="5 3" />
              <ReferenceLine x={m.callsYear} stroke="var(--text-muted)" strokeDasharray="4 4" />
              {m.front.map((f) => <ReferenceDot key={"d" + f.id} x={m.callsYear} y={f.year} r={5} fill={f.c} stroke="var(--surface-1)" strokeWidth={1.5} />)}
              <ReferenceDot x={m.callsYear} y={m.selfYear} r={5} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={1.5} />
              {m.callsCross != null && <ReferenceDot x={m.callsCross} y={m.selfYear} r={7} fill="none" stroke="var(--series-1)" strokeWidth={2.5} />}
            </LineChart></ResponsiveContainer></div>
            <p className="muted text-xs mt-2">
              <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "var(--text-secondary)", marginRight: 5, verticalAlign: "middle" }} />
              {t("ex.cross.dots")} ({fmtNum(Math.round(m.callsYear))} {t("ex.cross.callsYear")} {t("ex.cross.whichIs")} {fmtNum(m.tasksYear)} {t("ex.cross.extractionsBy")} {m.effCalls.toFixed(1)} {t("ex.cross.callsEach")}
              {m.callsCross != null ? <>{" "}<span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--series-1)", marginLeft: 4, marginRight: 5, verticalAlign: "middle" }} />{t("ex.cross.ring")} ({m.cheapest.key}) {t("ex.cross.atAbout")} {fmtNum(Math.round(m.callsCross))} {t("ex.cross.callsYear")} {m.callsYear < m.callsCross ? t("ex.cross.rentWins") : t("ex.cross.ownWins")}</> : " " + t("ex.cross.always")}
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

