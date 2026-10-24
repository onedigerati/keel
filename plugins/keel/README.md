# Keel

Keeps long, multi-stage work with Claude Code on course without a heavyweight process. All project state lives in one plan file plus git.

## Skills

| Command | What it does |
| --- | --- |
| `/keel:plan` | Creates or updates `docs/PLAN.md`: goal, current position, stages with acceptance checks and a risk line, dated decisions, open questions. Adopts an existing plan file instead of starting a second one. |
| `/keel:stage` | Runs the next stage: scope, build (independent parts fanned out to subagents), test, verify, review, update the plan, commit, then stop for your review. |
| `/keel:verify` | Type check, lint, tests, build and a dependency audit, then each acceptance check proven in the running product with evidence. |
| `/keel:review` | A fresh-eyes review by an agent that didn't write the code, with a security pass for risky stages. Findings are verified and sorted into fix, defer or reject. |
| `/keel:resume` | After a break or a context summary: reads the plan and git, reports where things stand and what's next. |

Claude also uses them on its own when the moment fits.

## Hooks

- **Plan context.** When a project has `docs/PLAN.md` (or `PLAN.md`, or `docs/BUILD_PLAN.md`), its `## Now` section rides in the system prompt, so the current stage survives long sessions and context summaries. The summarizer is also told to keep the stage state. The status line shows progress, like `keel · 2/5 done · next: 3. Share mode`. Projects without a plan file are untouched.
- **Secret guard.** Before any `git commit`, the changes it would carry are scanned for private keys, cloud and API tokens, database URLs with passwords, hard-coded credentials and credentials files such as `.env`. A hit blocks the commit and names the file, line and kind, never the value. Mark a false positive with `keel:allow-secret` on that line.

## Install

From a local clone of this repository:

```
claude plugin marketplace add ~/repos/keel
claude plugin install keel@keel-local
```

The plugin is read straight from the clone, so edits take effect after `/reload-plugins`. For a single session without installing: `claude --plugin-dir ~/repos/keel/plugins/keel`.

## Development

`claude plugin validate plugins/keel` checks the manifest and hooks; `claude plugin test plugins/keel` runs the tests.
