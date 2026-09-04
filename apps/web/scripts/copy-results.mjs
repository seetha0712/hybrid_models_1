// Copies the committed results/*.json (repo root) into src/data so the UI renders offline.
// Runs before `next build` / `next dev`. When the repo root is not present (Vercel CLI uploads
// only apps/web) it keeps whatever is already in src/data. Fails loudly if a required file is missing.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const src = path.join(root, "results");
const dst = path.resolve(here, "..", "src", "data");
mkdirSync(dst, { recursive: true });
const required = ["pricing.json", "phase1_benchmark.json", "phase2_router_eval.json", "phase2_replay_sample.json", "phase2_batch_view.json", "phase3_pii_eval.json", "pricing_cases.json"];
if (existsSync(src)) {
  for (const f of readdirSync(src).filter((f) => f.endsWith(".json"))) copyFileSync(path.join(src, f), path.join(dst, f));
  const fx = path.join(root, "tests", "fixtures", "pricing_cases.json");
  if (existsSync(fx)) copyFileSync(fx, path.join(dst, "pricing_cases.json"));
  console.log(`copied results -> ${dst}`);
} else {
  console.log(`no ${src}; using committed src/data`);
}
const missing = required.filter((f) => !existsSync(path.join(dst, f)));
if (missing.length) {
  console.error(`missing in src/data: ${missing.join(", ")} — run modal run spectrum/eval.py or restore the placeholders`);
  process.exit(1);
}
