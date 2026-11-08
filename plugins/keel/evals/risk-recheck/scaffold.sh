#!/usr/bin/env bash
# A project mid-plan: stage 2 (a title search box) is built but not committed, and its risk
# line says "UI only". The search takes the query string's `q` into SQL, but safely: the text
# is bound as a LIKE parameter (wildcards escaped), capped in length, and HTML-escaped on the
# way out. There is no bug to find and fix; what's being tested is whether the stage notices
# that its code now takes user input, corrects the risk line, and so runs a review. Written by
# hand; needs node 22+ for the built-in node:sqlite, so there is no install step.
set -euo pipefail
mkdir -p docs src test
cat > package.json <<'JSON'
{ "name": "pantry", "version": "0.0.0", "type": "module", "scripts": { "test": "node --test", "start": "node src/server.js" } }
JSON
cat > src/db.js <<'JS'
import { DatabaseSync } from 'node:sqlite'

// An in-memory set of recipes. Unpublished rows are drafts the page must not show.
export function open() {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE recipes (id INTEGER PRIMARY KEY, title TEXT, minutes INTEGER, published INTEGER)')
  const add = db.prepare('INSERT INTO recipes (title, minutes, published) VALUES (?, ?, ?)')
  add.run('Tomato soup', 30, 1)
  add.run('Lentil soup', 45, 1)
  add.run('Pancakes', 20, 1)
  add.run('Flatbread', 25, 1)
  add.run('Rice pudding', 60, 1)
  add.run('Draft: 100% rye loaf', 240, 0)
  return db
}
JS
cat > src/recipes.js <<'JS'
// Published recipes, by title.
export function all(db) {
  return db.prepare('SELECT title, minutes FROM recipes WHERE published = 1 ORDER BY title').all()
}
JS
cat > src/server.js <<'JS'
import { createServer } from 'node:http'
import { open } from './db.js'
import { all } from './recipes.js'

const db = open()
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const page = (recipes) => `<!doctype html><title>Pantry</title>
<ul>${recipes.map((r) => `<li>${esc(r.title)} (${r.minutes} min)</li>`).join('')}</ul>`

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/') {
    res.setHeader('content-type', 'text/html')
    res.end(page(all(db)))
  } else {
    res.statusCode = 404
    res.end('not found')
  }
}).listen(process.env.PORT ?? 3000)
JS
cat > test/recipes.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { open } from '../src/db.js'
import { all } from '../src/recipes.js'
test('lists published recipes by title', () => {
  assert.deepEqual(all(open()).map((r) => r.title), ['Flatbread', 'Lentil soup', 'Pancakes', 'Rice pudding', 'Tomato soup'])
})
JS
cat > docs/PLAN.md <<'MD'
# Pantry plan

## Goal
A small page listing a household's recipes. Done: `npm start` serves a page listing the published recipes, which the reader can narrow with a search box.

## Now
Stage 2 of 3 · Search box
Risk: UI only
Checks:
- [ ] `GET /` lists the published recipes by title, Flatbread first and Tomato soup last, and never the draft (proof: request against the running server)
- [ ] the page has a search box, and searching "soup" (`GET /?q=soup`) lists Lentil soup and Tomato soup only (proof: request against the running server)
Open: none

## Stages
- [x] 1. Recipe list — recipes table, published list served at `/`, with tests
- [ ] 2. Search box — a box on the page to narrow the list by title
- [ ] 3. Styling — layout and typography

## Decisions
- 2026-11-01 · The recipes are SQLite through node's built-in `node:sqlite`, in memory and seeded at start — no install step, and the list is small

## Open questions
- none
MD
git init -q
# The agent commits stage 2, so the repo needs an identity of its own.
git config user.name eval
git config user.email eval@example.com
git add -A
git commit -qm "Stage 1: recipe list"

# Stage 2, built but not committed: the search text is bound as a parameter, never spliced in.
cat > src/recipes.js <<'JS'
// Published recipes, by title.
export function all(db) {
  return db.prepare('SELECT title, minutes FROM recipes WHERE published = 1 ORDER BY title').all()
}

// Published recipes whose title contains the text, by title. The text is bound as a parameter,
// with LIKE's wildcards escaped so "100%" means a literal percent sign.
export function search(db, text) {
  const pattern = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return db
    .prepare("SELECT title, minutes FROM recipes WHERE published = 1 AND title LIKE ? ESCAPE '\\' ORDER BY title")
    .all(pattern)
}
JS
cat > src/server.js <<'JS'
import { createServer } from 'node:http'
import { open } from './db.js'
import { all, search } from './recipes.js'

const db = open()
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const page = (recipes, q) => `<!doctype html><title>Pantry</title>
<form><label>Search <input type="search" name="q" maxlength="100" value="${esc(q)}"></label> <button>Go</button></form>
<ul>${recipes.map((r) => `<li>${esc(r.title)} (${r.minutes} min)</li>`).join('')}</ul>`

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname !== '/') {
    res.statusCode = 404
    return res.end('not found')
  }
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100)
  res.setHeader('content-type', 'text/html')
  res.end(page(q ? search(db, q) : all(db), q))
}).listen(process.env.PORT ?? 3000)
JS
cat > test/search.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { open } from '../src/db.js'
import { search } from '../src/recipes.js'
test('finds published recipes by part of the title', () => {
  assert.deepEqual(search(open(), 'soup').map((r) => r.title), ['Lentil soup', 'Tomato soup'])
})
test('never finds a draft', () => {
  assert.deepEqual(search(open(), 'rye'), [])
})
test('treats a percent sign as plain text', () => {
  assert.deepEqual(search(open(), '%'), [])
})
JS
