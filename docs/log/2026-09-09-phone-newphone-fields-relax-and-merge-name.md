# 2026-09-09 — Phone > New Phone Line: relaxed requirements, merged name field, new title option

## What changed

Scoped to **CW Email Request > Hardware > Laptop/Phone > Phone**, and within that tab only to the **New Phone Line** action's field group (`.era-ph-new-fields`, shown when a phone-line entry's `.era-ph-action-select` is `"create"`) — Troubleshoot/Replacement/Activate/Remove were left untouched, as were every other Hardware request type (Printer, Laptop) and every other tab.

1. **Required-mark (`*`) removed** from Serves, Action, Location, Person First Name, Person Last Name, Person Title, and Report to Manager (email). Location's `*` is now conditionally hidden only while Action = New Phone Line (`de()` toggles a new `.era-ph-location-required` class) — the other four actions still show it and still require it, unaffected. `buildPhone()` (`functions/emailRequest.js`) dropped the matching "missing field" checks for Serves and for New Phone Line's Person First/Last Name, Title, and Manager Email; Location's requirement was moved to only apply when `action !== "create"`. Manager Email keeps a format check (still flags e.g. `not-an-email`) but no longer requires a value at all.

   Worth noting: Phone (and the rest of the Hardware family — Printer/Laptop) already had **every** client-side Submit-blocking check removed in an earlier 2026-09-09 pass (`Le()` short-circuits for `eraIsHardwareFamilyMode()`), so these fields were already non-blocking on Submit before this change — this pass removes the now-misleading visual `*` markers and tidies the corresponding (largely dead) server-side checks to match, plus does the two real structural changes below.

2. **Person First Name + Person Last Name merged into one field** — single input, class `era-ph-personName`, label "Person First Last Name". Updated everywhere the two old fields were read: the entry's client-side field collector, `buildPhone()`'s subject-line name suffix (`- Jane Doe`), and its per-entry `Person:` email-body line. The old `era-ph-firstName`/`era-ph-lastName` classes are gone from the codebase (server's `userFirstName`/`userLastName` — the *Troubleshoot* group's separate person fields — are untouched, different fields entirely).

3. **Person Title dropdown:** added **"Property Management"**, placed between the existing Facility Lead and Maintenance options. Order is now National Manager → Facility Manager → Facility Lead → Property Management → Maintenance → Janitor; no other option changed.

## Why

Per Huy's request: reduce friction on filing a New Phone Line request (drop requirements that were blocking or visually implying a block on fields that don't need to be mandatory), collapse the redundant first/last name split into one field, and add a title option Huy's team needed (Property Management) in a specific slot in the list.

## Verification

No test runner in this repo. Did:
- `node --check` on `functions/emailRequest.js`, `functions/index.js`, and the inline `<script>` in `public/index.html` extracted at build-check time — all pass.
- Ran `buildEmailRequest()` (from `functions/emailRequest.js`) directly under Node against representative payloads: New Phone Line with only Location filled (no errors, correct subject/body), New Phone Line fully filled including `title: "Property Management"` (renders `Title: Property Management` correctly), and a Troubleshoot entry with blank Location (confirmed unaffected/unchanged action shape).
- Not driven through the live signed-in browser UI — the tab requires a `@cubework.com` Firebase Auth session not available in this environment.

See [docs/email-request-attachments-embed-tab.md](../email-request-attachments-embed-tab.md#phone-bespoke-rebuilt-off-the-shared-template--eracreatephoneentry-mirrors-keycards-pattern) for the updated current-state description.
