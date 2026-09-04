import type { Metadata } from "next";
import "./globals.css";
import { LiveBadge } from "@/components/LiveBadge";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = { title: "The Model Spectrum — live", description: "Hybrid model strategy demo: owned tiny model, LoRA SLM, open weights, frontier tiers, one gateway." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="px-6 py-3 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-1)" }}>
          <div className="flex items-center gap-4">
            <div className="font-semibold">The Model Spectrum <span className="muted font-normal">· live</span></div>
            <Nav />
          </div>
          <LiveBadge />
        </header>
        <main className="px-6 py-5 max-w-6xl mx-auto">{children}</main>
        <footer className="px-6 py-6 muted text-xs">Prices from results/pricing.json · every number on these pages is either measured live or loaded from committed results JSON (labelled when placeholder).</footer>
      </body>
    </html>
  );
}
