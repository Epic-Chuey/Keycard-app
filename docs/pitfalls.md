# Known pitfalls (cost real debugging time — check these first)

> Part of the [documentation map](../CLAUDE.md#documentation-map). Skim before debugging anything auth/export/layout/Outlook-deeplink related.

## Microsoft Graph delegated auth (`functions/graphAuth.js`, `functions/index.js`)

1. Refresh token was issued via device-code (public client) flow. `ConfidentialClientApplication` → opaque `AADSTS9002313` "malformed request" with no hint of the real cause. Always use `PublicClientApplication`.
2. Azure AD app registration needs "Allow public client flows" = Yes, else device-code sign-in fails `invalid_client`.
3. Use `/me/...` endpoints for this delegated token, never `/users/{email}/...` (app-only pattern) — wrong one doesn't error, just silently returns empty results.
4. Outlook folders are often nested — resolve via `getFolderIdByPath`'s `childFolders` walk, not `/me/mailFolders` (root-level only).

## SheetJS (`xlsx.full.min.js`) free build — all Roadmap/Standup exports

No cell styles (bold/fill/font-color/wrap-text silently dropped on write), no real embedded charts. Survives (structural props, not styles): `!cols` (widths), `!rows` (`{hpt:N}` height, stands in for missing wrap-text), `!merges` (section headers). Any styling has to use these plus plain-text tricks (unicode box/bar chars, emoji, default gridlines).

## Excel sheet names can't be a tag/label verbatim

Forbidden chars `\ / ? * [ ] :`, 31-char cap; `book_append_sheet` doesn't validate — silently produces an unopenable/corrupt file. Triggered by `STANDUP_TAGS`'s `"Critical/Urgent"`. Fix pattern: `standupExcelSheetName()` (app.js) strips/replaces chars + truncates before `book_append_sheet`. Apply the same to any free-text label used as a sheet name.

## html2canvas Timeline export

Captures the live `#roadmapTimeline` DOM node as-is — clipped/flush text is a live-layout margin issue, not a canvas bug. Fix: pad the *output* canvas (draw captured canvas onto a larger one with an offset); don't touch the on-screen element's margin.

## `position: sticky` inside `.app-hero` (or any non-static ancestor)

Sticky range is bounded by the nearest positioned ancestor. `#appSwitcher` had to move out of `.app-hero` (now a sibling of `<main>`, like `#roadmapControlsRow`) to stay pinned. Any future sticky element under `.app-hero`: move it out the same way rather than fighting sticky in place.

## Email Request draft persistence lives in `sessionStorage`

Survives a hard refresh (clears HTTP cache, not sessionStorage). Draft key `cwEmailRequestDraft` keeps restoring until the tab closes, `resetAfterSend()` overwrites it, or someone runs `sessionStorage.removeItem(...)`. Don't mistake stale post-deploy UI for a deploy bug — check this first.

## `mailto:` bodies are plain text only

Wi-Fi's `generateWifi()`/`openOutlook()` (email-request.html) fill `&body=` with plain text — no links/bold (only the on-page `#pBody` preview has real HTML). Keycard's workaround (2026-08-05): `generateKeycard()` drops `&body=` entirely; `openOutlookKeycard()` writes the real HTML body to the clipboard via `navigator.clipboard.write([new ClipboardItem({...})])` (real `text/html` + `text/plain` fallback — not `writeText()`, plain-text only), then opens an empty Outlook draft to paste into. Mirror this for any future formatted mailto/deeplink body.

## `outlook.office.com/mail/deeplink/compose`'s `body` param breaks on long bodies (`AADSTS90015`)

This deeplink round-trips through Outlook Web's sign-in redirect, which Azure AD caps by URL length; a URL-encoded body roughly doubles in size, so ~15-20+ tasks was enough to blow the cap — fails with `AADSTS90015` on the MS sign-in page itself (looks like an auth bug, isn't). Fixed in Standup's Report step: `standupEmailOpenBtn`'s deeplink now carries only `to`/`subject`; body goes to the clipboard (`navigator.clipboard.writeText`, `prompt()` fallback) for manual paste. Budget for this limit in any future prefilled-Outlook deeplink.

**(2026-08-15, 6th pass) No longer applies to Standup's button** — rewritten to send via Graph (`sendStandupCaliIssuesEmail`, same `getGraphClientForSend()`), no URL-length ceiling. Still applies to any real deeplink use (e.g. CW Email Request's "Open in Outlook" fallback, `ERA_SUBMIT_MODE === "outlook"`).

## Sticky/fixed doesn't work inside `email-request.html`'s iframe

