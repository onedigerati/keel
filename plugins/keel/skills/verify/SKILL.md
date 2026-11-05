---
name: verify
description: Verify work against the running product and the project's own checks — type check, lint, tests, build, a dependency audit, then each acceptance check proven by driving the real app (screenshots, scripted clicks, requests, CLI runs). Use before calling any stage or fix done, when asked to verify, test or check something works, or when unsure whether a change actually works.
---

# Keel: verify

A clean type check proves the code compiles. Verification proves it does what the plan says, in the running product.

## 1. The project's own checks

Find how this project checks itself: `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, CI config (`.github/workflows`). Run, in order, whatever exists: type check, lint, tests, build. All must pass.

- A failure gets its output reported, never summarized as "mostly passing".
- A test that fails then passes on rerun is flaky: say so, don't hide it.
- Don't weaken a test, skip it, or loosen a lint rule to get green. If a test is wrong, say why and fix it openly.

## 2. Dependency audit

Run the stack's audit if it's available without installing anything: `npm audit --omit=dev` (or the pnpm/yarn equivalent), `pip-audit`, `cargo audit`, `govulncheck ./...`. Report high and critical findings in shipped dependencies with the package and the fixed version. Don't upgrade during verify; propose it. If no audit tool is available, say which one would apply.

## 3. The acceptance checks, in the running product

For each check in the plan's `## Now`, use the proof it names:

- **Web UI**: start the app (reuse a dev server that's already running; the built-in `run` skill knows how to launch most project types), drive it with Playwright or the project's browser tooling, take screenshots at the states the check describes, and look at them. Check the console for errors. Check a phone-width viewport when layout matters.
- **API or service**: real requests (`curl`, a short script) for the success path and at least one bad input.
- **CLI**: run it with realistic arguments and with a wrong one.
- **Library or logic**: the tests are the proof; confirm a test covers the check, and that it fails when the behavior is broken (break it briefly if in doubt).

Keep throwaway scripts and screenshots in the scratchpad, not the repo.

## 4. Report

Tick each check that passed in the plan's `## Now` (`- [x]`). Then a short table: check → pass or fail → evidence (screenshot path, test name, command and result). Then the project checks and audit in one line each. If anything failed, fix it, re-verify the affected checks, and report both the failure and the fix. Only when everything passes is the stage verified.
