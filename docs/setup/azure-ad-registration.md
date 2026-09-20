# Setup: Azure AD app registrations (steps 5–6)

> Part of the [setup walkthrough](../../SETUP.md), itself part of the [documentation map](../../CLAUDE.md#documentation-map). Continues from [Firebase project + Firestore + Auth](firebase-and-auth.md).

## 5. Register an Azure AD (Entra ID) app — for the background email sync

Lets the Cloud Function read the Keycard folder in the background.

1. https://portal.azure.com → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name "Keycard Helpdesk Sync"; account types: **single tenant**; redirect URI blank for now. Register.
3. Note **Application (client) ID** and **Directory (tenant) ID** on the overview page.
4. **Certificates & secrets** → **New client secret** → copy the **value** immediately (hidden once you leave).
5. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → add `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `offline_access`, `User.Read` → **Add permissions**.
   - `Mail.ReadWrite` (2026-08-08) backs Standup's unwired "Open in Outlook Web" draft feature. `Mail.Send` (2026-08-13) sends "CW Email Request" — see [2026-08-13 log](../log/2026-08-13-cw-email-request-standalone-backend.md).
   - App already exists? Just add the missing scope(s) via **API permissions**, don't register a second app.
   - "Grant admin consent" greyed out / org requires it → a M365 admin clicks **Grant admin consent for cubework.com** once. Many tenants allow self-consent to basic Mail.Read — try [step 7](secrets-deploy-and-install.md) first.

## 6. Register a *second* Azure AD app — for signing into the dashboard

(Can reuse the step-5 app instead — add a redirect URI + "Web" platform to it. A separate app just keeps mail-read and login permissions cleanly split.)

1. **New registration** → "Keycard Helpdesk Login" → single tenant → **Platform: Web**, redirect URI = the one from [step 4.3](firebase-and-auth.md).
2. **API permissions** → add `openid`, `email`, `profile` (User.Read usually suffices; Firebase requests these automatically).
3. **Certificates & secrets** → new client secret → copy value.
4. Back in Firebase console ([step 4](firebase-and-auth.md)): paste this app's **Application (client) ID** + secret into the Microsoft provider fields, save.
5. In `public/app.js`, replace `REPLACE_WITH_MS_TENANT_ID` with the Directory (tenant) ID from step 5.3 (same for both apps).

Next: [Secrets, deploy, and install (steps 7–11)](secrets-deploy-and-install.md).
