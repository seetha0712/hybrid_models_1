"use client";
import { useState } from "react";
import batch from "@/data/phase2_batch_view.json";
import { Note, Section, StatTile } from "@/components/ui";
import { api, isConfigured } from "@/lib/api";
import { TIER_COLOR, TIER_LABEL } from "@/lib/palette";
import { fmtNum, fmtPct, fmtUsd } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
import type { BatchView } from "@/lib/types";

export default function Batch() {
  const t = useT();
  const [bv, setBv] = useState<BatchView>(batch as unknown as BatchView);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { setBv({ ...(await api.batchView()), status: "measured" }); } catch (e) { alert(String(e)); } finally { setBusy(false); } };
  const slm = bv.slm;
  const ratio = (api1: number | null) => (api1 && slm.cost_per_1m_usd ? `${fmtNum(api1 / slm.cost_per_1m_usd)}× the owned model` : "—");
  return (
    <div>
      <h1 className="text-xl font-semibold">{t("batch.title")}</h1>
      <p className="muted text-sm">{fmtNum(slm.n)} transactions through the owned model on 2 CPU cores, versus a live sample through the frontier tiers with the cached few-shot prompt, extrapolated to one million. JPMorgan reported $0.24 vs $812.</p>
      <Note status={bv.status} note={bv.note} />
      <div className="flex justify-end mt-2"><button className="btn btn-primary" onClick={run} disabled={busy || !isConfigured()}>{busy ? t("batch.running") : t("batch.run.btn")}</button></div>
      <div className="grid md:grid-cols-3 gap-3 mt-3">
        <StatTile label={TIER_LABEL.R5_SLM} value={fmtUsd(slm.cost_per_1m_usd, 2)} sub={`${fmtPct(slm.accuracy)} accuracy · ${fmtNum(slm.throughput_per_s)} / s · ${fmtNum(slm.n)} items in ${slm.wall_s ?? "—"} s`} color={TIER_COLOR.R5_SLM} />
        {bv.api.map((a) => <StatTile key={a.tier} label={TIER_LABEL[a.tier]} value={fmtUsd(a.cost_per_1m_usd, 0)} sub={`${ratio(a.cost_per_1m_usd)} · p50 ${a.latency_ms.p50 ?? "—"} ms · n=${a.n}`} color={TIER_COLOR[a.tier]} />)}
      </div>
      <Section title={t("batch.section.how")}>
        <ul className="text-sm list-disc ml-5 space-y-1">
          <li>{t("batch.how.owned")}</li>
          <li>{t("batch.how.frontier")}</li>
          <li>{t("batch.how.accuracy")}</li>
        </ul>
      </Section>
    </div>
  );
}
