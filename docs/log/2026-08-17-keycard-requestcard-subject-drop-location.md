# 2026-08-17, fourth pass: Keycard's Request Card subject no longer repeats the location

A Request Card subject line was printing the location twice — once from the top-level Location field (`subjectName`, at the front of every Keycard subject) and once appended via the second pass's subject fallback (`` `Request Card - ${entries[0].location}` ``, used when `entries[0].companyName` is blank, which it always is for Request Card). In `functions/emailRequest.js`'s `buildKeycard()`, that fallback was changed to a plain `"Request Card"`, dropping the trailing location repeat; the Location still prints normally in the email body.

Files: `functions/emailRequest.js`
