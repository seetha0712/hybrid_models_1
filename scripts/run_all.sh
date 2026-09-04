#!/usr/bin/env bash
# One command runs the whole demo from your Mac: Modal training + evals, gateway deploy,
# results sync, Vercel deploy, git commit + push.
#
#   ./scripts/run_all.sh --phase all          # everything (≈ 1 h wall clock, ≈ $17)
#   ./scripts/run_all.sh --phase 1            # data + tiny model + Claude/LoRA baselines
#   ./scripts/run_all.sh --phase 2|3|deploy|web|git
#   ./scripts/run_all.sh --dry-run --phase all   # print the command sequence, run nothing
#   ./scripts/run_all.sh --force ...             # ignore completion markers and re-run steps
#
# Idempotent: each step writes a marker under .artifacts/state/ and is skipped on re-run.
# Credentials come from .env (see .env.example). .env is never printed or committed.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
PHASE=all; DRY=0; FORCE=0
while [[ $# -gt 0 ]]; do case "$1" in
  --phase) PHASE="$2"; shift 2;; --dry-run) DRY=1; shift;; --force) FORCE=1; shift;;
  -h|--help) sed -n '2,14p' "$0"; exit 0;; *) echo "unknown arg $1"; exit 2;; esac; done

if [[ -f .env ]]; then set -a; . ./.env; set +a; elif [[ $DRY -eq 0 ]]; then echo "missing .env (copy .env.example)"; exit 2; fi
: "${VERCEL_PROJECT:=model-spectrum}"; : "${RUN_OPUS:=0}"; : "${GIT_PUSH:=1}"; : "${GATEWAY_URL:=}"
STATE=.artifacts/state; mkdir -p "$STATE"
log() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
run() { if [[ $DRY -eq 1 ]]; then echo "+ $*"; else "$@"; fi; }
step() { local name=$1; shift; if [[ $FORCE -eq 0 && -f "$STATE/$name" ]]; then echo "skip $name (done; --force to redo)"; return 0; fi
         log "$name"; run "$@"; [[ $DRY -eq 1 ]] || touch "$STATE/$name"; }
want() { [[ "$PHASE" == "all" || "$PHASE" == "$1" ]]; }
need() { for v in "$@"; do if [[ $DRY -eq 0 && -z "${!v:-}" ]]; then echo "missing $v in .env"; exit 2; fi; done; }

# ---------------------------------------------------------------- environment
setup_env() {
  if [[ ! -x .venv/bin/python ]]; then log "python env"; run python3 -m venv .venv; fi
  # shellcheck disable=SC1091
  [[ $DRY -eq 1 ]] || . .venv/bin/activate
  if [[ $FORCE -eq 1 || ! -f "$STATE/pip" ]]; then
    log "pip install"
    if [[ "$(uname -s)" == "Linux" ]]; then run pip install -q torch --index-url https://download.pytorch.org/whl/cpu; else run pip install -q torch; fi
    run pip install -q -e ".[train,serve,dev]" modal
    [[ $DRY -eq 1 ]] || touch "$STATE/pip"
  fi
  need ANTHROPIC_API_KEY MODAL_TOKEN_ID MODAL_TOKEN_SECRET DEMO_KEY
  log "modal auth + secrets"
  run modal token set --token-id "${MODAL_TOKEN_ID:-<id>}" --token-secret "${MODAL_TOKEN_SECRET:-<secret>}"
  run modal secret create anthropic ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-<key>}" --force
  run modal secret create demo-key DEMO_KEY="${DEMO_KEY:-<key>}" --force
  if [[ -n "${HF_TOKEN:-}" ]]; then run modal secret create huggingface HF_TOKEN="$HF_TOKEN" --force; fi
}

