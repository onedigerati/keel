# Keel plan

## Goal
Let Keel carry a large project — a PRD too big for one plan — without adding weight to the projects that aren't. Today a plan holds 3–8 stages and "more means the project should be split", but nothing holds the split: across plans, nobody tracks which of a PRD's requirements are covered, and standing decisions pile up in the plan. Done looks like this: `keel:plan` reads scale signals (more than ~8 stages, a PRD with more than ~15 requirements or its own phases, more than one release named, the user saying so) and, only then, asks once whether to chart the project; a new `keel:charter` turns a PRD into `docs/ROADMAP.md` (milestones with dependencies, a requirement ledger, out of scope, open questions) and its locked decisions into `CLAUDE.md`, and re-charts a changed PRD without losing history; plans are cut one at a time from the current milestone; the hook adds one roadmap line to each request and the status line only when `docs/ROADMAP.md` exists; a milestone closes on the full suite, a coverage check and a reviewer's sample of requirement-to-evidence fit. For every project, standing decisions move to `docs/decisions.md` once they pass ten, and a project can add risk words and outward commands in `CLAUDE.md` that only ever add to Keel's built-ins. A project without a roadmap behaves exactly as in 0.7.0. Shipped as keel 0.8.0.

## Baseline
2026-11-08 · tests: 115 pass, 0 fail (`claude plugin test plugins/keel`) · validate: passed (`claude plugin validate plugins/keel`)

