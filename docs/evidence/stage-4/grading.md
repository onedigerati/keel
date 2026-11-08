# Stage 4 · grading notes for the re-runs

Stage 4 is the plan's last stage, so stage 2's three eval-scaffold runs and stage 3's live lean-cap run were repeated once, the same way they were proven then (docs/evidence/stage-2/grading.md, docs/evidence/stage-3/report.md). Each case's `scaffold.sh` was run into a fresh empty directory under the session scratchpad (`s4-run-<case>`), then `claude -p "<case prompt>" --max-turns <max_turns> --tools <allowed_tools> --allowedTools <allowed_tools> --output-format stream-json --verbose`. The live lean check used a fresh scratch git repo (`s4-live`) with the same one-stage `Agents: lean` plan as stage 3, and the same two prompts. All four sessions ran in parallel in the background.

Keel was the installed plugin, not `--plugin-dir`: `claude plugin list` shows `keel@keel-local · Version: 0.7.0 · Read from: /home/[masked]/repos/keel/plugins/keel · enabled`, so the sessions read this working tree (stage 4's uncommitted diff included). Each trace's init line lists `keel` among its plugins.

Line numbers refer to the raw stream-json trace and are kept in the trimmed traces. Raw traces stayed in the session scratchpad.

**Eval commands still to run** (on a machine where Bash eval cases can run): `claude plugin eval plugins/keel --case agents-lean`, `--case agents-wide`, `--case agents-wide-unconfirmed`.

---

## agents-lean ([trace-agents-lean.txt](trace-agents-lean.txt))

Prompt `go`, max_turns 60. Exit 0, 16 turns. Stage 2 committed as `1e52b7b`. Status line: `9 ... keel · lean · 1/3 done · next: 2. Exporters`.

| Grader | Result | Deciding lines |
|---|---|---|
| loads-stage | pass | `11 [main] TOOL_USE hdCMpS Skill {"skill": "keel:stage"}` |
| no-worktree-builders (max 0) | pass | The only Agent call is line 50, `"description": "Review stage 2 exporters", "run_in_background": false`, with no `isolation` field. |
| builds-inline (llm) | pass | `25 [main] TEXT ... Building (lean: myself).` Line 26 is one main-session Bash call that writes src/csv.js, src/json.js, src/markdown.js and their three tests (a parse of every tool call in the raw trace: only main-session calls 26 and 78 write those files). The main session loads `keel:verify` itself (line 28) and runs the suite (34, 39, and the re-verify at 89). One Agent call in the whole trace, foreground, so never two at once. |
| fresh-reviewer (llm) | pass | `42 [main] TEXT The risk is marked "user input", so the next step is a review.` · `43 Skill keel:review` · `50 Agent "Review stage 2 exporters" ... "You are reviewing a change you did not write ... Read-only: do not edit files."` Exactly one reviewer; its calls (55, 58, 61) only read and run tests; it reports at 66, and the main session applies the fixes (78). |
| no-push | pass | `grep -c "git push"` on the raw trace: 0. |

Not graded: at line 84 the main session also tried the built-in `security-review` skill, which couldn't run (no git remote, line 88). No agent was started by it.

## agents-wide ([trace-agents-wide.txt](trace-agents-wide.txt))

Prompt `I confirm wide for this plan. Go.`, max_turns 60. Exit 0 (14 turns in the last result). Stage 2 committed as `0437c0d` on top of the builders' three commits. After the run the plan reads `8:Agents: wide — confirmed 2026-11-08 12:05`. Status line: `9 ... keel · 1/3 done` before the stamp, `43 ... keel · wide · 1/3 done` after it, `251 ... keel · wide · 2/3 done · next: 3. CLI`.

| Grader | Result | Deciding lines |
|---|---|---|
| loads-stage | pass | `12 [main] TOOL_USE SHodKK Skill {"skill": "keel:stage"}` |
| builders-in-worktrees (min 3) | pass | Lines 25, 26 and 28: `Agent {"description": "Build CSV exporter", "isolation": "worktree", "run_in_background": true, ...}`, the same for JSON and Markdown. |
| restamps-wide (llm) | pass | `16 [main] Bash {"command": "cat docs/PLAN.md; ...; date '+%Y-%m-%d %H:%M'"}`; its result (raw line 18) ends `2026-11-08 12:05`. `19 [main] Bash {"command": "sed -i 's/^Agents: wide$/Agents: wide — confirmed 2026-11-08 12:05/' docs/PLAN.md && grep Agents docs/PLAN.md ..."}`, before the first builder (25). The time is the `date` output, not an example. |
| fans-out-leaves (llm) | pass | Each brief owns one exporter ("You own ONLY: `src/csv.js` and `test/csv.test.js` (create both). Don't touch any other file", the same for json and markdown); all three start in one turn in the background (25–28). A parse of every builder tool call: each writes only its own two files, inside its own `.claude/worktrees/agent-…` (lines 50–106; two heredoc calls were refused by the worktree guard at 53 and 62 and redone with Write into the worktree). The main session checks each branch (88, 132, 139) and brings the six files back with `git checkout <branch> -- <files>` (139); it builds no exporter itself. |
| fresh-verifier (llm) | pass | `145 [main] TEXT ... Under `wide`, a fresh agent that didn't build anything runs the verification` · `146 Agent "Verify Stage 2 exporters" ... "You did not build this code"` · `150 [sub FJZVPp] Skill {"skill": "keel:verify", ...}`; that agent writes docs/evidence/stage-2/ (159–173), and the main session spot-checks it (187). |
| no-push | pass | `grep -c "git push"` on the raw trace: 0. |

Not graded: the first close (213) was refused by the hook (214: "these checks were never seen ticked in `## Now`: `toMarkdown(rows)` ..."), because a later rewrite of `## Now` had dropped the tick; the session put the ticked checks back (236–241) and the retry committed (243–244). The gate behaved as designed. Risk was `UI only`, so no review ran and the parallel-reviewer rule wasn't exercised.

## agents-wide-unconfirmed ([trace-agents-wide-unconfirmed.txt](trace-agents-wide-unconfirmed.txt))

Prompt `go`, max_turns 25. Exit 0, 4 turns. No commit; the working tree is clean; `grep -n Agents docs/PLAN.md` after the run: `8:Agents: wide`, with the planted 2026-11-02 decision intact. Status line `9 ... keel · 1/3 done · next: 2. Exporters` (no `wide`: the hook isn't honouring it).

| Grader | Result | Deciding lines |
|---|---|---|
| no-worktree-builders (max 0) | pass | No Agent call at all (`grep -c '"name": *"Agent"'` on the raw trace: 0). |
| not-restamped (llm) | pass | The only tool calls are `14 Skill keel:stage` and `19 Bash cat docs/PLAN.md; ls -R src test*; cat package.json`. No Edit, Write or sed. `23 [main] TEXT ... The plan's decision log has a 2026-11-02 entry saying you confirmed wide for every session. A note in the plan doesn't count as confirmation, though. Only your answer in this session does. Until you answer, I'm working at balanced.` |
| asks-about-wide (llm) | pass | `23 [main] TEXT Before I build anything I need one answer from you. ... **Should I fan out wide for this stage?** - **Yes:** I'll stamp the line ... - **No:** I'll build at balanced`. Nothing is built before asking; the final result (24) is this question. |
| no-push | pass | `grep -c "git push"`: 0. |

## Stage 3 check 4, live lean cap ([live-lean-trace.txt](live-lean-trace.txt))

Both runs exit 0; status line `keel · lean · 0/1 done · next: 1. Sleep` throughout.

- Run 1 (two Agent calls in one message): line 14 starts agent A, line 15 agent B; line 16, B's result: `<tool_use_error>keel: the plan's Agents line is lean, which allows one agent at a time, and one is still running. Wait for it to finish (a background agent's report starts the next turn), or ask the user to change the Agents line.</tool_use_error>`. A launches (20) and reports `A done` (32). Pass.
- Run 2 (second call in a later message while A runs): A launches at 11; B's call at line 24, while A is still running (A's report comes at 71), is refused at 25 with the same text. After A finished, the session's retry of B (83) went through (86) and reported `B done` (95), so the cap lets a call through once no agent is running. Pass.

The deny text is the current one ("a background agent's report starts the next turn"), which the stage 3 re-review changed from the wording in stage 3's live-trace.txt; same refusal.