The host resizes the iframe to full content height (`syncEmailRequestFrameHeight`), so the iframe has no internal scroll for sticky/fixed to react to. Old workaround (Keycard/Wi-Fi `.tabs` row): `position: absolute` + JS recompute (`getHostDockOffset()`+`getIframeTopInHost()`+`positionModeTabs()`) — broke once the form got tall enough (pill overlapped entry fields).

**Fixed 2026-08-04 with a host-side counterpart**, since nothing inside the iframe can make sticky work: `#emailRequestWorkflowNav` (sibling of `#emailRequestView`) uses the same `position: sticky; top: calc(var(--header-h) + var(--app-switcher-h))` as other tabs' nav rows — works because the host page scrolls. Its buttons call `switchMode()` in the iframe via `emailRequestFrameEl.contentWindow` (same-origin); `syncEmailRequestModeNav()` (in `syncEmailRequestFrame()`) reads `contentWindow.currentMode` to keep the host nav in sync. `email-request.html` hides its own in-flow `.tabs` via a `.cw-embedded` class (added in a head `<script>` when `window.self !== window.top`) so a direct, non-embedded visit is unaffected. `getScrollHost()` still backs `positionGateOverlay()`/`resetAfterSend()`, unrelated. Rule: sticky needed inside this iframe → add a host-side counterpart, don't try in place.

## `script.google.com` web apps can't be iframed cross-origin — confirmed 2026-08-09, don't retry

`script.google.com/macros/s/.../exec` sends X-Frame-Options/CSP `frame-ancestors` blocking any iframe regardless of deployment access setting — shows as a blank frame "script.google.com refused to connect" (not a console/CORS error). No client (`sandbox`/`allow`) or server fix without full proxying. Two accepted patterns:

- `window.open(url, "_blank", "noopener,noreferrer")` — "Email Request (Attachments)".
- Port the Apps Script's HTML/CSS/JS directly into this repo (copy-pasted, not iframed/proxied), swap `google.script.run` for cross-origin `fetch()` POST to its `doGet`/`doPost` — "CW Email Request" (see [email-request-attachments-embed-tab.md](email-request-attachments-embed-tab.md) for CORS mechanics: `text/plain` content-type dodges preflight; id/class-prefixing avoids markup collisions).

## `public/app.js` is a generated build artifact, not the source (added 2026-08-10)

`src/app.js` = real hand-edited source. `public/app.js` (served by Firebase Hosting) is produced by `npm run build` (`esbuild --minify --format=esm`, single-file transform, no bundling — the `import ... from "https://www.gstatic.com/firebasejs/..."` lines stay untouched); carries a `// GENERATED FILE` banner as line 1. Hand-edits to `public/app.js` get silently overwritten by the next build; forgetting to build before `firebase deploy --only hosting` deploys stale content — no freshness check anywhere in the deploy path. Always: edit `src/app.js` → `npm run build` → `firebase deploy --only hosting`.

## Canvas-drawn signature stamped into a PDF as a transparent PNG can vanish in a different PDF renderer (found 2026-08-20)

The Keycard Form's draw-to-sign canvas exported `canvas.toDataURL("image/png")` as-is — transparent everywhere except the ink. `pdf-lib`'s `embedPng()` correctly turns that into a real `/SMask` (soft mask) on the image XObject, which Chrome's own PDF viewer renders fine — so checking the just-built PDF locally (right in the browser, before sending) looked correct. But the same file, once opened as an email attachment through a different PDF-rendering engine, showed every plain flattened field (no transparency involved) but silently dropped the soft-masked signature image — a less spec-complete renderer's typical failure mode for SMask, not a corrupt file. Symptom looked exactly like "the PDF-fill code lost the signature," but the bytes were fine; only that engine's rendering of them wasn't. Fix (`createSignaturePad().toPngDataUrl()`, `public/index.html`): composite the ink onto a solid opaque white background on a fresh offscreen canvas before exporting, so the PNG has no alpha channel anywhere and nothing downstream needs to understand SMask/transparency for the ink to show up. **Lesson: "it looks right in the browser's own PDF viewer" doesn't prove a canvas-stamped image will survive every renderer — for anything meant to go out as an email attachment, verify by actually opening the received email, not just the local file.** Apply the same opaque-background export to any future canvas-drawn/stamped image destined for a PDF that leaves this app.

## Render-blocking third-party stylesheet stalled first paint (found 2026-08-10, LCP 44.86s)

`index.html`'s `<head>` used a plain `<link rel="stylesheet">` for Google Fonts (Inter) — render-blocking by spec, so nothing in `<body>` paints until it resolves. On a slow/filtered connection this was the sole render-blocking resource and stalled the whole page. Confirmed via Chrome DevTools Performance panel (not synthetic Lighthouse): 44.86s LCP, `#signInScreen`'s sign-in `<p>` as the LCP element. Fixed with the loadCSS pattern: `<link rel="preload" as="style">` + `<link rel="stylesheet" media="print" onload="this.media='all'">` + `<noscript>` fallback — renders immediately on the fallback font stack, swaps to Inter once loaded. Use this pattern for any future third-party stylesheet in `<head>`.

