---
name: charter
description: Chart a project too big for one plan — turn a PRD into docs/ROADMAP.md (milestones with dependencies, a requirement ledger, out of scope, open questions) and its locked decisions into CLAUDE.md, re-chart a changed PRD without losing history, and backfill coverage from shipped plans; then hand the first milestone to keel:plan. Use when the user asks to chart a PRD or spec, to set up a roadmap or milestones, when a project is too big for one plan, or when the PRD behind an existing roadmap has changed.
---

# Keel: charter

A plan holds one body of work. A PRD too big for one plan gets a roadmap: `docs/ROADMAP.md` says which milestones the project passes through and which requirement lands in which, and the plans are cut from it one at a time by `keel:plan`. The charter assigns requirements to milestones and sets the milestones' order; it never cuts stages, since a plan written months ahead is guesswork. The keel hook reads the roadmap into every request, so keep its layout exact.

## Charting a PRD

1. **Read the PRD whole**: the path the user gave, or the one in `docs/` (`PRD.md`, a spec). If `docs/ROADMAP.md` already exists, this is a re-charter (below), not a fresh one.
2. **List every distinct requirement**: one thing the product must do or be, checkable on its own. Use the PRD's own IDs when it has them, exactly as written. When it has none, derive short stable ones from the area (`AUTH-01`, `AUTH-02`, `EXP-01`) in PRD order. An ID is never renumbered or reused once written, even after its row is dropped. A sentence that bundles two checkable things is two requirements; a heading, a goal or a rationale is none.
3. **Cut the milestones.** When the PRD has its own phases or releases, they are the milestones, in its order, and each requirement goes where the PRD puts it, even when that's not the section it's written in. Otherwise group requirements into milestones by dependency, foundations first, each a body of work one plan (or a few) can deliver. `(needs: M1)` names the milestones that must close first; the first milestone needs none.
4. **Sort out the rest**: what the PRD rules out goes to `## Out of scope`, its open questions to `## Open questions` (with who decides and which requirement it affects), and so does any ambiguity you found that changes what gets built. Its **locked decisions** are hard constraints: the stack, data formats and units, product rules every plan must obey. Preferences and goals aren't locked decisions.
5. **Write `docs/ROADMAP.md`** in the layout below, then the locked decisions to `CLAUDE.md` (below).
6. **If `docs/plans/` holds shipped plans**, backfill coverage from them (below).
7. **Report and hand off.** Show the user the milestones with their dependencies and requirement counts, the locked decisions written to `CLAUDE.md`, the open questions, and any backfill judgments. Commit the roadmap and `CLAUDE.md` together, on their own. Then offer `keel:plan` to cut the first plan from the first milestone whose needs are met: its uncovered requirements are that plan's scope.

## Layout

```markdown
# <Project> roadmap
Source: docs/PRD.md, charted 2026-11-08

## Milestones
- [ ] M1. <Name> — <one-line scope>
- [ ] M2. <Name> — <one-line scope> (needs: M1)

## Requirements
| ID | Requirement | PRD § | Milestone | Covered by |
|----|-------------|-------|-----------|------------|
| AUTH-01 | <the requirement, in the PRD's words or a faithful one-line summary> | 3.1 | M1 | |

## Out of scope
- <what the PRD rules out>

## Open questions
- <question> — <who decides, which requirement it affects>
```

- **One row per requirement**, each ID once. `PRD §` is the section it comes from, as the PRD numbers it (or its heading, when it doesn't). The Milestone cell is the milestone's ID alone (`M1`).
- **`Covered by` starts blank**: never `TBD`, `n/a`, a dash or a status. It only ever holds the name of an archived plan whose evidence proves the requirement, filled when that plan is archived; the hook counts any other text as covered.
- **Escape `|` as `\|`** inside a cell, and keep each row on one line: an unescaped pipe shifts every column after it, and the hook skips the row.
- Milestones start unticked; a milestone is ticked when it closes, never by the charter.
- Keep the headings exactly as shown: the hook finds the current milestone and counts coverage by them.

## Locked decisions go to `CLAUDE.md`

Add them under a heading of their own, `## Locked decisions (from docs/PRD.md)`, one line each with its PRD section. Append to what `CLAUDE.md` already says; never rewrite it. They go there, not into the plan: `CLAUDE.md` reaches every session and subagent, and a plan only lasts until it's archived. A plan may point to them; it doesn't copy them.

## Re-charting a changed PRD

Diff the PRD's requirements against the ledger and change the roadmap in place:

- **New requirement**: a new row with a new ID (the PRD's, or the next unused derived one), in the milestone the PRD puts it in.
- **Removed requirement**: the row stays, with `dropped <YYYY-MM-DD>` (today's date) in its Milestone cell. Rows are never deleted.
- **Changed wording**: update the text in place, keeping the ID and the `Covered by` cell. If the row was already covered and the change alters what was built, say so: it needs work, and that's the next plan's call.
- **`Covered by` is never cleared** by a re-charter.
- **Milestones or scope that moved**: when no covered work is affected, update them. When covered work is, report the change and ask before rewriting.

Add `, re-charted <YYYY-MM-DD>` to the `Source:` line and update `CLAUDE.md`'s locked decisions to match. Then report the diff to the user (added, dropped, changed, moved, by ID) and log it in the plan's decisions as one dated line (`2026-12-01 · Re-charted docs/PRD.md: added …, dropped …, changed … — <why: the PRD changed>`). With no plan open, say it goes into the next plan's decisions when `keel:plan` starts it.

## Backfilling from shipped plans

When plans already shipped before the roadmap existed, read each archived plan in `docs/plans/` and its evidence report(s). Fill a requirement's `Covered by` with the archived plan's file name without `.md` (`2026-11-01-accounts`) only when its report has a **passing** row that clearly delivers that requirement, as written. A row that delivers part of it, or something near it, isn't enough: leave the cell blank. Tell the user each one you judged and why ("ACC-02 ← 2026-11-01-accounts: row 'logs in and out at /login' passes"; "ACC-04 left blank: the plan built reset, but no evidence row proves the one-hour expiry"). When in doubt, leave it blank: the next plan covers it with proof.
