# 2026-08-30 — CW Email Request > Keycard > Activate > Step-by-Step Guide: Step 14 skipped for a same-tenant-email card

Part of the [project log](../../CHAT_LOG.md). Current behavior lives in
[keycard-activate-guide.md](../keycard-activate-guide.md) and the
[implemented spec](../Guide_Activate_2026-08-29.md).
Direct follow-up to the previous day's
[Edit-restore / same-email reuse fix](2026-08-29-keycard-edit-signature-restore-and-reuse.md),
which did this for **Submission > Edit** only.

## Asked for

> Step 14 — E-Signature.
> If Card 2 uses the same email as Card 1: skip Step 14, use the existing
> same-signature logic, and Card 1's customer signature must also be
> attached/stamped to Card 2's Signature field on the Keycard form.
> If Card 2 uses a different email, keep Step 14 unchanged and require the
> separate e-signature flow. Compare the actual Card 1 and Card 2 email values.
> Preserve all other guide behavior.

## What changed

All in `public/index.html` (no build step; `src/app.js` and `functions/` are
untouched).

### 1. Step 14 is left out of the walk for a covered card

`reusedFrom(ctx)` — the guide's existing same-tenant-email predicate, already
driving step 15's gate, step 16's hold and step 21's `Exit` — was split so it
can be asked about **any** card rather than only the stop being shown
(`reusedFromEntry(entryEl)`; `reusedFrom(c)` is now a one-line view of it).
`buildFlow()` then skips `STEPS[ESIGN_POS]` for every card it returns a donor
for, so `Next` walks **13 → 15** and the progress line never shows `Step 14`
for that card. Nothing else about the card block changes.

