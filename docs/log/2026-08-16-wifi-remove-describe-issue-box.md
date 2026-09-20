# 2026-08-16 (fourth pass) — CW Email Request, Wi-Fi tab: removed the "Describe the issue" box

Removed Wi-Fi's shared "Describe the issue" textarea (`era_w_issue`, previously shown under Troubleshoot) outright — the per-entry Notes box already covers it. `eraCollectFields()`'s wifi case no longer reads/sends `issue`; `buildWifi()` dropped the matching required-field check and the `Issue:` email line. Printer's separate `era_pr_issue` box is untouched.

Files: `public/index.html`, `functions/emailRequest.js`
