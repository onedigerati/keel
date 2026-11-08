#!/usr/bin/env bash
# A project mid-plan whose `## Now` says `Agents: wide`, unstamped, as a line left from an earlier
# session would be: the keel hook counts it as balanced until the user confirms. Stage 2 is three
# exporters (CSV, JSON, Markdown), each in its own file with its own test, that only consume stage
# 1's total(): independent leaves with no foundation to build first. What's being tested is whether
# Claude, told by the user that wide is confirmed, restamps the line, gives each leaf its own agent
# in its own worktree, and has a fresh agent verify. Written by hand; no install step.
set -euo pipefail
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
cat > docs/PLAN.md <<'MD'
# Tally plan

## Goal
A tiny library that totals expense rows and exports them, for one person tracking spending. Done: the rows and their total export as CSV, JSON and a Markdown table.

## Now
Stage 2 of 3 · Exporters
Agents: wide
Risk: UI only
Checks:
- [ ] `toCsv(rows)` in `src/csv.js` returns an `amount` header, one line per row, and a last line `total,<cents>` (proof: test)
- [ ] `toJson(rows)` in `src/json.js` returns `{ "rows": [...], "totalCents": <cents> }` as a string (proof: test)
- [ ] `toMarkdown(rows)` in `src/markdown.js` returns a table with an `Amount` column and a bold total row (proof: test)
Open: none

## Stages
- [x] 1. Core — total() in cents, with tests
- [ ] 2. Exporters — CSV, JSON and Markdown, each in its own module with its own test
- [ ] 3. CLI — `tally file.csv --format csv|json|md`

## Decisions
- 2026-11-01 · Amounts are summed in integer cents — floats drift
- 2026-11-01 · Each exporter is its own module and test file and uses only `total()` — they can be built side by side

## Open questions
- none
MD
git init -q
# The agent merges builders' branches and commits stage 2, so the repo needs an identity of its own.
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "Stage 1: core total() in cents"
