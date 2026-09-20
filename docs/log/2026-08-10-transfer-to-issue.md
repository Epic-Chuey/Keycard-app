# 2026-08-10: Standup → Issue — "Transfer to Issue" bridge

Added a "Transfer to Issue" button on Standup's Report step (Section 2) that sends selected entries to the Issue tab, routed to Cali/Outside Cali by location via the same catalog lookup the Summary breakdown uses (`standupAutoIssueLocation()`); unmatched locations get an explicit California/Outside California/Skip prompt rather than a silent default. Each row gets its own "→ Issue" checkbox (separate from "included"); `standupRunIssueTransfer()` calls `addIssueItem` once per selected entry, with title = raw entry text, description = AI summary if present, and tag carried over only if it was one of the 8 fixed tags (later superseded by the same-day shared-tag-catalog unification). The duplicate-transfer guard is session-only, no schema change.

Files: `public/index.html`, `src/app.js`, `public/app.js`, `docs/standup-tab.md`, `docs/issue-tab.md`
