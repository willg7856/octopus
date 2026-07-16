#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (v20+). Install it, then run this again."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies…"
  npm install
fi

echo "Starting Octopus at http://127.0.0.1:5173"
npm start
