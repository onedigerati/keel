#!/usr/bin/env bash
# Generated from ../fixtures/exporters.sh; regenerate rather than edit.
set -euo pipefail
set -- Agents:\ wide
agents="${1:-}"
risk="${2:-UI only}"
decision="${3:-}"
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
  echo 'A tiny library that totals expense rows and exports them, for one person tracking spending. Done: the rows and their total export as CSV, JSON and a Markdown table.'
  echo
  echo '## Now'
  echo 'Stage 2 of 3 · Exporters'
  [ -n "$agents" ] && echo "$agents"
  echo "Risk: $risk"
  echo 'Checks:'
  echo '- [ ] `toCsv(rows)` in `src/csv.js` returns an `amount` header, one line per row, and a last line `total,<cents>` (proof: test)'
  echo '- [ ] `toJson(rows)` in `src/json.js` returns `{ "rows": [...], "totalCents": <cents> }` as a string (proof: test)'
  echo '- [ ] `toMarkdown(rows)` in `src/markdown.js` returns a table with an `Amount` column and a bold total row (proof: test)'
  echo 'Open: none'
  echo
  echo '## Stages'
  echo '- [x] 1. Core — total() in cents, with tests'
  echo '- [ ] 2. Exporters — CSV, JSON and Markdown, each in its own module with its own test'
  echo '- [ ] 3. CLI — `tally file.csv --format csv|json|md`'
  echo
  echo '## Decisions'
  echo '- 2026-11-01 · Amounts are summed in integer cents — floats drift'
  echo '- 2026-11-01 · Each exporter is its own module and test file and uses only `total()` — they can be built side by side'
  [ -n "$decision" ] && echo "$decision"
  echo
  echo '## Open questions'
  echo '- none'
} > docs/PLAN.md
git init -q
# The agent merges builders' branches and commits stage 2, so the repo needs an identity of its own.
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "Stage 1: core total() in cents"
