# Email OTP sign-in (2026-08-27)

> Part of the [documentation map](../CLAUDE.md#documentation-map). Read [architecture-core.md](architecture-core.md) first (role/access model) — this doc only covers the second way in.

A second, self-service sign-in path alongside the existing "Sign in with Microsoft" popup: an unauthenticated visitor types a `@cubework.com` address, gets a 6-digit code by email, and verifying it signs them in **and**, the first time, auto-adds them to `accessControl` as a basic account. No new UI or backend concept was invented for roles/tabs/animations — this feature only adds *one more way to arrive at* a normal `accessControl` doc and a normal Firebase Auth session; every existing enforcement point (`requireRole`, `requireOwner`, `firestore.rules`' `tabAllowed()`/`isOwner()`, the `no-animations` body class, `canSeeTab()`) is untouched and applies identically regardless of how someone signed in.

## Flow

1. Client calls `requestEmailOtp({ email })` (no auth required — this *is* the pre-auth entry point). Server validates the address ends in `@cubework.com` (same domain convention as `storage.rules`' `isCubeworkUser()`), rate-limits (below), generates a 6-digit code via `crypto.randomInt`, hashes it (HMAC-SHA256 with a random per-request salt — never stored raw), and stores it in `otpRequests/{email}` with a 10-minute expiry. Sends the code by email via the same Graph `sendMail` path (`getGraphClientForSend` + `sendPlainHtmlEmail`) `createKeycardSignatureRequest` already uses for tenant e-signature links. Always returns a generic `{ ok: true }` — never confirms or denies whether that address already has an account.
2. Client calls `verifyEmailOtp({ email, code })`. Server re-checks the hash inside a Firestore transaction (atomic increment-attempts / mark-consumed), enforcing expiry, single-use (`consumedAt`), and a max-attempts lockout.
3. On a correct code: find-or-create a Firebase Auth user for that email (`emailVerified: true`), bootstrap `accessControl/{email}` **only if it doesn't already exist** (role `view`, `tabs: ["emailRequestAttachmentsEmbed"]`, `eraModes: ["keycard"]`, `eraKeycardActions: ["activate"]` — 2026-08-30, see [architecture-core.md](architecture-core.md)'s "Granular CW Email Request access" — `disableAnimations: true`, `authMethod: "otp"`), stamp/refresh `otpVerifiedAt` on the doc either way, and mint a Firebase custom token.
4. Client calls `signInWithCustomToken(auth, token)`. `onAuthStateChanged` (the same listener the Microsoft flow already triggers) takes over from there completely unchanged — resolves role/tabs via `getMyRole`, shows/hides tabs, applies `no-animations`, etc.

## Why new accounts land on CW Email Request only, with no Phoenix

No new gating logic was needed for either of these — both ride the *existing* `accessControl` fields:

- `tabs: ["emailRequestAttachmentsEmbed"]` is exactly what `canSeeTab()` (client, UX only) and `tabAllowed()` (`firestore.rules`, the real enforcement) already understand — see [architecture-core.md](architecture-core.md).
- `disableAnimations: true` is the same field Manage Access already exposes per-user (the checkbox next to each row) — the Phoenix background already skips its whole spawn/rAF loop, not just its CSS, behind `document.body.classList.contains("no-animations")` (see `noAnim()` in `public/index.html`'s phoenix IIFE) — see the `phoenix-background-animation` memory.

Both are only ever *set* by `verifyEmailOtp` when the doc is first created — an existing account's role/tabs/animation preference is never touched by this flow (see "Existing accounts" below).

## Rate limiting / brute force (`functions/index.js`)

| Constant | Value | Guards against |
|---|---|---|
| `OTP_RESEND_MIN_INTERVAL_MS` | 60s | Rapid-fire resend spam |
| `OTP_MAX_SENDS_PER_WINDOW` / `OTP_SEND_WINDOW_MS` | 5 / 1 hour | Sustained resend spam (rolling window, stored as `sendCount`/`windowStart` on the `otpRequests` doc) |
| `OTP_TTL_MS` | 10 minutes | A leaked/intercepted code being usable indefinitely |
| `OTP_MAX_VERIFY_ATTEMPTS` | 5 per code | Guessing a 6-digit code by brute force — the code is locked (not just the doc) once exhausted; a new `requestEmailOtp` call is required, which is itself throttled by the two rows above |
| `consumedAt` | single-use | A correct code being replayed after use |

All of the above live entirely server-side in `otpRequests/{email}` (`firestore.rules`: `allow read, write: if false` — no client, not even the owner, ever touches this collection directly).

## The 30-day session

Requirement: an OTP-verified session shouldn't need re-verifying on every visit, but *should* expire 30 days after the last successful verification. Firebase's own client-side session persistence has no such concept (a signed-in client stays signed in indefinitely), so this is enforced by treating `otpVerifiedAt` (a plain timestamp field on the `accessControl` doc, refreshed on every successful `verifyEmailOtp`) as a freshness check, applied in **two** places so it can't be bypassed by talking to Firestore directly instead of through a callable:

- **`functions/index.js`'s `getAccessInfo()`** — if `otpVerifiedAt` is more than `OTP_SESSION_MAX_AGE_MS` (30 days) old, returns `role: null` regardless of the stored `role` field. This is what `getMyRole`/`requireRole` see, so every callable is covered.
- **`firestore.rules`'s `otpSessionValid()`** — the identical check, gating `myRole()` (and therefore every collection's `hasAnyRole()`/`isFullAccess()` read rule) directly at the database layer.

A doc with **no** `otpVerifiedAt` field at all — i.e. every account added the old way, directly via Manage Access — is untouched by either check and never expires this way; this only ever applies to accounts that have gone through this flow at least once. When it does expire, the client's existing `if (!role) { alert(...); signOut(auth); }` branch in `onAuthStateChanged` fires exactly as it does for a revoked/removed account today — no new client-side expiry logic was needed, it just naturally re-runs whenever the app re-checks `getMyRole` (on load, or on the next callable/read that fails).

## Existing accounts (no duplicates, no privilege changes)

`verifyEmailOtp` bootstraps `accessControl/{email}` inside a Firestore transaction that only ever **creates** the doc if it's missing — an existing doc (whether added by an admin via Manage Access, or from an earlier OTP sign-up) only ever gets its `otpVerifiedAt` stamp refreshed via `{ merge: true }`; `role`/`tabs`/`position`/`disableAnimations`/etc. are never read from the client or overwritten. The transaction also makes concurrent verifications for the same email race-safe — only one can "win" the create path. The owner (`OWNER_EMAIL`) is skipped entirely, matching the existing invariant that the owner never has (or needs) an `accessControl` doc.

## Known limitation

If someone who signed up via OTP later also tries "Sign in with Microsoft" with the same address (or vice versa), Firebase Auth's default "one account per email" setting means the second provider can't attach to the same account without an explicit account-linking flow, which this feature does not implement — out of scope of the original ask. In practice this only matters for someone who both self-signs-up via OTP *and* has (or later gets) a real Microsoft 365 account; an admin who wants to convert such a person to Microsoft sign-in should remove their `accessControl` doc's `authMethod`/`otpVerifiedAt` fields (or the doc's `email`-keyed Firebase Auth user) rather than expecting both to work automatically.
