#!/usr/bin/env bash
set -euo pipefail
: "${BASE_URL:=https://rafiq-o6qd.onrender.com}"
command -v k6 >/dev/null || { echo "k6 is required"; exit 2; }
mkdir -p tests/load/results
k6 run --summary-export tests/load/results/production-summary.json tests/load/rafiq-load.js
