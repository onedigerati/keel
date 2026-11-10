# Keel plan

## Goal
Ship the quick-fix path as keel 0.10.0. `keel:fix` lets a small, already-decided, low-risk change (UI only or no runtime behaviour, easy to undo, outside an open stage) skip the stage: built and checked in the main session with no agents, logged as one line under `## Fixes`, committed alone. plan, stage and autopilot recommend it when a request fits, and anything touching user input, auth, money, personal data, secrets, external services, migrations or quietly-wrong logic misses the bar. The draft is commit 87c281b on `quick-fix-path`. Done looks like this: hook tests and both quick-fix evals pass, a live headless run shows the installed plugin offering `keel:fix`, the docs and version say 0.10.0, and the branch is merged and pushed to origin/main so the marketplace serves it.

## Baseline
2026-11-10 · tests: 281 pass, 0 fail (`claude plugin test plugins/keel`, on the 87c281b draft) · validate: passed (`claude plugin validate plugins/keel`)

## Now
Stage 1 of 1 · Quick-fix path
Risk: guard rules — the fix bar decides which changes skip the stage, review and evidence, so a loose bar lets a risky change past the security pass
Agents: wide — confirmed 2026-11-09 08:18
Checks:
- [ ] The hook's working rules name keel:fix and its bar, and the skills list includes fix (proof: test)
- [ ] A `## Fixes` section doesn't change the stage count, and a commit adding a fix line doesn't count as closing a stage (proof: test)
- [ ] `quick-fix` eval passes with keel: an output tweak goes through keel:fix with no agents, no archive, one dated Fixes line and one `Fix:` commit (proof: eval run, a unit test can't judge the model's path)
- [ ] `quick-fix-risky` eval passes with keel: a "one-liner" rounding change to amounts is planned or asked about, never committed as a fix (proof: eval run, as above)
- [ ] A live headless session on the installed plugin lists `/keel:fix` and its working rules mention it (proof: headless run, a test can't load the installed plugin)
- [ ] plugin.json says 0.10.0 and both READMEs carry a "New in 0.10.0" line; the plan skill says where `## Fixes` goes when a plan is archived (proof: command, docs only)
Open: where `## Fixes` goes at archive (open questions); the eval checks need `~/.docker/contexts` (a broken link) removed first

## Stages
- [ ] 1. Quick-fix path — keel:fix from the 87c281b draft, both evals green, 0.10.0, merged and pushed

## Decisions
- 2026-11-10 · keel:fix ships as a one-stage plan, not through keel:fix — it adds a skill and changes the hook's working rules, so it changes runtime behaviour and misses its own bar.
- 2026-11-10 · The 87c281b draft is the stage's starting point, reviewed rather than rebuilt — it already passes the suite (281) and validate.
- 2026-11-10 · Version 0.10.0 — a new skill is a feature, as 0.8.0 and 0.9.0 were minor bumps; the marketplace entry has no version, so plugin.json's is what tells installed copies to update.
- 2026-11-10 · The `quick-fix` eval's `logs-one-fix-line` grader uses `focus: files`, not `final_state` — the eval tool rejects `final_state`, and `files` is how other cases judge the end state.
- 2026-11-10 · Agents line carried over from the last plan as it stands; it counts as balanced until the user confirms wide in this session.

## Open questions
- Does `## Fixes` stay with the archived plan (as drafted) or carry into the new plan? — the user; decides the plan skill's archive wording in stage 1.
- The eval tool won't run a Bash-granting case while `~/.docker/contexts` is a symbolic link (here it points at a missing Windows folder; Docker Desktop's WSL integration may recreate it). Setting `DOCKER_CONFIG` doesn't get around it. — the user removes the link; blocks the two eval checks.
- In evidence, prose with a header name, a colon and a 16+ character word holding a digit (`Cookie: set by middleware_handler_v2`) is flagged: the narrow false positive left by the credential-run rule, since an unquoted value runs to the end of the line (stage 2 re-verify). Base64 values split by `/` into pieces under 16 characters, and values with letters only, are missed.
- Stage 2 review, deferred: the evidence header rule reads one line at a time, so pretty-printed HAR (name and value on separate lines), headers split by `\` continuations and percent-encoded headers aren't caught. Custom auth headers (`X-Api-Key`, `X-Auth-Token`) aren't covered. A file renamed into `docs/evidence/` isn't scanned, since a rename adds no lines (which also keeps archiving from being refused). The `<…>` placeholder exemption is shape-only, so a real token wrapped in angle brackets passes. Pre-existing: the guard doesn't see index changes from `git apply --cached`, `stash pop`, `checkout <ref> -- path` or `git mv` earlier on the line, merges, or commits run from scripts; and `keel:allow-secret` is a substring anywhere on the line that exempts every pattern on it.
- Armed state doesn't survive `claude --resume` or `--fork-session`: the resumed process starts unarmed, so a plan paused on a risky stage isn't held there until autopilot is armed again (stage 1 re-verify, `docs/plans/2026-11-09-explicit-approval-secret-formats/evidence/stage-1/headless-paused.txt` lines 191–237). It matches the standing rule that autopilot is armed per session; carrying the armed state across a resume is a design change for the user to weigh.
- Stage 1 security review, deferred (pre-existing): the hold is keyed on the `## Now` stage line, so an approved line left in place while the next risky stage is built still counts as approved. Key it on stage number plus risk words? The risk line and Mode line are editable while held (already noted for project hold words). Bash writes (`cat >`, `sed -i`, `git apply`), MCP file tools and subagents' Bash aren't held. The plan-path exemption matches by case-insensitive suffix, so `src/x/docs/PLAN.md` is exempt.
- Stage 1 security review, deferred: `sdk` counts as a user origin, so in a CI host that turns issue text into prompts, whoever writes that text can approve. `composer` also covers text a plugin filled or the engine suggested. Keel clears before `next(e)`, so a prompt a later hook drops still clears. The held notice puts the agent-written stage line in an OS notification with no length cap.
- An approval isn't tied to the question it answers: while paused on a risky stage, a "yes" to any question Claude asked releases the stage. The autopilot skill tells Claude to ask only the approval question while paused on a risky stage; binding the approval to the hold the hook announced is a later design change.
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
- 2026-11-09 · Explicit approval and secret formats: a held risky stage is released only by an approval reply or `/keel:approve`, and the secret guard catches JWTs, bearer, GitLab, npm, PyPI and SendGrid tokens and unmasked credential headers in evidence (keel 0.9.0, published) — [plan](plans/2026-11-09-explicit-approval-secret-formats.md) · [evidence](plans/2026-11-09-explicit-approval-secret-formats/evidence/)
