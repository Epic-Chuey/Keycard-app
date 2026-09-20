# Setup: secrets, deploy, and install (steps 7–11)

> Part of the [setup walkthrough](../../SETUP.md), itself part of the [documentation map](../../CLAUDE.md#documentation-map). Continues from [Azure AD registration](azure-ad-registration.md). See also [Vertex AI setup (optional, step 8b)](vertex-ai-optional.md) for Standup's unwired AI summaries.

## 7. Get a refresh token for the sync function (one-time, local)

```bash
cd keycard-app
npm install @azure/msal-node
MS_CLIENT_ID=<step 5 client id> MS_TENANT_ID=<step 5 tenant id> node get-refresh-token.js
```

Prints a URL + short code. Open the URL, enter the code, sign in as `huy.nguyen@cubework.com`, approve Mail.Read/Mail.ReadWrite/Mail.Send (see the script's own comment for what each is for). Re-run whenever the scope list changes — a refresh token only carries what was consented to at issuance. Copy the printed refresh token.

**Re-running later** (e.g. after adding Mail.Send on 2026-08-13): same command/account. Overwrites `refresh-token.txt` — re-run the `MS_REFRESH_TOKEN` secret step below with the new value, then redeploy functions to pick it up.

## 8. Set the Cloud Function secrets

```bash
firebase login
firebase use <your-project-id>

firebase functions:secrets:set MS_CLIENT_ID
firebase functions:secrets:set MS_CLIENT_SECRET
firebase functions:secrets:set MS_TENANT_ID
firebase functions:secrets:set MS_REFRESH_TOKEN
```

Each prompts for the value (from step 5). Optional, only for a different mailbox: `firebase functions:config:set mailbox.user="huy.nguyen@cubework.com"` (plain env var) — `index.js` already defaults to that address otherwise.

(Step 8b, Vertex AI, is optional/unused — see [Vertex AI setup](vertex-ai-optional.md).)

## 9. Deploy

```bash
cd keycard-app/functions && npm install && cd ..
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

Prints your Hosting URL, e.g. `https://keycard-helpdesk.web.app`.

## 10. Install it as an app

- **Phone**: open the Hosting URL in Chrome (Android)/Safari (iPhone) → menu → **Add to Home Screen**/**Install app** (PWA, no App Store).
- **Desktop**: open in Chrome/Edge → install icon (⊕/monitor) in address bar → **Install**.

## 11. Test it

1. Open the app, sign in with Microsoft.
2. Click **Sync now** — first run backfills only from setup-time onward (not the full 7,800-message history, to stay fast/cheap; ask for a one-time backfill script if needed).
3. Send a test email into the Keycard folder; confirm it appears after the next scheduled sync (15 min) or a manual sync.

## What to send back

After steps 1–8: in chat only (never a file that leaves your machine), the **Firebase project ID** + confirmation that Azure registrations/secrets are set — no need to share secret values.

## Known limitations

- **Parsing is heuristic** (`functions/parseEmail.js`) — free-form emails, no template, so fields can come back blank/off; dashboard always shows the raw subject/preview. Common mis-parses → next step is an LLM parser instead of regex.
- **Refresh tokens expire after ~90 days idle** (MS default); the 15-min sync cadence normally prevents this. If sync silently stops, re-run `get-refresh-token.js` and re-set the secret.
- Mail *sync* (Helpdesk/New Hire) only reads (`Mail.Read` only — see `functions/graphAuth.js`). Since 2026-08-13 the same delegated Graph client also *sends* mail for "CW Email Request" (`Mail.Send`, requested separately) — see `functions/emailRequest.js`.
