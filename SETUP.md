# Setup walkthrough: Keycard Helpdesk app

One-time, account-specific setup (Microsoft 365 + Google logins) for a Firebase-hosted app already fully coded (`functions/`, `public/`, `firestore.rules`, `firebase.json`). Go through the linked pages in order — step numbers are shared across pages (some code comments reference specific step numbers directly).

| Steps | Page |
|---|---|
| 0–4: Prerequisites, Firebase project, Blaze plan, Firestore, Firebase Auth | [docs/setup/firebase-and-auth.md](docs/setup/firebase-and-auth.md) |
| 5–6: Two Azure AD app registrations (mail sync + dashboard login) | [docs/setup/azure-ad-registration.md](docs/setup/azure-ad-registration.md) |
| 7–11: Refresh token, Cloud Function secrets, deploy, install, test — plus "what to send back" and known limitations | [docs/setup/secrets-deploy-and-install.md](docs/setup/secrets-deploy-and-install.md) |
| 8b (optional, currently unused): Vertex AI for Standup's AI summaries | [docs/setup/vertex-ai-optional.md](docs/setup/vertex-ai-optional.md) |

Once set up, day-to-day work in this repo is guided by [CLAUDE.md](CLAUDE.md) — this file is operator setup only, not code.
