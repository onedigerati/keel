/**
 * Project risk rules: `JBIT risk:` and `JBIT outward:` lines in a repo's `CLAUDE.md` (or `.claude/CLAUDE.md`, the other
 * place Claude Code reads project memory from) that add hold words and outward commands to JBIT's built-ins.
 *
 * They only ever add. JBIT's built-in risk words and outward check run first and unconditionally, and these lists are
 * consulted only beside or after them; there is no allow, negation or wildcard syntax, so a cloned repo's `CLAUDE.md`
 * can't loosen a guard. A line or entry that doesn't parse adds nothing, and a file that can't be read is no rules.
 *
 * Everything here runs on requests and tool calls, so it is linear and bounded: the file is stat'ed before it is read
 * (a regular file inside the working directory, at most `MAX_BYTES`), only so many characters, lines, entries and words
 * are looked at, and no pattern is ever built from the file's text: words and commands are compared literally.
 * The file is read lazily, at most once per hook call, and only while autopilot could act on it (a stage's risk line
 * under a Mode line, a Bash call while autopilot drives); the hook keeps every rule it has seen this session in session
 * state, so an edit to `CLAUDE.md` adds rules at once but removes them only for a new session.
 */
import type { EngineInterface } from 'claude-code'
import { joinPath, parseCommands, runnerless, type Command } from './shell.ts'

/** Where project rules are read from, relative to the working directory. */
export const RULE_PATHS = ['CLAUDE.md', '.claude/CLAUDE.md']

/** The largest file read at all: anything bigger, or anything but a regular file inside the working directory, has no rules. */
const MAX_BYTES = 512 * 1024
/** The most of a file looked at, in characters and lines; each line is cut before anything runs on it. */
const MAX_CHARS = 256_000
const MAX_LINES = 10_000
const LINE_MAX = 2_000
/** The most entries taken from one line, and in all (per kind, across both files). */
const LINE_ENTRIES = 64
const MAX_ENTRIES = 50
/** The longest risk word or command word, and the most words in one outward command. */
const WORD_MAX = 64
const COMMAND_WORDS = 6
/** The most of a stage's risk line searched for project words. */
const RISK_LINE_MAX = 4_000

/** A command a project names as outward-facing: its leading words, and the file that named it. */
export interface OutwardRule {
  words: string[]
  file: string
}

export interface ProjectRules {
  /** Hold words, lowercased. */
  risk: string[]
  outward: OutwardRule[]
}

export const NO_RULES: ProjectRules = Object.freeze({ risk: [], outward: [] }) as ProjectRules

/**
 * `JBIT risk:` / `JBIT outward:` at the start of a line, in any case, after blanks, a list marker (`-`, `*`, `+`, `1.`)
 * and emphasis or code marks (`**JBIT risk:**`, `` `JBIT risk:` ``). Anchored, with bounded runs that can't overlap: linear.
 * `keel` is the legacy name from before the plugin was renamed: `Keel risk:` / `Keel outward:` rules live in other
 * people's committed `CLAUDE.md` files, so they stay honoured beside the `JBIT` forms.
 */
const RULE_LINE = /^(?:[-*+][ \t]+|\d{1,9}[.)][ \t]+)?[*_`]{0,3}(?:jbit|keel)[ \t]+(risk|outward)[*_`]{0,3}[ \t]*:[*_`]{0,3}/i

/** A fence line (```` ``` ```` or `~~~`, indented or not): rule lines between fences are examples, not rules. */
const FENCE = /^[ \t]*(`{3,}|~{3,})/

/** An entry without the marks ordinary Markdown puts around it: trailing `.`, `;` or `:`, and paired `**`, `_` or backticks. */
function unmarked(entry: string): string {
  let e = entry.trim().replace(/[.;:]+$/, '').trim()
  const pair = /^([*_`]{1,3})(.*?)\1$/s.exec(e)
  if (pair) e = (pair[2] ?? '').trim().replace(/[.;:]+$/, '').trim()
  return e
}

/**
 * A risk word: starts with a letter or digit and holds only letters, digits, marks, blanks and `_ . ' & / + -`.
 * So `!auth`, `-auth`, `*`, `auth*` or a word with control or invisible characters is malformed and adds nothing.
 */
const RISK_WORD = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} _.'&/+-]*$/u

/** An outward command's words: no globs, variables, quotes left over or control characters; the first starts with a letter, digit, `.` or `/`. */
const COMMAND_WORD = /^[\p{L}\p{N}_.@/+:=,%-]+$/u
const COMMAND_HEAD = /^[\p{L}\p{N}./_]/u

/** A word character, as a whole-word match's edges see it. */
const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u

function riskWord(entry: string): string | undefined {
  const word = entry.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!word || [...word].length > WORD_MAX || !RISK_WORD.test(word)) return undefined
  return word
}

