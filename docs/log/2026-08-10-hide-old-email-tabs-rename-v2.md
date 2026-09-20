# 2026-08-10 — Hide old Email Request tabs, rename inline embed to "Email Request V2"

With the inline embed (see [Email (Attach.) Inline tab](../email-request-attachments-embed-tab.md)) now live, the two older entry points were retired from the nav in its favor: the `emailRequest` and `emailRequestAttachments` nav buttons got `style="display:none;"` in `public/index.html`, and the embed tab's button was relabeled "📎 Email (Attach.) Inline" → "📧 Email Request V2" (also renamed on the Access tab's `accessNewTabsRow`).

In `public/app.js`, the per-user tab-visibility loop (driven by `MANAGEABLE_TABS`/`canSeeTab()`) now explicitly skips `EMAIL_REQUEST_APP_KEY` and `EMAIL_REQUEST_ATTACHMENTS_APP_KEY`, same as it already did for `ACCESS_APP_KEY` — without this, `canSeeTab()` would reset `style.display` back to `""` on every sign-in for any user with unrestricted/granted tabs (the default for most users), undoing the static hide. The landing-tab fallback also now excludes `EMAIL_REQUEST_APP_KEY` from its candidate search. `MANAGEABLE_TABS`'s label for the embed tab was renamed to "Email Request V2" to match.

Deliberately left alone: the `MANAGEABLE_TABS` entries and per-user grant checkboxes for the two hidden tabs (a global hide, not a permission removal — the underlying grant mechanism is now inert but still present); the embed tab's "Experimental" tooltip; the ported form's own internal copy (`era-h1`, fallback-link text).

Files: `public/index.html`, `public/app.js`
