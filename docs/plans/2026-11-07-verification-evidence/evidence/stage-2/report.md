# Stage 2 · Stage and autopilot use it — evidence
Verified 2026-11-06 on d5cf0f8, plus the uncommitted stage 2 changes

| Check | Result | Evidence |
|---|---|---|
| `keel:stage` commits the stage's evidence by name and links `report.md`; `keel:autopilot`'s verifier writes evidence there and its final report links each stage's report | pass | read the skills: `plugins/keel/skills/stage/SKILL.md` steps 5–6, `plugins/keel/skills/autopilot/SKILL.md` steps 3, 5 and section 4 |
| `keel:plan` moves `docs/evidence/` to `docs/plans/<date>-<slug>/evidence/` and links it from the archived plan and `## Shipped` | pass | read the skill: `plugins/keel/skills/plan/SKILL.md`, "Starting the next plan" |
| `next-feature` case ends with the report archived and no stage folders left in `docs/evidence/` (headless runs graded by hand; eval still to run off this machine) | pass | [next-feature-run-1.txt](next-feature-run-1.txt), [next-feature-run-2.txt](next-feature-run-2.txt) (run 2 left the switch staged only because the scratch environment had no git identity) |

Project checks: validate pass · tests 34/34 ([plugin-checks.txt](plugin-checks.txt))
Audit: none applies (the plugin has no dependencies)