function outwardCommand(entry: string): string[] | undefined {
  const text = entry.trim()
  if (!text || text.length > WORD_MAX * COMMAND_WORDS) return undefined
  // parsed as the Bash prefilter parses a command line, so `sudo`, `env`, `VAR=1` and the like are stripped the same way;
  // anything that is not one simple command (`a; b`, `cd x`, only a prefix) is malformed
  const commands = parseCommands(text)
  const words = commands[0]?.words
  if (commands.length !== 1 || !words?.length || words.length > COMMAND_WORDS) return undefined
  if (!COMMAND_HEAD.test(words[0] ?? '') || !words.every(w => w.length <= WORD_MAX && COMMAND_WORD.test(w))) return undefined
  return words
}

/** The rules one file's text names; `file` is where they came from, for the denial message. */
export function parseProjectRules(text: string, file = 'CLAUDE.md'): ProjectRules {
  const risk = new Set<string>()
  const outward = new Map<string, OutwardRule>()
  let fence: string | undefined
  for (const raw of text.slice(0, MAX_CHARS).split('\n', MAX_LINES)) {
    if (risk.size >= MAX_ENTRIES && outward.size >= MAX_ENTRIES) break
    const cut = raw.slice(0, LINE_MAX)
    const f = FENCE.exec(cut)?.[1]
    if (f && (fence === undefined || (f[0] === fence[0] && f.length >= fence.length && !cut.trim().slice(f.length)))) {
      fence = fence === undefined ? f : undefined
      continue
    }
    if (fence !== undefined) continue
    const line = cut.trimStart()
    const m = RULE_LINE.exec(line)
    if (!m) continue
    const kind = (m[1] ?? '').toLowerCase()
    for (const part of line.slice(m[0].length).split(',', LINE_ENTRIES)) {
      const entry = unmarked(part)
      if (kind === 'risk') {
        const word = risk.size < MAX_ENTRIES ? riskWord(entry) : undefined
        if (word) risk.add(word)
      } else {
        const words = outward.size < MAX_ENTRIES ? outwardCommand(entry) : undefined
        if (words) outward.set(words.join(' '), { words, file })
      }
    }
  }
  return { risk: [...risk], outward: [...outward.values()] }
}

/** Both files' rules together, the first file's first, each entry once, within the overall caps. */
export function mergeRules(all: ProjectRules[]): ProjectRules {
  const risk = [...new Set(all.flatMap(r => r.risk))].slice(0, MAX_ENTRIES)
  const seen = new Set<string>()
  const outward = all
    .flatMap(r => r.outward)
    .filter(r => !seen.has(r.words.join(' ')) && !!seen.add(r.words.join(' ')))
    .slice(0, MAX_ENTRIES)
  return { risk, outward }
}

/**
 * Rules kept in session state, as `mergeRules` left them: anything not shaped like rules is dropped, and the caps
 * still hold, so a damaged record is at worst fewer rules.
 */
export function keptRules(value: unknown): ProjectRules {
  if (!value || typeof value !== 'object') return NO_RULES
  const { risk, outward } = value as { risk?: unknown; outward?: unknown }
  const words = Array.isArray(risk) ? risk.filter((w): w is string => typeof w === 'string' && !!riskWord(w)).slice(0, MAX_ENTRIES) : []
  const rules = Array.isArray(outward)
    ? outward
        .filter(
          (r): r is OutwardRule =>
            !!r &&
            typeof r === 'object' &&
            typeof (r as OutwardRule).file === 'string' &&
            Array.isArray((r as OutwardRule).words) &&
            (r as OutwardRule).words.length > 0 &&
            (r as OutwardRule).words.length <= COMMAND_WORDS &&
            (r as OutwardRule).words.every(w => typeof w === 'string' && w.length <= WORD_MAX),
        )
        .slice(0, MAX_ENTRIES)
    : []
  return { risk: words, outward: rules.map(r => ({ words: [...r.words], file: r.file })) }
}

const trimSep = (p: string) => p.replace(/[\\/]+$/, '')

/** Whether `real` lies under the directory `root` (both resolved), not at it. */
function inside(real: string | undefined, root: string | undefined): boolean {
  if (!real || !root) return false
  const base = trimSep(root)
  return real.startsWith(`${base}/`) || real.startsWith(`${base}\\`)
}

/**
 * The project's rules from `CLAUDE.md` and `.claude/CLAUDE.md`: each only when it is a regular file, at most `MAX_BYTES`,
 * whose real path lies inside the working directory (a link out of the repo counts as no file). Any error is no rules
 * from that file, never a blocked request or tool call.
 */
export async function loadProjectRules($: EngineInterface): Promise<ProjectRules> {
  const found: ProjectRules[] = []
  let root: string | undefined | null = null
  for (const path of RULE_PATHS) {
    try {
      if (!(await $.fs.exists(path))) continue
      // the working directory resolved the same way, so a repo reached through a link still holds its own files
      if (root === null) root = await $.session.cwd().then(cwd => $.fs.stat(cwd, { resolve: true })).then(s => s.realPath, () => undefined)
      const stat = await $.fs.stat(path, { resolve: true })
      const real = stat.realPath
      if (stat.kind !== 'file' || !(stat.size <= MAX_BYTES) || !real || !inside(real, root)) continue
      // the file the checks passed for, not whatever the path names by now; and still within the cap once read
      const text = await $.fs.read(real)
      if (typeof text === 'string' && text.length <= MAX_BYTES) found.push(parseProjectRules(text, path))
    } catch {
      // unreadable: no rules from this file
    }
  }
  return found.length ? mergeRules(found) : NO_RULES
}

