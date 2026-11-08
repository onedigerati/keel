import type { EngineInterface, Register } from 'claude-code'
import { findSecrets, type Finding } from './secrets.ts'
import { addScope, commitScope, gitCall, joinPath, outwardReason, parseCommands, type Command } from './shell.ts'

/** Where a project's plan can live; the first that exists wins. */
const PLAN_PATHS = ['docs/PLAN.md', 'PLAN.md', 'docs/BUILD_PLAN.md']

/** The most of the plan's "Now" section that rides in every request. */
const NOW_MAX_LINES = 40

/** Context fill, in percent, past which autopilot compacts before carrying on. */
const COMPACT_AT = 65

/** Turns in a row that may end with the plan unchanged before autopilot stops prompting. */
const MAX_STALLED_TURNS = 3

/** How long after a turn ends autopilot waits, so the session is idle when it acts. */
const SETTLE_MS = 1000

/** What a risk line names that autopilot must not build without the user's word. */
const RISKY = /\b(auth\w*|log-?ins?|passwords?|money|payments?|billing|personal data|pii)\b/gi

/** Prompts a person sent, as against a plugin, a background task or another session. */
const USER_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

/** The `Mode:` line in `## Now`: `autopilot` while keel:autopilot is in charge, `paused — <reason>` while it waits. */
type Mode = { kind: 'autopilot' } | { kind: 'paused'; reason: string }

/** The `Agents:` line in `## Now`: how widely work fans out to subagents. No line means `balanced`. */
export type AgentsLevel = 'lean' | 'balanced' | 'wide'

interface Stage {
  /** The first line of `## Now`, e.g. `Stage 3 of 5 · Accounts`. */
  key: string
  number: string | undefined
  /** What the risk line names that holds autopilot, e.g. `auth, personal data`; empty when nothing does. */
  risky: string[]
  checks: { text: string; done: boolean }[]
}

interface Plan {
  path: string
  /** The `## Goal` paragraph: when it changes, the plan is for a new feature. */
  goal: string | undefined
  now: string | undefined
  mode: Mode | undefined
  /** The level the `Agents:` line names; undefined with no line or an unknown value. */
  agents: AgentsLevel | undefined
  /** The `Agents:` line as written (trimmed), present even when its level is unknown. */
  agentsLine: string | undefined
  /** The date and optional time after `confirmed` on the Agents line, as digits (`202611081405`); undefined without one. */
  agentsStamp: string | undefined
  stage: Stage | undefined
  done: number
  total: number
  current: string | undefined
}

async function loadPlan($: EngineInterface): Promise<Plan | undefined> {
  for (const path of PLAN_PATHS) {
    if (!(await $.fs.exists(path))) continue
    return parsePlan(path, await $.fs.read(path))
  }
  return undefined
}

/**
 * The confirmation stamp on an Agents line, whatever its level (so a typo fixed later can't bring in a new stamp):
 * the first date after `confirmed`, with an optional time, as zero-padded digits (`2026-11-08 9:05` is
 * `202611080905`). Separators and anything after the stamp don't count, so only a new date or time is a new stamp.
 */
export function stampIn(line: string): string | undefined {
  const m = line.match(/\bconfirmed\b\D*?(\d{4})\D?(\d{1,2})\D?(\d{1,2})(?:[^\p{L}\d]{1,3}(\d{1,2})\D?(\d{2}))?/iu)
  if (!m) return undefined
  return m.slice(1).filter(p => p !== undefined).map(p => p.padStart(2, '0')).join('')
}

