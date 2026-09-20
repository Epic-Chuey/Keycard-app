# 2026-08-18: Keycard's subject rewrite applied to Wi-Fi/Printer/Phone/App-Soft-Hardware/Laptop

Extends the same-day Keycard subject rewrite (generic "Request" replaced with the actual checked action) to the other five request types, in `functions/emailRequest.js`, subject-line construction only — no validation/body/recipient/attachment logic touched:

- `buildWifi()`: `"{Location} - WiFi {Action} - {label}"`, Action = Create > De-activate > Troubleshoot (default Create).
- `buildGeneric()` (Printer/App New Install-Troubleshoot/Laptop): `"{Location} - {subjectModeLabel} {Action} - {label}"`, with a new per-kind `subjectModeLabel` ("Printer"/"App/Soft/Hardware"/"Laptop") kept separate from the pre-existing `subjectSuffix` (still used for the unrelated "add at least one entry" error). Action = Printer's `newreplace` > `createLabel` > Troubleshoot (default `createLabel`).
- `buildAppHardware()`: `"{Location} - App/Soft/Hardware Hardware Request - {label}"`; also tightened `distinctSubjectLabel()`'s fallback from `"Hardware Request"` to `""` so a location match drops the trailing label entirely instead of repeating it.
- `buildPhone()`: `"{Location} - Phone {Action} - {label}"`, Action = New Phone Line > Troubleshoot > Replacement > Activate (default New Phone Line).

Keycard itself and `public/index.html` are untouched by this pass.

Files: `functions/emailRequest.js`
