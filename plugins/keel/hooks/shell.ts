/**
 * Just enough shell parsing to tell what a Bash command line will do to git and the outside world:
 * words with quotes and escapes, command separators, `cd`, heredoc bodies and redirections.
 */

/** One simple command: its words, and the directory it runs in (relative to the session's, `null` if unknowable). */
export interface Command {
  words: string[]
  dir: string | null
}

/** Splits a command line into simple commands, following `cd` so each knows where it runs. */
export function parseCommands(line: string): Command[] {
  const commands: Command[] = []
  let dir: string | null = '.'
  for (const words of splitWords(line)) {
    const w = stripPrefixes(words)
    if (!w.length) continue
    if (w[0] === 'cd' || w[0] === 'pushd') {
      const target = w.slice(1).find(a => !a.startsWith('-'))
      dir = target === undefined || target.startsWith('~') || target === '-' ? null : dir === null ? null : joinPath(dir, target)
      continue
    }
    commands.push({ words: w, dir })
  }
  return commands
}

/** `a/b` + `../c` → `a/c`; an absolute right side wins. */
export function joinPath(base: string, rel: string): string {
  const absolute = rel.startsWith('/') || (base.startsWith('/') && !rel.startsWith('/'))
  const parts: string[] = []
  for (const p of [...(rel.startsWith('/') ? [] : base.split('/')), ...rel.split('/')]) {
    if (p === '' || p === '.') continue
    if (p === '..' && parts.length && parts[parts.length - 1] !== '..') parts.pop()
    else if (p !== '..' || !absolute) parts.push(p)
  }
  return absolute ? `/${parts.join('/')}` : parts.join('/') || '.'
}

const PREFIXES = new Set(['sudo', 'command', 'env', 'time', 'nohup', 'exec', 'nice', 'builtin'])

/** Drops leading `VAR=value` assignments and wrappers such as `sudo` or `env`. */
function stripPrefixes(words: string[]): string[] {
  let i = 0
  while (i < words.length) {
    const w = words[i] ?? ''
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || PREFIXES.has(w)) i++
    else if (w.startsWith('-') && i > 0 && PREFIXES.has(words[i - 1] ?? '')) i++
    else break
  }
  return words.slice(i)
}

/** Tokenizes into simple commands. Quotes, `\`, `$(…)`, comments, redirections and heredoc bodies are handled; globs and variables are left as written. */
function splitWords(line: string): string[][] {
  const out: string[][] = []
  let cmd: string[] = []
  let word = ''
  let inWord = false
  let dropNext = false
  const heredocs: { tag: string; strip: boolean }[] = []

  const endWord = () => {
    if (inWord) {
      if (dropNext) dropNext = false
      else cmd.push(word)
    }
    word = ''
    inWord = false
  }
  const endCommand = () => {
    endWord()
    if (cmd.length) out.push(cmd)
    cmd = []
  }

  let i = 0
  while (i < line.length) {
    const c = line[i] ?? ''
    if (c === '\n') {
      endCommand()
      i++
      // skip heredoc bodies that start after this newline
      while (heredocs.length) {
        const { tag, strip } = heredocs.shift()!
        while (i < line.length) {
          const end = line.indexOf('\n', i)
          const row = line.slice(i, end === -1 ? line.length : end)
          i = end === -1 ? line.length : end + 1
          if ((strip ? row.replace(/^\t+/, '') : row) === tag) break
        }
      }
      continue
    }
    if (c === ' ' || c === '\t') {
      endWord()
      i++
      continue
    }
    if (c === '#' && !inWord) {
      while (i < line.length && line[i] !== '\n') i++
      continue
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')') {
      endCommand()
      i++
      continue
    }
    if (c === '<' && line[i + 1] === '<' && line[i + 2] !== '<') {
      // heredoc: remember its delimiter, drop it from the words
      endWord()
      i += 2
      const strip = line[i] === '-'
      if (strip) i++
      while (line[i] === ' ' || line[i] === '\t') i++
      let tag = ''
      while (i < line.length && !/[\s;&|()<>]/.test(line[i] ?? '')) {
        const ch = line[i] ?? ''
        if (ch !== "'" && ch !== '"' && ch !== '\\') tag += ch
        i++
      }
      if (tag) heredocs.push({ tag, strip })
      continue
    }
    if (c === '<' || c === '>') {
      // a redirection: drop a bare fd number before it, the operator, and its target
      if (inWord && /^\d+$/.test(word)) {
        word = ''
        inWord = false
      } else endWord()
      i++
      while (line[i] === '>' || line[i] === '<' || line[i] === '|') i++
      if (line[i] === '&') {
        i++
        while (/\d|-/.test(line[i] ?? '')) i++
        continue
      }
      dropNext = true
      continue
    }
    inWord = true
    if (c === '\\') {
      word += line[i + 1] ?? ''
      i += 2
      continue
    }
    if (c === "'") {
      const end = line.indexOf("'", i + 1)
      word += line.slice(i + 1, end === -1 ? line.length : end)
      i = end === -1 ? line.length : end + 1
      continue
    }
    if (c === '"') {
      i++
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && /["\\$`\n]/.test(line[i + 1] ?? '')) {
          word += line[i + 1]
          i += 2
        } else word += line[i++]
      }
      i++
      continue
    }
    if (c === '$' && line[i + 1] === '(') {
      // command substitution stays inside the word it belongs to
      let depth = 0
      const start = i
      do {
        if (line[i] === '(') depth++
        else if (line[i] === ')') depth--
        i++
      } while (i < line.length && depth > 0)
      word += line.slice(start, i)
      continue
    }
    word += c
    i++
  }
  endCommand()
  return out
}

