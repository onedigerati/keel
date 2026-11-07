import type { On } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'
import { findSecrets } from '../hooks/secrets.ts'
import { closedStages, evidencePath, parsePlan, reportRows, samePath } from '../hooks/register.ts'
import { addScope, commitScope, gitCall, outwardReason, parseCommands } from '../hooks/shell.ts'

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
  expect(plan).toEqual({ path: 'docs/BUILD_PLAN.md', goal: undefined, now: undefined, mode: undefined, stage: undefined, done: 2, total: 2, current: undefined })
})

test('reads the autopilot mode, and a pause with its reason', () => {
  expect(parsePlan('PLAN.md', planWith('Mode: autopilot')).mode).toEqual({ kind: 'autopilot' })
  expect(parsePlan('PLAN.md', planWith('Mode: paused — stage 3 touches auth')).mode).toEqual({
    kind: 'paused',
    reason: 'stage 3 touches auth',
  })
  expect(parsePlan('PLAN.md', planWith('Open: none')).mode).toBeUndefined()
})

test('finds the stage line when the Mode line sits above it', () => {
  const text = ['## Now', 'Mode: paused — stage 3 touches auth', 'Stage 2 of 3 · Share mode', '- [x] controls work', '## Stages', '- [ ] 2. Share mode'].join('\n')
  const plan = parsePlan('PLAN.md', text)
  expect(plan.stage?.number).toBe('2')
  expect(plan.stage?.key).toBe('Stage 2 of 3 · Share mode')
  expect(plan.stage?.checks).toEqual([{ text: 'controls work', done: true }])
  expect(plan.mode).toEqual({ kind: 'paused', reason: 'stage 3 touches auth' })
})

/** A plan two stages from done, its `## Now` led by `mode`; `tag` makes two plans differ. */
function planWith(mode: string, tag = '') {
  return [
    '## Now',
    `Stage 2 of 3 · Share mode${tag}`,
    mode,
    '## Stages',
    '- [x] 1. Foundation — engine',
    '- [ ] 2. Share mode — viewer controls',
    '- [ ] 3. Polish — copy and layout',
  ].join('\n')
}

/** Stands in for the engine under the autopilot: the plan on disk (and any other files, by repo path), the context gauge, and what the hooks send it. */
function engine(
  on: On,
  plan: { text: string; files?: Record<string, string>; untracked?: Record<string, string>; broken?: string[] },
  percent = 20,
  agents: { status: string }[] = [],
) {
  const sent = { prompts: [] as string[], compactions: [] as (string | undefined)[], notes: [] as string[] }
  on('agent.list', () => ({ value: agents.map((a, i) => ({ id: `a${i}`, description: 'build', type: 'general-purpose', ...a })) as never }))
  on('session.cwd', () => ({ value: '/repo' }))
  // `untracked` files are read only as a `git add` lists them, never seen by an exists check
  const find = (files: Record<string, string> | undefined, path: string) => Object.entries(files ?? {}).find(([p]) => path === p || path.endsWith(`/${p}`))?.[1]
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/docs/PLAN.md') || find(plan.files, e.path) !== undefined || !!plan.broken?.some(p => e.path === p || e.path.endsWith(`/${p}`)) }))
  // a `broken` path exists but its read throws, as a directory's would
  const broken = (path: string) => !!plan.broken?.some(p => path === p || path.endsWith(`/${p}`))
  on('fs.read', (_, e) => {
    if (broken(e.path)) throw new Error(`EISDIR: illegal operation on a directory, read '${e.path}'`)
    return { value: find(plan.files, e.path) ?? find(plan.untracked, e.path) ?? plan.text }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent }, rateLimits: [] } }))
  on('session.compact', (_, e) => {
    sent.compactions.push(e.instructions)
    return percent > 90 ? { skip: 'busy' } : { messages: [{ role: 'user' as const, text: 'summary', toolUses: [] }] }
  })
  on('prompt.submit', (_, e) => (e.text.startsWith('keel autopilot:') && sent.prompts.push(e.text), { text: e.text }))
  on('ui.notify', (_, e) => (sent.notes.push(e.text), { value: { isSent: true, channel: 'terminal_bell' } as never }))
  on('ui.toast', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return sent
}

