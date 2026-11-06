---
name: verify
description: Verify work against the running product and the project's own checks — type check, lint, tests, build, a dependency audit, then each acceptance check proven by driving the real app (screenshots, scripted clicks, requests, CLI runs), with a per-check report; when a plan stage is verified, the report and the output behind it are saved to docs/evidence/stage-<n>/. Use before calling any stage or fix done, when asked to verify, test or check something works, or when unsure whether a change actually works.
---

# Keel: verify

A clean type check proves the code compiles. Verification proves it does what the plan says, in the running product.

## 1. The project's own checks

Find how this project checks itself: `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, CI config (`.github/workflows`). Run, in order, whatever exists: type check, lint, tests, build. All must pass, apart from failures the plan's `## Baseline` already lists.

- Compare against the baseline. A failure it lists is inherited: report it as such, and leave it alone unless the stage is about it. Any failure it doesn't list is new and belongs to this work, even if it looks unrelated; fix it or prove it isn't yours by running the same check on the last stage commit (`git stash`, or a worktree) and showing it failing there too.

- A failure gets its output reported, never summarized as "mostly passing".
- A test that fails then passes on rerun is flaky: say so, don't hide it.
- Don't weaken a test, skip it, or loosen a lint rule to get green. If a test is wrong, say why and fix it openly.

## 2. Dependency audit

Run the stack's audit if it's available without installing anything: `npm audit --omit=dev` (or the pnpm/yarn equivalent), `pip-audit`, `cargo audit`, `govulncheck ./...`. Report high and critical findings in shipped dependencies with the package and the fixed version. Don't upgrade during verify; propose it. If no audit tool is available, say which one would apply.

## 3. The acceptance checks, in the running product

For each check in the plan's `## Now`, use the proof it names:

- **Web UI**: start the app (reuse a dev server that's already running; the built-in `run` skill knows how to launch most project types), drive it with Playwright or the project's browser tooling, take screenshots at the states the check describes, and look at them. Check the console for errors. Check a phone-width viewport when layout matters.
- **API or service**: real requests (`curl`, a short script) for the success path and at least one bad input.
- **CLI**: run it with realistic arguments and with a wrong one.
- **Library or logic**: the tests are the proof; confirm a test covers the check, and that it fails when the behavior is broken (break it briefly if in doubt).

Keep throwaway scripts in the scratchpad. When verifying a plan stage, everything that proves a check goes in the repo (step 4).

## 4. Evidence

Whenever a plan stage is verified, write its evidence, including when the user asked only for a report or said not to fix anything: the evidence is the record of what was checked, not a change to the work. Only when no plan stage is involved (an ad-hoc fix, or a repo with no plan) does the report stay in chat, with any captures in the scratchpad.

`<n>` is the number of the stage being verified: the one in `## Now`, unless asked about another. Save the proof for each check in `docs/evidence/stage-<n>/` as you go:

- Command output that proves a check (test run, CLI run, request and response) as a text file, one per proof, named for what it shows: `tests.txt`, `cli-sample.txt`, `curl-bad-input.txt`. Put the command on the first line.
- Screenshots, Playwright traces and videos.

If `docs/evidence/.gitignore` doesn't exist, create it:

```
# Screenshots, traces and videos stay local. Delete the image lines to commit screenshots.
*.png
*.jpg
*.jpeg
*.webp
*.gif
*.zip
*.webm
*.mp4
*.trace
*.har
```

If it exists, leave it alone. A repo that removed the image lines has opted in to committing screenshots; never add them back.

Before saving anything, mask secrets and personal data in it: tokens, API keys, passwords, cookies (`Cookie`/`Set-Cookie`), `Authorization` headers and bearer tokens, session IDs, JWTs, database URLs with credentials, emails, names, addresses. Replace the value and keep what it was: `DATABASE_URL=postgres://[masked]@db:5432/app`. The command on the first line of each file is masked too: `curl -H "Authorization: [masked]"`. Don't screenshot a screen showing real personal data; use test data, or describe the screen instead.

## 5. Report

For a plan stage, write `docs/evidence/stage-<n>/report.md`, even when asked only to report: it is the record, not a fix.

```
# Stage <n> · <name> — evidence
Verified <date> on <short commit>, plus uncommitted changes if any

| Check | Result | Evidence |
|---|---|---|
| <check, as written in Now> | pass | [cli-sample.txt](cli-sample.txt) |
| <check> | fail | [tests.txt](tests.txt): `sums amounts in cents` expected 139, got 138 |
| <check> | pass | [checkout-phone.png](checkout-phone.png) (local) |

Project checks: type check pass · lint pass · tests 12/12 ([tests.txt](tests.txt)) · build pass
Audit: `npm audit --omit=dev`: 0 high, 0 critical

## History
- <date> · <check> failed: <one line>. Fixed: <one line>.
```

- One row per check in `## Now` (for an earlier stage, per thing its line in `## Stages` promises). A failing check is a fail row with its output saved and linked, never dropped.
- Escape a `|` inside a check's text as `\|` so the row keeps three columns.
- Evidence is a relative link to a file in the folder, or a test name and the command that ran it. Every link points to a file that exists.
- Link every file you saved. Mark each one git ignores as `(local)`: `git check-ignore -q <file>` succeeds for those.
- Re-verifying a stage overwrites its report and output files. Keep earlier failures and their fixes as one line each under History; leave History out if nothing ever failed.

Then, if the stage verified is the one in `## Now`, tick each check there that passed (`- [x]`). In the reply, give the table, the project checks and audit in one line each, the report's path, and the evidence files written, including a newly created `.gitignore`. If anything failed, fix it, re-verify the affected checks, and report both the failure and the fix. Only when everything passes is the stage verified.
