# Stage 1 · Rename to jbit — evidence
Verified 2026-11-13 on d97fefc, plus uncommitted changes (the stage's rename)

| Check | Result | Evidence |
|---|---|---|
| The plugin is `jbit` 0.12.0: `plugins/jbit/`, plugin.json and marketplace.json name it, and the skills, hooks, tests and evals use `jbit:*` (proof: test) | pass | [tests.txt](tests.txt) (312/312 run from `plugins/jbit`), [validate.txt](validate.txt), [headless-live.txt](headless-live.txt) (init lists `jbit` 0.12.0 and nine `jbit:*` skills) |
| `/jbit:autopilot unattended [outward]` arms and `/jbit:approve` releases a hold, exactly as the keel forms did (proof: test) | pass | [tests.txt](tests.txt): `/jbit:autopilot unattended and unattended outward arm a run; the old /keel:autopilot unattended does not`, `/jbit:approve releases a hold; the old /keel:approve does not`, `the old /keel:autopilot unattended outward prompt leaves a risky stage held and pushes denied`, plus the existing arming and approval tests now in `/jbit:*` form |
| A line with `keel:allow-secret` and a `Keel risk:` / `Keel outward:` rule in `CLAUDE.md` still work, as do the `jbit:allow-secret`, `JBIT risk:` and `JBIT outward:` forms (proof: test) | pass | [tests.txt](tests.txt): the four `legacy …` tests; [mutation.txt](mutation.txt): with the keel alias removed, exactly those four fail |
| Outside `docs/plans/`, `docs/decisions.md` and the alias code, `grep -ri keel` finds nothing (proof: command) | pass | [grep-keel.txt](grep-keel.txt): hits only in `hooks/secrets.ts` and `hooks/project.ts` (alias) and the alias tests; `docs/PLAN.md` and `docs/evidence/` excluded as records of the rename |
| A live session with the renamed plugin shows `# JBIT` in its context and the `jbit` status line, and `jbit:plan` loads (proof: headless run) | pass | [headless-live.txt](headless-live.txt): `ui_status: jbit · lean · 0/1 done · next: 1. Hello`, context heading `# JBIT`, `jbit:plan` launched |

Project checks: type check n/a (run by the test harness) · lint n/a · tests 312/312 ([tests.txt](tests.txt)) · validate passed with warnings, ICON_MISSING only as in the baseline ([validate.txt](validate.txt))
Audit: no dependencies to audit (the plugin has no package manifest)
