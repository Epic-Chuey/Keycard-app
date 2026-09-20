# 2026-08-29: Keycard reveal-on-selection gate, step 21 "Exit", resume at 21 after Edit, and the duplicate-Keycard-Form send bug

> Scope: **CW Email Request → Keycard**, and its **Activate → Step-by-Step Guide**.
> Current behavior lives in [Guide_Activate_2026-08-29.md](../Guide_Activate_2026-08-29.md) and
> [email-request-attachments-embed-tab.md](../email-request-attachments-embed-tab.md); this file is the history.
> All four changes are in `public/index.html` only — no `src/`, no `functions/`, no rules.

## 1. Keycard content is hidden until an action is picked

Keycard is the tab that opens by default, so its whole form used to be sitting
there before anyone had said which of the six actions they were doing. Now
nothing Keycard-specific shows until an item is picked from the Keycard tab's
own dropdown (`#era_k_tabDropdownMenu`), and switching to any **other** tab —
another CW Email Request mode, or another app tab entirely — puts it away
again, so coming back needs a fresh pick.

- One `body.era-k-gated` class and one rule:
  `body.era-k-gated .era-mode-fields[data-mode="keycard"]:not(#era_previewSaveBtn){display:none !important}`.
  "Keycard content" is the file's own existing definition of it — the same set
  the mode switcher shows and hides — minus `#era_previewSaveBtn`, which
  carries those attributes but lives inside the Preview modal. Shared chrome
  (Location, requester email, the Preview button) belongs to every mode and is
  left alone.
- **Display only.** No field is cleared, no value reset, no id renamed —
  everything typed stays behind the gate and comes straight back on the next
  selection, which is what makes it safe on a form that may be mid-edit.
- Clicking the **Keycard tab itself** only opens its menu and does *not*
  re-hide the form; that would yank it away from someone mid-edit. Only a
  switch to a different `data-mode` re-gates.
- Leaving the CW Email Request app entirely is caught with a `MutationObserver`
  on `#emailRequestAttachmentsEmbedView`'s own display, rather than reaching
  into `src/app.js`'s router.
- Gating while a tour is running parks it (`window.eraGuideEnd(false)`) instead
  of letting the overlay hunt for a vanished target through its grace period.
  The Resume button brings it back at the same step.

Self-contained `<style>`/`<script>` block appended after the guide's own block
at the end of `public/index.html`.

## 2. Step 21 — "Exit" instead of "Next" while the tenant hasn't signed

Step 21 (Save / Preview) used to offer only `Next`, gated on the Preview modal
actually opening — which, on the Save & Leave path, cannot happen: `Le()`
refuses to build a preview for an Activate request with no attachments, and the
signature/Photo ID are what put attachments there. Staff were left on a step
whose only control could never unlock.

Now, when a walked Activate card still has no signature + Photo ID:

- `Next` stands down and **`Exit`** takes its place.
- The form's own **Preview** button (`#era_submitBtn`) is held out of reach with
  a guide-owned class (`.era-guide-preview-hidden`), cleared unconditionally by
  `eraGuideEnd()` — the button's markup, handler and validation are untouched.
- `Exit` runs the form's **own** `#era_k_saveBtn` and then parks the tour on
  step 21. It is not a forward move: `goNext()` is untouched, so the guide still
  advances from exactly one place.

