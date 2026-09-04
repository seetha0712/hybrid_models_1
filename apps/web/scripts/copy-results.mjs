// Copies the committed results/*.json (repo root) into src/data so the UI renders offline.
// Runs before `next build` / `next dev`. Fails loudly if a required file is missing.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const src = path.join(root, "results");
const dst = path.resolve(here, "..", "src", "data");
mkdirSync(dst, { recursive: true });
const required = ["pricing.json", "phase1_benchmark.json", "phase2_router_eval.json", "phase2_replay_sample.json", "phase2_batch_view.json", "phase3_pii_eval.json"];
for (const f of required) {
  if (!existsSync(path.join(src, f))) {
    console.error(`missing results/${f} — run modal run spectrum/eval.py or keep the placeholder`);
    process.exit(1);
  }
}
for (const f of readdirSync(src).filter((f) => f.endsWith(".json"))) copyFileSync(path.join(src, f), path.join(dst, f));
// the shared pricing test fixture, for TS/Python parity
copyFileSync(path.join(root, "tests", "fixtures", "pricing_cases.json"), path.join(dst, "pricing_cases.json"));
console.log(`copied results -> ${dst}`);
