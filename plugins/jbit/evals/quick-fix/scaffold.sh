#!/usr/bin/env bash
# A project whose plan is finished: all stages done, one decision that still binds
# (integer cents) and one that only mattered to the finished feature, plus stage 1's
# committed evidence in docs/evidence/.
set -euo pipefail
mkdir -p docs/evidence/stage-1 src test
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
$ npm test
# tests 1
# pass 1
# fail 0
TXT
cat > docs/evidence/stage-1/report.md <<'MD'
# Stage 1 · Core — evidence
Verified 2026-10-02 on 3f2a9c1

| Check | Result | Evidence |
|---|---|---|
| total() of 0.29 and 1.10 is 139 cents | pass | `sums amounts in cents` in [tests.txt](tests.txt) |

Project checks: tests 1/1 ([tests.txt](tests.txt))
Audit: no dependencies
MD
git init -q
# a repo-local author, so the agent can commit on a machine with no global git identity
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "Stage 2: CSV input; all stages done"
