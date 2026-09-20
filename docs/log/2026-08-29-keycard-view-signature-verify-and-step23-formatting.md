# 2026-08-29: Step 22-2 "View" signature-verification sub-flow, white lightbox background, Step 23 tooltip line breaks

> Scope: **CW Email Request → Keycard → Activate → Step-by-Step Guide**, Step 22-2 (Preview Email — Attachments) and Step 23 (Final Actions).
> Current behavior lives in [Guide_Activate_2026-08-29.md](../Guide_Activate_2026-08-29.md); this file is the history.
> Changes are in `public/index.html` and `src/app.js` (one small bridge — see §2's correction below, `npm run build` regenerates `public/app.js` from it) — no `functions/`, no rules.

## 1. Lightbox background is white, not gray

`#era_previewKformLightboxBody` (the in-modal viewer the Keycard Form attachments' **View** opens) was `#f1f5f9` (a light slate gray). Changed to `#ffffff`. The dark scrim behind the lightbox card (`rgba(15,23,42,0.9)`) is unchanged — that's the modal backdrop, not the content area being complained about.

## 2. Step 22-2 View → 2 internal verification stops → Close required before Next unlocks

Clicking **View** on the **Signed Keycard Form** row (the merged, whole-submission PDF — the one row that carries both the Tenant and Staff signatures) while the guide is actually standing on **Step 22-2** now opens a small 2-stop mini walkthrough, scoped entirely to that lightbox:

1. **View Step 1** — points at Card 1's **Tenant Signature** field. `Next` only.
2. **View Step 2** — points at **Cubework, Authorized Staff**'s **Signature** field. `Back` / `Next`.
3. After Step 2's `Next` — the arrow parks on the lightbox's own **Close** button and waits. Nothing auto-clicks it; only a real click by staff finishes verification.

Only then does main Step 22-2's `Next` unlock (a `gate` was added — previously this step had none, review-only). Clicking **View** on any other row (Photo ID, a raw `Signature_CardN.png`, Issued By Signature), or Views taken outside the guide entirely, or a step other than 22-2, behave exactly as before — untouched.

### First pass got this wrong — corrected same day

The first version of this feature (shipped earlier today) approximated the arrow's position as a fixed fraction of the lightbox's iframe box, on the theory that the native PDF viewer inside `<iframe src="blob:...">` isn't scriptable. Screenshot feedback showed the arrow landing on the wrong section entirely (pointing at "ACKNOWLEDGMENT" instead of Card 1's signature row) — a guess dressed up as precision. Replaced outright with the real thing:

- **Render the PDF ourselves, on a `<canvas>`, via pdf.js** (`window.ensurePdfJs()` / `pdfjsLib`, bridged from `src/app.js`'s existing module-scoped loader the exact same way `window.ensurePdfLib` already is) instead of the plain `<iframe>` — only while this sub-flow is running; a plain View outside the guide is completely unaffected, still the original iframe.
- **Read the REAL field rects off the PDF's own AcroForm** via `window.eraGetKeycardTemplateSignatureRects()` — a one-line bridge onto the Keycard Form modal's own `getTemplateSignatureRects()`, the exact same lookup `buildFilledPdf()` already trusts to stamp signature ink onto this template. Nothing was re-derived; this reuses the existing, already-tested field-rect logic end to end.
- **Map that PDF-space rect to on-screen pixels with pdf.js's own `viewport.convertToViewportRectangle()`** — the spotlight now outlines the exact `card1_signature`/`staff_signature` widget box, not a synthetic dot.
- **If either field's rect can't be found**, verification is skipped outright (`kformVerified` is set, Next unlocks, nothing is faked or left half-broken) rather than falling back to a guess again.

## 3. Reused, not re-approximated

Implementation-wise, this reuses the guide's own `#eraGuideScrim`/`#eraGuideSpotlight`/`#eraGuideArrow`/`#eraGuideTooltip` chrome rather than building a second overlay — `goNext()`/`goBack()`/`reposition()`/`refresh()` each gained a one-line branch at the top (`if (kformView) {...}`) that hands off to the sub-flow's own `kformViewNext()`/`kformViewBack()`/`repositionKformView()`, and the spotlight/tooltip placement math itself was extracted out of `reposition()` into a shared `placeOverlay(rect, scrollEl)` so both paths use the identical positioning logic. The 23-step spec itself (`STEPS`, `FLOW`, labels) is untouched — this is purely internal to the View page, per Huy's request.

## 4. Step 23 tooltip — one action per line

The Final Actions tooltip body listed Edit/Cancel/Save/Send as one run-on sentence. Now each `<b>Action</b> — description` starts on its own line (`<br>` between them, no other change to the copy).