# ---------------------------------------------------------------- phases
phase1() {
  step p1_inspect   modal run spectrum/data/hf_loaders.py --inspect
  step p1_data_txn  modal run spectrum/data/hf_loaders.py --dataset txn
  step p1_data_b77  modal run spectrum/data/hf_loaders.py --dataset banking77
  step p1_tiny_txn  modal run spectrum/tiny/train.py --dataset txn --epochs 6
  step p1_tiny_b77  modal run spectrum/tiny/train.py --dataset banking77 --epochs 12
  step p1_claude    modal run spectrum/baselines/claude_eval.py --dataset txn --models haiku,sonnet --n 1000
  if [[ "$RUN_OPUS" == "1" ]]; then step p1_claude_opus modal run spectrum/baselines/claude_eval.py --dataset txn --models opus --n 300 --yes; fi
  step p1_lora      modal run spectrum/baselines/lora_qwen.py --dataset txn --n-train 20000
  step p1_results   modal run spectrum/eval.py --phase 1
}
phase2() {
  step p2_corpus    modal run spectrum/router/corpus.py
  step p2_intent    modal run spectrum/router/train_intent.py
}
phase3() {
  step p3_data      modal run spectrum/pii/hf_pii.py --max-rows 20000
  step p3_train     modal run spectrum/pii/train_pii.py --epochs 3 --max-rows 20000
}
deploy_gateway() {
  log "modal deploy (gateway + Qwen3-1.7B tier)"
  if [[ $DRY -eq 1 ]]; then echo "+ modal deploy spectrum/deploy.py"; GATEWAY_URL=${GATEWAY_URL:-https://WORKSPACE--model-spectrum-web.modal.run}
  else
    modal deploy spectrum/deploy.py 2>&1 | tee "$STATE/deploy.log"
    url=$(grep -oE 'https://[a-z0-9-]+--model-spectrum-web[a-z0-9.-]*\.modal\.run' "$STATE/deploy.log" | head -1 || true)
    if [[ -n "$url" ]]; then GATEWAY_URL=$url; fi
    if [[ -z "$GATEWAY_URL" ]]; then echo "could not detect the gateway URL; set GATEWAY_URL in .env and re-run --phase deploy"; exit 3; fi
    grep -q '^GATEWAY_URL=' .env && sed -i.bak "s#^GATEWAY_URL=.*#GATEWAY_URL=$GATEWAY_URL#" .env || echo "GATEWAY_URL=$GATEWAY_URL" >> .env
    rm -f .env.bak
  fi
  echo "gateway: $GATEWAY_URL"
  step d_smoke      python scripts/smoke.py --base "$GATEWAY_URL" --key "${DEMO_KEY:-<key>}"
  step d_batchview  curl -sS -X POST "$GATEWAY_URL/batch_view" -H "content-type: application/json" -H "X-Demo-Key: ${DEMO_KEY:-<key>}" -d '{"n_slm":10000,"n_api":200}' -o "$STATE/batch_view.json"
  step d_results    modal run spectrum/eval.py --phase all
  step d_sync       ./scripts/sync_results.sh
}
deploy_web() {
  log "web build"
  run bash -c "cd apps/web && npm ci --no-audit --no-fund && npm run build"
  if [[ -z "${VERCEL_TOKEN:-}" ]]; then
    echo "VERCEL_TOKEN not set. Deploy manually:"
    echo "  cd apps/web && npx vercel deploy --prod --yes -b NEXT_PUBLIC_API_BASE=$GATEWAY_URL -b NEXT_PUBLIC_DEMO_KEY=<DEMO_KEY>"
    return 0
  fi
  log "vercel deploy"
  run bash -c "cd apps/web && npx vercel link --yes --project '$VERCEL_PROJECT' --token \"\$VERCEL_TOKEN\""
  for kv in "NEXT_PUBLIC_API_BASE=$GATEWAY_URL" "NEXT_PUBLIC_DEMO_KEY=${DEMO_KEY:-<key>}"; do
    k=${kv%%=*}; v=${kv#*=}
    run bash -c "cd apps/web && (npx vercel env rm '$k' production --yes --token \"\$VERCEL_TOKEN\" >/dev/null 2>&1 || true) && printf '%s' '$v' | npx vercel env add '$k' production --token \"\$VERCEL_TOKEN\""
  done
  run bash -c "cd apps/web && npx vercel deploy --prod --yes --token \"\$VERCEL_TOKEN\" -b NEXT_PUBLIC_API_BASE='$GATEWAY_URL' -b NEXT_PUBLIC_DEMO_KEY='${DEMO_KEY:-<key>}' | tee '$ROOT/$STATE/vercel.log'"
  [[ $DRY -eq 1 ]] || { url=$(grep -oE 'https://[a-z0-9.-]+\.vercel\.app' "$STATE/vercel.log" | tail -1 || true); echo "vercel: ${url:-see $STATE/vercel.log}"; }
}
git_update() {
  [[ "$GIT_PUSH" == "1" ]] || { echo "GIT_PUSH=0, skipping git"; return 0; }
  log "git commit + push measured results"
  run git add results apps/web/src/data
  run bash -c "git diff --cached --quiet || git commit -m 'Measured results from Modal runs + deployed gateway/UI'"
  run git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
}

# ---------------------------------------------------------------- main
setup_env
want 1 && phase1
want 2 && phase2
want 3 && phase3
if want deploy || want all; then deploy_gateway; fi
if want web || want all; then deploy_web; fi
if want git || want all; then git_update; fi
log "done. gateway=${GATEWAY_URL:-unset}. After the demo: MIN_CONTAINERS=0 modal deploy spectrum/deploy.py"
