# 2026-08-15 (eighth pass): Cali/Outside Cali email — typography pass

In `buildIssueCaliIssuesEmailHtml()` (`src/app.js`) — the colored HTML actually emailed and shown in the preview modal — "Cali Issues"/"Outside Cali Issues" headings went from 14px/700 to 18px/700, topic/tag headers from 13px to 14px, each entry's Title is now wrapped in `<strong>` (entry rendering rewritten inline rather than reusing the plain-text-only `issueItemAsIsText()`), and each `<li>`'s `margin-bottom` went from 2px to 10px. The on-screen Report step's editable textarea and Kuan's own colored per-tag breakdown are both untouched — plain text can't carry these styles.

Files: `src/app.js`, `public/app.js`
