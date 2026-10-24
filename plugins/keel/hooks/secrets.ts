/** High-confidence secret formats. Each finding names the kind, never the value. */
const PATTERNS: [kind: string, re: RegExp][] = [
  ['a private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/],
  ['an AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['an Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['an OpenAI API key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/],
  ['a Stripe live key', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/],
  ['a Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ['a Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['a database URL with a password', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]{6,}@/],
  [
    'a hard-coded credential',
    /\b(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|password|passwd)\b["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=.]{24,}["']/i,
  ],
]

/** Files that are credentials by name, whatever they hold. */
const SECRET_FILES = /(?:^|\/)(?:\.env(?:\.(?!example$|sample$|template$)[\w.-]+)?|id_(?:rsa|ed25519|ecdsa|dsa)|[\w.-]+\.(?:pem|p12|pfx|key)|credentials\.json|service-account[\w.-]*\.json)$/

const ALLOW = 'keel:allow-secret'

export interface Finding {
  file: string
  line?: number
  kind: string
}

function scanLine(text: string): string | undefined {
  if (text.includes(ALLOW)) return undefined
  return PATTERNS.find(([, re]) => re.test(text))?.[0]
}

/** Scans the added lines of a unified diff (`-U0` is enough) and whole new files. */
export function findSecrets(diff: string, files: { path: string; text: string }[] = []): Finding[] {
  const found: Finding[] = []
  const flagged = new Set<string>()
  const byName = (file: string) => {
    if (SECRET_FILES.test(file) && !flagged.has(file)) {
      flagged.add(file)
      found.push({ file, kind: 'a credentials file' })
    }
  }

  let file = ''
  let line = 0
  for (const raw of diff.split('\n')) {
    const header = raw.match(/^\+\+\+ (?:b\/)?(.+)$/)
    if (header) {
      file = header[1] ?? ''
      if (file !== '/dev/null') byName(file)
      continue
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (raw.startsWith('+')) {
      const kind = scanLine(raw.slice(1))
      if (kind) found.push({ file, line, kind })
      line++
    }
  }

  for (const f of files) {
    byName(f.path)
    f.text.split('\n').forEach((text, i) => {
      const kind = scanLine(text)
      if (kind) found.push({ file: f.path, line: i + 1, kind })
    })
  }
  return found
}
