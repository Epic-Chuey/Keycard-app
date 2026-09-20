# CW Email Request, Phone tab: per-entry Action

Phone's four request types — New Phone / Troubleshoot / Replacement / Activate — moved from one submission-wide, mutually-exclusive set of checkboxes (`era_ph_create`/`era_ph_troubleshoot`/`era_ph_replacement`/`era_ph_activate`, `ERA_PH_CHECK_IDS`/`eraApplyPhoneCheckExclusivity()`) to a per-entry `<select class="era-ph-action-select">` on each phone line ("+ Add another phone line"), same idea as Keycard's own per-entry `era-k-action-select`. A single submission can now mix, say, one New Phone entry with one Troubleshoot entry with one Replacement entry.

**Client (`public/index.html` embed script):**
- `z()` (entry creation) gained the Action `<select>` at the top of each entry block, wired to call `de()` on change.
- `de()` (`eraApplyPhoneModeVisibility()`) was rewritten to iterate every entry and read *that entry's own* action instead of four global checkbox states. Per-entry: New Phone Line fields show for `create`, Troubleshoot fields for `troubleshoot`, and the Notes box shows for `replacement`/`activate` or whenever Serves is Unis (same condition as before, now evaluated per entry).
- The two attachment cards below the entries (Troubleshoot's own picker, and the "IT Form" card added earlier the same day) stayed submission-level rather than moving per-entry — with actions now mixable there's no single flag to key off, so each one shows whenever *at least one* entry matches (Troubleshoot card: any entry is Troubleshoot; IT Form card: any entry isn't). Both can show at once in a mixed submission.
- `Se()`'s phone case now collects `action` per entry instead of returning the four booleans at the submission level.
- Removed `ERA_PH_CHECK_IDS`/`ze()`/the four checkbox ids outright (no longer exist in markup).

**Server (`functions/emailRequest.js`, `buildPhone()`):** reads each entry's own `action` (defaults to `create` if missing/unrecognized, matching the client's default-selected option) instead of four submission-level booleans. Validates each entry's required fields against its own action, prints a new `Type: <label>` line per entry (needed now that entries can differ), and builds the `Request:` summary line plus the email greeting from the distinct set of actions present — a single-action batch keeps the old per-type greeting wording, a mixed batch falls back to "Please process the phone request(s) below:" (same pattern as Keycard's mixed-action fallback). Subject line still comes from the first entry only, unchanged from every other mode's convention.

See [email-request-attachments-embed-tab.md](../email-request-attachments-embed-tab.md#phone-bespoke-rebuilt-off-the-shared-template--eracreatephoneentry-mirrors-keycards-pattern) for the current-state writeup.
