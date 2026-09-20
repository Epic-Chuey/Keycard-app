# 2026-08-29 — CW Email Request > Keycard > Submission > Edit: signature restore fixed, same-email reuse made real

Part of the [project log](../../CHAT_LOG.md). Current behavior lives in
[email-request-attachments-embed-tab.md](../email-request-attachments-embed-tab.md).
Follow-up to the same day's [gate fix](2026-08-29-keycard-gate-step21-exit-and-attachment-fix.md)
and [gate regression fix](2026-08-29-keycard-gate-submission-and-location-fix.md).

## Reported

A two-card request: Card 1 was signed by the customer with their Photo ID
attached; Card 2 was added later for the same tenant, same email. Per the
existing same-email rule, Card 1's signature is supposed to cover both cards.

- **Submission > Edit didn't populate.** After a hard refresh the fields,
  entries and Photo ID all came back — but **the customer signature didn't**.

## Root causes

Reproduced against the real `public/index.html` in a browser, driving the actual
save → reload → Edit flow with the Firestore callables stubbed.

**1. A restored signature was drawn into an unsized canvas, and never repainted.**
`ensureCanvasSized()` (`eraWireKeycardSignId()`) sizes the canvas's pixel buffer
lazily, right before use, precisely because the entries are built before the app
knows which tab it lands on. But Edit's restore is *asynchronous* — the ink is
painted from an `Image.onload` — and if the card has no layout box at that
instant, `ensureCanvasSized()` returned without sizing and **without arming any
retry**. The PNG was then drawn into the browser's default 300×150 buffer
stretched over a ~570px box: an unreadable smear, or nothing. Nothing repainted
it afterwards, so revealing the form later didn't help — while
`updateInkStatus()` still printed "✅ Signature captured", so the UI insisted the
signature was there. `eraSignIdRestore()` also had no `img.onerror`, so a stored
data URL that could not decode restored nothing, silently.

Measured while reproducing: a card restored with no layout box came back
`300×150` with the ink squashed inside it, and stayed that way after the form
became visible.

**2. The same-email reuse was advice, never data.** The Step-by-Step Guide has
always told staff that a card sharing an earlier card's tenant email is covered
by that card's signature and Photo ID (`reusedFrom()` / `signIdCovered()`), and
its step 15 unblocks on that basis. Nothing ever *put* them there.
`signIdSignatures` / `photoIds` are strictly per-card-position, so Card 2 stayed
blank on the form, absent from Attachments, and unsigned in the generated
Keycard Form PDF (`buildKeycardFormPdfInputsFromHistory()` maps
`signIdSignatures[n] → card{n}_signature`). The guide said the request was
complete; the request that went out had Card 2 unsigned.

**3. Oversized signatures were stored corrupt.**
`sanitizeKeycardSignIdSignatureDataUrl()` truncated a too-long PNG data URL to
the size cap instead of rejecting it, persisting an undecodable image that only
failed much later, on Edit.

**4. The reveal gate could be left on with no fallback.** `eraEditKeycardHistoryEntry()`
lifts the Keycard gate through `window.eraSetKeycardGate`, exposed by the very
last `<script>` in the file, behind a `typeof === "function"` guard. If that
block ever fails to run, the guard skips silently and Edit restores everything
correctly into a form still hidden by `display:none` — "Edit doesn't populate",
with nothing on screen to say why.

## What changed

All in `public/index.html` (Keycard embed script) plus one server-side sanitizer.

- **Deferred repaint.** `ensureCanvasSized()` now reports whether it actually
  sized. A decoded signature that can't be drawn yet is parked
  (`pendingSignatureImg`) and registered with a new shared sweep,
  `eraSignIdQueueRepaint()`, which draws it the moment the card gets a real box.
  The sweep only exists while something is parked, gives up after ~15s, and is
  restarted by a click, a window resize or `visibilitychange`.
  Deliberately a `setTimeout` sweep: a `ResizeObserver` armed inside a
  `display:none` subtree does not fire when that subtree is revealed (measured
  in Chrome), and `requestAnimationFrame` can be starved in a non-compositing
  window — both were tried first and both failed the repro.
