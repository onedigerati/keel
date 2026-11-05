---
name: autopilot
description: Take over an approved plan as its project manager and see it through — run every remaining stage through build, verify, review and commit without stopping between stages, keep the plan current, and come back to the user only when a decision is theirs, a stage is risky, or something is stuck. Use when the user approves a plan and says to run it, take over, see it through, or put it on autopilot.
---

# Keel: autopilot

You're the project manager. You don't write the code; you make sure it gets built, proven and committed, stage after stage, until the plan's goal is met. The user hands over at the plan and comes back at the end, or when you call them.

## 1. Take over

- Read the plan. No plan, or stages without acceptance checks: run `keel:plan` first and get the user's yes. Autopilot runs a plan the user approved, never one you wrote alone.
- Add `Mode: autopilot` to `## Now`. Turning the line on in this session, or the user starting this skill, is what arms the keel hook; a Mode line already in the plan from an earlier session (or shipped in someone else's repo) never drives a session by itself. Tell the user in a few lines: you're taking over, the stages left, and the ones you'll stop before (section 3).
- The keel hook keeps the run going. When a turn ends in autopilot with stages left, it compacts the context if it's past 65% full, then prompts you to carry on. So end a turn only when a stage is closed, you've paused, or you're waiting on background builders; the next one starts on its own (the hook waits while builders the main loop started are still running, and their reports start the next turn).

## 2. Run each stage

This is `keel:stage` with you delegating rather than building:

1. **Scope.** Write `## Now` for the stage: scope, risk line, checks with proofs, open decisions. If the risk line names auth, money or personal data, or an open decision blocks the stage, pause (section 3) before building.
2. **Build, by delegation.** Spawn builder agents with peer briefs as `keel:stage` describes, the stage's checks quoted from the plan. Foundation first, by one builder in the main tree; independent leaves in parallel after, each with `isolation: "worktree"` so they can't collide, and merge each builder's branch back once you've checked it. Each reports what it changed and how it checked it.
3. **Prove it independently.** A builder's "done" is a claim. Run `keel:verify`, or hand it to a fresh agent that built nothing and have it return the evidence for each check; spot-check that evidence, and tick each proven check in `## Now`. Failures go back to a builder with the failing output.
4. **Review.** Run `keel:review` when `keel:stage` would. Fixes go to a builder; re-verify what they touch.
5. **Close.** Update the plan and commit as `keel:stage` step 5 says, then go straight on to the next stage. No stop-and-report in between; keep a line per stage for the final report.

Small decisions inside the plan's intent are yours: make them, log them dated with the why, and list them at the end.

Keep your context lean. Diffs and logs stay with the agents; you hold the plan, the briefs, the verdicts and the evidence. Read code only for a spot check or to settle a disagreement.

## 3. When to stop and call the user

The keel hook enforces the first and last of these while autopilot is armed: it holds a stage whose risk line names auth, money or personal data (no file edits outside the plan, no builder agents) until the user speaks, it blocks outward-facing commands (push, publish, deploy, sending data to an outside service), and it refuses a commit that closes a stage whose checks were never seen ticked. Don't work around a block; it means pause.

Pause when:
- the next stage's risk line names auth, money or personal data (before building it);
- a decision only the user can make blocks the work: scope, a product choice, a trade-off the plan doesn't settle;
- a check still fails after three fix rounds, or a builder's report and the evidence disagree and you can't settle it;
- the work shows the plan is wrong: a finished stage needs redoing, the scope must grow, a decision no longer holds;
- the next step is outward-facing or hard to undo: push, deploy, publish, send to an external service, migrate or delete real data, spend money.

To pause: commit what's finished and verified (never half a stage), set `Mode: paused — <reason>` in `## Now`, and tell the user in a few lines what you need: the question, the options with your recommendation, and where the run stands. The hook sees the pause, stops prompting, and notifies the user.

When the user answers, record the decision, set `Mode: autopilot` and carry on. If the user says stop, or changes direction, remove the `Mode:` line before anything else; the plan is theirs again.

## 4. Finish

When the last stage closes, remove the `Mode:` line, set `## Now` to "All stages done", and give one report:
- what the project delivers against the plan's goal;
- a line per stage: what it delivers, how it was verified, what review fixed;
- what was deferred (the plan's open questions), and the decisions you made along the way;
- anything you'd check yourself before shipping.
