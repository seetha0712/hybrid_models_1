import type { ReactNode } from "react";

export function StatTile({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="card" style={{ borderTop: color ? `3px solid ${color}` : undefined }}>
      <div className="muted text-xs uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mono mt-1">{value}</div>
      {sub && <div className="muted text-xs mt-1">{sub}</div>}
    </div>
  );
}
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card mt-4">
      <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">{title}</h2>{right}</div>
      {children}
    </section>
  );
}
export function Note({ status, note }: { status?: string; note?: string }) {
  if (status !== "placeholder") return null;
  return <div className="text-xs rounded-lg px-3 py-2 mb-3" style={{ background: "var(--surface-2)", borderLeft: "3px solid var(--warning)" }}>Placeholder data — {note}</div>;
}
export function Swatch({ color, label }: { color: string; label: string }) {
  return <span className="chip"><span className="swatch" style={{ background: color }} />{label}</span>;
}
export function Tip({ active, payload, label, fmt }: { active?: boolean; payload?: any[]; label?: any; fmt?: (v: any, name: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      <div className="muted">{label}</div>
      {payload.map((p) => <div key={p.name}><span className="swatch" style={{ background: p.color || p.fill }} />{p.name}: <span className="mono">{fmt ? fmt(p.value, p.name) : p.value}</span></div>)}
    </div>
  );
}
