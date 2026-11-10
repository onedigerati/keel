---
name: fix
description: Make a small, low-risk change without a stage — a style or copy tweak, a contained bug fix, a config or docs edit — built in the main session, checked in proportion to its risk, logged as one line in the plan and committed on its own. Use when the request fits the quick-fix bar below, when keel:plan or keel:autopilot recommends it and the user agrees, or when the user asks for a quick fix. Anything that misses the bar goes to keel:plan.
---

# Keel: fix

Most of keel is for work that needs a plan. Some changes don't: moving a glow behind a number, fixing a typo, swapping a default. A stage would cost a plan rewrite, an archive, agents and an evidence folder to prove a twenty-line diff. A fix costs the change, a proportionate check and one line in the plan.

## 1. Does it fit the bar?

A change is a fix only when all of these hold:

- **Small.** One sitting, a few files, a diff a reviewer reads in a minute or two.
- **Low risk.** Its risk line would be `UI only`, or it touches no runtime behaviour at all (docs, comments, config that only the build reads). It touches none of: user input handling, auth, money, personal data, secrets, external services, migrations, and no logic that can be quietly wrong (money, dates, parsing, permissions), however small the diff.
- **No new behaviour to accept.** "It looks or works the way the user asked" is the whole check. A change that needs acceptance checks written down to know it's done is a stage.
- **Already decided.** The user said what they want (or picked an option). A choice still open, or a change that would go against a decision in the plan or `docs/decisions.md`, is `keel:plan`'s.
- **Easy to undo.** A revert of its one commit takes it back. No data migrated, nothing published.
- **Not mid-stage.** It doesn't touch files the current open stage is changing. A fix never runs while autopilot is driving a stage or while a stage is held; ask the user to let the stage close first, or plan the change into it.

When unsure, it isn't a fix. Say in one line why it misses the bar, and run `keel:plan`.

The plan's Agents line doesn't apply to a fix: there's nothing to fan out, so it's built and checked in the main session, with no subagents. Under `lean`, `balanced` or `wide` alike.

## 2. Make the change

- Read the plan's `## Now`, its decisions and `docs/decisions.md` if it exists, so the fix doesn't cross one.
- Match the codebase, as in `keel:stage`.
- A bug fix starts with a test that fails for the bug, then makes it pass. Pure styling, copy and docs changes need no new test.

## 3. Check it, in proportion

- Run the project's quick checks: type check, lint, the test suite, and the build if the change could break it. All green, or the fix isn't done.
- If the change shows in the product, look at it once in the running app: a screenshot of what changed, plus each theme and the phone width where the project has them. One pass; fix what it shows, then look once more only if you changed something.
- No `keel:verify`, no `docs/evidence/` folder, no report. The commit and the plan line are the record.

**Escalate when it grows.** If the change turns out to touch something the bar rules out, spreads past a few files, needs a decision from the user, or a check fails in a way the fix didn't cause, stop. Leave the work uncommitted (or stash it), say in one or two lines what you found, and offer `keel:plan` to stage it. Don't finish a stage's worth of work on the fix path.

## 4. Log and commit

- **One line in the plan.** Add it under `## Fixes` in `docs/PLAN.md`, creating the section after `## Stages` if it isn't there: `- <YYYY-MM-DD> · <what changed, in the user's terms> — <how it was checked>`. Leave the Goal, `## Now`, the stages and the Mode and Agents lines as they are. A fix doesn't start a new plan or archive the current one, even when the current plan's goal is met: `## Fixes` travels with the plan into its archive like `## Decisions`. A decision the fix made that should bind later work goes in `## Decisions` as usual. With no plan in the project, skip the line; the commit is the record.
- **Commit it on its own**, files staged by name, with a subject starting `Fix:` and saying what changed. The keel hook's secret guard applies as always.
- Push and deploy only when the user says so, as for any stage.

## 5. Report

Tell the user in a few lines what changed, how it was checked (the commands that passed, and the screenshot), and the commit. No stage report.