/**
 * The project words a stage's risk line names, as whole words matched literally and in any case: `pci` matches
 * `PCI, user input` but not `pcie`. A word that begins or ends with a non-word character (`c++`) has no edge to check there.
 * A word ending in a letter also matches with `s` or `es` after it. Bounded: at most `RISK_LINE_MAX` characters searched
 * for at most `MAX_ENTRIES` words of at most `WORD_MAX` characters.
 */
export function projectRisky(riskLine: string, words: string[]): string[] {
  if (!words.length || !riskLine) return []
  const line = riskLine.slice(0, RISK_LINE_MAX).toLowerCase()
  const isWord = (c: string | undefined) => c !== undefined && WORD_CHAR.test(c)
  const named: string[] = []
  for (const word of words.slice(0, MAX_ENTRIES)) {
    const first = word.slice(0, 1)
    const last = word.slice(-1)
    // a plural counts too: `payment card` holds `payment cards`, `tax` holds `taxes`
    const plural = /\p{L}/u.test(last)
    for (let at = line.indexOf(word); at >= 0; at = line.indexOf(word, at + 1)) {
      const before = at > 0 ? line[at - 1] : undefined
      if (isWord(first) && isWord(before)) continue
      const end = at + word.length
      const ends = [end]
      if (plural && line[end] === 's') ends.push(end + 1)
      if (plural && line[end] === 'e' && line[end + 1] === 's') ends.push(end + 2)
      if (isWord(last) && ends.every(e => isWord(line[e]))) continue
      named.push(word)
      break
    }
  }
  return named
}

/** The command's head as a bare name, as the built-in check reads it (`/usr/local/bin/fly` is `fly`). */
const base = (w: string) => w.split('/').pop() ?? w

/** A path as the repo sees it: joined to the directory it's used in, and relative to `root` when it lies under it. */
function repoPath(path: string, dir: string, root: string | undefined): string {
  const joined = joinPath(dir, path)
  const r = root?.replace(/\/+$/, '')
  if (r && joined.startsWith(`${r}/`)) return joined.slice(r.length + 1)
  return joined === r ? '.' : joined
}

/**
 * Whether a command's head is a rule's: a bare rule name matches the command by its bare name; a rule naming a path
 * matches the same file, both sides taken against the repo root (`./scripts/ship.sh`, `scripts/ship.sh`,
 * `/repo/scripts/ship.sh` and `cd scripts && ./ship.sh` are one file). A bare command name is a PATH lookup, not a
 * project file. Where the command's directory is unknown, the path it names is matched against the rule's end.
 */
function sameHead(rule: string, head: string, dir: string | null, root: string | undefined): boolean {
  if (!rule.includes('/')) return head === rule || base(head) === rule
  if (!head.includes('/')) return false
  const want = repoPath(rule, '.', root)
  if (dir !== null || head.startsWith('/')) return repoPath(head, dir ?? '.', root) === want
  const tail = joinPath('.', head)
  return want === tail || want.endsWith(`/${tail}`)
}

/** A word a command's options are made of: `-x`, `--x`, `--x=v`, `VAR=v`. */
const OPTION = /^-./
const SETTING = /^[A-Za-z_][A-Za-z0-9_]*=/
/** An option that may take the next word as its value: `-C dir`, `-j 4`, `--file x`. */
const TAKES_VALUE = /^(?:-[A-Za-z]|--[^=]+)$/

/**
 * The project rule a simple command (already split and stripped of `sudo`, `env` and the like by `parseCommands`)
 * matches: its head is the rule's first word (see `sameHead`), and the rule's other words follow in order, with the
 * command's options, `VAR=value` settings and an option's value allowed between them (`make -C . -j4 VERSION=1 release`
 * is `make release`; `make test release` is not). Package runners (`npx --yes x`, `pnpm dlx x`) are looked through on
 * both sides. `root` is the repo root, for rules that name a path.
 */
export function projectOutward(rules: ProjectRules, cmd: Command, root?: string): OutwardRule | undefined {
  // a command built at run time (`$c`, `"$(…)"/ship.sh`) matches a rule whose command the line names elsewhere
  if (cmd.dynamic) {
    const named = cmd.mentions ?? []
    return rules.outward.find(r => [r.words[0], runnerless(r.words)[0]].some(h => h !== undefined && named.includes(base(h))))
  }
  if (cmd.opaque) return undefined
  const words = runnerless(cmd.words)
  return rules.outward.find(r => {
    const want = runnerless(r.words)
    if (!words.length || !sameHead(want[0] ?? '', words[0] ?? '', cmd.dir, root)) return false
    let i = 1
    let value = false
    for (const w of want.slice(1)) {
      for (;;) {
        const c = words[i++]
        if (c === undefined) return false
        if (c === w) break
        if (OPTION.test(c)) value = TAKES_VALUE.test(c)
        else if (SETTING.test(c)) value = false
        else if (value) value = false
        else return false
      }
      value = false
    }
    return true
  })
}
