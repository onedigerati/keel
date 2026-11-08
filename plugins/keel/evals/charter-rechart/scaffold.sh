#!/usr/bin/env bash
# Plotline mid-project, then its PRD changes. Charted from PRD v1 (the charter-prd answer key), with ACC-01..04
# covered by the archived accounts plan and a second plan (plots) in progress. The last commit is PRD v2, which:
#   drops HRV-03 (leaderboard); adds TL-06 (tool reservations, Release 1.1); changes PLT-03 (season from 1 April,
#   nothing built yet) and ACC-04 (reset link 30 minutes, already covered); moves TL-01 to Release 1.0 (not built)
#   and ACC-03 to Release 1.1 (already covered, so the move should be reported and asked about, not made silently).
# Synthetic and fictional, safe to commit.
set -euo pipefail
mkdir -p docs/plans/2026-11-20-accounts/evidence/stage-1 docs/plans/2026-11-20-accounts/evidence/stage-2
cat > CLAUDE.md <<'MD'
# Plotline

Run the app with `flask --app plotline run`; tests with `pytest`.

## Locked decisions (from docs/PRD.md)
- Python 3.12 with Flask and SQLite, server-rendered HTML, no JavaScript framework (§3)
- Dates and times stored as ISO 8601 strings in UTC; weights in integer grams (§3)
- A member holds at most two plots at a time (§3)
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
cat > docs/ROADMAP.md <<'MD'
# Plotline roadmap
Source: docs/PRD.md, charted 2026-11-10

## Milestones
- [ ] M1. Plots — accounts and plot booking (Release 1.0)
- [ ] M2. Harvest and tools — harvest log, tool shed and the plot waiting list (Release 1.1) (needs: M1)

## Requirements
| ID | Requirement | PRD § | Milestone | Covered by |
|----|-------------|-------|-----------|------------|
| ACC-01 | A member signs up with an email address and a password of at least 12 characters | 5.1 | M1 | 2026-11-20-accounts |
| ACC-02 | A member logs in and logs out | 5.1 | M1 | 2026-11-20-accounts |
| ACC-03 | An admin can deactivate a member, who can then no longer log in; their bookings are kept | 5.1 | M1 | 2026-11-20-accounts |
| ACC-04 | A member can reset a forgotten password through an emailed link valid for one hour | 5.1 | M1 | 2026-11-20-accounts |
| PLT-01 | An admin creates a plot with its number, size in square metres and bed type (open or raised) | 5.2 | M1 | |
| PLT-02 | Members see the plot map with each plot's status: free \| booked \| overdue | 5.2 | M1 | |
| PLT-03 | A member books a free plot for the season (1 March to 31 October) | 5.2 | M1 | |
| PLT-04 | A booking is refused, with the reason, when the member already holds two plots | 5.2 | M1 | |
| PLT-05 | A member releases a plot early and it shows as free straight away | 5.2 | M1 | |
| PLT-06 | An admin marks a booked plot overdue when its fee is unpaid 30 days after booking | 5.2 | M1 | |
| PLT-07 | When no plot is free, a member joins a first-come, first-served waiting list and is emailed when one frees up | 5.2 | M2 | |
| HRV-01 | A member logs a harvest: crop, weight and date picked | 5.3 | M2 | |
| HRV-02 | A member sees their own harvest totals per crop for the current season | 5.3 | M2 | |
| HRV-03 | An opt-in garden-wide leaderboard ranks members by total harvest weight | 5.3 | M2 | |
| HRV-04 | A member exports their own harvest log as CSV | 5.3 | M2 | |
| TL-01 | An admin keeps the list of shared tools, adding and retiring tools | 5.4 | M2 | |
| TL-02 | A member borrows a tool for up to three days | 5.4 | M2 | |
| TL-03 | Borrowing is refused while the tool is out, saying when it's due back | 5.4 | M2 | |
| TL-04 | A member returns a tool, and admins see the overdue tools | 5.4 | M2 | |
| TL-05 | A member is emailed a reminder on the day a borrowed tool is due back | 5.4 | M2 | |

## Out of scope
- Paying season fees online (cash at the shed, recorded by admins)
- Native mobile apps (the site works in a phone browser)
- More than one garden

## Open questions
- Can a member on the waiting list ask for a particular plot, or only take the next free one? — the garden committee, before Release 1.1; changes PLT-07
MD
cat > docs/plans/2026-11-20-accounts.md <<'MD'
# Accounts plan

## Goal
Members can sign up, log in and out, reset a password, and admins can deactivate them (Plotline M1, ACC-01 to ACC-04).
Evidence: [2026-11-20-accounts/evidence/](2026-11-20-accounts/evidence/)

## Now
All stages done

## Stages
- [x] 1. Sign-up and login — sign-up, login, logout
- [x] 2. Admin and reset — deactivate a member; password reset by email

## Decisions
- 2026-11-12 · Passwords hashed with werkzeug's scrypt helper — it ships with Flask
MD
cat > docs/plans/2026-11-20-accounts/evidence/stage-1/report.md <<'MD'
# Stage 1 · Sign-up and login — evidence
Verified 2026-11-15 on 1a2b3c4

