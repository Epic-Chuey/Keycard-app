/**
 * ONE-TIME SCRIPT - run this on your own laptop (not in Firebase) to sign in
 * as huy.nguyen@cubework.com and print a refresh token for the Cloud
 * Function to use. See SETUP.md step 5.
 *
 * Usage:
 *   npm install @azure/msal-node
 *   MS_CLIENT_ID=xxx MS_TENANT_ID=xxx node get-refresh-token.js
 *
 * It uses the OAuth "device code" flow: you'll get a URL + code to enter in
 * a browser, sign in with your Microsoft 365 account, and approve the
 * Mail.Read + Mail.ReadWrite + Mail.Send permissions. The script then prints
 * the refresh token to save as the MS_REFRESH_TOKEN secret.
 *
 * (2026-08-08: added Mail.ReadWrite — needed so the Standup tab's "Open in
 * Outlook Web" can create a real Draft via Graph instead of relying on a
 * copy-to-clipboard + manual paste workaround.
 *
 * 2026-08-13: added Mail.Send — needed so "CW Email Request" can send via
 * Graph (functions/emailRequest.js) instead of the external Apps Script
 * project's GmailApp.sendEmail(), which kept failing with "Send failed:
 * Gmail operation not allowed." Mail.Send must also be added to the Azure
 * AD app registration's API permissions first (see
 * docs/setup/azure-ad-registration.md) — the device-code consent screen
 * only offers to grant scopes the app registration itself lists; adding it
 * here without also adding it there will silently drop the request instead
 * of erroring.
 *
 * Re-run this any time the requested scopes change, even if a refresh
 * token from before still works for the old scopes — a token only carries
 * whatever scopes were actually consented to at the time it was issued.)
 */

const msal = require("@azure/msal-node");
const fs = require("fs");
const path = require("path");

const OUTPUT_FILE = path.join(__dirname, "refresh-token.txt");

const clientId = process.env.MS_CLIENT_ID;
const tenantId = process.env.MS_TENANT_ID;

if (!clientId || !tenantId) {
  console.error("Set MS_CLIENT_ID and MS_TENANT_ID environment variables first.");
  process.exit(1);
}

const pca = new msal.PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
  },
});

const deviceCodeRequest = {
  scopes: [
    "https://graph.microsoft.com/Mail.Read",
    "https://graph.microsoft.com/Mail.ReadWrite",
    "https://graph.microsoft.com/Mail.Send",
    "offline_access",
    "User.Read",
  ],
  deviceCodeCallback: (response) => {
    console.log("\n" + response.message + "\n");
  },
};

pca
  .acquireTokenByDeviceCode(deviceCodeRequest)
  .then((response) => {
    // msal-node doesn't expose the raw refresh token on the response object
    // by default; it's retrieved from the token cache instead.
    const cache = pca.getTokenCache().serialize();
    const parsed = JSON.parse(cache);
    const refreshTokens = parsed.RefreshToken || {};
    const first = Object.values(refreshTokens)[0];

    if (!first) {
      console.error("No refresh token found in cache - did the sign-in complete?");
      process.exit(1);
    }

    // Write straight to a file instead of printing it - copy/pasting a
    // ~1700-character token through a terminal prompt is an easy way to
    // silently drop or mangle a character. Reading it back from a file with
    // `firebase functions:secrets:set NAME --data-file=...` sidesteps that.
    fs.writeFileSync(OUTPUT_FILE, first.secret.trim(), "utf8");

    console.log("\nSuccess! Refresh token written to:", OUTPUT_FILE);
    console.log("Length:", first.secret.trim().length, "characters");
    console.log("(Signed in as:", response.account.username, ")");
    console.log("\nNext, run:");
    console.log(
      `  firebase functions:secrets:set MS_REFRESH_TOKEN --data-file="${OUTPUT_FILE}"`
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
