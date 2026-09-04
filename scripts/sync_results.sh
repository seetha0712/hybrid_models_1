#!/usr/bin/env bash
# Pull regenerated results from the Modal Volume into results/ (then commit them).
#   ./scripts/sync_results.sh
set -euo pipefail
cd "$(dirname "$0")/.."
for f in phase1_benchmark.json phase1_benchmark_banking77.json phase2_router_eval.json phase2_replay_sample.json phase2_batch_view.json phase3_pii_eval.json; do
  modal volume get spectrum-artifacts "results/$f" "results/$f" --force 2>/dev/null && echo "synced $f" || echo "skip $f (not on volume yet)"
done
git diff --stat results/ || true
