# Mail sync pipeline (Keycard + New Hire) + Microsoft Graph auth

> Part of the [keycard-app documentation map](../CLAUDE.md#documentation-map). Read before touching `functions/index.js` sync functions, `functions/graphAuth.js`, or either mail-backed tab.

## Mail sync pipeline

Both apps share one generic pipeline in `functions/index.js`, parameterized per folder: `getFolderIdByPath` (walks `childFolders` from Inbox by display-name segments; caches resolved folder id on `_meta/{name}`), `syncFolder`, `backfillHistory`, `syncSentReplies`, `resyncAttachments` — each takes `{ folderId, metaDocRef, collectionName, extractFieldsFn, ... }`. `syncKeycardFolder()`/`syncNewHireFolder()` just supply those params. **To add a third folder:** add one `extractFields`-style parser + a `sync<Name>Folder()`; don't touch the shared pipeline.

Field extraction (`functions/parseEmail.js`, `functions/parseNewHire.js`) is heuristic/regex, not a strict parser (free-form emails, no template). Every field optional; raw subject/body always kept so mis-parses stay visible.

Same-thread messages group by `conversationId`; `threadStatus/{threadKey}` (shared collection — `conversationId` has enough entropy to not collide) tracks completed/reopened state via `setThreadCompleted`.

`resyncAttachments` (+ `resyncKeycardAttachments`/`resyncNewHireAttachments` callables) takes optional `docIds` (via `sanitizeDocIds`, cap 2000). "Fix attachments" button passes currently-rendered doc IDs, or omits `docIds` (full-collection resync) when the "All" filter tab is selected. Commits batch every `RESYNC_BATCH_CHUNK_SIZE` (20) docs so a mid-run timeout doesn't lose progress; client calls with explicit 540s timeout (`httpsCallable(..., { timeout: 540000 })`) matching the bumped server `timeoutSeconds` (SDK default ~70s is too short).

## Microsoft Graph auth (`functions/graphAuth.js`)

Delegated auth via device-code-obtained refresh token (`MS_REFRESH_TOKEN` secret), redeemed with `PublicClientApplication` (not confidential) on every invocation — no cross-invocation access-token cache. Load-bearing pairing: public client + `/me/...` endpoints, never `/users/{email}/...` — see [Known pitfalls](pitfalls.md) before editing.
