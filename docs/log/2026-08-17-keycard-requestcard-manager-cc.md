# 2026-08-17, third pass: Keycard's Request Card Cc's the Manager Email

Keycard's Request Card action now Cc's the Manager Email entered on that entry (previously it only appeared in the email body's `Manager Email: {email}` line). In `functions/emailRequest.js`'s `buildKeycard()`, `ccRecipients` gains one entry per distinct Manager Email across a request's Request Card entries, deduped case-insensitively against the base Cc (`keycard@cubework.com` + requester) and across entries. No client change was needed — the preview modal and Outlook-deeplink fallback both already read `ccRecipients` from `buildKeycard()`'s result.

Files: `functions/emailRequest.js`
