# keel

A Claude Code plugin for long, multi-stage work. It keeps that work on course without a heavyweight process, and works on new projects and existing ones.

## Why "keel"

A keel is the spine along the bottom of a ship. It's the first piece laid when a ship is built, and it does two jobs. It stops the ship from drifting sideways when the wind pushes on it, and it keeps the ship upright, on an even keel. It does both from below the waterline, adding almost nothing to the ship you see.

Long work with Claude drifts in similar ways. Context gets summarized and the current stage gets lost. Scope creeps one feature at a time. A stage gets called done before anyone checked it. A run that's going well keeps going straight into a push, a deploy or a change to auth code. Keel is built to hold against each of these:

- **Laid first.** Work starts with a plan: a goal, stages with acceptance checks you can observe, a risk line for each stage, and dated decisions. Everything after that is built along it.
- **Holds the course.** The plan's current position rides in Claude's context, so it survives long sessions and compaction. New work either fits the plan's goal or waits for the next plan, and Claude asks which instead of quietly growing the scope.
- **Keeps it steady.** Each stage is verified against the running product, reviewed by fresh eyes when it's risky, and committed. Checks are proven by tests where they can be, and the rest are re-run at the end of the plan, so a later stage can't break an earlier one without it showing by the end of the plan. Autopilot stops before risky and outward-facing steps, and those stops are enforced by hooks rather than left to good intentions.
- **Stays below the waterline.** The state is one plan file plus git. There's no separate codebase map, no tracker and no ceremony to maintain, so the structure doesn't get in the way of the work.

## What it does

- **New in 0.9.0.** Under autopilot, a risky stage that's held or paused is released only by your own reply opening with yes, yep, go, approve, approved, proceed or "build it" (followed by the end of the message, a line break, or punctuation other than `?`), or by `/keel:approve`; a status question leaves it held, and a plan paused on a risky stage is held too while autopilot is armed. The secret guard now also catches JWTs, bearer tokens (20 or more characters with a letter and a digit), and GitLab, npm, PyPI and SendGrid tokens. In `docs/evidence/`, it refuses an `Authorization`, `Proxy-Authorization`, `Cookie` or `Set-Cookie` header (or its `HTTP_COOKIE`-style env, curl `-b` or one-line HAR form) whose value still holds a credential-like string, 16 or more token characters with a letter and a digit, once `[masked]` and placeholders such as `$TOKEN` or `<token>` are taken out. A short value, a header split across lines and custom headers such as `X-Api-Key` aren't checked.
- **Large projects (new in 0.8.0).** When a PRD is too big for one plan, `keel:plan` asks once whether to chart it, and `keel:charter` turns it into `docs/ROADMAP.md`: milestones with dependencies and a ledger of the PRD's requirements. Plans are cut from the current milestone one at a time, and coverage fills in from passing evidence when a plan is archived. A milestone closes, in the next plan and before its stages are cut, only on the full suite, a coverage check, a fresh agent's evidence-fit sample and a milestone review, and a hook refuses a commit that ticks it unless `docs/evidence/milestone-<ID>.md` has a row for each of its requirements. A project without a roadmap works exactly as before.
- **One plan file plus git** hold all the state. The current stage rides in Claude's context, so it survives long sessions and compaction.
- **Staged work.** Each stage is verified against the running product, reviewed when risky, and committed. A stage's risk line is checked against what its code actually touches before review is decided.
- **Quick fixes.** A small, low-risk change that's already decided goes through `keel:fix`: made and checked in the main session, logged as one line in the plan and committed alone, without a stage, agents or an evidence folder. Anything that touches risky logic is still planned.
- **Autopilot** runs an approved plan stage after stage. It pauses, enforced by hooks, before risky stages and anything outward-facing.
- **Evidence.** Verifying a stage saves a per-check report and the output behind it to `docs/evidence/`, committed with the stage. A stage can't be closed without its report.
- **Agents level.** An `Agents: lean | wide` line in the plan sets how widely work fans out to subagents, trading tokens for wall-clock time; no line is balanced. `lean` is held to one running agent by a hook, and a `wide` line already in the plan when a session starts isn't honoured until you confirm it.
- **Project risk rules.** `Keel risk:` and `Keel outward:` lines in `CLAUDE.md` add a project's own hold words and outward commands. They only add to Keel's built-ins, never loosen them.
- **Secret guard:** commits that would carry a secret are blocked.

## Install

```
claude plugin marketplace add onedigerati/keel
claude plugin install keel@keel-local
```

See [plugins/keel/README.md](plugins/keel/README.md) for the skills, hooks and how a project flows from one plan to the next.
