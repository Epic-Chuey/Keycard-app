# 2026-08-15 (seventh pass) — Standup: preview modal before sending the Cali/Outside Cali email

Added a review step before the Report step's Cali/Outside Cali email (previously sent directly via Microsoft Graph with no preview, per the sixth pass's tradeoff): `standupEmailOpenBtn` (now labeled "Preview & Send Email") builds the same HTML/subject as before and shows it in a new `#standupEmailPreviewModal` (To/Subject as text, body via `innerHTML` set to the exact string that will be sent); a new `standupPendingCaliIssuesEmail` variable holds that exact payload so Send transmits precisely what was reviewed rather than re-fetching the Issue tab. The actual `sendStandupCaliIssuesEmailFn` call now lives in the modal's Send button; on failure the modal stays open for retry. `sendStandupCaliIssuesEmail` (functions/index.js) is unchanged — it always just sent whatever `{subject, html}` it was given.

Files: `src/app.js`, `public/index.html`, `public/app.js`
