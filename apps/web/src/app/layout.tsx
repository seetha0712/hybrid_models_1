import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "The Model Spectrum - live", description: "Hybrid model strategy demo: owned tiny model, LoRA SLM, open weights, frontier tiers, one gateway." };

// Minimal root layout. The site header (which loads the gateway client and demo key) lives in the
// (site) group layout, so public pages such as /gate and /extraction-scenario never ship the key.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
