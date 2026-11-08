# Keel

Keeps long, multi-stage work with Claude Code on course without a heavyweight process. All project state lives in one plan file plus git. Works on new projects and existing ones: there's no separate codebase map to keep current, because the plan surveys what it touches and durable facts (how to run and test) go in `CLAUDE.md`.

## Skills

| Command | What it does |
| --- | --- |
| `/keel:plan` | Creates or updates `docs/PLAN.md`: goal, current position, stages with acceptance checks and a risk line, dated decisions, open questions. Each check names its proof: a test wherever a test can cover it, otherwise the reason it can't. Adopts an existing plan file instead of starting a second one. In a repo that already has code, it first surveys the part the plan touches and records a test baseline. When a plan's goal is met, it starts the next plan (see below), moving the old plan's evidence beside its archive. |
| `/keel:stage` | Runs the next stage: scope, build (independent parts fanned out to subagents in their own worktrees), test, verify, review, update the plan, commit (the stage's evidence included), then stop for your review. Before deciding on review, it checks the risk line against what the diff actually touches and corrects it in the plan when it's wrong. The report links the stage's evidence. |
| `/keel:autopilot` | Autopilot: Claude takes over an approved plan as project manager and runs every remaining stage without stopping between them. Builders are subagents; the manager verifies (or has a fresh agent verify, writing the stage's evidence), reviews, commits and keeps the plan current. It rechecks each stage's risk line against the diff as `/keel:stage` does. The final report links each stage's evidence report. It pauses before stages that touch auth, money or personal data (including a stage whose corrected risk line names them, before closing it), on decisions only you can make, on checks it can't get green, and before anything outward-facing (push, deploy, real data). |
| `/keel:verify` | Type check, lint, tests, build and a dependency audit, then each acceptance check proven by its test or in the running product. At the plan's last stage, it also re-runs the earlier stages' checks that weren't proven by a test, so a later stage can't break one without it showing by the end of the plan. On a request only for a report, it reports failures and leaves them. For a plan stage, it saves a per-check report and the output behind it to `docs/evidence/stage-<n>/` (see [Evidence](#evidence)). |
| `/keel:review` | A fresh-eyes review by an agent that didn't write the code, with a security pass for risky stages. Run from `/keel:stage` or autopilot, the risk line has already been checked against the diff; run on its own, review takes the line as the plan has it. Findings are verified and sorted into fix, defer or reject. |
| `/keel:resume` | After a break or a context summary: reads the plan and git, reports where things stand and what's next, and offers the next plan when this one is finished. |

Claude also uses them on its own when the moment fits.

## How a project flows

1. **Plan.** `/keel:plan` writes `docs/PLAN.md`. In existing code it first surveys what the work will touch: how to run and test it, its conventions, where the change lands, what's risky nearby. It runs the checks once and records the result as a `## Baseline`, so failures that were already there aren't blamed on new work. Run and test commands go in `CLAUDE.md` rather than a separate codebase map.
2. **Build.** Step through the stages with `/keel:stage`, stopping after each for your review, or hand the plan to `/keel:autopilot`. Each stage is verified against the running product, reviewed when risky (by the risk line as checked against the diff, not only as planned), and committed with its evidence in `docs/evidence/stage-<n>/`. Verifying the last stage also re-runs the earlier stages' checks not proven by a test. Untested code gets a test of its current behavior before it changes.
3. **Next plan.** A plan covers one body of work with one Goal: a single feature, several features, or a milestone. New work that fits the Goal is added as stages; work beyond it either widens the Goal or waits for the next plan, and Claude asks which. When the Goal is met and the next body of work starts, `/keel:plan` archives the plan to `docs/plans/<date>-<plan>.md`, moves `docs/evidence/` to `docs/plans/<date>-<plan>/evidence/` beside it, and carries forward only what still applies: decisions that still bind (under `## Standing decisions`, with their dates and a link back) and open questions. It adds a line to `## Shipped` linking the archive and its evidence, then plans the new work fresh, with a new survey, a new baseline and stages numbered from 1. It commits the switch on its own and suggests `/clear` before building; nothing is lost, since the plan, the archive and git hold it all.

## Hooks

- **Plan context.** When a project has `docs/PLAN.md` (or `PLAN.md`, or `docs/BUILD_PLAN.md`), its `## Now` section rides in the system prompt, so the current stage survives long sessions and context summaries. The summarizer is also told to keep the stage state. The status line shows progress, like `keel · 2/5 done · next: 3. Share mode`, and points to `keel:plan` once every stage is done. Projects without a plan file are untouched.
- **Autopilot.** Autopilot is armed per session: when you start `/keel:autopilot`, or the Mode line turns to autopilot during the session. A `Mode: autopilot` line already in the plan when a session starts (left from an earlier session, or in a repo you cloned) never drives it; Claude reports where the run stands and asks. While armed, each time a turn ends with stages left the hook compacts the context if it's past 65% full (keeping the plan state), then prompts the manager to carry on, unless background builders are still running (their reports start the next turn). It stands aside when you start a turn yourself, stops when the plan says `Mode: paused — <reason>` and sends you a notification, and gives up after three turns in a row that leave the plan unchanged. Say "go" to resume.
- **Autopilot stops, enforced.** While autopilot is armed: outward-facing commands are blocked (`git push`, package publishes, deploys, `gh` writes, requests that send data to an outside host); a stage whose risk line names auth, money or personal data gets no file edits outside the plan and no builder agents until you reply. In every mode, a commit that ticks a stage whose `## Now` checks were never seen ticked is refused.
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

- **Triggering.** The skills load on the words people use: "where were we", "go", "take it from here", "plan it".
- **Outcomes.** The work they lead to is right:
  - a plan has observable checks;
  - verify reports a failing test honestly, and records the failing check as fail in its report (`verify-honest`);
  - verifying a stage writes `docs/evidence/stage-<n>/` with a report row per check and the evidence `.gitignore` (`verify-evidence`);
  - a risky stage is paused;
  - an autopilot line left in a repo doesn't start a run;
  - a plan in existing code records the inherited test failure as baseline and tests untested code first (`brownfield-plan`);
  - starting the next plan archives the old one and carries forward only binding decisions, and moves the old plan's evidence beside its archive (`next-feature`);
  - a new feature that fits the current Goal is added to that plan as stages rather than starting a new one (`feature-within-goal`);
  - verifying the plan's last stage re-runs an earlier stage's CLI check and reports it as fail when the new stage broke it (`regression-caught`);
  - a stage planned as "UI only" whose code takes user input gets its risk line corrected in `## Now` and a review before it closes; under the skills before 0.6.0 the line stays "UI only" (`risk-recheck`);
  - a stage whose code has a SQL injection doesn't close with it: the injection is fixed, with a test that fails on the old code, before the commit (`security-caught`).

Each case builds a small project with its own `scaffold.sh`. Most are generated from `evals/fixtures/repo.sh`; `brownfield-plan`, `next-feature`, `feature-within-goal`, `verify-evidence`, `regression-caught`, `risk-recheck` and `security-caught` are written by hand.

Each run is a real Claude session on your credentials, so it costs money:

```
claude plugin eval plugins/keel --scaffold --allow-tools Bash Edit Write --runs 3
```

`--case <name>` or `--tag <tag>` runs a subset. By default each case also runs without the plugin, so the report shows what keel adds.

Cases that use Bash run in a sandbox that refuses to start if a credential store such as `~/.docker` contains symlinks (common with Docker Desktop on WSL). In that case, run them on another machine or in CI. That is every case except `trigger-plan`.
