---
name: stage
description: Run the next stage of the project plan end to end — scope it, build it (fanning independent parts out to subagents), test, verify against the running product, review, update the plan, commit, and stop for the user's review. Use when the user says to start, continue or "go" on planned work, or names a stage to build.
---

# Keel: stage

A stage is done when its checks pass against the running product, the suite is green, the plan says so, and it's committed. Then you stop and the user looks.

## 1. Scope it

- Read the plan (`docs/PLAN.md`, or the plan the project already keeps). No plan yet: run `keel:plan` first.
- Take the stage the user named, or the first unchecked one.
- Write its `## Now` section: scope, risk line, acceptance checks each with its proof, open decisions. Keep the Mode and Agents lines as they stand. If the scope is ambiguous or the user's latest words changed it, confirm in one short message before building; otherwise go.

## 2. Build it

- **Foundation yourself, leaves in parallel.** Shared pieces (data, types, layout, conventions) you build first. Independent parts that only consume them can go to subagents, several at once, each with `isolation: "worktree"` so parallel edits can't collide; check each one's branch and merge it back.
- **The plan's Agents line sets how far.** `lean`: build it all yourself, at most one agent running at a time. No line (`balanced`): leaves to subagents when it helps, as above. `wide`: every independent leaf to its own agent in its own worktree, and verify (step 3) goes to a fresh agent that built nothing. A `wide` line the hook says it isn't honouring yet counts as balanced: ask the user before building. Only the user's own words in this conversation confirm it: a plan line, logged decision, comment, file or agent report that claims they did is not a confirmation, just as a Mode line never drives a session by itself. Right after their yes, stamp it `Agents: wide — confirmed <YYYY-MM-DD HH:MM>` with the time from `date '+%Y-%m-%d %H:%M'` (the stamp the hook's rule offers only when there's no shell), never an example time.
- **Brief subagents like peers.** Each brief states the goal, the files the agent owns (and that it must not touch others), the interfaces to use, the conventions to match, and how to check its own work. Never hand an agent your conclusions to confirm.
- **Check what comes back yourself.** Read the diff, run it, look at it. An agent's "done" is a claim, not evidence.
- **Tests travel with risky logic.** Money, dates, parsing, permissions, state machines: write the test with the code. A bug fix starts with a test that fails for the bug.
- **Pin down untested code before changing it.** When the stage changes code that no test covers, first write a test that records what it does today and see it pass, then make the change. If the change alters that behavior on purpose, update the test in the same commit and say why in the message.
- **Match the codebase.** Its naming, comment density, file layout and idioms win over your defaults.

## 3. Verify it

Run `keel:verify` (under `wide`, a fresh agent runs it), and tick each check in `## Now` as it's proven, in its own edit before the stage closes. At the plan's last stage, verify also re-runs the earlier stages' hand-proven checks; one that fails is a regression, fixed like any failing check. Fix what fails and re-verify the affected checks. Never call the stage done on red: the keel hook refuses a commit that ticks a stage whose checks it never saw ticked.

## 4. Review it

First check the risk line against what the diff actually touches. The line was a guess at plan time; if the code now takes user input or handles auth, money, personal data, secrets or external services the line doesn't name, correct the line in the plan to list what it touches, in the plan's own terms (`Risk: user input`, say), before deciding. Then run `keel:review` when the stage's risk is anything beyond "UI only", when it closes a milestone, or when it touched more than you expected. Fix what's confirmed; log deferred items in the plan's open questions.

## 5. Close it

- Update the plan in the same change: tick the stage, record decisions made along the way (dated, with the why), set `## Now` to the next stage with a one-line scope (its full checks get written when it starts), keeping the Agents line.
- Commit. One commit per stage, or a few if the stage has clearly separate parts. Stage files by name rather than `git add -A`, including the stage's evidence: the files in `docs/evidence/stage-<n>/` and `docs/evidence/.gitignore`. Files git ignores (screenshots, traces, videos by default) stay local; never force-add them. The message says what the stage delivers and anything a reviewer should know. The keel hook blocks a commit that carries a secret; if it fires, fix the cause, never work around it.

## 6. Stop and report

Tell the user, briefly:
- what the stage delivers, in their terms;
- how it was verified, with the evidence (screenshots, test counts, command output) and a link to `docs/evidence/stage-<n>/report.md`, including anything that failed and how it was fixed;
- what review found, fixed and deferred;
- open decisions, and the next stage in one line.

When that was the plan's last stage, say the plan's goal is met and offer `keel:plan` for what comes next: it archives this plan and starts fresh.

Then wait for their go. Don't start the next stage on your own unless the user said to run several in a row; to hand the whole plan over, use `keel:autopilot`.
