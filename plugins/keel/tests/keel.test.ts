import { expect, test } from 'claude-code/testing'
import { findSecrets } from '../hooks/secrets.ts'
import { parsePlan } from '../hooks/register.ts'

// fake credentials are assembled at run time so this file never trips a secret scanner itself
const AWS = 'AKIA' + 'Q'.repeat(16)
const GH = 'ghp_' + 'a1B2'.repeat(9)
const ANT = 'sk-' + 'ant-' + 'x'.repeat(30)
const PEM = '-----BEGIN ' + 'PRIVATE KEY-----'

const diffOf = (file: string, ...lines: string[]) =>
  [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, `@@ -3,0 +4,${lines.length} @@`, ...lines].join('\n')

test('finds keys on added lines, with file, line and kind', () => {
  const found = findSecrets(diffOf('src/config.ts', `+const a = 1`, `+const key = "${AWS}"`))
  expect(found).toEqual([{ file: 'src/config.ts', line: 5, kind: 'an AWS access key' }])
})

test('recognizes each common format', () => {
  const kinds = [GH, ANT, PEM].map(v => findSecrets(diffOf('x.txt', `+${v}`))[0]?.kind)
  expect(kinds).toEqual(['a GitHub token', 'an Anthropic API key', 'a private key'])
})

test('ignores removed lines, context and allow-marked lines', () => {
  const diff = diffOf('a.ts', `-const old = "${AWS}"`, `+const k = "${AWS}" // keel:allow-secret`)
  expect(findSecrets(diff)).toEqual([])
})

test('flags credential files by name but not .env.example', () => {
  const diff = [diffOf('.env', '+PORT=3000'), diffOf('.env.example', '+API_KEY=')].join('\n')
  expect(findSecrets(diff)).toEqual([{ file: '.env', kind: 'a credentials file' }])
})

test('scans whole new files', () => {
  expect(findSecrets('', [{ path: 'notes.md', text: `line one\ntoken ${GH}` }])).toEqual([
    { file: 'notes.md', line: 2, kind: 'a GitHub token' },
  ])
})

test('ordinary code passes', () => {
  const diff = diffOf('a.ts', '+const password = form.get("password")', '+fetch(`https://api.example.com/v1`)')
  expect(findSecrets(diff)).toEqual([])
})

test('reads a plan with a Now section and a stage checklist', () => {
  const plan = parsePlan(
    'docs/PLAN.md',
    [
      '# Plan',
      '## Now',
      'Stage 2 · Share mode',
      '- [ ] controls work on touch',
      '## Stages',
      '- [x] 1. Foundation — engine',
      '- [ ] 2. Share mode — viewer controls',
      '- [ ] 3. Polish',
    ].join('\n'),
  )
  expect(plan.done).toBe(1)
  expect(plan.total).toBe(3)
  expect(plan.current).toBe('2. Share mode')
  expect(plan.now).toBe('Stage 2 · Share mode\n- [ ] controls work on touch')
})

test('reads an older plan with bold stage names and no Now section', () => {
  const plan = parsePlan('docs/BUILD_PLAN.md', '## Stages\n\n- [x] **Stage 1** — scaffold\n- [x] **Stage 2** — Act 2\n')
  expect(plan).toEqual({ path: 'docs/BUILD_PLAN.md', now: undefined, done: 2, total: 2, current: undefined })
})

test('the guard denies a commit that stages a key, and lets a clean one through', async ($, on) => {
  let staged = diffOf('src/client.ts', `+const token = "${GH}"`)
  on('process.run', () => ({ value: { exitCode: 0, stdout: staged, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', () => ({ result: { text: 'committed' } }))

  const blocked = await $.tool.call({ tool: 'Bash', command: 'git commit -m "wire client"' })
  expect(blocked.deny).toContain('src/client.ts:4: a GitHub token')
  expect(blocked.deny).not.toContain(GH)

  staged = diffOf('src/client.ts', '+const token = process.env.GH_TOKEN')
  const passed = await $.tool.call({ tool: 'Bash', command: 'git commit -m "wire client"' })
  expect(passed.deny).toBeUndefined()

  const other = await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(other.deny).toBeUndefined()
})
