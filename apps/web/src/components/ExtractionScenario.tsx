"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Section, StatTile, Tip } from "@/components/ui";
import { fmtNum, fmtUsd, PRICING } from "@/lib/pricing";

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
    { mult: "", val: fmtNum(users), lab: "users" },
    { mult: `× ${perDay}/day`, val: fmtNum(m.tasksDay), lab: "contracts / day" },
    { mult: `× ${days} days`, val: fmtNum(m.tasksYear), lab: "extractions / year" },
    { mult: `× ${promptSets} prompt sets`, val: fmtNum(m.tasksYear * promptSets), lab: "base API calls / year" },
    { mult: `× 1.${String(reexec).padStart(2, "0")} re-exec`, val: fmtNum(Math.round(m.callsYear)), lab: "API calls / year" },
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
          <div className="text-sm font-semibold mt-2">RAG shape and tokens</div>
          <Num label="Prompt sets (API calls) per extraction" v={promptSets} set={setPromptSets} />
          <Num label="Input tokens per prompt set" v={inSet} set={setInSet} step={50} hint="instruction + retrieved context; the ~1 page you described (about 800 tokens)" />
          <Num label="Output tokens per prompt set" v={outSet} set={setOutSet} step={50} hint="assumption: compact extracted fields per call, ~150 words; raise it if the model returns full clause text" />
          <Num label="Re-execution rate (%)" v={reexec} set={setReexec} hint="share of calls retried in a day; multiplies calls and tokens" />
          <div style={{ marginTop: "0.6rem", border: "1px solid var(--series-1)", borderRadius: 8, padding: "0.6rem", background: "color-mix(in oklab, var(--series-1) 6%, var(--surface-1))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#fff", background: "var(--series-1)", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.03em" }}>IN-HOUSE ONLY</span>
              <span className="text-sm font-semibold">Self-hosted cost (SLM or open weights)</span>
            </div>
            <p className="muted" style={{ fontSize: "0.7rem", marginBottom: "0.5rem" }}>These lines apply only when models run in-house. Compute and platform are shared across the fleet, so each workload carries a fraction; the rented API tiers incur none of them.</p>
            <div className="space-y-2">
              <label className="text-sm block"><div className="flex justify-between"><span>GPU type</span><span className="mono">{fmtUsd(PRICING.modal.gpu_per_hour[gpuType] ?? 0, 2)}/hr</span></div>
                <select value={gpuType} onChange={(e) => setGpuType(e.target.value)} className="w-full mono" style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)" }}>
                  {gpuTypes.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <Num label="Warm GPUs (shared base pool)" v={gpus} set={setGpus} hint="a warm pool serving the fleet via swappable adapters, billed whether busy or not" />
              <Num label="Warm hours per month" v={hoursMo} set={setHoursMo} step={10} hint="730 = 24h × ~30.4 days (always on); lower for business hours or scale-to-zero" />
              <Num label="MLOps + platform $/month (whole team)" v={mlops} set={setMlops} step={500} hint="engineers, pipelines, serving, on-call; a fixed cost shared across the fleet" />
              <Num label="Evaluation + governance $/month (whole team)" v={evalGov} set={setEvalGov} step={250} hint="gold sets, human review, model cards, audit; shared across the fleet" />
              <Num label="Models sharing the platform (fleet size)" v={fleet} set={setFleet} min={1} hint="compute and platform are divided by this; a bigger fleet lowers each model's local share" />
              <Num label="Retrains per year (this model)" v={retrainsYr} set={setRetrainsYr} hint="drift maintenance; small models are cheap and fast to refresh" />
              <Num label="Cost per retrain (labeling + compute) $" v={costPerRetrain} set={setCostPerRetrain} step={50} hint="charged to this model, not shared" />
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Extractions / year" value={fmtNum(m.tasksYear)} sub={`${fmtNum(m.tasksDay)} / day`} color="var(--series-1)" />
            <StatTile label="API calls / year" value={fmtNum(Math.round(m.callsYear))} sub={`${m.effCalls.toFixed(1)} per extraction`} color="var(--series-5)" />
            <StatTile label="Input tokens / year" value={fmtTok(m.inTokensYear)} sub={`${fmtNum(inSet)} per call`} color="var(--series-3)" />
            <StatTile label="Output tokens / year" value={fmtTok(m.outTokensYear)} sub={`${fmtNum(outSet)} per call`} color="var(--series-6)" />
          </div>

          <Section title="From users to input and output tokens (annual)">
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
                  <div className="mono" style={{ fontWeight: 700, fontSize: "0.86rem" }}>{fmtTok(m.inTokensYear)}</div><div className="muted" style={{ fontSize: "0.64rem" }}>input tokens / yr (× {inSet})</div>
                </div>
                <div style={{ border: "1px solid var(--series-6)", borderRadius: 8, padding: "0.3rem 0.55rem", background: "var(--surface-1)", minWidth: 120, textAlign: "center" }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: "0.86rem" }}>{fmtTok(m.outTokensYear)}</div><div className="muted" style={{ fontSize: "0.64rem" }}>output tokens / yr (× {outSet})</div>
                </div>
              </div>
            </div>
            <p className="muted text-xs mt-2">One extraction is one task. The {reexec}% re-execution multiplies calls and tokens by 1.{String(reexec).padStart(2, "0")}. Input and output tokens are counted separately and billed at each model different input and output rate.</p>
          </Section>

          <Section title="Annual cost by option (input and output priced separately)">
            <div className="space-y-2">
              {options.map((o) => (
                <div key={o.k} style={{ display: "grid", gridTemplateColumns: "10.5rem 1fr 6rem", gap: "0.6rem", alignItems: "center" }}>
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{o.k}{o.k === cheapestOpt.k ? " (cheapest)" : ""}</span>
                  <span style={{ background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}><span style={{ display: "block", height: 16, width: `${Math.max(2, (o.v / maxCost) * 100)}%`, background: o.c, opacity: o.k === cheapestOpt.k ? 1 : 0.6 }} /></span>
                  <span className="mono text-sm" style={{ textAlign: "right", fontWeight: o.k === cheapestOpt.k ? 700 : 400 }}>{fmtUsd(o.v, 0)}</span>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="data text-sm" style={{ width: "100%" }}>
                <thead><tr><th>Option</th><th>Price basis</th><th>Per year</th><th>Per month</th><th>Per extraction</th></tr></thead>
                <tbody>
                  {m.front.map((t) => (
                    <tr key={t.id}><td>{t.key}</td><td className="mono">${t.inP}/${t.outP} per M (in/out)</td><td className="mono">{fmtUsd(t.year, 0)}</td><td className="mono">{fmtUsd(t.year / 12, 0)}</td><td className="mono">{fmtUsd(t.per, 4)}</td></tr>
                  ))}
                  <tr><td>Self-hosted SLM</td><td className="mono">fixed pool + MLOps</td><td className="mono">{fmtUsd(m.selfYear, 0)}</td><td className="mono">{fmtUsd(m.fixedMo, 0)}</td><td className="mono">{fmtUsd(m.selfYear / Math.max(m.tasksYear, 1), 4)}</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Self-hosted cost, broken down">
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#fff", background: "var(--series-1)", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.03em" }}>IN-HOUSE ONLY</span>
              <span className="muted text-xs">applies to a self-hosted SLM or open weights, not to the rented API tiers</span>
            </div>
            <div className="overflow-x-auto">
              <table className="data text-sm" style={{ width: "100%" }}>
                <tbody>
                  <tr><td>GPU compute (warm pool, shared)</td><td className="mono">{gpus} × {gpuType} × {fmtUsd(PRICING.modal.gpu_per_hour[gpuType] ?? 0, 2)}/hr × {fmtNum(hoursMo)} hr</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.computeMo, 0)} / mo</td></tr>
                  <tr><td>MLOps + platform (shared)</td><td className="mono">whole team</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(mlops, 0)} / mo</td></tr>
                  <tr><td>Evaluation + governance (shared)</td><td className="mono">whole team</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(evalGov, 0)} / mo</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>Full platform (all models)</td><td className="mono">compute + MLOps + eval</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.sharedFullMo, 0)} / mo</td></tr>
                  <tr style={{ color: "var(--series-1)", fontWeight: 700 }}><td>Apportioned to this workload</td><td className="mono">÷ {fmtNum(fleet)} models in the fleet</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.perModelSharedMo, 0)} / mo</td></tr>
                  <tr><td>Retraining (this model)</td><td className="mono">{fmtNum(retrainsYr)} × {fmtUsd(costPerRetrain, 0)} ÷ 12</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.retrainMo, 0)} / mo</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>This workload total</td><td className="mono">share + retraining</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.fixedMo, 0)} / mo</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>Annual</td><td className="mono">× 12</td><td className="mono" style={{ textAlign: "right" }}>{fmtUsd(m.selfYear, 0)} / yr</td></tr>
                </tbody>
              </table>
            </div>
            <p className="muted text-xs mt-2">
              These costs exist only for in-house hosting, a fine-tuned SLM or open weights. The GPU pool, the MLOps and platform team, and the evaluation and governance function are largely fixed and shared, so as the fleet grows each model carries a smaller share: the same platform is divided by {fmtNum(fleet)} models here, and the local run cost falls as that number rises. Retraining is charged to this model as drift maintenance. Marginal inference within pool capacity is treated as near zero, so the figure is flat with volume until the pool needs more GPUs. A serverless scale-to-zero deployment trades the warm pool for a per-GPU-second charge; the project gateway runs scale-to-zero for that reason.
            </p>
          </Section>

          <Section title="Annual cost vs API calls, with the crossover">
            <div style={{ height: 300 }}><ResponsiveContainer><LineChart data={chart} margin={{ left: 10, right: 20 }}>
              <CartesianGrid /><XAxis dataKey="calls" scale="log" domain={["auto", "auto"]} type="number" tickFormatter={(v) => fmtNum(v)} /><YAxis scale="log" domain={["auto", "auto"]} tickFormatter={(v) => fmtUsd(v, 0)} width={80} />
              <Tooltip content={<Tip fmt={(v) => fmtUsd(v, 0)} />} labelFormatter={(v) => `${fmtNum(v)} API calls / year`} /><Legend />
              {m.front.map((t) => <Line key={t.id} type="monotone" dataKey={t.id} name={t.key} stroke={t.c} dot={false} strokeWidth={2} />)}
              <Line type="monotone" dataKey="self_hosted" name="self-hosted SLM" stroke="var(--series-1)" dot={false} strokeWidth={2} strokeDasharray="5 3" />
              <ReferenceLine x={m.callsYear} stroke="var(--text-muted)" strokeDasharray="4 4" />
              {m.front.map((t) => <ReferenceDot key={"d" + t.id} x={m.callsYear} y={t.year} r={5} fill={t.c} stroke="var(--surface-1)" strokeWidth={1.5} />)}
              <ReferenceDot x={m.callsYear} y={m.selfYear} r={5} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={1.5} />
              {m.callsCross != null && <ReferenceDot x={m.callsCross} y={m.selfYear} r={7} fill="none" stroke="var(--series-1)" strokeWidth={2.5} />}
            </LineChart></ResponsiveContainer></div>
            <p className="muted text-xs mt-2">
              <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "var(--text-secondary)", marginRight: 5, verticalAlign: "middle" }} />
              Filled dots sit on the dashed line at our current volume ({fmtNum(Math.round(m.callsYear))} API calls / year, which is {fmtNum(m.tasksYear)} extractions × {m.effCalls.toFixed(1)} calls each), each coloured to its line.
              {m.callsCross != null ? <>{" "}<span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--series-1)", marginLeft: 4, marginRight: 5, verticalAlign: "middle" }} />The open ring is the crossover, where self-hosting overtakes the cheapest tier ({m.cheapest.key}) at about {fmtNum(Math.round(m.callsCross))} API calls / year. Our volume sits {m.callsYear < m.callsCross ? "left of it, so renting wins today" : "right of it, so owning wins today"}.</> : " At these settings the frontier tier is always cheaper."}
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

