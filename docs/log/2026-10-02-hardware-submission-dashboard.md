# 2026-10-02 — Dashboard > Hardware Submission

Per Huy's written spec: a Hardware Submission section on the Cubework Email Request Dashboard with the same features as the other submission sections. Nothing for Hardware existed before (only Keycard / Wi-Fi / Employee / Software had dashboards; the Printer/Phone/Laptop forms only had a "Hardware Submission" *button label*), so this reuses the **Software Submission** pattern (own collection + 3 callables + read rule + `src/app.js` bridge + dashboard card) rather than inventing anything.

## What lands here

The three Hardware forms that exist: **Printer**, **Phone**, and **Laptop on the Hardware route**. Software-route Laptop (any pick) and Laptop > Access App.CW.Com stay Software's — Save is hidden there and nothing is recorded (unchanged from before). AP/Node/Camera/NVR have no form yet, so nothing to record.

## Data (`functions/hardwareHistory.js`, `recordHardwareSubmission` / `deleteHardwareHistory` / `setHardwareHistoryStatus` in `functions/index.js`)

`hardwareRequestHistory/{requestId}`, one doc per request. The three forms have unrelated fields, so the doc is generic: `mode` (`printer|phone|laptop`), `category`, `requestType`, `locationText`, `requesterEmail`, `details[]` (request-level label/value rows), `entries[].rows[]` (per entry), plus `formStateJson` — an opaque snapshot of the form's controls (DOM order) and per-container entry counts that Edit uses to refill the form. (Nested arrays are illegal in Firestore, hence objects + a JSON string.) Same status rules as Software: Save/Preview → Pending, Send → Complete (a sent record stays Complete), manual Mark Pending/Complete wins. Non-owners can't update someone else's record.

`firestore.rules`: `hardwareRequestHistory` read rule identical to `softwareRequestHistory`; writes callable-only.

## UI (`public/index.html`)

- **Dashboard card** `era_hw_historyCard` after Software Submission: All/Pending/Complete tabs (counts), search (category, request type, location, requester, any detail), top-5 cap, 3s refresh, Edit / Mark Complete|Pending / Delete (confirm). Same classes/CSS as the siblings.
- **Save button** next to each form's "Hardware Submission" button (`era_pr_saveBtn` / `era_ph_saveBtn` / `era_lt_saveBtn`): banks the current entry as Pending with no validation and nothing sent. Laptop's Save shows only on the Hardware route (`eraHwSyncLaptopSave()`, called from `eraUpdateLtSubmitLabel()`).
- **Preview** also writes Pending; **Send** writes Complete (hooks sit right next to the Software ones in `ut()` and the send handler). Save → Preview → Send share one requestId **per form** (`eraHwRequestIds[mode]`) so a Phone Save after a Laptop Save in one session is a second record, not an overwrite.
- **Edit** routes with `eraActivateMode(mode, #era_hw_tabDropdown)` (what the Hardware dropdown's leaves do — Printer/Phone/Laptop have no top-level `#era_tabs` tab, so `eraGoToMode` would silently do nothing), rebuilds entry blocks, then refills every control from the snapshot (events on twice so the form's own show/hide + exclusivity handlers settle, then a silent final pass) and re-points the requestId at the record.

## Verified

`node --check` on `src/app.js`, rebuilt `public/app.js`, `functions/*.js`, and the embed `<script>` extracted from `index.html`; sanitizers unit-checked in Node. Live in `static-preview` with the sign-in screen hidden and the callables stubbed in-page: Printer (2 entries) / Laptop (Hardware route) / Phone Save → Pending rows; Preview updates the same record; Send → Yes/No → Complete; Software-route Laptop shows no Save and records nothing; Edit restores all three forms exactly (control-by-control comparison) and a re-Save updates the same record; Mark toggle, All/Pending/Complete filtering, search, Delete; Keycard/Wi-Fi/Employee/Software cards unaffected. The callables and Firestore rule were **not** exercised against a backend locally (the emulator on :5000 belonged to another session, and sign-in is OTP-only).
