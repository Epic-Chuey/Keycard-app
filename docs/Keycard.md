# CW Email Request — Keycard Feature Specification

> Status (2026-08-21): **all 9 §18 required changes have been implemented** in `public/index.html` (+ `functions/index.js`'s `recordKeycardSubmission` for the new Deal & LICENSEE fields) and live-tested in `firebase emulators:start` with write-bridges mocked client-side (no real Firestore/email touched) — the §18 checklist and the §16 Photo-ID-last attachment ordering (item 8, `H("keycard")` render-time sort — resolving open question §22.12 in favor of the sort approach) have all passed emulator testing, including edge cases (multiple Photo IDs, out-of-order attach). Not yet done: a full real end-to-end pass (real auth, a disposable test record, a real remote-signature email) and deployment (`firebase deploy`) — see [CHAT_LOG.md](../CHAT_LOG.md) for the session-by-session log. `src/app.js`/`public/app.js` were untouched by this work (no bridge changes needed — all new calls reuse existing pass-through `httpsCallable`s). This file documents CURRENT behavior (verified against [email-request-attachments-embed-tab.md](email-request-attachments-embed-tab.md), the relevant `docs/log/*keycard*` entries, and the current source) and DESIRED behavior (as given by Huy). Every section is explicitly labeled. Where the two conflict or the desired wording is ambiguous, it is called out inline and again in [§22 Open Questions](#22-open-questions) — no gap is silently resolved. Sections below (§4 "Current Keycard Behavior", §5–§18 "Desired...") were written pre-implementation and describe the state before this pass; they have not been rewritten to reflect the now-implemented UI — treat "DESIRED" language in those sections as "now implemented as specified" unless a CHAT_LOG entry says otherwise.
>
> Logical reference identifiers (`DEAL & LICENSEE#1`, `LOCATION#1`, `CARDHOLDERS#1`, `SERVES#1`, `CARD#1`, `SIGN#1`, `CWSIGN#1`, `ID#1`, `SAVE#1`, `WAIT#1`, `SUBMIT#1`, `ATTACH#1`, `ISSUED#1`) are **not** literal Firestore collection/field/DOM-id names. They are spec-level names for referring to a concept; §14–15 note, per identifier, whether it should reuse an existing concrete name or would need a new one, without deciding that now.

## 1. Purpose

Define the target shape of the CW Email Request → Keycard mode: a restructured UI (Deal & LICENSEE, Acknowledgement, Cardholders/Serves, per-card Sign/Photo-ID), while reusing the existing Keycard Form modal, remote e-signature, Photo ID, attachment, and submission-history machinery already built (2026-08-10 through 2026-08-20). This document is the reference Claude Code (or anyone) will implement against and verify against later — it is not itself an implementation.

## 2. Scope

In scope: CW Email Request tab, Keycard mode only (`public/index.html`'s `era-k-*` markup/scripts, the Keycard Form modal script, `functions/emailRequest.js`'s `buildKeycard()`, `functions/keycardHistory.js`, `functions/signatureRequests.js`, `functions/index.js`'s Keycard-related callables, `firestore.rules`/`storage.rules` entries for Keycard collections, `src/app.js` bridges, `public/assets/keycard-form/Cubework_Keycard_Form_v2.1.pdf`).

Out of scope: the other five CW Email Request modes (Wi-Fi, Printer, Phone, App/Soft/Hardware, Laptop), the legacy Email Request / Email Request (Attachments) tabs, the Keycard **mail-sync** dashboard (`docs/mail-sync-and-graph-auth.md` — a same-named but unrelated feature), and any other app tab (Roadmap, Standup, Daily To-Do, Issue, Manage Access).

## 3. Current Architecture

(For full detail see [architecture-core.md](architecture-core.md), [pitfalls.md](pitfalls.md), and [email-request-attachments-embed-tab.md](email-request-attachments-embed-tab.md).)

- **Monolith client/server files** — no component framework. Keycard's UI lives inside `public/index.html`'s classic (non-module) `<script>` blocks: the main CW Email Request embed script (`era_`-prefixed ids/classes, scoped under `#emailRequestAttachmentsEmbedView`) and a separate, later, self-contained `<script>` for the Keycard Form modal (deliberately not merged into the embed script — that script's file-store closures are private to its own IIFE).
- **`src/app.js` is the source; `public/app.js` is a generated, minified build artifact** (esbuild, minify-only). Any change to a `window.*` bridge function must be made in `src/app.js` and rebuilt with `npm run build` — editing `public/app.js` directly is silently overwritten on the next build.
- **Write path invariant**: Firestore rules are `allow write: if false` for every collection this feature touches; all mutations go through named `onCall` (staff-authenticated) or, for the tenant-facing remote-signature endpoints only, public `onRequest` functions in `functions/index.js` / `functions/signatureRequests.js`. Reads are direct client `onSnapshot`.
- **Role gating**: every mutating callable calls `requireRole(request, minRole)`; the client mirrors this with `canEdit()`/`isFullAccess()` for UX only — server-side `requireRole` + `firestore.rules` are the actual enforcement.
- **Classic-script/module boundary**: `app.js` loads as an ES module (top-level consts are module-scoped, not global); the Keycard `<script>` blocks are plain classic scripts and cannot call into `app.js` directly. Bridging is done via explicit `window.*` assignments from `src/app.js` (e.g. `window.submitCwEmailRequest`, `window.getSharedEmailHistory`, `window.getCurrentUserDisplayName`, the Keycard History/signature-request callables).
- **PDF**: `public/assets/keycard-form/Cubework_Keycard_Form_v2.1.pdf` (client-side fill) and `functions/assets/keycard-form/Cubework_Keycard_Form_v2.1.pdf` (server-side copy, used by the remote e-signature build) — a real fillable AcroForm confirmed via a `pypdf` field dump. Fields: `licensee_company_name`, `yardi_deal_account_number`, `property_access_location`, `floor_number`, `unit_number`, then 7 identical `card{n}_*` blocks (`name`/`keycard#`/`email`/`phone`/`signature`/`date_issued`/`date_returned`/`photo_id_yes`/`photo_id_no`/`fee_included`), then `staff_signature`/`staff_print_name`/`issued_date`. Every "signature" field is a plain `/Tx` text field, not a real `/Sig` field — signatures are stamped as PNG images over the field's widget rectangle, captured before `form.flatten()` removes the interactive fields.
- **Firestore collections currently involved**: `keycardRequestHistory/{requestId}`, `keycardFormSignatureAudit/{autoId}`, `signatureRequests/{token}`, `sharedEmailHistory/{fieldKey}`, `sharedPhoneHistory/{fieldKey}`, plus the shared `roadmapSettings`-style location catalog (`public/locations.js`) used for autocomplete.
- **Storage**: signed remote PDFs at `signatureRequests/{token}.pdf`; Photo IDs via `uploadKeycardPhotoId`.

## 4. Current Keycard Behavior

Summarized from [email-request-attachments-embed-tab.md](email-request-attachments-embed-tab.md) §"Keycard" and the dated log entries; see that document for full detail — not restated verbatim here.

- **Per-entry Action** is one `<select class="era-k-action-select">` — Activate / De-activate / Replacement / Troubleshoot / Transfer / Request Card — backed by 6 hidden `era-field-hidden` radios every other selector/listener still reads directly (`i()` drives show/hide).
- **Per-entry fields**: Keycard Number (optional, 10-digit format check), Company Name (required), Tenant First/Last Name (single combined field, required), Tenant Email/Phone (optional, live-formatted `###-###-####`), Notes, Access Level (multi-select: Standard/WH Only/Office Only/Other + custom text, joined into one comma string), Fee (hidden for De-activate/Troubleshoot).
- **Action-specific sub-blocks**: Troubleshoot ("Describe the issue"), Transfer (From/To location autocomplete, red+bold in email), Request Card (Location/Quantity 1-50/Manager Email, Cc's the manager), Replacement (per-entry Location, Card Serves checkboxes, conditionally Company/Tenant/Email/Phone + repeatable Old→New keycard pairs, one Keycard Form card fanned out per pair).
- **Top-of-card shared Location field** (`#era_location`, used for the email subject) plus a Keycard-scoped "+ Add location" (`eraExtraLocationsByMode`, per-mode state, extended to all 6 modes 2026-08-19) — extra locations render as a bold+red `Location #1:`/`Location #2:` block in Preview/sent email, never affecting the subject.
- **Serves gate** (mode-level, not yet its own card): Cubework/Unis (mutually exclusive with each other) and HikCentral/Unifi (independent of each other) checkboxes; when Cubework is checked the entry's header line renders bold+green in the sent email.
- **Keycard Form section** (`#era_k_formSection`, between Location and Serves cards): visible only when ≥1 entry is Activate or Replacement, opens a modal mirroring the PDF's fields. Card blocks (up to 7, `MAX_CARDS`) are generated from Activate/Replacement entries, fanned out one card per Replacement pair, pre-filled from Company/Tenant Name, Keycard #, Email, Phone. Each card has: a signature `<canvas>` pad ("Sign Now" — checked by default) *or* "Send for tenant e-signature instead" (mutually hides the other), Photo ID Yes/No radio + file picker.
- **Local signing**: ink requires a typed signer name + consent checkbox (ESIGN/UETA wording) before Save; SHA-256 of the final flattened PDF computed client-side; `logKeycardFormSignature` writes `keycardFormSignatureAudit/{autoId}` with server-stamped `submittedByEmail`/`submittedAt`/`ip`.
- **Remote e-signature**: `createKeycardSignatureRequest` (staff `onCall`) mints a 256-bit token, writes `signatureRequests/{token}` (`pending`, 7-day expiry), emails a `sign.html?t=<token>` link via the same delegated Graph mailbox. Tenant signs on a no-auth standalone page hitting public `onRequest` functions (`getSignatureRequest`/`submitSignatureRequest`) via `/api/...` same-origin rewrites. Duplicate-submit prevented by an atomic Firestore transaction (`pending`→`processing`). Server builds/hashes/stores the PDF, writes to the same `keycardFormSignatureAudit` collection (`signedRemotely:true`), flips to `completed`. Staff poll status, "Download & Attach" via `getSignedKeycardFormPdf` (staff `onCall`). Delivery is email-only, deliberately (SMS deferred — cost + A2P 10DLC lead time).
- **Photo ID**: local pick auto-attaches + auto-ticks "Yes"; remote signing always carries one (server-enforced); deduped by slot key `photoId_card<n>` (local/remote interchangeable); re-fetched into `photoIdFilesByCard` for every card with a recorded ID on Edit-reopen (a real bug, fixed 2026-08-20).
- **PDF flow**: capture signature widget rects → fill fields → `flatten()` → stamp opaque (no-alpha) signature PNGs at captured rects, both client-side (`buildFilledPdf()`) and server-side (`functions/signatureRequests.js`). Editing a Complete record with a remote-signed card merges a newly-drawn local signature onto the **already-downloaded** remote PDF bytes (`stampSignatureOntoExistingPdf()`) rather than rebuilding from the blank template — using a separately-loaded blank-template copy purely for field rects. More than one remotely-signed card on the same document is explicitly unhandled (shows an error).
- **Submission history**: `keycardRequestHistory/{requestId}` holds `fullEntries`, `serves`/`hikcentral`/`unifi`, `formSnapshot`, `photoIds`, `signedCards`, `sent`, `manualOverride`. Two independent Save entry points (`eraSaveKeycardSubmission()` outer button; `recordKeycardHistoryOnFormSave()` inside the modal) write the same shape via `.set(merge:true)`. Status: `"pending"` unless `sent===true` (only set by a real Preview→Send); staff can force Complete↔Pending via `setKeycardHistoryStatus`, which sets `manualOverride:true` permanently (no un-override path). Edit-restore rebuilds every field, fans Replacement pairs back into cards, re-fetches Photo IDs, and — when signature ink isn't locally recoverable but `signedCards[n]===true` — flags `confirmedSignedCards[n]` and **blocks** a re-Insert that would silently ship a version missing that signature.
- **Preview modal**: editable To/Cc/Bcc pill lists with org-wide `sharedEmailHistory` suggestions, a Format toolbar (contentEditable body, `htmlBodyOverride` on submit), and a Keycard-only attachments section (`#era_previewKformSection`) showing the signed PDF + per-card Photo ID rows with View/Edit/Delete, always re-read from the live `g.keycard` file list.
- **Save UI**: `era_k_saveBtn` ("Save," Keycard-only, writes history without sending) alongside `era_submitBtn` ("Preview"→Send).

## 5. Desired UI Structure

> **DESIRED.** Everything in this section is target behavior, not current behavior, unless explicitly marked "(already exists)".

### 5.1 Deal & LICENSEE

Rename the existing top-of-card "Location" section to **"Deal & LICENSEE"**. Logical identifier: `DEAL & LICENSEE#1`.

Fields, in order:
1. Licensee Company Name
2. Yardi Deal# / Account#
3. Property / Access Location
4. Floor #
5. Unit #
6. `+ Add location`
7. Your email (Cc'd on the request)

These map directly onto the PDF's existing top-level AcroForm fields (`licensee_company_name`, `yardi_deal_account_number`, `property_access_location`, `floor_number`, `unit_number` — confirmed present, §3) — **new UI fields, not new PDF fields.** Today's Keycard mode has no on-screen "Yardi Deal#/Account#" or "Floor #" input; only `#era_location` (maps loosely to Property/Access Location) and the per-entry Company Name (maps loosely to Licensee Company Name) exist. This is a **restructure + 2 new fields** (Yardi Deal#/Account#, Floor #), not a pure rename.

**"+Add location" and the location autocomplete itself: reuse the existing Location Features system (`LOCATION#1`) as-is.** `EraLocationFeatures` (the `{selector, datalist}` config table, §"Location Features" in the embed doc) plus `eraAddLocationRow()`/`eraRenumberLocationRows()`/`eraExtraLocationsByMode` already provide exactly this — do not build a second location-autocomplete system. Adding the Deal & LICENSEE inputs to `EraLocationFeatures`'s config table (one line per field) is the extension point, per the doc's own note ("Adding a new location field anywhere in this tab now means adding one line to that table").

"Your email (Cc'd on the request)" already exists as the requester-email field (`requesterInput`, shared across all six modes) — reuse it; do not create a second requester-email field scoped only to Keycard.

### 5.2 Locations

Covered by 5.1 — the "+Add location" behavior described there is the existing multi-location feature (2026-08-18), unchanged in mechanism. No separate section needed beyond noting: multi-location's existing bold+red rendering in Preview/sent email and its "subject always comes from Location #1 alone" rule are both **preserved as-is** — nothing in the desired requirements asks to change subject-line logic.

### 5.3 Acknowledgement

**New card**, no current equivalent. Pre-filled (read-only display, not an editable textarea, per the requirements' wording "pre-filled with") text:

> "I accept responsibility for the issued access card during my lease term. I will report loss or theft immediately and will not punch a hole in the card. Lost or unreturned cards incur a $30 charge. Each cardholder must complete this form and provide valid photo ID."

Open question: whether this text needs its own PDF field or is purely an in-app display/consent notice with no corresponding AcroForm field — see §22.

### 5.4 SERVES

The existing mode-level Serves gate (Cubework/Unis + HikCentral/Unifi checkboxes, currently just inline fields above/around the Keycard Form section) **becomes its own card**. Logical identifier: `SERVES#1`. No change to the checkbox logic itself (Cubework/Unis mutually exclusive; HikCentral/Unifi independent) — this is a **markup/layout move**, matching the precedent already set by "History card scoped to CW Email Request only" (2026-08-19) and "Location Features" extraction, both pure DOM reorganizations with zero listener changes.

### 5.5 CARDHOLDERS

**New card**, logical identifier `CARDHOLDERS#1`, associated with SERVES#1 (i.e., rendered adjacent to/depending on it — exact layout relationship not specified beyond "associated with"). This is the new container that holds the dynamic CARD#N list (§5.6) — today, the "Activate/Replacement entries fan out into Card N blocks" logic lives inside the Keycard Form **modal**, not as its own top-level card in the main form. Whether CARDHOLDERS#1 is a new *inline* card on the main Keycard tab (alongside Deal & LICENSEE/Acknowledgement/Serves) that replaces or supplements the existing modal-based card-block UI is unresolved — see §22.

### 5.6 CARD #1, CARD #2, CARD #3…

When the first card is created, green instructional text appears between CARDHOLDERS#1 and CARD#1:

> "Verify photo ID. Check the $30 fee box for each additional keycard issued under this license."

"+Add another keycard" creates CARD#2, CARD#3, etc. — **this already exists** as the Keycard Form modal's per-entry card generation (up to 7, `MAX_CARDS`) and the outer form's own multi-entry `+Add` pattern (`eraCreateKeycardEntry()`/entries list). The desired requirement that "the implementation should support dynamic card creation, not a hardcoded implementation per card" **matches the current architecture already** — cards are already generated from a loop (`currentCardEntries()`/`fanOutEntriesForCards()`), not hand-authored per index. No new dynamic-creation mechanism is needed; only the visual placement (green text, CARDHOLDERS wrapper) is new.

Each card must include, per the requirements: existing card info + `SIGN#1`-equivalent (per-card) + Date Issued + Date Returned. Date Issued/Date Returned already exist as PDF fields (`date_issued`/`date_returned` per `card{n}_*`) but it is not documented above whether they're currently surfaced as inputs in the modal, or only as PDF-fill targets with no UI — see §22.

## 6. Desired Signature and Photo ID Structure

### 6.1 SIGN#1

Represents the **customer/cardholder signature** portion of a card. Contains: signature box, e-signature email entry (manual), Send button.

**This already exists**, mapped onto today's per-card "Send for tenant e-signature instead" flow: the signature `<canvas>` pad + the inline email row (prefilled from the card's Email field, editable) + Send button that calls `createKeycardSignatureRequest`. The desired requirement to use "the existing remote e-signature infrastructure where possible instead of creating a second signing system" is **already satisfiable with the current implementation** — `SIGN#1`/`SIGN#2`/… map 1:1 onto the existing per-card signature block, keyed the same way the current code already keys it (by field name, e.g. `card1_signature`, not by position — see §21 risks). No new signing system is implied; `SIGN#N` is a rename/relabel of what's already there for spec purposes, not a new build.

### 6.2 CWSIGN#1

The CubeWork/staff signature, belonging to the ISSUED BY section (§11). **Already exists** as `staff_signature` (the "Issued By" canvas in today's modal) — `CWSIGN#1` is a logical rename of that existing field, not a new signature type. Reuse `staff_signature`'s existing default-print-name logic, auto-consent behavior, and the opaque-PNG export fix (§3/§21) unchanged.

### 6.3 ID#1

The customer/cardholder photo ID. Must: (1) be sent/associated with the customer signing workflow together with SIGN#1; (2) allow the customer to upload their own photo ID; (3) return it to the corresponding Keycard request; (4) attach it to the bottom of Attachments.

**(1)–(3) already exist**: `submitSignatureRequest` already requires a photo ID as part of the remote flow, and `attachRemotePhotoIdIfAvailable()`/`getKeycardPhotoIdData` already return it to the request and attach it. **(4) is a new, narrow requirement** — today's attachment ordering is whatever order files were added to `g.keycard` (no documented rule that Photo ID sorts last); "attach at the bottom of Attachments" would need either an explicit sort/insert-position rule in the attachment list renderer or reordering logic added to `H("keycard")`. This is a small UI-ordering change, not new plumbing.

### 6.4 Additional signatures/cards

`SIGN#2`, `ID#2`, etc. follow the same pattern as `CARD#2`, `CARD#3` — one signature slot + one photo-ID slot per card, using the existing per-card field-name-keyed (not index-keyed) state wherever the current code already does this (e.g. `photoId_card<n>` slot keys, `card{n}_signature` field names) rather than introducing a new numbering scheme.

## 7. Desired Customer E-Signature Workflow

> **DESIRED**, largely mapping onto **existing** remote e-signature behavior (§3/§4) with the new UI wrapper of §8–§10.

Staff enters the tenant's e-signature email under SIGN#N and presses Send. This should invoke the **existing** `createKeycardSignatureRequest` flow unchanged: mint token, write `signatureRequests/{token}`, email the `sign.html` link via the existing delegated Graph mailbox, no new delivery channel. Nothing here requires a second signing system — the desired workflow explicitly asks to reuse the existing tokenized flow (requirement §17 acceptance criterion #11).

## 8. Save & Leave / Wait for Signature Workflow

> **DESIRED — new UI, largely wrapping existing backend calls.**

After SIGN#1 is sent to the customer, display a card with two buttons: **SAVE & LEAVE** (`SAVE#1`) and **WAIT FOR SIGNATURE NOW** (`WAIT#1`). This two-button decision card **does not exist today** — currently, once "Send for tenant e-signature instead" is clicked, the modal simply shows a live status line (`renderRemoteStatusPanel()`, polling every 3s) with no explicit "leave or wait" choice; staff can already close the modal or keep it open, but there is no dedicated UI moment forcing that choice.

**`SAVE#1` (Save & Leave):**
1. The two-button card disappears.
2. Everything completed so far is saved.
3. The record is stored in what should be **renamed, user-facing, to "Submission"** (logical identifier `SUBMIT#1`) — see below.
4. Do not create a duplicate history system — **the existing `keycardRequestHistory` collection and its Save paths (`eraSaveKeycardSubmission()` / `recordKeycardHistoryOnFormSave()`) already provide exactly this behavior** (write a Pending record without sending). `SAVE#1` should invoke this existing Save path, not a new one.

**Rename note:** "Keycard Submission History" → "**Submission**" is a **user-facing label change only** (per the requirement's own wording, "rename the user-facing... concept"). The underlying `keycardRequestHistory` collection name, its callables (`recordKeycardSubmission`, `setKeycardHistoryStatus`, `deleteKeycardHistory`, etc.), and its `#era_k_historyCard` DOM id should not be assumed to need renaming — only user-visible copy/labels. Confirm before renaming anything server-side; a collection/field rename is a much larger, riskier change than a label change and nothing in the requirements calls for the former.

**`WAIT#1` (Wait for Signature Now):**
1. The two-button card disappears.
2. Show "Pending on customer signature and photo ID" — placed under SIGN#1.
3. Continue monitoring/updating using the **existing** remote-signature polling (`renderRemoteStatusPanel()`, the `signatureRequests` Firestore cache) — no new polling mechanism needed.

Both buttons appear to converge on the same underlying state (a Pending record exists either way, per §9) — the difference is purely whether staff stays in the modal watching the live status or leaves and checks back later via Submission (`SUBMIT#1`). This should be confirmed, not assumed — see §22.

## 9. Pending / Submission State

> **DESIRED, reusing existing Pending/Complete machinery (§3/§4) almost entirely.**

The existing `computeKeycardHistoryStatus()` rule — status is `"pending"` unless `sent===true` — is not described as changing anywhere in the requirements, and should be preserved. `SAVE#1` and `WAIT#1` (§8) both land in a Pending record, consistent with today's rule that a Save alone (however complete) never auto-promotes to Complete. Nothing here overrides `manualOverride`'s current behavior (§4) — staff's manual Complete↔Pending toggle should continue to work exactly as it does today.

## 10. Customer Completion Flow

> **DESIRED**, mapping onto **existing** completion plumbing (§3/§4) plus the association requirement below.

When the customer completes SIGN#1 and uploads ID#1:
1. Return the completed signature to the corresponding CARD.
2. Place the customer signature into the correct SIGN#N slot.
3. Attach the photo ID to ATTACH#1 (bottom of Attachments — §6.3).
4. **Preserve the relationship between the specific card, signature, and photo ID** — explicitly: "do not rely solely on positional card indexes when a stable logical field/slot identifier can be used."

Steps 1–3 already happen via the existing `submitSignatureRequest` → `downloadAndAttachSignedPdf()` → `attachRemotePhotoIdIfAvailable()` chain, which already keys by **field name** (`targetField`, e.g. `card3_signature`) and **slot key** (`photoId_card<n>`), not raw position, for exactly the reason called out in the requirement. Step 4 is therefore **already largely satisfied** by the existing architecture; the residual risk is the parts of the codebase that still resolve "which card is this" by array/DOM order at read time (e.g. `fanOutEntriesForCards()`, `currentCardEntries()` rebuilding cards from live entries) rather than by a persisted stable card ID — flagged as an existing risk in §21, not something this spec resolves by fiat.

## 11. Issued By

> **DESIRED — new card wrapping an existing field set.**

Once the customer signature + photo-ID requirements are complete, show a new card **"Issued By"** (`ISSUED#1`) containing: `CWSIGN#1`, Print Name, Date. Placed between `ATTACH#1` and the Save/Preview controls.

`CWSIGN#1`/Print Name/Date **already exist** as `staff_signature`/`staff_print_name`/`issued_date` (§3, §6.2) — this is a **visibility-gating + placement change**, not new fields. New behavior: **Issued By must be hidden until the customer signature/photo-ID prerequisite is satisfied** — today, `staff_signature` is always visible in the modal (no gating on card completion state); auto-consent/auto-fill logic already exists (§4) but nothing currently *hides* the Issued By block pending customer completion. This is a genuinely new gating rule, layered on top of existing fields.

## 12. PDF Generation and Preview

> **DESIRED**, mostly matching **existing** PDF behavior (§3/§4), with one new requirement (auto-open after fill) and Edit/Cancel/Preview button semantics that need reconciling against the existing Preview-modal Edit/Cancel/Submit-relabeled buttons.

Use the existing `Cubework_Keycard_Form_v2.1 (Rev.08.06.2026)` PDF, populated from the Keycard request — **already exists** (`buildFilledPdf()`, fill→flatten→stamp order, §3). After filling, "open/display the filled PDF for viewing" and enable Edit / Cancel / Preview:

- **Edit** — allows changes to the PDF/form info. Maps most closely to reopening the Keycard Form modal (already possible today).
- **Cancel** — closes the PDF without applying pending edits.
- **Preview** — shows the current PDF preview as-is.

**Ambiguity flagged**: the CW Email Request Preview modal *already* has buttons labeled "Edit"/"Cancel"/"Send" (renamed from "Format"/"Edit"/"Submit" on 2026-08-19, §4) at the request level, and the Keycard Form modal separately already has "Save"/"Save & Attach PDF"/"Cancel"/"Close"/"Clear all signatures" at the per-form level. It is not specified whether this requirement's Edit/Cancel/Preview trio is a **third** button set (a new lightweight PDF-viewer step between filling and the existing Preview modal) or is meant to **reuse/relabel** one of the two existing sets. Recorded as an open question (§22) rather than assumed.

The existing safeguards — signature-rect-before-flatten ordering, opaque-PNG export, remote-signed-PDF merge-not-rebuild — must be preserved unchanged regardless of how this is wired.

## 13. Edit / Cancel / Preview Behavior

Covered by §12. No additional distinct behavior specified beyond what's there.

## 14. Database and Backend Requirements

> Identifier-by-identifier mapping of the logical names onto existing (or newly-needed) concrete storage. **No renames of live Firestore collections/fields are proposed here** — only mappings, pending confirmation (§22).

| Logical ID | Existing concrete equivalent | New backend work implied? |
|---|---|---|
| `DEAL & LICENSEE#1` | PDF fields `licensee_company_name`/`yardi_deal_account_number`/`property_access_location`/`floor_number`/`unit_number` (already in the PDF); on-form state would live in the same per-request outer-field object `eraCollectKeycardOuterFieldsForHistory()` already populates | New UI inputs + 2 new on-form fields (Yardi Deal#/Account#, Floor #) not currently collected client-side; PDF-side fields already exist |
| `LOCATION#1` | `EraLocationFeatures` config table, `#era_locationList`/`#era_k_transferLocationList` datalists, `eraAddLocationRow()` | None — reuse as-is |
| Acknowledgement | none currently | New: a static/read-only text block; no Firestore field needed unless it must be recorded as "shown"/"acknowledged" per submission (undecided, §22) |
| `CARDHOLDERS#1` | none currently as a discrete card; conceptually the existing entries/cards list | New: a wrapping UI card; no new collection — backs onto existing `fullEntries`/card-block data |
| `SERVES#1` | existing mode-level Cubework/Unis/HikCentral/Unifi checkboxes + `serves`/`hikcentral`/`unifi` fields on `keycardRequestHistory` | None — move to its own card, no field rename |
| `CARD#1..N` | existing Keycard Form modal card blocks (`card{n}_*` PDF fields, `fullEntries`, `formSnapshot`) | None structurally — dynamic generation already exists; only the outer wrapper/placement (green text, CARDHOLDERS card) is new |
| `SIGN#1..N` | existing per-card signature canvas + remote e-signature (`card{n}_signature`, `signatureRequests/{token}`) | None — reuse; `SIGN#N` is a spec label for the existing field |
| `CWSIGN#1` | existing `staff_signature` | None — reuse; new *visibility gate* only |
| `ID#1..N` | existing Photo ID upload/slot-key system (`photoId_card<n>`, `uploadKeycardPhotoId`, `getKeycardPhotoIdData`) | None for capture/storage; small ordering change for "attach at bottom of Attachments" |
| `ATTACH#1` | existing `g.keycard` file list / `#era_fileList_keycard` / Preview's `#era_previewKformSection` | None structurally; ordering rule (Photo ID last) is new |
| `SAVE#1` | existing Save path(s) into `keycardRequestHistory` (Pending) | None — new UI trigger onto an existing write path |
| `WAIT#1` | existing `renderRemoteStatusPanel()` polling + Pending record | None — new UI trigger/label onto existing polling |
| `SUBMIT#1` | existing `keycardRequestHistory` collection / `#era_k_historyCard` UI | Likely **label-only** rename ("Submission"); do not rename the collection/callables without separate confirmation (§22) |
| `ISSUED#1` | existing `staff_signature`/`staff_print_name`/`issued_date` fields | New: visibility gate (hidden until customer SIGN#N/ID#N complete) + placement (between Attach and Save/Preview) |

**Dependencies to document explicitly (requirement §8):**
- Frontend (`public/index.html` embed + modal scripts) ↔ `src/app.js` bridges ↔ `functions/index.js`/`functions/emailRequest.js`/`functions/keycardHistory.js`/`functions/signatureRequests.js` ↔ Firestore (`keycardRequestHistory`, `signatureRequests`, `keycardFormSignatureAudit`) ↔ Storage (`signatureRequests/{token}.pdf`, Photo ID uploads) ↔ Microsoft Graph (send + remote-signature notification emails) ↔ PDF generation (`pdf-lib`, client and server copies of the template) ↔ Submission history (`keycardRequestHistory`, both Save paths).
- Any new field introduced for Deal & LICENSEE (Yardi Deal#/Account#, Floor #) must be threaded through: the on-form input → `Se()`'s field collection → `buildKeycard()`'s validation/PDF-fill mapping → `eraCollectKeycardOuterFieldsForHistory()` (history snapshot) → `sanitizeKeycardFullEntries` (server-side sanitization) — missing any one link reproduces the exact class of "two Save paths omit a field" bug already seen in this feature's history (§21).

## 15. Frontend State Requirements

- New UI cards (Deal & LICENSEE rename, Acknowledgement, Serves-as-card, Cardholders wrapper, Issued-By gating, Save & Leave/Wait-for-Signature decision card) are additive DOM/visibility changes on top of the existing `era-mode-fields`/`era-field-hidden` toggling conventions already used throughout this tab — no new visibility-toggling *mechanism* is implied, only new elements using the existing one.
- Per-card `SIGN#N`/`ID#N` state should continue to be tracked by **field name / slot key**, not array index, consistent with existing code (`photoIdFilesByCard`, `attachedFilenameBySlot`, `remoteSignedPdfBytesByField`) — this is a preservation requirement, not new state.
- The Save & Leave / Wait-for-Signature two-button card's visibility is a new piece of transient UI state (shown once a SIGN#N request is sent, hidden once either button is pressed) — needs a new client-side flag per card/request (in-memory is likely sufficient, matching the existing in-memory-only `savedFormState` pattern), not necessarily a new Firestore field.
- Issued By's gating condition ("required customer signature/photo-ID portion has been completed") needs a concrete boolean check — likely composed from existing per-card completeness signals (`signedCards[n]`, `photoIds[n]`, `confirmedSignedCards[n]`) already used by `validateReadyForInsert()`, rather than a new signal.

## 16. Attachment Requirements

- `ATTACH#1` reuses the existing attachment area (`g.keycard`, `#era_fileList_keycard`, Preview's `#era_previewKformSection`) and its existing deduplication (filename-pattern for the signed PDF, slot-key for Photo IDs/remote-signed PDFs) — **do not build a second attachment system.**
- New requirement: Photo ID attachments must render **at the bottom** of the Attachments list. Today's list order is insertion order with no explicit sort; this needs either (a) a stable sort key attached to each `File`/list entry (e.g. "PDF and non-photo-ID files first, photo IDs last") applied at render time in `H("keycard")`, or (b) enforcing insertion order by always appending Photo ID files last regardless of when they're picked/re-fetched. Either is a small, scoped change — flag which approach is chosen when implemented, since Edit-reopen re-fetches Photo IDs asynchronously and could otherwise land them out of order relative to a freshly regenerated PDF.

## 17. Existing Functionality That Must Be Preserved

Per requirement §15, verbatim scope, restated as a checklist (also feeds §20 Acceptance Criteria):

- All six Keycard actions: Activate, De-activate, Replacement, Troubleshoot, Transfer, Request Card — including their field sets, validation, and email-body formatting.
- Existing Access Level handling (multi-select + custom text).
- Existing location functionality (autocomplete, multi-location red/bold block, per-mode extra-location state).
- The existing Keycard Form modal (card generation, pre-fill, signature pads, Photo ID pickers).
- Existing multi-card behavior (up to 7, Replacement pair fan-out).
- Local signing (in-person, consent + signer-name gate).
- Remote e-signature (tokenized, public `onRequest`, 7-day expiry, atomic pending→processing transition).
- Photo ID collection, storage, and its slot-key dedup.
- Signature audit (`keycardFormSignatureAudit`, SHA-256 hash, server-stamped identity fields).
- Keycard Submission History (collection + both Save paths), regardless of the user-facing rename to "Submission."
- Pending/Complete state computation and `manualOverride`.
- Save/Edit/restore across sessions (including `confirmedSignedCards` blocking a lossy re-Insert).
- Preview modal (editable To/Cc/Bcc, Format toolbar, Keycard attachment breakout).
- Attachment handling and its existing dedup rules.
- PDF generation (fill→flatten→stamp order, opaque-PNG signatures, remote-signed-PDF merge behavior).
- Existing email submission path (Graph send, per-mode signature image, Outlook-deeplink fallback).
- Existing role/security enforcement (`requireRole`, `firestore.rules`, public-but-tokened remote endpoints).
- Existing Firebase/Firestore/Storage architecture (collection shapes, write-blocked rules, Storage paths).

## 18. Required Changes From Current Implementation

Distilled from §5–§13's analysis — this is the actual delta, everything else above is "already exists, reuse it":

1. **Rename** "Location" card → "Deal & LICENSEE"; **add** 2 new fields (Yardi Deal#/Account#, Floor #) that map onto already-existing PDF fields but have no on-form UI today.
2. **Add** a new static Acknowledgement card with fixed pre-filled text.
3. **Move** the existing mode-level Serves gate into its own card (`SERVES#1`) — layout change only.
4. **Add** a new `CARDHOLDERS#1` wrapper card associated with Serves, plus green instructional text shown once the first card exists — layout/placement change; card-generation mechanism underneath is unchanged.
5. **Add** a visibility gate on Issued By (`ISSUED#1`): hidden until the customer signature/photo-ID prerequisite is met (new rule; fields themselves already exist).
6. **Add** a new "Save & Leave / Wait for Signature Now" decision card shown after a SIGN#N request is sent, wrapping the existing Save-and-remote-poll paths with new UI/copy ("Pending on customer signature and photo ID" status line under SIGN#1).
7. **Rename** the user-facing "Keycard Submission History" label to "Submission" — label only, pending confirmation that no backend rename is intended (§22).
8. **Reorder** Attachments so Photo ID(s) always render last.
9. **Introduce** (or confirm reuse of) an Edit/Cancel/Preview control set immediately after PDF fill — reconciling with the existing Preview-modal and Keycard-Form-modal button sets (§12, open question).

Nothing in this list requires removing any existing functionality from §17.

## 19. Edge Cases and Failure Handling

(Existing edge cases from §3/§4 that this restructuring must not reintroduce or break, plus new ones the restructuring introduces.)

- **Existing, must remain handled:** more than one remotely-signed card being edited in the same document (currently an explicit error, not a silent failure); expired signature-request tokens (`expiresAt`, checked on both read and submit); a second concurrent remote submit for the same token (rejected via the `pending`→`processing` transaction); a Replacement entry with zero complete Old→New pairs (falls back to one blank card); more than 7 fanned-out cards (extras get a "file a separate request" note, never silently dropped); a Save with no Firebase session for the *tenant* side (never attempted — remote endpoints are intentionally public/tokened).
- **New, introduced by this spec:** what happens if staff presses SAVE & LEAVE (`SAVE#1`) with zero SIGN#N requests sent at all (i.e., no customer signing in progress) — does the two-button card even appear in that case, or does §8 only apply once ≥1 SIGN#N has been sent? Not specified — see §22. What happens if Issued By's prerequisite is met, staff fills in CWSIGN#1/Print Name/Date, and then a *new* card is added (CARD#N+1) before Save — does Issued By re-hide until the new card's SIGN#N/ID#N is also satisfied? Not specified — see §22. Ordering race between an async Photo-ID re-fetch (Edit-reopen) and the "Photo ID always last" attachment-ordering rule (§16) — needs the render-time sort approach (not insertion-order-only) to be race-safe.

## 20. Acceptance Criteria

Restated from the requirements (§17 of the prompt) as verifiable checks — none of these are met yet, since nothing has been implemented:

1. All existing CW Email Request modes (Wi-Fi, Printer, Phone, App/Soft/Hardware, Laptop) continue to function unchanged.
2. Keycard continues to support Activate, De-activate, Replacement, Troubleshoot, Transfer, Request Card with unchanged field/validation behavior.
3. "Deal & LICENSEE" card exists and contains Licensee Company Name, Yardi Deal#/Account#, Property/Access Location, Floor #, Unit #, +Add location, Your email.
4. The existing Location Features autocomplete system is reused for the new fields — no second autocomplete implementation exists.
5. "Acknowledgement" card exists with the exact required pre-filled text.
6. "Serves" renders as its own card.
7. "Cardholders" renders as its own card, associated with Serves.
8. Cards can be added dynamically (CARD#1, #2, #3, …) with no per-card hardcoded markup/logic.
9. Each card carries its existing data fields plus Date Issued/Date Returned.
10. Each card has its own SIGN#N slot, correctly associated (not purely by position).
11. Customer e-signature works through the existing tokenized remote-signature flow, unchanged in mechanism.
12. Customer Photo ID upload works through the existing upload/slot-key flow, unchanged in mechanism.
13. Signature and Photo ID remain correctly associated with their originating card after customer completion.
14. SAVE & LEAVE preserves current state as a Pending record without sending anything.
15. WAIT FOR SIGNATURE NOW displays "Pending on customer signature and photo ID" under SIGN#1 and continues live polling.
16. Customer completion (signature + photo ID) updates the corresponding request/card without manual staff re-entry.
17. Issued By is hidden until its prerequisite (customer signature/photo-ID) is satisfied, and appears once it is.
18. CWSIGN#1, Print Name, and Date persist correctly (server-side, surviving reopen).
19. Saving never creates a duplicate Pending record for the same request (reuses the existing record when one exists).
20. The existing Keycard Form PDF is populated correctly from all applicable new and existing fields.
21. Edit / Cancel / Preview (§12) each behave as specified once their relationship to the existing Preview/Keycard-Form modal buttons is resolved.
22. No existing signature is lost during an edit (including the `confirmedSignedCards` block-on-lossy-Insert behavior).
23. No existing Photo ID is lost during an edit.
24. No attachment is duplicated as a result of any new UI/flow added here.
25. Existing Pending/Complete computation and `manualOverride` continue to work exactly as before.
26. Existing signature audit logging (`keycardFormSignatureAudit`, SHA-256) continues to fire for every signing event, local or remote.
27. No `firestore.rules`/`storage.rules` entry is weakened (write-blocked invariant preserved; role minimums unchanged).
28. No unrelated CW Email Request functionality regresses.
29. Any client logic change is made in `src/app.js`, never directly in generated `public/app.js`.
30. `npm run build` is run after every `src/app.js` change, before deploying.
31. `node --check` (and, for PDF-touching changes, a throwaway `pdf-lib`/round-trip script) is run before deployment.
32. Behavior is manually inspected/click-tested against this specification before being considered complete — this feature has no automated test suite and no dry-run mode (§21).

## 21. Implementation Notes / Risks

Carried forward explicitly, per requirement §16 — these are pre-existing, documented risks this restructuring must not worsen:

- **Positional Card N indexing**: "Card N" is derived at render time from the live entries list, not a persisted card identity — reordering/adding/removing entries between sessions can shift what "Card 3" refers to. Multiple 2026-08-20 bugs trace directly to this. Any new SIGN#N/ID#N/CARD#N wiring must key by field name/slot key (as the existing remote-signature and Photo-ID code already does), not by array index, or it inherits the same bug class.
- **Two independent Save paths**: `eraSaveKeycardSubmission()` (outer Save button) and `recordKeycardHistoryOnFormSave()` (modal's own Save/Save & Attach PDF) both write `keycardRequestHistory` via `.set(merge:true)`. Any new field (Deal & LICENSEE's new inputs, Issued-By gating state, Save & Leave/Wait-for-Signature transient flags if persisted) must be added to **both** write sites or one path will silently omit it.
- **`manualOverride`**: once a staff member manually sets Complete/Pending, every subsequent automatic status recompute (`recordKeycardSubmission`, `updateKeycardHistoryStatus`, `submitSignatureRequest`) must keep checking it first and skip recompute — any new status-affecting code path (e.g. a new completion signal from Issued-By gating) must do the same check or it will silently override a manual correction.
- **Remote e-signature's trust model**: the tenant side has no Firebase Auth session at all — the token is the entire credential. Any new tenant-facing UI/data (e.g. surfacing Deal & LICENSEE fields on `sign.html`, or the Acknowledgement text) must go through the same public-but-tokened `onRequest` pattern, never assume `requireRole`/authenticated context.
- **PDF signature-rect-before-flatten ordering**: widget rects must be captured before `form.flatten()` removes interactive fields — any new PDF field (Yardi Deal#/Account#, Floor #, or anything else newly populated) must respect this same fill→flatten→stamp sequencing.
- **Opaque-PNG signature export**: every signature PNG (staff and customer, local and remote) must go through the shared `toPngDataUrl()`-style opaque-white-background compositing — a transparent/alpha signature renders fine in a local check but can silently vanish in the actual emailed PDF attachment (confirmed root cause, 2026-08-20). Any new signature-producing surface must reuse this, not reimplement export.
- **Remote-signed PDF edit-merge, not rebuild**: editing a Complete record with a remote-signed card must merge new local ink onto the **already-downloaded** remote PDF bytes, using a separately-loaded blank template purely for field rects — rebuilding from the blank template loses the customer's remote signature entirely. Any new Issued-By-gating logic that re-triggers a PDF rebuild on edit must preserve this distinction.
- **Attachment deduplication**: signed-PDF dedup is filename-pattern-based; Photo ID/remote-PDF dedup is slot-key-based. The new "Photo ID always last" ordering requirement (§16) must not break either dedup mechanism — sorting/reordering the *displayed* list is safe; anything that touches the underlying dedup-matching logic is not.
- **`src/app.js` → `public/app.js` build requirement**: every client bridge change for this feature must be made in `src/app.js`, followed by `npm run build`, before `firebase deploy --only hosting`. Editing `public/app.js` directly is silently overwritten on the next build and is a documented pitfall (#11 in [pitfalls.md](pitfalls.md)).
- **No dry-run mode / real email delivery**: there is no test-send mode anywhere in this tab (documented gotcha). Any manual testing of the new Save & Leave/Wait-for-Signature/remote-signature UI risks sending a real email to a real address unless deliberately isolated (e.g. a throwaway test address, or temporarily using `ERA_SUBMIT_MODE="outlook"` for the non-remote paths).

## 22. Open Questions

Recorded, not resolved — per instruction, no answer is invented here.

1. **Positional Card N vs. stable card ID**: should this restructuring take the opportunity to replace positional Card N with a persisted stable card identity (e.g. a UUID assigned at entry-creation time), or continue keying by field-name/slot-key as today? The requirements ask to avoid relying "solely on positional card indexes when a stable logical field/slot identifier can be used" (§10) — this reads as "keep using the existing field-name keying," not "introduce a new ID scheme," but it does not explicitly rule out a stable-ID model either.
2. **Do the six existing Keycard actions coexist with CARDHOLDERS#1 unchanged**, or does the new Cardholders/Serves/Card structure apply only to Activate/Replacement entries (as today's Keycard Form modal already scopes card generation), leaving De-activate/Troubleshoot/Transfer/Request Card entries outside the new Cardholders card entirely? Not specified.
3. **Does `SIGN#1` require a new state model**, or does it map onto the existing per-card signature-canvas + remote-request state as this document assumes in §6.1? Assumed: no new model. Confirm before implementing.
4. **Does `CWSIGN#1` map onto the existing `staff_signature` field**, or is a distinct new signature concept intended? Assumed: existing field, new gating only (§11). Confirm before implementing.
5. **Is `SUBMIT#1` ("Submission") a UI label change only, or does it require a backend rename** (collection name, callable names, DOM ids)? This document assumes label-only (§8) given the requirement's own wording ("rename the user-facing... concept") and the strong preference throughout the requirements to reuse existing architecture — but this should be explicitly confirmed, since a real collection rename touches every read/write site and `firestore.rules`.
6. **Does the existing Pending/Complete lifecycle (including `manualOverride`) need any modification**, or does Issued-By gating (§11) only add a new *visibility* condition on top of the unchanged lifecycle? Assumed: unchanged lifecycle, new visibility gate only. Confirm.
7. **Can the PDF's existing AcroForm fields support every new field without changing the source PDF?** `licensee_company_name`/`yardi_deal_account_number`/`property_access_location`/`floor_number`/`unit_number` and `date_issued`/`date_returned` per card already exist in the confirmed field dump (§3) — Acknowledgement text and the Save & Leave/Wait-for-Signature UI state have no obvious PDF-field equivalent and likely don't need one (they're in-app-only concepts, not part of the printed form). No field additions to the PDF itself appear necessary based on the existing dump, but this hasn't been re-verified field-by-field against every new requirement in this document — flagged rather than assumed.
8. **Does the Edit/Cancel/Preview control set in §12 replace, sit alongside, or get relabeled onto** the existing Preview-modal Edit/Cancel/Send buttons and/or the existing Keycard-Form-modal Save/Save & Attach PDF/Cancel/Close buttons? Not specified in the requirements; flagged as the single largest UI-reconciliation ambiguity in this document.
9. **Does the Save & Leave / Wait-for-Signature decision card (§8) appear per-card (once per SIGN#N sent) or once per request** (appearing after the *first* SIGN#N is sent, covering all outstanding remote requests at once)? Not specified.
10. **Does Issued-By re-hide if a new card is added after it was already unlocked** (§19)? Not specified.
11. **Does Acknowledgement require any persisted "shown"/"acknowledged" record**, or is it purely static display text with no backend footprint? Not specified; assumed no backend footprint (§14) pending confirmation.
12. **Attachment ordering mechanism** (§16): render-time sort vs. enforced-append-last on write — not specified which approach to take; flagged so an implementer picks deliberately rather than by accident of code path.
