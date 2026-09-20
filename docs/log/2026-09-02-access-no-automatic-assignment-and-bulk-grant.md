# 2026-09-02 — No automatic access assignment + bulk grant/revoke

Per Huy's request, closed a design gap in the access-control model: `accessControl/{email}`'s `tabs`/`eraModes`/`eraKeycardActions`/`eraHardwareCategories` fields used to treat `null` (and a missing field) as "unrestricted — every current option, including anything added to the underlying list later." That's how the just-added `hardware` era mode ended up silently granted to every existing user with no admin action — the exact problem this fixes.

## 1–2. No automatic access assignment

- `sanitizeTabs`/`sanitizeEraModes`/`sanitizeEraKeycardActions`/`sanitizeEraHardwareCategories` (`functions/index.js`) no longer collapse "every current option checked" down to `null` — they always persist exactly the explicit array that was checked.
- `getAccessInfo()` no longer reads a `null`/missing field back as "unrestricted" — it now returns `[]` (nothing granted) for every account except the owner, who stays unrestricted regardless of any doc (unchanged, intentional — see `OWNER_EMAIL`'s own comment).
- New one-time `migrateAccessControlPermissions` callable (owner-only, dryRun default, Preview/Run buttons under `#accessMigrationWrap` in Manage Access, same pattern as the existing tag-catalog migration): backfills an explicit snapshot of today's full `MANAGEABLE_TABS`/`ERA_KEYCARD_ACTIONS`/`ERA_HARDWARE_CATEGORIES` onto any doc still on the old null/missing convention (so no existing account loses access it actually had), and — per item 1 of the request — strips `hardware` specifically from every existing user's `eraModes`, whether it got there via the old null convention or was already an explicit array. A tab/mode/action/category added after this point stays unassigned for every existing user until an admin explicitly checks it in Manage Access.
- No client-side (`src/app.js`) change was needed for this part — `submitAuthorizedUser`/`applyBulkAccessChanges` already always sent the live checked/unchecked state as an explicit array; only the server's collapse-back-to-null on save (and the read-side re-expansion) was the bug.

## 3. Manual-only, always

Unaffected — access was already fully manual (`addAuthorizedUser`/`updateAuthorizedUserRole`/`removeAuthorizedUser`, all owner-gated). This fix makes it manual for *future* permissions too, closing the one place it wasn't.

## 4–5. Bulk grant/revoke

Manage Access's Existing Users panel (`renderAccessBulkPanel`) already supported multi-select + a shared Apply button; added on top of that, per Huy's spec:

- Selecting 2+ users (including via "Select All Users") now also renders a shared bulk editor above the per-user editors (`buildAccessSharedBulkEditorHtml`) — one "Grant to all"/"Revoke from all" button pair per tab/era-mode/keycard-action/hardware-category, plus "Set for all" for role and position.
- Deliberately not a synced checkbox tree that mirrors one shared state into every selected user (that would silently overwrite whatever each already had for anything not touched). Each button only adds/removes that one permission — or sets that one field — on the users currently in `bulkAccessSelectedEmails`, via their own `bulkUserPending` entry (`bulkAccessSetPermissionForAllSelected`/`bulkAccessApplyToAllSelected`). Every other permission on those users, and every user not selected, is left exactly as it was.
- Still saved through the existing staged Apply flow (`applyBulkAccessChanges`) — nothing is written to Firestore until Apply is clicked.

See [architecture-core.md](../architecture-core.md#role-access-model) for the current-state writeup.
