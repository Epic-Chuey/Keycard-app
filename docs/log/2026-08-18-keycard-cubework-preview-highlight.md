# 2026-08-18: Keycard: bold + green "Cubework" in Preview/sent email (third pass)

When Keycard's Serves is Cubework, the leading "Cubework" token on every entry line (and the Request Card line) now renders bold + green (`color:#1a7f37; font-weight:700`) in the email's `htmlBody`; Unis stays plain text. In `functions/emailRequest.js`'s `buildKeycard()`, the per-entry line builder was factored into `buildEntryLine(entry, servesText)`; a second, html-only pass builds lines with a `SERVES_PLACEHOLDER` token (`"%%CW_SERVES_TOKEN%%"`) in place of the real Serves text, and after the usual `esc()` + `<br>` conversion, that placeholder is swapped for either the styled `<span>` (Cubework) or plain escaped text (else). The plain-text `textBody` is unaffected — html-only change, since plain text can't carry color (pitfall #7).

Preview and the actually-sent email can't drift apart by construction: `buildEmailRequestPreview` and `submitEmailRequest` both call `buildEmailRequest()` → `buildKeycard()`, and Graph's send uses `built.htmlBody` verbatim — one `htmlBody`, two consumers. No client-side change was needed. Scoped to Keycard only; other modes print a separate `Serves: Cubework` line instead and were left alone.

Files: `functions/emailRequest.js`
