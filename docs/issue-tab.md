# Issue tab

> Part of the [doc map](../CLAUDE.md#documentation-map). Read before touching the Issue tab (`issueItems`, `issueTagCatalog`, region/status tabs, any `issue*`/`ISSUE_*` in `app.js`/`functions/index.js`).

`ISSUE_APP_KEY = "issue"` in `app.js`, in the app switcher next to Email Request. See CLAUDE.md for purpose/history. Own Firestore collection (`issueItems`), live per-item edits via callables (like Roadmap, not Standup/Daily To-Do's in-memory-until-Save flow). Mechanics borrowed from Roadmap/Standup/Daily To-Do, noted per section.

## Region split (Cali / Outside Cali)

One collection. `region` (`"cali"|"outsideCali"`) set once at `addIssueItem` time via `issueRegionForState()`, never changes (no move action). `renderIssueView()` filters `allIssueItems` by `region` client-side.

## "New" tab (create form)

Third, non-filtering `data-region="new"` button in `#issueRegionTabs`, left of Cali/Outside Cali. `renderIssueView()`'s `isNewIssueTab` branch hides status tabs/toolbar/list, shows `#issueAddRow` instead, gated on `canEdit()`.

Fields, in order: Title (`issueTitleInput`, required) → Helpdesk Ticket (`issueTicketInput`, optional, no catalog) → `issueStateSelect` (50 states+DC+"Other/International"; `US_STATES` in `app.js`, mirrored as `US_STATE_CODES` in `functions/index.js`) → Tag ([tag feature](tag-feature.md)) → Location (`issueLocationInput`) → Description textarea (`notes`/`issueNotesInput`, 🎙️ mic next to label) → multi-file `issueAttachmentsInput` (`accept="image/*,.pdf,.xls,.xlsx,.csv,.doc,.docx"`).

`submitIssueItem()` derives `region` via `issueRegionForState()` (`"CA"`→`"cali"`, else incl. `"OTHER"`→`"outsideCali"`), sends `ticket`/`state`/`region` to `addIssueItem`. **Server recomputes `region` from `state` whenever `state` is present** — client value never trusted alone. After creation, files upload one at a time via `addIssueAttachmentFn`; UI jumps to the region the item landed in.

Export/selection controls (`issueExportBtn`/`issueSelectionInfo`/`issueClearSelectionBtn`) live in `#issueToolbar` (not `#issueAddRow`) so they work while browsing Cali/Outside Cali even though the form only shows on New.

## Location → State auto-fill

`autofillIssueStateFromLocation()` runs on every `issueLocationInput` keystroke (with `populateLocationDatalist`). Exact label match in shared `STANDUP_LOCATION_INDEX` (`window.CUBEWORK_LOCATIONS` + `standupLocationCatalog`, see [location catalog](location-catalog.md)) sets `issueStateSelect` to that entry's `.state`. `issueStateAutoFilledValue` tracks the last value this fn set (starts `"CA"`) — keeps auto-updating until State is hand-changed, then stops. Resets to `"CA"`/auto-filled after successful `submitIssueItem()`.

## Voice input

`issueMicBtn`/`issueMicStatus` next to Description label. Client-side `window.SpeechRecognition`/`webkitSpeechRecognition` (same shape as [Daily To-Do's mic](daily-todo-tab.md)): each instance single-use, `onend` restarts unless Stop pressed (`issueStopRequested`); finalized phrases append to `issueNotesInput`. `updateIssueMicAvailability()` disables button + shows fallback text on unsupported browsers (Firefox/Safari).

## Attachments

`issueAttachmentsInput` (New tab only). No direct client write to Storage (`storage.rules`: `issueAttachments/{allPaths=**}`) — each file read as base64 client-side, sent to `addIssueAttachment` callable, which decodes/saves via Admin SDK to `issueAttachments/{itemId}/{timestamp}-{safeName}`, appends `{path,name}` to `attachments`. Cap 8 MB (`MAX_ISSUE_ATTACHMENT_BYTES`). Path scoped by `itemId` → upload only after `addIssueItem` returns; `submitIssueItem()` awaits creation then loops files via `uploadIssueFile()`. Cards with attachments get `.issue-attachments` (`hydrateIssueAttachments()`, from `renderIssueView()`) rendering `.issue-attachment-tag` pills w/ download link (`resolveAttachmentUrl()`/`getDownloadURL` cache) + editor-only ✕ → `removeIssueAttachment`. No markup editor, no add-later — attach once, at creation, New tab only.

## Status tabs (Active/Pending/Complete/All)

`#issueStatusTabs` — plain filter, mirrors Roadmap minus Planning (issue always born Active). `(N)` counts in `renderIssueView()` computed against full region list, unaffected by search/current status tab. Marking Complete/Pending reveals colored Resolution/"Why pending" box (`.issue-resolution-box`/`.issue-pending-box`, same as Roadmap's `.roadmap-resolution-box`/`.roadmap-pending-box` but 13px font not 7px) backed by separate `setIssueItemResolution`/`setIssueItemPendingReason` callables (can't clobber each other or title/location/notes).

## Selection checkboxes for export

`.issue-select-checkbox` per card; `selectedIssueItemIds` (`Set`, persists across region/status/search — same as Roadmap's `.roadmap-select-checkbox`/`selectedRoadmapItemIds`). No Compare mode, export only. "Select all shown": `issueSelectAllEl` (`#issueSelectAll` in `#issueToolbar`) ticks/unticks every row in `lastRenderedIssueItems`; `updateIssueSelectionUI()` syncs both directions.

## Location field

`issueLocationInput` (New form) and each card's `.issue-edit-location` use the shared `locationInputHtml`/`populateLocationDatalist` pattern (same as Standup/Daily To-Do row overrides) — not Roadmap's title-doubles-as-location. Title and Location stay separate fields.

## Tags

Full mechanic: [Tag feature](tag-feature.md). Card tag = colored-outline `.tag` pill (only tab using a pill, not a dot). Issue-specific: `issueSelectableTags()` excludes the fixed 8 (custom catalog only, alphabetical, "(legacy)" fallback for pre-existing fixed-tag items); "Manage custom tags" panel (`#issueTagCatalogWrap`) is a standalone block reachable from every region tab, not just New.

## Export (Excel + PDF + PNG)

Mirrors Roadmap's richest export. `issueExportBtn` → `#issueExportFormatModal` (Excel/PDF/PNG all always offered — no Timeline view to split formats). Excel (`exportIssueListToExcel`): one "Issues" sheet, columns Title/Ticket/Location/Region/State/Status/Tag/Notes/Resolution/Pending Reason/Created; ticked cards win over on-screen (same precedence as Roadmap). PDF/PNG (`exportIssueListToFile`) snapshots `#issueList` as rendered via `html2canvas`+`jsPDF` — screen only, can't pull cards from another status tab (only Excel reads cross-tab selection).

## Row list, location grouping, expand/collapse

One row per issue (`.issue-row-card`). `renderIssueView()` runs filtered items through `buildIssueLocationGroups()` — buckets by exact trimmed `location`, sorts buckets alphabetically case-insensitive (no-location bucket last), newest-first within each bucket. `renderIssueLocationGroupHtml()` renders `.issue-location-group` per bucket: non-sticky `.issue-location-header` "📍 `<location>` `<count>`" ("No location" for blank) + rows. `lastRenderedIssueItems` (what Excel reads) is this same flattened grouped order.

Row summary (checkbox, expand toggle, Title, tag, Status select, Edit/Delete) always visible; Location not repeated per row (shown in group header). Ticket/Description/attachments/Resolution-or-Pending live in `.issue-row-details`, hidden until expanded via `expandedIssueItemIds` (`Set`, persists like `editingIssueItemIds`/`selectedIssueItemIds`; chevron or title toggles). Row with nothing behind it gets a blank spacer, not a dead arrow — `hasDetails` in `renderIssueItemCard()` decides (also covers Complete/Pending boxes). Edit mode (`.issue-card-editing`) = full-form card, narrower row padding via `.issue-row-card.issue-card-editing`.

## Region/status tabs layout

`#issueRegionTabs`/`#issueStatusTabs` wrapped in `#issueControlsRow`, sticky (`position:sticky; top: calc(var(--header-h) + var(--app-switcher-h))`), docked under `#appSwitcher`, centered (`align-items:center`) — same as `#standupWorkflowNav`/`#dailyTodoWorkflowNav`/`#emailRequestWorkflowNav`.

## Data model

`issueItems/{itemId}`:

| Field | Notes |
|---|---|
| `title` | required |
| `ticket` | optional, free text, no catalog |
| `location` | optional, free text, usually catalog-matched |
| `region` | `"cali"\|"outsideCali"`, set once via `issueRegionForState()`, never changes |
| `state` | `null` or `US_STATE_CODES` value, set once at creation, never changes |
| `tag` | `null`, `STANDUP_TAGS` key, or `"custom:<id>"` — [tag feature](tag-feature.md) |
| `notes` | optional, "Description" label, voice-input target |
| `status` | `"active"\|"pending"\|"complete"`, default `"active"` |
| `resolution`/`pendingReason` | `null` until set via own callable |
| `attachments` | `{path,name}[]`, appended by `addIssueAttachment` |

Firestore rules: `allow write: if false` — only write path is `functions/index.js` callables: `addIssueItem`, `updateIssueItem`, `setIssueItemStatus`, `setIssueItemTag`, `setIssueItemResolution`, `setIssueItemPendingReason`, `deleteIssueItem`, `addIssueAttachment`, `removeIssueAttachment` (same pattern as `roadmapItems`). `title`/`ticket`/`location`/`notes` editable via `updateIssueItem`; `tag` via that form or `setIssueItemTag` (inline pill); `region`/`state` set once, no edit path.

`issueTagCatalog/{docId}`: `label`, `color`, `addedBy`, `addedAt` — same shape as `dailyTodoTagCatalog`/`standupTagCatalog`; see [tag feature](tag-feature.md) for the now-shared (`sharedTagCatalog`) mechanic.

`"issue"` is in `MANAGEABLE_TABS` in both `app.js` and `functions/index.js` (`sanitizeTabs`) — grantable per user from Access tab.

## Second creation path: Standup's "Transfer to Issue"

[Standup](standup-tab.md)'s Report step Section 2 "Transfer to Issue" button calls `addIssueItem` per selected entry — same fields/`region`/`state` derivation. Transferred item is indistinguishable from a New-tab one. See [Standup tab](standup-tab.md) for field mapping.
