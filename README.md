# JBIT

**Plans it. Proves it. Sees it through.**

JBIT, pronounced jay-bit, stands for Just Build It. "Just build it" is what you say to Claude. The tagline is what JBIT does so that's a safe thing to say.

It's a Claude Code plugin for long, multi-stage work, on new projects and existing ones. All project state lives in one plan file plus git, with no tracker or codebase map to keep current.

For a visual walkthrough (interactive autopilot simulation, the stage loop, guardrails and roadmaps), download [docs/field-guide.html](docs/field-guide.html) and open it in a browser.

## From goal to done

1. **You state a goal.** Say what you want built, or point Claude at a spec.
2. **One plan.** `/jbit:plan` writes `docs/PLAN.md`: the goal, stages with a risk line and acceptance checks you can observe, dated decisions and open questions. In existing code it surveys what the work touches and records a test baseline first. The plan's current position rides in Claude's context, so it survives long sessions and compaction, and new work either fits the goal or waits for the next plan.
3. **Build a stage.** `/jbit:stage` builds the next stage, fanning independent parts out to subagents as far as the plan's Agents line allows.
4. **Verify it, with evidence.** `/jbit:verify` runs the project's checks, then proves each acceptance check by a test or against the running product, and saves the report and output to `docs/evidence/stage-<n>/`.
5. **Review it.** The risk line is checked against what the code actually touches. Anything beyond UI gets a fresh-eyes review by an agent that didn't write it, with a security pass where it matters.
6. **Commit it.** One commit per stage, evidence included. Hooks refuse a commit that closes a stage without its evidence or carries a secret. Then it stops for your review.
7. **Autopilot sees it through.** `/jbit:autopilot` runs every remaining stage as project manager, without stopping in between.
8. **Next plan.** When the goal is met, `/jbit:plan` archives the plan and its evidence and starts the next one fresh.

Along the way, `/jbit:fix` takes a small, low-risk change without a stage, `/jbit:charter` turns a PRD too big for one plan into a roadmap of milestones, and `/jbit:resume` picks things up after a break.

## What it won't do

It doesn't promise a hands-free run. Autopilot still stops, enforced by hooks, for a risky stage (auth, money, personal data or your project's own risk words) until you approve it, for decisions only you can make, when it's stuck, and before outward steps such as a push, publish or deploy.

`/jbit:autopilot unattended`, typed by you, removes the waits: Claude builds risky stages and settles open decisions itself, logging each one for you. Add `outward` to let push, publish and deploy through. It removes waiting, not checks: verification, the commit gates, the secret guard and the security review stay, and migrating real data or spending money still pause.

## Moving over from keel

JBIT was called keel up to 0.11.0. To switch an existing install:

```
claude plugin uninstall keel@keel-local
claude plugin marketplace remove keel-local
claude plugin marketplace add onedigerati/jbit
claude plugin install jbit@jbit-local
```

Use the path to your local clone in place of `onedigerati/jbit` if you install from a clone, then start a new session. Commands are now `/jbit:*`; the old `/keel:*` commands no longer exist. Your repos need no edits: `Keel risk:` and `Keel outward:` lines in `CLAUDE.md` and `keel:allow-secret` markers still work, alongside `JBIT risk:`, `JBIT outward:` and `jbit:allow-secret`.

## In short

- **State.** One plan file plus git. With a PRD too big for one plan, `docs/ROADMAP.md` adds milestones and a requirement ledger, and a milestone closes only on evidence that its requirements are covered.
- **Evidence.** Each verified stage leaves a per-check report and its output in `docs/evidence/`, committed with the stage. A stage can't be closed without its report.
- **Agents level.** An `Agents: lean | wide` line in the plan sets how widely work fans out to subagents, trading tokens for wall-clock time; no line is balanced. `lean` is held to one running agent by a hook, and `wide` is honoured only once you confirm it in the session.
- **Project risk rules.** `JBIT risk:` and `JBIT outward:` lines in `CLAUDE.md` add your project's own hold words and outward commands. They only add to the built-ins, never loosen them.
- **Secret guard.** A commit that would carry a secret is blocked, and credential headers in evidence must be masked.

## Install

```
claude plugin marketplace add onedigerati/jbit
claude plugin install jbit@jbit-local
```

See [plugins/jbit/README.md](plugins/jbit/README.md) for the full story, every skill and hook, project risk rules, the secret guard, evidence, roadmaps, Agents levels and evals.
