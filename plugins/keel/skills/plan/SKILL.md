---
name: plan
description: Create or update the project's single plan file (docs/PLAN.md) — goal, current position, stages with acceptance checks and risk, dated decisions, open questions. Use when starting a multi-step project, when the user makes or changes a decision worth keeping, when scope or direction shifts, or when asked to plan or re-plan.
---

# Keel: plan

One file holds the project's state: `docs/PLAN.md`. If the project already keeps a plan elsewhere (`PLAN.md`, `docs/BUILD_PLAN.md`), adopt that file and its layout instead of starting a second one; add the sections below that it lacks. The keel hook reads the `## Now` section into every request and the `## Stages` checklist into the status line, so keep those two headings exact.

## Creating a plan

1. Gather what's already known: the user's words in this conversation, the repo (README, existing docs, code layout), and memory. Ask only about real gaps, in one short round, and only those whose answer changes the plan: who it's for, what "done" looks like, hard constraints, what's out of scope. Pick sensible defaults for the rest and record them as decisions.
2. Cut the work into stages a user can review in one sitting. Each stage ends in something that runs and can be checked. Earlier stages lay foundations the later ones reuse. Three to eight stages is typical; more means the stages are too small or the project should be split.
3. Write the file using the layout below, then show the user the stage list and the decisions you defaulted, and ask whether to start: stage by stage (`keel:stage`), or the whole plan on autopilot (`keel:autopilot`).

## Layout

```markdown
# <Project> plan

## Goal
One paragraph: what this is, who it's for, and what done looks like.

## Now
Stage 2 of 5 · <name>
Risk: UI only
Checks:
- [ ] <observable outcome> (proof: test | run the product | command)
- [ ] <observable outcome> (proof: …)
Open: <decision waiting on the user, or "none">

## Stages
- [x] 1. <Name> — <one-line scope>
- [ ] 2. <Name> — <one-line scope>

## Decisions
- 2026-10-24 · <decision> — <why>

## Open questions
- <question> — <who decides, what it blocks>
```

The risk line is `UI only`, or a list of what the stage touches: user input, auth, money, personal data, secrets, external services.

While `keel:autopilot` drives the plan, `## Now` also carries a mode line: `Mode: autopilot`, or `Mode: paused — <reason>` while it waits on the user. No mode line means the user steps through the stages themselves. The line records where a run stands; it doesn't authorize one. A session arms autopilot only when the user starts it there, so a line left from an earlier session waits for the user's go.

Checks start unticked and are ticked (`- [x]`) as `keel:verify` proves them; the keel hook refuses a commit that closes a stage whose checks it never saw ticked.

## Rules that keep it useful

- **Readable in two minutes.** It's a map, not a spec. Detail belongs in code, tests and commit messages.
- **Acceptance checks are observable.** "The listing page shows the verified badge for 14 Alder Lane" is checkable; "badge works" is not. Each names its proof. Logic that can be quietly wrong (money, dates, parsing, permissions) is proven by an automated test.
- **Risk is decided per stage.** Anything beyond "UI only" means the stage gets the security pass in `keel:review`. When unsure, mark it: a review costs minutes, a breach doesn't.
- **Decisions are dated and give the why.** Never delete one; when a decision is replaced, strike it through (`~~old~~`) and add the new one with its reason. Convert relative dates ("next week") to absolute ones.
- **`## Now` always matches reality.** Update it in the same change as the work it describes, not later.
- **Write dates in ISO form** (2026-10-24) and stage names short enough for a status line.

## Updating a plan

When the user decides something, changes direction, or a stage reveals something the plan got wrong: edit the plan in place (decisions log, stages, Now) and say in one line what changed. If the change invalidates finished stages, say which, and ask before redoing them.
