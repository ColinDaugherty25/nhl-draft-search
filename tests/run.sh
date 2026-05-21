#!/usr/bin/env bash
# Run the full test suite: Python unit + JS unit + Playwright E2E.
# From the project root: bash tests/run.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Install Playwright into ./node_modules if it's not already there. With
# --no-save --no-package-lock npm doesn't create a committed package.json or
# lockfile — node_modules/ stays gitignored as the only side effect.
if [ ! -d node_modules/playwright ]; then
  echo "==> Installing Playwright (no committed deps, just ./node_modules)…"
  npm install --no-save --no-package-lock --silent playwright >/dev/null
fi

# Start the dev server in the background if port 8000 isn't already serving.
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! curl -fs http://localhost:8000/data/years.json >/dev/null 2>&1; then
  echo "==> Starting python3 server.py…"
  python3 server.py >/tmp/nhl-server-test.log 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    if curl -fs http://localhost:8000/data/years.json >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
  if ! curl -fs http://localhost:8000/data/years.json >/dev/null 2>&1; then
    echo "FAIL: server did not come up; see /tmp/nhl-server-test.log"
    exit 1
  fi
else
  echo "==> Using existing server on port 8000"
fi

echo
echo "==> Python unit tests"
python3 -m unittest discover -s tests -p 'test_*.py' -v

echo
echo "==> JS unit tests"
node --test 'tests/unit/*.mjs'

echo
echo "==> Playwright E2E tests"
node --test 'tests/e2e/test_*.mjs'

echo
echo "All test layers passed."
