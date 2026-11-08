/**
 * Project risk rules: `Keel risk:` and `Keel outward:` lines in a repo's `CLAUDE.md` (or `.claude/CLAUDE.md`, the other
 * place Claude Code reads project memory from) that add hold words and outward commands to Keel's built-ins.
 *
 * They only ever add. Keel's built-in risk words and outward check run first and unconditionally, and these lists are
 * consulted only beside or after them; there is no allow, negation or wildcard syntax, so a cloned repo's `CLAUDE.md`
 * can't loosen a guard. A line or entry that doesn't parse adds nothing, and a file that can't be read is no rules.
 *
 * Everything here runs on requests and tool calls, so it is linear and bounded: the file is stat'ed before it is read
 * (a regular file inside the working directory, at most `MAX_BYTES`), only so many characters, lines, entries and words
 * are looked at, and no pattern is ever built from the file's text: words and commands are compared literally.
 * Rules are read lazily and at most once per hook call (only when a stage's risk line could hold, or a Bash call
 * could be denied), with no cache across calls, so an edit to `CLAUDE.md` counts at once.
 */
import type { EngineInterface } from 'claude-code'
import { parseCommands, type Command } from './shell.ts'

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

/** `Keel risk:` / `Keel outward:` at the start of a line (after blanks), in any case. Anchored, with no overlapping repeats: linear. */
const RULE_LINE = /^keel[ \t]+(risk|outward)[ \t]*:/i

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
  for (const raw of text.slice(0, MAX_CHARS).split('\n', MAX_LINES)) {
    if (risk.size >= MAX_ENTRIES && outward.size >= MAX_ENTRIES) break
    const line = raw.slice(0, LINE_MAX).trimStart()
    const m = RULE_LINE.exec(line)
    if (!m) continue
    const kind = (m[1] ?? '').toLowerCase()
    for (const entry of line.slice(m[0].length).split(',', LINE_ENTRIES)) {
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
      if (stat.kind !== 'file' || !(stat.size <= MAX_BYTES) || !inside(stat.realPath, root)) continue
      const text = await $.fs.read(path)
      if (typeof text === 'string') found.push(parseProjectRules(text, path))
    } catch {
      // unreadable: no rules from this file
    }
  }
  return found.length ? mergeRules(found) : NO_RULES
}

/**
 * The project words a stage's risk line names, as whole words matched literally and in any case: `pci` matches
 * `PCI, user input` but not `pcie`. A word that begins or ends with a non-word character (`c++`) has no edge to check there.
 * Bounded: at most `RISK_LINE_MAX` characters searched for at most `MAX_ENTRIES` words of at most `WORD_MAX` characters.
 */
export function projectRisky(riskLine: string, words: string[]): string[] {
  if (!words.length || !riskLine) return []
  const line = riskLine.slice(0, RISK_LINE_MAX).toLowerCase()
  const isWord = (c: string | undefined) => c !== undefined && WORD_CHAR.test(c)
  const named: string[] = []
  for (const word of words.slice(0, MAX_ENTRIES)) {
    const first = word.slice(0, 1)
    const last = word.slice(-1)
    for (let at = line.indexOf(word); at >= 0; at = line.indexOf(word, at + 1)) {
      const before = at > 0 ? line[at - 1] : undefined
      const after = line[at + word.length]
      if ((isWord(first) && isWord(before)) || (isWord(last) && isWord(after))) continue
      named.push(word)
      break
    }
  }
  return named
}

/** The command's head as a bare name, as the built-in check reads it (`/usr/local/bin/fly` is `fly`). */
const base = (w: string) => w.split('/').pop() ?? w

/**
 * The project rule a simple command (already split and stripped of `sudo`, `env` and the like by `parseCommands`)
 * matches: its leading words are exactly the rule's words, the first compared by its bare name unless the rule
 * names a path. Flags or other words between them don't match (`fly -a x deploy` is not `fly deploy`).
 */
export function projectOutward(rules: ProjectRules, cmd: Command): OutwardRule | undefined {
  return rules.outward.find(
    r =>
      r.words.length <= cmd.words.length &&
      r.words.every((w, i) => {
        const c = cmd.words[i] ?? ''
        return i === 0 && !w.includes('/') ? c === w || base(c) === w : c === w
      }),
  )
}
