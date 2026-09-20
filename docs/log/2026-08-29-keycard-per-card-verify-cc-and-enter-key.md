# 2026-08-29: Step 22-2 verifies every card, Preview keeps "Your email" in Cc with Bcc empty, and Enter acts as Next

> Scope: **CW Email Request → Keycard → Preview Email**, plus the Activate Step-by-Step Guide's Step 22-2 View sub-flow and its keyboard handling.
> Current behavior lives in [Guide_Activate_2026-08-29.md](../Guide_Activate_2026-08-29.md) and [email-request-attachments-embed-tab.md](../email-request-attachments-embed-tab.md); this file is the history.
> All three changes are in `public/index.html`. No `src/app.js`, no `functions/`, no rules — so no `npm run build` was needed.

Three requests, in the order they were given.

## 1. Preview Email — Bcc empty, "Your email" in Cc

The requirement: **Bcc: must be empty**, and **"Your email…" belongs in Cc:**.

Inspection first, because the two halves turned out to have different starting points:

- `buildKeycard()` (`functions/emailRequest.js`) already computes `ccRecipients = [keycard@cubework.com, requesterEmail, …managers, …fee]`, and `dt()` has always seeded `bcc: []`. So on a **first** Preview open, both halves were already true.
- What was *not* guaranteed is every **later** open. `eraEditableRecipients` is deliberately only seeded from the server's To/Cc the first time a preview is shown per submission cycle (`eraRecipientsInitialized`), so manual recipient edits survive Cancel → Preview again. That means a hand-moved requester pill (Cc → Bcc, or Cc → To) or a hand-added Bcc address carried straight through every subsequent open of the same request.

New `eraNormalizeKeycardPreviewRecipients()`, called from `dt()` right after the seed/merge and before the lists render, re-asserts the state on **every** Preview open:

- `eraEditableRecipients.bcc = []`.
- the requester address (`Y()`, i.e. `#era_requesterEmailLocal` with `@cubework.com` appended when typed bare) is removed from `to` and pushed into `cc` if it isn't already there — case-insensitively, and only when it actually looks like an address.

**Keycard mode only** (`if (_ !== "keycard") return;`). The Preview modal is shared by all six modes and the request was scoped to Keycard, so Wi-Fi / Printer / Phone / App / Laptop keep the Bcc row behaving exactly as it did. Verified both ways — see the testing note below.

Nothing about the Bcc row itself changed: it is still there, `+ Add` still works, and a Bcc added while Preview is open still reaches `bccRecipientsOverride` on Send. It is the *reopen* that resets it.

## 2. Step 22-2 "View" verifies every card, not just Card 1

The sub-flow shipped earlier the same day walked exactly two stops — `card1_signature`, then `staff_signature` — regardless of how many cards the request carried. On a two-card request that meant Card 2's tenant signature was never actually looked at.

It now walks **one stop per card actually present in the PDF**, in order, then the staff signature, then the wait on Close. `kformView` went from `{sub: 1|2|3}` to `{i, steps: [{kind:"card", n}, …, {kind:"staff"}, {kind:"close"}]}`; `renderKformViewStep()` / `repositionKformView()` / `kformViewNext()` / `kformViewBack()` and the Close listener all read that list instead of the old fixed `sub`. The progress line counts real verifications only (`step 2 of 3` = card 2 of "2 cards + staff"), so a one-card request looks and behaves exactly as the original two-stop flow did.

**Where the card count comes from — the PDF, not the form.** `page.getTextContent()` is matched against the template's own per-card text-field rects (`cardN_name`, `cardN_keycard_number`, `cardN_email`, `cardN_phone`, N = 1…7, ±4 pt). Once `pdf-lib`'s `form.flatten()` has run — which is what both `buildFilledPdf()` (client) and `buildSignedKeycardFormPdf()` (`functions/signatureRequests.js`) do — a filled row's values are ordinary page text sitting inside those boxes, and an unused row draws nothing at all. So "this card is in this PDF" is a direct read of the document being shown.

That needed the field rects for the *text* fields, which the existing bridge filtered out. Rather than parse the template twice, `getTemplateSignatureRects()` was split: a new `getTemplateFieldRects()` does the one cached read of **every** field's widget rect, and `getTemplateSignatureRects()` is now a `/signature$/` view of it — same cached parse, same return value for its existing callers (`stampSignatureOntoExistingPdf()`, the View sub-flow's spotlight math). Both are bridged onto `window` (`eraGetKeycardTemplateFieldRects` is the new one).