/** Arms autopilot the way a session does: the session sees the plan without a Mode line, then the line turns to autopilot. */
async function arm($: Engine, plan: { text: string }) {
  const text = plan.text
  plan.text = text.replace(/^Mode: .*\n/m, '')
  await $.turn.complete(ended('t0'))
  plan.text = text
}

const ended = (turnId: string) => ({ turnId, answer: 'stage closed', durationMs: 1, isAborted: false, reason: 'answer' as const })

test('autopilot prompts the next stage once the turn has ended', async ($, on) => {
  const clock = mock.clock(on)
  const plan = { text: planWith('Mode: autopilot', ' a') }
  const sent = engine(on, plan)
  await arm($, plan)

  await $.turn.complete(ended('t1'))
  expect(sent.prompts).toEqual([])
  await clock.advance(1000)

  expect(sent.prompts).toHaveLength(1)
  expect(sent.prompts[0]).toContain('Next: 2. Share mode.')
  expect(sent.compactions).toEqual([])
})

test('autopilot compacts first when the context is past 65%', async ($, on) => {
  const clock = mock.clock(on)
  const plan = { text: planWith('Mode: autopilot', ' b') }
  const sent = engine(on, plan, 70)
  await arm($, plan)

  await $.turn.complete(ended('t1'))
  await clock.advance(1000)

  expect(sent.compactions).toHaveLength(1)
  expect(sent.compactions[0]).toContain('Keep the project-plan state exactly')
  expect(sent.prompts[0]).toContain('just compacted')
})

test('a compaction that is refused still lets the run go on', async ($, on) => {
  const clock = mock.clock(on)
  // past 90% the stand-in engine refuses the compaction
  const plan = { text: planWith('Mode: autopilot', ' g') }
  const sent = engine(on, plan, 95)
  await arm($, plan)

  await $.turn.complete(ended('t1'))
  await clock.advance(1000)

  expect(sent.compactions).toHaveLength(1)
  expect(sent.prompts).toHaveLength(1)
  expect(sent.prompts[0]).not.toContain('just compacted')
})

test('autopilot stands aside when a turn starts before it acts', async ($, on) => {
  const clock = mock.clock(on)
  const plan = { text: planWith('Mode: autopilot', ' c') }
  const sent = engine(on, plan)
  await arm($, plan)

  await $.turn.complete(ended('t1'))
  await $.turn.start({ turnId: 't2', text: 'what does stage 3 cover?' })
  await clock.advance(1000)

  expect(sent.prompts).toEqual([])
})

test('a pause stops the prompting and notifies the person once', async ($, on) => {
  const clock = mock.clock(on)
  const plan = { text: planWith('Mode: autopilot', ' d') }
  const sent = engine(on, plan)
  await arm($, plan)

  await $.turn.complete(ended('t1'))
  await clock.advance(1000)
  plan.text = planWith('Mode: paused — stage 3 touches auth', ' d')
  await $.turn.complete(ended('t2'))
  await $.turn.complete(ended('t3'))
  await clock.advance(1000)

  expect(sent.prompts).toHaveLength(1)
  expect(sent.notes).toEqual(['Autopilot paused: stage 3 touches auth'])
})

test('autopilot gives up after three turns that leave the plan unchanged', async ($, on) => {
  const clock = mock.clock(on)
  const plan = { text: planWith('Mode: autopilot', ' e') }
  const sent = engine(on, plan)
  await arm($, plan)

  for (const turn of ['t1', 't2', 't3', 't4', 't5']) {
    await $.turn.complete(ended(turn))
    await clock.advance(1000)
  }

  expect(sent.prompts).toHaveLength(3)
  expect(sent.notes).toHaveLength(1)
})