## A class-name/wildcard followed immediately by `/` inside a `<style>` comment silently breaks everything after it (found 2026-08-22)

`public/index.html` has several small, readable `<style>` blocks (as opposed to the one giant minified stylesheet) with long, prose-style `/* ... */` comments explaining CW Email Request's decorative hover effects (Keycard Action dropdown, Wi-Fi tab dropdown, phoenix background). One such comment wrote `era-icespikes-*/eraWireIceSpikesHover()` — a class-name wildcard immediately followed by `/`, which is the CSS comment-**close** token (`*/`). The comment closed itself ~23 lines early, mid-sentence; everything from there through where the comment was *meant* to end became raw, invalid CSS text sitting in the stylesheet (English prose, quotes, punctuation), followed by a dangling unmatched `*/`. Symptom looked completely unrelated to the cause: the CW Email Request tab showed a huge blank gap in its layout, because the `#era_phoenix_bg` rule a bit further down in that same `<style>` block — which gives the decorative phoenix image `position: fixed` — never reliably applied, so the image rendered in normal document flow instead (a ~520px-wide image sitting mid-page, with the real content pushed below it). No build step catches this (`node --check` only validates `<script>` blocks, not `<style>`) and the browser doesn't error on it either — CSS parsers are silently error-tolerant.

**Never write `word-*/word` or any class-prefix-wildcard immediately followed by `/` inside one of this file's `<style>` comments** — always put a space (`era-icespikes-* / eraWireIceSpikesHover()`) or reword around it. When debugging an unexplained layout/rendering issue that seems unrelated to whatever was just edited, check the enclosing `<style>` block's comment balance first: `grep -c '/\*'` vs `grep -c '\*/'` (or count within the specific block, since the file has multiple `<style>` tags) — a mismatch means a comment closed somewhere it shouldn't have.

## `admin.auth().createCustomToken()` needs an IAM role the default Cloud Functions service account may not have (2026-08-27, email OTP sign-in)

Minting a Firebase custom token (`verifyEmailOtp` in `functions/index.js` — see [otp-email-auth.md](otp-email-auth.md)) calls `iam.serviceAccounts.signBlob` under the hood, which the function's runtime service account needs permission for *on itself* — this is separate from, and not implied by, any of the Firestore/Graph/Secret Manager access the rest of this app already has. If it's missing, `createCustomToken` rejects with something like `Permission 'iam.serviceaccounts.signBlob' denied` / `PERMISSION_DENIED`, not an auth-config error, which can look unrelated to "sign-in is broken." One-time fix in the Google Cloud Console (IAM & Admin → IAM), for whichever service account `functions/index.js` runs as (the Cloud Functions gen2 default is `<PROJECT_ID>@appspot.gserviceaccount.com` unless a non-default runtime service account was configured): grant that same account the **Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`) role **on itself**. Nothing in this repo can grant that from code — it's operator/console setup, same category as the Azure AD app registrations in [SETUP.md](../SETUP.md).

## `el.style.display = ""` restores the *stylesheet's* value, not "visible" (found 2026-08-29)

Showing an element that a rule such as `#eraGuideTooltip .era-guide-exit{display:none;...}` hides by default, by clearing the inline style —

```js
elExit.style.display = show ? "" : "none";   // WRONG: "" re-hides it
```

— does nothing. Removing the inline declaration hands the element back to the
cascade, and the cascade says `display:none`. Inline styles beat stylesheet
rules only while they *exist*; `""` deletes one rather than overriding it.

Caught in the Keycard Activate guide's step 21 `Exit` button (the button was
correctly toggled and still never appeared). **Set both branches explicitly**
(`show ? "inline-block" : "none"`), or don't give the element a `display` in CSS
at all. The same trap applies to any property with a non-default stylesheet
value — `visibility`, `opacity`, `position`.

Cheap tell when reviewing: a `style.X = cond ? "" : something` where a
stylesheet also sets `X` on that selector.

## Two filename schemes for the same Keycard Form attachment (found 2026-08-29)

A Keycard Form reaches `g.keycard` under **two** different names, from two
unrelated code paths — `Signed_Card<N>.pdf` (per card, from the remote
e-signature round trip, tenant ink only) and
`Cubework_Keycard_Form_v2.1_<date>.pdf` (merged, every card, both signatures,
rebuilt before every Preview/Send). Each path dedupes correctly *against its own
name* and neither knows about the other, so code that filters, counts or
replaces "the Keycard Form" by matching one pattern silently lets the other one
through.