| Check | Result | Evidence |
|---|---|---|
| Signing up with a 12-character password creates the member; 11 characters is refused (req: ACC-01) | pass | `test_signup_password_length` in [tests.txt](tests.txt) |
| A member logs in at /login and out at /logout (req: ACC-02) | pass | `test_login_logout` in [tests.txt](tests.txt) |
MD
cat > docs/plans/2026-11-20-accounts/evidence/stage-2/report.md <<'MD'
# Stage 2 · Admin and reset — evidence
Verified 2026-11-19 on 5d6e7f8

| Check | Result | Evidence |
|---|---|---|
| A deactivated member can no longer log in, and their bookings are kept (req: ACC-03) | pass | `test_deactivate_keeps_bookings` in [tests.txt](tests.txt) |
| The emailed reset link works within one hour and is refused after it (req: ACC-04) | pass | `test_reset_link_expires_after_one_hour` in [tests.txt](tests.txt) |
MD
cat > docs/PLAN.md <<'MD'
# Plots plan

## Goal
Members can see the plot map and book, release and be refused plots; admins create plots and mark them overdue (Plotline M1, PLT-01 to PLT-06). Done: each works in the running app, with tests.

## Now
Stage 1 of 3 · Plot admin — admins create plots with number, size and bed type
Risk: user input
Checks:
- [ ] An admin creates plot 7, 12 m², raised, and it appears on the plot map as free (proof: test)
Open: none

## Stages
- [ ] 1. Plot admin — admins create plots
- [ ] 2. Booking — book, release, the two-plot refusal
- [ ] 3. Overdue — mark plots overdue, status on the map

## Decisions
- 2026-11-21 · Plot numbers are unique integers chosen by the admin — the garden's plots are already numbered on site

## Open questions
- none

## Shipped
- 2026-11-20 · Accounts: sign-up, login, password reset and member deactivation — [plan](plans/2026-11-20-accounts.md) · [evidence](plans/2026-11-20-accounts/evidence/)
MD
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "Start plan: plots"
cat > docs/PRD.md <<'MD'
# Plotline — product requirements (v2)

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
Everything in §5.1 Accounts and §5.2 Plots, **except the waiting list (PLT-07) and member deactivation (ACC-03)**,
which move to Release 1.1, plus the tool list (TL-01) so admins can enter tools before the season. Target: before
the season opens on 1 April.

### Release 1.1 — Harvest and tools
Everything in §5.3 Harvest log and §5.4 Tool shed except TL-01, plus the waiting list (PLT-07) and member
deactivation (ACC-03). Builds on Release 1.0's accounts
and plots, so it starts only once 1.0 is live.

## 5. Requirements

### 5.1 Accounts
- **ACC-01** A member signs up with an email address and a password of at least 12 characters.
- **ACC-02** A member logs in and logs out.
- **ACC-03** An admin can deactivate a member, who can then no longer log in; their bookings are kept.
- **ACC-04** A member can reset a forgotten password through an emailed link that is valid for 30 minutes.

### 5.2 Plots
- **PLT-01** An admin creates a plot with its number, its size in square metres and its bed type (open or raised).
- **PLT-02** Members see the plot map with each plot's status, shown as one of: free | booked | overdue.
- **PLT-03** A member books a free plot for the season (1 April to 31 October).
- **PLT-04** A booking is refused when the member already holds two plots, with a message saying why.
- **PLT-05** A member releases a plot before the season ends, and it shows as free straight away.
- **PLT-06** An admin marks a booked plot overdue when its season fee is still unpaid 30 days after booking.
- **PLT-07** When no plot is free, a member can join a first-come, first-served waiting list, and is emailed when a plot frees up.

### 5.3 Harvest log
- **HRV-01** A member logs a harvest: the crop, its weight and the date picked.
- **HRV-02** A member sees their own harvest totals per crop for the current season.
- **HRV-04** A member exports their own harvest log as a CSV file.

### 5.4 Tool shed
- **TL-01** An admin keeps the list of shared tools, adding and retiring tools.
- **TL-02** A member borrows a tool for up to three days.
- **TL-03** Borrowing is refused while the tool is already out, and the page says when it's due back.
- **TL-04** A member returns a tool, and admins see a list of tools that are overdue.
- **TL-05** A member is emailed a reminder on the day a borrowed tool is due back.
- **TL-06** A member reserves a tool up to seven days ahead, and nobody else can borrow it on that day.

## 6. Out of scope
- Paying season fees online (fees are paid in cash at the shed; admins record payment by hand).
- Native mobile apps (the site must work on a phone browser).
- More than one garden.

## 7. Open questions
- Should a member on the waiting list be able to ask for a particular plot, or only take the next free one? The
  garden committee decides before Release 1.1; it changes PLT-07.
MD
git -c user.name=eval -c user.email=eval@example.com commit -qam "PRD v2 from the garden committee"
