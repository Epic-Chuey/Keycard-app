# 2026-09-19 — Access Page ↔ CW Email Request permission tree rebuild

## What changed

Replaced the Manage Access "CW Email Request" permission block's four flat,
non-cascading arrays (`tabs` stays as-is; `eraModes`, `eraKeycardActions`,
`eraHardwareCategories` are the three being replaced) with one canonical,
nested permission tree (`ERA_TREE`, mirrored in `src/app.js` and
`functions/index.js`) stored as a single flat array of granted dotted leaf
paths in a new `accessControl/{email}` field, `eraPermissions`.

- **`src/app.js`**: `ERA_TREE`, `walkEraTree`, `ERA_ALL_LEAVES`,
  `eraLeavesUnder`, `eraNodeState` (the pure tree helpers); replaced
  `currentUserEraModes`/`currentUserEraKeycardActions`/
  `currentUserEraHardwareCategories` + `canSeeEraMode`/`canDoKeycardAction`/
  `canSeeHardwareCategory` with `currentUserEraPermissions` +
  `eraHasLeaf`/`eraHasBranch`; replaced the `window.eraCanSeeMode`/
  `eraCanDoKeycardAction`/`eraCanSeeHardwareCategory` bridges with
  `window.eraHasLeaf`/`window.eraHasBranch`. Rebuilt the Access Page's tree
  renderer (`buildAccessTabsSectionsHtml`'s CW Email Request branch,
  `buildAccessSharedBulkEditorHtml`'s bulk grant/revoke rows) as one
  recursive `renderEraTreeNode`/`eraNodeState`-driven tree instead of the
  old 2-level flat one. Checking any tree node now **cascades**: every leaf
  under it is set to the new value, and every ancestor recomputes its own
  checked/indeterminate state from its children
  (`handleEraNodeToggle`/`recomputeEraTreeIndeterminate`, generic over the
  whole tree shape now, not just Keycard/Hardware's old 2 levels) — this is
  the actual behavior change from before, which deliberately did NOT
  cascade. `collectEraStateFromTree` → `collectEraPermissions` (returns a
  flat leaf-path array). Every call site that destructured
  `{eraModes, eraKeycardActions, eraHardwareCategories}` now uses one
  `eraPermissions` array instead (`bulkAccessStateFromUser`/
  `bulkAccessCloneState`/`bulkAccessStatesEqual`, the "add new user" row's
  `submitAuthorizedUser`, the existing-user editor's save path).
- **`public/index.html`**: `eraApplyAccessGating()` now reads
  `window.eraHasLeaf`/`window.eraHasBranch` through three small compat
  lookup tables (`ERA_MODE_TO_LEAF`/`ERA_MODE_TO_BRANCH`,
  `ERA_KEYCARD_ACTION_TO_LEAF`, `ERA_HWCATEGORY_TO_BRANCH`) that translate
  this file's existing mode/action/category vocabulary into `ERA_TREE`
  dotted paths — preserving exactly the granularity this file already
  gated at (mode-level tabs, Keycard's 6 actions, Hardware's 5 categories,
  and the Printer/Phone/Laptop "realleaf" gates). The old Printer dual-gate
  (`eraModes` AND `eraHardwareCategories`, an artifact of two unrelated old
  fields describing the same thing) collapsed to one `HARDWARE.PRINTER`
  branch check.
- **`functions/index.js`**: mirrored `ERA_TREE`/`walkEraTree`/
  `ERA_ALL_LEAVES`/`eraLeavesUnder`/`sanitizeEraPermissions`/
  `eraHasLeaf`/`eraHasAnyLeafUnder`/`deriveEraPermissionsFromLegacy`.
  `getAccessInfo` returns `eraPermissions` for every branch (`null` for the
  owner, `[]` for no-doc/no-email/expired-OTP, and for a real doc either the
  stored+sanitized array or, if the doc predates this rebuild,
  `deriveEraPermissionsFromLegacy(doc)` computed live — so an unmigrated
  user is never wrongly denied mid-rollout). `getMyRole` returns it too.
  `addAuthorizedUser` writes it unconditionally (new users have no legacy
  fields to preserve); `updateAuthorizedUserRole` writes it only when the
  client sends it (the rebuilt Access Page no longer sends
  `eraModes`/`eraKeycardActions`/`eraHardwareCategories` at all, so an
  existing user's legacy fields are left completely untouched).
  `migrateAccessControlPermissions` (the existing one-time/re-runnable
  backfill callable) gained a 5th pass: any doc missing `eraPermissions`
  gets it stamped via `deriveEraPermissionsFromLegacy`, plus an
  `eraPermissionsMigratedAt` timestamp. The OTP self-signup bootstrap
  (`requestEmailOtp`/`verifyEmailOtp`'s new-doc branch) now also stamps
  `eraPermissions` directly (`["KEYCARD.ACTIVATE","KEYCARD.DEACTIVATE"]`),
  matching its existing `OTP_BASIC_ERA_MODES`/`OTP_BASIC_ERA_KEYCARD_ACTIONS`.
  `requireEraAccess` — the actual backend gate — was rewritten to resolve
  each mode's real submit fields (from `functions/emailRequest.js`) to the
  specific `ERA_TREE` leaf(s) they imply and check those against
  `eraPermissions`, instead of the old flat mode/action includes() checks.
  This is now enforced at full leaf granularity for every mode that has a
  real submit path — **Wi-Fi's Cubework/Unis split, Electrical's per-serves/
  per-action split, Software's Cubework/Unis × Laptop/Phone cascade, and
  Printer's Cubework/Tenant split are all enforced server-side now**, none
  of which the old flat fields could express at all.
- **Legacy fields preserved, not deleted**: `eraModes`/`eraKeycardActions`/
  `eraHardwareCategories` stay in Firestore and in
  `functions/index.js` (`ERA_MODES`/`ERA_KEYCARD_ACTIONS`/
  `ERA_HARDWARE_CATEGORIES`, their sanitizers, `migrateAccessControlPermissions`'s
  original 4 backfill passes) as inert legacy data — read only by
  `deriveEraPermissionsFromLegacy` and the migration, written only by the
  conditional legacy branches in `updateAuthorizedUserRole` (harmless, since
  the client no longer sends those keys) and by `addAuthorizedUser` (for a
  new doc, if a caller still happens to send them). Nothing about historical
  data was destroyed, and rollback stays possible.

## Why

The Access Page's CW Email Request block and the live CW Email Request tab
had drifted apart: the tab had grown 3rd/4th-level real structure (Wi-Fi
Cubework/Unis, Electrical Cubework/Unis × 3 actions, Software Cubework/Unis
× Laptop/Phone × 3 actions, Hardware's Printer splitting into Cubework/
Tenant × actions) that the old flat 2-level arrays could not grant/deny at
that granularity, and checking a parent never cascaded into filling in its
children (an explicit past design choice that no longer matched what people
expected from a permission tree this deep). One canonical nested tree now
drives the Access Page UI, the CW Email Request tab's own UI gating, and
backend authorization, so they can't drift apart again.

## Migration mapping (as implemented in `deriveEraPermissionsFromLegacy`)

| Legacy state | New `eraPermissions` leaves granted |
|---|---|
| `eraModes` has `keycard` | for each entry in `eraKeycardActions`, its mapped `KEYCARD.<X>` leaf (`requestcard`→`REQUEST_BLANK_KEYCARD`, `deactivate`→`DEACTIVATE`, the rest are the same name uppercased) |
| `eraModes` has `wifi` | both `WIFI.CUBEWORK` and `WIFI.UNIS` (the old grant was mode-level, not serves-split — granting both is equivalent, not broader) |
| `eraModes` has `electrical` | all 6 `ELECTRICAL.*` leaves (same reasoning) |
| `eraModes` has `app` | all 12 `SOFTWARE.*` leaves (legacy-compat only — nothing in the current UI submits `mode:"app"` anymore; Software's own Laptop/Phone cascade already routes into `mode:"laptop"`/`"phone"`, same as Hardware ▾'s own Laptop/Phone entries) |
| `eraModes` has `laptop` | `SOFTWARE.CUBEWORK.LAPTOP.*`, `SOFTWARE.UNIS.LAPTOP.*`, **and** `HARDWARE.LAPTOP_PHONE.LAPTOP` only if `eraHardwareCategories` also had `laptopphone` (matches the real old dual-gate) |
| `eraModes` has `phone` | same shape as `laptop`, phone leaves |
| `eraModes` has `printer` **and** `eraHardwareCategories` has `printer` | all `HARDWARE.PRINTER.*` leaves (matches the real old dual-gate) |
| `eraHardwareCategories` has `apnode`/`camera`/`nvr` | the full leaf set under that category (placeholder actions — UI-only either way, no real submit path) |
| `eraHardwareCategories` has `laptopphone` | `HARDWARE.LAPTOP_PHONE.NEW_HIRE` only (placeholder, category-gated only, no dual requirement) |
| `eraModes` has bare `hardware` with no categories | nothing (the old "tab shell only, no category" state has no equivalent under "checking a parent grants all children" — conservative, not broader) |

Run via the existing `migrateAccessControlPermissions` callable (Manage
Access → `#accessMigrationWrap`), dry-run first. Idempotent — skips any doc
that already has an explicit `eraPermissions` array.

## Corrections after initial review

An initial pass of this rebuild under-shipped the UI-gating half and had one
over-permissive backend edge case; both were caught in review and fixed
before this doc's final version:

- **UI-level gating for the tab's own deeper leaves.** The live CW Email
  Request tab already had the necessary DOM hooks (`data-w-serves` for
  Wi-Fi, `data-el-serves`/`data-el-action` for Electrical,
  `data-ap-serves`/`data-ap-device`/`data-ap-action` for Software's
  hover-cascade leaves, `data-pr-serves`/`data-pr-action` for Printer) —
  they just weren't being consulted by `eraApplyAccessGating()` yet, which
  only gated at the coarser mode/category/action level. Fixed: all four are
  now gated directly against their `ERA_TREE` leaf via `window.eraHasLeaf`
  (straight 1:1 path mappings, no compat table needed), including hiding
  Software's intermediate Cubework/Unis and Laptop/Phone menu rows once
  every leaf under them is hidden, so an empty submenu never shows as a
  dead end. The live tab now hides exactly what a user isn't granted at
  full leaf granularity, matching what `requireEraAccess` already enforced
  server-side.
- **`requireEraAccess`'s Phone handling was briefly over-permissive.**
  `PHONE_ACTION_LABELS` (`functions/emailRequest.js`) has 5 real,
  submittable actions (`create`/`troubleshoot`/`replacement`/`activate`/
  `remove`) but `ERA_TREE`'s `SOFTWARE.*.PHONE` branch only has the 3 the
  tree spec calls for (`NEW_INSTALL`/`TROUBLESHOOT`/`REMOVE`) — a real gap
  in the tree design, not something this rebuild can invent leaves to close
  on its own. The first pass treated a `replacement`/`activate` entry as
  covered by holding ANY single Phone leaf, which meant someone granted
  only `NEW_INSTALL` could also submit Replacement/Activate requests —
  broader access than what was actually checked on the Access Page. Fixed
  with a new `eraHasAllLeavesUnder()` helper: `replacement`/`activate` now
  require ALL THREE Phone leaves under one serves branch (or the coarser
  `HARDWARE.LAPTOP_PHONE.PHONE` leaf), same as before. Still needs a
  decision from Huy: add dedicated `REPLACEMENT`/`ACTIVATE` leaves to the
  tree, or fold those two actions into an existing one. (Laptop's own
  `buildLaptopCubework`/`buildGeneric("laptop",…)` paths were audited too —
  they only ever set `create`/`troubleshoot`/`remove` booleans, no
  unmapped-action equivalent, so no matching fix was needed there.)

## Known gaps, still not fixed by this rebuild

- **AP/Node, Camera, NVR, and Hardware's own "New Hire" leaf** have no real
  submit callable today (Hardware's menu only ever feeds `mode:"laptop"`/
  `"phone"`/`"printer"` for an actual submit) — same known, pre-existing gap
  as before this rebuild, not a regression; nothing to enforce server-side
  until those get a real form/submit path.
