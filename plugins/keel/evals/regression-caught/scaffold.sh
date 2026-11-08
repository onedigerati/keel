#!/usr/bin/env bash
# A project on the last stage of its plan. Stage 1 proved `node src/cli.js sample.csv` prints 13.89 by
# running the CLI, and its report says so. Stage 2 (uncommitted) reads the amount from a third column for
# its category files, which breaks the plain two-column CSV; stage 2's own checks still pass, and no test
# covers the plain CLI run. Only re-running stage 1's check shows the regression.
set -euo pipefail
mkdir -p docs/evidence/stage-1 src test
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
cat > docs/evidence/.gitignore <<'TXT'
# Screenshots, traces and videos stay local. Delete the image lines to commit screenshots.
*.png
*.jpg
*.jpeg
*.webp
*.gif
*.zip
*.webm
*.mp4
*.trace
*.har
TXT
cat > docs/evidence/stage-1/tests.txt <<'TXT'
npm test
ok 1 - sums amounts in cents
ok 2 - an empty list is zero
# tests 2
# pass 2
# fail 0
TXT
cat > docs/evidence/stage-1/cli-sample.txt <<'TXT'
node src/cli.js sample.csv
13.89
TXT
cat > docs/evidence/stage-1/report.md <<'MD'
# Stage 1 · Core and CLI — evidence
Verified 2026-11-02 on 1a2b3c4

| Check | Result | Evidence |
|---|---|---|
| `total()` sums amounts in integer cents, so 0.29 + 1.10 is 139 (proof: test `sums amounts in cents`) | pass | test `sums amounts in cents`, `npm test` ([tests.txt](tests.txt)) |
| `node src/cli.js sample.csv` prints `13.89` (proof: run the CLI, a test can't see the printed output) | pass | [cli-sample.txt](cli-sample.txt) |

Project checks: tests 2/2 ([tests.txt](tests.txt))
Audit: no dependencies, nothing to audit
MD
cat > docs/PLAN.md <<'MD'
# Tally plan

## Goal
A tiny CLI that totals expense rows from a CSV, for one person tracking spending. Done: `node src/cli.js file.csv` prints the total, and `--by category` prints one per category.

## Now
Stage 2 of 2 · Categories
Risk: UI only
Checks:
- [ ] `byCategory()` totals each category in integer cents (proof: test `totals each category`)
- [ ] `node src/cli.js cats.csv --by category` prints `food 4.39` and `rent 9.50` (proof: run the CLI, a test can't see the printed output)
Open: none

## Stages
- [x] 1. Core and CLI — total() in cents, a CLI that prints a CSV's total
- [ ] 2. Categories — per-category totals with `--by category`

## Decisions
- 2026-11-01 · Amounts are summed in integer cents — floats drift

## Open questions
- none
MD
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "Stage 1: core total() and CLI"
# Stage 2, built and not yet verified or committed.
cat > src/tally.js <<'JS'
// Sums the amounts in a list of { amount } rows, in cents.
export function total(rows) {
  return rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
}

// Totals per category, in cents: { food: 439, rent: 950 }.
export function byCategory(rows) {
  const out = {}
  for (const r of rows) out[r.category] = (out[r.category] ?? 0) + Math.round(r.amount * 100)
  return out
}
JS
cat > src/cli.js <<'JS'
import { readFileSync } from 'node:fs'
import { total, byCategory } from './tally.js'
const file = process.argv[2]
if (!file) {
  console.error('usage: node src/cli.js <file.csv> [--by category]')
  process.exit(2)
}
const rows = readFileSync(file, 'utf8').trim().split('\n').slice(1).map(l => {
  const [, category, amount] = l.split(',')
  return { category, amount: Number(amount) }
})
if (process.argv.includes('--by') && process.argv[process.argv.indexOf('--by') + 1] === 'category') {
  for (const [c, cents] of Object.entries(byCategory(rows))) console.log(`${c} ${(cents / 100).toFixed(2)}`)
} else {
  console.log((total(rows) / 100).toFixed(2))
}
JS
cat > cats.csv <<'CSV'
date,category,amount
2026-11-01,food,0.29
2026-11-02,food,4.10
2026-11-03,rent,9.50
CSV
cat > test/tally.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total, byCategory } from '../src/tally.js'
test('sums amounts in cents', () => assert.equal(total([{ amount: 0.29 }, { amount: 1.1 }]), 139))
test('an empty list is zero', () => assert.equal(total([]), 0))
test('totals each category', () => assert.deepEqual(byCategory([{ category: 'food', amount: 0.29 }, { category: 'food', amount: 4.1 }, { category: 'rent', amount: 9.5 }]), { food: 439, rent: 950 }))
JS
