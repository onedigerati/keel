import type { On } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'
import { findSecrets } from '../hooks/secrets.ts'
import { closedStages, effectiveAgents, evidencePath, firstAgentsOf, parsePlan, parseRoadmap, reportRows, samePath, stampOf } from '../hooks/register.ts'
import { addScope, commitScope, gitCall, outwardReason, parseCommands } from '../hooks/shell.ts'
import { parseProjectRules, projectOutward, projectRisky } from '../hooks/project.ts'

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
  expect(plan).toEqual({ path: 'docs/BUILD_PLAN.md', goal: undefined, now: undefined, mode: undefined, agents: undefined, agentsLine: undefined, agentsStamp: undefined, stage: undefined, done: 2, total: 2, current: undefined })
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
  plan: {
    text: string
    files?: Record<string, string>
    untracked?: Record<string, string>
    broken?: string[]
    /** What a stat of the path answers instead of a regular file of its text's size. */
    stats?: Record<string, { kind: 'file' | 'dir' | 'other'; size: number; realPath?: string } | 'throws'>
    /** Paths whose exists check throws. */
    unsure?: string[]
  },
  percent = 20,
  agents: { status: string; parentId?: string }[] = [],
) {
  const sent = { prompts: [] as string[], compactions: [] as (string | undefined)[], notes: [] as string[] }
  on('agent.list', () => ({ value: agents.map((a, i) => ({ id: `a${i}`, description: 'build', type: 'general-purpose', ...a })) as never }))
  on('session.cwd', () => ({ value: '/repo' }))
  // `untracked` files are read only as a `git add` lists them, never seen by an exists check
  const find = <T,>(files: Record<string, T> | undefined, path: string) => Object.entries(files ?? {}).find(([p]) => path === p || path.endsWith(`/${p}`))?.[1]
  const listed = (paths: string[] | undefined, path: string) => !!paths?.some(p => path === p || path.endsWith(`/${p}`))
  on('fs.exists', (_, e) => {
    if (listed(plan.unsure, e.path)) throw new Error(`EACCES: permission denied, access '${e.path}'`)
    return { value: e.path.endsWith('/docs/PLAN.md') || find(plan.files, e.path) !== undefined || listed(plan.broken, e.path) }
  })
  // a `broken` path exists but its read throws, as a directory's would
  const broken = (path: string) => listed(plan.broken, path)
  // a file stats as a regular file of its text's size, a `broken` one as an empty file; a missing one rejects, as the engine's does
  on('fs.stat', (_, e) => {
    // the working directory is /repo; asked to resolve, a repo file lands under it by its repo path, unless `stats` says otherwise
    const key = [...Object.keys(plan.files ?? {}), ...(plan.broken ?? [])].find(p => e.path === p || e.path.endsWith(`/${p}`))
    const realPath = !e.resolve ? undefined : e.path === '/repo' ? '/repo' : key ? `/repo/${key}` : undefined
    if (e.path === '/repo') return { value: { kind: 'dir' as const, size: 4096, mtimeMs: 0, isLink: false, ...(realPath ? { realPath } : {}) } }
    const text = find(plan.files, e.path)
    const own = find(plan.stats, e.path)
    if (own === 'throws') throw new Error(`EACCES: permission denied, stat '${e.path}'`)
    if (own === undefined && text === undefined && !broken(e.path)) throw new Error(`ENOENT: no such file or directory, stat '${e.path}'`)
    return { value: { kind: 'file' as const, size: new TextEncoder().encode(text ?? '').length, mtimeMs: 0, isLink: false, ...(realPath ? { realPath } : {}), ...own } }
  })
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

test('re-run rows from earlier stages, past the row per check, still let the stage close', async ($, on) => {
  const report = reportWith(2).replace('| check 2 | pass | out-2.txt |', '| check 2 | pass | out-2.txt |\n| Re-run of stage 1: cli prints 13.89 | fail | rerun-1.txt |')
  engine(on, { text: shareMode('- [x] link opens read-only', '- [x] controls work on touch'), files: { [REPORT]: report } })
  fakeGit(on, () => closeStage2, false)
  await $.turn.complete(ended('t1'))
  expect(reportRows(report)).toBe(2)
  expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })).deny).toBeUndefined()
})

