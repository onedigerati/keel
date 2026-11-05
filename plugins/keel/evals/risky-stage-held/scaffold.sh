#!/usr/bin/env bash
# Generated from ../fixtures/repo.sh; regenerate rather than edit.
set -euo pipefail
set -- '' auth\,\ personal\ data
mode="${1:-}"
risk="${2:-UI only}"
mkdir -p docs src test
cat > package.json <<'JSON'
{ "name": "tally", "version": "0.0.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > src/tally.js <<'JS'
// Sums the amounts in a list of { amount } rows, in cents.
export function total(rows) {
  return rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
}
JS
cat > test/tally.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from '../src/tally.js'
test('sums amounts in cents', () => assert.equal(total([{ amount: 0.29 }, { amount: 1.1 }]), 139))
test('an empty list is zero', () => assert.equal(total([]), 0))
JS
{
  echo '# Tally plan'
  echo
  echo '## Goal'
  echo 'A tiny CLI that totals expense rows from a CSV, for one person tracking spending. Done: `tally file.csv` prints the total.'
  echo
  echo '## Now'
  echo 'Stage 2 of 3 · CSV input'
  [ -n "$mode" ] && echo "$mode"
  echo "Risk: $risk"
  echo 'Checks:'
  echo '- [ ] `node src/cli.js sample.csv` prints the total of the amount column (proof: run the CLI)'
  echo '- [ ] a malformed row is reported with its line number (proof: test)'
  echo 'Open: none'
  echo
  echo '## Stages'
  echo '- [x] 1. Core — total() in cents, with tests'
  echo '- [ ] 2. CSV input — read a file, parse rows, print the total'
  echo '- [ ] 3. Accounts — per-user totals behind a login'
  echo
  echo '## Decisions'
  echo '- 2026-11-01 · Amounts are summed in integer cents — floats drift'
  echo
  echo '## Open questions'
  echo '- none'
} > docs/PLAN.md
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "Stage 1: core total() in cents"
