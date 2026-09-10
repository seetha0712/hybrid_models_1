import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/lib/i18n-server";
import { LocaleProvider } from "@/lib/i18n";

export const metadata: Metadata = { title: "The Model Spectrum - live", description: "Hybrid model strategy demo: owned tiny model, LoRA SLM, open weights, frontier tiers, one gateway." };

// Minimal root layout. The site header (which loads the gateway client and demo key) lives in the
// (site) group layout, so public pages such as /gate and /extraction-scenario never ship the key.
// The locale cookie is read here and provided to all client components; <html lang> follows it.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
