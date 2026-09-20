# 2026-08-15 (third pass): CW Email Request, Keycard tab — Notes reorder, multi-select Access Level

`era-k-notes` moved to sit right after the Tenant Email/Phone contact row (before Fee), and `toggleThisContactRow()` now also hides `.era-k-notes` for Troubleshoot (still visible for Activate/De-activate/Transfer); field order is now Keycard Number → Describe the issue (Troubleshoot only) → Tenant Email/Phone (Activate only) → Notes → Fee. Access Level changed from a single-select `<select>` to a checkbox group (Standard/WH Only/Office Only/Other), joined into one comma-separated string by new `eraKeycardAccessValue()`; `functions/emailRequest.js` needed no change since `buildKeycard()` already just prints whatever string `f.accessValue` is.

Files: `public/index.html`
