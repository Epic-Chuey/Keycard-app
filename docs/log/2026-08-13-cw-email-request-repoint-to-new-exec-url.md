# 2026-08-13: CW Email Request tab repointed to the new Apps Script /exec URL

Fixed "Send failed: Gmail operation not allowed" on CW Email Request by updating `EMAIL_REQUEST_ATTACHMENTS_URL` in `src/app.js` (the single constant shared by both the "Email Request (Attachments)" `window.open()` button and the CW Email Request embedded `fetch()` tab) from the old, personal-Gmail-owned Apps Script project's `/exec` URL to the new project's `/exec` URL from that day's account migration. `public/app.js` was rebuilt via `npm run build` and byte-diffed to confirm only the URL string changed. Not deployed or live-tested from this session; the old Apps Script project was left running, untouched.

Files: `src/app.js`, `public/app.js`
