---
name: review
description: Fresh-eyes review of recent work by an agent that didn't write it — correctness against the plan's intent, edge cases, tests, and a security pass when the stage touches user input, auth, money, personal data, secrets or external services. Findings are verified and triaged into fix, defer or reject. Use at the end of risky stages and milestones, or when asked to review.
---

# Keel: review

The author's review finds what the author already thought of. This one exists to find the rest.

## 1. Set the scope

- The change: the diff since the last stage commit (`git log --oneline` to find it), plus uncommitted work.
- The intent: the plan's goal, this stage's scope, acceptance checks and risk line.

## 2. Hand it to fresh eyes

Spawn one reviewer agent (general-purpose) that did not write the code. Brief it with:
- how to see the change (the commit range, or the file list);
- the intent above, quoted from the plan;
- the lenses below;
- what to return: each finding with file and line, what goes wrong, a concrete failing scenario, and confidence.

How many follows the plan's Agents line (`keel:plan`), and every level gets at least one. `lean` and no line (`balanced`): the one reviewer, and under `lean` it's the only agent running. `wide` the hook honours (one it isn't honouring yet counts as balanced), when the security lens applies: two at once, one with the always lenses and one with the security lens, each briefed as above.

Do **not** tell it what you believe is fine, what you already checked, or what you suspect. A reviewer handed a conclusion confirms it.

**Always:** does it do what the stage says; broken edge cases (empty, huge, duplicate, concurrent, offline, wrong type); error paths that swallow failures or show the wrong thing; tests that don't actually test the behavior; inconsistencies with how the codebase already does things.

**When the risk line is anything beyond "UI only", also security:**
- untrusted input: validated at the boundary; no injection into SQL, shell commands, file paths, HTML or templates;
- authentication and authorization on every route and action, including the ones the UI hides;
- secrets: not in code, logs, error messages, URLs or client bundles;
- data exposure: what leaves the app (responses, logs, analytics, third parties), personal data minimized;
- outbound requests and file access that user input can steer (SSRF, path traversal);
- new dependencies: needed, maintained, pinned;
- crypto and tokens: standard libraries, no homemade schemes, sane expiry.

For a milestone, or a stage handling money, auth or personal data, also run the built-in `security-review` skill (and `code-review` for a broad correctness sweep) rather than rebuilding them here.

## 3. Triage

Reviewers are wrong too. For each finding, check it yourself against the code (and reproduce it when you can), then put it in one of three piles:

- **Fix now**: real and in scope. Fix it, with a test when it's logic.
- **Defer**: real but out of scope. Add it to the plan's open questions with enough detail to act on later.
- **Reject**: not real, or a deliberate choice. One line saying why.

## 4. Report

Counts per pile, then each fixed and deferred item in a line. Re-run `keel:verify` for anything the fixes touched.
