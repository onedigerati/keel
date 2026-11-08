# Stage 1 · Verify writes evidence — evidence
Verified 2026-11-06 on 266d476, plus the uncommitted stage 1 changes (committed as d5cf0f8). Written after the fact from the saved run output, since this stage built the evidence step itself.

| Check | Result | Evidence |
|---|---|---|
| `skills/verify/SKILL.md` tells verify to write `docs/evidence/stage-<n>/report.md`, save output next to it, create the default `.gitignore`, keep only throwaway scripts in the scratchpad | pass | read the skill: `plugins/keel/skills/verify/SKILL.md` steps 3–5 |
| `report.md` is committable, screenshots are git-ignored by default, committed after opt-in | pass | [gitignore-opt-in.txt](gitignore-opt-in.txt) |
| `verify-evidence` case passes (headless run graded by hand; eval still to run off this machine) | pass | [verify-evidence-2.txt](verify-evidence-2.txt) |
| `verify-honest` still passes and records its failing check as fail | pass | [verify-honest-6.txt](verify-honest-6.txt), [verify-honest-7.txt](verify-honest-7.txt), [verify-honest-8.txt](verify-honest-8.txt) |

Project checks: validate pass · tests 34/34
Audit: none applies (the plugin has no dependencies)

## History
- 2026-11-06 · After review fixes, a report-only request wrote no evidence. Fixed: verify says outright that evidence is written for a report-only request, and the hook's plan context says verifying a stage means running keel:verify (1 of 2 traced runs had skipped the skill; 3 of 3 loaded it after).
