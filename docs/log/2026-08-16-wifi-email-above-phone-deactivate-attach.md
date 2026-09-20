# 2026-08-16 (third pass) — CW Email Request, Wi-Fi tab: Email moved above Phone, Attachments hidden on De-activate

On the Wi-Fi tab (Create and Troubleshoot, which share the same field layout), Email now renders in its own row directly above Phone instead of being paired with Office or Warehouse far above a stranded Phone field. New `separateEmailFromType: true` flag added to Wi-Fi's `ERA_SIMPLE_MODES` entry only (Printer/App/Laptop unaffected, unchanged markup); `eraCreateSimpleEntry()` branches on it to render Unit Number → Email → Phone. De-activate now also hides the Attachments picker (`#era_w_attachSection`) and its warning note (`#era_w_note`) along with the fields it already hid, via the existing `eraApplySimpleDeactivateVisibility()`. No `functions/emailRequest.js` change needed — `buildWifi()` never had an unconditional attachment requirement.

Files: `public/index.html`