test('without a mode line the plan is left to the person', async ($, on) => {
  const clock = mock.clock(on)
  const sent = engine(on, { text: planWith('Open: none', ' f') })

  await $.turn.complete(ended('t1'))
  await clock.advance(1000)

  expect(sent.prompts).toEqual([])
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

// ---- shell parsing ----

test('follows cd and -C to the directory each git call acts on', () => {
  const calls = parseCommands('cd api && git status; git -C ../web -c user.name="A B" commit -m "x"').map(gitCall)
  expect(calls.map(c => [c?.dir, c?.sub])).toEqual([
    ['api', 'status'],
    ['web', 'commit'],
  ])
})

test('reads what a commit takes beyond the index', () => {
  const scope = (line: string) => commitScope(gitCall(parseCommands(line)[0]!)!)
  expect(scope('git commit -m "wip" src/config.ts')).toMatchObject({ all: false, paths: ['src/config.ts'] })
  expect(scope('git commit -am "Wire add button"')).toMatchObject({ all: true, paths: [] })
  expect(scope('git commit --author "A <a@b.c>" -m x -- a b')).toMatchObject({ all: false, paths: ['a', 'b'] })
  expect(scope('git commit -m "msg" 2>&1')).toMatchObject({ all: false, paths: [] })
})

test('a heredoc commit message is not read as commands', () => {
  const line = "git commit -F - <<'EOF'\ngit push origin main\nnpm publish\nEOF\necho done"
  expect(parseCommands(line).map(c => c.words[0])).toEqual(['git', 'echo'])
  expect(parseCommands(line).map(outwardReason).filter(Boolean)).toEqual([])
})

test('reads what git add stages', () => {
  const add = (line: string) => addScope(gitCall(parseCommands(line)[0]!)!)
  expect(add('git add -A')).toMatchObject({ paths: ['.'], untracked: true })
  expect(add('git add -u')).toMatchObject({ paths: ['.'], untracked: false })
  expect(add('git add -f build/out.js')).toMatchObject({ paths: ['build/out.js'], ignored: true })
  expect(add('git add -p')).toBeUndefined()
})

test('names outward-facing commands, and leaves local ones alone', () => {
  const why = (line: string) => parseCommands(line).map(outwardReason).find(Boolean)
  expect(why('git push -u origin feature')).toBe('git push')
  expect(why('cd app && npm publish --access public')).toBe('npm publish')
  expect(why('gh pr create --fill')).toBe('gh pr create')
  expect(why('gh api -X DELETE repos/o/r')).toBe('gh api DELETE')
  expect(why('vercel --prod')).toBe('vercel deploy')
  expect(why('curl -X POST -d "{}" https://hooks.example.com/x')).toBe('a request that sends data to an outside service')
  expect(why('curl -X POST -d "{}" http://localhost:3000/api')).toBeUndefined()
  expect(why('gh pr view 12')).toBeUndefined()
  expect(why('npm run build && vercel dev')).toBeUndefined()
  expect(why('git commit -m "push the button"')).toBeUndefined()
})

test('sees a stage ticked in the plan part of a diff', () => {
  const diff = [
    diffOf('docs/PLAN.md', '-- [ ] 2. Share mode — viewer controls', '+- [x] 2. Share mode — viewer controls'),
    diffOf('src/a.ts', '+- [x] 3. not the plan'),
  ].join('\n')
  expect(closedStages(diff, 'docs/PLAN.md')).toEqual(['2'])
})

test('matches the plan file whatever its case, as a case-insensitive filesystem does', () => {
  const diff = diffOf('docs/Plan.md', '-- [ ] 2. Share mode', '+- [x] 2. Share mode')
  expect(closedStages(diff, 'docs/PLAN.md')).toEqual(['2'])
  expect(samePath('app/docs/plan.md', 'docs/PLAN.md')).toBe(true)
  expect(samePath('docs/PLAN.md.bak', 'docs/PLAN.md')).toBe(false)
  expect(samePath('mydocs/PLAN.md', 'docs/PLAN.md')).toBe(false)
})

// ---- the guard, scope ----

/** Stands in for git: answers each command from `answers` by its argument list, and records where it ran. */
function fakeGit(on: On, answers: (argv: readonly string[]) => string, standalone = true) {
  const ran: { argv: string; cwd?: string }[] = []
  on('process.run', (_, e) => {
    ran.push({ argv: e.argv.join(' '), cwd: e.init?.cwd })
    return { value: { exitCode: 0, stdout: answers(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  if (standalone) on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', () => ({ result: { text: 'ran' } }))
  return ran
}

test('a commit that names paths is scanned in the working tree', async ($, on) => {
  fakeGit(on, argv => (argv.includes('HEAD') ? diffOf('src/config.ts', `+const key = "${AWS}"`) : ''))
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "wip" src/config.ts' })
  expect(r.deny).toContain('src/config.ts:4: an AWS access key')
})

test('the guard scans the repo the command commits in', async ($, on) => {
  const ran = fakeGit(on, () => '')
  await $.tool.call({ tool: 'Bash', command: 'cd services/api && git commit -m x' })
  await $.tool.call({ tool: 'Bash', command: 'git -C ../other commit -m x' })
  expect(ran.map(r => r.cwd)).toEqual(['/repo/services/api', '/other'])
})

test('"add" in a commit message no longer drags in unstaged files', async ($, on) => {
  const ran = fakeGit(on, () => '')
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "Wire add button"' })
  expect(ran.map(r => r.argv)).toEqual(['git diff --cached -U0 --no-color --no-ext-diff'])
})

test('a git add on the same line is scanned for what it will stage', async ($, on) => {
  on('fs.read', (_, e) => ({ value: e.path.endsWith('/repo/notes.md') ? `token ${GH}` : '' }))
  fakeGit(on, argv => (argv[1] === 'ls-files' ? 'notes.md\n' : ''))
  const r = await $.tool.call({ tool: 'Bash', command: 'git add notes.md && git commit -m notes' })
  expect(r.deny).toContain('notes.md:1: a GitHub token')
})

// ---- autopilot: arming, holds and gates ----

test('a Mode line already in the plan when the session starts does not drive it', async ($, on) => {
  const clock = mock.clock(on)
  const sent = engine(on, { text: planWith('Mode: autopilot', ' s') })

  await $.turn.complete(ended('t1'))
  await clock.advance(1000)
  expect(sent.prompts).toEqual([])

  // the person starting keel:autopilot arms it
  await $.prompt.submit({ text: '/keel:autopilot', origin: { kind: 'composer' } })
  await $.turn.complete(ended('t2'))
  await clock.advance(1000)
  expect(sent.prompts).toHaveLength(1)
})

test('autopilot waits while background builders are running', async ($, on) => {
  const clock = mock.clock(on)
  const plan = { text: planWith('Mode: autopilot', ' bg') }
  const sent = engine(on, plan, 20, [{ status: 'running' }])
  await arm($, plan)

  await $.turn.complete(ended('t1'))
  await clock.advance(1000)
  expect(sent.prompts).toEqual([])
})

test('while autopilot drives, outward-facing commands are held for the person', async ($, on) => {
  const plan = { text: planWith('Mode: autopilot', ' p') }
  engine(on, plan)
  on('tool.call', () => ({ result: { text: 'ran' } }))
  await arm($, plan)

  const push = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(push.deny).toContain('holds outward-facing steps for the user (git push)')
  const local = await $.tool.call({ tool: 'Bash', command: 'curl -s -X POST -d "{}" http://localhost:3000/api' })
  expect(local.deny).toBeUndefined()

  plan.text = planWith('Open: none', ' p')
  await $.turn.complete(ended('t1'))
  const later = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(later.deny).toBeUndefined()
})

test('a risky stage is held until the person speaks to it', async ($, on) => {
  const clock = mock.clock(on)
  const plan = { text: planWith('Mode: autopilot\nRisk: auth, user input', ' r') }
  const sent = engine(on, plan)
  on('tool.call', () => ({ result: { text: 'ok' } }))
  await arm($, plan)

  await $.turn.complete(ended('t1'))
  await clock.advance(1000)
  expect(sent.prompts).toEqual([])
  expect(sent.notes[0]).toContain('touches auth')

  const edit = { tool: 'Edit', old_string: 'a', new_string: 'b' } as const
  expect((await $.tool.call({ ...edit, file_path: '/repo/src/login.ts' })).deny).toContain('holding Stage 2 of 3')
  expect((await $.tool.call({ ...edit, file_path: '/repo/docs/PLAN.md' })).deny).toBeUndefined()

  await $.prompt.submit({ text: 'auth is fine, use the session cookie we already have', origin: { kind: 'composer' } })
  expect((await $.tool.call({ ...edit, file_path: '/repo/src/login.ts' })).deny).toBeUndefined()
})

/** Stage 2 of 3 in `## Now` with `checks` under it. */
const shareMode = (...checks: string[]) =>
  ['## Now', 'Stage 2 of 3 · Share mode', 'Checks:', ...checks, '## Stages', '- [x] 1. Foundation', '- [ ] 2. Share mode', '- [ ] 3. Polish'].join('\n')

/** A verify report whose table has `rows` check rows. */
const reportWith = (rows: number) =>
  ['# Stage 2 · Share mode — evidence', '', '| Check | Result | Evidence |', '|---|---|---|', ...Array.from({ length: rows }, (_, i) => `| check ${i + 1} | pass | out-${i + 1}.txt |`), '', 'Project checks: tests pass'].join('\n')

test('closing a stage whose checks were never ticked is refused', async ($, on) => {
  const plan = { text: shareMode('- [x] link opens read-only', '- [ ] controls work on touch'), files: { 'docs/evidence/stage-2/report.md': reportWith(2) } }
  engine(on, plan)
  let staged = diffOf('docs/PLAN.md', '-- [ ] 2. Share mode', '+- [x] 2. Share mode')
  fakeGit(on, () => staged, false)

  await $.turn.complete(ended('t1'))
  const refused = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2: share mode"' })
  expect(refused.deny).toContain('closes stage 2')
  expect(refused.deny).toContain('controls work on touch')

  plan.text = plan.text.replace('- [ ] controls', '- [x] controls')
  await $.turn.complete(ended('t2'))
  const passed = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2: share mode"' })
  expect(passed.deny).toBeUndefined()
})

test('a new Goal starts the per-stage records afresh', async ($, on) => {
  const planFor = (goal: string, check: string) =>
    ['## Goal', goal, '## Now', 'Stage 1 of 2 · Start', 'Checks:', check, '## Stages', '- [ ] 1. Start', '- [ ] 2. Finish'].join('\n')
  const plan = { text: planFor('Feature one.', '- [ ] old check never ticked'), files: { 'docs/evidence/stage-1/report.md': reportWith(1) } }
  engine(on, plan)
  fakeGit(on, () => diffOf('docs/PLAN.md', '-- [ ] 1. Start', '+- [x] 1. Start'), false)

  await $.turn.complete(ended('t1'))
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m one' })).deny).toContain('old check never ticked')

  // feature two's plan: no checklist written yet for its stage 1, so nothing of feature one's may linger
  plan.text = planFor('Feature two.', 'Open: none')
  await $.turn.complete(ended('t2'))
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m two' })).deny).toBeUndefined()
})

test('the status band is redrawn when a turn ends, so a stage closed mid-turn shows at once', async ($, on) => {
  const plan = { text: planWith('Mode: autopilot') }
  engine(on, plan)
  const bands: (string | undefined)[] = []
  on('ui.status', (_, e) => (bands.push(e.text), { value: undefined }))
  await $.turn.complete(ended('t1'))
  expect(bands.at(-1)).toBe('keel · autopilot (not armed) · 1/3 done · next: 2. Share mode')

  plan.text = planWith('Open: none').replace(/- \[ \]/g, '- [x]')
  await $.turn.complete(ended('t2'))
  expect(bands.at(-1)).toBe('keel · all 3 stages done · next feature: keel:plan')
})

// ---- the evidence gate ----

const closeStage2 = diffOf('docs/PLAN.md', '-- [ ] 2. Share mode', '+- [x] 2. Share mode')
const REPORT = 'docs/evidence/stage-2/report.md'
/** A diff that adds `path` as a new file with `text`. */
const newFile = (path: string, text: string) =>
  [`diff --git a/${path} b/${path}`, 'new file mode 100644', '--- /dev/null', `+++ b/${path}`, '@@ -0,0 +1 @@', ...text.split('\n').map(l => `+${l}`)].join('\n')

test('the report sits beside the plan, under docs/ for a plan at the root', () => {
  expect(evidencePath('docs/PLAN.md', '3')).toBe('docs/evidence/stage-3/report.md')
  expect(evidencePath('docs/BUILD_PLAN.md', '3')).toBe('docs/evidence/stage-3/report.md')
  expect(evidencePath('PLAN.md', '3')).toBe('docs/evidence/stage-3/report.md')
})

test('counts the first table\'s rows past header and separator, an escaped pipe splitting nothing', () => {
  expect(reportRows(reportWith(3))).toBe(3)
  expect(reportRows('| Check | Result |\n| :-- | --: |\n| `a \\| b` works | pass |\n\n| Later | table |\n|---|---|\n| x | y |\n| z | w |')).toBe(1)
  expect(reportRows('# no table\nnot \\| a row')).toBe(0)
})

test('counts rows in a CRLF report and in a table without leading pipes', () => {
  expect(reportRows(reportWith(3).replace(/\n/g, '\r\n'))).toBe(3)
  expect(reportRows('Check | Result\n--- | ---\nlink opens | pass\ntouch works | pass\n\nafter')).toBe(2)
})

test('closing a stage with no evidence report is refused, naming the path and keel:verify', async ($, on) => {
  engine(on, { text: shareMode('- [x] link opens read-only', '- [x] controls work on touch') })
  fakeGit(on, () => closeStage2, false)
  await $.turn.complete(ended('t1'))
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2: share mode"' })
  expect(r.deny).toContain('closes stage 2')
  expect(r.deny).toContain(REPORT)
  expect(r.deny).toContain('keel:verify for stage 2')
  expect(r.deny).toContain('before keel 0.5.0, backfill')
})

test('a report in the working tree with a row per check lets the stage close', async ($, on) => {
  engine(on, { text: shareMode('- [x] link opens read-only', '- [x] controls work on touch'), files: { [REPORT]: reportWith(2) } })
  fakeGit(on, () => closeStage2, false)
  await $.turn.complete(ended('t1'))
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toBeUndefined()
})

test('a report added in the same commit counts', async ($, on) => {
  engine(on, { text: shareMode('- [x] link opens read-only', '- [x] controls work on touch') })
  fakeGit(on, () => [closeStage2, newFile(REPORT, reportWith(2))].join('\n'), false)
  await $.turn.complete(ended('t1'))
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toBeUndefined()
})

test('a report a git add on the same line takes counts', async ($, on) => {
  const plan = { text: shareMode('- [x] link opens read-only', '- [x] controls work on touch'), untracked: { [REPORT]: reportWith(1) } }
  engine(on, plan)
  fakeGit(on, argv => (argv.includes('--cached') ? closeStage2 : argv[1] === 'ls-files' ? `${REPORT}\n` : ''), false)
  await $.turn.complete(ended('t1'))
  const command = `git add ${REPORT} && git commit -m "Stage 2"`
  expect((await $.tool.call({ tool: 'Bash', command })).deny).toContain('has 1 check row in its table')
  plan.untracked = { [REPORT]: reportWith(2) }
  expect((await $.tool.call({ tool: 'Bash', command })).deny).toBeUndefined()
})

test('a report with fewer rows than the stage has checks is refused', async ($, on) => {
  const plan = { text: shareMode('- [x] link opens read-only', '- [x] controls work on touch', '- [x] works offline'), files: { [REPORT]: reportWith(2) } }
  engine(on, plan)
  fakeGit(on, () => closeStage2, false)
  await $.turn.complete(ended('t1'))
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })
  expect(r.deny).toContain(`\`${REPORT}\` has 2 check rows`)
  expect(r.deny).toContain('3 checks')
  expect(r.deny).toContain('keel:verify for stage 2')
})

test('a row with an escaped pipe counts once against the checks', async ($, on) => {
  const report = ['| Check | Result |', '|---|---|', '| `a \\| b` parses | pass |', '| exit code 0 | pass |'].join('\n')
  engine(on, { text: shareMode('- [x] a or b parses', '- [x] exits clean'), files: { [REPORT]: report } })
  fakeGit(on, () => closeStage2, false)
  await $.turn.complete(ended('t1'))
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toBeUndefined()
  expect(reportRows(report)).toBe(2)
})

test('with no checks known for the stage, a report with one row is enough', async ($, on) => {
  const plan = { text: shareMode('Open: none'), files: { [REPORT]: reportWith(0) } }
  engine(on, plan)
  fakeGit(on, () => closeStage2, false)
  await $.turn.complete(ended('t1'))
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toContain('has 0 check rows')
  plan.files = { [REPORT]: reportWith(1) }
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toBeUndefined()
})

test('a secret in the commit is named before missing evidence', async ($, on) => {
  engine(on, { text: shareMode('- [x] link opens read-only') })
  fakeGit(on, () => [closeStage2, diffOf('src/client.ts', `+const token = "${GH}"`)].join('\n'), false)
  await $.turn.complete(ended('t1'))
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })
  expect(r.deny).toContain('looks like a secret')
  expect(r.deny).not.toContain(REPORT)
})

test('a commit that closes no stage needs no report', async ($, on) => {
  engine(on, { text: shareMode('- [x] link opens read-only') })
  fakeGit(on, () => diffOf('docs/PLAN.md', '-- [ ] link opens read-only', '+- [x] link opens read-only'), false)
  await $.turn.complete(ended('t1'))
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m wip' })).deny).toBeUndefined()
})

test('in a repo with no plan, a diff that looks like a stage closing needs no report', async ($, on) => {
  on('fs.exists', () => ({ value: false }))
  on('ui.status', () => ({ value: undefined }))
  fakeGit(on, () => closeStage2)
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m wip' })).deny).toBeUndefined()
})

test('a guard that cannot read the repo still steps aside', async ($, on) => {
  engine(on, { text: shareMode('- [x] link opens read-only') })
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', () => ({ result: { text: 'ran' } }))
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toBeUndefined()
})

test('a report that cannot be read counts as missing, not as a pass', async ($, on) => {
  engine(on, { text: shareMode('- [x] link opens read-only'), broken: [REPORT] })
  fakeGit(on, () => closeStage2, false)
  await $.turn.complete(ended('t1'))
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })
  expect(r.deny).toContain('is neither in the commit nor in the working tree')
  expect(r.deny).toContain(REPORT)
})

test('every commit on a line is scanned for secrets before any stage gate runs', async ($, on) => {
  engine(on, { text: shareMode('- [x] link opens read-only'), broken: [REPORT] })
  const key = diffOf('src/client.ts', `+const token = "${GH}"`)
  // the first commit closes stage 2 from the index; the second, with -a, also takes a key from the working tree
  fakeGit(on, argv => (argv.includes('--cached') ? closeStage2 : argv[1] === 'diff' ? key : ''), false)
  await $.turn.complete(ended('t1'))
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2" && git commit -a -m "client"' })
  expect(r.deny).toContain('looks like a secret')
  expect(r.deny).toContain('src/client.ts')
  expect(r.deny).not.toContain(REPORT)
})

// ---- a fresh session after `## Now` moved on: the committed plan speaks for the closing stage ----

/** The working plan: `## Now` already on stage 3, stage 2 still open in the list (the commit ticks it). */
const onStage3 = ['## Now', 'Stage 3 of 3 · Polish', 'Checks:', '- [ ] it shines', '## Stages', '- [x] 1. Foundation', '- [ ] 2. Share mode', '- [ ] 3. Polish'].join('\n')
const fourChecks = (last = '- [x] four') => shareMode('- [x] one', '- [x] two', '- [x] three', last)

/** Git that answers `git show HEAD:docs/PLAN.md` with `head`, and every diff with stage 2 closing. */
const gitWithHead = (on: On, head: () => string | undefined) => {
  const ran: string[] = []
  on('process.run', (_, e) => {
    ran.push(e.argv.join(' '))
    if (e.argv[1] === 'show') {
      const text = head()
      return { value: { exitCode: text === undefined ? 128 : 0, stdout: text ?? '', stderr: text === undefined ? 'fatal: path not in HEAD' : '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    return { value: { exitCode: 0, stdout: e.argv.includes('--cached') ? closeStage2 : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', () => ({ result: { text: 'ran' } }))
  return ran
}

test('in a fresh session past the stage, the committed plan gives the count of checks the report must cover', async ($, on) => {
  const plan = { text: onStage3, files: { [REPORT]: reportWith(1) } }
  engine(on, plan)
  const ran = gitWithHead(on, () => fourChecks())
  await $.turn.complete(ended('t1'))
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })
  expect(ran).toContain('git show HEAD:docs/PLAN.md')
  expect(r.deny).toContain('has 1 check row')
  expect(r.deny).toContain('4 checks')
  plan.files = { [REPORT]: reportWith(4) }
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toBeUndefined()
})

test('in a fresh session past the stage, an unticked check in the committed plan is refused', async ($, on) => {
  engine(on, { text: onStage3, files: { [REPORT]: reportWith(4) } })
  gitWithHead(on, () => fourChecks('- [ ] works offline'))
  await $.turn.complete(ended('t1'))
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })
  expect(r.deny).toContain('these checks were never seen ticked')
  expect(r.deny).toContain('works offline')
})

test('when HEAD has no plan or its Now is another stage, one row is enough', async ($, on) => {
  const plan = { text: onStage3, files: { [REPORT]: reportWith(1) } }
  engine(on, plan)
  let head: string | undefined
  gitWithHead(on, () => head)
  await $.turn.complete(ended('t1'))
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toBeUndefined()
  head = onStage3.replace('- [ ] it shines', '- [ ] it shines\n- [ ] and sparkles')
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toBeUndefined()
  plan.files = { [REPORT]: reportWith(0) }
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toContain('has 0 check rows')
})
