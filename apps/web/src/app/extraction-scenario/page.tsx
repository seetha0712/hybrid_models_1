// Public, shareable cost calculator. Lives outside the (site) group so it uses the minimal root
// layout: no gateway client, no demo key in its bundle. Excluded from the password gate in middleware.
import Link from "next/link";
import ExtractionScenario from "@/components/ExtractionScenario";
import { LocaleToggle } from "@/components/LocaleToggle";
import { getT } from "@/lib/i18n-server";

export const metadata = {
  title: "Contract extraction: build vs buy cost",
  description: "Interactive cost comparison for a RAG contract-extraction workload: frontier API tiers versus a self-hosted small model, with input and output tokens costed separately and in-house platform costs apportioned across a fleet.",
};

export default async function ExtractionScenarioPage() {
  const t = await getT();
  return (
    <main className="px-6 py-6 max-w-6xl mx-auto">
      <header style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.8rem", marginBottom: "1rem" }}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <Link href="/" className="text-sm font-semibold" style={{ color: "var(--series-1)", textDecoration: "none" }}>{t("ex.backToMain")}</Link>
          <LocaleToggle />
        </div>
        <h1 className="text-xl font-semibold">{t("ex.pageTitle")}</h1>
        <p className="muted text-sm mt-1">{t("ex.pageIntro")}</p>
      </header>
      <ExtractionScenario />
      <footer className="muted text-xs mt-6" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.8rem" }}>{t("ex.footer")}</footer>
    </main>
  );
}
