#!/usr/bin/env bash
# A new project with no code and no plan yet, only a PRD: 25 numbered requirements across two releases.
# Planned whole, it would run well past eight stages, so jbit:plan's scale check should fire.
set -euo pipefail
mkdir -p docs
cat > README.md <<'MD'
# hearth
A shared household budget for people who live together. See docs/PRD.md.
MD
cat > docs/PRD.md <<'MD'
# Hearth — product requirements

Hearth lets a household (two to six people sharing a home) track shared spending, split bills fairly and see
where the money goes. It is a web app with a JSON API behind it.

## Release 1 — shared spending (target: March)

1. A person signs up with email and password and confirms their email.
2. A person can reset a forgotten password by email.
3. A person creates a household and becomes its owner.
4. The owner invites others by email; an invite expires after 7 days.
5. Members can leave a household; the owner can remove a member.
6. A member records an expense: amount, date, payer, category and a note.
7. Amounts are stored in integer cents in the household's single currency.
8. An expense is split equally among all members by default.
9. An expense can instead be split by fixed amounts or by percentages that sum to 100.
10. Members can edit or delete expenses they recorded; every change is kept in a history.
11. Each member sees their running balance: what they owe and are owed.
12. The app suggests the fewest payments that settle all balances.
13. A member records a settlement payment, which updates balances.
14. Categories come from a default list, and the owner can add or rename them.
15. The expense list filters by month, category and payer.
16. Any member can export the household's expenses as CSV.

## Release 2 — budgets and insight (target: June)

17. The owner sets a monthly budget per category.
18. Members get an email when a category passes 80% and 100% of its budget.
19. A monthly summary shows spending by category against budget, with the previous month beside it.
20. Recurring expenses (rent, utilities) are created automatically on their schedule.
21. A member attaches a receipt photo to an expense (JPEG or PNG, up to 5 MB).
22. Expenses can be imported from a bank's CSV export, with a preview before saving.
23. Imported rows that match an existing expense (same amount, date within 2 days) are flagged as possible duplicates.
24. The whole app works on a phone-sized screen.
25. A member can delete their account; their past expenses stay, shown as "former member".
MD
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.com commit -qm "PRD for hearth"