test('a re-run row does not stand in for a missing check row', async ($, on) => {
  const report = reportWith(1).replace('| check 1 | pass | out-1.txt |', '| check 1 | pass | out-1.txt |\n| Re-run of stage 1: cli prints 13.89 | pass | rerun-1.txt |')
  engine(on, { text: shareMode('- [x] link opens read-only', '- [x] controls work on touch'), files: { [REPORT]: report } })
  fakeGit(on, () => closeStage2, false)
  await $.turn.complete(ended('t1'))
  expect(reportRows(report)).toBe(1)
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "Stage 2"' })
  expect(r.deny).toContain(`\`${REPORT}\` has 1 check row`)
  expect(r.deny).toContain('2 checks')
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

// ---- the Agents line: how widely work fans out ----

test('reads the Agents level in any case, and ignores an unknown one', () => {
  const level = (line: string) => parsePlan('PLAN.md', planWith(line)).agents
  expect(level('Agents: lean')).toBe('lean')
  expect(level('Agents: Balanced')).toBe('balanced')
  expect(level('AGENTS: WIDE')).toBe('wide')
  expect(level('Agents: wide — confirmed 2026-11-08')).toBe('wide')
  expect(level('Agents: turbo')).toBeUndefined()
  expect(level('Open: none')).toBeUndefined()
  expect(parsePlan('PLAN.md', planWith('Agents: wide — confirmed 2026-11-08')).agentsLine).toBe('Agents: wide — confirmed 2026-11-08')
})

test('reads the confirmation stamp as the date and time digits only', () => {
  const stamp = (line: string) => parsePlan('PLAN.md', planWith(line)).agentsStamp
  expect(stamp('Agents: wide — confirmed 2026-11-08 14:05')).toBe('202611081405')
  expect(stamp('agents:  WIDE  -  Confirmed: 2026/11/08  14.05.')).toBe('202611081405')
  expect(stamp('Agents: wide — confirmed 2026-11-08 1405')).toBe('202611081405')
  expect(stamp('Agents: wide — confirmed 2026-11-8 9:05 by jonah')).toBe('202611080905')
  expect(stamp('Agents: wide — confirmed 2026-11-08')).toBe('20261108')
  expect(stamp('Agents: wide')).toBeUndefined()
  expect(stamp('Agents: wide — confirmed')).toBeUndefined()
  expect(stamp('Agents: wide — confirmed yesterday')).toBeUndefined()
  // read whatever the level, so fixing a "typo" later can't bring in a stamp the session never saw
  expect(stamp('Agents: turbo — confirmed 2026-11-08')).toBe('20261108')
})

test('finds the stage line when the Agents line sits above it', () => {
  const text = ['## Now', 'Agents: lean', 'Mode: autopilot', 'Stage 2 of 3 · Share mode', '- [ ] controls work', '## Stages', '- [ ] 2. Share mode'].join('\n')
  const plan = parsePlan('PLAN.md', text)
  expect(plan.agents).toBe('lean')
  expect(plan.stage?.key).toBe('Stage 2 of 3 · Share mode')
  expect(plan.stage?.number).toBe('2')
  // an Agents line that itself names a stage still never counts as the stage line
  expect(parsePlan('PLAN.md', text.replace('Agents: lean', 'Agents: lean — stage 3 can go wide')).stage?.key).toBe('Stage 2 of 3 · Share mode')
})

test('a wide line counts only once the session saw it set or restamped', () => {
  const read = (line: string) => parsePlan('PLAN.md', planWith(line))
  // the session first read the line at 14:00 and looks again at 14:10
  const at = new Date(2026, 10, 8, 14, 0).getTime()
  const level = (first: string, now: string) => effectiveAgents(read(now), firstAgentsOf(read(first), at), at + 10 * 60_000)
  // set during the session from no line, lean or balanced
  expect(level('Open: none', 'Agents: wide')).toBe('wide')
  expect(level('Agents: lean', 'Agents: wide')).toBe('wide')
  expect(level('Agents: balanced', 'Agents: wide')).toBe('wide')
  // already there: no rewrite short of a new stamp confirms it
  expect(level('Agents: wide', 'Agents: wide')).toBe('balanced')
  expect(level('Agents: wide', 'Agents: wide — confirmed 2026-11-08 14:05')).toBe('wide')
  expect(level('Agents: wide — confirmed 2026-11-08', 'Agents: wide')).toBe('balanced')
  expect(level('Agents: wide — confirmed 2026-11-08', 'Agents: wide — confirmed 2026-11-08 14:05')).toBe('wide')
  // a stamp outside the session, or with no time, or with no clock read, confirms nothing
  expect(level('Agents: wide', 'Agents: wide — confirmed 2026-11-08 13:59')).toBe('balanced')
  expect(level('Agents: wide', 'Agents: wide — confirmed 2026-11-08 14:12')).toBe('balanced')
  expect(level('Agents: wide', 'Agents: wide — confirmed 2026-11-08')).toBe('balanced')
  expect(effectiveAgents(read('Agents: wide — confirmed 2026-11-08 14:05'), firstAgentsOf(read('Agents: wide')), at)).toBe('balanced')
  expect(effectiveAgents(read('Agents: wide — confirmed 2026-11-08 14:05'), firstAgentsOf(read('Agents: wide'), at), undefined)).toBe('balanced')
  // an unknown value at first read may be a disguised wide
  expect(level('Agents: turbo', 'Agents: wide')).toBe('balanced')
  // lean and balanced need no session state
  expect(effectiveAgents(read('Agents: lean'), undefined)).toBe('lean')
  expect(effectiveAgents(read('Agents: balanced'), undefined)).toBe('balanced')
  expect(effectiveAgents(read('Agents: wide — confirmed 2026-11-08 14:05'), undefined)).toBe('balanced')
  expect(effectiveAgents(read('Agents: turbo'), firstAgentsOf(read('Open: none')))).toBeUndefined()
})

/** The plan section keel adds to the system prompt, and the status band it drew, after one composition. */
function composeKeel($: Engine, on: On) {
  const bands: (string | undefined)[] = []
  on('ui.status', (_, e) => (bands.push(e.text), { value: undefined }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))
  const input = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: [], tools: [], outputStyle: null, traits: [] }
  return async () => {
    const { sections } = await $.prompt.compose(input)
    return { text: sections.find(s => s.id === 'keel:plan')?.text ?? '', band: bands.at(-1) }
  }
}

test('the working rules name the level and what it means', async ($, on) => {
  const plan = { text: planWith('Agents: lean') }
  engine(on, plan)
  const compose = composeKeel($, on)
  expect((await compose()).text).toContain('Agents: lean — build and verify in the main session and run at most one agent at a time')
  expect((await compose()).text).toContain('one builder at a time')
  expect((await compose()).text).toContain('one fresh reviewer')

  plan.text = planWith('Agents: balanced')
  expect((await compose()).text).toContain('Agents: balanced — fan independent leaves out to subagents when it helps.')

  // a line set during this session is honoured
  plan.text = planWith('Agents: wide')
  const wide = (await compose()).text
  expect(wide).toContain('Agents: wide — fan out every independent leaf to its own agent in its own worktree')
  expect(wide).toContain('a fresh agent verify')
  expect(wide).toContain('when the security lens applies (risk beyond UI), run the correctness and security reviewers in parallel')
})

test('with no Agents line the working rules say nothing new', async ($, on) => {
  engine(on, { text: planWith('Open: none') })
  const compose = composeKeel($, on)
  const { text } = await compose()
  expect(text).not.toContain('Agents')
  expect(text.endsWith("commit per stage and stop for the user's review. The keel skills (plan, stage, autopilot, verify, review, resume) hold the details.")).toBe(true)
})

test('the status line shows lean or wide, and nothing extra for balanced or no line', async ($, on) => {
  const plan = { text: planWith('Open: none') }
  engine(on, plan)
  const compose = composeKeel($, on)
  expect((await compose()).band).toBe('keel · 1/3 done · next: 2. Share mode')
  plan.text = planWith('Agents: lean')
  expect((await compose()).band).toBe('keel · lean · 1/3 done · next: 2. Share mode')
  plan.text = planWith('Agents: balanced')
  expect((await compose()).band).toBe('keel · 1/3 done · next: 2. Share mode')
  plan.text = planWith('Agents: wide')
  expect((await compose()).band).toBe('keel · wide · 1/3 done · next: 2. Share mode')
  plan.text = planWith('Mode: paused — waiting\nAgents: lean')
  expect((await compose()).band).toBe('keel · paused · lean · 1/3 done · next: 2. Share mode')
})

test('a wide line already in the plan when the session starts counts as balanced until it is restamped', async ($, on) => {
  const clock = mock.clock(on, { now: new Date(2026, 10, 8, 14, 0).getTime() })
  const plan = { text: planWith('Agents: wide') }
  engine(on, plan)
  const compose = composeKeel($, on)
  const first = await compose()
  expect(first.band).toBe('keel · 1/3 done · next: 2. Share mode')
  expect(first.text).toContain("Agents line asks for wide, but it was set before this session, so work at balanced")
  expect(first.text).toContain('ask whether to fan out wide')
  expect(first.text).toContain('restamp the line as `Agents: wide — confirmed')
  expect(first.text).not.toContain('Agents: wide — fan out every')

  // still distrusted on the next look, however many turns pass
  await $.turn.complete(ended('t1'))
  expect((await compose()).band).toBe('keel · 1/3 done · next: 2. Share mode')

  // the user said yes and Claude restamped the line: a new stamp during the session is honoured
  await clock.advance(5 * 60_000)
  plan.text = planWith('Agents: wide — confirmed 2026-11-08 14:05')
  const confirmed = await compose()
  expect(confirmed.band).toBe('keel · wide · 1/3 done · next: 2. Share mode')
  expect(confirmed.text).toContain('Agents: wide — fan out every independent leaf')
  expect(confirmed.text).not.toContain('set before this session')
})

test('lean and balanced lines already in the plan are honoured as found', async ($, on) => {
  const plan = { text: planWith('Agents: lean') }
  engine(on, plan)
  const compose = composeKeel($, on)
  const lean = await compose()
  expect(lean.band).toBe('keel · lean · 1/3 done · next: 2. Share mode')
  expect(lean.text).toContain('Agents: lean — build and verify in the main session')
})

const BAND = 'keel · 1/3 done · next: 2. Share mode'
const WIDE_BAND = 'keel · wide · 1/3 done · next: 2. Share mode'

/** Reads the plan as `first`, then as each of `rewrites` in turn, returning the band and rules after the last. */
async function readAs($: Engine, on: On, first: string, ...rewrites: string[]) {
  const plan = { text: planWith(first) }
  engine(on, plan)
  const compose = composeKeel($, on)
  let last = await compose()
  for (const line of rewrites) {
    plan.text = planWith(line)
    last = await compose()
  }
  return last
}

const stillAsking = (r: { text: string; band: string | undefined }) => {
  expect(r.band).toBe(BAND)
  expect(r.text).toContain('set before this session')
  expect(r.text).not.toContain('Agents: wide — fan out every')
}

test('rewriting a wide line in another case confirms nothing', async ($, on) => {
  stillAsking(await readAs($, on, 'agents: Wide', 'Agents: wide'))
})

test('rewriting a wide line with other spacing confirms nothing', async ($, on) => {
  stillAsking(await readAs($, on, 'Agents: wide', 'Agents:\twide', '   Agents:   wide  '))
})

test('a rewrite that drops the stamp confirms nothing', async ($, on) => {
  stillAsking(await readAs($, on, 'Agents: wide — confirmed 2026-11-07 09:00', 'Agents: wide'))
})

test('a wide-open line rewritten as wide confirms nothing', async ($, on) => {
  stillAsking(await readAs($, on, 'Agents: wide-open', '   Agents: wide'))
})

test('the same stamp in other punctuation confirms nothing', async ($, on) => {
  stillAsking(await readAs($, on, 'Agents: wide — confirmed 2026-11-07 09:00', 'Agents: wide - confirmed 2026/11/07 09.00'))
})

test('a different stamp is honoured', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 10, 8, 14, 5).getTime() })
  const r = await readAs($, on, 'Agents: wide — confirmed 2026-11-07 09:00', 'Agents: wide — confirmed 2026-11-08 14:05')
  expect(r.band).toBe(WIDE_BAND)
  expect(r.text).toContain('Agents: wide — fan out every independent leaf')
})

test('a same-day stamp restamped later in the day is honoured', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 10, 8, 14, 5).getTime() })
  const r = await readAs($, on, 'Agents: wide — confirmed 2026-11-08', 'Agents: wide — confirmed 2026-11-08 14:05')
  expect(r.band).toBe(WIDE_BAND)
})

test('a lean line first read and then set to wide is honoured', async ($, on) => {
  const r = await readAs($, on, 'Agents: lean', 'Agents: wide')
  expect(r.band).toBe(WIDE_BAND)
  expect(r.text).toContain('Agents: wide — fan out every independent leaf')
})

test('an unknown Agents value adds nothing to the working rules or the band', async ($, on) => {
  const r = await readAs($, on, 'Agents: turbo')
  expect(r.band).toBe(BAND)
  expect(r.text.slice(r.text.indexOf('Working rules:'))).not.toContain('Agents')
  expect(r.text.endsWith("commit per stage and stop for the user's review. The keel skills (plan, stage, autopilot, verify, review, resume) hold the details.")).toBe(true)
})

test('the ask to confirm wide carries the current time as the stamp', async ($, on) => {
  mock.clock(on, { now: new Date(2026, 10, 8, 14, 5).getTime() })
  const r = await readAs($, on, 'Agents: wide')
  expect(r.text).toContain('restamp the line as `Agents: wide — confirmed 2026-11-08 14:05`.')
})

test('a misspelt or look-alike wide fixed later, keeping its stamp, confirms nothing', async ($, on) => {
  stillAsking(await readAs($, on, 'Agents: w1de — confirmed 2026-11-08 14:05', 'Agents: wide — confirmed 2026-11-08 14:05'))
})

test('a look-alike wide in Cyrillic fixed later, keeping its stamp, confirms nothing', async ($, on) => {
  stillAsking(await readAs($, on, 'Agents: wid\u0435 — confirmed 2026-11-08 14:05', 'Agents: wide — confirmed 2026-11-08 14:05'))
})