/** Reads the `## Now` section and the checklist under the first `## …Stages…` heading. */
export function parsePlan(path: string, text: string): Plan {
  const sections = new Map<string, string[]>()
  let heading = ''
  for (const line of text.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/)
    if (m) heading = (m[1] ?? '').toLowerCase()
    else if (heading) sections.set(heading, [...(sections.get(heading) ?? []), line])
  }

  const nowLines = sections.get('now')
  const now = nowLines?.join('\n').trim() ? nowLines.slice(0, NOW_MAX_LINES).join('\n').trim() : undefined
  const modeLine = nowLines?.map(l => l.match(/^Mode:\s*(autopilot|paused)\b\s*[—–:-]?\s*(.*)$/i)).find(Boolean)
  const mode: Mode | undefined = !modeLine
    ? undefined
    : modeLine[1]?.toLowerCase() === 'autopilot'
      ? { kind: 'autopilot' }
      : { kind: 'paused', reason: modeLine[2]?.trim() || 'waiting on the user' }
  const agentsLine = nowLines?.map(l => l.trim()).find(l => /^Agents:/i.test(l))
  const agents = agentsLine?.match(/^Agents:\s*(lean|balanced|wide)\b/i)?.[1]?.toLowerCase() as AgentsLevel | undefined
  const agentsStamp = agentsLine === undefined ? undefined : stampIn(agentsLine)

  let stage: Stage | undefined
  if (now && nowLines) {
    // the stage line is the first line of `## Now` that isn't the Mode or Agents line, which may sit above it
    // (a pause reason can itself name a stage, so Mode lines never count)
    const lines = now.split('\n').map(l => l.trim()).filter(l => l && !/^(Mode|Agents):/i.test(l))
    const key = lines.find(l => /\bstage\s+\d+/i.test(l) && !/^[-*]\s+\[/.test(l)) ?? lines[0] ?? ''
    const risk = nowLines.map(l => l.match(/^Risk:\s*(.*)$/i)?.[1]).find(r => r !== undefined) ?? ''
    const risky = [...new Set([...risk.matchAll(RISKY)].map(m => (m[1] ?? '').toLowerCase()))]
    const checks = nowLines
      .map(l => l.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/))
      .filter(m => m !== null)
      .map(m => ({ text: (m[2] ?? '').trim(), done: m[1] !== ' ' }))
    stage = { key, number: key.match(/\bstage\s+(\d+)/i)?.[1], risky, checks }
  }

  const stageKey = [...sections.keys()].find(k => k.includes('stage'))
  const stages = (sections.get(stageKey ?? '') ?? []).filter(l => /^[-*]\s+\[[ xX]\]/.test(l))
  const open = stages.find(l => /^[-*]\s+\[ \]/.test(l))
  const current = open
    ?.replace(/^[-*]\s+\[ \]\s*/, '')
    .replace(/\*\*/g, '')
    .split(/\s+[—–-]\s+/)[0]
    ?.trim()

  const done = stages.length - stages.filter(l => /\[ \]/.test(l)).length
  const goal = sections.get('goal')?.join('\n').trim() || undefined
  return { path, goal, now, mode, agents, agentsLine, agentsStamp, stage, done, total: stages.length, current }
}

// ---- session state: what this session, not the repo, says about autopilot ----

const ARMED = { plugin: 'keel', key: 'armed' } as const
const SEEN_MODE = { plugin: 'keel', key: 'seenMode' } as const
const CLEARED = { plugin: 'keel', key: 'cleared' } as const
const OPEN_CHECKS = { plugin: 'keel', key: 'openChecks' } as const
const GOAL = { plugin: 'keel', key: 'goal' } as const
const CHECK_COUNTS = { plugin: 'keel', key: 'checkCounts' } as const
const FIRST_AGENTS = { plugin: 'keel', key: 'firstAgents' } as const

interface Session {
  armed: boolean
  cleared: string[]
  openChecks: Record<string, string[]>
  /** For each stage number, how many checks `## Now` listed when last seen there. */
  checkCounts: Record<string, number>
  /** The Agents line as this session first read it; undefined until the session has looked. */
  firstAgents: FirstAgents | undefined
  /** The time (ms) at the last sync, read only while the plan asks for wide; undefined when the clock can't be read. */
  now: number | undefined
}

async function readSession($: EngineInterface): Promise<Session> {
  const [armed, cleared, openChecks, checkCounts, firstAgents] = await Promise.all([
    $.state.get(ARMED),
    $.state.get(CLEARED),
    $.state.get(OPEN_CHECKS),
    $.state.get(CHECK_COUNTS),
    $.state.get(FIRST_AGENTS),
  ])
  return {
    armed: armed.value ?? false,
    cleared: cleared.value ?? [],
    openChecks: openChecks.value ?? {},
    checkCounts: checkCounts.value ?? {},
    firstAgents: typeof firstAgents.value === 'object' ? firstAgents.value : undefined,
    now: undefined,
  }
}

/**
 * The Agents line as a session first reads it: its level (`none` without a line, `unknown` for a line whose
 * value isn't a level, which may be a disguised `wide`) and its confirmation stamp.
 */
export interface FirstAgents {
  level: AgentsLevel | 'none' | 'unknown'
  stamp?: string
  /** When the session first read the line (ms); a confirmation must be stamped no earlier than that minute. */
  at?: number
}

/** `at`: the time of the read, left out when the clock couldn't be read (then no stamp can confirm). */
export function firstAgentsOf(plan: Pick<Plan, 'agents' | 'agentsLine' | 'agentsStamp'> | undefined, at?: number): FirstAgents {
  const level = plan?.agents ?? (plan?.agentsLine ? 'unknown' : 'none')
  return { level, ...(plan?.agentsStamp ? { stamp: plan.agentsStamp } : {}), ...(at !== undefined ? { at } : {}) }
}

/** A stamp with its time (`YYYYMMDDHHMM`) as local-time ms; undefined for a date-only or impossible stamp. */
function stampTime(stamp: string): number | undefined {
  const m = stamp.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (!m) return undefined
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number]
  const t = new Date(y, mo - 1, d, h, mi)
  const same = t.getFullYear() === y && t.getMonth() === mo - 1 && t.getDate() === d && t.getHours() === h && t.getMinutes() === mi
  return same ? t.getTime() : undefined
}

const MINUTE = 60_000