That is how a sent request ended up carrying **two** Keycard Forms — one without
the staff sign-off, one with both signatures. Anything touching Keycard Form
attachments must handle both patterns; the current selection rule lives in
`eraFilterKeycardEmailAttachments()` /
`eraCurrentKeycardFormFiles()` in `public/index.html` (see
[email-request-attachments-embed-tab.md](email-request-attachments-embed-tab.md)).

## A canvas sized off a zero-width box loses whatever is drawn into it, silently (found 2026-08-29)

`<canvas>` has two independent sizes: the CSS box it occupies, and the pixel
buffer `canvas.width`/`canvas.height` describe. If the buffer is never sized to
match the box, everything drawn lands in the browser's default 300×150 buffer
and is then stretched over the real box — a signature comes back as an
unreadable smear, or as nothing at all.

The per-card Signature/ID canvases (`eraWireKeycardSignId()`,
`public/index.html`) size **lazily**, because at page-parse time the CW Email
Request view may not be displayed yet and `getBoundingClientRect()` would report
0. The trap is what "lazily" has to mean: sizing at first *use* is not enough
when the use is asynchronous. Submission > Edit repaints saved ink from an
`Image.onload`, and the card can still have no layout box at that instant — the
Keycard reveal gate not yet lifted, the embed view not yet displayed, a hidden
or zero-width window. The old `ensureCanvasSized()` just `return`ed in that case
and never retried, so the signature was lost with the UI still reporting
"✅ Signature captured".

Sizing must therefore be **retried**, not skipped: park the decoded image and
draw it once the element actually has a box. Note that a `ResizeObserver` armed
on an element inside a `display:none` subtree does **not** fire when that
subtree is revealed (measured in Chrome) — which is exactly the transition that
matters — and `requestAnimationFrame` can be starved indefinitely in a
non-compositing window. The working mechanism is a short `setTimeout` sweep
(`eraSignIdQueueRepaint()`), restarted on click/resize/`visibilitychange`.

## Truncating a data URL to a size cap produces a corrupt image, not a smaller one (found 2026-08-29)

`sanitizeKeycardSignIdSignatureDataUrl()` (`functions/keycardHistory.js`) used
to `.slice()` an oversized PNG data URL down to
`MAX_KEYCARD_FORM_SIGNATURE_DATAURL_CHARS`, mirroring how the surrounding
string sanitizers cap plain text. A PNG cut off mid-stream is not a smaller
signature — it decodes to a partial image at best and to nothing at all at
worst — and it was stored under `signIdSignatures` as if it were fine, so the
damage only surfaced much later, on a Submission > Edit that restored a blank
canvas with no error anywhere. Size caps on *binary* payloads must reject, not
truncate; the caller already turns `""` into an
`"Invalid or oversized signature image."` error.

## A canvas blit in device pixels through a dpr-scaled context is drawn dpr× too large (found 2026-08-30)

Sibling of the entry above, and it hid behind it for a day. The per-card
Signature/ID canvases (`eraWireKeycardSignId()`, `public/index.html`) apply
`ctx.scale(devicePixelRatio, devicePixelRatio)` once, inside
`ensureCanvasSized()`, so that **hand-drawn** strokes can keep using the
CSS-pixel coordinates `pos()` computes from `getBoundingClientRect()`. That
transform then stays on the context forever.

`drawSignatureImage()` — the single entry point for painting ink that came from
a **PNG** rather than from strokes (Submission > Edit's restore, a completed
remote e-signature, and the guide's same-tenant-email signature reuse) — passed
`canvas.width`/`canvas.height`, which are **device** pixels, straight into
`drawImage()`. Through the scaled transform that asks for a destination
`dpr` times larger than the buffer, so the signature was drawn blown up and
clipped. Measured on a `devicePixelRatio` 2.5 display: ink spanning x 45–439 /
y 83–213 of a 1425×350 buffer came back at x 358–1059 / y 208–349, running off
the bottom edge.

Two reasons it survived so long: it is a **no-op at `devicePixelRatio` 1**, so
it never reproduces on an ordinary desktop monitor, and the symptom ("the
restored signature looks wrong") is indistinguishable from the zero-width-box
bug above, which was found first and did explain some of the reports.

The fix is to reset the transform for the blit and put it straight back
(`ctx.save()` → `setTransform(1,0,0,1,0,0)` → draw → `ctx.restore()`). The rule
generalizes: once a context carries a dpr scale, every call that mixes in
`canvas.width`/`canvas.height` is a bug unless the transform is reset first —
`clearRect(0, 0, canvas.width, canvas.height)` merely over-clears, so it is
harmless and hides the same mistake.
