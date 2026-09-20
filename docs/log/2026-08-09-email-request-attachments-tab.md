# 2026-08-09 — Email Request (Attachments) button

Huy had a separate, standalone Google Apps Script web app ("Cubework Email Request — with Attachments," not part of this repo) duplicating `public/email-request.html`'s five request types but sending via GmailApp with real file attachments. First attempt embedded it as a same-origin-style iframe tab (`emailRequestAttachments`), matching the existing Email Request pattern — this failed live: Chrome showed "script.google.com refused to connect," since Apps Script's `/exec` pages refuse to be framed by any other origin (X-Frame-Options), with no client- or server-side workaround short of a full proxy. Recorded as [pitfall #10](../pitfalls.md).

Reverted the iframe entirely; the app-switcher click handler now special-cases `emailRequestAttachments` before normal tab-switch logic and does `window.open(EMAIL_REQUEST_ATTACHMENTS_URL, "_blank", "noopener,noreferrer")` instead, returning without setting `currentApp` (so it's excluded from the sign-in landing-tab fallback). The button stays in `#appSwitcher` next to Email Request but got a "↗" suffix and "Opens in a new tab" tooltip. `MANAGEABLE_TABS` and the Access tab's per-user checkboxes were kept as-is — still individually hideable per user like a real tab.

Files: `public/app.js`, `public/index.html`, `functions/index.js`
