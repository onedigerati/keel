#!/usr/bin/env bash
# An existing invoicing project: working code, one test already failing (an unrelated
# currency-format bug), and an untested discount module the requested feature must change.
set -euo pipefail
mkdir -p src test
cat > package.json <<'JSON'
{ "name": "invoicer", "version": "1.4.0", "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > README.md <<'MD'
# invoicer
Builds invoices from line items. `node src/cli.js items.json [CODE]` prints the invoice.
MD
cat > src/money.js <<'JS'
// Formats integer cents as dollars.
export function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`
}
JS
cat > src/discount.js <<'JS'
// Fixed-amount discount codes, in cents.
const CODES = { FIVEOFF: 500, TENOFF: 1000 }

export function applyDiscount(subtotalCents, code) {
  if (!code) return subtotalCents
  const off = CODES[code.toUpperCase()]
  if (off === undefined) throw new Error(`unknown discount code: ${code}`)
  return Math.max(0, subtotalCents - off)
}
JS
cat > src/invoice.js <<'JS'
import { applyDiscount } from './discount.js'
import { formatCents } from './money.js'

export function buildInvoice(items, { code } = {}) {
  const subtotal = items.reduce((sum, i) => sum + i.unitCents * i.qty, 0)
  const total = applyDiscount(subtotal, code)
  return { subtotal, total, lines: items.length, display: formatCents(total) }
}
JS
cat > src/cli.js <<'JS'
import { readFileSync } from 'node:fs'
import { buildInvoice } from './invoice.js'
const [file, code] = process.argv.slice(2)
const inv = buildInvoice(JSON.parse(readFileSync(file, 'utf8')), { code })
console.log(`${inv.lines} lines · total ${inv.display}`)
JS
cat > test/invoice.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInvoice } from '../src/invoice.js'
test('totals line items', () => {
  const inv = buildInvoice([{ unitCents: 250, qty: 2 }, { unitCents: 1000, qty: 1 }])
  assert.equal(inv.total, 1500)
})
test('shows thousands with a separator', () => {
  const inv = buildInvoice([{ unitCents: 123450, qty: 1 }])
  assert.equal(inv.display, '$1,234.50')
})
JS
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "invoicer 1.4.0"