/** A `git` invocation: the directory it acts on (after `-C`), its subcommand and that subcommand's arguments. */
export interface GitCall {
  dir: string | null
  sub: string
  args: string[]
}

const GIT_VALUE_OPTS = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--exec-path'])

export function gitCall(cmd: Command): GitCall | undefined {
  const [head, ...rest] = cmd.words
  if (head !== 'git' && !head?.endsWith('/git')) return undefined
  let dir = cmd.dir
  let i = 0
  while (i < rest.length) {
    const a = rest[i] ?? ''
    if (a === '-C') {
      const target = rest[i + 1] ?? '.'
      dir = dir === null ? null : joinPath(dir, target)
      i += 2
    } else if (GIT_VALUE_OPTS.has(a)) i += 2
    else if (a.startsWith('-')) i++
    else break
  }
  const sub = rest[i]
  return sub ? { dir, sub, args: rest.slice(i + 1) } : undefined
}

/** What a commit takes beyond the index: every tracked change (`-a`), or the named paths' working-tree content. */
export interface CommitScope {
  dir: string | null
  all: boolean
  paths: string[]
  dryRun: boolean
}

const COMMIT_SHORT_VALUE = new Set(['m', 'F', 'C', 'c', 't'])
const COMMIT_LONG_VALUE = new Set([
  '--message', '--file', '--author', '--date', '--template', '--reuse-message', '--reedit-message',
  '--fixup', '--squash', '--cleanup', '--trailer', '--gpg-sign',
])

export function commitScope(call: GitCall): CommitScope {
  const scope: CommitScope = { dir: call.dir, all: false, paths: [], dryRun: false }
  const args = call.args
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? ''
    if (a === '--') {
      scope.paths.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const name = a.split('=')[0] ?? a
      if (name === '--all') scope.all = true
      else if (name === '--dry-run') scope.dryRun = true
      else if (name === '--pathspec-from-file' || name === '--interactive' || name === '--patch') scope.all = true
      else if (COMMIT_LONG_VALUE.has(name) && !a.includes('=') && name !== '--gpg-sign') i++
      continue
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j] ?? ''
        if (f === 'a') scope.all = true
        if (f === 'p') scope.all = true
        if (COMMIT_SHORT_VALUE.has(f)) {
          if (j === a.length - 1) i++
          break
        }
      }
      continue
    }
    scope.paths.push(a)
  }
  return scope
}

/** What a `git add` (or `git stage`) stages: paths, whether untracked and ignored files come along. */
export interface AddScope {
  dir: string | null
  paths: string[]
  untracked: boolean
  ignored: boolean
}

export function addScope(call: GitCall): AddScope | undefined {
  if (call.sub !== 'add' && call.sub !== 'stage') return undefined
  const scope: AddScope = { dir: call.dir, paths: [], untracked: true, ignored: false }
  let every = false
  for (let i = 0; i < call.args.length; i++) {
    const a = call.args[i] ?? ''
    if (a === '--') {
      scope.paths.push(...call.args.slice(i + 1))
      break
    }
    if (a === '-A' || a === '--all' || a === '--no-ignore-removal') every = true
    else if (a === '-u' || a === '--update') {
      every = true
      scope.untracked = false
    } else if (a === '-f' || a === '--force') scope.ignored = true
    else if (a === '--chmod' || a === '--pathspec-from-file') i++
    else if (a.startsWith('-')) continue
    else scope.paths.push(a)
  }
  if (!scope.paths.length && every) scope.paths.push('.')
  if (scope.paths.includes('--pathspec-from-file')) scope.paths = ['.']
  return scope.paths.length ? scope : undefined
}

const LOCAL_HOST = /^(?:https?:\/\/)?(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|[\w-]+\.localhost)(?::\d+)?(?:\/|$)/i

