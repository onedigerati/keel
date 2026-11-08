# Stage 1 · Regression proof — evidence
Verified 2026-11-07 on 09f4a2a, plus uncommitted changes (plugins/keel/skills/{plan,stage,verify}/SKILL.md, plugins/keel/tests/keel.test.ts, plugins/keel/evals/regression-caught/)

| Check | Result | Evidence |
|---|---|---|
| The plan skill says to name `test` as a check's proof whenever a test can cover it, and to give the reason when a check is proven by running the product (proof: command, grep of `plan/SKILL.md`) | pass | [plan-skill-grep.txt](plan-skill-grep.txt): line 72 "the proof is `test` wherever a test can cover it … A check proven by running the product gives the reason a test can't"; line 38 template `run the product, <why a test can't>` |
| When the last stage of a plan is verified, verify re-runs every earlier stage's check that was proven by running the product, and records each as its own row in that stage's report (proof: headless run on the new eval scaffold, graded by hand) | pass | [regression-caught-run.txt](regression-caught-run.txt): the run read stage 1's report, re-ran `node src/cli.js sample.csv`, and wrote a `Re-run of stage 1: …` row after stage 2's two rows; skill text in [verify-skill-grep.txt](verify-skill-grep.txt) (lines 33, 88, 94) |
| An earlier stage's hand-proven check that a later stage broke is reported as fail at the end-of-plan verify, not as pass (proof: new eval case `regression-caught`, run headless and graded by hand) | pass | [regression-caught-run.txt](regression-caught-run.txt): re-run row marked fail with `NaN` linked; reply says "Stage 2 is **not verified**"; src/ and test/ untouched. All 5 graders pass by hand (loads-verify, writes-report, report-reruns-earlier-check, reply-not-verified, code-untouched). `claude plugin eval` still to run off WSL |
| Plugin tests and validate still pass (proof: `claude plugin test plugins/keel`, `claude plugin validate plugins/keel`) | pass | [tests.txt](tests.txt): 57 pass, 0 fail (re-run after the review fixes) · [validate.txt](validate.txt): Validation passed |

Project checks: tests 57/57 ([tests.txt](tests.txt), baseline 55 + 2 new) · validate pass ([validate.txt](validate.txt)); no type check, lint or build configured
Audit: no package dependencies in the plugin (no package.json/lockfile), nothing to audit

Fixes after the verifier's findings, re-verified 2026-11-07 ([review-fixes-grep.txt](review-fixes-grep.txt), [tests.txt](tests.txt)):
- the plan skill's reason rule now covers every proof that isn't a test, matching verify's re-run rule;
- the evidence gate no longer counts `Re-run of stage <k>` rows toward a stage's check rows (tests `re-run rows from earlier stages, past the row per check, still let the stage close` and `a re-run row does not stand in for a missing check row`);
- verify reports failures without fixing them when the user asked only for a report.