/**
 * The level this session works at. `lean` and `balanced` are honoured as found, since they only lower the spend,
 * so they need no session state (`first` may be undefined). `wide` is honoured when the session first read no line
 * or a lean or balanced one, or when the line now carries a confirmation stamp that has a time, differs from the
 * one first read, and falls between the minute of the first read and a minute past `now` (local time, as
 * `stampOf` writes it): a `wide` (or unknown) line already there at the start counts as `balanced` until the user
 * confirms and the line is restamped. So a planted stamp, kept, reformatted, stripped of its time or set in the
 * future, confirms nothing, and nor does any stamp when the clock couldn't be read. Fields are compared, not text,
 * so rewriting the line in another case or spacing confirms nothing. Undefined when the plan has no Agents line,
 * or its value is unknown.
 */
export function effectiveAgents(
  plan: Pick<Plan, 'agents' | 'agentsStamp'> | undefined,
  first: FirstAgents | undefined,
  now?: number,
): AgentsLevel | undefined {
  const level = plan?.agents
  if (level !== 'wide') return level
  if (!first) return 'balanced'
  if (first.level !== 'wide' && first.level !== 'unknown') return 'wide'
  const stamp = plan?.agentsStamp
  if (stamp === undefined || stamp === first.stamp || first.at === undefined || now === undefined) return 'balanced'
  const t = stampTime(stamp)
  return t !== undefined && t >= Math.floor(first.at / MINUTE) * MINUTE && t <= now + MINUTE ? 'wide' : 'balanced'
}

/** Whether the plan asks for `wide` and this session doesn't yet honour it. */
const unconfirmedWide = (plan: Plan, s: Session) => plan.agents === 'wide' && effectiveAgents(plan, s.firstAgents, s.now) !== 'wide'

/** The clock's time in ms, or undefined when it can't be read. */
const clockNow = ($: EngineInterface) =>
  $.clock.now().then(
    t => (typeof t === 'number' && Number.isFinite(t) ? t : undefined),
    () => undefined,
  )

/** A local `YYYY-MM-DD HH:MM` for the confirmation stamp. */
export function stampOf(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}

/**
 * Brings the session's view up to date with the plan. Autopilot arms when the Mode line turns to autopilot
 * during this session, and disarms when the line goes; a plan that already said autopilot when the session
 * first looked stays unarmed, so a repo can never start a run by itself. Also notes which checks are unticked,
 * and the Agents line as first read, so a `wide` the session didn't see set isn't honoured unasked.
 */
async function sync($: EngineInterface, plan: Plan | undefined): Promise<Session> {
  const mode = plan?.mode?.kind ?? 'none'
  const [seen, seenGoal, session] = await Promise.all([$.state.get(SEEN_MODE), $.state.get(GOAL), readSession($)])
  // a new Goal is a new feature: its stages restart at 1, so the last feature's per-stage records go
  const goal = plan?.goal ?? ''
  if (seenGoal.value !== goal) {
    if (seenGoal.value !== undefined && plan) {
      session.openChecks = {}
      session.cleared = []
      session.checkCounts = {}
      await $.state.set(OPEN_CHECKS, {})
      await $.state.set(CLEARED, [])
      await $.state.set(CHECK_COUNTS, {})
    }
    if (plan) await $.state.set(GOAL, goal)
  }
  if (seen.value !== mode) {
    if (seen.value !== undefined && mode === 'autopilot') session.armed = true
    if (mode === 'none') session.armed = false
    await $.state.set(SEEN_MODE, mode)
    await $.state.set(ARMED, session.armed)
  }
  if (session.firstAgents === undefined) {
    session.firstAgents = firstAgentsOf(plan, await clockNow($))
    await $.state.set(FIRST_AGENTS, session.firstAgents)
  }
  // a wide line's stamp is checked against the time, so read it only then
  if (plan?.agents === 'wide') session.now = await clockNow($)
  const stage = plan?.stage
  if (stage?.number && stage.checks.length) {
    const open = stage.checks.filter(c => !c.done).map(c => c.text)
    if (JSON.stringify(session.openChecks[stage.number] ?? null) !== JSON.stringify(open)) {
      session.openChecks = { ...session.openChecks, [stage.number]: open }
      await $.state.set(OPEN_CHECKS, session.openChecks)
    }
    if (session.checkCounts[stage.number] !== stage.checks.length) {
      session.checkCounts = { ...session.checkCounts, [stage.number]: stage.checks.length }
      await $.state.set(CHECK_COUNTS, session.checkCounts)
    }
  }
  return session
}

const driving = (plan: Plan | undefined, s: Session) => plan?.mode?.kind === 'autopilot' && s.armed

/** Autopilot is holding the current stage: its risk line names auth, money or personal data and the user hasn't spoken to it. */
const held = (plan: Plan | undefined, s: Session) =>
  driving(plan, s) && !!plan?.stage?.risky.length && !s.cleared.includes(plan.stage.key)

// ---- what rides in the system prompt ----