## Now
Stage 3 of 6 · Project risk rules
Mode: autopilot
Agents: wide — confirmed 2026-11-08 12:50
Risk: user input, permissions (a cloned repo's `CLAUDE.md` feeds the autopilot guards)
Checks:
- [ ] A `Keel risk: <word>, <word>` line in `CLAUDE.md` adds hold words: under autopilot, a stage whose risk line names one is held exactly like one naming auth (proof: test)
- [ ] A `Keel outward: <command>, <command>` line adds outward commands: under autopilot, a matching Bash call, behind the same prefixes and in any part of a compound command, is denied through the same prefilter, naming the project rule (proof: test)
- [ ] Add-only: the built-in risk words and outward check run first and unconditionally; nothing in `CLAUDE.md` removes or loosens them; a malformed line adds nothing and never blocks a request or tool call (proof: test, a loosening attempt per built-in)
- [ ] Without such lines, context, status line, holds and denials are byte-identical to before (proof: test)
Open:
- Deferred to stage 4 (charter): escape `|` in requirement text it writes to the ledger; leave `Covered by` blank, never `TBD`, `n/a` or a dash.
- Deferred to stage 5 (archive): `Covered by` holds only an archived plan's name or nothing — the hook counts any other text as covered.
- Deferred from stage 2 review: the scale-check evals are single-turn, so "not asked again" and "re-asked on a stronger signal" have no eval (an arm with a planted logged answer, and one on the next-plan path); worth adding with stage 6's eval list.
- Deferred, pre-existing across all 18+ eval scaffolds: run by hand from a real repo root, a scaffold overwrites files and `git add -A && git commit`s there; a guard (refuse a non-empty directory) would make hand runs safe.
- Deferred, pre-existing: `loadPlan` reads `docs/PLAN.md` without checking it's a regular file, so a FIFO there could block a request (the roadmap reader now stats first); worth the same check in a later stage.

## Stages
- [x] 1. Roadmap in the hook — read `docs/ROADMAP.md` only when it exists; one context line and one status-line segment; nothing changes without it
- [x] 2. Decisions file and scale check — standing decisions move to `docs/decisions.md` past ten; `keel:plan` reads scale signals, asks once, records the answer, and re-checks at each new plan; resume reads both files; Keel's own plan migrates as the proof
- [ ] 3. Project risk rules — `Keel risk:` and `Keel outward:` lines in `CLAUDE.md` add hold words and outward commands; add-only, through the Bash prefilter, tested against loosening
- [ ] 4. Charter — `keel:charter` turns a PRD into the roadmap, ledger and `CLAUDE.md` decisions; re-charter diffs a changed PRD; backfill from shipped plans; eval `charter-prd` against a synthetic PRD with a known answer key
- [ ] 5. Milestones in the loop — checks tag requirements `(req: ID)`; `keel:plan` cuts the next plan from the current milestone's uncovered requirements and fills `Covered by` at archive from passing evidence rows; milestone close in stage, autopilot, verify and review; eval `milestone-close`
- [ ] 6. Proof and release — two plans in a row on a scratch milestone, the USS PRD graded, READMEs, eval list, version 0.8.0

## Decisions
- 2026-11-08 · The large-project layer is files that only take effect when present: no `docs/ROADMAP.md` means no roadmap line, no ledger and no milestone checks — the user wants large projects handled without overhead for the ones that aren't, and absence-as-off needs no setting.
- 2026-11-08 · `keel:plan` decides the path from signals it can count — stage count after an honest cut (>~8), a PRD's distinct requirements (>~15) or its own phase list, more than one release in the goal, or the user's words — and asks once with a recommendation only when one fires; the answer is logged as a decision and not asked again. Small work is planned without the question.
- 2026-11-08 · Plans are cut one at a time from the current milestone, not all up front — a plan written months ahead is guesswork, and Keel cuts stages after surveying the code they touch. The charter assigns requirements to milestones and milestone dependencies only.
- 2026-11-08 · Roadmap layout, fixed now so stages 1, 4 and 5 can build in parallel: `# <Project> roadmap`, a `Source:` line (the PRD path and the date charted), `## Milestones` as a checklist `- [ ] M1. <Name> — <scope> (needs: M0)`, `## Requirements` as a table `| ID | Requirement | PRD § | Milestone | Covered by |`, then `## Out of scope` and `## Open questions`. A requirement the PRD drops keeps its row with `dropped <date>` in the Milestone cell and leaves the total; rows are never deleted.
- 2026-11-08 · Coverage is derived, not tracked: `Covered by` names the archived plan whose evidence report has a passing row tagged with the ID, filled when that plan is archived; the hook only counts filled cells — a hand-kept status column drifts, and counting a table is cheap enough for every request.
- 2026-11-08 · Requirement tags go at the end of a check, `(req: SEC-01)` — the stage-close parser reads a leading number as a stage number, and a tag first in an evidence row could look like a re-run row.
- 2026-11-08 · Locked decisions from a PRD go to `CLAUDE.md`, not the plan — they bind every session and subagent, and `CLAUDE.md` already reaches them.
- 2026-11-08 · The hook adds no roadmap line when every milestone is ticked, or when there's no plan (the line rides in the plan section) — starting the next body of work is `keel:plan`'s job, and a stale "all done" line would sit in every request. A `Covered by` cell holding only a dash counts as empty, since that's how markdown tables commonly write an empty cell; charter and archive (stages 4–5) should still leave it blank.
- 2026-11-08 · The README gives large-project support (charter, roadmap, milestones) a prominent place as a headline capability of 0.8.0, not a footnote — the user asked for it to be called out (done in stage 6).
- 2026-11-08 · Stage 1's verify runs in the main session, and that run writes the report itself: subagents here can't write report `.md` files, and the user chose this over saving the fresh verifier's text on its behalf. The fresh verifier's mutation evidence stays alongside it.
- 2026-11-08 · `Covered by` holds a link to the archived plan, relative to `docs/` (`[<plan name>](plans/<date>-<slug>.md)`), whether the archive step (stage 5) or the charter's backfill (stage 4) fills it — one form, so a reader can follow it and the milestone close can check the plan exists; the stage 4 builder had used the bare name.
- 2026-11-08 · The roadmap's count is across the whole ledger, not the current milestone's rows (`M1 14/46` reads as "at M1, 14 of the project's 46 covered") — it matches the plan's example and the "how far along is the project" question; the milestone close (stage 5) checks the milestone's own rows.
- 2026-11-08 · Stage 2 onward is verified in the main session too, for the same reason as stage 1 (subagents can't write the report); reviews stay with fresh agents.
- 2026-11-08 · The hook reads at most 256K characters and 4,000 lines of the roadmap and cuts milestone names at 60 characters — it runs on every request, and a ledger past the cap is undercounted rather than slowing each one.
- 2026-11-08 · Project risk rules only add: Keel's built-in outward check runs first and unconditionally, and the project list is consulted only when it found nothing; there's no allow or negation syntax — a cloned repo's `CLAUDE.md` mustn't loosen a guard, the same reasoning that keeps a `wide` line from raising spend unasked.
- 2026-11-08 · Standing decisions move to `docs/decisions.md` once more than ten would carry forward, with one pointer line left in the plan; below that they stay in the plan — small projects keep one file, and the `next-feature` eval keeps grading the plan.
- 2026-11-08 · Deferred, not built: a "decide" stage type, more than one active plan, and a debug workflow — a decision can be a stage whose check is a prototype and a logged decision; parallel plans bring back state sync; the built-in debugging tools already cover investigation.
- 2026-11-08 · Agents: wide, from the user ("go wide so we can finish this quickly"). Stages 1, 2 and 3 start together in their own worktrees (1 and 3 both touch `register.ts`, in different functions, and merge in order); 4 and 5 start once 1 is committed, since both build on the roadmap layout and the hook's reading of it.
- 2026-11-08 · The USS PRD and its v1.0/v1.1 phase and requirement lists are used only as a local, uncommitted answer key — it's a work project's document, and the plugin repo is public-facing; only the scores go in the evidence. The repo's own proof is the synthetic `charter-prd` eval.

## Open questions
- Where are the USS PRD (`docs/CLAUDE-PRD-Opus.md`) and its v1.0 phase / v1.1 requirement lists? They aren't on this machine — the user copies them somewhere local, or stage 6 grades on the synthetic PRD only. Blocks only stage 6's USS check.
- Committed screenshots get no secret scan (the guard skips binary files); the docs state the limit and review should look at committed images. A guard for images is out of scope here — the user decides whether it's worth a later plan.
- No eval covers masking yet (a case whose output holds a fake DB URL and email, graded for `[masked]`) — deferred from the last plan's stage 1 review; worth adding in a later plan.
- A `wide` (or `Mode: autopilot`) line that arrives mid-session from git — a checkout or pull of someone else's branch, or a plan that couldn't be read at the session's first look — counts as a change and is honoured without asking; the Mode line already behaves this way. Closing it (move the baseline when the line matches the plan at HEAD, or count only edits made in the user's turn) is a design change for the user to weigh — found in stage 1 review.
- With two Agents lines in `## Now`, only the first is read, so restamping the second does nothing (fails safe, but confusing); and an Agents line past `## Now`'s 40-line cap is parsed but not shown to Claude. Both minor — stage 1 review.
- The `lean` cap counts only `pending`, `running` and `waiting` agents: an `idle` teammate isn't counted (a message can wake it beside a second agent), nor are a SendMessage that resumes a finished agent or a Workflow's fan-out; and agents another plugin spawned, or a dead teammate pane still marked running, count as busy and can stall a `lean` session. The `agent.spawn` event may be a sturdier place for the cap — stage 3 review, deferred. Also deferred from its re-review: when two parallel calls are both refused (the second because the first held the slot, the first further down), the second's "one is still running" is untrue — harmless, Claude can retry.
- `agents-lean` has no balanced control: if a balanced run on the same three-exporter scaffold also builds inline, the eval can't show `lean` caused it (run it once with no Agents line; if so, give it bigger leaves) — stage 2 re-review, deferred.
- A planted stamp the hook reads as date-only (`confirmed 2026-11-08 at 23:59`) could be confirmed by a rewrite that drops the `at`, if the session runs past that minute; it needs a reformat the skills forbid — stage 2 re-review, deferred.

## Standing decisions
- Standing decisions from earlier plans are in [decisions.md](decisions.md).

## Shipped
- 2026-11-07 · Verification evidence: verify saves a per-check report and its output to `docs/evidence/stage-<n>/`, stage and autopilot link it, archiving carries it along, and the commit guard refuses to close a stage without it (keel 0.5.0–0.5.2) — [plan](plans/2026-11-07-verification-evidence.md) · [evidence](plans/2026-11-07-verification-evidence/evidence/)
- 2026-11-07 · Regression and security proof: plans prefer tests as proof, verify re-runs hand-proven checks at the end of a plan, stages recheck their risk line against the diff, and evals show a regression and a planted injection caught (keel 0.6.0) — [plan](plans/2026-11-07-regression-security-proof.md) · [evidence](plans/2026-11-07-regression-security-proof/evidence/)
- 2026-11-08 · Agents level: an `Agents: lean | balanced | wide` line in `## Now` that the skills follow, shown in the status line, `lean` capped at one running agent by the hook, and `wide` honoured only once the user confirms it in-session (keel 0.7.0) — [plan](plans/2026-11-08-agents-level.md) · [evidence](plans/2026-11-08-agents-level/evidence/)
