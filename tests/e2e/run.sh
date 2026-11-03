#!/usr/bin/env bash
# Builds the app against the mock backend and runs the phone-size browser test.
# Usage: tests/e2e/run.sh [output-dir]
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:-./tests/e2e/shots}"
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-publishable
export SUPABASE_SECRET_KEY=test-secret
export ANTHROPIC_API_KEY=test-key
export ANTHROPIC_BASE_URL=http://127.0.0.1:54329
export NEXT_TELEMETRY_DISABLED=1
free_ports() { fuser -k 3100/tcp 54329/tcp >/dev/null 2>&1 || true; }
free_ports
npx next build >/dev/null
node tests/e2e/mock-supabase.mjs > /dev/null 2>&1 & MOCK=$!
npx next start -p 3100 -H 127.0.0.1 > /dev/null 2>&1 & NEXT=$!
trap 'kill $MOCK $NEXT 2>/dev/null || true; free_ports' EXIT
for _ in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:3100/login && break; sleep 1; done
OUT="$OUT" node tests/e2e/smoke.mjs