function statusLine(plan: Plan, s: Session): string {
  if (plan.total === 0) return `keel · ${plan.path}`
  if (!plan.current) return `keel · all ${plan.total} stages done · next feature: keel:plan`
  const mode = !plan.mode
    ? ''
    : plan.mode.kind === 'paused'
      ? ' · paused'
      : !s.armed
        ? ' · autopilot (not armed)'
        : held(plan, s)
          ? ' · autopilot held'
          : ' · autopilot'
  const level = effectiveAgents(plan, s.firstAgents, s.now)
  const agents = level === 'lean' || level === 'wide' ? ` · ${level}` : ''
  return `keel${mode}${agents} · ${plan.done}/${plan.total} done · next: ${plan.current}`
}

/** What the Agents line asks of this session, or `''` with no line. */
function agentsRule(plan: Plan, s: Session, now: string | undefined): string {
  if (!plan.agents) return ''
  const level = effectiveAgents(plan, s.firstAgents, s.now)
  if (unconfirmedWide(plan, s))
    return `Agents: the plan's Agents line asks for wide, but it was set before this session, so work at balanced until the user confirms: ask whether to fan out wide (under keel:stage, before building; under autopilot, carry on at balanced meanwhile), and on their yes restamp the line as \`Agents: wide — confirmed ${now ?? '<YYYY-MM-DD HH:MM>'}\`${now ? '' : ', the current date and time'}.`
  if (level === 'lean')
    return 'Agents: lean — build and verify in the main session and run at most one agent at a time; under keel:autopilot, still delegate building, one builder at a time; review still uses one fresh reviewer.'
  if (level === 'wide')
    return 'Agents: wide — fan out every independent leaf to its own agent in its own worktree, have a fresh agent verify, and when the security lens applies (risk beyond UI), run the correctness and security reviewers in parallel.'
  return 'Agents: balanced — fan independent leaves out to subagents when it helps.'
}

function workingRules(plan: Plan, s: Session, now: string | undefined): string {
  const rules = baseRules(plan, s)
  const agents = agentsRule(plan, s, now)
  return agents ? `${rules} ${agents}` : rules
}

function baseRules(plan: Plan, s: Session): string {
  const base =
    'Working rules: build in stages; a stage is done only when its acceptance checks pass against the running product and the test suite is green; tick each check in `## Now` as it is proven, before closing the stage; verifying a stage, even one asked about only for a report, means running keel:verify, which saves its evidence to `docs/evidence/stage-<n>/`; tests accompany risky logic (money, dates, parsing, permissions); stages marked risky get a security review;'
  const skills = 'The keel skills (plan, stage, autopilot, verify, review, resume) hold the details.'
  if (plan.mode?.kind === 'autopilot' && !s.armed)
    return `${base} commit per stage. The plan's Mode line says autopilot, but that was set in an earlier session and autopilot is not armed in this one: do not carry on by yourself. Tell the user where the run stands and ask whether to resume; on their yes, run keel:autopilot. ${skills}`
  if (held(plan, s))
    return `${base} commit per stage. Autopilot is on, and the current stage is held: its risk line names ${plan.stage?.risky.join(', ')}. Building it (file edits outside the plan, builder agents) is blocked until the user okays it: commit what is finished, set the Mode line to \`paused — <reason>\`, and ask. ${skills}`
  if (plan.mode?.kind === 'autopilot')
    return `${base} commit per stage. Autopilot is on: you are the project manager under keel:autopilot. Go from stage to stage without stopping for review, delegate the building, and stop only for the reasons keel:autopilot lists, setting the Mode line to paused when you do. Outward-facing commands (push, publish, deploy, sending data out) are blocked while it runs. ${skills}`
  if (plan.mode?.kind === 'paused')
    return `${base} commit per stage. Autopilot is paused (${plan.mode.reason}): settle that with the user, then set the Mode line back to autopilot and carry on under keel:autopilot. ${skills}`
  return `${base} commit per stage and stop for the user's review. ${skills}`
}

/** Where standing decisions move once more than ten would carry forward (keel:plan). */
const DECISIONS_PATH = 'docs/decisions.md'

/**
 * `now`: the current time as a stamp, which the rules hand Claude for confirming a `wide` line.
 * `decisionsFile`: whether `docs/decisions.md` exists; without it the section reads exactly as before it was known.
 */
function planSection(plan: Plan, s: Session, now: string | undefined, decisionsFile: boolean): string {
  const position = plan.now ?? (plan.current ? `Next stage: ${plan.current}` : 'No open stage in the plan.')
  const standing = decisionsFile ? ` (standing decisions in \`${DECISIONS_PATH}\`)` : ''
  return [
    `# Keel`,
    `This project keeps its plan in \`${plan.path}\`: the source of truth for goal, decisions and stages${standing}. Reread it before acting on anything it covers, and update it in the same change when a decision or stage changes. Subagents: treat this as background and stay inside your brief.`,
    ``,
    `Current position (from the plan):`,
    position,
    ``,
    workingRules(plan, s, now),
  ].join('\n')
}

/** What the summarizer must keep, whoever asked for the compaction. */
const KEEP =
  'Keep the project-plan state exactly: the active stage, its acceptance checks and which have passed, decisions made since the plan file was last updated, and any uncommitted work in progress with its file paths.'

// ---- the autopilot loop ----

