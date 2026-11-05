# Keel

Keeps long, multi-stage work with Claude Code on course without a heavyweight process. All project state lives in one plan file plus git. Works on new projects and existing ones: there's no separate codebase map to keep current, because the plan surveys what it touches and durable facts (how to run and test) go in `CLAUDE.md`.

## Skills

| Command | What it does |
| --- | --- |
| `/keel:plan` | Creates or updates `docs/PLAN.md`: goal, current position, stages with acceptance checks and a risk line, dated decisions, open questions. Adopts an existing plan file instead of starting a second one. In a repo that already has code, it first surveys the part the plan will touch (how to run and test it, conventions, where the change lands, what's risky) and records the test suite's state as a baseline. |
| `/keel:stage` | Runs the next stage: scope, build (independent parts fanned out to subagents in their own worktrees), test, verify, review, update the plan, commit, then stop for your review. |
| `/keel:autopilot` | Autopilot: Claude takes over an approved plan as project manager and runs every remaining stage without stopping between them. Builders are subagents; the manager verifies, reviews, commits and keeps the plan current. It pauses before stages that touch auth, money or personal data, on decisions only you can make, on checks it can't get green, and before anything outward-facing (push, deploy, real data). |
| `/keel:verify` | Type check, lint, tests, build and a dependency audit, then each acceptance check proven in the running product with evidence. |
| `/keel:review` | A fresh-eyes review by an agent that didn't write the code, with a security pass for risky stages. Findings are verified and sorted into fix, defer or reject. |
| `/keel:resume` | After a break or a context summary: reads the plan and git, reports where things stand and what's next. |

Claude also uses them on its own when the moment fits.

## Hooks

- **Plan context.** When a project has `docs/PLAN.md` (or `PLAN.md`, or `docs/BUILD_PLAN.md`), its `## Now` section rides in the system prompt, so the current stage survives long sessions and context summaries. The summarizer is also told to keep the stage state. The status line shows progress, like `keel · 2/5 done · next: 3. Share mode`. Projects without a plan file are untouched.
- **Autopilot.** Autopilot is armed per session: when you start `/keel:autopilot`, or the Mode line turns to autopilot during the session. A `Mode: autopilot` line already in the plan when a session starts (left from an earlier session, or in a repo you cloned) never drives it; Claude reports where the run stands and asks. While armed, each time a turn ends with stages left the hook compacts the context if it's past 65% full (keeping the plan state), then prompts the manager to carry on, unless background builders are still running (their reports start the next turn). It stands aside when you start a turn yourself, stops when the plan says `Mode: paused — <reason>` and sends you a notification, and gives up after three turns in a row that leave the plan unchanged. Say "go" to resume.
- **Autopilot stops, enforced.** While autopilot is armed: outward-facing commands are blocked (`git push`, package publishes, deploys, `gh` writes, requests that send data to an outside host); a stage whose risk line names auth, money or personal data gets no file edits outside the plan and no builder agents until you reply. In every mode, a commit that ticks a stage whose `## Now` checks were never seen ticked is refused.
- **Secret guard.** Before any `git commit`, the changes it would carry are scanned (the index, plus `-a`, named paths, and a `git add` earlier on the same line; in the repo the command actually commits in, following `cd` and `-C`) for private keys, cloud and API tokens, database URLs with passwords, hard-coded credentials and credentials files such as `.env`. A hit blocks the commit and names the file, line and kind, never the value. Mark a false positive with `keel:allow-secret` on that line. It guards commits Claude makes through its Bash tool; for commits made any other way, pair it with a git `pre-commit` scanner such as gitleaks.

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

`evals/` holds an eval suite for `claude plugin eval`: whether the skills trigger on the words people use ("where were we", "go", "take it from here"), and whether the work they lead to is right (a plan with observable checks, an honest failing verify, a risky stage paused, an autopilot line left in a repo not starting a run). Each case builds a small project with its own `scaffold.sh`, generated from `evals/fixtures/repo.sh`. Each run is a real Claude session on your credentials, so it costs money:

```
claude plugin eval plugins/keel --scaffold --allow-tools Bash Edit Write Agent --runs 3
```

`--case <name>` runs one case. By default each case also runs without the plugin, so the report shows what keel adds.
