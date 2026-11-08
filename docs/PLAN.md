# Keel plan

## Goal
Close the two gaps in how Keel proves the code it helps build, without making it heavier. Regressions: acceptance checks proven only by running the product are never repeated, so a later stage can break one unnoticed. Security: the review's security pass is never proven to catch anything, and a stage labelled "UI only" at plan time skips it even when the code it ends up with handles input. Done looks like this: plans prefer an automated test as a check's proof, verify re-runs the remaining hand-proven checks once at the end of a plan, stages recheck their risk line against the actual diff before deciding on review, and evals show a later stage's regression and a planted vulnerability both being caught. Shipped as keel 0.6.0.

## Baseline
2026-11-07 · tests: 55 pass, 0 fail (`claude plugin test plugins/keel`) · validate: passed (`claude plugin validate plugins/keel`)

## Now
Stage 3 of 3 · Docs and release
Mode: autopilot
Risk: UI only
Checks:
- [ ] `plugins/keel/README.md` describes the end-of-plan re-run, the risk-line recheck and the gate skipping re-run rows, and lists `regression-caught`, `risk-recheck` and `security-caught` in the eval list and in the cases that can't run under WSL (proof: command, grep; a test can't judge prose)
- [ ] The root `README.md` mentions tests as preferred proof and the risk-line recheck (proof: command, grep; a test can't judge prose)
- [ ] `plugin.json` is version 0.6.0 (proof: command)
- [ ] Plugin tests and validate pass (proof: `claude plugin test plugins/keel`, `claude plugin validate plugins/keel`)
Open: none

## Stages
- [x] 1. Regression proof — plans prefer tests as proof; verify re-runs hand-proven checks once at the end of a plan; eval `regression-caught`
- [x] 2. Security proof — stage and autopilot recheck the risk line against the diff before deciding on review; eval `risk-recheck` proves the recheck; `security-caught` checks an injection is fixed before commit
- [ ] 3. Docs and release — both READMEs, eval list, version 0.6.0

## Decisions
- 2026-11-07 · Acceptance checks name `test` as their proof wherever a test can cover them, and hand-proven checks give the reason — a test protects against regressions on every later verify for free, while hand-proven checks are only repeated once, at the end of the plan.
- 2026-11-07 · Hand-proven checks from earlier stages are re-run once, when the plan's last stage is verified, not per stage or "when a stage touches the same area" — repeating them every stage adds cost with each stage, and "the same area" is a judgment agents would apply unevenly.
- 2026-11-07 · Before deciding whether to review, stage and autopilot compare the risk line with what the diff touches (user input, auth, money, personal data, secrets, external services) and correct the line in the plan when it's wrong — the line is set at plan time, and a stage that drifted past "UI only" otherwise skips the security pass.
- 2026-11-07 · The evidence gate doesn't count `Re-run of stage <k>` rows toward a stage's check rows — the stage 1 verifier found re-run rows could otherwise stand in for a missing check row.
- 2026-11-07 · Stage 1's eval `regression-caught` covers one shape: one earlier stage, one failing re-run. A passing re-run, several earlier stages and the `## Stages` fallback for a stage with no report aren't covered — accepted at n=1, as the plan's method for eval proof allows. `claude plugin eval plugins/keel --case regression-caught --scaffold` still to run off this machine.
- 2026-11-07 · Stage 2 is built in a worktree in parallel with stage 1's review fixes, and merged after stage 1 is committed — the two touch different files, and the user asked for more parallelism.
- 2026-11-07 · Stage 2's eval proves the risk recheck (`risk-recheck`: a safe user-input stage labelled "UI only" is relabelled and reviewed under the new skills, not the old), and `security-caught` stays as a plain safety check that an injection is fixed before commit, with no claim review found it — in 6 runs over 3 injection designs, the author found and fixed the injection on first reading the diff under both the new and the pre-stage-2 skills, so no small eval can show review catching it. Decided by the user, following the recommendation.
- 2026-11-07 · `risk-recheck` reliably separates the versions on the risk line (corrected in `## Now` under the new skills; left "UI only" with only a dated decision under the old, 2 of 2 runs), but not always on review: the old skills skipped review in 1 of 2 runs and ran it in the other. So the stage proves the risk is now recorded where review and the hook read it, and that review runs under the new skills; it doesn't prove review would otherwise have been skipped every time.
- 2026-11-07 · Not doing: mandatory test-first for every feature (tests first stays the rule for bug fixes and untested code, and tests travel with risky logic), a required static analysis tool in verify, or secure-coding rules at build time — each adds weight for little gain over what the suite, the linter the project already has, and the fresh-eyes security pass catch; projects that want strict TDD can say so in `CLAUDE.md`.

## Open questions
- Committed screenshots get no secret scan (the guard skips binary files); the docs state the limit and review should look at committed images. A guard for images is out of scope here — the user decides whether it's worth a later plan.
- No eval covers masking yet (a case whose output holds a fake DB URL and email, graded for `[masked]`) — deferred from the last plan's stage 1 review; worth adding in a later plan.

## Standing decisions
- 2026-11-06 · Evidence lives in `docs/evidence/stage-<n>/` for the current plan — beside the plan file, and stage numbers restart with each plan, so a per-plan folder never collides. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · Archiving a plan moves its evidence to `docs/plans/<date>-<slug>/evidence/` with `git mv`, and the archived plan's links are rewritten to match — the evidence stays next to the plan it proves, and the new plan starts with an empty `docs/evidence/`. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · `report.md` and text output are always committed. Screenshots, traces and videos are committed only when the repo opts in. Verify creates `docs/evidence/.gitignore` ignoring images, traces and videos on first use, and a repo opts in by removing the image lines from it. The report links every file either way, and marks the ones that weren't committed as local — the user decided screenshots shouldn't grow a repo by default, and a gitignore is the opt-in git already understands, with no new setting to learn. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · The evidence gate applies to every stage closed after the upgrade to 0.5.0, including stages of plans already in progress, and its denial says how to backfill a report — decided by the user, following the recommendation. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · Evidence goes through the existing secret guard like any other commit, and verify is told to mask secrets and personal data in captured output — command output and screenshots can show what the code hides. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · The gate (stage 3) checks that the report exists and has a row per check in `## Now`, not that the evidence is any good — judging quality stays with verify and review; the hook only stops a stage from closing with nothing behind it. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · Eval cases that use Bash can't run on this machine (the eval sandbox refuses `~/.docker` symlinks under WSL). Until they run elsewhere, a stage whose proof is an eval is proven by a headless `claude -p --plugin-dir plugins/keel` run against the case's scaffold, graded by hand against the case's criteria, and the eval command is noted as still to run — this keeps the proof a real session on the real plugin. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · Verify writes evidence whenever a plan stage is verified, including on a "just report" request, and stays in chat for ad-hoc fixes or repos with no plan — review found evidence would otherwise land under the wrong stage; the first wording of that rule led a run to write nothing on a report-only request, so it now says so outright. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · The plan context the hook injects now says verifying a stage means running keel:verify, which saves its evidence — in 1 of 2 traced runs, "verify stage 1 is still good" never loaded the skill and so wrote no evidence; with the rule, 3 of 3 did. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · The evidence gate reads a stage's check count from the session, or from the plan at HEAD when the session never saw that stage; the ticked-checks gate uses the same HEAD fallback — review found that a stage closed in a later session otherwise passed with a 1-row report and skipped the ticked-checks gate. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · Secrets are scanned for every commit on a command line before any stage gate runs, and a report that can't be read counts as missing — review found a throw in the evidence check could otherwise skip the secret scan for a later commit on the same line. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))
- 2026-11-06 · Hook behavior is proven live with plain headless sessions using the installed plugin (it reads the working tree), not `claude -p --plugin-dir`: with a second copy of keel loaded that way, the guard didn't block a commit in this setup. The cause wasn't investigated. (from [Verification evidence](plans/2026-11-07-verification-evidence.md))

## Shipped
- 2026-11-07 · Verification evidence: verify saves a per-check report and its output to `docs/evidence/stage-<n>/`, stage and autopilot link it, archiving carries it along, and the commit guard refuses to close a stage without it (keel 0.5.0–0.5.2) — [plan](plans/2026-11-07-verification-evidence.md) · [evidence](plans/2026-11-07-verification-evidence/evidence/)
