# Keel plan

## Goal
Close two gaps a reviewer found in keel 0.8.0, which is already published to the marketplace, and ship them as keel 0.9.0. First, a risky stage that autopilot holds (risk line names auth, money or personal data) is released only by an explicit approval: a reply that opens with an approval word (yes, go, approve, approved, proceed, build it), or `/keel:approve`. Today any message releases it, even "what's the status?". Second, the commit secret guard also catches JWTs, `Authorization: Bearer` tokens, and GitLab, npm, PyPI and SendGrid tokens. It also refuses evidence files under `docs/evidence/` that carry an unmasked `Authorization`, `Cookie` or `Set-Cookie` header, which makes verify's masking rule checkable for those headers. Short passwords stay out of scope. Done looks like this: the hook tests prove both changes, live headless runs show them on the installed plugin, and the docs and version say 0.9.0.

## Baseline
2026-11-09 · tests: 252 pass, 0 fail (`claude plugin test plugins/keel`) · validate: passed (`claude plugin validate plugins/keel`)

## Now
Stage 1 of 2 · Explicit approval
Risk: auth (who may release a held stage)
Mode: autopilot
Agents: wide — confirmed 2026-11-09 08:18
Checks:
- [ ] Under autopilot, a held stage stays held after the user asks "what's the status?" or says "go ahead and tell me where we are": edits outside the plan and builder agents are still denied, and the band still shows `autopilot held` (proof: test)
- [ ] An approval releases it: "yes", "Go.", "approve", "proceed — build it", "yes, use the session cookie" and `/keel:approve` each clear the stage, in any case (proof: test)
- [ ] While the plan is paused on a risky stage, a non-approval message does not pre-clear it (proof: test)
- [ ] Only the user's own prompt releases a hold: a prompt from a plugin origin, Claude invoking the `keel:approve` skill, or an approval word in a file or agent report clears nothing (proof: test)
- [ ] The held notice, the deny text and the working rules each tell the user the exact reply that releases the stage (proof: test)
- [ ] `keel:approve` exists as a skill and validates; README and the autopilot skill describe approval, not "until the user speaks" (proof: `claude plugin validate`, a test can't judge the wording)
- [ ] Live: a headless autopilot session on a held auth stage stays held after "what's the status?" and builds after "approve" (proof: headless run on the installed plugin, a unit test can't show a real session)
Open: none

## Stages
- [ ] 1. Explicit approval — a held risky stage is released only by an approval reply or `/keel:approve`; notices say what to type
- [ ] 2. Secret formats — JWT, bearer, glpat, npm, PyPI and SendGrid patterns; unmasked auth and cookie headers refused in evidence; docs and version 0.9.0

Stage 2 checks (they move into `## Now` when it starts):
- JWTs, `Authorization: Bearer <long token>`, `glpat-`, `npm_`, `pypi-` and SendGrid `SG.` tokens are each flagged by kind, never by value (proof: test)
- Ordinary code still passes: `Bearer ${token}`, a bare `eyJ` prefix, `Authorization: [masked]`, `Bearer [masked]` and short example values (proof: test)
- In a file under `docs/evidence/` at any depth, an `Authorization`, `Cookie` or `Set-Cookie` header whose value isn't `[masked]` refuses the commit, in a `curl -H` command line too. The same header outside `docs/evidence/` is not flagged by this rule (proof: test)
- A short password (`password = "hunter2"`) is still not flagged (proof: test)
- README's secret-guard list names the new formats and the evidence rule; the version is 0.9.0 in `plugin.json`, with a "new in 0.9" note in the root README (proof: `claude plugin validate`, a test can't judge the wording)
- Live: a headless commit of an evidence file with an unmasked cookie is refused, and one with `[masked]` goes through (proof: headless run on the installed plugin)

## Decisions
- 2026-11-09 · An approval is the user's message opening with yes, yep, go, approve, approved, proceed or build it, then the end of the message or punctuation (`yes, …`, `Go.`), or a message opening with `/keel:approve`. "go ahead and tell me…" doesn't count, since the word is followed by a space and more text. The hook can't read intent, and a narrow, stated rule that the notices spell out is better than a guess. A "yes, but first…" still releases the stage; the user did open with yes.
- 2026-11-09 · `/keel:approve` is a skill so that it shows up as a command, but the hook clears the stage only from the user's prompt text, never when the skill runs. Claude can invoke a skill itself, so a skill-triggered clear would let it approve its own hold.
- 2026-11-09 · The "status question stays held" proof is a hook test plus a live headless run, not a new `risky-stage-held` eval arm. The eval cases are single-turn, so they can't send a second message, and the hook's rule is deterministic.
- 2026-11-09 · No short-password detection. A rule that flags `password = "hunter2"` would also fire on fixtures, docs and examples, and a guard people learn to bypass protects nothing. The hard-coded credential rule keeps its 24-character floor.
- 2026-11-09 · The evidence header rule applies only under `docs/evidence/`, where verify already must mask these headers. Elsewhere a header line is ordinary code (`Authorization: Bearer ${token}`).
- 2026-11-09 · Agents: wide, from the user ("let's go autopilot and let's go wide"). Stage 1's hook and stage 2's scanner are separate files, but stage 2's version bump and README edits touch shared docs, so the stages run in order, each fanning out internally.

- 2026-11-09 · The user approved the plan and stage 1 ("Approved.") — building it under autopilot.

- 2026-11-09 · The approval rule stays as planned (an approval word opening the reply, or `/keel:approve`), on the user's word after weighing a looser "word anywhere in a short reply" — the looser rule would count "should I approve this?".

## Open questions
- Committed screenshots get no secret scan (the guard skips binary files); the docs state the limit and review should look at committed images. A guard for images is out of scope here — the user decides whether it's worth a later plan.
- No eval covers masking yet (a case whose output holds a fake DB URL and email, graded for `[masked]`) — deferred from the last plan's stage 1 review; worth adding in a later plan.
- A `wide` (or `Mode: autopilot`) line that arrives mid-session from git — a checkout or pull of someone else's branch, or a plan that couldn't be read at the session's first look — counts as a change and is honoured without asking; the Mode line already behaves this way. Closing it (move the baseline when the line matches the plan at HEAD, or count only edits made in the user's turn) is a design change for the user to weigh — found in stage 1 review.
- With two Agents lines in `## Now`, only the first is read, so restamping the second does nothing (fails safe, but confusing); and an Agents line past `## Now`'s 40-line cap is parsed but not shown to Claude. Both minor — stage 1 review.
- The `lean` cap counts only `pending`, `running` and `waiting` agents: an `idle` teammate isn't counted (a message can wake it beside a second agent), nor are a SendMessage that resumes a finished agent or a Workflow's fan-out; and agents another plugin spawned, or a dead teammate pane still marked running, count as busy and can stall a `lean` session. The `agent.spawn` event may be a sturdier place for the cap — stage 3 review, deferred. Also deferred from its re-review: when two parallel calls are both refused (the second because the first held the slot, the first further down), the second's "one is still running" is untrue — harmless, Claude can retry.
- `agents-lean` has no balanced control: if a balanced run on the same three-exporter scaffold also builds inline, the eval can't show `lean` caused it (run it once with no Agents line; if so, give it bigger leaves) — stage 2 re-review, deferred.
- A planted stamp the hook reads as date-only (`confirmed 2026-11-08 at 23:59`) could be confirmed by a rewrite that drops the `at`, if the session runs past that minute; it needs a reformat the skills forbid — stage 2 re-review, deferred.
- Deferred from stage 2 review: the scale-check evals are single-turn, so "not asked again" and "re-asked on a stronger signal" have no eval (an arm with a planted logged answer, and one on the next-plan path); worth adding with stage 6's eval list.
- Deferred, pre-existing across all 18+ eval scaffolds: run by hand from a real repo root, a scaffold overwrites files and `git add -A && git commit`s there; a guard (refuse a non-empty directory) would make hand runs safe.
- Deferred from stage 3 review: project rules are read only from `CLAUDE.md` and `.claude/CLAUDE.md` inside the repo, not `CLAUDE.local.md` or a parent directory's `CLAUDE.md` (fails toward fewer rules); and a project hold word, like the plan's own risk line, can still be edited away by the agent while a stage is held — consistent with how the built-in hold works today.
- Deferred, pre-existing: the Bash hook's handler-level catch lets a command through if `sync` or a state read throws, the outward check included; failing closed under autopilot would stall a run on any engine error — worth a narrower catch in a later plan.
- Deferred from stage 4: no eval runs the charter's backfill, a PRD without IDs, or one without phases (stage 6's USS grading covers the last), and there's no trigger eval for `keel:charter`; add with stage 6's eval list.
- Deferred, pre-existing: `loadPlan` reads `docs/PLAN.md` without checking it's a regular file, so a FIFO there could block a request (the roadmap reader now stats first); worth the same check in a later stage.

