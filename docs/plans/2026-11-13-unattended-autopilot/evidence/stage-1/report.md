# Stage 1 · Unattended in the hook — evidence
Verified 2026-11-13 on 5c6632f, plus uncommitted changes (register.ts, keel.test.ts, types/index.d.ts), re-verified after review fixes

| Check | Result | Evidence |
|---|---|---|
| The user's own `/keel:autopilot unattended` prompt arms autopilot unattended. The same words from a plugin prompt, the Skill tool's args, or a Mode line saying `unattended` don't | pass | [tests.txt](tests.txt): "the words after /keel:autopilot…", "the user's own /keel:autopilot unattended arms an unattended run…", "unattended isn't armed by a plugin's prompt, the Skill tool's args, or a Mode line…" (`claude plugin test plugins/keel`) |
| While unattended, a stage whose risk line names auth, money or personal data (or a project hold word) isn't held: Edit and Agent go through, the band reads `autopilot unattended`, and the user is told once that it's being built without a hold | pass | [tests.txt](tests.txt): "the user's own /keel:autopilot unattended arms an unattended run…", "an unattended run lifts a project hold word too", "the band keeps the Agents level after autopilot unattended" |
| While unattended, outward-facing commands are still denied, built-in and project rules both. With `/keel:autopilot unattended outward` they go through | pass | [tests.txt](tests.txt): "while unattended, outward-facing commands are still denied…", "with /keel:autopilot unattended outward, outward-facing commands go through…" |
| While unattended, the checks, evidence and secret commit gates refuse exactly as before | pass | [tests.txt](tests.txt): the three "while unattended, … is refused as before" tests |
| Removing the Mode line, or a plain `/keel:autopilot` prompt, ends unattended; a new session starts without it | pass | [tests.txt](tests.txt): "a plain /keel:autopilot ends an unattended run, and so does removing the Mode line", "a Mode line saying unattended doesn't arm it in a new session" |
| The working rules tell Claude it is unattended, what it may decide itself, and what still pauses | pass | [tests.txt](tests.txt): "the working rules tell Claude it is unattended…", "the working rules for unattended outward…", "plain autopilot keeps its working rules and band…" |

Project checks: tests 304/304 ([tests.txt](tests.txt)) · validate passed with warnings ([validate.txt](validate.txt); the type warnings are the tests' `prompt.submit` calls without `wait`, as the existing tests write them, plus the existing missing-icon warning) · no type check, lint or build script (a hook plugin; `validate` type-checks it)
Mutation: with the unattended hold lift and outward skip removed, 9 of the new tests fail ([mutation.txt](mutation.txt)); the builder reports seven other mutations, each caught
Audit: none applies; the plugin has no package.json or dependencies

## History
- 2026-11-13 · Review found unattended outliving a Goal change (a plan Claude cut after arming ran unheld, push allowed under `outward`), a notice that could be skipped, a band that hid `outward` and paused-unattended, and a latent level revived by a plain-language re-arm. Fixed with 7 tests (304 pass); the builder confirmed each fix's test fails with the fix removed.
