#!/usr/bin/env bash
# A charted project at the end of a plan. docs/ROADMAP.md has two milestones: M1 holds four live
# requirements (TAL-01..03 covered by an archived plan, TAL-04 not yet) and one dropped (TAL-05);
# M2 holds two. The current plan's only stage is done and verified, its evidence rows tagged:
# TAL-04 (new) and TAL-02 (already covered by the earlier plan, so its cell must not change).
set -euo pipefail
mkdir -p src test docs/evidence/stage-1 docs/plans/2026-10-10-core-totals/evidence/stage-1
cat > package.json <<'JSON'
{ "name": "tally", "version": "1.1.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > src/tally.js <<'JS'
// Sums the amounts in a list of { amount } rows, in cents. Refunds are negative amounts.
export function total(rows) {
  return rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)
}
JS
cat > src/cli.js <<'JS'
import { existsSync, readFileSync } from 'node:fs'
import { total } from './tally.js'
const file = process.argv[2]
if (!file || !existsSync(file)) {
  console.error(`tally: no such file: ${file ?? '(none given)'}`)
  process.exit(1)
}
const rows = readFileSync(file, 'utf8').trim().split('\n').slice(1).map(l => ({ amount: Number(l.split(',')[1]) }))
console.log((total(rows) / 100).toFixed(2))
JS
cat > test/tally.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { total } from '../src/tally.js'
test('sums amounts in cents', () => assert.equal(total([{ amount: 0.29 }, { amount: 1.1 }]), 139))
test('a refund reduces the total', () => assert.equal(total([{ amount: 10 }, { amount: -2.5 }]), 750))
JS
printf 'date,amount\n2026-10-01,12.50\n2026-10-02,1.39\n' > sample.csv
printf 'date,amount\n2026-10-01,12.50\n2026-10-03,-2.50\n' > refund.csv

cat > docs/ROADMAP.md <<'MD'
# Tally roadmap
Source: docs/PRD.md (charted 2026-10-01)

## Milestones
- [ ] M1. Core totals — sum a CSV of expenses, refunds included
- [ ] M2. Reports — monthly and per-category summaries (needs: M1)

## Requirements
| ID | Requirement | PRD § | Milestone | Covered by |
|---|---|---|---|---|
| TAL-01 | Amounts are summed in integer cents | 2.1 | M1 | [Core totals](plans/2026-10-10-core-totals.md) |
| TAL-02 | `tally file.csv` prints the total with two decimals | 2.2 | M1 | [Core totals](plans/2026-10-10-core-totals.md) |
| TAL-03 | A missing file exits 1 with a message | 2.3 | M1 | [Core totals](plans/2026-10-10-core-totals.md) |
| TAL-04 | Negative amounts (refunds) reduce the total | 2.4 | M1 | |
| TAL-05 | Import from OFX files | 2.5 | dropped 2026-10-05 | |
| RPT-01 | Monthly totals table | 3.1 | M2 | |
| RPT-02 | Per-category totals table | 3.2 | M2 | |

## Out of scope
- Multiple currencies

## Open questions
- none
MD

cat > docs/plans/2026-10-10-core-totals.md <<'MD'
# Core totals plan

## Goal
M1's core: total a CSV of expenses in integer cents (TAL-01, TAL-02, TAL-03).
Evidence: [2026-10-10-core-totals/evidence/](2026-10-10-core-totals/evidence/)

## Now
All stages done

## Stages
- [x] 1. Totals — total() in cents, the CLI, and a missing-file error

## Decisions
- 2026-10-02 · Amounts are summed and stored in integer cents — floats drift
MD
cat > docs/plans/2026-10-10-core-totals/evidence/stage-1/report.md <<'MD'
# Stage 1 · Totals — evidence
Verified 2026-10-09 on 1a2b3c4

| Check | Result | Evidence |
|---|---|---|
| total() of 0.29 and 1.10 is 139 cents (req: TAL-01) | pass | `sums amounts in cents` (`npm test`) |
| `node src/cli.js sample.csv` prints 13.89 (req: TAL-02) | pass | `node src/cli.js sample.csv` printed 13.89 |
| `node src/cli.js nope.csv` exits 1 with a message (req: TAL-03) | pass | `node src/cli.js nope.csv` printed `tally: no such file: nope.csv`, exit 1 |

Project checks: tests 1/1
MD

cat > docs/PLAN.md <<'MD'
# Tally plan

## Goal
Finish M1 (Core totals) from the roadmap: refunds, written as negative amounts, reduce the total (TAL-04). Done: a CSV with a refund row totals correctly from the CLI.

## Now
All stages done — the goal is met. Next: `jbit:plan` archives this plan.

## Stages
- [x] 1. Refunds — negative amounts reduce the total, in total() and the CLI

## Decisions
- 2026-10-12 · Refunds are negative amounts in the same column, not a separate type — the user's bank export writes them that way

## Open questions
- none

## Standing decisions
- 2026-10-02 · Amounts are summed and stored in integer cents — floats drift (from [Core totals](plans/2026-10-10-core-totals.md))

## Shipped
- 2026-10-10 · Core totals: total() in cents, the CLI and its missing-file error — [plan](plans/2026-10-10-core-totals.md) · [evidence](plans/2026-10-10-core-totals/evidence/)
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
# tests 2
# pass 2
# fail 0
TXT
cat > docs/evidence/stage-1/cli-refund.txt <<'TXT'
$ node src/cli.js refund.csv
10.00
TXT
cat > docs/evidence/stage-1/cli-sample.txt <<'TXT'
$ node src/cli.js sample.csv
13.89
TXT
cat > docs/evidence/stage-1/report.md <<'MD'
# Stage 1 · Refunds — evidence
Verified 2026-10-14 on 5d6e7f8

| Check | Result | Evidence |
|---|---|---|
| total() of 10.00 and -2.50 is 750 cents (req: TAL-04) | pass | `a refund reduces the total` in [tests.txt](tests.txt) |
| `node src/cli.js refund.csv` prints 10.00 (req: TAL-04) | pass | [cli-refund.txt](cli-refund.txt) |
| `node src/cli.js sample.csv` still prints 13.89 (req: TAL-02) | pass | [cli-sample.txt](cli-sample.txt) |

Project checks: tests 2/2 ([tests.txt](tests.txt))
Audit: no dependencies
MD

git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "Stage 1: refunds; all stages done"
