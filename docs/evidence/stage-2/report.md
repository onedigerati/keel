# Stage 2 · Identity and docs — evidence
Verified 2026-11-13 on c29385c, plus uncommitted changes (the stage's docs)

| Check | Result | Evidence |
|---|---|---|
| The root README, plugin README, field guide, and the plugin.json and marketplace.json descriptions lead with JBIT, "jay-bit", "Just Build It" and the tagline "Plans it. Proves it. Sees it through." (proof: command) | pass | [identity-grep.txt](identity-grep.txt): READMEs lines 3–5, field guide 235–236 (eyebrow, h1), both descriptions open with them |
| Both READMEs tell the story from goal to done (plan, stages, build, verify with evidence, review, commit; autopilot to see it through) in place of a feature list, and promise no hands-free run (proof: reading, recorded in the report) | pass | Read 2026-11-13: root `README.md` "From goal to done" steps 1–8 then "What it won't do"; `plugins/jbit/README.md` "From goal to done" ### 1–8 and "Along the way", with "It doesn't promise a hands-free run" (line 9) and section 7's list of stops; the old "What it does" feature list is gone and reference material sits under "Reference" |
| Both READMEs say how to move over from keel (remove `keel-local`, add `jbit-local`, install `jbit`, uninstall `keel`) and that `Keel risk:`, `Keel outward:` and `keel:allow-secret` still work (proof: command) | pass | [move-over-grep.txt](move-over-grep.txt): `README.md:30–41`, `plugins/jbit/README.md:66–83` |
| The field guide shows 0.12.0 and has no stale version or name (proof: command) | pass | [field-guide.txt](field-guide.txt): only `0.12.0` (lines 229, 459), no `keel`, tags balanced |
| Tests and validate stay green, and stage 1's grep check still holds (proof: test, command) | pass | [tests.txt](tests.txt) 312/312, [validate.txt](validate.txt), [grep-keel.txt](grep-keel.txt): only the alias code, its tests and the two "Moving over from keel" sections |
| Re-run of stage 1: A live session with the renamed plugin shows `# JBIT` in its context and the `jbit` status line, and `jbit:plan` loads | pass | [rerun-s1-headless-live.txt](rerun-s1-headless-live.txt) |
| Re-run of stage 1: Outside `docs/plans/`, `docs/decisions.md` and the alias code, `grep -ri keel` finds nothing | pass | [grep-keel.txt](grep-keel.txt) (the move-over sections are the stage 2 exception) |

Project checks: tests 312/312 ([tests.txt](tests.txt)) · validate passed with warnings, as in the baseline ([validate.txt](validate.txt))
Audit: no dependencies to audit (the plugin has no package manifest)