test('the same time written without its colon confirms nothing', async ($, on) => {
  stillAsking(await readAs($, on, 'Agents: wide — confirmed 2026-11-01 09:00', 'Agents: wide — confirmed 2026-11-01 0900'))
})

test('text added or changed after the stamp confirms nothing', async ($, on) => {
  stillAsking(await readAs($, on, 'Agents: wide — confirmed 2026-11-01 09:00', 'Agents: wide — confirmed 2026-11-01 09:00 by jonah', 'Agents: wide — confirmed 2026-11-01 09:00 (ok)'))
})

/** The session first reads `first` at 14:00:30 on 2026-11-08, and reads `rewrite` `minutes` later. */
async function confirmAt($: Engine, on: On, first: string, rewrite: string, minutes = 10) {
  const clock = mock.clock(on, { now: new Date(2026, 10, 8, 14, 0, 30).getTime() })
  const plan = { text: planWith(first) }
  engine(on, plan)
  const compose = composeKeel($, on)
  await compose()
  await clock.advance(minutes * 60_000)
  plan.text = planWith(rewrite)
  return compose()
}

test('a date-only restamp never confirms', async ($, on) => {
  stillAsking(await confirmAt($, on, 'Agents: wide', 'Agents: wide — confirmed 2026-11-08'))
})

test('a planted stamp rewritten without its time confirms nothing', async ($, on) => {
  stillAsking(await confirmAt($, on, 'Agents: wide — confirmed 2026-11-01 10:00', 'Agents: wide — confirmed 2026-11-01'))
})

test('a planted past stamp kept as it is confirms nothing', async ($, on) => {
  stillAsking(await confirmAt($, on, 'Agents: wide — confirmed 2026-11-01 10:00', 'Agents: wide — confirmed 2026-11-01 10:00'))
})

test('a planted past stamp reformatted confirms nothing', async ($, on) => {
  stillAsking(await confirmAt($, on, 'Agents: wide — confirmed 2026-11-01 10:00', 'Agents: wide - confirmed 2026/11/1 10.00'))
})

test('a past stamp the session never saw confirms nothing', async ($, on) => {
  stillAsking(await confirmAt($, on, 'Agents: wide — confirmed 2026-11-01 10:00', 'Agents: wide — confirmed 2026-11-01 10:01'))
})

test('a stamp from before the session first read the line confirms nothing', async ($, on) => {
  stillAsking(await confirmAt($, on, 'Agents: wide', 'Agents: wide — confirmed 2026-11-08 13:59'))
})

test('a future stamp never confirms', async ($, on) => {
  stillAsking(await confirmAt($, on, 'Agents: wide', 'Agents: wide — confirmed 2099-01-01 00:00'))
})

test('a stamp more than a minute ahead of the clock confirms nothing', async ($, on) => {
  stillAsking(await confirmAt($, on, 'Agents: wide', 'Agents: wide — confirmed 2026-11-08 14:12'))
})

test('a stamp inside the session confirms', async ($, on) => {
  const r = await confirmAt($, on, 'Agents: wide — confirmed 2026-11-01 10:00', 'Agents: wide — confirmed 2026-11-08 14:07')
  expect(r.band).toBe(WIDE_BAND)
  expect(r.text).toContain('Agents: wide — fan out every independent leaf')
})

test('a stamp in the minute of the first read confirms', async ($, on) => {
  expect((await confirmAt($, on, 'Agents: wide', 'Agents: wide — confirmed 2026-11-08 14:00')).band).toBe(WIDE_BAND)
})

test('a stamp up to a minute ahead of the clock confirms', async ($, on) => {
  expect((await confirmAt($, on, 'Agents: wide', 'Agents: wide — confirmed 2026-11-08 14:11')).band).toBe(WIDE_BAND)
})

test('when the clock cannot be read, no stamp confirms', async ($, on) => {
  on('clock.now', () => {
    throw new Error('no clock')
  })
  // stamped with the real time, so falling back to the system clock would confirm it
  stillAsking(await readAs($, on, 'Agents: wide', `Agents: wide — confirmed ${stampOf(Date.now())}`))
})

/** The deny an Agent call gets, with the plan's `## Now` carrying `line` and the main loop's agents in `agents`. */
async function agentCall($: Engine, on: On, line: string, agents: { status: string; parentId?: string }[], agentId?: string) {
  engine(on, { text: planWith(line) }, 20, agents)
  on('tool.call', () => ({ result: { text: 'started' } }))
  return (await $.tool.call({ tool: 'Agent', description: 'build', prompt: 'build stage 2', ...(agentId ? { agentId } : {}) } as never)).deny
}

test('under lean, an Agent call is refused while an agent the main loop started is running', async ($, on) => {
  const deny = await agentCall($, on, 'Agents: lean', [{ status: 'running' }])
  expect(deny).toContain('lean, which allows one agent at a time')
  expect(deny).toContain("Wait for it to finish (a background agent's report starts the next turn)")
  expect(deny).toContain('ask the user to change the Agents line')
})

test('under lean, a pending agent holds the next one back', async ($, on) => {
  expect(await agentCall($, on, 'Agents: lean', [{ status: 'pending' }])).toContain('one agent at a time')
})

test('under lean, a waiting agent holds the next one back', async ($, on) => {
  expect(await agentCall($, on, 'Agents: lean', [{ status: 'completed' }, { status: 'waiting' }])).toContain('one agent at a time')
})

test('under lean, an Agent call goes through when no agent is running', async ($, on) => {
  expect(await agentCall($, on, 'Agents: lean', [])).toBeUndefined()
})

test('under lean, finished agents do not count', async ($, on) => {
  expect(await agentCall($, on, 'Agents: lean', [{ status: 'completed' }, { status: 'failed' }, { status: 'killed' }])).toBeUndefined()
})

test('under lean, agents a subagent started do not count', async ($, on) => {
  expect(await agentCall($, on, 'Agents: lean', [{ status: 'completed' }, { status: 'running', parentId: 'a0' }])).toBeUndefined()
})

const RUNNING = [{ status: 'running' }, { status: 'pending' }]

test('balanced never caps the agents', async ($, on) => {
  expect(await agentCall($, on, 'Agents: balanced', RUNNING)).toBeUndefined()
})

test('a confirmed wide never caps the agents', async ($, on) => {
  expect(await agentCall($, on, 'Agents: wide — confirmed 2026-11-08 14:05', RUNNING)).toBeUndefined()
})

test('with no Agents line the agents are never capped', async ($, on) => {
  expect(await agentCall($, on, 'Open: none', RUNNING)).toBeUndefined()
})

test("under lean, a subagent's own Agent call is refused: it is the one agent", async ($, on) => {
  const deny = await agentCall($, on, 'Agents: lean', [{ status: 'running' }], 'a0')
  expect(deny).toContain('lean, which allows one agent at a time, and you are that agent')
  expect(deny).toContain('do this work yourself rather than starting another')
})

test("under balanced, a subagent's own Agent call is left alone", async ($, on) => {
  expect(await agentCall($, on, 'Agents: balanced', [{ status: 'running' }], 'a0')).toBeUndefined()
})

test("under a confirmed wide, a subagent's own Agent call is left alone", async ($, on) => {
  expect(await agentCall($, on, 'Agents: wide — confirmed 2026-11-08 14:05', [{ status: 'running' }], 'a0')).toBeUndefined()
})

test("with no Agents line, a subagent's own Agent call is left alone", async ($, on) => {
  expect(await agentCall($, on, 'Open: none', [{ status: 'running' }], 'a0')).toBeUndefined()
})

test("under an unconfirmed wide, a subagent's own Agent call is left alone", async ($, on) => {
  const plan = { text: planWith('Agents: wide') }
  engine(on, plan, 20, [{ status: 'running' }])
  on('tool.call', () => ({ result: { text: 'started' } }))
  const compose = composeKeel($, on)
  expect((await compose()).text).toContain('set before this session')
  expect((await $.tool.call({ tool: 'Agent', description: 'build', prompt: 'build stage 2', agentId: 'a0' } as never)).deny).toBeUndefined()
})

test('an unconfirmed wide line is not capped either', async ($, on) => {
  const plan = { text: planWith('Agents: wide') }
  engine(on, plan, 20, [{ status: 'running' }])
  on('tool.call', () => ({ result: { text: 'started' } }))
  const compose = composeKeel($, on)
  expect((await compose()).text).toContain('set before this session')
  expect((await $.tool.call({ tool: 'Agent', description: 'build', prompt: 'build stage 2' } as never)).deny).toBeUndefined()
})

const AGENT_CALL = { tool: 'Agent', description: 'build', prompt: 'build stage 2' } as never

/** The plan carries `line`; the Agent tool beneath the hook starts an agent the main loop's list then shows as running. */
function spawning(on: On, line: string) {
  const agents: { status: string; parentId?: string }[] = []
  engine(on, { text: planWith(line) }, 20, agents)
  on('tool.call', async () => {
    agents.push({ status: 'running' })
    return { result: { text: 'started' } }
  })
  return agents
}

