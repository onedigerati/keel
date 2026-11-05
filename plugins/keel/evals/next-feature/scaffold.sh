#!/usr/bin/env bash
# A project whose plan is finished: all stages done, one decision that still binds
# (integer cents) and one that only mattered to the finished feature.
set -euo pipefail
mkdir -p docs src test
cat > package.json <<'JSON'
{ "name": "tally", "version": "1.0.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > src/tally.js <<'JS'
// Sums the amounts in a list of { amount } rows, in cents.
export function total(rows) {
  return rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
}
JS
cat > src/cli.js <<'JS'
import { readFileSync } from 'node:fs'
import { total } from './tally.js'
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1).map(l => ({ amount: Number(l.split(',')[1]) }))
console.log((total(rows) / 100).toFixed(2))
JS
cat > test/tally.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from '../src/tally.js'
test('sums amounts in cents', () => assert.equal(total([{ amount: 0.29 }, { amount: 1.1 }]), 139))
JS
cat > docs/PLAN.md <<'MD'
# Tally plan

## Goal
A tiny CLI that totals expense rows from a CSV, for one person tracking spending. Done: `tally file.csv` prints the total.

## Now
All stages done

## Stages
- [x] 1. Core — total() in cents, with tests
- [x] 2. CSV input — read a file, parse rows, print the total

## Decisions
- 2026-10-01 · Amounts are summed and stored in integer cents — floats drift
- 2026-10-03 · The CSV's second column is the amount; no header detection — the user's bank export is fixed

## Open questions
- Should negative amounts (refunds) be allowed? — the user, blocks nothing yet
MD
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "Stage 2: CSV input; all stages done"
