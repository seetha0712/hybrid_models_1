"use client";
import { useEffect, useState } from "react";
import { api, isConfigured } from "@/lib/api";
import type { Health } from "@/lib/types";

export function useHealth(intervalMs = 20000) {
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<"checking" | "live" | "offline">(isConfigured() ? "checking" : "offline");
  useEffect(() => {
    if (!isConfigured()) return;
    let alive = true;
    const tick = () => api.health().then((h) => alive && (setHealth(h), setState("live"))).catch(() => alive && setState("offline"));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);
  return { health, state };
}

export function LiveBadge() {
  const { health, state } = useHealth();
  const [warming, setWarming] = useState(false);
  const warm = async () => { setWarming(true); try { await Promise.allSettled([api.classify(["STARBUCKS #1"]), api.pii("x"), api.openweights("Say ready.")]); } finally { setWarming(false); } };
  const dot = state === "live" ? "var(--good)" : state === "checking" ? "var(--warning)" : "var(--critical)";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="chip" title={health ? JSON.stringify(health.tiers) : "no gateway"}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, display: "inline-block" }} />
        {state === "live" ? "live" : state === "checking" ? "checking…" : "offline — recorded results"}
      </span>
      {health && Object.entries(health.tiers).map(([k, v]) => (
        <span key={k} className="chip" style={{ opacity: v === "warm" || v === "configured" ? 1 : 0.55 }}>{k}: {v}</span>
      ))}
      {state === "live" && <button className="btn" onClick={warm} disabled={warming}>{warming ? "warming…" : "Warm up"}</button>}
    </div>
  );
}
