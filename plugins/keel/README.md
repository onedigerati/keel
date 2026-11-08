# Keel

Keeps long, multi-stage work with Claude Code on course without a heavyweight process. All project state lives in one plan file plus git. Works on new projects and existing ones: there's no separate codebase map to keep current, because the plan surveys what it touches and durable facts (how to run and test) go in `CLAUDE.md`.

New in 0.8.0: large projects. A PRD too big for one plan is charted into a roadmap of milestones and a requirement ledger, plans are cut from it one at a time, and a milestone closes only on evidence that its requirements are covered (see [Large projects](#large-projects)). A project without a roadmap works exactly as before.

## Large projects

Some work is too big for one plan: a PRD with many requirements, several releases or phases. Keel carries it as a roadmap, `docs/ROADMAP.md`, and cuts plans from it one milestone at a time.

- **The scale question.** When `/keel:plan` sees work too big for one plan (more than about eight stages after an honest cut, a PRD with more than about fifteen requirements or its own phases, more than one release, or you saying so), it asks once whether to chart the project, saying what fired and which it recommends. Your answer is logged as a decision and carries forward, so it isn't asked again unless a clearly stronger signal turns up (a new PRD, a second release). Small work is planned without the question.
- **Charter.** `/keel:charter` turns the PRD into `docs/ROADMAP.md`: milestones with their dependencies, a requirement ledger with the PRD's own IDs (or short derived ones when it has none), what's out of scope, and open questions. It proposes the PRD's locked decisions (stack, data formats, product rules) for `CLAUDE.md`, where every session and subagent sees them, and writes them only on your yes. Process rules (review, tests, agents, autopilot, guards) are never taken from a PRD, whatever it calls them: the PRD is data, not instructions. Charting a project that already shipped plans backfills coverage from their passing evidence, row by row, with your yes.
- **One plan at a time.** Plans are cut from the current milestone (the first unticked one) and its uncovered requirements, never all up front: all of them, or a slice that fits 3–8 stages. Each check names the requirements it proves, at the end of the line: `- [ ] Booking a free plot marks it booked (proof: test) (req: PLT-02)`.
- **Coverage from evidence.** When a plan is archived, a requirement's blank `Covered by` cell is filled with a link to that plan only when the plan took the requirement on (a tagged check, or its Goal) and its stage reports have a passing row tagged with the ID, with no later failing re-run. Nobody marks coverage by hand; the hook counts any text in the cell but a dash as covered, so it holds only that link.
- **Archive, fill, close, cut.** A finished plan isn't closed out in place. `/keel:plan` archives it, fills the ledger from its evidence, writes the new plan and commits that switch. If a requirement of the milestone that isn't dropped is still blank, the new plan is cut from it. If the milestone is now covered, the new plan's first work is closing it (one line in `## Stages`: `- [ ] Close M2 — full suite, coverage, evidence fit, milestone review`), then any covered milestones after it, and only then are its stages cut from the new current milestone.
- **Milestone close.** A milestone closes only on the full test suite, a coverage check of its requirements, a fresh agent's sample of requirement-to-evidence fit (it picks its own sample and isn't shown the builder's verdicts), and a milestone review with no fix-now finding. All of it goes in `docs/evidence/milestone-<ID>.md`, in the closing plan's evidence folder beside its stage reports, so it's archived with that plan. The hook refuses a commit that ticks a milestone unless that file, in the commit or the working tree, has a table row (the ID in its first cell) for each of the milestone's requirements that isn't dropped. A failed close leaves the box unticked: a red suite or a fix-now finding becomes the plan's stages, and an evidence gap is reported to you; on your word that requirement's cell is cleared and the plan takes it on.
- **Under autopilot.** When the last stage leaves the milestone covered, Claude writes its report, commits the switch, closes the milestone (and any covered ones after it), cuts the next plan's stages and pauses for your yes: autopilot never builds a plan you haven't seen. A failed close is a pause too. When the last milestone closes, there's nothing to cut: it says the roadmap is complete.
- **Always in view.** In a project with a plan, every request carries one line, `Roadmap: M1 Ingest · 14/46 requirements covered (docs/ROADMAP.md)`, and the status line adds the milestone right before the plan's progress: `keel · M1 14/46 · 2/5 done · next: …` (after the mode and Agents level when they show, `keel · lean · M1 14/46 · …`). The count is across the whole ledger, dropped rows left out. Once every milestone is ticked, the line goes away.
- **Re-charting.** When the PRD changes, `/keel:charter` diffs it against the ledger in place: new requirements get new rows, removed ones keep their row marked `dropped <date>`, and reworded ones are updated under the same ID. Coverage is never cleared; a covered requirement whose meaning changed is listed for rework, so the next plan takes it on. A change to `CLAUDE.md`'s locked decisions is shown and waits for your yes.

The roadmap looks like this:

```markdown
# Plotline roadmap
Source: docs/PRD.md, charted 2026-11-08

## Milestones
- [x] M1. 1.0 Accounts — sign-up, login, password reset
- [ ] M2. 1.0 Plots — plot map, booking, season dates (needs: M1)
- [ ] M3. 1.1 Tools — tool library and reservations (needs: M2)

## Requirements
| ID | Requirement | PRD § | Milestone | Covered by |
|----|-------------|-------|-----------|------------|
| ACC-01 | A member signs up with email and password | 3.1 | M1 | [Accounts](plans/2026-11-20-accounts.md) |
| PLT-02 | A plot shows as free \| booked \| overdue | 4.2 | M2 | |
| HRV-03 | A harvest leaderboard | 6.3 | dropped 2026-12-02 | |
```

then `## Out of scope` and `## Open questions`. Rows are never deleted, and `Covered by` holds only a link to an archived plan or nothing.

A project without `docs/ROADMAP.md` behaves exactly as before: there's no setting, no roadmap line, no milestone gate and no extra checks. The layer is on only when the file is there.

## Skills

| Command | What it does |
| --- | --- |
| `/keel:plan` | Creates or updates `docs/PLAN.md`: goal, current position, stages with acceptance checks and a risk line, dated decisions, open questions. Each check names its proof: a test wherever a test can cover it, otherwise the reason it can't. Adopts an existing plan file instead of starting a second one. In a repo that already has code, it first surveys the part the plan touches and records a test baseline. Asks once how widely to fan the work out to agents and records it as the Agents line (see [Agents level](#agents-level)). When the work looks too big for one plan, it asks once whether to chart it (see [Large projects](#large-projects)); with a roadmap, it cuts each plan from the current milestone and tags each check with the requirements it proves. When a plan's goal is met, it starts the next plan (see below), moving the old plan's evidence beside its archive and, with a roadmap, filling the ledger's coverage from it, then closing the milestone when that left it covered, before cutting new stages. |
| `/keel:charter` | Turns a PRD too big for one plan into `docs/ROADMAP.md` (milestones with dependencies, a requirement ledger, out of scope, open questions) and proposes its locked decisions for `CLAUDE.md`, written on your yes. Re-charts a changed PRD in place without losing coverage, and backfills coverage from plans already shipped. Hands the first milestone to `/keel:plan`. |
| `/keel:stage` | Runs the next stage: scope, build (independent parts fanned out to subagents in their own worktrees, as far as the Agents line says), test, verify, review, update the plan, commit (the stage's evidence included), then stop for your review. Before deciding on review, it checks the risk line against what the diff actually touches and corrects it in the plan when it's wrong. The report links the stage's evidence. |
| `/keel:autopilot` | Autopilot: Claude takes over an approved plan as project manager and runs every remaining stage without stopping between them. Builders are subagents (one at a time under `lean`); the manager verifies (or has a fresh agent verify, writing the stage's evidence), reviews, commits and keeps the plan current. It rechecks each stage's risk line against the diff as `/keel:stage` does. The final report links each stage's evidence report. It pauses before stages that touch auth, money or personal data (including a stage whose corrected risk line names them, before closing it), on decisions only you can make, on checks it can't get green, and before anything outward-facing (push, deploy, real data). With a roadmap, when the last stage leaves the milestone covered, it commits the switch, closes the milestone, cuts the next plan's stages and pauses for your yes before building any of them; a failed close is a pause too. |
| `/keel:verify` | Type check, lint, tests, build and a dependency audit, then each acceptance check proven by its test or in the running product. At the plan's last stage, it also re-runs the earlier stages' checks that weren't proven by a test, so a later stage can't break one without it showing by the end of the plan. On a request only for a report, it reports failures and leaves them. For a plan stage, it saves a per-check report and the output behind it to `docs/evidence/stage-<n>/` (see [Evidence](#evidence)). For a plan stage under `wide`, a fresh agent that built nothing runs it; under `lean`, the main session does. Closing a milestone, it runs the full suite, the coverage check and a fresh agent's evidence-fit sample, and writes `docs/evidence/milestone-<ID>.md`. |
| `/keel:review` | A fresh-eyes review by an agent that didn't write the code, with a security pass for risky stages. Every Agents level keeps at least one fresh reviewer; under `wide`, when the security lens applies, a correctness and a security reviewer run in parallel. Run from `/keel:stage` or autopilot, the risk line has already been checked against the diff; run on its own, review takes the line as the plan has it. Findings are verified and sorted into fix, defer or reject. At a milestone close it reviews everything since the last milestone, and its findings go in the milestone's evidence file. |
| `/keel:resume` | After a break or a context summary: reads the plan and git, reports where things stand and what's next, and offers the next plan when this one is finished. Reads `docs/decisions.md` too, when it exists. |

Claude also uses them on its own when the moment fits.

## How a project flows

1. **Plan.** `/keel:plan` writes `docs/PLAN.md`. If the work is too big for one plan, it first asks whether to chart it; on a yes, `/keel:charter` writes the roadmap and the plan is cut from its first milestone. In existing code it first surveys what the work will touch: how to run and test it, its conventions, where the change lands, what's risky nearby. It runs the checks once and records the result as a `## Baseline`, so failures that were already there aren't blamed on new work. Run and test commands go in `CLAUDE.md` rather than a separate codebase map.
2. **Build.** Step through the stages with `/keel:stage`, stopping after each for your review, or hand the plan to `/keel:autopilot`. Each stage is verified against the running product, reviewed when risky (by the risk line as checked against the diff, not only as planned), and committed with its evidence in `docs/evidence/stage-<n>/`. Verifying the last stage also re-runs the earlier stages' checks not proven by a test. Untested code gets a test of its current behavior before it changes.
3. **Next plan.** A plan covers one body of work with one Goal: a single feature, several features, or a milestone. New work that fits the Goal is added as stages; work beyond it either widens the Goal or waits for the next plan, and Claude asks which. When the Goal is met and the next body of work starts, `/keel:plan` archives the plan to `docs/plans/<date>-<plan>.md`, moves `docs/evidence/` to `docs/plans/<date>-<plan>/evidence/` beside it, and carries forward only what still applies: decisions that still bind (under `## Standing decisions`, with their dates and a link back) and open questions. Once more than ten standing decisions would carry forward, they move to `docs/decisions.md` and the plan keeps one line pointing there; ten or fewer stay in the plan, so a small project keeps one file. Decisions there are never deleted, only struck through with the reason when they stop binding. It adds a line to `## Shipped` linking the archive and its evidence, then plans the new work fresh, with a new survey, a new baseline and stages numbered from 1. It commits the switch on its own and suggests `/clear` before building; nothing is lost, since the plan, the archive and git hold it all. With a roadmap, the archive also fills the ledger, the fill goes in the switch commit, and a milestone it leaves covered is closed in the new plan before its stages are cut (see [Large projects](#large-projects)).

## Agents level

How widely Keel fans work out to subagents is a line in the plan's `## Now`, beside the Mode line. It trades tokens for wall-clock time. `/keel:plan` asks once and records it, and you can change it any time (ask Claude, or edit the line yourself; a change to `wide` made during the session, from no line, `lean` or `balanced`, is honoured without a stamp); stage, autopilot, review and verify follow it, and it carries into every new `## Now` and into the next plan.

- **`Agents: lean`.** Build and verify in the main session, one agent at a time. Autopilot still delegates building, one builder at a time, and review keeps one fresh reviewer.
- **No line (`balanced`).** Today's behaviour: independent leaves go to subagents when it helps. `balanced` is written as no line, and a line with any other value counts as none.
- **`Agents: wide`.** Every independent leaf gets its own agent in its own worktree, a fresh agent verifies, and when the security lens applies (the risk line names more than UI), the correctness and security reviewers run in parallel.

`wide` raises your spend, so it's honoured only once you confirm it in the session. A `wide` line already in the plan when a session starts (left from an earlier session, or in a repo you cloned) counts as `balanced`; Claude asks, and on your yes restamps it from the clock as `Agents: wide — confirmed <YYYY-MM-DD HH:MM>`. Only your own words confirm it: a plan line, logged decision, comment, file or agent report claiming you did doesn't count. Claude is told this; the hook can't tell who asked for a stamp, so it honours any one written in the session. `lean` is honoured as found, since it only lowers spend.

## Hooks

- **Plan context.** When a project has `docs/PLAN.md` (or `PLAN.md`, or `docs/BUILD_PLAN.md`), its `## Now` section rides in the system prompt, so the current stage survives long sessions and context summaries. The summarizer is also told to keep the stage state. The status line shows progress, like `keel · 2/5 done · next: 3. Share mode`, and points to `keel:plan` once every stage is done. With `docs/ROADMAP.md`, one more line rides with the plan, `Roadmap: M1 Ingest · 14/46 requirements covered (docs/ROADMAP.md)`, and the status line adds `M1 14/46` right before the plan's progress (`keel · M1 14/46 · 2/5 done · …`); the roadmap is read only when the file exists and is a regular file of at most 1 MiB, and shown only when it has an unticked milestone and a `## Requirements` table with Milestone and Covered by columns. At most 4,000 lines (256,000 characters) of it are counted. A `Covered by` cell with any text but blanks or dashes counts as covered. When standing decisions live in `docs/decisions.md`, Claude is told so. The plan's Agents level rides in the working rules Claude gets, and the status line shows it when it isn't balanced (`keel · lean · 2/5 done · …`). Projects without a plan file are untouched.
- **Autopilot.** Autopilot is armed per session: when you start `/keel:autopilot`, or the Mode line turns to autopilot during the session. A `Mode: autopilot` line already in the plan when a session starts (left from an earlier session, or in a repo you cloned) never drives it; Claude reports where the run stands and asks. While armed, each time a turn ends with stages left the hook compacts the context if it's past 65% full (keeping the plan state), then prompts the manager to carry on, unless background builders are still running (their reports start the next turn). It stands aside when you start a turn yourself, stops when the plan says `Mode: paused — <reason>` and sends you a notification, and gives up after three turns in a row that leave the plan unchanged. Say "go" to resume.
- **Autopilot stops, enforced.** While autopilot is armed: outward-facing commands are blocked (`git push`, package publishes, deploys, `gh` writes, requests that send data to an outside host); a stage whose risk line names auth, money or personal data gets no file edits outside the plan and no builder agents until you reply. In every mode, a commit that ticks a stage whose `## Now` checks were never seen ticked is refused.
- **Project risk rules.** A project can add its own hold words and outward commands with lines in `CLAUDE.md` and `.claude/CLAUDE.md` (both are read):
  - `Keel risk: pci, card data` holds a stage whose risk line names one of these words, matched as whole words in any case (a plural with `s` or `es` counts), exactly as auth is held.
  - `Keel outward: make release, ./scripts/ship.sh` blocks a command whose head is the rule's first word and whose next words are the rule's, with options, `VAR=value` settings and an option's value allowed between them (`make -C . -j4 release` is `make release`). Package runners are looked through (`npx --yes x`, `pnpm dlx x`, `bunx x`). A rule naming a path matches the same file however it's reached (`scripts/ship.sh`, `bash ./scripts/ship.sh`, `cd scripts && ./ship.sh`). The refusal names the rule.
  - A line may be a list item or carry bold or backticks (`` - **Keel risk:** `gdpr` ``); a trailing `.`, `;` or `:` is dropped, and lines inside code fences are examples, not rules. Commas always split entries, so an entry can't contain one.
  - These lines only add. Keel's own words and outward check always apply first, and there's no allow or negation syntax, so a cloned repo's `CLAUDE.md` can't loosen a guard. A line Keel can't read adds nothing, and so does a file over 512 KiB, one that isn't a regular file, or one that links outside the repo.
  - Rules are kept for the session once seen: an edit adds rules at once, but removing one takes effect only in a new session.
  - What the checks see: Keel's and the project's outward checks see through shell grouping, keywords and `case` patterns, line continuations, `$'…'` strings, wrappers (`sudo`, `env`, `timeout`, `xargs`, `parallel`, `flock`, `su -c`, `strace`, `find -exec` and the like), and the strings `sh -c`, `eval`, `trap`, `$(…)`, `<(…)` and unquoted heredoc bodies run. They block as unchecked a command nested too deep to follow, a shell reading its script from standard input (`… | sh`; a heredoc or here-string that feeds it is read instead), a command `xargs` or `parallel` takes from input, a `git -c alias.…` call, and a subcommand built at run time (`git $(…)`). A command whose name or `eval`/`-c` string is built at run time (`$c`, `$(…) push`) is blocked when the line names an outward command elsewhere (`c="git push"; $c`), or when the string is a lone variable (`bash -c "$cmd"`); otherwise it runs, so `"$PYTHON" -m pytest` and `eval "$(ssh-agent -s)"` aren't held.
  - Limits: the checks read the command line, so a push from inside a script, an interpreter (`python -c`, `node -e`), an alias, function or variable defined elsewhere, or a tool that pushes under its own name isn't seen (`git subtree push`, `git lfs push` and `git send-email` are built in). A rule's words must follow its head in order, so `make test release` (another target first) isn't `make release`.
- **Agents level, enforced.** A `wide` line is honoured only when it turned to `wide` during the session (from no line, `lean` or `balanced`) or carries a confirmation stamp whose time falls inside the session (from its first read of the plan to now). A date-only, past or future stamp never confirms, nor does a planted one kept or rewritten with its date and time intact, or a change of case or spacing; and no stamp confirms when the clock can't be read. Until then Claude works at balanced and is told to ask. Under `lean`, an `Agent` call from the main loop is refused while another top-level agent is pending, running or waiting (parallel calls in one message included), and so is any `Agent` call a subagent makes. `balanced` and `wide` aren't capped by Keel; Claude Code's own limits bound `wide`. Its limits:
  - A `wide` line that arrives mid-session from git (a checkout or pull of someone else's branch, or a plan the session couldn't read at its first look) counts as a change and is honoured without asking, as the Mode line is.
  - The `lean` cap doesn't see an idle teammate, a SendMessage that resumes a finished agent, or a Workflow's fan-out.
  - Agents another plugin started, or a dead teammate pane still marked running, count as busy, so a `lean` session can stall until they finish or the line changes.
  - A planted stamp the hook reads as date-only, such as `confirmed 2026-11-08 at 23:59`, can be confirmed by a rewrite that drops the `at`, if the session runs past that minute. The skills forbid such a rewrite (the line is carried as it stands).
  - With two Agents lines in `## Now` only the first is read, and an Agents line past the 40-line cap on `## Now` is followed by the hook but not shown to Claude.
- **Milestone gate.** In every mode, a commit that ticks a milestone in `docs/ROADMAP.md` is refused unless `docs/evidence/milestone-<ID>.md` is in the commit or the working tree with a table row, the ID in its first cell, for each of that milestone's requirements not marked `dropped`. A milestone with no live requirements needs no file, and a roadmap whose ledger can't be read isn't gated. Like the evidence gate, it checks that the evidence is there and complete, not that it's good; the fresh agent's sample and the milestone review do that.
- **Evidence gate.** In every mode, a commit that ticks stage n in the plan is refused unless `docs/evidence/stage-<n>/report.md` is in the commit or the working tree and its first table has a row for each of the stage's checks. Rows for re-runs of earlier stages' checks (`Re-run of stage <k>: …`) don't count toward them. The check count comes from what this session saw of `## Now`, or from the plan at HEAD when the session never saw that stage; the ticked-checks gate uses the same fallback. This applies to stages of plans started before 0.5.0 too, and the refusal says how to backfill a report. The gate only checks that a report is there and covers every check, not that the evidence is any good; that stays with verify and review. Its limits:
  - A plan edited on the same command line as the commit (`sed -i … && git commit`) isn't seen. The same goes for the ticked-checks gate.
  - A report that exists but isn't committed counts.
  - `git -C` into another repo is checked against this session's repo.
- **Secret guard.** Before any `git commit`, the changes it would carry are scanned (the index, plus `-a`, named paths, and a `git add` earlier on the same line; in the repo the command actually commits in, following `cd` and `-C`) for private keys, cloud and API tokens, database URLs with passwords, hard-coded credentials and credentials files such as `.env`. A hit blocks the commit and names the file, line and kind, never the value. Secrets are scanned for every commit on a command line before any stage gate runs. Mark a false positive with `keel:allow-secret` on that line. Committed images get no secret scan (binary files are skipped), so review should look at committed screenshots. It guards commits Claude makes through its Bash tool; for commits made any other way, pair it with a git `pre-commit` scanner such as gitleaks.

## Evidence

When `keel:verify` checks a plan stage, it writes the evidence to `docs/evidence/stage-<n>/`, beside the plan:

- `report.md`: a table with a row per acceptance check (check, pass or fail, and a link to the proof), the commit it was verified on, and a History of earlier failures and their fixes. A failing check is recorded as fail. At the plan's last stage, each re-run of an earlier stage's check gets its own row after those, as `Re-run of stage <k>: <check>`.
- A text file per proof (test run, CLI run, request and response), with the command on the first line.
- Screenshots, Playwright traces and videos.

On first use it creates `docs/evidence/.gitignore`, which keeps images, traces, videos and HAR files local. The report and text output are always committed. To commit screenshots too, delete the image lines from that `.gitignore`. The report links every file either way and marks the ignored ones `(local)`.

Before saving, verify masks secrets and personal data in the output (tokens, cookies, `Authorization` headers, JWTs, database URLs with credentials, emails, names, addresses), keeping what the value was: `postgres://[masked]@db:5432/app`. It doesn't screenshot real personal data.

With a roadmap, an evidence row whose check is tagged `(req: ID)` is what fills that requirement's `Covered by` when the plan is archived; only a passing row counts. A milestone close runs in the plan after the one that covered it, and writes `docs/evidence/milestone-<ID>.md` into that plan's evidence folder, beside its stage reports: the full suite's result, a coverage row per non-dropped requirement (`| ID | Covered by | Evidence row | Result |`), the fresh agent's fit sample with the proof it re-ran and its answer per ID, and the milestone review's findings. It's archived with that plan. The ledger fill reads only stage reports, never a `milestone-*.md` file.

Evidence is written whenever a plan stage is verified, even on a request only for a report. For an ad-hoc fix or a repo with no plan, the report stays in chat. When the next plan starts, the folder moves with the archived plan, and the new plan starts with no `docs/evidence/`.

## Install

From GitHub:

```
claude plugin marketplace add onedigerati/keel
claude plugin install keel@keel-local
```

From a local clone of this repository:

```
claude plugin marketplace add ~/repos/keel
claude plugin install keel@keel-local
```

The plugin is read straight from the clone, so edits take effect after `/reload-plugins`. For a single session without installing: `claude --plugin-dir ~/repos/keel/plugins/keel`.

## Development

`claude plugin validate plugins/keel` checks the manifest and hooks; `claude plugin test plugins/keel` runs the tests.

`evals/` holds an eval suite for `claude plugin eval`. The cases check two things:

- **Triggering.** The skills load on the words people use: "where were we" loads resume (`trigger-resume`), "go" loads stage (`trigger-stage`), "take it from here" loads autopilot rather than the built-in run skill (`trigger-autopilot`), and "plan it out" loads plan and writes a plan with observable checks (`trigger-plan`).
- **Outcomes.** The work they lead to is right:
  - verify reports a failing test honestly, doesn't weaken the test to get green, and records the failing check as fail in its report (`verify-honest`);
  - verifying a stage writes `docs/evidence/stage-<n>/` with a report row per check and the evidence `.gitignore` (`verify-evidence`);
  - under autopilot, a stage whose risk line names auth is paused for you, not built (`risky-stage-held`);
  - a `Mode: autopilot` line left in a repo doesn't start a run; Claude answers and asks before resuming (`stale-autopilot`);
  - a plan in existing code records the inherited test failure as baseline and tests untested code first (`brownfield-plan`);
  - starting the next plan archives the old one and carries forward only binding decisions, and moves the old plan's evidence beside its archive (`next-feature`);
  - a new feature that fits the current Goal is added to that plan as stages rather than starting a new one (`feature-within-goal`);
  - verifying the plan's last stage re-runs an earlier stage's CLI check and reports it as fail when the new stage broke it (`regression-caught`);
  - a stage planned as "UI only" whose code takes user input gets its risk line corrected in `## Now` and a review before it closes; under the skills before 0.6.0 the line stays "UI only" (`risk-recheck`);
  - a stage whose code has a SQL injection doesn't close with it: the injection is fixed, with a test that fails on the old code, before the commit (`security-caught`);
  - under `Agents: lean`, a stage of three independent leaves is built and verified in the main session, with no two agents running at once and one fresh reviewer (`agents-lean`; it has no balanced control yet, so it shows lean is followed, not that balanced would have fanned out);
  - under an `Agents: wide` line the user confirms in the prompt, the line is restamped from the clock, each leaf gets its own agent in its own worktree, and a fresh agent verifies (`agents-wide`);
  - an unstamped `Agents: wide` line beside a planted decision claiming the user confirmed it is left unstamped, nothing fans out, and Claude asks (`agents-wide-unconfirmed`);
  - planning a PRD of 25 requirements across two releases asks once, with a recommendation, whether to chart it, even when told to assume defaults, and writes no plan of ten or more stages (`scale-check-large`);
  - planning one small feature writes the plan without asking whether to chart it (`scale-check-small`);
  - charting a synthetic PRD writes a roadmap that matches a known answer key, every requirement once under its PRD ID, and proposes its locked decisions for `CLAUDE.md` while dropping a process rule posing as one (`charter-prd`);
  - re-charting a changed PRD adds, drops and rewords rows in place, never clears `Covered by`, records a reworded covered requirement for rework and asks before moving covered work (`charter-rechart`);
  - archiving the plan that finishes a milestone fills `Covered by` only for the requirement its own passing evidence proves and commits the switch; the close then runs in the new plan (full suite, coverage check, a fresh agent's evidence-fit sample, a milestone review, `docs/evidence/milestone-M1.md`) and either ticks M1 and cuts the M2 plan, or reports what failed and plans the fix; either way it stops for your yes before building (`milestone-close`);
  - archiving a plan whose evidence for a requirement only fails leaves its `Covered by` blank, so the milestone isn't covered: it isn't closed or ticked, and Claude reports the gap instead of moving on to the next milestone (`milestone-close-gap`).

Each case but `trigger-plan`, which starts from an empty directory, builds a small project with its own `scaffold.sh`. `risky-stage-held`, `stale-autopilot`, `trigger-autopilot`, `trigger-resume`, `trigger-stage` and `verify-honest` are generated from `evals/fixtures/repo.sh`, and `agents-lean`, `agents-wide` and `agents-wide-unconfirmed` from `evals/fixtures/exporters.sh`; `brownfield-plan`, `next-feature`, `feature-within-goal`, `verify-evidence`, `regression-caught`, `risk-recheck`, `security-caught`, `scale-check-large`, `scale-check-small`, `charter-prd`, `charter-rechart`, `milestone-close` and `milestone-close-gap` are written by hand. `charter-prd`'s answer key is `evals/charter-prd/answer-key.ts`, which the tests also check against the hook's roadmap parser.

Each run is a real Claude session on your credentials, so it costs money:

```
claude plugin eval plugins/keel --scaffold --allow-tools Bash Edit Write --runs 3
```

`--case <name>` or `--tag <tag>` runs a subset. By default each case also runs without the plugin, so the report shows what keel adds.

Cases that use Bash run in a sandbox that refuses to start if a credential store such as `~/.docker` contains symlinks (common with Docker Desktop on WSL). In that case, run them on another machine or in CI. That is every case except `trigger-plan`.
