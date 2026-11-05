import type { On } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'
import { findSecrets } from '../hooks/secrets.ts'
import { closedStages, parsePlan } from '../hooks/register.ts'
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
  expect(plan).toEqual({ path: 'docs/BUILD_PLAN.md', now: undefined, mode: undefined, stage: undefined, done: 2, total: 2, current: undefined })
})

test('reads the autopilot mode, and a pause with its reason', () => {
  expect(parsePlan('PLAN.md', planWith('Mode: autopilot')).mode).toEqual({ kind: 'autopilot' })
  expect(parsePlan('PLAN.md', planWith('Mode: paused — stage 3 touches auth')).mode).toEqual({
    kind: 'paused',
    reason: 'stage 3 touches auth',
  })
  expect(parsePlan('PLAN.md', planWith('Open: none')).mode).toBeUndefined()
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

/** Stands in for the engine under the autopilot: the plan on disk, the context gauge, and what the hooks send it. */
function engine(on: On, plan: { text: string }, percent = 20, agents: { status: string }[] = []) {
  const sent = { prompts: [] as string[], compactions: [] as (string | undefined)[], notes: [] as string[] }
  on('agent.list', () => ({ value: agents.map((a, i) => ({ id: `a${i}`, description: 'build', type: 'general-purpose', ...a })) as never }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('/docs/PLAN.md') }))
  on('fs.read', () => ({ value: plan.text }))
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

test('closing a stage whose checks were never ticked is refused', async ($, on) => {
  const plan = { text: ['## Now', 'Stage 2 of 3 · Share mode', 'Checks:', '- [x] link opens read-only', '- [ ] controls work on touch', '## Stages', '- [x] 1. Foundation', '- [ ] 2. Share mode', '- [ ] 3. Polish'].join('\n') }
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
