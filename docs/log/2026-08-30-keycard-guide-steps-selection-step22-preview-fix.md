# CW Email Request, Keycard tab: Steps Selection's Step 22 now opens the real Preview Email (2026-08-30, follow-up)

> Feature doc: [keycard-activate-guide.md](../keycard-activate-guide.md)
> Follow-up to: [2026-08-30-keycard-guide-toolbar-and-steps-selection.md](2026-08-30-keycard-guide-toolbar-and-steps-selection.md)

## The bug

Steps Selection jumping to Step 22 (or 22-1/22-2/22-3/23) called
`eraGuideStart(owner, 0, false, key)` directly, the same as every other
step. That's correct for steps 1–21, but 22 onward point at fields **inside
`#era_previewModal`** (`era_previewToList`, `era_previewSubject`,
`era_previewKformSection`/`era_previewBody`, `era_previewSendBtn`) — a modal
that only exists once staff has actually built a preview. Reached the
ordinary way (Back/Next from step 21), the modal is already open by
construction: step 21's own `gate()` refuses to unlock `Next` until it is.
Steps Selection skipped that build-up entirely, so the guide rendered "Step
22" pointing at a modal that was never opened — the spotlight had nothing
real to highlight and the Preview Email itself never loaded.

## The fix

`jumpToStepKey()` now special-cases the five Preview-modal-scoped keys
(`previewTo`, `previewSubject`, `previewAttachments`, `previewBody`,
`finalActions`). For any other key, nothing changed. For one of these five,
if `#era_previewModal` isn't already open (`style.display !== "flex"`),
`openRealPreviewThenStart()` runs the form's **own** Preview flow instead of
`eraGuideStart` — a real `.click()` on `#era_submitBtn`, which fires the
exact same handler the button always has: autosave
(`eraSaveKeycardSubmission`), Keycard Form PDF build
(`eraMaybeBuildKeycardFormPdf`), validation (`Le()`), the real
`buildCwEmailRequestPreview` callable, then `dt()` populating and opening
the modal. No second implementation, no mock data — the guide only ever
clicks the real button and waits.

Because that whole chain is a real (async) network round trip, the fix
polls (100ms, up to 10s) for the modal actually becoming visible before
calling `eraGuideStart` with the requested key — assuming a single
`setTimeout(0)` would be enough would just recreate the original bug one
tick later. If the modal never opens (validation failed — e.g. no
signature/Photo ID attachments yet, per `Le()`'s own Keycard rule) the guide
falls back to `eraGuideStart(owner, 0, false, "savePreview")`, landing on
step 21 instead of hanging on a broken step 22 — exactly the state step 21's
own `Exit` branch already exists to explain. If the modal is *already* open
(e.g. Next was used to walk 21 → 22 → 22-1 and Steps Selection is used to
jump straight to 23 from there), nothing is re-triggered — the existing
Preview stays exactly as it is and the guide just moves to the requested
step.

## What did not change

- Steps 1–21 are untouched — this only affects the five Preview-scoped
  keys.
- `#era_submitBtn`'s click handler, `Le()`, `buildCwEmailRequestPreview`,
  and `dt()` are all the app's own, completely unmodified. The guide adds no
  new preview-building logic of its own.
- Back/Next inside the guide (the ordinary way of reaching step 22+) always
  worked correctly and is unaffected — this bug only ever affected jumping
  in from Steps Selection.

## Testing

`node --check` on the extracted guide `<script>` block, plus a driven pass
against the real `public/index.html` on a local static server: filled
Location/requester email, picked Activate, attached a real file to the
Keycard attachments input (the same `change` handler the file picker uses),
stubbed only `window.buildCwEmailRequestPreview` (the Firebase callable —
this repo has no local-auth path, see [pitfalls](../pitfalls.md); nothing
else was stubbed) to resolve with a fake-but-well-formed payload. Confirmed:

- Steps Selection → Step 22 with the modal not yet open: `#era_previewModal`
  became `display:flex` and the guide landed on "Step 22 — Preview Email —
  Recipients" pointing at the real To/Cc/Subject/attachments/body/Send UI
  (screenshotted).
- `Next` from there walked 22 → 22-1 → 22-2 normally (unaffected — ordinary
  Back/Next path).
- Steps Selection → Step 23 with the modal *already* open: jumped
  immediately, no re-trigger, modal stayed open and populated.
- Broke validation (cleared Location) and jumped to Step 22 again: the
  real `era_err` banner showed the real validation message, and after ~10s
  with the modal never opening the guide landed on "Step 21 — Save /
  Preview" instead of hanging.
- Restored Location, then jumped through every one of steps 1–21 via Steps
  Selection in order: all landed on the correct step immediately (no
  detour, since only 22+ are Preview-scoped).

**Still not covered:** a real `buildCwEmailRequestPreview` round trip against
live Firebase (no local-auth path in this repo) and a real signature/Photo
ID attachment satisfying `Le()` without the file-input stub used here.