## Standing decisions
- Standing decisions from earlier plans are in [decisions.md](decisions.md).

## Shipped
- 2026-11-07 · Verification evidence: verify saves a per-check report and its output to `docs/evidence/stage-<n>/`, stage and autopilot link it, archiving carries it along, and the commit guard refuses to close a stage without it (keel 0.5.0–0.5.2) — [plan](plans/2026-11-07-verification-evidence.md) · [evidence](plans/2026-11-07-verification-evidence/evidence/)
- 2026-11-07 · Regression and security proof: plans prefer tests as proof, verify re-runs hand-proven checks at the end of a plan, stages recheck their risk line against the diff, and evals show a regression and a planted injection caught (keel 0.6.0) — [plan](plans/2026-11-07-regression-security-proof.md) · [evidence](plans/2026-11-07-regression-security-proof/evidence/)
- 2026-11-08 · Agents level: an `Agents: lean | balanced | wide` line in `## Now` that the skills follow, shown in the status line, `lean` capped at one running agent by the hook, and `wide` honoured only once the user confirms it in-session (keel 0.7.0) — [plan](plans/2026-11-08-agents-level.md) · [evidence](plans/2026-11-08-agents-level/evidence/)
- 2026-11-08 · Large projects: `keel:charter` turns a PRD into `docs/ROADMAP.md`, plans are cut one milestone at a time, the archive fills coverage from evidence, milestones close on suite, coverage and fit; standing decisions move to `docs/decisions.md` past ten; projects add hold words and outward commands in `CLAUDE.md` (keel 0.8.0, published) — [plan](plans/2026-11-08-large-projects.md) · [evidence](plans/2026-11-08-large-projects/evidence/)
