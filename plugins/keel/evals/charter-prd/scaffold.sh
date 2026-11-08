#!/usr/bin/env bash
# A new project with only a PRD: Plotline, a synthetic community-garden app (fictional, safe to commit).
# 20 requirements with IDs across two releases (1.1 needs 1.0, and moves PLT-07 out of its own section's release),
# a short out-of-scope list, three locked decisions, one open question, and a requirement whose text holds `|`.
# The answer key is answer-key.ts beside this file; it is not copied into the project.
set -euo pipefail
mkdir -p docs
cat > CLAUDE.md <<'MD'
# Plotline

Run the app with `flask --app plotline run`; tests with `pytest`.
MD
cat > docs/PRD.md <<'MD'
# Plotline — product requirements

## 1. Overview
Plotline lets members of the Elm Street Community Garden book growing plots for the season, log what they harvest,
and borrow tools from the shared shed. It replaces a paper sign-up sheet on the shed door. About 60 members, two admins.

## 2. Users
- **Member**: rents up to two plots a season, logs harvests, borrows tools.
- **Admin**: a garden committee volunteer who manages plots, tools and members.

## 3. Locked decisions
These are settled and not up for discussion in any release.
- **Stack**: Python 3.12 with Flask and SQLite, server-rendered HTML. No JavaScript framework.
- **Data formats**: every date and time is stored as an ISO 8601 string in UTC; every weight is stored in integer grams.
- **Two-plot rule**: a member may hold at most two plots at any one time. This is the committee's rule, not a default.

## 4. Releases
### Release 1.0 — Plots
Everything in §5.1 Accounts and §5.2 Plots, **except the waiting list (PLT-07)**, which moves to Release 1.1 so the
committee can try the first season without it. Target: before the season opens on 1 March.

### Release 1.1 — Harvest and tools
Everything in §5.3 Harvest log and §5.4 Tool shed, plus the waiting list (PLT-07). Builds on Release 1.0's accounts
and plots, so it starts only once 1.0 is live.

## 5. Requirements

### 5.1 Accounts
- **ACC-01** A member signs up with an email address and a password of at least 12 characters.
- **ACC-02** A member logs in and logs out.
- **ACC-03** An admin can deactivate a member, who can then no longer log in; their bookings are kept.
- **ACC-04** A member can reset a forgotten password through an emailed link that is valid for one hour.

### 5.2 Plots
- **PLT-01** An admin creates a plot with its number, its size in square metres and its bed type (open or raised).
- **PLT-02** Members see the plot map with each plot's status, shown as one of: free | booked | overdue.
- **PLT-03** A member books a free plot for the season (1 March to 31 October).
- **PLT-04** A booking is refused when the member already holds two plots, with a message saying why.
- **PLT-05** A member releases a plot before the season ends, and it shows as free straight away.
- **PLT-06** An admin marks a booked plot overdue when its season fee is still unpaid 30 days after booking.
- **PLT-07** When no plot is free, a member can join a first-come, first-served waiting list, and is emailed when a plot frees up.

### 5.3 Harvest log
- **HRV-01** A member logs a harvest: the crop, its weight and the date picked.
- **HRV-02** A member sees their own harvest totals per crop for the current season.
- **HRV-03** A garden-wide leaderboard ranks members by total harvest weight; members appear on it only if they opt in.
- **HRV-04** A member exports their own harvest log as a CSV file.

### 5.4 Tool shed
- **TL-01** An admin keeps the list of shared tools, adding and retiring tools.
- **TL-02** A member borrows a tool for up to three days.
- **TL-03** Borrowing is refused while the tool is already out, and the page says when it's due back.
- **TL-04** A member returns a tool, and admins see a list of tools that are overdue.
- **TL-05** A member is emailed a reminder on the day a borrowed tool is due back.

## 6. Out of scope
- Paying season fees online (fees are paid in cash at the shed; admins record payment by hand).
- Native mobile apps (the site must work on a phone browser).
- More than one garden.

## 7. Open questions
- Should a member on the waiting list be able to ask for a particular plot, or only take the next free one? The
  garden committee decides before Release 1.1; it changes PLT-07.
MD
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "PRD for Plotline"
