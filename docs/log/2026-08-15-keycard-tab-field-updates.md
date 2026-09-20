# 2026-08-15 (second pass): CW Email Request, Keycard tab — field/UX cleanup

Keycard Number's label dropped the "optional" wording (the field itself stays optional); Tenant Email/Phone lost their required-asterisk and `buildKeycard()` no longer requires them for any action including Activate (format checks still run whenever a value is present); field order became Company/Tenant Name → Keycard Number → new always-visible Notes textarea → Troubleshoot's "Describe the issue" box → Tenant Email/Phone → Fee; Access Level gained "WH Only"/"Office Only" options; and `entry.notes`, when present, now appends a `Notes:` line to the email for any action.

Files: `public/index.html`, `functions/emailRequest.js`
