# 2026-08-27 — Email OTP sign-in

Full detail: [docs/otp-email-auth.md](../otp-email-auth.md).

Added a second sign-in path next to the existing "Sign in with Microsoft" popup: type a `@cubework.com` email on the sign-in screen, get a 6-digit code, verify it. First-time verification auto-creates an `accessControl` doc (role `view`, restricted to the CW Email Request tab only, animations off) via the existing role/tabs/`disableAnimations` fields — no new gating concept, just a new way to arrive at the same account shape Manage Access already produces by hand. Existing accounts (admin-added or previously self-signed-up) are recognized by email and never have their role/tabs touched by this flow.

- `functions/index.js`: `requestEmailOtp`/`verifyEmailOtp` callables — hashed+salted 6-digit codes in a new `otpRequests/{email}` collection, 10-minute expiry, single-use, resend throttle (60s / 5-per-hour), 5-attempt lockout. On success: find-or-create Firebase Auth user, bootstrap-or-preserve the `accessControl` doc, mint a custom token. `getAccessInfo()` now also enforces a 30-day OTP-session freshness check (`otpVerifiedAt` vs `OTP_SESSION_MAX_AGE_MS`), only for docs that carry that field.
- `firestore.rules`: `otpRequests` is fully server-only (`allow read, write: if false`); `myRole()` gained the identical `otpSessionValid()` 30-day check so the expiry is enforced at the database layer too, not just inside callables.
- `src/app.js` / `public/index.html`: new `otpToggleBtn`/`otpPanel` UI on the sign-in screen (email → send code → enter code → verify), wired to `signInWithCustomToken` — from there `onAuthStateChanged` is completely unchanged and handles role/tabs/animations exactly as it does for a Microsoft sign-in.

No changes to the Microsoft sign-in path, `requireRole`/`requireOwner`, `MANAGEABLE_TABS`, or the Phoenix animation's own no-animations gating — all reused as-is.
