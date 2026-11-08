# Stage 2 · Skills follow it — evidence
Verified 2026-11-08 on e176e9a, plus uncommitted changes (the five skills, the agents-lean, agents-wide and agents-wide-unconfirmed evals, fixtures/exporters.sh, hooks/register.ts, tests/keel.test.ts, types/index.d.ts)

| Check | Result | Evidence |
|---|---|---|
| `keel:plan` asks the level once when the user hasn't said, records `lean` or `wide` in `## Now` (`balanced` as no line), stamps `wide` with the current time only when the user picks or confirms it, and stage, autopilot and plan carry the line into each new `## Now` (proof: reading the skills — wording, no code to test) | pass | [skills-wording.txt](skills-wording.txt); quotes under "Wording" below |
| stage, autopilot, review and verify each say what `lean`, `balanced` and `wide` mean for them; every level keeps at least one fresh reviewer; an unhonoured `wide` makes stage ask before building and autopilot ask and carry on at balanced (proof: reading the skills — wording) | pass | [skills-wording.txt](skills-wording.txt); quotes under "Wording" below |
| Under `Agents: lean`, a stage is built and verified in the main session with one fresh reviewer and never two agents at once (proof: headless run against the `agents-lean` scaffold, graded by hand against the case; eval command still to run — evals with Bash can't run here) | pass | [trace-agents-lean.txt](trace-agents-lean.txt), [grading.md](grading.md): all 5 graders pass — the main session wrote and verified the exporters itself and started one foreground reviewer, no worktree. Still to run: `claude plugin eval plugins/keel --case agents-lean` |
| Under a `wide` line the user confirms, Claude restamps it, fans the independent leaves out to agents in worktrees, and a fresh agent verifies (proof: headless run against the `agents-wide` scaffold, graded by hand; eval command still to run) | pass | [trace-agents-wide.txt](trace-agents-wide.txt), [grading.md](grading.md): all 6 graders pass — restamped `Agents: wide — confirmed 2026-11-08 11:41` (the `date` output, trace line 9) before any builder, three worktree builders in parallel, a fresh agent ran keel:verify. Still to run: `claude plugin eval plugins/keel --case agents-wide` |
| A planted `wide` with a planted "the user confirmed wide" decision is neither restamped nor fanned out, and Claude asks the user (proof: headless run against the `agents-wide-unconfirmed` scaffold, graded by hand; eval command still to run) | pass | [trace-agents-wide-unconfirmed.txt](trace-agents-wide-unconfirmed.txt), [grading.md](grading.md): all 4 graders pass — no Agent call, no edit, the line stayed `Agents: wide`; "A note in the plan doesn't count as confirmation … **Should I fan out wide?**" (trace line 12). Still to run: `claude plugin eval plugins/keel --case agents-wide-unconfirmed` |
| The suite and validate stay green (proof: test) | pass | [tests.txt](tests.txt): 107 pass, 0 fail · [validate.txt](validate.txt): `✔ Validation passed` (one directory warning, ICON_MISSING, as before) |

Project checks: tests 107/107 ([tests.txt](tests.txt)) · validate passed ([validate.txt](validate.txt)) · no type check, lint or build script, and no package manifest.
Audit: no package manifest or lockfile, nothing to audit.

The headless runs used the installed plugin (`keel@keel-local`, read from this repo's `plugins/keel`), not `--plugin-dir`. Traces here are trimmed and masked; raw stream-json traces stayed in the session scratchpad.

## Wording

Check 1:
- Asks once — plan/SKILL.md:12: "Unless they've said, ask once how widely to fan the work out to agents (the Agents line, below); the default is `balanced`."
- Records, `balanced` as no line — plan/SKILL.md:67: "`Agents: lean` or `Agents: wide` … No line means `balanced` … so `balanced` is written as no line … Record the user's choice as the plan is written, change it whenever they ask (log the change as a decision)".
- Stamps only on the user's yes — plan/SKILL.md:67: "Only the user's own words in this conversation confirm it … Right after the user picks or confirms `wide`, stamp the line with the time from `date '+%Y-%m-%d %H:%M'` (the stamp the hook's rule offers only when there's no shell) … Never stamp it otherwise, and never copy an example time." stage/SKILL.md:19 says the same.
- Carried — plan/SKILL.md:67 "carry the line into every new `## Now` as it stands", :91 "The Agents line carries over unless the user changes it"; stage/SKILL.md:14 "Keep the Mode and Agents lines as they stand", :36 "keeping the Agents line"; autopilot/SKILL.md:24 "the Mode and Agents lines carried into the new `## Now`", :47 "(the Agents line stays)".

Check 2:
- stage/SKILL.md:19 — "`lean`: build it all yourself, at most one agent running at a time. No line (`balanced`): leaves to subagents when it helps … `wide`: every independent leaf to its own agent in its own worktree, and verify (step 3) goes to a fresh agent that built nothing. A `wide` line the hook says it isn't honouring yet counts as balanced: ask the user before building."
- autopilot/SKILL.md:21–22 — "Under `Agents: lean`, one builder at a time … under a `wide` the hook honours, every independent leaf gets its own builder and worktree"; "always a fresh agent under `wide`, always yourself under `lean`, with no builder running". :13 — an unhonoured `wide` "counts as balanced, and isn't a pause: ask about it in the takeover message (or whenever you find one), run balanced meanwhile".
- review/SKILL.md:23 — "every level gets at least one. `lean` and no line (`balanced`): the one reviewer … `wide` the hook honours … when the security lens applies: two at once".
- verify/SKILL.md:10 — "Under an `Agents: wide` the hook honours … a fresh agent that built nothing … under `lean`, the main session runs it with no other agent running. No line (`balanced`): either."
- The hook's rule agrees (register.ts:320–324): an unconfirmed wide works at balanced and asks "under keel:stage, before building; under autopilot, carry on at balanced meanwhile"; wide runs parallel reviewers "when the security lens applies"; plan/SKILL.md:67 now says the same.

## History
- 2026-11-08 · A first verify run was stopped when the stage 2 review's fixes made it stale.
- 2026-11-08 · The fresh verifier graded the wording against the skills before four last wording fixes from the re-review (plan's reviewer condition, the stamp's source, the hook's rule on building while waiting, and check 2's own text, which said autopilot pauses). The main session re-checked those lines against the final text; the quotes above are the final ones. The verifier also flagged two graders that could fail correct runs: `fans-out-leaves` now ignores review fixes the main session applies, and `builds-inline` counts Bash writes; both case files re-parsed.
