#!/usr/bin/env bash
# A plan whose Goal spans several features (totals, category reports, exports), part way through.
# The request adds a feature that fits that Goal, so it belongs in this plan, not a new one.
set -euo pipefail
mkdir -p docs src test
cat > package.json <<'JSON'
{ "name": "spend", "version": "0.2.0", "type": "module", "scripts": { "test": "node --test" } }
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
JS
cat > docs/PLAN.md <<'MD'
# Spend plan

## Goal
A personal spending CLI for one person: totals from a bank CSV, reports by month and category, and exporting the data for use in other tools. Done: all three work from one `spend` command.

## Now
Stage 2 of 4 · Category reports
Risk: UI only
Checks:
- [ ] `spend report --by category file.csv` prints one row per category with its total (proof: run the CLI)
- [ ] rows with no category land under "uncategorized" (proof: test)
Open: none

## Stages
- [x] 1. Totals — parse the CSV, total in cents, with tests
- [ ] 2. Category reports — group by category, print a table
- [ ] 3. Monthly reports — group by month, print a table
- [ ] 4. CSV export — write the parsed rows back out as clean CSV

## Decisions
- 2026-10-01 · Amounts are summed and stored in integer cents — floats drift

## Open questions
- none
MD
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "Stage 1: totals"
