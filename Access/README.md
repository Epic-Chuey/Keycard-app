# Manage Access tab — reference

This folder is a **documentation-only** index for the "Manage access" tab
(`ACCESS_APP_KEY = "access"`). There is no separate build here and nothing in
this folder is loaded by the app — the live code stays in the repo's usual
monolith files, per [../CLAUDE.md](../CLAUDE.md)'s "two monolith files"
invariant. This is just a dedicated map of where that code lives and what its
data/config shapes are, kept up to date as the tab changes.

## Where the real code lives

| Piece | File |
|---|---|
| `#accessView` markup (new-user form, position filter tabs, search input, tag-migration tool) | `../public/index.html` (search `accessView`) |
| Client logic (render, filters, fuzzy search, add/update/remove handlers) | `../src/app.js` (search `ACCESS_APP_KEY`, `renderAccessList`, `POSITION_LABELS`, `MANAGEABLE_TABS`) — built to `../public/app.js` via `npm run build` |
| Server callables (`addAuthorizedUser`, `updateAuthorizedUserRole`, `removeAuthorizedUser`, `getMyRole`) + validation (`VALID_ROLES`, `VALID_POSITIONS`, `sanitizeTabs`, `sanitizePosition`) | `../functions/index.js` |
| Firestore write rules for `accessControl` (owner-only) | `../firestore.rules` |

`../docs/architecture-core.md` covers the role/access model's hard invariants
(never edit `accessControl` client-side, `requireRole`/`requireOwner` gate
every mutation, `OWNER_EMAIL` always resolves to `full`). Read that first for
*why* the tab is shaped this way; this file is just *where things are*.

## Data model — `accessControl/{email}` docs

```
{
  email: string,                // lowercased, same as the doc id
  role: "view" | "edit" | "full",
  position: "" | "dev" | "sale" | "facilityLead" | "facilityManager" | "boss" | "hr",
  tabs: string[] | null,        // null = every manageable tab (unrestricted);
                                 // [] = no tabs granted; otherwise the exact
                                 // granted subset. See MANAGEABLE_TABS below.
  showVideo: boolean,           // unrelated toggle, not part of this update
  addedBy / addedAt, updatedBy / updatedAt: audit fields
}
```

`huy.nguyen@cubework.com` (`OWNER_EMAIL`) is never stored here and always
resolves to `role: "full"`, `tabs: null` server-side.

## Config that has to stay in sync across files

- **Positions** — `VALID_POSITIONS` (`functions/index.js`, server-side
  validation) and `POSITION_LABELS` (`src/app.js`, client labels for both the
  new-user select and each row's select) must list the same keys. The
  position **filter tabs** row (`#accessPositionTabs` in `index.html`, one
  `<button data-position="...">` per value, plus one for `""` = All) is a
  third place that has to be updated by hand when a position is added — it's
  static markup, not generated from `POSITION_LABELS`.
  Current values: `dev`, `sale`, `facilityLead`, `facilityManager`, `boss`,
  `hr` (HR added 2026-08-18).
- **Manageable tabs** — `MANAGEABLE_TABS` (`src/app.js`, drives both the
  per-row visible-tabs checkboxes and the new-user `#accessNewTabsRow`
  checkboxes) must list the same tab keys as `MANAGEABLE_TABS` in
  `functions/index.js` (server-side `sanitizeTabs` — an array is only ever
  stored as an explicit subset when it's shorter than the full list;
  otherwise it's normalized back to `null`/unrestricted). Current values:
  `standup`, `dailyTodo`, `roadmap`, `emailRequestAttachmentsEmbed`, `issue`.
  Each entry's checkbox markup in `index.html`'s `#accessNewTabsRow` is also
  static and has to be added by hand alongside a new `MANAGEABLE_TABS` entry.

## User search (added 2026-08-18)

`#accessSearchInput` (index.html) live-filters the rendered list in
`renderAccessList` (src/app.js) using `fuzzyMatchScore` — a subsequence match
against each user's email (characters of the query must appear in order,
not necessarily contiguous — e.g. `"hgn"` matches `"huy.nguyen"`), scored by
match tightness so closer/earlier matches sort first. It AND-combines with
the existing position filter tabs (`currentAccessPositionFilter`) — both
must pass for a row to show.

## New-user default tabs (changed 2026-08-18)

The `#accessNewTabsRow` checkboxes now start **unchecked** for every new
user (previously all-checked). Someone with owner access has to manually
pick which tabs a new user can see before clicking Add; submitting with none
checked stores `tabs: []` (no tabs granted), not `null` (unrestricted). This
only affects the *new-user* form — existing users' per-row checkboxes are
unaffected and still reflect whatever is actually stored on their doc.

## Change log

- **2026-08-18** — Added `hr` as a position (filter tab + dropdown option,
  both places). Added live fuzzy email search (`#accessSearchInput`,
  `fuzzyMatchScore`). Changed the new-user "Visible tabs" checkboxes to
  start unchecked instead of all-checked.
