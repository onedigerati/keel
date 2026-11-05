# keel

A Claude Code plugin for long, multi-stage work. It keeps that work on course without a heavyweight process, and works on new projects and existing ones.

- **One plan file plus git** hold all the state. The current stage rides in Claude's context, so it survives long sessions and compaction.
- **Staged work.** Each stage is verified against the running product, reviewed when risky, and committed.
- **Autopilot** runs an approved plan stage after stage. It pauses, enforced by hooks, before risky stages and anything outward-facing.
- **Secret guard:** commits that would carry a secret are blocked.

```
claude plugin marketplace add onedigerati/keel
claude plugin install keel@keel-local
```

See [plugins/keel/README.md](plugins/keel/README.md) for the skills, hooks and how a project flows from one plan to the next.
