# 2026-08-14: CW Email Request switched back to "Open in Outlook", attachment pickers hidden again

Since Azure AD `Mail.Send` was restricted again on the tenant, `public/index.html`'s `ERA_SUBMIT_MODE` constant was flipped from `"graph"` back to `"outlook"` — via existing toggle logic this makes `era_submitBtn` call `eraOpenInOutlook()` instead of `eraSubmitForm()`, relabels it "Open in Outlook", hides all six `.era-attach-section` file pickers, and shows the `.era-attach-reminder` notes in their place; Keycard/Wi-Fi's own attachment-reminder note wording was updated to match ("...in the Outlook window that opens after you click below"). No `functions/` or `src/app.js` changes — the Graph send path (`submitEmailRequest`/`buildEmailRequestPreview`) is untouched and ready to re-enable by flipping the constant back once `Mail.Send` works again.

Files: `public/index.html`
