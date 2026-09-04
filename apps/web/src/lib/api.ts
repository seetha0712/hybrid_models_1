"use client";
import type { BatchView, Health, Metrics, PiiResponse, RouteResponse, RouteRow } from "./types";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
const KEY = process.env.NEXT_PUBLIC_DEMO_KEY || "";
export const isConfigured = () => API_BASE.length > 0;

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T> {
  if (!isConfigured()) throw new Error("NEXT_PUBLIC_API_BASE not set");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API_BASE}${path}`, { ...init, signal: ctl.signal, headers: { "content-type": "application/json", "x-demo-key": KEY, ...(init.headers || {}) } });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}
export const api = {
  health: () => call<Health>("/health", {}, 3000),
  classify: (narrations: string[]) => call<{ results: { category: string; confidence: number; top3: [string, number][] }[]; latency_ms: number; cost_usd: number; n_params: number }>("/classify_txn", { method: "POST", body: JSON.stringify({ narrations }) }, 8000),
  pii: (text: string) => call<PiiResponse>("/pii", { method: "POST", body: JSON.stringify({ text }) }, 8000),
  route: (text: string, force_tier?: string) => call<RouteResponse>("/route", { method: "POST", body: JSON.stringify({ text, force_tier: force_tier || null }) }, 60000),
  metrics: () => call<Metrics>("/metrics", {}, 6000),
  replay: (n = 300) => call<{ rows: RouteRow[] }>(`/replay?n=${n}`, {}, 6000),
  batchView: (n_slm = 10000, n_api = 200) => call<BatchView>("/batch_view", { method: "POST", body: JSON.stringify({ n_slm, n_api }) }, 300000),
  openweights: (prompt: string) => call<{ text: string; latency_ms: number; cost_usd: number }>("/openweights", { method: "POST", body: JSON.stringify({ prompt, max_new_tokens: 64 }) }, 120000),
};