- **One painter for both restore paths.** New `paintSignature(dataUrl, onDone)`
  is used by `eraSignIdRestore()` (Submission > Edit) and by
  `finishRemoteSignature()` (a tenant's completed e-signature), so both get the
  same deferred-repaint handling. It handles `onerror`: an undecodable stored
  signature now shows "⚠️ Saved signature couldn't be loaded — re-sign this
  card." instead of nothing, doesn't fake a `✅`, doesn't push a bogus
  attachment, and doesn't count as satisfied.
- **Same-email reuse applied for real.** `eraKeycardReuseDonors()` resolves, per
  card position, the earlier card that covers it — same tenant email, that card
  has the artifact, this one doesn't, and this one actually needs a card
  (Activate/Replacement). `eraRestoreKeycardSignIdState()` runs it twice, once
  over `signIdSignatures` and once over `photoIds`, and:
  - gives the reusing card the donor's **signature**, and persists it into that
    card's own `signIdSignatures` slot (guarded by the Edit token) so the saved
    record and the Keycard Form PDF agree with what's on screen;
  - hands it the donor's already-fetched **Photo ID `File`** — the same object,
    so it is one entry in `g.keycard` that both cards point at, not a second
    copy of the same ID on the email.
- **Photo ID is deliberately not re-uploaded** into the reusing card's
  `photoIds` slot. `submitSignatureRequest`/`uploadKeycardPhotoId` own that map,
  and writing a duplicate Storage object there is the exact mistake reverted on
  2026-08-2x. Consequence: a same-email multi-card submission still reports
  `Photo IDs: 1/2` and won't auto-flip to Complete — unchanged from before, and
  staff can still set it by hand with "Mark Complete".
- **Gate lift fallback.** `eraEditKeycardHistoryEntry()` removes the
  `era-k-gated` class directly when `window.eraSetKeycardGate` isn't available,
  so a failure in that trailing script can't leave a correctly-restored form
  invisible.
- **`sanitizeKeycardSignIdSignatureDataUrl()`** (`functions/keycardHistory.js`)
  rejects an oversized data URL instead of truncating it. The caller already
  turns that into an "Invalid or oversized signature image." error, so the
  problem surfaces at save time rather than as a blank canvas weeks later.

## Verified

Reproduced and re-tested against the real page (`public/index.html` served
locally, Firestore/Storage callables stubbed to mirror `functions/index.js`),
by actually drawing a signature, attaching a Photo ID, adding a second card with
the same email, saving, reloading, and clicking Edit:

| Case | Before | After |
|---|---|---|
| Edit after reload, both cards same email | Card 1 signature restored, **Card 2 blank** | Both cards show the signature (identical pixel content), both "✅ Attached" |
| Edit while the form is still hidden, revealed after | Canvas stuck at 300×150, signature never appeared | Parked, then painted at full 1428×350 the moment the form is revealed |
| Edit clicked twice, no reload | — | Identical result, exactly 3 attachments, no duplicate signature/Photo ID, no redundant write |
| Card 2 with a **different** tenant email | Card 2 blank | Card 2 blank (no reuse), no extra attachment, no write — the guide's rule, unchanged |
| Stored signature that can't decode | Silent: no ink, no message | "⚠️ Saved signature couldn't be loaded — re-sign this card.", not counted as signed |
| Draw / Clear / redraw on a live card | — | Unchanged |

Attachments after Edit: `JaneID.png`, `Signature_Card1.png`,
`Signature_Card2.png` — one Photo ID, one signature PNG per card.

## Scope

`public/index.html` (Keycard embed script) and
`functions/keycardHistory.js`. No change to the guide, to the live
draw/E-Signature flow, to Preview/Send, to the Firestore write path's shape, or
to any other mode. `src/app.js` untouched, so `public/app.js` needs no rebuild.

## Not covered

- The reuse is applied on **Submission > Edit restore**, not live while staff is
  filling the form. Adding a second card with the same email in the same session
  still leaves its canvas blank until the submission is saved and reopened.
- The reused card's `photoIds` slot stays empty by design (see above), so the
  automatic Pending→Complete rollup still counts it as missing a Photo ID.