/** Why a command reaches outside the machine or is hard to undo, or undefined. Not exhaustive: the common publish, deploy and push paths. */
export function outwardReason(cmd: Command): string | undefined {
  const [head = '', ...args] = cmd.words
  const tool = head.split('/').pop() ?? head
  const sub = args.find(a => !a.startsWith('-'))
  const has = (...words: string[]) => args.some(a => words.includes(a))

  const git = gitCall(cmd)
  if (git?.sub === 'push') return 'git push'

  switch (tool) {
    case 'gh': {
      const [noun, verb] = args.filter(a => !a.startsWith('-'))
      if (noun === 'api') {
        const method = args.find((a, i) => args[i - 1] === '-X' || args[i - 1] === '--method') ?? (has('-f', '-F', '--field', '--raw-field', '--input') ? 'POST' : 'GET')
        return method.toUpperCase() === 'GET' ? undefined : `gh api ${method.toUpperCase()}`
      }
      const writes: Record<string, string[]> = {
        pr: ['create', 'merge', 'close', 'comment', 'review', 'edit', 'ready', 'reopen'],
        issue: ['create', 'comment', 'close', 'edit', 'delete', 'reopen', 'transfer'],
        release: ['create', 'upload', 'delete', 'edit'],
        repo: ['create', 'delete', 'edit', 'rename', 'archive', 'fork'],
        workflow: ['run', 'enable', 'disable'],
        secret: ['set', 'delete'],
        variable: ['set', 'delete'],
      }
      return noun && verb && writes[noun]?.includes(verb) ? `gh ${noun} ${verb}` : undefined
    }
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun':
      return sub === 'publish' || sub === 'unpublish' || sub === 'deprecate' ? `${tool} ${sub}` : undefined
    case 'cargo':
      return sub === 'publish' || sub === 'yank' ? `cargo ${sub}` : undefined
    case 'twine':
      return sub === 'upload' ? 'twine upload' : undefined
    case 'gem':
      return sub === 'push' ? 'gem push' : undefined
    case 'poetry':
    case 'uv':
      return sub === 'publish' ? `${tool} publish` : undefined
    case 'docker':
    case 'podman':
      return sub === 'push' ? `${tool} push` : undefined
    case 'vercel': {
      const local = ['dev', 'env', 'login', 'logout', 'link', 'pull', 'build', 'whoami', 'ls', 'list', 'inspect', 'logs', 'help']
      return !sub || sub === 'deploy' || has('--prod') || !local.includes(sub) ? 'vercel deploy' : undefined
    }
    case 'netlify':
    case 'fly':
    case 'flyctl':
    case 'firebase':
    case 'serverless':
    case 'sls':
      return sub === 'deploy' ? `${tool} deploy` : undefined
    case 'wrangler':
      return sub === 'deploy' || sub === 'publish' ? `wrangler ${sub}` : undefined
    case 'railway':
      return sub === 'up' ? 'railway up' : undefined
    case 'cdk':
      return sub === 'deploy' || sub === 'destroy' ? `cdk ${sub}` : undefined
    case 'terraform':
    case 'tofu':
      return sub === 'apply' || sub === 'destroy' || sub === 'import' ? `${tool} ${sub}` : undefined
    case 'pulumi':
      return sub === 'up' || sub === 'destroy' || sub === 'update' ? `pulumi ${sub}` : undefined
    case 'kubectl':
      return sub && ['apply', 'delete', 'create', 'replace', 'patch', 'scale', 'rollout', 'set', 'edit', 'drain'].includes(sub) ? `kubectl ${sub}` : undefined
    case 'helm':
      return sub && ['install', 'upgrade', 'uninstall', 'delete', 'rollback'].includes(sub) ? `helm ${sub}` : undefined
    case 'gcloud':
    case 'az':
      return has('deploy', 'delete') ? `${tool} ${args.includes('deploy') ? 'deploy' : 'delete'}` : undefined
    case 'aws':
      if (args[0] === 's3' && ['cp', 'sync', 'mv', 'rm', 'rb'].includes(args[1] ?? '')) return `aws s3 ${args[1]}`
      return args.some(a => /^(deploy|delete-|update-function-code|put-|create-|terminate-)/.test(a)) ? 'aws write' : undefined
    case 'curl': {
      const sends = args.some((a, i) =>
        ['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '-F', '--form', '-T', '--upload-file', '--json'].includes(a) ||
        a.startsWith('--data') ||
        ((args[i - 1] === '-X' || args[i - 1] === '--request') && a.toUpperCase() !== 'GET' && a.toUpperCase() !== 'HEAD'),
      )
      const url = args.find(a => /^https?:\/\//i.test(a))
      return sends && url && !LOCAL_HOST.test(url) ? 'a request that sends data to an outside service' : undefined
    }
  }
  return undefined
}
