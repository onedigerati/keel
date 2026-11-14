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
  // header and payload are base64url JSON objects (`{"` encodes as `eyJ`); lengths keep `eyJ…` stubs and doc examples out.
  // It may follow a non-word character, a percent-encoded space or quote (`%20`, `%22`) or a JSON-escaped `\n`.
  ['a JWT', /(?:(?<![\w-])|(?<=%2[02])|(?<=\\n))eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}/],
  // shapes as gitleaks has them: personal, pipeline trigger, deploy, runner, CI/CD job and OAuth app secret
  [
    'a GitLab token',
    /\b(?:glpat-[A-Za-z0-9_-]{20,}|glptt-[0-9a-f]{40}|gldt-[A-Za-z0-9_-]{20,}|glrt-[A-Za-z0-9_-]{20,}|glcbt-[A-Za-z0-9]{1,5}_[A-Za-z0-9_-]{20,}|gloas-[A-Za-z0-9_-]{64})/,
  ],
  ['an npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
  // the prefix is the base64 macaroon header naming pypi.org (or test.pypi.org)
  ['a PyPI token', /\bpypi-AgE(?:IcHlwaS5vcmc|NdGVzdC5weXBpLm9yZw)[A-Za-z0-9_-]{50,}/],
  ['a SendGrid API key', /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}(?![\w-])/],
  // 20+ token characters with a digit and a letter, after `Bearer ` or `Bearer%20`: `${token}`, `$TOKEN`, `{{token}}`,
  // `<token>`, `[masked]` and all-letter placeholders (`YOUR_ACCESS_TOKEN_HERE`) don't qualify, nor lowercase words and
  // digits joined by `-` or `_` with no part over 12 characters (`token-based-auth-flow-v2`, `expired-token-1234567890`)
  [
    'a bearer token',
    /\b(?:[Bb]earer|BEARER)(?:\s+|%20)(?!(?:[a-z0-9]{1,12}[-_])+[a-z0-9]{1,12}(?![A-Za-z0-9._~+/=-]))(?=[A-Za-z0-9._~+/-]*\d)(?=[A-Za-z0-9._~+/-]*[A-Za-z])[A-Za-z0-9._~+/-]{20,}=*(?![\w$}])/,
  ],
  ['a database URL with a password', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]{6,}@/],
  [
    'a hard-coded credential',
    /\b(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|password|passwd)\b["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=.]{24,}["']/i,
  ],
]

/** Files that are credentials by name, whatever they hold. */
const SECRET_FILES = /(?:^|\/)(?:\.env(?:\.(?!example$|sample$|template$)[\w.-]+)?|id_(?:rsa|ed25519|ecdsa|dsa)|[\w.-]+\.(?:pem|p12|pfx|key)|credentials\.json|service-account[\w.-]*\.json)$/

/**
 * The comment that exempts a line from the scan, matched case-sensitively anywhere on the line. `keel:allow-secret` is the
 * legacy form from before the plugin was renamed: it lives in other people's committed files, so it stays honoured.
 */
const ALLOW = ['jbit:allow-secret', 'keel:allow-secret'] as const

export interface Finding {
  file: string
  line?: number
  kind: string
}

/** Verify's evidence folder, at any depth and any case, live or archived: `docs/evidence/…`, `docs/plans/<name>/evidence/…`. */
const EVIDENCE = /(?:^|\/)docs\/(?:plans\/[^/]+\/)?evidence\//i

/**
 * A credential header as written in curl output, HTTP dumps, `-H "Cookie: …"`, JSON (escaped too: `\"Cookie\":`) and
 * CGI or env dumps (`HTTP_COOKIE=…`). Group 1 is a quote before the name and group 3 one after it: both mean a quoted
 * name (`"Cookie": "…"`), group 1 alone a quoted header (`"Cookie: …"`). Group 4 is the separator; `=` only counts for
 * the env names.
 */