/** Main-loop turns started this load; a turn that starts while autopilot waits means someone else has the floor. */
let mainTurns = 0
/** The plan as it stood when the last autopilot turn ended, and how many turns in a row left it so. */
let lastProgress: string | undefined
let stalledTurns = 0
/** The mode the plan had at the last main-loop turn's end, to notice it change. */
let lastMode: Mode['kind'] | undefined
/** Whether the latest prompt came from the person. */
let lastPromptFromUser = false
/** The held stage the person was last told about, so they hear it once. */
let heldNoticeFor: string | undefined
/** Agent calls from the main loop that have reached the lean cap and not yet settled (allowed, denied or thrown). */
let agentCallsInFlight = 0

/** Background agents the main loop started that are still working: their notifications will start the next turn. */
async function backgroundBusy($: EngineInterface): Promise<boolean> {
  const agents = await $.agent.list().catch(() => [])
  return agents.some(a => !a.parentId && (a.status === 'pending' || a.status === 'running' || a.status === 'waiting'))
}

/** Between turns: compact if the context is filling, then prompt the next step, unless a turn started meanwhile. */
async function carryOn($: EngineInterface, plan: Plan, turn: number) {
  if (mainTurns !== turn) return
  const { context } = await $.session.usage()
  let compacted = false
  if ((context.percent ?? 0) >= COMPACT_AT) {
    // a compaction that fails or is vetoed still lets the run go on; the engine's own threshold remains
    const result = await $.session.compact({ instructions: KEEP }).catch(() => undefined)
    compacted = result !== undefined && !('skip' in result)
    if (!result) $.ui.toast('keel: autopilot could not compact the context; carrying on')
  }
  if (mainTurns !== turn) return
  const note = compacted ? ' The context was just compacted: reread the plan before acting.' : ''
  await $.prompt.submit({
    text: `keel autopilot: carry on with \`${plan.path}\` under keel:autopilot. Next: ${plan.current}.${note}`,
  })
}

// ---- the commit guard ----

async function git($: EngineInterface, args: string[], cwd: string) {
  const r = await $.process.run(['git', ...args], { cwd })
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.slice(0, 200)}`)
  return r.stdout
}

const DIFF = ['-U0', '--no-color', '--no-ext-diff']

/** Everything a commit could carry: its repo's index, plus what it or a `git add` before it on the same line takes from the working tree. */
async function pendingChanges($: EngineInterface, root: string, commands: Command[], at: number) {
  const call = gitCall(commands[at]!)!
  const scope = commitScope(call)
  const dir = joinPath(root, scope.dir ?? '.')
  const diffs = [await git($, ['diff', '--cached', ...DIFF], dir)]
  const files: { path: string; text: string }[] = []

  if (scope.all) diffs.push(await git($, ['diff', ...DIFF], dir))
  if (scope.paths.length) {
    const against = await git($, ['diff', 'HEAD', ...DIFF, '--', ...scope.paths], dir).catch(() => git($, ['diff', ...DIFF, '--', ...scope.paths], dir))
    diffs.push(against)
  }

  // a `git add` earlier on this line hasn't run yet: scan what it will stage
  for (const cmd of commands.slice(0, at)) {
    const add = (() => {
      const c = gitCall(cmd)
      return c ? addScope(c) : undefined
    })()
    if (!add) continue
    const addDir = joinPath(root, add.dir ?? '.')
    diffs.push(await git($, ['diff', ...DIFF, '--', ...add.paths], addDir))
    if (!add.untracked) continue
    const listed = await git($, ['ls-files', '--others', ...(add.ignored ? [] : ['--exclude-standard']), '--', ...add.paths], addDir)
    for (const path of listed.split('\n').filter(Boolean).slice(0, 500 - files.length)) {
      const text = await $.fs.read(joinPath(addDir, path)).catch(() => undefined)
      if (typeof text === 'string' && !text.includes('\u0000')) files.push({ path, text })
    }
  }
  return { diff: diffs.join('\n'), files, dir }
}

/**
 * Whether a path git reports (repo-relative, maybe from a subdirectory) is `path`. Case is ignored, since on a
 * case-insensitive filesystem (macOS by default) keel reads `docs/PLAN.md` from a file git calls `docs/Plan.md`.
 */
export function samePath(file: string, path: string): boolean {
  const f = file.toLowerCase()
  const p = path.toLowerCase()
  return f === p || f.endsWith(`/${p}`)
}

/** Stage numbers whose `[ ]` turns to `[x]` in the plan file's part of a diff. */
export function closedStages(diff: string, planPath: string): string[] {
  const ticked = new Set<string>()
  const unticked = new Set<string>()
  let inPlan = false
  for (const raw of diff.split('\n')) {
    const header = raw.match(/^\+\+\+ (?:b\/)?(.+)$/)
    if (header) {
      const file = header[1] ?? ''
      inPlan = samePath(file, planPath)
      continue
    }
    if (!inPlan) continue
    const m = raw.match(/^([+-])\s*[-*]\s+\[([ xX])\]\s+(?:\*\*)?(?:stage\s+)?(\d+)\b/i)
    if (!m) continue
    if (m[1] === '+' && m[2] !== ' ') ticked.add(m[3] ?? '')
    if (m[1] === '-' && m[2] === ' ') unticked.add(m[3] ?? '')
  }
  return [...ticked].filter(n => unticked.has(n))
}

function secretDenial(found: Finding[]): string {
  const list = found
    .slice(0, 8)
    .map(f => `  - ${f.file}${f.line ? `:${f.line}` : ''}: ${f.kind}`)
    .join('\n')
  const more = found.length > 8 ? `\n  - …and ${found.length - 8} more` : ''
  return [
    `keel blocked this commit: it would include what looks like a secret.`,
    list + more,
    `Move the value into an environment variable or an ignored file, and rotate it if it was ever pushed or shared.`,
    `If a line is a placeholder or a false positive, add the comment \`keel:allow-secret\` on that line and commit again.`,
  ].join('\n')
}

