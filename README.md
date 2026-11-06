# keel

A Claude Code plugin for long, multi-stage work. It keeps that work on course without a heavyweight process, and works on new projects and existing ones.

## Why "keel"

A keel is the spine along the bottom of a ship. It's the first piece laid when a ship is built, and it does two jobs. It stops the ship from drifting sideways when the wind pushes on it, and it keeps the ship upright, on an even keel. It does both from below the waterline, adding almost nothing to the ship you see.

Long work with Claude drifts in similar ways. Context gets summarized and the current stage gets lost. Scope creeps one feature at a time. A stage gets called done before anyone checked it. A run that's going well keeps going straight into a push, a deploy or a change to auth code. Keel is built to hold against each of these:

- **Laid first.** Work starts with a plan: a goal, stages with acceptance checks you can observe, a risk line for each stage, and dated decisions. Everything after that is built along it.
- **Holds the course.** The plan's current position rides in Claude's context, so it survives long sessions and compaction. New work either fits the plan's goal or waits for the next plan, and Claude asks which instead of quietly growing the scope.
- **Keeps it steady.** Each stage is verified against the running product, reviewed by fresh eyes when it's risky, and committed. Autopilot stops before risky and outward-facing steps, and those stops are enforced by hooks rather than left to good intentions.
- **Stays below the waterline.** The state is one plan file plus git. There's no separate codebase map, no tracker and no ceremony to maintain, so the structure doesn't get in the way of the work.

## What it does

- **One plan file plus git** hold all the state. The current stage rides in Claude's context, so it survives long sessions and compaction.
- **Staged work.** Each stage is verified against the running product, reviewed when risky, and committed.
- **Autopilot** runs an approved plan stage after stage. It pauses, enforced by hooks, before risky stages and anything outward-facing.
- **Secret guard:** commits that would carry a secret are blocked.

## Install

```
claude plugin marketplace add onedigerati/keel
claude plugin install keel@keel-local
```

See [plugins/keel/README.md](plugins/keel/README.md) for the skills, hooks and how a project flows from one plan to the next.
