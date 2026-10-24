import type { EngineInterface, Register } from 'claude-code'
import { findSecrets, type Finding } from './secrets.ts'

/** Where a project's plan can live; the first that exists wins. */
const PLAN_PATHS = ['docs/PLAN.md', 'PLAN.md', 'docs/BUILD_PLAN.md']

/** The most of the plan's "Now" section that rides in every request. */
const NOW_MAX_LINES = 40

interface Plan {
  path: string
  now: string | undefined
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

  const stageKey = [...sections.keys()].find(k => k.includes('stage'))
  const stages = (sections.get(stageKey ?? '') ?? []).filter(l => /^[-*]\s+\[[ xX]\]/.test(l))
  const open = stages.find(l => /^[-*]\s+\[ \]/.test(l))
  const current = open
    ?.replace(/^[-*]\s+\[ \]\s*/, '')
    .replace(/\*\*/g, '')
    .split(/\s+[—–-]\s+/)[0]
    ?.trim()

  return { path, now, done: stages.length - stages.filter(l => /\[ \]/.test(l)).length, total: stages.length, current }
}

function statusLine(plan: Plan): string {
  if (plan.total === 0) return `keel · ${plan.path}`
  if (!plan.current) return `keel · all ${plan.total} stages done`
  return `keel · ${plan.done}/${plan.total} done · next: ${plan.current}`
}

function planSection(plan: Plan): string {
  const position = plan.now ?? (plan.current ? `Next stage: ${plan.current}` : 'No open stage in the plan.')
  return [
    `# Keel`,
    `This project keeps its plan in \`${plan.path}\`: the source of truth for goal, decisions and stages. Reread it before acting on anything it covers, and update it in the same change when a decision or stage changes. Subagents: treat this as background and stay inside your brief.`,
    ``,
    `Current position (from the plan):`,
    position,
    ``,
    `Working rules: build in stages; a stage is done only when its acceptance checks pass against the running product and the test suite is green; tests accompany risky logic (money, dates, parsing, permissions); stages marked risky get a security review; commit per stage and stop for the user's review. The keel skills (plan, stage, verify, review, resume) hold the details.`,
  ].join('\n')
}

/** `git commit` anywhere in a shell command line, including `git -C dir commit`. */
const COMMIT = /\bgit\b(?:\s+-[cC]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+commit\b/
/** The command also stages files as it commits. */
const STAGES_TOO = /\bgit\b[^;&|\n]*\s(add|commit\s+[^;&|\n]*(-a\b|-am\b|--all\b))/

async function git($: EngineInterface, args: string[]) {
  const r = await $.process.run(['git', ...args])
  if (r.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.slice(0, 200)}`)
  return r.stdout
}

/** Everything the commit could carry: the staged diff, plus unstaged and new files when the command stages them itself. */
async function pendingChanges($: EngineInterface, command: string) {
  const diffs = [await git($, ['diff', '--cached', '-U0', '--no-color', '--no-ext-diff'])]
  const files: { path: string; text: string }[] = []
  if (STAGES_TOO.test(command)) {
    diffs.push(await git($, ['diff', '-U0', '--no-color', '--no-ext-diff']))
    const untracked = (await git($, ['ls-files', '--others', '--exclude-standard'])).split('\n').filter(Boolean)
    for (const path of untracked.slice(0, 500)) {
      const text = await $.fs.read(path).catch(() => undefined)
      if (typeof text === 'string' && !text.includes('\u0000')) files.push({ path, text })
    }
  }
  return { diff: diffs.join('\n'), files }
}

function denial(found: Finding[]): string {
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

export const register: Register = on => {
  // the plan's current position rides in the system prompt, so it survives compaction and long runs
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const plan = await loadPlan($).catch(() => undefined)
    $.ui.status(plan ? statusLine(plan) : undefined)
    if (!plan) return composed
    return { sections: [...composed.sections, { id: 'keel:plan', text: planSection(plan), scope: 'session' as const }] }
  })

  // tell the summarizer what must survive
  on('session.compact', async ($, e, next) => {
    if (e.agentId || !(await loadPlan($).catch(() => undefined))) return next(e)
    const keep =
      'Keep the project-plan state exactly: the active stage, its acceptance checks and which have passed, decisions made since the plan file was last updated, and any uncommitted work in progress with its file paths.'
    return next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${keep}` : keep })
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!COMMIT.test(e.command)) return next(e)
    const { diff, files } = await pendingChanges($, e.command)
    const found = findSecrets(diff, files)
    return found.length ? { deny: denial(found) } : next(e)
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    // a guard that cannot read the repository steps aside rather than block every commit
    $.ui.toast('keel: the secret check could not run on this commit')
    return next(e)
  })
}