The hold is recomputed on every `refresh()` from the cards' **live**
`eraSignIdIsSatisfied()` (the app's own `hasInk && photoIdFilename`), never from
the guide's remembered step-15 answer — so the moment the signature and Photo ID
land, `Next` comes back and `Exit` goes away **without advancing the step**.
Cards covered by another walked card with the same tenant email count as
satisfied, same as step 16's reuse rule.

## 3. Resuming at step 21 after Submission > Edit

`guideState` is a `WeakMap` keyed by the real `.era-entry-block`, so it dies
with the entry — and Submission > Edit rebuilds every entry, possibly days later
in another session. The one fact that has to outlive that is "this request was
left on step 21 waiting for the tenant", so `Exit` writes it against the
request's own id (`localStorage`, `eraGuideResumeAt:<requestId>`), and
`window.eraEditKeycardHistoryEntry` is wrapped to consume it: the original runs
first, unchanged, then the tour reopens **on step 21** for that request's first
Activate card (all Activate cards are enrolled, so a multi-card request is
checked in full).

Nothing else is stored. The signature/Photo ID state is re-read from the
restored form itself, so §2's live check decides Exit vs Next — both present →
`Next` (still gated on the Preview modal, still needing a manual click); either
missing → `Exit` stays and Preview stays hidden.

Opening the tour at its parked step is what ✕ → Resume already did; it is not an
advance.

## 4. The send bug: 1 Photo ID + 2 Keycard Forms

**Reported:** a sent request carried one Photo ID and **two** Keycard Forms —
one without the staff sign-off, one with both signatures.

**Cause:** two different code paths put a Keycard Form into `g.keycard` under
different filenames, and only one of them was ever considered:

- `finishRemoteSignature()` attaches `Signed_Card<N>.pdf` — the tenant's ink
  baked into the form *as it stood when the e-signature request went out*, so it
  predates the staff "Issued By" sign-off.
- `eraMaybeBuildKeycardFormPdf()` (added 2026-08-21) attaches the merged
  `Cubework_Keycard_Form_v2.1_<date>.pdf` — every card, both signatures, rebuilt
  from the latest saved submission immediately before every Preview and Send.

`ERA_KEYCARD_EMAIL_SKIP_RE` — the send-time filter — was written back when
`Signed_CardN.pdf` *was* the form, and only ever stripped `Signature_CardN.png`
and `IssuedBy_Signature.png`. It was never revisited when the merged form
arrived, so both PDFs shipped.

**Fix**, all inside `eraFilterKeycardEmailAttachments()`:

- The merged `Cubework_Keycard_Form_v2.1_<date>.pdf` wins outright — it is by
  definition the latest/current form, built from the latest saved submission, so
  every `Signed_CardN.pdf` is a stale fragment of it. If several are somehow
  present, the most recently attached wins.
- Only if that build failed or never ran do the per-card `Signed_CardN.pdf`
  files stand in, one per card. They are **never** mixed with the merged form —
  that mix is the bug.
- Any repeated filename collapses to its most recent copy.
- `g.keycard` itself is never modified: the form's own Attachments card, History
  restore and the raw signature PNGs are all unaffected.

The Preview modal's Keycard Form section (`eraRenderPreviewKformSection()`) now
renders from the same filtered list, so the last thing anyone sees before
clicking Send is exactly what Send will attach.

Also fixed alongside it: `eraSignIdRestore()` overwrote `photoIdFilename`
*before* calling `removeFromKeycard()`, so it only ever removed the file it was
about to add. A restore whose Photo ID had a different filename than the one
already attached left **both** in `g.keycard`, and both went out.

## Testing

No test runner exists in this repo. Verified by:

1. `node --check` on every extracted inline `<script>` block of
   `public/index.html` (all pass).
2. A Node harness that pulls the **real** `eraFilterKeycardEmailAttachments()`
   source straight out of `public/index.html` and runs it: the reported
   `Signed_Card1.pdf` + merged-form case, two merged forms from different days,
   the merged-build-failed fallback, a repeated filename, a multi-card request,
   a hand-attached file, and empty/null input — 9/9.
3. The real `public/index.html` served on `http://localhost:5173` and driven
   from the browser (signed out — only the expected Firebase
   `permission-denied` errors, no guide-related output):
   - gate: hidden on load; `Activate` pick → 11/11 Keycard elements shown; Wi-Fi
     tab → hidden again; back on the Keycard tab with no pick → still hidden;
     second pick → shown. App-level hide of `#emailRequestAttachmentsEmbedView`
     → re-gated, still gated on return.
   - step 21 with `eraSignIdIsSatisfied()` false: `Exit` shown, `Next` hidden,
     `#era_submitBtn` hidden, hold message shown.
   - flipping the predicate true: `Next` back, `Exit` gone, Preview restored,
     **still on step 21** — then `Next` (with the modal open) → step 22.
   - `Exit`: `#era_k_saveBtn` clicked exactly once, marker written, tooltip and
     scrim gone, Preview button restored, Resume button showing.
   - `eraEditKeycardHistoryEntry(requestId)` with the marker set: original ran
     first, marker consumed, tour reopened on **Step 21 of 23** with `Exit` (sig
     missing) → `Next` (sig present).
   - `Exit` and the Preview hold appear on step 21 **only**: checked steps 1, 14,
     15, 16, 20, 21, 22, 23 (23 still reads `Finish`).
   - switching tabs mid-tour: gated, 0 Keycard elements visible, tour parked, no
     Preview button left hidden.

**Not covered:** a signed-in, end-to-end run against live Firebase.
`eraSignIdIsSatisfied()` was stubbed rather than driven by a real
signature/Photo ID round trip, and no real email was sent — click through one
real Activate request, and check the received email's attachment list, before
relying on it.

## 5. Bug found the same day: Submission > Edit never lifted the new gate

Reported symptom: **Submission > Edit** shows a loading state that never
finishes — the saved data loads correctly, but the required entries stay
hidden, so nothing ever appears.

**Root cause:** §1's gate hides every `.era-mode-fields[data-mode="keycard"]`
element — including `#era_k_entries` — until an item is picked from the
Keycard tab's own dropdown, and only that pick (or a re-arm on tab switch)
ever toggles it. `window.eraEditKeycardHistoryEntry` (the Submission "Edit"
entry point, `public/index.html`) restores the outer fields and rebuilds
`#era_k_entries` from the saved record correctly — but never went through the
dropdown, so the gate it added on the same day stayed on. The restored
entries were sitting in the DOM exactly as intended, just under
`display:none !important`.

**Fix:** the gate's own IIFE (§1) now exposes its internal `gate()` toggle as
`window.eraSetKeycardGate`; `window.eraEditKeycardHistoryEntry` calls
`eraSetKeycardGate(false)` as its very first action, before restoring
anything — same effect an explicit dropdown pick has, just triggered from the
Edit path instead. Nothing else about either function changed: Edit still
restores outer fields/entries/sign-id state/Issued-By state and still runs
the "Wait for Signature" auto-check exactly as before; the gate script's own
click-driven un-hide (dropdown pick) and re-hide (tab switch, leaving the app)
are untouched.

**Verified:** `node --check` on the two edited inline `<script>` blocks
(extracted from `public/index.html` at their real `<script>`/`</script>`
boundaries); `http://localhost:5173` (signed-out, only the expected Firebase
`permission-denied` errors) — confirmed `window.eraSetKeycardGate` exists and
toggles `body.era-k-gated` (and a probe `.era-mode-fields[data-mode="keycard"]`
element's visibility) both ways.

**Not covered:** a signed-in run clicking Edit on a real saved submission —
verify the entries render, are editable, Signature/Photo ID state is picked
up, and (if the request was parked on Guide step 21) the tour resumes there,
before trusting this for real submissions.