Two safety behaviors:

- **No card text readable** (an unexpected template, or a PDF with no text layer): fall back to the card blocks the form itself is showing, so verification still walks every card instead of silently reverting to "Card 1 only" — the exact failure this change exists to remove.
- **`staff_signature`'s rect missing entirely**: verification is skipped outright and `Next` unlocks, unchanged from before — nothing is faked.

**Scrolling.** Card 2 onwards, and the Issued By block at the foot of the page, sit below the fold of a full-page render. `scrollKformStepIntoView()` centres the current stop's field inside the lightbox's own scroller (`#era_previewKformLightboxBody`). It runs once per stop from `renderKformViewStep()` — never from the rAF loop — so it cannot fight a scroll staff is doing by hand.

**Close is still manual, and still the only thing that unlocks `Next`.** On the final stop `Back`/`Next` are hidden, so neither a click nor the new `Enter` key can finish verification for staff; `kformVerified` flips only on a real click of the lightbox's own Close while the sub-flow is standing on that stop. Closing part-way through (its own Close, or Preview's Cancel) drops back to step 22-2 with `Next` **still locked**.

Step 22-2's own body and blocked message now say "every card's Tenant Signature". Nothing else about the 23-step spec changed.

## 3. Enter behaves as Next during the guide

A capturing `document` `keydown` listener, live only while the guide is running. It calls the **same** `activateNext()` the `Next` button's click handler now calls — a small extraction so `goNext()` is still reachable from exactly one place, which is the guide's own hard rule. Same gate, same validation, same "is `Next` enabled and on screen" test, so `Enter` can never advance anywhere a click couldn't: it does nothing on a blocked step, nothing on step 21's `Exit` branch (where `Next` is hidden), and nothing on the View sub-flow's Close stop.

It always `preventDefault()`s so the key cannot reach anything else, and it stands down entirely where `Enter` already means something:

- the **Send confirmation** and the **chooser** — `Enter` must never send an email;
- `textarea`s and the Preview body's `contentEditable` — `Enter` is a newline;
- a **Preview recipient add-input that has an address typed in it**, where `Enter` commits the address. An *empty* one falls through to `Next` on purpose: step 22 auto-focuses that very input, so an unconditional exemption would have left `Enter` dead on that step;
- buttons/links and anything inside the guide's own tooltip, where the browser's own activation already fires the right thing.

It never stops propagation, so the existing "type an email + `Enter` saves it to the shared history" handler still runs alongside it.

## Testing

`node --check` on all four extracted inline `<script>` blocks, then the **real** `public/index.html` served locally and driven from the browser. Merged Keycard Form PDFs (1, 2, 3 and 0 cards) were built in-page with the app's own `window.ensurePdfLib()` against the real `/assets/keycard-form/Cubework_Keycard_Form_v2.1.pdf`, mirroring `buildSignedKeycardFormPdf()`'s fill → `flatten()` → stamp order, and fed in through the real `buildKeycardHistoryFormPdf` callable (stubbed to return those bytes) so `eraMaybeBuildKeycardFormPdf()` attached them exactly as in production. Full result list in the [spec's testing section](../Guide_Activate_2026-08-29.md#per-card-verification--cc--enter-pass-2026-08-29); the short version:

- card detection exact on 1/2/3 cards with no false positives; fallback exercised on a card-less PDF;
- every stop's spotlight within **0.25 px** of an independently computed field box, for `card1..3_signature` and `staff_signature`, with the scroller centring each one;
- Close gating held in both directions (extra Enters inert; part-way close leaves `Next` locked);
- a genuine `isTrusted` `Enter` walked the guide and the sub-flow, and correctly stood down in every exempt case, including the Send confirmation (probe listener confirmed the real Send handler never ran);
- Preview recipients came out To/Cc/Bcc as required, survived a hand-edit → reopen round trip, and Wi-Fi's Bcc was left alone.

**Not covered:** a signed-in, end-to-end run against live Firebase — this repo has no local-auth path. Click through one real Activate request before relying on it.

One incidental finding worth remembering while testing: pdf.js's `page.render()` is driven by `requestAnimationFrame`, so it **never completes** while the browser pane is hidden and not compositing. That is the same rAF-starvation trap [pitfall #16](../pitfalls.md) already records; it affects local driving only, not real use.
