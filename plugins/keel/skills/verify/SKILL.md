---
name: verify
description: Verify work against the running product and the project's own checks — type check, lint, tests, build, a dependency audit, then each acceptance check proven by driving the real app (screenshots, scripted clicks, requests, CLI runs), with a per-check report; when a plan stage is verified, the report and the output behind it are saved to docs/evidence/stage-<n>/. Use before calling any stage or fix done, when asked to verify, test or check something works, or when unsure whether a change actually works.
---

# Keel: verify

A clean type check proves the code compiles. Verification proves it does what the plan says, in the running product.

Who runs it follows the plan's Agents line (`keel:plan`). Under an `Agents: wide` the hook honours (one it isn't honouring yet counts as balanced), a plan stage's verify goes to a fresh agent that built nothing, briefed with the stage number and this skill; under `lean`, the main session runs it with no other agent running. No line (`balanced`): either. If you were spawned to verify, run it yourself.

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

**At the plan's last stage, re-run the earlier stages' hand-proven checks.** When the stage being verified is the last one in `## Stages`, also re-run every earlier stage's check that wasn't proven by a test (a CLI run, a request, a screenshot, a command); the suite run in step 1 already covered the tests. `## Now` holds only the current stage, so find them in each earlier stage's `docs/evidence/stage-<k>/report.md`: its rows, and the files they link, show what was run. For a stage with no report, use its line in `## Stages`. Run each the way it was proven then. One that passed then and fails now is a regression: report it as fail, never drop it or put it down to an earlier stage.

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
- At the plan's last stage, each re-run check gets its own row after those, in the same table: `Re-run of stage <k>: <check, as written in its report>`, pass or fail, with its evidence like any row.
- Escape a `|` inside a check's text as `\|` so the row keeps three columns.
- Evidence is a relative link to a file in the folder, or a test name and the command that ran it. Every link points to a file that exists.
- Link every file you saved. Mark each one git ignores as `(local)`: `git check-ignore -q <file>` succeeds for those.
- Re-verifying a stage overwrites its report and output files. Keep earlier failures and their fixes as one line each under History; leave History out if nothing ever failed.

Then, if the stage verified is the one in `## Now`, tick each check there that passed (`- [x]`). In the reply, give the table, the project checks and audit in one line each, the report's path, and the evidence files written, including a newly created `.gitignore`. If anything failed, fix it, re-verify the affected checks, and report both the failure and the fix, unless the user asked only for a report: then report the failure and leave it. Only when everything passes, re-runs included, is the stage verified.

## Closing a milestone

When `keel:plan` closes a roadmap milestone, it does so in the plan that follows the one that covered it, so verify writes the close to that plan's evidence folder: `docs/evidence/milestone-<ID>.md` (`milestone-M1.md`), beside any stage reports, archived with the plan. The keel hook refuses a commit that ticks the milestone in `docs/ROADMAP.md` unless this file has a table row, its ID in the first cell, for every requirement of the milestone that isn't dropped. Verify proves three things, and the file records each:

1. **The full suite**: steps 1 and 2, on the archived state. Any new failure keeps the milestone open.
2. **Coverage**: a row per requirement of the milestone that isn't dropped, `| ID | Covered by | Evidence row | Result |`. A row passes when its `Covered by` link names an archived plan that exists (`docs/plans/<date>-<slug>.md`) and that plan's stage reports (`stage-*/report.md`, not a `milestone-*` file) hold a `pass` row tagged with the ID, with no later failing re-run of it. A requirement the charter backfilled, from a plan that predates tags, passes instead on the passing row the charter's backfill named for it (listed in the charter commit's message: `git log --grep Backfill -- docs/ROADMAP.md`), and goes into the fit sample. A blank cell, a link to a missing plan, or no such row is a gap: that row fails.
3. **Evidence fit**, judged by a fresh agent that built nothing, under every Agents level (under `lean`, the only one running). Give it the full list of the milestone's non-dropped requirements; it picks its own sample: at least five, or all if fewer, plus every backfilled requirement and every one proven only by hand (a run, a request, a screenshot rather than a test). Brief it with each requirement's text as the ledger states it and the paths of its evidence files (the stage reports and the files they link), not the Result column, the builder's wording or your view. It reads the evidence, re-runs at least one proof itself, and says per ID whether the evidence shows the requirement delivered as written, and what's missing where it doesn't. Its sample, its re-run and its answer per ID go in the file.

The milestone passes only when all three do, and `keel:review`'s milestone review then finds nothing to fix now (its findings go in the same file). A failure is reported as fail, never dropped: the box stays unticked, and `keel:plan` turns it into the plan's next stages.
