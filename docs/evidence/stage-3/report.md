# Stage 3 · Evidence gate — evidence
Verified 2026-11-06 on ac971d3, plus the uncommitted stage 3 changes

| Check | Result | Evidence |
|---|---|---|
| A commit closing stage n is refused when its report is neither in the commit nor the tree; the denial names the path and how to write or backfill it | pass | [tests.txt](tests.txt) (missing-report and unreadable-report tests); live: [live-no-report.txt](live-no-report.txt) |
| Too few check rows is refused; a row per check passes, in the tree or added in the same commit | pass | [tests.txt](tests.txt) (row-count, same-commit, same-line `git add`, escaped `\|`, CRLF, fresh-session HEAD plan); live: [live-one-row.txt](live-one-row.txt), [live-four-rows.txt](live-four-rows.txt) |
| Commits closing no stage, repos with no plan, and existing behavior unchanged; the original 34 tests pass, a guard error still steps aside | pass | [tests.txt](tests.txt): 53/53 (two existing tests now supply a report for their passing case; assertions unchanged) |
| This repo's own stage 3 commit passes the gate with this report | pass | live runs on a scratch clone of this repo at this stage, in fresh sessions with the new hook: [live-no-report.txt](live-no-report.txt), [live-one-row.txt](live-one-row.txt), [live-four-rows.txt](live-four-rows.txt). This session still runs the hook code it started with, so the real commit here doesn't exercise the new gate. |

Project checks: tests 53/53 · validate pass ([tests.txt](tests.txt))
Audit: none applies (the plugin has no dependencies)

## History
- 2026-11-06 · Review: a throw in the evidence check could skip the secret scan for a later commit on the same line, and a stage closed in a later session lost its check count (a 1-row report passed). Fixed: secrets are scanned for every commit first, a failed read counts as missing, and a missing count is read from the plan at HEAD.
- 2026-11-06 · First live runs weren't blocked: two loaded a second copy of keel with `--plugin-dir`, and one ticked the plan with `sed` on the same command line as the commit, so the diff the guard reads didn't have the tick yet. Re-run with the installed copy and the tick staged first.