const HEADER =
  /(?<![\w-])(\\?["'])?(proxy-authorization|authorization|set-cookie|cookie|http_(?:proxy_)?authorization|http_cookie)(\\?["'])?\s*([:=])/gi
/** A single-line HAR header, either key order: `{"name":"Cookie","value":"…"}`. */
const HAR =
  /"name"\s*:\s*"(proxy-authorization|authorization|set-cookie|cookie)"\s*,\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"|"value"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"name"\s*:\s*"(proxy-authorization|authorization|set-cookie|cookie)"/gi
/** curl's cookie option; a value without `=` names a cookie file. */
const CURL_COOKIE = /(?<![\w-])(?:-b|--cookie)(?:\s+|=)(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/g
const NAMES: Record<string, string> = {
  authorization: 'Authorization',
  'proxy-authorization': 'Proxy-Authorization',
  cookie: 'Cookie',
  'set-cookie': 'Set-Cookie',
  http_authorization: 'Authorization',
  http_proxy_authorization: 'Proxy-Authorization',
  http_cookie: 'Cookie',
}

/**
 * What hides a value: `[masked]` and references to a value rather than the value (`$TOKEN`, `${token}`, `{{token}}`,
 * `<token>`). Bounded so a line full of openers stays linear.
 */
const HIDDEN = /\[masked\]|\$\{[^{}\n]{0,200}\}|\{\{[^{}\n]{0,200}\}\}|<[^<>\n]{0,200}>|\$\w+/g
/** A credential-like run: 16+ token characters. It counts only with a letter and a digit in it. */
const RUN = /[A-Za-z0-9_.~+=%-]{16,}/g
/** Set-Cookie attributes, which carry no credential (`Max-Age=31536000`, `Domain=api2.example.com`). */
const ATTRIBUTE = /^\s*(?:path|domain|expires|max-age|secure|httponly|samesite|partitioned|priority)\s*(?:=|$)/i

function credentialRun(value: string): boolean {
  for (const [run] of value.replace(HIDDEN, ' ').matchAll(RUN)) if (/\d/.test(run) && /[A-Za-z]/.test(run)) return true
  return false
}

/**
 * Whether a header value still holds a credential once `[masked]` and placeholders are out. Cookie values are checked
 * pair by pair, through `, ` folds, skipping Set-Cookie attributes and testing only what follows a pair's `=`.
 */
function leaks(name: string, value: string): boolean {
  if (!name.endsWith('cookie')) return credentialRun(value)
  return value.split(/[;,]/).some(pair => {
    if (ATTRIBUTE.test(pair)) return false
    const eq = pair.indexOf('=')
    return credentialRun(eq < 0 ? pair : pair.slice(eq + 1))
  })
}

/**
 * Where a value opened by `quote` closes, before `limit`, else -1: at the first unescaped `quote`, or for an escaped
 * opener (`\"` in a JSON string) at the next escaped one.
 */
function closing(text: string, quote: string, escaped: boolean, from: number, limit: number): number {
  for (let i = from; i < limit; i++) if (text[i] === quote && (text[i - 1] === '\\') === escaped) return escaped ? i - 1 : i
  return -1
}

/**
 * A header's value runs to the quote that opened the header or the value (an escaped quote inside doesn't end it), else
 * to a `|` or backtick (a markdown table cell or code span), the next header, or the end of the line. Every value stops
 * at the next header, so the whole line is read once.
 */
function evidenceHeader(text: string): string | undefined {
  const matches = [...text.matchAll(HEADER)]
  for (const [i, m] of matches.entries()) {
    const name = (m[2] ?? '').toLowerCase()
    if (m[4] === '=' && !name.startsWith('http_')) continue
    const limit = matches[i + 1]?.index ?? text.length
    let at = (m.index ?? 0) + m[0].length
    while (at < limit && (text[at] === ' ' || text[at] === '\t')) at++
    let opener = m[3] ? undefined : m[1]
    const open = text.slice(at, at + 2).match(/^\\?["'`]/)?.[0]
    if (open) {
      opener = open
      at += open.length
    }
    let end = opener ? closing(text, opener.slice(-1), opener.length > 1, at, limit) : -1
    if (end < 0) {
      end = limit
      for (let j = at; j < limit; j++)
        if (text[j] === '|' || text[j] === '`') {
          end = j
          break
        }
    }
    if (leaks(name, text.slice(at, end))) return `an unmasked ${NAMES[name]} header in evidence`
  }
  for (const m of text.matchAll(HAR)) {
    const name = (m[1] ?? m[4] ?? '').toLowerCase()
    if (leaks(name, m[2] ?? m[3] ?? '')) return `an unmasked ${NAMES[name]} header in evidence`
  }
  if (/\bcurl\b/.test(text))
    for (const m of text.matchAll(CURL_COOKIE)) {
      const value = m[1] ?? m[2] ?? m[3] ?? ''
      if (value.includes('=') && leaks('cookie', value)) return 'an unmasked Cookie header in evidence'
    }
  return undefined
}

function scanLine(text: string, file: string): string | undefined {
  if (ALLOW.some((marker) => text.includes(marker))) return undefined
  return PATTERNS.find(([, re]) => re.test(text))?.[0] ?? (EVIDENCE.test(file) ? evidenceHeader(text) : undefined)
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
      const kind = scanLine(raw.slice(1), file)
      if (kind) found.push({ file, line, kind })
      line++
    }
  }

  for (const f of files) {
    byName(f.path)
    f.text.split('\n').forEach((text, i) => {
      const kind = scanLine(text, f.path)
      if (kind) found.push({ file: f.path, line: i + 1, kind })
    })
  }
  return found
}
