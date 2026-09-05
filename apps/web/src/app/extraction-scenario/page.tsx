// Public, shareable cost calculator. Lives outside the (site) group so it uses the minimal root
// layout: no gateway client, no demo key in its bundle. Excluded from the password gate in middleware.
import ExtractionScenario from "@/components/ExtractionScenario";

export const metadata = {
  title: "Contract extraction: build vs buy cost",
  description: "Interactive cost comparison for a RAG contract-extraction workload: frontier API tiers versus a self-hosted small model, with input and output tokens costed separately and in-house platform costs apportioned across a fleet.",
};

export default function ExtractionScenarioPage() {
  return (
    <main className="px-6 py-6 max-w-6xl mx-auto">
      <header style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.8rem", marginBottom: "1rem" }}>
        <h1 className="text-xl font-semibold">Contract extraction: build versus buy</h1>
        <p className="muted text-sm mt-1">An interactive cost model for a RAG document-extraction workload. Set the volume, the tokens per call, the model prices and the in-house platform assumptions to compare renting a frontier API against self-hosting a small model. Everything is computed in the browser; nothing is sent anywhere and no login is required.</p>
      </header>
      <ExtractionScenario />
      <footer className="muted text-xs mt-6" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.8rem" }}>Part of The Model Spectrum. Prices come from a fixed list-price file; figures are illustrative and depend on the assumptions set above.</footer>
    </main>
  );
}