test('under lean, parallel Agent calls in one message let only one through', async ($, on) => {
  const agents = spawning(on, 'Agents: lean')
  const denies = (await Promise.all([$.tool.call(AGENT_CALL), $.tool.call(AGENT_CALL)])).map(r => r.deny)
  expect(denies.filter(d => d === undefined)).toHaveLength(1)
  expect(denies.find(d => d !== undefined)).toContain('lean, which allows one agent at a time, and one is still running')
  expect(agents).toHaveLength(1)
})

test('under balanced, parallel Agent calls all go through', async ($, on) => {
  const agents = spawning(on, 'Agents: balanced')
  const denies = (await Promise.all([$.tool.call(AGENT_CALL), $.tool.call(AGENT_CALL)])).map(r => r.deny)
  expect(denies).toEqual([undefined, undefined])
  expect(agents).toHaveLength(2)
})

test('under lean, the next Agent call goes through once the first has settled and its agent finished', async ($, on) => {
  const agents = spawning(on, 'Agents: lean')
  expect((await $.tool.call(AGENT_CALL)).deny).toBeUndefined()
  expect((await $.tool.call(AGENT_CALL)).deny).toContain('one is still running')
  agents[0]!.status = 'completed'
  expect((await $.tool.call(AGENT_CALL)).deny).toBeUndefined()
  expect(agents).toHaveLength(2)
})

test('under lean, an Agent call that throws does not hold the next one back', async ($, on) => {
  engine(on, { text: planWith('Agents: lean') })
  let calls = 0
  on('tool.call', () => {
    if (calls++ === 0) throw new Error('spawn failed')
    return { result: { text: 'started' } }
  })
  await $.tool.call(AGENT_CALL).catch(() => undefined)
  expect((await $.tool.call(AGENT_CALL)).deny).toBeUndefined()
})

/** A promise and the function that resolves it. */
function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => (resolve = r))
  return { promise, resolve }
}

test('under lean, an Agent call holds its slot while the tool beneath is still starting the agent', async ($, on) => {
  const agents: { status: string }[] = []
  engine(on, { text: planWith('Agents: lean') }, 20, agents)
  const entered = deferred()
  const started = deferred()
  let calls = 0
  on('tool.call', async () => {
    // only the first call waits, so a second call let through returns at once and the test fails rather than hangs
    if (calls++ === 0) {
      entered.resolve()
      await started.promise
    }
    agents.push({ status: 'running' })
    return { result: { text: 'started' } }
  })
  const a = $.tool.call(AGENT_CALL)
  await entered.promise
  // A is inside next(e) and its agent isn't listed yet: only the held slot says it is starting
  const b = await $.tool.call(AGENT_CALL)
  started.resolve()
  expect(b.deny).toContain('one is still running')
  expect((await a).deny).toBeUndefined()
  expect(calls).toBe(1)
})

test('under lean, a foreground agent holds its slot for as long as it runs', async ($, on) => {
  engine(on, { text: planWith('Agents: lean') })
  const entered = deferred()
  // a foreground run whose agent never shows in the background list, and doesn't finish within the test
  let calls = 0
  on('tool.call', () => (calls++ === 0 ? (entered.resolve(), new Promise<never>(() => {})) : { result: { text: 'started' } }))
  void $.tool.call(AGENT_CALL).catch(() => undefined)
  await entered.promise
  expect((await $.tool.call(AGENT_CALL)).deny).toContain('one is still running')
})

test('an Agent call goes through when the lean check itself fails', async ($, on) => {
  // the plan reads as lean once (the hold gate's look), then comes back as something that isn't text, so parsing
  // it throws inside the lean check and that hook's catch decides; an agent is running, so a catch that refused
  // would refuse this call
  let reads = 0
  const plan = {
    get text() {
      return (reads++ === 0 ? planWith('Agents: lean') : 42) as string
    },
  }
  engine(on, plan, 20, [{ status: 'running' }])
  on('tool.call', () => ({ result: { text: 'started' } }))
  const r = await $.tool.call(AGENT_CALL)
  expect(r.deny).toBeUndefined()
  expect(r.result).toEqual({ text: 'started' })
})

test('under lean, an agent list that cannot be read lets the Agent call through', async ($, on) => {
  const unreadable = {
    map: () => {
      throw new Error('agent list unavailable')
    },
  }
  engine(on, { text: planWith('Agents: lean') }, 20, unreadable as never)
  on('tool.call', () => ({ result: { text: 'started' } }))
  expect((await $.tool.call(AGENT_CALL)).deny).toBeUndefined()
})

// ---- the roadmap ----

/** The plan section and band for `planWith('Open: none')` exactly as keel 0.7.0 composed them. */
const PLAN_SECTION_070 = [
  '# Keel',
  'This project keeps its plan in `docs/PLAN.md`: the source of truth for goal, decisions and stages. Reread it before acting on anything it covers, and update it in the same change when a decision or stage changes. Subagents: treat this as background and stay inside your brief.',
  '',
  'Current position (from the plan):',
  'Stage 2 of 3 · Share mode',
  'Open: none',
  '',
  "Working rules: build in stages; a stage is done only when its acceptance checks pass against the running product and the test suite is green; tick each check in `## Now` as it is proven, before closing the stage; verifying a stage, even one asked about only for a report, means running keel:verify, which saves its evidence to `docs/evidence/stage-<n>/`; tests accompany risky logic (money, dates, parsing, permissions); stages marked risky get a security review; commit per stage and stop for the user's review. The keel skills (plan, stage, autopilot, verify, review, resume) hold the details.",
].join('\n')
const BAND_070 = 'keel · 1/3 done · next: 2. Share mode'

test('with no roadmap, the plan section and status line are byte-identical to 0.7.0', async ($, on) => {
  const plan = { text: planWith('Open: none') }
  engine(on, plan)
  const compose = composeKeel($, on)
  expect(await compose()).toEqual({ text: PLAN_SECTION_070, band: BAND_070 })
  plan.text = planWith('Open: none').replace(/- \[ \]/g, '- [x]')
  expect((await compose()).band).toBe('keel · all 3 stages done · next feature: keel:plan')
})

/** A roadmap in the fixed layout: milestones as given, and a requirements table with `rows` (cells after the ID). */
function roadmapWith(milestones: string[], rows: string[][]) {
  return [
    '# Shop roadmap',
    'Source: docs/PRD.md, charted 2026-11-08',
    '## Milestones',
    ...milestones,
    '## Requirements',
    '| ID | Requirement | PRD § | Milestone | Covered by |',
    '|----|-------------|-------|-----------|------------|',
    ...rows.map((r, i) => `| R-${i + 1} | ${r.join(' | ')} |`),
    '## Out of scope',
    '- payments',
    '## Open questions',
    '- none',
  ].join('\n')
}

const MILESTONES = ['- [x] M0. Foundation — repo and CI', '- [ ] M1. Ingest — import orders (needs: M0)', '- [ ] M2. Reports — totals (needs: M1)']
const LEDGER = [
  ['import CSV', '2.1', 'M1', '2026-11-01-ingest'],
  ['import JSON', '2.2', 'M1', ''],
  ['dedupe', '2.3', 'dropped 2026-11-05', '2026-10-01-old'],
  ['totals', '3.1', 'M2', ''],
]

test('reads the current milestone and the coverage of the requirements that are not dropped', () => {
  expect(parseRoadmap(roadmapWith(MILESTONES, LEDGER))).toEqual({ id: 'M1', name: 'Ingest', covered: 1, total: 3 })
})

test('with a roadmap, the plan section gains one roadmap line and the status line a milestone segment', async ($, on) => {
  const plan = { text: planWith('Open: none'), files: { 'docs/ROADMAP.md': roadmapWith(MILESTONES, LEDGER) } }
  engine(on, plan)
  const compose = composeKeel($, on)
  const { text, band } = await compose()
  const line = 'Roadmap: M1 Ingest · 1/3 requirements covered (docs/ROADMAP.md)'
  expect(text).toBe(PLAN_SECTION_070.replace('Open: none\n', `Open: none\n${line}\n`))
  expect(text.split('\n').length).toBe(PLAN_SECTION_070.split('\n').length + 1)
  expect(band).toBe('keel · M1 1/3 · 1/3 done · next: 2. Share mode')

  plan.text = planWith('Mode: paused — waiting\nAgents: lean')
  expect((await compose()).band).toBe('keel · paused · lean · M1 1/3 · 1/3 done · next: 2. Share mode')
  plan.text = planWith('Open: none').replace(/- \[ \]/g, '- [x]')
  expect((await compose()).band).toBe('keel · M1 1/3 · all 3 stages done · next feature: keel:plan')
})

test('the status band redrawn at the end of a turn keeps the milestone segment', async ($, on) => {
  engine(on, { text: planWith('Open: none'), files: { 'docs/ROADMAP.md': roadmapWith(MILESTONES, LEDGER) } })
  const bands: (string | undefined)[] = []
  on('ui.status', (_, e) => (bands.push(e.text), { value: undefined }))
  await $.turn.complete(ended('t1'))
  expect(bands.at(-1)).toBe('keel · M1 1/3 · 1/3 done · next: 2. Share mode')
})

