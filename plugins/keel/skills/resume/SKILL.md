---
name: resume
description: Pick a project back up after a break, a restart or a context summary — read the plan, the commits since the last stage, and uncommitted work, then say where things stand and what's next. Use at the start of a session on an existing project, after compaction, or when the user asks where we are.
---

# Keel: resume

Rebuild the picture from what's written down, not from memory. A summary of the conversation is a lead, not a source; the plan and git are the sources.

## Gather

1. The plan (`docs/PLAN.md`, or the plan the project keeps): goal, `## Now`, stages, recent decisions, open questions.
2. `git log --oneline -15` and the date of the last stage commit; anything after it is work in the current stage.
3. `git status` and `git diff --stat`: uncommitted work, and whether it matches the current stage.
4. Anything the plan or memory says is running or pending (a dev server, a background job, a question put to the user).

## Reconcile

Look for drift between the plan and the repo: a stage ticked but its work missing, work committed that the plan doesn't mention, a decision in the conversation that never reached the decisions log. Fix the plan where the repo is clearly right; ask where it's unclear.

## Report

In a few lines:
- where things stand: the stage, and which of its checks have passed;
- what changed since the last stage commit, and any uncommitted work;
- decisions waiting on the user;
- the next step you'd take.

Then wait for the user's go, unless they already gave it in the message that brought you here.