The predicate is unchanged and reads the **real** `.era-k-email` inputs live:
same tenant email as an earlier card **in this tour**, and that card's own
`eraSignIdIsSatisfied()` (the app's `hasInk && photoIdFilename`) already true.
A different email returns `null` and step 14 stays exactly as it was.

### 2. The skip re-evaluates live

`FLOW` was previously rebuilt only when the set of cards or of extra location
rows changed, but this skip turns on a value staff types at **step 10**. A cheap
skip-set key (`esignSkipKey()`) is now compared on the same deferred
`input`/`change`/`click` sweep that re-evaluates every gate, and `rebuildFlow()`
runs when it moves.

**A rebuild never moves the visible step.** If reuse becomes true while step 14
is *on screen* — the donor's Photo ID landing is enough — the stop is
deliberately kept (`flowCurrentStop`, set by `rebuildFlow()` only), because
"the visible step never changes without a `Back`/`Next` click" is the invariant
this whole feature is built on. To stop that kept stop becoming a dead end,
step 14's `gate()` now also passes when `reusedFrom()` holds, with a note
reading *"Same tenant email as Card N — this step is no longer needed for this
card. Click Next."* and a matching popup header. The step is dropped for real
as soon as the guide walks off it (the key carries which card's step 14 is being
stood on, so leaving it moves the key).

### 3. Card 1's signature is actually put on Card 2

Skipping step 14 without this would have re-created the exact bug fixed the day
before, one layer up: `buildKeycardFormPdfInputsFromHistory()`
(`functions/keycardHistory.js`) maps `signIdSignatures[n] → card{n}_signature`,
so a card with nothing in its own slot goes out with a **blank** Signature field
on the Keycard Form PDF while the guide says it is covered.

`stampReuseSignature()` hands the donor's ink to the reusing card through the
card's **own** `eraSignIdRestore({ signatureDataUrl, persist: true })` — the
same entry point Submission > Edit uses — which paints it on that card's canvas,
attaches it as its own `Signature_CardN.png`, and persists it into that card's
own `signIdSignatures` slot. Deliberately narrow, since this is the one place
the guide writes something staff didn't click for:

- only for a card the tour has already **reached step 15** on (so a half-typed
  tenant email that momentarily matches can never stamp anything);
- only onto a card with **no ink of its own** — an existing signature, however
  it got there, is never overwritten;
- only through the card's own restore path, so attach/persist/status handling is
  the app's, not a second implementation of it;
- at most once per card (the in-flight data URL is remembered, because
  `paintSignature()` decodes asynchronously and the sweep would otherwise fire
  again before `hasInk` flips).

The Photo ID is **not** copied, same as on the Edit path: one physical ID
document already covers both cards, and `photoIds` is owned by
`submitSignatureRequest`/`uploadKeycardPhotoId`.

A live session has no saved copy of the ink to reuse — the only copy is the
donor card's canvas, private to `eraWireKeycardSignId()`'s closure — so two
readers were exposed on the entry alongside the existing
`eraSignIdIsSatisfied`/`eraSignIdGetPhotoFilename`:
`eraSignIdHasInk()` and `eraSignIdGetSignatureDataUrl()`. The latter exports
composited onto opaque white (a transparent PNG can lose its ink in downstream
PDF/email renderers — the same trap already documented for the retired Keycard
Form modal) and falls back to the parked, decoded-but-not-yet-drawable image so
a donor whose block has no layout box can still donate.

### 4. Bug found on the way: restored signatures were drawn dpr× too large

`drawSignatureImage()` blits in **device** pixels (`canvas.width/height`) but
the 2D context carries `ensureCanvasSized()`'s `ctx.scale(dpr, dpr)`, which
exists so hand-drawn strokes can use CSS-pixel coordinates from `pos()`.
Measured on a `devicePixelRatio` 2.5 display: ink spanning x 45–439 / y 83–213
of a 1425×350 buffer came back at x 358–1059 / y 208–349 — blown up and running
off the bottom edge. Fixed by resetting the transform for the blit itself
(`ctx.save()` / `setTransform(1,0,0,1,0,0)` / `restore()`).

This is **not** new to this change: it affects every path that paints ink from a
PNG rather than from strokes — Submission > Edit's restore and a completed
remote e-signature included — and is a no-op at `devicePixelRatio` 1, which is
why it survived the previous day's restore fix. See
[pitfalls](../pitfalls.md#a-canvas-blit-in-device-pixels-through-a-dpr-scaled-context-is-drawn-dpr-too-large-found-2026-08-30).

## Testing

No test runner exists in this repo. Verified by:

1. `node --check` on all four inline `<script>` blocks of `public/index.html`,
   extracted by line range.
2. The **real** `public/index.html` served locally and driven from the browser,
   with `window.devicePixelRatio` forced to 2.5 so the canvas genuinely carried
   a scaled context, real mouse events drawing Card 1's signature, the Photo ID
   stood in for by stubbing that card's own `eraSignIdIsSatisfied()`, and
   `saveKeycardSignIdSignature` replaced with a spy. Confirmed:

   - **Card 1** (no earlier card): steps 7 → 13 → **14 (locked, "Required for
     this workflow.")** → 15 → 16 — unchanged.
   - **Card 2, same tenant email** typed at step 10: nothing stamped at step 10
     (`eraSignIdHasInk()` still false); `Next` from 13 landed on **15**, live,
     with the reuse body/note; Card 2's canvas then carried Card 1's ink with an
     ink bounding box of `[46, 83, 440, 213]` against Card 1's
     `[46, 83, 441, 213]` on an identically sized 1425×350 buffer;
     `Signature_Card2.png` appeared in Attachments exactly once; the spy showed
     one `saveKeycardSignIdSignature({cardNumber: "2"})` carrying the identical
     23,058-character data URL as card 1; the E-Signature checkbox was never
     touched. `Back` from 15 went to **13**.
   - **Card 3, different tenant email**: 13 → **14, locked**, popup note
     "Required for this workflow.", nothing stamped, no extra persist.
   - **Reuse turning on while standing on step 14** (Card 2's email edited from
     a different address to Card 1's): the stop stayed on screen, unlocked, and
     said *"this step is no longer needed for this card"*; `Next` → 15 with the
     stamp applied; `Back` from there → 13, the step now gone from the walk.
   - **Restart** with reuse already true replayed the whole walk from step 1:
     Card 1 `…13, 14, 15, 16`, Card 2 `…13, 15, 16` (no 14), Card 3 `…13, 14`,
     with no second persist for any card.
   - Exported PNG fully opaque (0 transparent pixels) with the ink intact.
3. No guide-related console output at any point — only the expected
   unauthenticated Firebase/Functions errors of a signed-out local run.

**Not covered:** a signed-in, end-to-end run against live Firebase. This repo
has no local-auth path, so `eraSignIdIsSatisfied()` was stubbed rather than
driven by a real Photo ID upload, and the resulting `card2_signature` field was
verified through `signIdSignatures["2"]` being written with Card 1's data URL
rather than by rendering the merged PDF. Click through one real two-card
Activate request before relying on it.

## Known limitation

If staff changes a card's tenant email **after** the stamp has been applied, the
donated signature is not withdrawn — the guide never clears a field. The normal
path self-corrects (step 14 comes back into the walk, and a completed remote
e-signature paints over the donated ink), but a card whose email is edited late
and which is never re-signed keeps the earlier tenant's signature. Submission >
Edit's `eraKeycardReuseDonors()` has the same exposure and predates this change.