test('the current milestone is the first unticked one, wherever it sits', () => {
  const ms = ['- [ ] M3. Polish — copy', '- [x] M1. Ingest — orders']
  expect(parseRoadmap(roadmapWith(ms, LEDGER))?.id).toBe('M3')
  const later = ['- [x] M1. Ingest — orders', '- [x] M2. Reports — totals', '- [ ] M3. **Polish** — copy (needs: M2)']
  expect(parseRoadmap(roadmapWith(later, LEDGER))).toMatchObject({ id: 'M3', name: 'Polish' })
  expect(parseRoadmap(roadmapWith(['- [ ] M4. Launch (needs: M3)'], LEDGER))?.name).toBe('Launch')
})

test('dropped rows leave the total, a dash is an empty Covered by, and header and separator rows are not requirements', () => {
  const rows = [
    ['a', '1', 'M1', 'plan-a'],
    ['b', '2', 'Dropped 2026-11-02', ''],
    ['c', '3', 'M1', '—'],
    ['d', '4', 'M2', ' - '],
    ['e', '5', 'M2', 'plan-b'],
  ]
  expect(parseRoadmap(roadmapWith(MILESTONES, rows))).toMatchObject({ covered: 2, total: 4 })
  // a CRLF file with a second separator row reads the same
  const crlf = roadmapWith(MILESTONES, rows).replace('| R-3 |', '|---|---|---|---|---|\n| R-3 |').replace(/\n/g, '\r\n')
  expect(parseRoadmap(crlf)).toMatchObject({ id: 'M1', name: 'Ingest', covered: 2, total: 4 })
})

test('a malformed roadmap adds nothing', () => {
  // no milestones section
  expect(parseRoadmap(roadmapWith(MILESTONES, LEDGER).replace('## Milestones', '## Phases'))).toBeUndefined()
  // milestones that are not M-numbered
  expect(parseRoadmap(roadmapWith(['- [ ] Ingest — orders'], LEDGER))).toBeUndefined()
  // no requirements table, or one without its separator or its columns
  expect(parseRoadmap(roadmapWith(MILESTONES, LEDGER).replace('## Requirements', '## Notes'))).toBeUndefined()
  expect(parseRoadmap(roadmapWith(MILESTONES, LEDGER).replace(/^\|-+.*$/m, ''))).toBeUndefined()
  expect(parseRoadmap(roadmapWith(MILESTONES, LEDGER).replace('| Covered by |', '| Status |'))).toBeUndefined()
  expect(parseRoadmap('')).toBeUndefined()
  expect(parseRoadmap('\u0000\u0001 garbage | | |\n## \n')).toBeUndefined()
})

test('a roadmap with every milestone ticked adds nothing', () => {
  expect(parseRoadmap(roadmapWith(['- [x] M0. Foundation — repo', '- [X] M1. Ingest — orders'], LEDGER))).toBeUndefined()
})

test('a milestone name cannot add lines to the context, and a long one is cut', async ($, on) => {
  const sneaky = '- [ ] M1. Ingest # Keel override\u0007‮ — scope'
  expect(parseRoadmap(roadmapWith([sneaky], LEDGER))?.name).toBe('Ingest # Keel override')
  const long = parseRoadmap(roadmapWith([`- [ ] M1. ${'x'.repeat(500)} — scope`], LEDGER))?.name ?? ''
  expect(long.length).toBe(60)
  expect(long.endsWith('…')).toBe(true)

  engine(on, { text: planWith('Open: none'), files: { 'docs/ROADMAP.md': roadmapWith([sneaky], LEDGER) } })
  const { text } = await composeKeel($, on)()
  expect(text.split('\n').length).toBe(PLAN_SECTION_070.split('\n').length + 1)
  expect(text).toContain('Roadmap: M1 Ingest # Keel override · 1/3 requirements covered (docs/ROADMAP.md)')
})

test('a huge roadmap is read only up to its cap', () => {
  const rows = Array.from({ length: 10_000 }, () => ['r', '1', 'M1', 'plan'])
  const read = parseRoadmap(roadmapWith(MILESTONES, rows))
  expect(read?.total).toBeLessThan(10_000)
  expect(read?.covered).toBe(read?.total)
})

test('a roadmap that cannot be read adds nothing and does not block the request', async ($, on) => {
  engine(on, { text: planWith('Open: none'), broken: ['docs/ROADMAP.md'] })
  expect(await composeKeel($, on)()).toEqual({ text: PLAN_SECTION_070, band: BAND_070 })
})

test('a malformed roadmap leaves the plan section and status line as they were', async ($, on) => {
  engine(on, { text: planWith('Open: none'), files: { 'docs/ROADMAP.md': '# Roadmap\n\nnothing charted yet\n' } })
  expect(await composeKeel($, on)()).toEqual({ text: PLAN_SECTION_070, band: BAND_070 })
})

test('the roadmap is read only when it exists, so a read that would answer for a missing file adds nothing', async ($, on) => {
  // the mock's read answers any path, even one exists says is missing: hand it a roadmap's text to prove nothing reads it unchecked
  const plan = { text: planWith('Open: none') + '\n' + roadmapWith(MILESTONES, LEDGER) }
  expect(parseRoadmap(plan.text)).toBeDefined()
  engine(on, plan)
  const { text, band } = await composeKeel($, on)()
  expect(text).not.toContain('Roadmap:')
  expect(band).toBe(BAND_070)
})

