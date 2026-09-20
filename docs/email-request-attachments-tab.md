# Email Request (Attachments) button

> Part of the [keycard-app documentation map](../CLAUDE.md#documentation-map). Read this before touching the `emailRequestAttachments` entry in the app switcher, or before trying to iframe any Apps Script web app again — see pitfall #10 in [Known pitfalls](pitfalls.md).

Added 2026-08-09, `data-app="emailRequestAttachments"`. Despite living in `#appSwitcher` and looking like a tab, it is **not** a real app tab — never sets `currentApp`, has no view/iframe, not reachable via `updateAppChrome()`. Clicking it opens a separate, externally-hosted Google Apps Script web app in a new tab:

```
https://script.google.com/macros/s/AKfycby0idHkoU90ytw7MdPlQo82FJVg5__q82GlIwtp6WEd2_5QNdgLbNitTq7vCOVK2rVZ/exec
```

That project ("Cubework Email Request — with Attachments", `Google Script/email-request-attachments/` — not part of this repo, not deployed by `firebase deploy`) duplicates `public/email-request.html`'s five request types (Keycard/Wi-Fi/Printer/Phone/Application-Software) but sends via GmailApp with a real file-upload field instead of a mailto draft. See that project's own `SETUP.md`/pitfalls for its deploy process — nothing in this repo triggers it.

## Why a link, not an embedded tab

Originally iframed in (2026-08-09), same as `email-request.html` into `#emailRequestView`. Failed immediately live: Chrome showed "script.google.com refused to connect" — `script.google.com` sends X-Frame-Options/CSP `frame-ancestors` blocking any framing from another origin. No "Who has access" setting, `sandbox` attribute, or client trick works around this — see [pitfall #10](pitfalls.md); don't re-attempt an iframe here.

**Fix:** `appSwitcherEl`'s click handler in `app.js` special-cases `appKey === EMAIL_REQUEST_ATTACHMENTS_APP_KEY` before the normal tab-switch logic, calling `window.open(EMAIL_REQUEST_ATTACHMENTS_URL, "_blank", "noopener,noreferrer")` and returning immediately — never touches `currentApp`, the active-tab highlight, or `updateAppChrome()`. The button label keeps a `↗` and an "Opens in a new tab" tooltip.

## If the Apps Script `/exec` URL ever changes

Normally won't — "Manage deployments → New version" keeps the same URL. Only changes via the non-routine "Deploy → New deployment" path, in which case **two** places need the new URL: that project's own docs, and `EMAIL_REQUEST_ATTACHMENTS_URL` in this repo's `public/app.js`. Missing the second means this button keeps opening the stale deployment.

## Access control

Same shape as every tab: `emailRequestAttachments` in `MANAGEABLE_TABS` in both `public/app.js` and `functions/index.js` (keep in sync), checkbox in the Access tab's "add user" row and per-user rows (`index.html`/`renderAccessList`) — hideable per-user like any tab even though it isn't one. **No** `firestore.rules` `tabAllowed()` entry — no Firestore collection to gate.

One wrinkle from not being a real `currentApp` value: the sign-in flow's "land on the first tab this person can see" fallback (right after `syncAppSwitcherHeightVar`) explicitly skips `EMAIL_REQUEST_ATTACHMENTS_APP_KEY` when picking a landing tab — landing "on" it would just open nothing.
