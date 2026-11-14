#!/usr/bin/env bash
# A project at stage 1 of its plan with the stage built and nothing verified yet. Two checks:
# one proven by a test, one by running the CLI. Both pass, so the evidence report should say so.
set -euo pipefail
mkdir -p docs src test
cat > package.json <<'JSON'
{ "name": "tally", "version": "0.1.0", "type": "module", "scripts": { "test": "node --test" } }
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
const file = process.argv[2]
if (!file) {
  console.error('usage: node src/cli.js <file.csv>')
  process.exit(2)
}
const rows = readFileSync(file, 'utf8').trim().split('\n').slice(1).map(l => ({ amount: Number(l.split(',')[1]) }))
console.log((total(rows) / 100).toFixed(2))
JS
cat > sample.csv <<'CSV'
date,amount
2026-11-01,0.29
2026-11-02,1.10
2026-11-03,12.50
CSV
cat > test/tally.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from '../src/tally.js'
test('sums amounts in cents', () => assert.equal(total([{ amount: 0.29 }, { amount: 1.1 }]), 139))
test('an empty list is zero', () => assert.equal(total([]), 0))
JS
cat > docs/PLAN.md <<'MD'
# Tally plan

## Goal
A tiny CLI that totals expense rows from a CSV, for one person tracking spending. Done: `node src/cli.js file.csv` prints the total.

## Now
Stage 1 of 2 · Core and CLI
Risk: none
Checks:
- [ ] `total()` sums amounts in integer cents, so 0.29 + 1.10 is 139 (proof: test `sums amounts in cents`)
- [ ] `node src/cli.js sample.csv` prints `13.89` (proof: run the CLI)
Open: none

## Stages
- [ ] 1. Core and CLI — total() in cents, a CLI that prints a CSV's total
- [ ] 2. Categories — per-category totals with `--by category`

## Decisions
- 2026-11-01 · Amounts are summed in integer cents — floats drift

## Open questions
- none
MD
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "Stage 1: core total() and CLI"
