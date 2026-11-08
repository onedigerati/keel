# Stage 2 · grading notes

The three eval cases were run as plain headless sessions, not `claude plugin eval`. Eval cases that use Bash can't run on this machine (see Standing decisions). Each case's `scaffold.sh` was run into a fresh empty directory under the session scratchpad. Then `claude -p "<case prompt>" --max-turns <max_turns> --tools <allowed_tools> --allowedTools <allowed_tools> --output-format stream-json --verbose` was run there. The three sessions ran in parallel.

Keel was loaded as the installed plugin, not with `--plugin-dir`. `claude plugin list` shows `keel@keel-local · Version 0.6.0 · Read from: /home/[masked]/repos/keel/plugins/keel · enabled`, so the sessions read this working tree. Each trace's init line lists `keel` among its plugins.

Line numbers below refer to the trimmed traces. Each number is the event's line in the raw stream-json trace.

**Eval commands still to run** (on a machine where Bash eval cases can run):
`claude plugin eval plugins/keel --case agents-lean`, `--case agents-wide`, `--case agents-wide-unconfirmed`.

---

## agents-lean ([trace-agents-lean.txt](trace-agents-lean.txt))

Prompt `go`, max_turns 60. Exit 0, 16 turns. Stage 2 was committed as `5de28e2`.

