# Setup: Firebase project + Firestore + Auth (steps 0–4)

> Part of the [setup walkthrough](../../SETUP.md), itself part of the [documentation map](../../CLAUDE.md#documentation-map).

Builds a dashboard of Outlook's **Helpdesk > Keycard** folder emails (~7,800 messages), synced into Firestore, installable on phone/desktop. Code is all written — only account-specific steps (needing M365 + Google logins) remain.

## 0. Prerequisites

- Node.js 20+ and Firebase CLI: `npm install -g firebase-tools`
- Google account to own the Firebase project (work or personal — hosting only)
- Ability to register an Azure AD/Entra app for `cubework.com`; if your tenant requires admin approval for new apps/permissions, loop in IT (flagged at relevant steps in [Azure AD registration](azure-ad-registration.md))

## 1. Create the Firebase project

1. https://console.firebase.google.com → **Add project** → name it → Create project.
2. **Project settings > General** → note **Project ID** → put it in `.firebaserc`, replacing `REPLACE-WITH-YOUR-FIREBASE-PROJECT-ID`.
3. Project settings → **Your apps** → **Web** (`</>`) → register (any nickname) → skip Firebase Hosting checkbox (done via CLI later) → copy the `firebaseConfig` object → paste into `public/app.js`'s `REPLACE_ME` fields.

## 2. Upgrade to Blaze

Required for scheduled Cloud Functions + outbound Graph calls. Console → **Upgrade** (bottom left). At this scale (15-min sync), cost ≈ a few cents/month.

## 3. Enable Firestore

Console → **Build > Firestore Database** → **Create database** → nearby region → **production mode** (repo's rules file already locks it down).

## 4. Enable Firebase Authentication

Console → **Build > Authentication** → **Get started**. Signs users in with their M365 account:

1. **Sign-in method** → **Add new provider** → **Microsoft**.
2. Firebase asks for **Client ID**/**Client secret** — from the Azure AD app in [step 6](azure-ad-registration.md). Return here after, paste in, toggle provider **on**.
3. Copy the **redirect URI** shown (e.g. `https://keycard-helpdesk.firebaseapp.com/__/auth/handler`) — add to the Azure app's redirect URIs in step 6.

Next: [Azure AD registration (steps 5–6)](azure-ad-registration.md).
