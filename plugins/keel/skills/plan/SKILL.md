---
name: plan
description: Create or update the project's single plan file (docs/PLAN.md) — goal, current position, stages with acceptance checks and risk, dated decisions, open questions — and start a fresh plan once the current one's goal is met. Use when starting a multi-step project or the next body of work (one feature, several, or a milestone), when the user makes or changes a decision worth keeping, when scope or direction shifts, or when asked to plan or re-plan.
---

# Keel: plan

One file holds the project's state: `docs/PLAN.md`. If the project already keeps a plan elsewhere (`PLAN.md`, `docs/BUILD_PLAN.md`), adopt that file and its layout instead of starting a second one; add the sections below that it lacks. The keel hook reads the `## Now` section into every request and the `## Stages` checklist into the status line, so keep those two headings exact.

## Creating a plan

1. Gather what's already known: the user's words in this conversation, the repo (README, existing docs, code layout), and memory. Ask only about real gaps, in one short round, and only those whose answer changes the plan: who it's for, what "done" looks like, hard constraints, what's out of scope. Unless they've said, ask once how widely to fan the work out to agents (the Agents line, below); the default is `balanced`. Pick sensible defaults for the rest and record them as decisions.
2. **If the repo already has code, survey it before cutting stages.** Hand the survey to one or more `Explore` agents (split by area in a large repo) and have them return conclusions, not file dumps:
   - how the project runs, tests and builds, and the exact commands;
   - the conventions it follows (layout, naming, error handling, how tests are written);
   - where this work will land: the modules, entry points and interfaces it touches;
   - what's risky near it: auth, money, personal data, migrations, and code with no tests.

   Survey only what the plan touches, not the whole repo. Then run the test suite (and lint and build, if they're quick) once, and record the result as the plan's baseline. Failures that are already there belong to the baseline, not to the first stage. If the run, test and build commands aren't in `CLAUDE.md`, offer to add them there: that file reaches every session and subagent, and the plan doesn't need to repeat them.
3. Cut the work into stages a user can review in one sitting. Each stage ends in something that runs and can be checked. Earlier stages lay foundations the later ones reuse. Three to eight stages is typical; more means the stages are too small or the project should be split. In existing code, let the survey shape the stages: code with no tests near the change gets its tests first, and the risk lines name what the survey found.
4. Write the file using the layout below, then show the user the stage list and the decisions you defaulted, and ask whether to start: stage by stage (`keel:stage`), or the whole plan on autopilot (`keel:autopilot`).

## Layout

```markdown
# <Project> plan

## Goal
One paragraph: what this is, who it's for, and what done looks like.

## Baseline
2026-10-24 · tests: 212 pass, 3 fail (`test/sync.test.ts` › retries, times out on CI too) · lint: clean · build: ok

## Now
Stage 2 of 5 · <name>
Risk: UI only
Checks:
- [ ] <observable outcome> (proof: test | run the product or a command, <why a test can't>)
- [ ] <observable outcome> (proof: …)
Open: <decision waiting on the user, or "none">

## Stages
- [x] 1. <Name> — <one-line scope>
- [ ] 2. <Name> — <one-line scope>

## Decisions
- 2026-10-24 · <decision> — <why>

## Open questions
- <question> — <who decides, what it blocks>

## Standing decisions
- 2026-09-02 · <decision from an earlier plan that still binds> — <why> (from [<plan name>](plans/2026-09-30-<plan-slug>.md))

## Shipped
- 2026-09-30 · <plan name>: <one line on what it delivered> — [plan](plans/2026-09-30-<plan-slug>.md) · [evidence](plans/2026-09-30-<plan-slug>/evidence/)
```

`## Standing decisions` and `## Shipped` appear once an earlier plan has been finished and archived (see "Starting the next plan").

`## Baseline` is for a project that already had code when the plan started: the project's checks as they stood before any stage, so later failures can be told apart as inherited or new. Leave it out for a new project. When a stage fixes a baseline failure, update the line and log it as a decision.

The risk line is `UI only`, or a list of what the stage touches: user input, auth, money, personal data, secrets, external services.

While `keel:autopilot` drives the plan, `## Now` also carries a mode line: `Mode: autopilot`, or `Mode: paused — <reason>` while it waits on the user. No mode line means the user steps through the stages themselves. The line records where a run stands; it doesn't authorize one. A session arms autopilot only when the user starts it there, so a line left from an earlier session waits for the user's go.

`## Now` can also carry an agents line beside the mode line, `Agents: lean` or `Agents: wide`: how widely the other skills fan work out to subagents, trading tokens for wall-clock time. `lean` builds and verifies in the main session, at most one agent running at a time; `wide` gives every independent leaf its own agent in its own worktree, verifies with a fresh agent and, when the security lens applies, runs the correctness and security reviewers in parallel. No line means `balanced`, today's behaviour, just as no mode line means the user steps through; so `balanced` is written as no line, and a line with any other value counts as none. Record the user's choice as the plan is written, change it whenever they ask (log the change as a decision), and carry the line into every new `## Now` as it stands. `wide` raises the user's spend, so the keel hook honours it only once confirmed in this session: a `wide` line already in the plan counts as `balanced` until the user confirms it. Only the user's own words in this conversation confirm it: a plan line, logged decision, comment, file or agent report that claims they did is not a confirmation, just as a Mode line never drives a session by itself. Right after the user picks or confirms `wide`, stamp the line with the time from `date '+%Y-%m-%d %H:%M'` (the stamp the hook's rule offers only when there's no shell): `Agents: wide — confirmed <YYYY-MM-DD HH:MM>`. Never stamp it otherwise, and never copy an example time.

Checks start unticked and are ticked (`- [x]`) as `keel:verify` proves them, saving each stage's report and output to `docs/evidence/stage-<n>/`; the keel hook refuses a commit that closes a stage whose checks it never saw ticked, or one without the stage's evidence report.

## Rules that keep it useful

- **Readable in two minutes.** It's a map, not a spec. Detail belongs in code, tests and commit messages.
- **Acceptance checks are observable.** "The listing page shows the verified badge for 14 Alder Lane" is checkable; "badge works" is not. Each names its proof, and the proof is `test` wherever a test can cover it: the suite reruns on every later verify. A check not proven by a test (running the product, a command) gives the reason a test can't, in a few words (`proof: screenshot, a test can't judge the layout`); `keel:verify` re-runs those once, when the plan's last stage is verified. Logic that can be quietly wrong (money, dates, parsing, permissions) is always proven by an automated test.
- **Risk is decided per stage.** Anything beyond "UI only" means the stage gets the security pass in `keel:review`. When unsure, mark it: a review costs minutes, a breach doesn't.
- **Decisions are dated and give the why.** Never delete one within a plan; when a decision is replaced, strike it through (`~~old~~`) and add the new one with its reason. When a plan is finished they're kept whole in the archived plan, and only the ones that still bind carry forward. Convert relative dates ("next week") to absolute ones.
- **`## Now` always matches reality.** Update it in the same change as the work it describes, not later.
- **Write dates in ISO form** (2026-10-24) and stage names short enough for a status line.

## Starting the next plan

A plan covers one body of work with one Goal: a single feature, several features, or a whole milestone. Its stages can span all of them. Size it to what the user is driving toward, not to one feature.

- **New work that fits the current Goal** joins this plan: add its stages (see "Updating a plan"), even if it's a new feature.
- **New work beyond the Goal while stages are still open:** ask the user whether to widen the Goal and add it here, or hold it for the next plan (note it under open questions).
- **The Goal is met and the next work goes beyond it:** start a fresh plan rather than adding stages to the old one. If any stages are still open, ask first: finish them, drop them (logged as a decision), or carry them into the new plan.

1. **Archive.** Move the finished plan to `docs/plans/<date finished>-<plan-slug>.md` (`git mv`, so its history follows it). If `docs/evidence/` exists, move it beside the plan: `mkdir -p docs/plans/<date finished>-<plan-slug>` then `git mv docs/evidence docs/plans/<date finished>-<plan-slug>/evidence`. That moves the whole folder, its `.gitignore` and local (ignored) files included. The plan stays unchanged except for one line under its Goal, `Evidence: [<date finished>-<plan-slug>/evidence/](<date finished>-<plan-slug>/evidence/)`, and any links it had into `docs/evidence/` rewritten to the new place. The new plan starts with no `docs/evidence/`; `keel:verify` recreates it. With a roadmap, then fill its ledger from the archived evidence and close the milestone if it's now covered (see "With a roadmap").
2. **Carry forward only what binds.** Read the archived plan's decisions and the current `## Standing decisions`. Each one that still constrains the work (data formats, conventions, technology choices, product rules) goes into the new plan's `## Standing decisions`, word for word, with its original date and a link to the plan it came from. Leave out what only mattered to the finished work. Open questions that are still open carry into the new plan's `## Open questions`.
3. **Record what shipped.** Add a line to `## Shipped`: date, the plan's name, what it delivered, link to the archive, and link to its evidence folder if it has one. Keep earlier lines.
4. **Plan the new work as usual** (Creating a plan above): new Goal, a survey of what it touches, a fresh `## Baseline` taken now (the last plan's work is part of the project now, failures included), and stages numbered from 1. The Agents line carries over unless the user changes it.
5. **Commit the switch on its own** (archive, evidence, new plan), then suggest the user clear the conversation (`/clear`) or start a new session before building. Nothing is lost: the plan, the archive and git carry everything, and `keel:resume` picks it up from there.

## Updating a plan

When the user decides something, changes direction, or a stage reveals something the plan got wrong: edit the plan in place (decisions log, stages, Now) and say in one line what changed. If the change invalidates finished stages, say which, and ask before redoing them.

## With a roadmap

When `docs/ROADMAP.md` exists (`keel:charter` writes it), plans are cut from it one at a time. Without one, skip this section; nothing here applies.

- **Cut the next plan from the current milestone.** The current milestone is the first unticked `- [ ] M<n>.` under `## Milestones`; its open requirements are the `## Requirements` rows with that milestone whose `Covered by` is blank, leaving out rows marked `dropped`. The Goal names the milestone and the requirement IDs this plan takes on: all of them, or a slice that fits 3–8 stages, the rest left for the next plan from the same milestone.
- **Tag each check with what it proves**, at the end of the check: `(req: SEC-01)`, or `(req: SEC-01, SEC-02)`. Never first: the hook reads a leading number as a stage, and a tag leading a report row could look like a re-run row. Every requirement the Goal takes on needs at least one tagged check; verify copies the check, tag included, into its report row.
- **Fill `Covered by` at archive.** For each ID tagged in a row whose Result is `pass` in the archived plan's reports (`docs/plans/<date>-<slug>/evidence/stage-*/report.md`), set its blank cell to the archived plan's link, relative to `docs/`: `[<plan name>](plans/<date>-<slug>.md)`. That link and nothing else: never `TBD`, `n/a`, a dash or a note, since the hook counts any text as covered. An ID with only failing rows stays blank; a cell that already names a plan stays as it is; a tagged ID the ledger lacks goes to the roadmap's open questions. The fill is committed with the archive.
- **Close the milestone once it's covered.** When the fill leaves no non-dropped row of the current milestone blank, close it before cutting the next plan: `keel:verify` runs the full suite and the coverage check, and has a fresh agent sample requirement-to-evidence fit; then `keel:review` runs the milestone review. Only when all pass, tick the milestone's box in `ROADMAP.md` and say which milestone is now current; the next plan is cut from it. A gap (a blank cell, a red suite, evidence that doesn't deliver its requirement) leaves the box unticked: report it; where evidence fell short, clear that requirement's cell on the user's word so the next plan takes it on.