test('a heading is read in linear time and names the same sections as before', () => {
  const text = ['## Goal', 'ship it', planWith('Open: none')].join('\n')
  const base = parsePlan('docs/PLAN.md', text)
  expect(base).toMatchObject({ goal: 'ship it', total: 3, done: 1, current: '2. Share mode' })
  // blanks after a heading, or more of them before its text, change nothing
  expect(parsePlan('docs/PLAN.md', text.replace(/^(##.*)$/gm, '$1 \t '))).toEqual(base)
  expect(parsePlan('docs/PLAN.md', text.replace(/^## /gm, '##   '))).toEqual(base)
  // a CRLF plan still finds its sections
  expect(parsePlan('docs/PLAN.md', text.replace(/\n/g, '\r\n'))).toMatchObject({ goal: 'ship it', total: 3, done: 1, current: '2. Share mode' })
  // a line separator inside a heading's text makes it no heading, as it did
  expect(parsePlan('docs/PLAN.md', '## Now x\nStage 1\n## Stages\n- [ ] 1. A').now).toBeUndefined()
})

const timed = (run: () => unknown) => {
  const start = performance.now()
  run()
  return performance.now() - start
}

test('a heading padded with blanks, or a run of `(needs:`, parses in well under 100 ms', () => {
  const padded = '## a' + ' '.repeat(250_000) + 'b'
  // many padded headings, each within the per-line cap, filling the character cap
  const headings = Array.from({ length: 125 }, () => '## a' + ' '.repeat(1_990) + 'b').join('\n')
  const needs = '- [ ] M1. Ingest ' + '(needs:'.repeat(Math.ceil(250_000 / 7))
  expect(needs.length).toBeGreaterThan(250_000)
  const times = {
    plan: timed(() => expect(parsePlan('docs/PLAN.md', `${padded}\n${planWith('Open: none')}`).total).toBe(3)),
    heading: timed(() => expect(parseRoadmap(`${padded}\n${roadmapWith(MILESTONES, LEDGER)}`)?.id).toBe('M1')),
    headings: timed(() => expect(parseRoadmap(`${roadmapWith(MILESTONES, LEDGER)}\n${headings}`)?.id).toBe('M1')),
    needs: timed(() => expect(parseRoadmap(roadmapWith([needs], LEDGER))?.id).toBe('M1')),
  }
  console.log(`roadmap timings (ms): ${JSON.stringify(times)}`)
  for (const ms of Object.values(times)) expect(ms).toBeLessThan(100)
})

test('only a trailing `(needs: …)` leaves the name', () => {
  const name = (line: string) => parseRoadmap(roadmapWith([line], LEDGER))?.name
  expect(name('- [ ] M1. Ingest (NEEDS: M0)  — scope')).toBe('Ingest')
  expect(name('- [ ] M1. Ingest (needs: (needs: M0)')).toBe('Ingest')
  expect(name('- [ ] M1. Ingest (needs: M0) later')).toBe('Ingest (needs: M0) later')
  expect(name('- [ ] M1. Ingest (needs: M0')).toBe('Ingest (needs: M0')
  expect(name('- [ ] M1. Ingest (fast) (needs: M0)')).toBe('Ingest (fast)')
})

test('a milestone name cut through a surrogate pair by the character cap is still well-formed', () => {
  const head = roadmapWith(['- [x] M0. Foundation — repo'], LEDGER) + '\n## Milestones\n'
  const line = '- [ ] M1. Ingest '
  // filler lines that are no milestones, so the emoji after the line straddles the cap
  const fill = 255_999 - head.length - line.length
  const filler = ('n'.repeat(999) + '\n').repeat(Math.floor(fill / 1000)) + (fill % 1000 ? 'n'.repeat((fill % 1000) - 1) + '\n' : '')
  const text = head + filler + line + '\u{1F600} — scope'
  expect(/\p{Cs}$/u.test(text.slice(0, 256_000))).toBe(true)
  const name = parseRoadmap(text)?.name ?? ''
  expect(name).toBe('Ingest')
  expect(/\p{Cs}/u.test(name)).toBe(false)
})

test('invisible characters do not survive in a milestone name', () => {
  // Hangul filler, blank braille cell, grapheme joiner, a variation selector, private use, unassigned
  for (const hidden of ['ㅤ', '⠀', '͏', '️', '︀', '', '͸']) {
    expect(parseRoadmap(roadmapWith([`- [ ] M1. Ingest${hidden}x — scope`], LEDGER))?.name).toBe('Ingest x')
  }
})

test('a roadmap that is no regular file, or is over 1 MiB, adds nothing', async ($, on) => {
  const plan: Parameters<typeof engine>[1] = { text: planWith('Open: none'), files: { 'docs/ROADMAP.md': roadmapWith(MILESTONES, LEDGER) } }
  engine(on, plan)
  const compose = composeKeel($, on)
  expect((await compose()).band).toBe('keel · M1 1/3 · 1/3 done · next: 2. Share mode')
  plan.stats = { 'docs/ROADMAP.md': { kind: 'file', size: 1024 * 1024 } }
  expect((await compose()).band).toBe('keel · M1 1/3 · 1/3 done · next: 2. Share mode')
  // a FIFO or device, a directory, and a file just over the cap
  for (const stat of [{ kind: 'other' as const, size: 0 }, { kind: 'dir' as const, size: 4096 }, { kind: 'file' as const, size: 1024 * 1024 + 1 }]) {
    plan.stats = { 'docs/ROADMAP.md': stat }
    expect(await compose()).toEqual({ text: PLAN_SECTION_070, band: BAND_070 })
  }
})

test('an exists or stat check that throws adds nothing and does not block the request', async ($, on) => {
  const plan: Parameters<typeof engine>[1] = { text: planWith('Open: none'), files: { 'docs/ROADMAP.md': roadmapWith(MILESTONES, LEDGER) }, unsure: ['docs/ROADMAP.md'] }
  engine(on, plan)
  const compose = composeKeel($, on)
  expect(await compose()).toEqual({ text: PLAN_SECTION_070, band: BAND_070 })
  plan.unsure = []
  plan.stats = { 'docs/ROADMAP.md': 'throws' }
  expect(await compose()).toEqual({ text: PLAN_SECTION_070, band: BAND_070 })
})

test('with no stages and no roadmap, the plan section and status line are byte-identical to 0.7.0', async ($, on) => {
  const plan: Parameters<typeof engine>[1] = { text: '## Goal\nShip the shop\n## Now\nScoping the first release' }
  engine(on, plan)
  const compose = composeKeel($, on)
  // as keel 0.7.0 (HEAD 0bf29d0) composed them, run against this plan
  const text = PLAN_SECTION_070.replace('Stage 2 of 3 · Share mode\nOpen: none', 'Scoping the first release')
  expect(await compose()).toEqual({ text, band: 'keel · docs/PLAN.md' })
  plan.files = { 'docs/ROADMAP.md': roadmapWith(MILESTONES, LEDGER) }
  expect((await compose()).band).toBe('keel · M1 1/3 · docs/PLAN.md')
})

test('the current milestone is the first unticked line with a milestone ID', () => {
  const nested = ['- [x] M0. F — s', '  - [ ] leftover task', '- [ ] M1. Ingest — s']
  expect(parseRoadmap(roadmapWith(nested, LEDGER))).toMatchObject({ id: 'M1', name: 'Ingest' })
  expect(parseRoadmap(roadmapWith(['- [ ] decide M5 scope', ...MILESTONES], LEDGER))).toMatchObject({ id: 'M1', name: 'Ingest' })
  // with only stray unticked lines left, every milestone is ticked
  expect(parseRoadmap(roadmapWith(['- [x] M0. F — s', '- [ ] decide M5 scope'], LEDGER))).toBeUndefined()
})

test('a requirement row whose cell count differs from the header is skipped, and an escaped pipe stays in its cell', () => {
  // an unescaped pipe in code would shift `M1` into Covered by
  expect(parseRoadmap(roadmapWith(MILESTONES, [['`a|b`', '1', 'M1', ''], ...LEDGER]))).toMatchObject({ covered: 1, total: 3 })
  expect(parseRoadmap(roadmapWith(MILESTONES, [['`a\\|b`', '1', 'M1', ''], ...LEDGER]))).toMatchObject({ covered: 1, total: 4 })
  expect(parseRoadmap(roadmapWith(MILESTONES, [['a \\| b', '1', 'M1', 'plan-x'], ...LEDGER]))).toMatchObject({ covered: 2, total: 4 })
})

test('fenced code blocks hold no sections, milestones or rows', () => {
  const fake = ['```md', '## Milestones', '- [ ] M9. Fake — s', '## Requirements', '| ID | Requirement | PRD § | Milestone | Covered by |', '|---|---|---|---|---|', '| X-1 | x | 1 | M9 | p |', '```'].join('\n')
  expect(parseRoadmap(`${fake}\n${roadmapWith(MILESTONES, LEDGER)}`)).toEqual({ id: 'M1', name: 'Ingest', covered: 1, total: 3 })
  // a tilde fence inside the checklist, and a longer fence a shorter one does not close
  const tilde = ['~~~', '- [ ] M7. Example — s', '~~~', '````', '```', '- [ ] M8. Example — s', '````', ...MILESTONES]
  expect(parseRoadmap(roadmapWith(tilde, LEDGER))).toEqual({ id: 'M1', name: 'Ingest', covered: 1, total: 3 })
  // rows inside a fence under the table are not requirements
  const rows = roadmapWith(MILESTONES, LEDGER).replace('## Out of scope', '```\n| R-9 | x | 1 | M1 | p |\n```\n## Out of scope')
  expect(parseRoadmap(rows)).toMatchObject({ covered: 1, total: 3 })
})

test('a section heading with a suffix is found by its leading word', () => {
  const text = roadmapWith(MILESTONES, LEDGER).replace('## Milestones', '## Milestones (3)').replace('## Requirements', '## Requirements (4)')
  expect(parseRoadmap(text)).toEqual({ id: 'M1', name: 'Ingest', covered: 1, total: 3 })
})

test('a line past 2,000 characters is cut before it is read', () => {
  // the cut takes this row's later cells, so it no longer has the header's cell count
  expect(parseRoadmap(roadmapWith(MILESTONES, [['x'.repeat(2_000), '1', 'M1', 'plan-x'], ...LEDGER]))).toMatchObject({ covered: 1, total: 3 })
  expect(parseRoadmap(roadmapWith(MILESTONES, [['x'.repeat(1_900), '1', 'M1', 'plan-x'], ...LEDGER]))).toMatchObject({ covered: 2, total: 4 })
})

test('a dropped cell in emphasis is still dropped', () => {
  const rows = [...LEDGER, ['old', '9', '**dropped** 2026-11-05', ''], ['older', '9', '_Dropped_ 2026-11-06', 'p']]
  expect(parseRoadmap(roadmapWith(MILESTONES, rows))).toMatchObject({ covered: 1, total: 3 })
})

// ---- project risk rules ----

/**
 * Runs a held stage the way the risky-stage test does, its risk line `risk`, with `files` beside the plan, and checks
 * every place the hold shows (the notice, the band, the working rules, an Edit's denial) names `word`, then that the
 * person's word clears it. Called for `auth` with no CLAUDE.md and for a project word, so both are held alike.
 */
async function expectHeldLikeAuth($: Engine, on: On, word: string, risk: string, files?: Record<string, string>) {
  const clock = mock.clock(on)
  const plan = { text: planWith(`Mode: autopilot\nRisk: ${risk}`, ' h'), files }
  const sent = engine(on, plan)
  on('tool.call', () => ({ result: { text: 'ok' } }))
  const compose = composeKeel($, on)
  await arm($, plan)
  await $.turn.complete(ended('t1'))
  await clock.advance(1000)
  expect(sent.prompts).toEqual([])
  expect(sent.notes).toEqual([`Autopilot is holding before Stage 2 of 3 · Share mode h: it touches ${word}.`])
  const edit = { tool: 'Edit', old_string: 'a', new_string: 'b', file_path: '/repo/src/card.ts' } as const
  expect((await $.tool.call(edit)).deny).toBe(
    `keel autopilot is holding Stage 2 of 3 · Share mode h: its risk line names ${word}, so it isn't built without the user's word. Commit what's finished, set the Mode line to \`paused — <reason>\`, and ask the user.`,
  )
  expect((await $.tool.call({ ...edit, file_path: '/repo/docs/PLAN.md' })).deny).toBeUndefined()
  const held = await compose()
  expect(held.band).toBe('keel · autopilot held · 1/3 done · next: 2. Share mode')
  expect(held.text).toContain(`Autopilot is on, and the current stage is held: its risk line names ${word}. Building it`)
  await $.prompt.submit({ text: 'go ahead with that', origin: { kind: 'composer' } })
  expect((await $.tool.call(edit)).deny).toBeUndefined()
  expect((await compose()).band).toBe('keel · autopilot · 1/3 done · next: 2. Share mode')
}

test('a stage whose risk line names auth is held, and the person clears it (the pattern project words follow)', async ($, on) => {
  await expectHeldLikeAuth($, on, 'auth', 'auth, user input')
})

test('a Keel risk line in CLAUDE.md adds hold words, held exactly like auth', async ($, on) => {
  await expectHeldLikeAuth($, on, 'pci', 'PCI scope, user input', { 'CLAUDE.md': '# Project\n\nkeel RISK: PCI , card data\n' })
})

test('a Keel risk line in .claude/CLAUDE.md adds hold words too', async ($, on) => {
  await expectHeldLikeAuth($, on, 'card data', 'card data export', { '.claude/CLAUDE.md': 'Keel risk: card data' })
})

test('reads Keel risk and outward lines in any case at line start, trimmed, each entry once', () => {
  const rules = parseProjectRules(
    ['# Notes', 'KEEL Risk: PCI, Card  Data, pci', '  keel outward: make release, ./scripts/ship.sh prod , make release', 'see Keel risk: ignored mid-line'].join('\n'),
  )
  expect(rules.risk).toEqual(['pci', 'card data'])
  expect(rules.outward.map(r => r.words)).toEqual([['make', 'release'], ['./scripts/ship.sh', 'prod']])
})

test('project words match whole words only, literally, and come after the built-in ones', () => {
  expect(projectRisky('PCI, user input', ['pci'])).toEqual(['pci'])
  expect(projectRisky('pcie lanes, epci', ['pci'])).toEqual([])
  expect(projectRisky('card data, card-data', ['card data'])).toEqual(['card data'])
  // nothing in a word is a pattern: dots and pluses are themselves
  expect(projectRisky('the c++ core', ['c++', 'a.b'])).toEqual(['c++'])
  expect(projectRisky('axb', ['a.b'])).toEqual([])
  expect(parsePlan('PLAN.md', planWith('Mode: autopilot\nRisk: auth, pci')).stage?.risky).toEqual(['auth'])
})

test('a held stage names the built-in words first, then the project ones', async ($, on) => {
  const plan = { text: planWith('Mode: autopilot\nRisk: pci and auth', ' b'), files: { 'CLAUDE.md': 'Keel risk: auth, pci' } }
  engine(on, plan)
  on('tool.call', () => ({ result: { text: 'ok' } }))
  await arm($, plan)
  const deny = (await $.tool.call({ tool: 'Write', content: 'x', file_path: '/repo/src/a.ts' })).deny
  expect(deny).toContain('its risk line names auth, pci, so')
})

test('a project word the risk line does not name holds nothing', async ($, on) => {
  const plan = { text: planWith('Mode: autopilot\nRisk: UI only', ' n'), files: { 'CLAUDE.md': 'Keel risk: pci' } }
  engine(on, plan)
  on('tool.call', () => ({ result: { text: 'ok' } }))
  await arm($, plan)
  expect((await $.tool.call({ tool: 'Write', content: 'x', file_path: '/repo/src/a.ts' })).deny).toBeUndefined()
})

const RULES = '# Project\n\nKeel outward: make release, ./scripts/ship.sh, rsync-prod\n'

/** Autopilot driving the stage, with `files` beside the plan; returns a Bash runner answering the denial or undefined. */
async function drivingBash($: Engine, on: On, files: Record<string, string> | undefined) {
  const plan: Parameters<typeof engine>[1] = { text: planWith('Mode: autopilot', ' o'), files }
  engine(on, plan)
  on('tool.call', () => ({ result: { text: 'ran' } }))
  await arm($, plan)
  return { plan, bash: async (command: string) => (await $.tool.call({ tool: 'Bash', command })).deny }
}

test('a Keel outward line holds matching commands under autopilot, naming the project rule', async ($, on) => {
  const { bash } = await drivingBash($, on, { 'CLAUDE.md': RULES })
  const rule =
    "keel autopilot holds outward-facing steps for the user (make release, a `Keel outward:` rule in CLAUDE.md). Commit what's finished, set the Mode line to `paused — <what you want to run and why>`, and ask the user."
  expect(await bash('make release')).toBe(rule)
  expect(await bash('make release VERSION=2')).toBe(rule)
  // the same prefix stripping as the built-in check
  expect(await bash('sudo env STAGE=prod make release')).toBe(rule)
  expect(await bash('FOO=1 command make release')).toBe(rule)
  // any part of a compound command, whether or not the line passes the built-in prefilter
  expect(await bash('npm test && make release')).toBe(rule)
  expect(await bash('echo ready; make release | tee out.log')).toBe(rule)
  expect(await bash('cd sub && (make release)')).toBe(rule)
  // the command's head by its bare name, as the built-in check reads it
  expect(await bash('/usr/bin/make release')).toBe(rule)
  expect(await bash('./scripts/ship.sh --now')).toContain('(./scripts/ship.sh, a `Keel outward:` rule in CLAUDE.md)')
  expect(await bash('rsync-prod')).toContain('(rsync-prod, a `Keel outward:` rule in CLAUDE.md)')
})

test('a Keel outward rule matches leading command words, not text in the line', async ($, on) => {
  const { bash } = await drivingBash($, on, { 'CLAUDE.md': RULES })
  for (const command of ['make', 'make test', 'make releases', 'echo make release', 'grep "make release" Makefile', 'make -j4 release', 'cat <<EOF\nmake release\nEOF', 'ship.sh', 'scripts/ship.sh', 'rsync-prod2'])
    expect(await bash(command)).toBeUndefined()
})

test('a Keel outward rule holds nothing unless autopilot drives', async ($, on) => {
  // a Mode line already there when the session starts is not armed
  const plan: Parameters<typeof engine>[1] = { text: planWith('Mode: autopilot'), files: { 'CLAUDE.md': RULES } }
  engine(on, plan)
  on('tool.call', () => ({ result: { text: 'ran' } }))
  expect((await $.tool.call({ tool: 'Bash', command: 'make release' })).deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Bash', command: 'npm test && make release' })).deny).toBeUndefined()
  // nor does a paused run, or a plan with no Mode line
  plan.text = planWith('Mode: paused — waiting on the user')
  expect((await $.tool.call({ tool: 'Bash', command: 'make release' })).deny).toBeUndefined()
  plan.text = planWith('Open: none')
  expect((await $.tool.call({ tool: 'Bash', command: 'make release' })).deny).toBeUndefined()
})

test("Keel's own outward check runs first: a line both match names the built-in reason", async ($, on) => {
  const { bash } = await drivingBash($, on, { 'CLAUDE.md': RULES })
  expect(await bash('make release && git push origin main')).toContain('(git push)')
  expect(await bash('git push origin main && make release')).toContain('(git push)')
})

/** Lines a hostile CLAUDE.md might use to try to switch off a hold word or an outward command. */
const loosening = (word: string, command: string) =>
  [
    `Keel risk: !${word}, -${word}, no ${word}, allow ${word}, ${word}=off, *, , ${word.replace(/a/g, 'а')}, ${word}​`,
    `Keel risk: -`,
    `Keel risk:`,
    `Keel allow: ${word}, ${command}`,
    `Keel risk-: ${word}`,
    `Keel unrisk: ${word}`,
    `Kееl risk: none`,
    `Keel outward: !${command}, -${command}, allow ${command}, *, , none, -- ${command}`,
    `Keel outward: !`,
    `Keel outward: ${command}=off`,
    `Keel outward-: ${command}`,
    `Keel outward: ${'x,'.repeat(5_000)}`,
    `Keel risk: ${'y,'.repeat(5_000)}`,
  ].join('\n')

/** A CLAUDE.md past the size cap, so it is not read at all. */
const huge = (word: string, command: string) => `${loosening(word, command)}\n${'filler line\n'.repeat(60_000)}`

const RISK_CATEGORIES = ['auth', 'authentication', 'login', 'log-in', 'password', 'money', 'payment', 'billing', 'personal data', 'pii']

for (const word of RISK_CATEGORIES)
  test(`nothing in CLAUDE.md loosens the built-in risk word: ${word}`, async ($, on) => {
    const plan: Parameters<typeof engine>[1] = { text: planWith(`Mode: autopilot\nRisk: ${word}, telemetry`, ' l') }
    engine(on, plan)
    on('tool.call', () => ({ result: { text: 'ok' } }))
    const compose = composeKeel($, on)
    await arm($, plan)
    const write = { tool: 'Write', content: 'x', file_path: '/repo/src/a.ts' } as const
    const observe = async () => ({ deny: (await $.tool.call(write)).deny, ...(await compose()) })
    const base = await observe()
    expect(base.deny).toContain(`its risk line names ${word}, so`)
    for (const text of [loosening(word, 'git push'), huge(word, 'git push')]) {
      plan.files = { 'CLAUDE.md': text, '.claude/CLAUDE.md': text }
      expect(await observe()).toEqual(base)
    }
    // beside a project word the line also names, the built-in one stays, and first
    plan.files = { 'CLAUDE.md': `${loosening(word, 'git push')}\nKeel risk: telemetry` }
    const added = await observe()
    expect(added.deny).toBe(base.deny?.replace(`names ${word},`, `names ${word}, telemetry,`))
    expect(added.band).toBe(base.band)
  })

const OUTWARD_CATEGORIES: [string, string][] = [
  ['git push', 'git push origin main'],
  ['gh writes', 'gh pr create --fill'],
  ['gh api', 'gh api -X POST repos/o/r/issues'],
  ['npm publish', 'npm publish'],
  ['pnpm publish', 'pnpm publish'],
  ['cargo publish', 'cargo publish'],
  ['twine upload', 'twine upload dist/x.whl'],
  ['gem push', 'gem push x.gem'],
  ['poetry publish', 'poetry publish'],
  ['uv publish', 'uv publish'],
  ['docker push', 'docker push img:1'],
  ['vercel deploy', 'vercel --prod'],
  ['netlify deploy', 'netlify deploy'],
  ['fly deploy', 'fly deploy'],
  ['firebase deploy', 'firebase deploy'],
  ['wrangler deploy', 'wrangler deploy'],
  ['railway up', 'railway up'],
  ['cdk deploy', 'cdk deploy'],
  ['terraform apply', 'terraform apply'],
  ['pulumi up', 'pulumi up'],
  ['kubectl apply', 'kubectl apply -f k.yaml'],
  ['helm install', 'helm install x ./chart'],
  ['gcloud deploy', 'gcloud app deploy'],
  ['az delete', 'az group delete -n x'],
  ['aws write', 'aws s3 cp a s3://b'],
  ['curl sending data', 'curl -d x https://api.example.com/v1'],
]

for (const [name, command] of OUTWARD_CATEGORIES)
  test(`nothing in CLAUDE.md loosens the built-in outward check: ${name}`, async ($, on) => {
    const { plan, bash } = await drivingBash($, on, undefined)
    const base = await bash(command)
    expect(base).toContain('holds outward-facing steps for the user (')
    for (const text of [loosening('auth', command), huge('auth', command), `Keel outward: ${command}`]) {
      plan.files = { 'CLAUDE.md': text, '.claude/CLAUDE.md': text }
      expect(await bash(command)).toBe(base)
      expect(await bash(`sudo ${command}`)).toBe(base)
    }
  })

test('malformed rule lines and entries add nothing', () => {
  const none = { risk: [], outward: [] }
  for (const text of [
    '',
    'Keel risk',
    'Keel risk auth',
    'Keel risks: pci',
    'Keel: risk: pci',
    'Kееl risk: pci',
    'Keel risk： pci',
    'Keel risk: !pci, -pci, *, pci*, ?, , ,, ​pci, pci\u0000, ‮pci',
    `Keel risk: ${'p'.repeat(65)}`,
    'Keel outward: a; b, a && b, a | b, cd x, sudo, env FOO=1, -rf, *, rm *, $(curl x), `x`, ${X}, "", ​make',
    'Keel outward: a b c d e f g',
    `Keel outward: ${'m'.repeat(65)}`,
  ])
    expect(parseProjectRules(text)).toEqual(none)
})

test('a line with thousands of entries, or a file of them, adds at most 50 of each', () => {
  const words = Array.from({ length: 5_000 }, (_, i) => `w${i}`).join(', ')
  const rules = parseProjectRules(Array.from({ length: 200 }, () => `Keel risk: ${words}\nKeel outward: ${words}`).join('\n'))
  expect(rules.risk.length).toBe(50)
  expect(rules.outward.length).toBe(50)
  expect(rules.risk[0]).toBe('w0')
})

test('outward rules compare words exactly: a project path is itself', () => {
  const rules = parseProjectRules('Keel outward: ./deploy.sh, /opt/bin/ship now')
  const match = (line: string) => parseCommands(line).map(c => projectOutward(rules, c)?.words.join(' ')).find(Boolean)
  expect(match('./deploy.sh')).toBe('./deploy.sh')
  expect(match('deploy.sh')).toBeUndefined()
  expect(match('/opt/bin/ship now')).toBe('/opt/bin/ship now')
  expect(match('ship now')).toBeUndefined()
})

test('a CLAUDE.md that is unreadable, no regular file, too big or outside the repo adds nothing and blocks nothing', async ($, on) => {
  const plan: Parameters<typeof engine>[1] = { text: planWith('Mode: autopilot\nRisk: pci', ' u') }
  engine(on, plan)
  on('tool.call', () => ({ result: { text: 'ran' } }))
  const compose = composeKeel($, on)
  await arm($, plan)
  const write = { tool: 'Write', content: 'x', file_path: '/repo/src/a.ts' } as const
  const observe = async () => ({
    write: (await $.tool.call(write)).deny,
    bash: (await $.tool.call({ tool: 'Bash', command: 'make release' })).deny,
    ...(await compose()),
  })
  const base = await observe()
  expect(base).toMatchObject({ write: undefined, bash: undefined })
  const rules = 'Keel risk: pci\nKeel outward: make release'
  const files = { 'CLAUDE.md': rules }
  const cases: Partial<Parameters<typeof engine>[1]>[] = [
    { files, broken: ['CLAUDE.md'] },
    { files, unsure: ['CLAUDE.md'] },
    { files, stats: { 'CLAUDE.md': 'throws' } },
    { files, stats: { 'CLAUDE.md': { kind: 'dir', size: 4096 } } },
    { files, stats: { 'CLAUDE.md': { kind: 'other', size: 0 } } },
    { files, stats: { 'CLAUDE.md': { kind: 'file', size: 512 * 1024 + 1 } } },
    { files, stats: { 'CLAUDE.md': { kind: 'file', size: rules.length, realPath: '/home/someone/CLAUDE.md' } } },
    { files, stats: { 'CLAUDE.md': { kind: 'file', size: rules.length, realPath: '/repository/CLAUDE.md' } } },
  ]
  for (const c of cases) {
    Object.assign(plan, { files: undefined, broken: undefined, unsure: undefined, stats: undefined }, c)
    expect(await observe()).toEqual(base)
  }
  // the same file, readable and inside the repo, holds both
  Object.assign(plan, { files, broken: undefined, unsure: undefined, stats: undefined })
  const ruled = await observe()
  expect(ruled.write).toContain('its risk line names pci')
  expect(ruled.bash).toContain('make release, a `Keel outward:` rule in CLAUDE.md')
})

test('without Keel lines in CLAUDE.md, context, band, holds and denials are byte-identical', async ($, on) => {
  const plan: Parameters<typeof engine>[1] = { text: planWith('Open: none') }
  engine(on, plan)
  on('tool.call', () => ({ result: { text: 'ran' } }))
  const compose = composeKeel($, on)
  const notes = '# Project\n\nUse pnpm. Never deploy on Fridays: make release, fly deploy.\nkeel is our plugin; risk: auth\n'
  expect(await compose()).toEqual({ text: PLAN_SECTION_070, band: BAND_070 })
  plan.files = { 'CLAUDE.md': notes }
  expect(await compose()).toEqual({ text: PLAN_SECTION_070, band: BAND_070 })
  // rules that add, with no Mode line, add nothing either
  plan.files = { 'CLAUDE.md': `${notes}Keel risk: pci, auth\nKeel outward: make release` }
  expect(await compose()).toEqual({ text: PLAN_SECTION_070, band: BAND_070 })

  // under autopilot, a held stage and a denied push read the same with or without the file
  plan.files = undefined
  plan.text = planWith('Mode: autopilot\nRisk: auth, pci', ' i')
  await arm($, plan)
  const write = { tool: 'Write', content: 'x', file_path: '/repo/src/a.ts' } as const
  const observe = async () => ({
    write: (await $.tool.call(write)).deny,
    push: (await $.tool.call({ tool: 'Bash', command: 'git push && make release' })).deny,
    local: (await $.tool.call({ tool: 'Bash', command: 'make release' })).deny,
    ...(await compose()),
  })
  const base = await observe()
  expect(base.write).toContain('its risk line names auth, so')
  expect(base.local).toBeUndefined()
  plan.files = { 'CLAUDE.md': notes }
  expect(await observe()).toEqual(base)
})

test('a pathological CLAUDE.md and risk line are read in well under 100 ms', () => {
  // one line at the character cap of entries, lines of blanks after the keyword, entries a shell parser must walk, the line cap
  const entries = `Keel risk: ${'a,'.repeat(130_000)}`
  const blanks = Array.from({ length: 125 }, () => 'Keel' + ' '.repeat(1_990) + 'x').join('\n')
  const quotes = `Keel outward: ${`"'`.repeat(1_000)}, ${'$('.repeat(900)}, ${'\\'.repeat(1_990)}`
  const lines = Array.from({ length: 20_000 }, (_, i) => `keel risk: ${'b'.repeat(60)}${i}`).join('\n')
  // words that almost match at every position of a long risk line
  const words = Array.from({ length: 50 }, (_, i) => 'a'.repeat(60) + String(i).padStart(2, '0') + 'b')
  const times = {
    entries: timed(() => expect(parseProjectRules(entries).risk).toEqual(['a'])),
    blanks: timed(() => expect(parseProjectRules(blanks).risk).toEqual([])),
    quotes: timed(() => expect(parseProjectRules(quotes).outward).toEqual([])),
    lines: timed(() => expect(parseProjectRules(lines).risk.length).toBe(50)),
    risky: timed(() => expect(projectRisky('a'.repeat(100_000), words)).toEqual([])),
  }
  console.log(`project rule timings (ms): ${JSON.stringify(times)}`)
  for (const ms of Object.values(times)) expect(ms).toBeLessThan(100)
})