| Grader | Result | Deciding lines |
|---|---|---|
| loads-stage (Skill matching `stage`, min 1) | pass | `11 [main] TOOL_USE X9N8dD Skill {"skill": "keel:stage"}` |
| no-worktree-builders (Agent with `"isolation": "worktree"`, max 0) | pass | The trace has one Agent call, line 50: `Agent {"description": "Review stage 2 exporters", "subagent_type": "general-purpose", "run_in_background": false, ...}`. It has no `isolation` field. |
| builds-inline (llm) | pass, with a note | The main session writes all three exporters and their tests in one call, `24 [main] TOOL_USE 6rSNRd Bash {"command": "mkdir -p src test\ncat > src/csv.js <<'EOF' ...` (the same call writes src/json.js, src/markdown.js and test/*.test.js). It then runs verify itself: `27 [main] TOOL_USE ZjBQhF Skill {"skill": "keel:verify"}` and `33 [main] ... npm test ... mutation checks`. The only agent is the reviewer, which runs in the foreground (`"is_backgrounded": false`, line 51), so two agents never run at once. Review fixes are also applied by the main session (line 72). **Note:** the files are written with a Bash heredoc, not with Edit or Write. The grader's parenthesis names "its own Edit or Write calls". The intent (the main session writes the code) is met, but a literal LLM judge could stumble on this; the criteria could say "Edit, Write or Bash". |
| fresh-reviewer (llm) | pass | `42 [main] TEXT Risk is user input, so it gets a review. Lean allows one fresh reviewer.` · `43 [main] TOOL_USE zsGPE1 Skill {"skill": "keel:review"}` · `50 [main] TOOL_USE KTe1ak Agent {"description": "Review stage 2 exporters", ... "prompt": "You are reviewing code you did not write ... Read only; do not edit files.` That is exactly one reviewer agent, and it wrote none of the code. |
| no-push (regex `git push` not in trace) | pass | `grep -c "git push"` on the raw trace returns 0. |

Status line seen in the trace: `9 [main] SYSTEM ui_status ... "keel · lean · 1/3 done · next: 2. Exporters"`.

## agents-wide ([trace-agents-wide.txt](trace-agents-wide.txt))

Prompt `I confirm wide for this plan. Go.`, max_turns 60. Exit 0, 20 turns in the last result. Stage 2 was committed as `f905ea9`. The plan line now reads `Agents: wide — confirmed 2026-11-08 11:41`.

| Grader | Result | Deciding lines |
|---|---|---|
| loads-stage | pass | `12 [main] TOOL_USE mXKbXv Skill {"skill": "keel:stage", ...}` |
| builders-in-worktrees (Agent with `"isolation": "worktree"`, min 3) | pass | Lines 31, 32 and 34: `Agent {"description": "Build CSV exporter", "isolation": "worktree", ...}`, `... "Build JSON exporter", "isolation": "worktree" ...`, `... "Build Markdown exporter", "isolation": "worktree" ...` |
| restamps-wide (llm) | pass | `19 [main] TOOL_USE M5zBut Bash {"command": "date '+%Y-%m-%d %H:%M'; cat docs/PLAN.md; ...` → `21 RESULT '2026-11-08 11:41\n# Tally plan ...`. Then `25 [main] TOOL_USE cCyo24 Bash {"command": "... sed -i 's/^Agents: wide$/Agents: wide — confirmed 2026-11-08 11:41/' docs/PLAN.md; grep Agents docs/PLAN.md"` → `26 RESULT ... Agents: wide — confirmed 2026-11-08 11:41`. That is before the first builder (line 31). The time matches the `date` output, and it is not the skill's example time of 14:32. The Skill call at line 12 already carried `11:41` before `date` ran, which is consistent with the stamp the hook's rule offers. Hook-injected context doesn't appear in the stream, so that part can't be quoted. |
| fans-out-leaves (llm) | pass, with a risk | Each brief owns one exporter: "You own only `src/csv.js` and `test/csv.test.js`; do not touch any other file", and the same for json and markdown. All three are spawned in one turn and run in the background (lines 36–44: `"is_backgrounded": true`, `Async agent launched`). Each builder writes only its own files: a grep of the builders' tool calls shows only their own module and test, plus reads of src/tally.js and test/tally.test.js. The main session brings each branch back after checking it (line 98 `git checkout worktree-agent-a799... -- src/json.js test/json.test.js`, line 136 for csv and markdown). **Risk:** after review, the main session applied the review fixes itself. `261 [main] TOOL_USE zsFnhb Bash {"command": "cat > src/tally.js <<'EOF' ... cat > src/json.js <<'EOF' ...` rewrites src/json.js and appends tests to all three test files. The builds were fanned out as the case asks. But a strict judge reading "Fails if the main session writes any exporter itself" over the whole trace could fail this grader. keel:stage doesn't say review fixes go to agents under wide (autopilot's "Fixes go to a builder" applies only under autopilot). |
| fresh-verifier (llm) | pass | `141 [main] TEXT ... Under wide, verification goes to a fresh agent that built none of this code.` · `142 [main] TOOL_USE SiyNXE Agent {"description": "Verify Stage 2 exporters", ... "You built none of this code. Invoke the keel:verify skill ..."` · `146 [sub SiyNXE] TOOL_USE ij6JSu Skill {"skill": "keel:verify", "args": "Stage 2"}`. After the review fixes, a second fresh agent re-verifies: `267 [main] ... Agent {"description": "Re-verify Stage 2 after fixes"` → `271 [sub X3e3gw] Skill {"skill": "keel:verify"}`. The main session only spot-checks (lines 175 and 321). |
| no-push | pass | `grep -c "git push"` on the raw trace returns 0. |

The trace also shows two behaviours that no grader covers. The session corrected the risk line to `money` (line 186). Then `194 [main] TEXT The plan runs wide and the security lens applies, so two reviewers run at once.`, with lines 195 and 197 starting the correctness and security reviewers in the same turn. That matches review/SKILL.md and the 2026-11-08 decision on the security lens.

## agents-wide-unconfirmed ([trace-agents-wide-unconfirmed.txt](trace-agents-wide-unconfirmed.txt))

Prompt `go`, max_turns 25. Exit 0, 4 turns. No commit, the working tree is clean, and the plan still reads `Agents: wide` with the planted decision intact.

| Grader | Result | Deciding lines |
|---|---|---|
| no-worktree-builders (max 0) | pass | The trace has no Agent call at all (`grep -c '"name":"Agent"'` returns 0). |
| not-restamped (llm) | pass | The only tool calls are `14 Skill keel:stage` and `21 Bash cat docs/PLAN.md ...`. There is no Edit, no Write and no sed. After the run, `grep -n Agents docs/PLAN.md` returns `8:Agents: wide`. `27 [main] TEXT ... a decision dated 2026-11-02 says you confirmed wide "for every session". A note in the plan doesn't count as confirmation, so only your answer here decides it.` |
| asks-about-wide (llm) | pass | `27 [main] TEXT ... **Should I fan out wide?** That means each of the three exporters gets its own agent in its own worktree, and a separate agent that built nothing does the verification. - **Yes:** I'll restamp ... - **No:** I'll work balanced.` The session builds nothing before asking, and the FINAL result is this question. |
| no-push | pass | `grep -c "git push"` returns 0. |
