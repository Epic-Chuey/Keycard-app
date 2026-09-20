# CW Email Request, Keycard tab: global guide toolbar + Steps Selection (2026-08-30)

> Feature doc: [keycard-activate-guide.md](../keycard-activate-guide.md) · Spec: [Guide_Activate_2026-08-29.md](../Guide_Activate_2026-08-29.md)

## What changed

Two buttons, **"Resume Step-by-Step Guide"** and **"Steps Selection"**, now sit
directly under the main tab bar (`#era_tabs`), in *addition* to (not instead
of) each Keycard entry's own per-entry `.era-k-resume-guide-btn`. Same
`guideState` WeakMap, same visibility rule (shown only while some entry
carries guide mode and is still set to Activate) — this is a second,
easier-to-find way to reach the identical state, not a second
implementation. `refreshGlobalGuideToolbar()` is the sole place that toggles
`era-field-hidden` on the new toolbar, called from inside the existing
`refreshResumeBtn()` so every place that already updates the per-entry
button (chooser pick, `eraGuideStart`, `eraGuideEnd`) updates the global one
for free.

**Steps Selection** is new: it opens a picker listing all 23 top-level steps
(built straight off the `STEPS` array, filtered to labels that are a bare
integer — this drops the `2-1`/`16-1`/`22-1`/`22-2`/`22-3` sub-stops, which
aren't independently selectable), and jumps the guide directly to whichever
one is picked via `eraGuideStart`'s existing `startKey` param — the same
mechanism `startAtSavePreview()` already uses to land on step 21 without a
Step-1 flash. Picking a step never clears or restarts anything: the real
form fields are untouched (as always — this guide only ever reads them),
and `eraGuideStart` renders the chosen step directly, with no intermediate
Step 1 render.

Meant chiefly for **Submission > Edit**: once a saved request is restored
onto the real form, both buttons become available and Steps Selection lets
staff jump to any of the 23 steps to review or continue past wherever the
existing step-21 auto-resume happens to land.

## Why

Per Huy's request: the per-entry Resume button was easy to miss (buried
inside whichever Keycard entry the tour started on, past six fields), and
there was no way to jump anywhere except the one place `Exit`/auto-resume
already goes (step 21) or the exact step Resume last parked on. Steps
Selection covers "I want to check step 10 again" without walking `Back`
nine times.

## What did not change

- Every existing per-entry Resume/chooser/Exit/auto-resume-at-21 behavior is
  untouched — `resumeGuideOn(entryEl)` is the exact same body the per-entry
  click listener always ran, now shared by both buttons.
- `goNext()` is still reachable from exactly one place. Steps Selection does
  not call it at all — it goes through `eraGuideStart`, the same entry point
  Resume/Restart/the chooser's "guide" pick and `startAtSavePreview()` always
  used.
- Nothing new is written to any form field. The picker only ever reads
  `STEPS` (titles/labels) and the guide's own `guideState`.

## Testing

`node --check` on the extracted guide `<script>` block, plus a driven pass
against the real `public/index.html` on a local static server (no build
step — this file has none): opened the chooser, started the guide, exited
to reveal the new toolbar, opened Steps Selection, confirmed all 23 items
render as "Step N — Title" in order, jumped to Step 10 (Tenant Email) and to
Step 17 (Staff Name) directly (no Step 1 flash, verified by reading the
tooltip title immediately after the click), confirmed data typed into
Location and Tenant Name beforehand was still present on the form after
both jumps, picked Step 1 explicitly and confirmed it opened Step 1 (not
skipped), and confirmed the global Resume button returns to the exact
parked step. Not covered: a real Submission > Edit round trip against live
Firebase (no local-auth path in this repo — see
[pitfalls](../pitfalls.md)).
