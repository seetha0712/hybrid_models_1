#!/usr/bin/env bash
# Pre-demo: deploy with warm containers and ping every tier.
#   ./scripts/warm.sh https://<workspace>--model-spectrum-web.modal.run $DEMO_KEY
set -euo pipefail
BASE=${1:?base url}; KEY=${2:?demo key}
MIN_CONTAINERS=1 modal deploy spectrum/deploy.py
curl -sS "$BASE/health" | python3 -m json.tool
curl -sS -X POST "$BASE/classify_txn" -H "content-type: application/json" -H "X-Demo-Key: $KEY" -d '{"narrations":["STARBUCKS #221 AUSTIN TX"]}' | head -c 300; echo
curl -sS -X POST "$BASE/openweights" -H "content-type: application/json" -H "X-Demo-Key: $KEY" -d '{"prompt":"Say ready.","max_new_tokens":8}' | head -c 300; echo
echo "warm. Remember: MIN_CONTAINERS=0 modal deploy spectrum/deploy.py after the demo."
