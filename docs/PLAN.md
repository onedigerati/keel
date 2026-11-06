# Keel plan

## Goal
Keep the evidence from verification after the session ends. Right now `keel:verify` proves each acceptance check against the running product, but its screenshots and output sit in the session scratchpad, and only checkboxes and a chat summary are left. Done looks like this: every verified stage, whether run by `keel:stage` or `keel:autopilot`, leaves an evidence folder in the repo, with a per-check report and the screenshots and output behind it. Stage and autopilot reports link to it, archiving a plan carries its evidence along, and the hook refuses to close a stage with no evidence report. Shipped as keel 0.5.0.

## Baseline
2026-11-06 · tests: 34 pass, 0 fail (`claude plugin test plugins/keel`) · validate: passed (`claude plugin validate plugins/keel`)

## Now
Stage 1 of 4 · Verify writes evidence
Mode: autopilot
Risk: secrets (skill text and an eval only; the skill gains masking rules for sensitive values in captured output)
Checks:
- [ ] `skills/verify/SKILL.md` tells verify to write `docs/evidence/stage-<n>/report.md` (check → pass/fail → evidence link, then project checks and audit) and to save screenshots and command output next to it; it creates `docs/evidence/.gitignore` ignoring images, traces and videos unless the file already exists; only throwaway scripts stay in the scratchpad (proof: read the skill)
- [ ] In the `verify-evidence` run, `report.md` is committable and the screenshots are git-ignored by default, and they're committed once the image lines are removed from the gitignore (proof: `git check-ignore` in the eval's grader)
- [ ] A new eval case `verify-evidence` passes: verify on a scaffolded project leaves a `report.md` with a row per check, linking to files that exist (proof: `claude plugin eval plugins/keel --case verify-evidence --scaffold --runs 3`)
- [ ] `verify-honest` still passes, and its failing check is recorded as fail in the report (proof: same eval command, `--case verify-honest`)
Open: none

## Stages
- [ ] 1. Verify writes evidence — verify saves a per-check report, screenshots and output to `docs/evidence/stage-<n>/`
- [ ] 2. Stage and autopilot use it — reports link the evidence; autopilot's independent verifier writes there; archiving a plan moves its evidence alongside
- [ ] 3. Evidence gate — the commit guard refuses to close a stage whose `report.md` is missing or doesn't cover its checks
- [ ] 4. Docs and release — both READMEs, eval list, version 0.5.0

## Decisions
- 2026-11-06 · Evidence lives in `docs/evidence/stage-<n>/` for the current plan — beside the plan file, and stage numbers restart with each plan, so a per-plan folder never collides.
- 2026-11-06 · Archiving a plan moves its evidence to `docs/plans/<date>-<slug>/evidence/` with `git mv`, and the archived plan's links are rewritten to match — the evidence stays next to the plan it proves, and the new plan starts with an empty `docs/evidence/`.
- ~~2026-11-06 · `report.md` and screenshots are committed with the stage; Playwright traces and videos are not (written to a git-ignored `docs/evidence/.local/`, with their path noted in the report) — screenshots are small and are the proof reviewers look at, while traces run to megabytes per run.~~
- 2026-11-06 · `report.md` and text output are always committed. Screenshots, traces and videos are committed only when the repo opts in. Verify creates `docs/evidence/.gitignore` ignoring images, traces and videos on first use, and a repo opts in by removing the image lines from it. The report links every file either way, and marks the ones that weren't committed as local — the user decided screenshots shouldn't grow a repo by default, and a gitignore is the opt-in git already understands, with no new setting to learn.
- 2026-11-06 · The evidence gate applies to every stage closed after the upgrade to 0.5.0, including stages of plans already in progress, and its denial says how to backfill a report — decided by the user, following the recommendation.
- 2026-11-06 · Evidence goes through the existing secret guard like any other commit, and verify is told to mask secrets and personal data in captured output — command output and screenshots can show what the code hides.
- 2026-11-06 · The gate (stage 3) checks that the report exists and has a row per check in `## Now`, not that the evidence is any good — judging quality stays with verify and review; the hook only stops a stage from closing with nothing behind it.

- 2026-11-06 · Eval cases that use Bash can't run on this machine (the eval sandbox refuses `~/.docker` symlinks under WSL). Until they run elsewhere, a stage whose proof is an eval is proven by a headless `claude -p --plugin-dir plugins/keel` run against the case's scaffold, graded by hand against the case's criteria, and the eval command is noted as still to run — this keeps the proof a real session on the real plugin.

## Open questions
- none
