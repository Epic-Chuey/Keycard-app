# Keycard "Activate" step-by-step guide

> **2026-08-31: De-activate now has its own real (10-step) guide,
> sharing this same chooser/resume/Back-Next engine.** Everything below
> still describes Activate's real, 23-step content in full — none of it was
> touched. De-activate's guide (Location → Your Email → SERVES ×2 → a
> per-card block that repeats and can hand off mid-tour to Activate's own
> real per-card steps → Preview, terminal for now) lives in its own `D_*`
> step definitions and `buildDeactivateFlow()`, with full detail in
> [the log entry](log/2026-08-31-keycard-deactivate-guide-stub.md). Steps
> Selection (the 23-step jump picker) stays Activate-only. Any statement
> below that says "Activate" or refers to the 23 steps is about that table
> specifically, not De-activate's.
>
> **2026-09-05, later same day (two passes): the automatic chooser is gone;
> the 3 toolbar controls hide on unconfigured pages.** First pass made
> picking "Manually (I am a professional)"/the Enable box's "No" retrigger-
> safe — closing the chooser no longer silently prevented it from ever
> coming back on that same entry. Second pass, per Huy's follow-up request,
> **removed the automatic chooser entirely**: an entry's Action select
> changing to Activate/De-activate/Replacement (from either the per-entry
> select or the Keycard tab dropdown's quick-picks) no longer pops any
> prompt at all — it just switches the entry's Action like any other
> Keycard action. **"Enable Step-by-Step Guide"** (the global toolbar) is
> now the only prompt-based entry point for all 4 registered guides, via its
> own small Yes/No box. The old two-button chooser (`eraGuideChooser`) — DOM,
> click handler, and all — was removed outright, not just its trigger. See
> the Trigger section below for what the change listener still does (keeping
> the per-entry Resume button in sync). Separately,
> **Enable/Resume/Steps Selection** (the toolbar under `#era_tabs`) now hide
> together on a page the guide was never manually set up for (Troubleshoot,
> Transfer today) and show together on any page that has one (Activate/
> De-activate/Replacement/Request Blank Keycard) — see "Global toolbar"
> below.

> **2026-09-05, later still the same day: Troubleshoot now has its own real
> (14-step) guide**, sharing this same chooser-free/resume/Back-Next engine.
> Its own request-level head (Location/+Add Location/Your Email/SERVES x2 —
> SERVES is the same shared, once-per-request `#era_k_servesCard`/`#era_k_body`
> controls De-activate's own head already targets, confirmed against the real
> form rather than assumed) plus a per-card block (Company Name through Add
> Another Keycard, including the Descriptive Box — a field only Troubleshoot
> shows) and a full Preview/Email-body review ending in the same
> Send-confirmation guard Activate's/Replacement's own final step uses. Lives
> in its own `T_*` step definitions and `buildTroubleshootFlow()`, full detail
> in [Guide_Troubleshoot_2026-09-05.md](Guide_Troubleshoot_2026-09-05.md).
> Unlike De-activate/Replacement, a card added mid-tour always walks this
> guide's own per-card block — no hand-off to Activate/De-activate, since
> Huy's own spec never asked for one. This is also what gives Troubleshoot a
> `GUIDE_MODE_INFO` entry, so the 3 toolbar controls below now show on it too
> — see "Global toolbar" below for what that changes.

> **2026-09-05: Replacement now has its own real (16-step) guide**, sharing
> this same chooser/resume/Back-Next engine. Originally scoped to
> Replacement's own fields only and stopping at Preview; rebuilt later the
> same day into Huy's own exact 16-step spec — its own request-level head
> (Location/+Add Location/Your Email), a per-card block (New Location
> through New Company/Tenant Card Replacement), and a full Preview/Email
> review ending in the same Send-confirmation guard Activate's own final
> step uses. Lives in its own `R_*` step definitions and
> `buildReplacementFlow()`, full detail in
> [Guide_Replacement_2026-09-05.md](Guide_Replacement_2026-09-05.md). A card
> added mid-tour can be set to Activate, De-activate, or Replacement, same
> three-way handoff De-activate's own guide already supports — and one added
> from Replacement's own "New Company/Tenant Card Replacement" step now
> defaults to Replacement rather than Activate.

> Part of the [keycard-app documentation map](../CLAUDE.md#documentation-map). Read [CW Email Request tab](email-request-attachments-embed-tab.md) first — this is an instruction-layer overlay on top of that tab's existing Keycard mode, not a new field/flow of its own.
>
> **The full, current step-by-step specification — all 23 steps, every gate, and the conditional workflows — lives in [Guide_Activate_2026-08-29.md](Guide_Activate_2026-08-29.md).** This page is the short orientation: what the feature is, where it lives, and what it must never do.

Added 2026-08-28 as an auto-advancing walkthrough; reworked 2026-08-29 into a **manually-driven interactive popup**. It highlights each Keycard control in order (dimming scrim + spotlight ring + animated arrow + a tooltip that doubles as the popup), and the person clicks `Back` / `Next` to move. It never writes into the form on its own and never bypasses validation — it reads the real controls' own state to decide whether `Next` is *enabled*.

## Where it lives

One self-contained `<style>`/`<script>` block appended at the very end of `public/index.html` (before `</body>`), same pattern as the Keycard Form modal's own separate script block. `public/index.html` has no build step — edit it directly. Nothing under `src/`, `functions/`, or the Firestore rules is involved.

## The Keycard tab is gated first

Nothing Keycard-specific — this guide's trigger included — is even on screen until an action is picked from the **Keycard tab's own dropdown** (`#era_k_tabDropdownMenu`); switching to any other tab hides it again and coming back needs a fresh pick. That is a separate, self-contained `<style>`/`<script>` block appended *after* this one at the end of `public/index.html` (one `body.era-k-gated` class, display only — no field is cleared and no value reset). It parks a running tour when it closes the form, because the tour's targets have just left the screen. See [the 2026-08-29 log entry](log/2026-08-29-keycard-gate-step21-exit-and-attachment-fix.md).

## Trigger (2026-09-05: no longer automatic)

**The Only prompt-based entry point is now "Enable Step-by-Step Guide"** (the
global toolbar under `#era_tabs` — see [Global toolbar](#global-toolbar--steps-selection-2026-08-30)
below). An entry's Action `<select class="era-k-action-select">` changing to
`"activate"`, `"deactivate"` or `"replacement"` — whether from the per-entry
select itself or the Keycard tab dropdown's quick-picks (`data-k-action=
"activate"|"deactivate"|"replacement"`) — no longer pops anything; it just
switches the entry's Action, same as picking Troubleshoot/Transfer/Request
Blank Keycard always has.

One delegated, capturing `change` listener on `document` still exists on
`.era-k-action-select`, but only to call `refreshResumeBtn()` (keeps the
per-entry `.era-k-resume-guide-btn` in sync with the live Action) — it no
longer shows any popup.

The old two-button chooser ("With Step by Step Instruction" / "Manually (I
am a professional)", `#eraGuideChooser`) — DOM, click handler, and the
`chooserEntryEl`/`chooserMode`/`chooserTitleEl` variables — was removed
outright along with the trigger. `#eraGuideChooser`'s CSS rule is still
shared with `#eraGuideConfirm`/`#eraGuideEnableConfirm`'s own rules
(harmless — no element with that id exists anymore, so it matches nothing).

Restoring a saved submission still can't reach any of this either way —
`eraFillKeycardEntry()` sets the Action select's `.value` directly, with no
`change` dispatched — so Submission > Edit has never shown a guide prompt.

## Resume button

A `.era-k-resume-guide-btn` sits inside each Keycard entry's `.era-k-action-wrap`, right under the Action select, and brings a dismissed guide back **at the step it was left on**.

- **When it shows:** only while that entry is in guide mode *and* its Action is still `activate`. Ending that guide (Exit, ✕, or Enable's own "No"), or switching the entry to another action, hides it again. It's plain hidden markup (`era-field-hidden`) until then.
- **State** lives in a `WeakMap` keyed by the real `.era-entry-block` (`{mode, step, completed, answers, baseEntries, cards}`) — it dies with the entry, needs no cleanup, and is per-entry, so two entries can each hold their own resume point. Tour-level fields (`mode`/`step`/`completed`/`baseEntries`/`cards`) live on the entry the tour *started* on; `answers` is read off whichever card is currently being walked, so each card keeps its own Fee and signature-workflow picks. `answers` holds only guide-local choices; no form data is ever mirrored there.
- **Where it resumes:** the exact saved step. It only ever walks **back** to the nearest earlier step whose target is actually on screen — the classic case being the Preview modal having been closed. It does **not** skip forward over steps completed by hand: silently jumping ahead is a form of auto-advance, which this feature is not allowed to do.
- Clicking it while the guide is already visible on that same entry is a no-op; clicking a *different* entry's Resume parks the running tour and switches.

## Global toolbar + Steps Selection (2026-08-30)

A second "Resume Step-by-Step Guide" button, plus a new **"Steps Selection"**
button (and, since 2026-09-02, "Enable Step-by-Step Guide"), sit directly
under the main tab bar (`#era_tabs`) — in addition to, not instead of, the
per-entry button above. `refreshGlobalGuideToolbar()` is the one place that
toggles all three, called from inside `refreshResumeBtn()` (so every Action
select change stays in sync for free) and once at page load. Clicking Resume
runs the exact same `resumeGuideOn()` body the per-entry click listener
always ran, resolved against whichever entry currently carries the running
tour's mode (or, with no tour running, `currentGuideMode()`'s read of the
first Keycard entry's own Action select).

**Hidden on unconfigured pages (2026-09-05):** all three controls are hidden
together (`era-field-hidden`) whenever `currentGuideMode()` returns `null` —
today that's Transfer, the one remaining Keycard action with no
`GUIDE_MODE_INFO` entry and therefore no guide to enable/resume/pick steps
for (Troubleshoot got its own `GUIDE_MODE_INFO` entry, later the same day, as
part of its own real 14-step guide — see
[Guide_Troubleshoot_2026-09-05.md](Guide_Troubleshoot_2026-09-05.md)). They
show together on every other Keycard page (Activate, De-activate, Replacement,
Request Blank Keycard, Troubleshoot), regardless of whether a tour has
actually been started there yet — Enable has to stay clickable before any
tour exists, since it's the only way in. A future 6th guide only needs a
`GUIDE_MODE_INFO` entry (+ a `build<Mode>Flow()`) to make its page "configured"
and surface these controls; nothing about the 3 controls themselves changes.

**Steps Selection** opens a picker listing all 23 top-level steps (built off
`STEPS`, filtered to labels that are a bare integer — the `2-1`/`16-1`/
`22-1`/`22-2`/`22-3` sub-stops aren't separately selectable) and jumps
straight to whichever one is picked via `eraGuideStart`'s existing
`startKey` param — the same no-Step-1-flash trick `startAtSavePreview()`
already relies on. It never clears or rewrites a field; the form is exactly
as restored. Meant chiefly for **Submission > Edit**: once the saved record
is back on the real form, both buttons are available and Steps Selection
can jump to any of the 23 steps rather than only the one place `Exit`/
auto-resume already goes (step 21).

**2026-09-05 refactor, per Huy's request: all 3 controls are now per-mode.**
Previously "Enable Step-by-Step Guide" was wired solely to Request Blank
Keycard, and the global toolbar's visibility/Resume-label check treated
"some entry in guide mode" as one flat, mode-agnostic fact — so switching a
single entry's Action select from, say, Activate to Replacement silently
reused (and could clobber) the very same saved `{step, answers, ...}` slot.
Guide state is now keyed **per (entry, mode)** — `guideState` maps an entry to
`{current, byMode: {activate, deactivate, replacement, requestcard}}`, and
`guideStateFor(entryEl, mode)`/`guideStateIfAny(entryEl, mode)` are the only
ways in or out of it. `currentGuideMode()` is the single source of truth for
"which page/mode do the 3 controls belong to right now" — the running tour's
own mode (`ctx.mode`, set once in `eraGuideStart` and never re-derived from a
card's own Action select mid-tour, since Request Blank Keycard's step 6 and a
mixed-action De-activate/Replacement card can each show a select value that
isn't the tour's own mode) if one is active, otherwise whatever the first
Keycard entry's Action select currently shows. `GUIDE_MODE_INFO` is the small
per-mode registry (title + which step list Steps Selection shows) a future
5th/6th guide (Troubleshoot/Transfer today have none) would extend into —
adding one means a new entry in that table plus a `build<Mode>Flow()`, never
touching the 3 controls themselves. **Enable** now starts whichever mode is
currently selected, for any of the 4 registered modes — Activate/De-activate/
Replacement keep their existing entry point too (the chooser popup shown when
their Action value is first picked); Enable is just a second, explicit way in
that never touches another mode's saved progress on the same entry. **Steps
Selection stays exactly as before** — Activate's own 23-step list for
Activate/De-activate/Replacement, Request Blank Keycard's own 10-step list
only for that mode — this refactor only generalized *which* mode the picker
and the jump-to-step target belong to, not that intentional list-sharing.

**Steps 22 and up target fields inside the real `#era_previewModal`**
(Preview Email), which normally only exists once staff has walked into it
the ordinary way (step 21's own gate refuses `Next` until the modal is
open). Picking one of those from Steps Selection (`previewTo`/
`previewSubject`/`previewAttachments`/`previewBody`/`finalActions`) runs the
form's **own** Preview flow first — a real `.click()` on `#era_submitBtn`,
the exact chain the Preview button always runs (autosave → Keycard Form PDF
build → validation → `buildCwEmailRequestPreview` → the modal opening) —
and polls for the modal actually becoming visible before landing the guide
on the requested step. Never a second/mock preview. If validation fails (no
attachments yet, missing location, etc.) the real error shows exactly as it
always does, and the guide falls back to landing on step 21 instead of
sitting on a modal that never opened. Already-open modal → no re-trigger,
just jump. See [the log entry](log/2026-08-30-keycard-guide-toolbar-and-steps-selection.md)
and its [Step 22 fix follow-up](log/2026-08-30-keycard-guide-steps-selection-step22-preview-fix.md).

## More than one keycard

Clicking the form's own **+ Add another keycard** at step 16 makes the guide repeat **only the card-specific steps** (7 → 16) for the new card. Steps 1–6 and 17–23 are request-level and never repeat — the 23-step workflow is not restarted and nothing already entered is touched.

- The tour walks a **list** of cards. `stepIndex` indexes a `FLOW` array — request head once, the card block once per card, request tail once — rebuilt whenever a card is added or removed. Rebuilding never re-renders the stop staff is standing on.
- Cards are **only ever created by staff** clicking the real button. Adding one does not move the guide; it only updates the current step's note. `Next` is still the sole way forward.
- Each added card opens on stop **`16-1` "Next keycard"**, which highlights the guide's **existing** `Back` button (no new control) before `Next` starts that card's Tenant Name step.
- A **"Card N" badge** in the tooltip header names the active card, read off the form's own `.era-k-entry-num`. Hidden while the tour is walking a single card.
- **Same tenant email as an earlier card in the tour** (and that card's signature + Photo ID already in) → **step 14 (E-Signature) is skipped entirely** — `Next` walks `13 → 15` — step 15 stays unlocked and says which card it reuses, and that earlier card's customer signature is **stamped onto this card for real** (its own canvas, its own `Signature_CardN.png`, its own `signIdSignatures` slot, so the Keycard Form PDF's `cardN_signature` is filled rather than blank). **Different email** → step 14 is untouched and that card collects its own, exactly like card 1. Detail, including the "never yank the step you're standing on" rule and the one known limitation, in [the spec](Guide_Activate_2026-08-29.md#step-14--e-signature-skipped-for-a-same-tenant-email-card-2026-08-30).
- Removing a card mid-tour drops it from the flow and falls **back** to the nearest surviving earlier stop. Removing the entry the tour started on ends the tour.

## Step 21 has an `Exit`, not just a `Next`

While a walked Activate card still has no tenant signature + Photo ID, step 21 shows **`Exit`** in place of `Next` and hides the form's own **Preview** button — there is genuinely nothing to preview yet. `Exit` runs the form's own Save and parks the tour; a `localStorage` marker keyed by the request id brings it back **on step 21** the next time that submission is opened through **Submission > Edit**, where the live signature/Photo ID state decides whether `Exit` or `Next` is shown. Full detail in the [current spec](Guide_Activate_2026-08-29.md#step-21--save--preview-and-the-exit-branch).

## The one rule that matters

**Nothing advances the guide except the `Next` button** — a click on it, or the `Enter` key, which since 2026-08-29 routes through the very same `activateNext()` and therefore the very same gate. Not filling a field, not ticking a checkbox, not an e-signature or Photo ID arriving, not Save, not the Preview modal populating, and not step 21's `Exit` (which saves and parks, and never moves a step). Required steps only decide whether `Next` is *enabled*, via a `gate()` that reads the real control's own state. If you touch this file, keep it that way — `goNext()` must stay reachable from exactly one place (`activateNext()`), and any new way of triggering it must go through that one function rather than around it.

The corollaries worth knowing before editing:

- **The overlay never intercepts clicks.** Scrim, spotlight and arrow are `pointer-events:none`; only the tooltip itself is interactive.
- **Popups drive the real controls.** A choice inside a step's popup sets the real checkbox/input *and* fires real `input`+`change` events, so the app's own handlers and validation run exactly as if the control had been clicked directly. The guide re-implements no validation and no business logic.
- **Positioning must not depend on `requestAnimationFrame` alone.** `reposition()` runs from the rAF loop *and* from `scroll` / `resize` / a deferred `input`/`change`/`click` handler, because rAF is throttled — sometimes to a dead stop — whenever the page isn't being composited. Gate re-evaluation rides the same event path for the same reason.
- **Send is guarded, not replaced.** While the guide is on its final step, a capturing listener holds the click on `#era_previewSendBtn` until the confirmation is answered; "Yes" re-dispatches the very same click into the app's own unmodified handler. With the guide inactive, Send behaves exactly as it always did.

## What this deliberately does not touch

No existing Keycard function, validation rule, Firestore write, or submit/save path was modified by the guide itself. `functions/` and PDF generation are untouched.

Three deliberate, narrow exceptions:

- **Submission History's `Edit` is wrapped, not replaced** (2026-08-29) — `window.eraEditKeycardHistoryEntry` runs first and unchanged; the wrapper only reopens the tour on step 21 afterwards, and only when that request carries the guide's own resume marker. See [that day's log entry](log/2026-08-29-keycard-gate-step21-exit-and-attachment-fix.md).
- **The email's attachment list is filtered** (2026-08-29, `eraFilterKeycardEmailAttachments()`) so exactly one current Keycard Form goes out. That is a fix to the send path itself, not guide chrome — see the [tab doc](email-request-attachments-embed-tab.md).
- **The same-tenant-email signature is stamped onto the reusing card** (2026-08-30, `stampReuseSignature()`) — the one place the guide writes something staff didn't explicitly click for, and only because skipping step 14 without it would send a Keycard Form with that card's Signature field blank. It goes through the card's own `eraSignIdRestore()`, only for a card the tour has reached step 15 on, only when that card has no ink of its own, and at most once. See [the spec](Guide_Activate_2026-08-29.md#step-14--e-signature-skipped-for-a-same-tenant-email-card-2026-08-30) and [the log entry](log/2026-08-30-keycard-guide-step14-same-email-skip.md).

## Testing

See the [Testing section of the current spec](Guide_Activate_2026-08-29.md#testing) for exactly what was exercised and what wasn't. In short: `node --check` on the extracted script, plus a full driven run of all 26 stops — and a second pass driving Card 1 → 2 → 3, card removal and Resume — against the **real** `public/index.html` served locally. A signed-in, end-to-end run against live Firebase is still not covered — this repo has no local-auth path (see [pitfalls](pitfalls.md)) — so click through one real Activate request before relying on it.
