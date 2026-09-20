# 2026-08-15 (fifth pass): Access tab — remove "Email Request"/"Email Request (Attachments)" entries

Removed the `EMAIL_REQUEST_APP_KEY`/`EMAIL_REQUEST_ATTACHMENTS_APP_KEY` entries from `MANAGEABLE_TABS` in both `src/app.js` and `functions/index.js`, and the matching `data-tab="emailRequest"`/`"emailRequestAttachments"` checkbox rows from `public/index.html`'s static `#accessNewTabsRow` — a follow-up to the earlier global nav-hide of those two tabs, which had left their (now-inert) per-user grant checkboxes in place. The tabs' own nav-hiding logic and content are untouched; any `accessControl` doc that still lists the old values in its `tabs` array keeps them until next edited (`sanitizeTabs()` silently drops them going forward).

Files: `src/app.js`, `functions/index.js`, `public/index.html`, `public/app.js`