function checksDenial(stage: string, open: string[]): string {
  return [
    `keel blocked this commit: it closes stage ${stage}, but these checks were never seen ticked in \`## Now\`:`,
    ...open.slice(0, 8).map(c => `  - ${c}`),
    `Prove them (keel:verify). If they pass, put stage ${stage}'s checks back in \`## Now\` ticked, then close the stage again. If a check no longer applies, say why in the plan's decisions and drop it from \`## Now\` first.`,
  ].join('\n')
}

// ---- the evidence gate ----

/**
 * Where keel:verify writes stage n's report: `evidence/stage-<n>/report.md` beside the plan file, and under
 * `docs/` for a plan at the repo root, since verify always writes to `docs/evidence/`. Every plan path keel
 * reads (docs/PLAN.md, PLAN.md, docs/BUILD_PLAN.md) so resolves to `docs/evidence/stage-<n>/report.md`.
 */
export function evidencePath(planPath: string, stage: string): string {
  const dir = planPath.includes('/') ? planPath.slice(0, planPath.lastIndexOf('/')) : 'docs'
  return `${dir}/evidence/stage-${stage}/report.md`
}


/** A file's text when the commit adds it whole: from a new file's hunk in the diff, or an untracked file a `git add` on the line takes. */
function addedText(diff: string, files: { path: string; text: string }[], path: string): string | undefined {
  const file = files.find(f => samePath(f.path, path))
  if (file) return file.text
  const lines = diff.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]?.match(/^\+\+\+ (?:b\/)?(.+)$/)
    if (!header || !samePath(header[1] ?? '', path) || lines[i - 1] !== '--- /dev/null') continue
    const body: string[] = []
    for (let j = i + 1; j < lines.length && !lines[j]?.startsWith('diff --git '); j++) {
      const line = lines[j] ?? ''
      if (line.startsWith('+')) body.push(line.slice(1))
    }
    return body.join('\n')
  }
  return undefined
}

/** Cells of a markdown table row; an escaped `\|` stays inside its cell. Undefined for a line that isn't a row. */
function tableCells(line: string): string[] | undefined {
  const cells = line.trim().split(/(?<!\\)\|/)
  if (cells.length < 2) return undefined
  if (cells[0]?.trim() === '') cells.shift()
  if (cells.at(-1)?.trim() === '') cells.pop()
  return cells
}

/**
 * Check rows in the report's first table: its rows after the header and the `---` separator.
 * A re-run of an earlier stage's check (Check cell `Re-run of stage <k>: …`) isn't one of this stage's checks, so it doesn't count.
 */
export function reportRows(text: string): number {
  const lines = text.split('\n')
  const separator = (line: string) => !!tableCells(line)?.every(c => /^\s*:?-+:?\s*$/.test(c))
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!tableCells(lines[i] ?? '') || !separator(lines[i + 1] ?? '')) continue
    let rows = 0
    for (let j = i + 2; j < lines.length; j++) {
      const cells = tableCells(lines[j] ?? '')
      if (!cells) break
      if (!cells[0]?.trim().startsWith('Re-run of stage')) rows++
    }
    return rows
  }
  return 0
}

/** Why stage n can't close for want of evidence, or undefined when its report is there with a row per check. */
async function evidenceDenial(
  $: EngineInterface,
  planPath: string,
  stage: string,
  checks: number | undefined,
  pending: { diff: string; files: { path: string; text: string }[] },
): Promise<string | undefined> {
  const path = evidencePath(planPath, stage)
  // a report that can't be read (a directory, a permissions error) counts as missing, never as a pass or a reason to step aside
  const onDisk = async () => ((await $.fs.exists(path)) ? await $.fs.read(path) : undefined)
  const text = addedText(pending.diff, pending.files, path) ?? (await onDisk().catch(() => undefined))
  const backfill = `Run keel:verify for stage ${stage}, which writes the report; for a stage verified before keel 0.5.0, backfill the report in keel:verify's format from the evidence at hand. Then close the stage again.`
  if (typeof text !== 'string')
    return [`keel blocked this commit: it closes stage ${stage}, but its evidence report \`${path}\` is neither in the commit nor in the working tree.`, backfill].join('\n')
  const want = Math.max(checks ?? 0, 1)
  const rows = reportRows(text)
  if (rows >= want) return undefined
  return [
    `keel blocked this commit: it closes stage ${stage}, but \`${path}\` has ${rows} check row${rows === 1 ? '' : 's'} in its table and the stage has ${checks ? `${checks} check${checks === 1 ? '' : 's'} in \`## Now\`` : 'to have at least one'}.`,
    `Give each check a row in the report's first table.`,
    backfill,
  ].join('\n')
}

