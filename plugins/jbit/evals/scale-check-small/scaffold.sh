#!/usr/bin/env bash
# A tiny working CLI with tests and no plan yet: the requested feature (a JSON export command) is a few stages,
# so none of jbit:plan's scale signals should fire.
set -euo pipefail
mkdir -p src test
cat > package.json <<'JSON'
{ "name": "tally", "version": "1.0.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > README.md <<'MD'
# tally
Totals expense rows from a CSV. `node src/cli.js file.csv` prints the total.
MD
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
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "tally 1.0.0"
