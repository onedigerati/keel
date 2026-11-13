# Stage 2 · Skill, docs, 0.11.0 — evidence
Verified 2026-11-13 on 25147db, plus uncommitted changes (autopilot SKILL.md, both READMEs, plugin.json)

| Check | Result | Evidence |
|---|---|---|
| keel:autopilot's skill has an "Unattended runs" section that matches the hook: how the user arms it (`/keel:autopilot unattended [outward]`), what Claude decides itself and logs as `(unattended)` decisions, what still pauses, the security review kept, and what ends it (a plain `/keel:autopilot`, the Mode line removed, a new Goal, re-arming without the word) | pass | [docs-grep.txt](docs-grep.txt); section 4 read against `unattendedOf`, `unattendedRules`, `rearmed` and `sync` in register.ts: arming, the band strings, the end conditions and the resume-from-pause behaviour all agree |
| The README documents unattended next to autopilot, outward's extra word and the band text, and its guard list says which guards unattended lifts | pass | [docs-grep.txt](docs-grep.txt): the plugin README's skills row, "Autopilot stops, enforced" and "Unattended runs" bullets; the root README's 0.11.0 and Autopilot bullets |
| plugin.json says 0.11.0, and tests and validate stay green | pass | [tests.txt](tests.txt) 304/304 · [validate.txt](validate.txt) passed with warnings (same warnings as stage 1) |
| Re-run of stage 1: all six checks | pass | proven by tests; [tests.txt](tests.txt) re-runs them (22 unattended tests pass) |

Project checks: tests 304/304 ([tests.txt](tests.txt)) · validate passed with warnings ([validate.txt](validate.txt))
Audit: none applies; the plugin has no dependencies