/**
 * Stage n's checks as the committed plan lists them, for a session that never saw stage n in `## Now`
 * (a fresh session after `## Now` moved on): only when HEAD's plan still has stage n in `## Now`.
 * Undefined when HEAD has no plan, its Now is another stage, or git can't say.
 */
async function committedChecks($: EngineInterface, planPath: string, stage: string, dir: string) {
  const text = await git($, ['show', `HEAD:${planPath}`], dir).catch(() => undefined)
  if (typeof text !== 'string') return undefined
  const now = parsePlan(planPath, text).stage
  if (now?.number !== stage || !now.checks.length) return undefined
  return { count: now.checks.length, open: now.checks.filter(c => !c.done).map(c => c.text) }
}

export const register: Register = on => {
  // the plan's current position rides in the system prompt, so it survives compaction and long runs
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const plan = await loadPlan($).catch(() => undefined)
    const s = await sync($, plan)
    $.ui.status(plan ? statusLine(plan, s) : undefined)
    if (!plan) return composed
    const now = unconfirmedWide(plan, s) && s.now !== undefined ? stampOf(s.now) : undefined
    let decisionsFile = false
    try {
      decisionsFile = await $.fs.exists(DECISIONS_PATH)
    } catch {
      // an exists check that fails adds nothing
    }
    return { sections: [...composed.sections, { id: 'keel:plan', text: planSection(plan, s, now, decisionsFile), scope: 'session' as const }] }
  })

  // tell the summarizer what must survive
  on('session.compact', async ($, e, next) => {
    if (e.agentId || e.instructions?.includes(KEEP) || !(await loadPlan($).catch(() => undefined))) return next(e)
    return next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${KEEP}` : KEEP })
  }).catch(($, e, next) => next(e))

  on('turn.start', ($, e, next) => {
    if (!e.agentId) mainTurns++
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const fromUser = USER_ORIGINS.has(e.origin.kind)
    // the person speaking up gives a stalled autopilot a fresh allowance
    if (e.origin.kind !== 'plugin') stalledTurns = 0
    lastPromptFromUser = fromUser
    if (fromUser) {
      if (/^\s*\/keel:autopilot\b/.test(e.text)) await $.state.set(ARMED, true)
      // the person spoke while a risky stage was held or paused: they have the floor, and their word clears it
      const plan = await loadPlan($).catch(() => undefined)
      const s = await readSession($)
      const stage = plan?.stage
      if (stage?.risky.length && (plan?.mode?.kind === 'paused' || driving(plan, s)) && !s.cleared.includes(stage.key))
        await $.state.set(CLEARED, [...s.cleared, stage.key])
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // autopilot: when a turn ends with stages left and nothing waiting on the person, keep the run going
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.reason !== 'answer') return result
    const plan = await loadPlan($).catch(() => undefined)
    const s = await sync($, plan)
    // redraw the band too: a stage closed mid-turn would otherwise show stale progress until the next prompt
    $.ui.status(plan ? statusLine(plan, s) : undefined)
    const mode = plan?.mode?.kind
    const was = lastMode
    lastMode = mode
    if (!plan || mode !== 'autopilot') {
      if (was !== 'autopilot') return result
      if (plan?.mode?.kind === 'paused') await $.ui.notify(`Autopilot paused: ${plan.mode.reason}`, { title: 'keel' })
      else if (plan && !plan.current) await $.ui.notify(`All ${plan.total} stages done.`, { title: 'keel' })
      return result
    }
    // a Mode line left from an earlier session (or shipped in a repo) never drives this one
    if (!s.armed || !plan.current) return result

    if (held(plan, s)) {
      if (heldNoticeFor !== plan.stage?.key) {
        heldNoticeFor = plan.stage?.key
        await $.ui.notify(`Autopilot is holding before ${plan.stage?.key}: it touches ${plan.stage?.risky.join(', ')}.`, { title: 'keel' })
      }
      return result
    }

    // builders still running in the background will start the next turn when they report
    if (await backgroundBusy($)) return result

    const progress = `${plan.done}\n${plan.now}`
    stalledTurns = progress === lastProgress ? stalledTurns + 1 : 0
    lastProgress = progress
    if (stalledTurns >= MAX_STALLED_TURNS) {
      $.ui.toast(`keel: autopilot stopped prompting; ${MAX_STALLED_TURNS} turns ended without the plan moving`)
      if (stalledTurns === MAX_STALLED_TURNS)
        await $.ui.notify('Autopilot stalled: the plan has not moved in several turns. Say "go" to resume.', { title: 'keel' })
      return result
    }

    const turn = mainTurns
    $.clock.after(SETTLE_MS, () => {
      carryOn($, plan, turn).catch(() => $.ui.toast('keel: autopilot could not prompt the next step; say "go" to resume'))
    })
    return result
  }).catch(($, e, next) => next(e))

  // starting keel:autopilot from the person's own turn arms it, including over a Mode line an earlier session left
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (!e.agentId && lastPromptFromUser && /^(?:keel:)?autopilot$/.test(e.skill)) await $.state.set(ARMED, true)
    return next(e)
  }).catch(($, e, next) => next(e))

  // a held stage: no building until the person okays it
  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Edit' && e.tool !== 'Write' && e.tool !== 'NotebookEdit' && e.tool !== 'Agent') return next(e)
    const plan = await loadPlan($)
    if (!plan || !held(plan, await sync($, plan))) return next(e)
    const target = 'file_path' in e ? String(e.file_path) : 'notebook_path' in e ? String(e.notebook_path) : ''
    if (target && samePath(target, plan.path)) return next(e)
    return {
      deny: `keel autopilot is holding ${plan.stage?.key}: its risk line names ${plan.stage?.risky.join(', ')}, so it isn't built without the user's word. Commit what's finished, set the Mode line to \`paused — <reason>\`, and ask the user.`,
    }
  }).catch(($, e, next) => next(e))

  // lean runs one agent at a time: the main loop starts no agent while one it started is still working, and an agent starts none of its own
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.agentId) {
      const plan = await loadPlan($)
      if (effectiveAgents(plan, undefined) !== 'lean') return next(e)
      // a subagent starting a child would make two running agents
      return { deny: "keel: the plan's Agents line is lean, which allows one agent at a time, and you are that agent: do this work yourself rather than starting another." }
    }
    // counted before the first await: parallel calls in one message all find the agent list empty, so the count
    // of calls already in flight is what tells the second one that the first is starting
    const before = agentCallsInFlight++
    // released once: when the call settles, or when its dispatch is abandoned (an interrupt, a hook above settling
    // first), so a next(e) that never settles can't hold the slot and refuse every later call
    let held = true
    const release = () => {
      if (!held) return
      held = false
      agentCallsInFlight--
      next.signal.removeEventListener('abort', release)
    }
    next.signal.addEventListener('abort', release)
    if (next.signal.aborted) release()
    try {
      const plan = await loadPlan($)
      if (effectiveAgents(plan, undefined) !== 'lean') return await next(e)
      if (before === 0 && !(await backgroundBusy($))) return await next(e)
      return {
        deny: "keel: the plan's Agents line is lean, which allows one agent at a time, and one is still running. Wait for it to finish (a background agent's report starts the next turn), or ask the user to change the Agents line.",
      }
    } finally {
      release()
    }
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!/\bgit\b|\b(gh|npm|pnpm|yarn|bun|cargo|twine|gem|poetry|uv|docker|podman|vercel|netlify|fly|flyctl|firebase|serverless|sls|wrangler|railway|cdk|terraform|tofu|pulumi|kubectl|helm|gcloud|az|aws|curl)\b/.test(e.command))
      return next(e)
    const commands = parseCommands(e.command)
    const plan = await loadPlan($).catch(() => undefined)
    const s = await sync($, plan)

    // while autopilot drives, outward-facing steps wait for the person
    if (driving(plan, s)) {
      const reason = commands.map(outwardReason).find(Boolean)
      if (reason)
        return {
          deny: `keel autopilot holds outward-facing steps for the user (${reason}). Commit what's finished, set the Mode line to \`paused — <what you want to run and why>\`, and ask the user.`,
        }
    }

    const commits = commands.flatMap((c, i) => {
      const call = gitCall(c)
      return call?.sub === 'commit' && !commitScope(call).dryRun ? [i] : []
    })
    if (!commits.length) return next(e)

    const root = await $.session.cwd().catch(() => '.')
    // every commit on the line is scanned for secrets before any stage gate runs, so nothing a gate does can skip a scan
    const pendings = []
    for (const at of commits) {
      const pending = await pendingChanges($, root, commands, at)
      const found = findSecrets(pending.diff, pending.files)
      if (found.length) return { deny: secretDenial(found) }
      pendings.push(pending)
    }
    if (plan)
      for (const pending of pendings)
        for (const n of closedStages(pending.diff, plan.path)) {
          // a session that never saw stage n in `## Now` asks the committed plan for its checks
          const known = s.checkCounts[n] !== undefined || s.openChecks[n] !== undefined
          const committed = known ? undefined : await committedChecks($, plan.path, n, pending.dir).catch(() => undefined)
          const open = committed?.open ?? s.openChecks[n]
          if (open?.length) return { deny: checksDenial(n, open) }
          const missing = await evidenceDenial($, plan.path, n, committed?.count ?? s.checkCounts[n], pending)
          if (missing) return { deny: missing }
        }
    return next(e)
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    // a guard that cannot read the repository steps aside rather than block every commit
    $.ui.toast('keel: the commit check could not run on this command')
    return next(e)
  })
}
