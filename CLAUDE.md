# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It's the master index — read this first, then follow the links below to whichever `docs/*.md` file covers the area you're touching. Individual `docs/` files are self-contained deep-dives; this file stays short on purpose so it's cheap to read on every session. **This file describes current behavior only — for the history of how it got here, see [CHAT_LOG.md](CHAT_LOG.md).**

## What this is

A Firebase-hosted internal dashboard for CubeWork (single tenant, `@cubework.com`). Core: syncs two Outlook mail folders (Helpdesk > Keycard, Priscila > New Hire) into Firestore via a scheduled Cloud Function, displayed as a searchable/filterable ticket dashboard. It also hosts several unrelated "apps" behind one nav switcher:

| Tab | Current behavior | Doc |
|---|---|---|
| (main) Tickets | Keycard/New Hire mail-sync dashboard | [mail-sync-and-graph-auth.md](docs/mail-sync-and-graph-auth.md) |
| Project Roadmap | Manually-entered deployment tracker: cost breakdowns, timeline/Gantt view, Excel/PDF/PNG export | [roadmap-feature.md](docs/roadmap-feature.md) |
| Manage Access | Role/tab-grant administration | [architecture-core.md](docs/architecture-core.md) |
| Standup | 3-step workflow (Pull+Checklist → Report+Email → Saved) built from Huy's own Sent Items; per-entry AI summaries via Vertex AI exist but are currently unwired | [standup-tab.md](docs/standup-tab.md) |
| Daily To-Do | Voice-or-typed to-do log via the browser's Web Speech API, rolled into an end-of-day report; reviewed side by side with (not merged into) Standup's checklist | [daily-todo-tab.md](docs/daily-todo-tab.md) |
| Issue | Manually-entered facilities/IT tracker: Cali / Outside Cali regions × Active/Pending/Complete status, a "New" tab for filing (state auto-routes region, file attachments via Firebase Storage), shared Location catalog + tag set, Excel/PDF/PNG export | [issue-tab.md](docs/issue-tab.md) |
| Email Request, Email Request (Attachments) | Legacy tools, force-hidden from the nav (their `MANAGEABLE_TABS` grants/routes still exist underneath but aren't surfaced) — fully superseded by CW Email Request | [email-request-tool.md](docs/email-request-tool.md), [email-request-attachments-tab.md](docs/email-request-attachments-tab.md) |
| **Cubework Email Request** (was "CW Email Request"; tab key still `emailRequestAttachmentsEmbed`) | Sole visible email-request entry point. Six modes — Keycard, Wi-Fi, Printer, Phone, App/Soft/Hardware, Laptop — each with its own field/validation logic (see doc for per-mode detail). As of 2026-09-04, Printer/Phone/Laptop are reached only through the Hardware ▾ dropdown (Hardware > Printer; Hardware > Laptop/Phone > Phone/Laptop), not their own top-level tabs — see [hardware-tab-hover-menu.md](docs/hardware-tab-hover-menu.md). **Keycard (2026-09-22 rework):** no tab dropdown, clicking Keycard opens the form directly. Flow (one controller, `eraKeycardRefreshFlow()` in `public/index.html`): Requester Email (inline history suggestions, max 3) → Card 1 → "Choose an entry" → **Activate** shows that card's *own* Licensee / Yardi / Location (+ Add Location) / Unit / Floor + Tenant Name / Keycard Number (live "N more digits required" check) → then Tenant Email (inline suggestions) / Phone / Access System / Access Level / Fee → "+ Add another keycard" + an **E-Signature panel** (one "Keycard #N" checkbox per completed Activate card + one **Send** button that sends only the ticked, not-yet-sent cards through each card's existing `eraWireKeycardSignId()` send/poll; per-card Resend; no duplicates on return) → **Issued By** (Requestor Signature + auto-filled read-only Date) → **Save** appears once cards + Issued By are complete (tenant signatures may still be pending — save and leave is fine) → **Preview** appears only once every ticked card is also signed. Submission → Edit re-reads signature status from the backend (`signedCards`, `signatureRequests`) and keeps polling. The hidden request-level `era_k_licenseeCompanyName`/`era_location`/… inputs are a mirror of the first Activate card (`eraKeycardSyncSharedFields()`); other actions keep their own fields and use the shared Location. The Keycard page is full-width (no 820px column cap, unlike other modes) and has no top Video button — tutorials open from account menu > Help. Serves is always Cubework (Unis removed in every mode); in-person Signature/Photo ID/Date Issued/Date Returned/Notes/Keycard Form/Attachments stay hidden. **Photo ID is gone from the remote E-Signature flow** (`sign.html`, `submitSignatureRequest`, `computeKeycardHistoryStatus`); the tenant's signed form (that card only) is emailed to the Requester Email as an attachment. **One email per card** (`eraKeycardPerCardFields()`/`eraSendKeycardBatch()` send N single-card requests through the same `buildKeycard()`, each with its own Location/Licensee); required-field checks live in `eraKeycardRequiredProblems()` (called from `Le()` and the Save/Preview gate). Every mode goes through a Preview modal (with a Format toolbar for hand-edits) before Submit; sends via Microsoft Graph (`submitEmailRequest` Cloud Function) or an "Open in Outlook" client-side deeplink, selected by the `ERA_SUBMIT_MODE` constant in `public/index.html` | [email-request-attachments-embed-tab.md](docs/email-request-attachments-embed-tab.md) |

Installable as a PWA (`manifest.json` + `service-worker.js`) on phone and desktop. Live at `keycard-helpdesk.web.app`.

See [SETUP.md](SETUP.md) for one-time account setup (Firebase project, Azure AD app registrations, secrets) — operator setup, not code. See [CHAT_LOG.md](CHAT_LOG.md) for the chronological decision log.

## Commands

**`public/app.js` is a generated build artifact, not the source (see [pitfall #11](#known-pitfalls-check-first)).** Edit `src/app.js` instead — it's the real, fully-commented file — then run `npm run build` (esbuild, minify-only: no bundling, no import resolution, so the `import ... from "https://www.gstatic.com/..."` lines stay untouched) to regenerate the deployed `public/app.js` before deploying. Everything else has no build step, bundler, linter, or test suite — `public/index.html`, `public/locations.js`, and everything under `functions/` are served/run as-is by Firebase Hosting/Cloud Functions; edit those directly.

One-time (fresh clone, or after pulling a change to `package.json`): `npm install` (installs `esbuild`, the only dev dependency).

Deploy (from `keycard-app/`, i.e. `cd C:\Users\huyng\OneDrive - CubeWork\Claude\CW_EPIC_SKILLS\keycard-app`):

```bash
npm run build                               # regenerate public/app.js from src/app.js - always do this first if src/app.js changed
firebase deploy --only hosting              # public/ changes only (app.js, index.html, css)
firebase deploy --only functions            # functions/ changes only
firebase deploy --only hosting,functions    # both
firebase deploy --only firestore:rules      # firestore.rules changes
firebase deploy --only storage              # storage.rules changes
```

One-time / manual scripts (run locally, never deployed):

```bash
node get-refresh-token.js   # regenerate MS_REFRESH_TOKEN if Graph sync silently stops (see docs/setup/secrets-deploy-and-install.md)
```

No test runner exists. Before deploying: `node --check <file>` on any edited `src/app.js`/`functions/*.js` (and re-check `public/app.js` after `npm run build`); for anything touching SheetJS export sheets, write a throwaway Node script that builds the worksheet with the real `xlsx` package and round-trips it through `XLSX.writeFile`/`sheet_to_json` before trusting it (see [Known pitfalls](docs/pitfalls.md) — SheetJS's free build has surprising limitations).

## Documentation map

`docs/architecture-core.md` and `docs/pitfalls.md` are cross-cutting — read those regardless of what you're touching. Everything else, read only the row(s) relevant to your task:

| Working on... | Read this first |
|---|---|
| Anything in this repo (hard invariants: monolith structure, write path, roles, app switching) | [docs/architecture-core.md](docs/architecture-core.md) |
| Anything (auth, exports, layout, Outlook deeplinks) behaving weirdly | [docs/pitfalls.md](docs/pitfalls.md) |
| Email OTP sign-in (`requestEmailOtp`/`verifyEmailOtp`, the `otpToggleBtn`/`otpPanel` sign-in-screen UI, self-service basic-account creation, the 30-day OTP session) | [docs/otp-email-auth.md](docs/otp-email-auth.md) |
| Keycard/New Hire mail sync, `functions/graphAuth.js`, Microsoft Graph calls | [docs/mail-sync-and-graph-auth.md](docs/mail-sync-and-graph-auth.md) |
| `public/email-request.html` (Keycard/Wi-Fi request tool) | [docs/email-request-tool.md](docs/email-request-tool.md) |
| Email Request (Attachments) tab (`emailRequestAttachments` external-iframe tab) | [docs/email-request-attachments-tab.md](docs/email-request-attachments-tab.md) |
| CW Email Request tab (`emailRequestAttachmentsEmbed`, `#emailRequestAttachmentsEmbedView`) | [docs/email-request-attachments-embed-tab.md](docs/email-request-attachments-embed-tab.md) |
| CW Email Request's "Hardware ▾" hover-cascading menu (`#era_hw_tabDropdown`) | [docs/hardware-tab-hover-menu.md](docs/hardware-tab-hover-menu.md) |
| Keycard "Activate" step-by-step guide (`eraGuide*`, the chooser + highlight/popup overlay with Back/Next and "Step X of 23") | [docs/keycard-activate-guide.md](docs/keycard-activate-guide.md) → [docs/Guide_Activate_2026-08-29.md](docs/Guide_Activate_2026-08-29.md) |
| Keycard "Replacement" step-by-step guide (same engine as Activate; 16 steps — request-level head through Preview and a full Email review) | [docs/Guide_Replacement_2026-09-05.md](docs/Guide_Replacement_2026-09-05.md) |
| Keycard "Troubleshoot" step-by-step guide (same engine as Activate; 14 steps — request-level head through Preview and a full Email review, no Activate/De-activate hand-off) | [docs/Guide_Troubleshoot_2026-09-05.md](docs/Guide_Troubleshoot_2026-09-05.md) |
| Background Phoenix spawn/birth animation (`#era_phoenix_bg`, the 5 randomized birth themes) | [docs/phoenix-birth-themes.md](docs/phoenix-birth-themes.md) |
| Project Roadmap tab (`roadmapItems`, exports, timeline/compare views) | [docs/roadmap-feature.md](docs/roadmap-feature.md) |
| Standup tab (Pull/Report/Saved, `standup*` functions) | [docs/standup-tab.md](docs/standup-tab.md) |
| Daily To-Do tab (Log/Report/Saved, `dailyTodo*` functions) | [docs/daily-todo-tab.md](docs/daily-todo-tab.md) |
| Issue tab (`issueItems`, region/status tabs, `issue*` functions) | [docs/issue-tab.md](docs/issue-tab.md) |
| `public/locations.js`, location auto-detection/grouping | [docs/location-catalog.md](docs/location-catalog.md) |
| Tags on Standup/Daily To-Do/Issue (`STANDUP_TAGS`, shared `sharedTagCatalog`, `addSharedTag`/`deleteSharedTag`) | [docs/tag-feature.md](docs/tag-feature.md) |
| One-time account/infra setup (Firebase, Azure AD, secrets, deploy) | [SETUP.md](SETUP.md) → `docs/setup/*.md` |
| "What changed and why," by date | [CHAT_LOG.md](CHAT_LOG.md) → `docs/log/*.md` |

## Known pitfalls (check first)

Full write-ups live in [docs/pitfalls.md](docs/pitfalls.md) — this is just the index so nothing here gets missed:

1. Microsoft Graph delegated auth — wrong client type / wrong Graph endpoint shape / folder-path assumptions.
2. SheetJS free build — no cell styles, no charts; only `!cols`/`!rows`/`!merges` structural props survive.
3. Excel sheet names — 31-char cap, forbidden characters, doesn't self-validate.
4. html2canvas Timeline export — captures the live DOM node as-is; pad the output canvas, not the on-screen element.
5. `position: sticky` inside a `position: relative` ancestor — breaks silently; move the sticky element out instead.
6. Email Request draft persistence — lives in `sessionStorage`, survives a hard refresh.
7. `mailto:` bodies are plain text only — no real links/bold in the Outlook draft itself.
8. Outlook Web deeplink `body` param — breaks past ~15-20 tasks' worth of URL length (AADSTS90015).
9. Sticky/fixed inside the Email Request iframe — doesn't work natively; see the doc for the accepted trade-off.
10. `script.google.com` web apps can't be iframed cross-origin (X-Frame-Options) — "refused to connect" in Chrome; use `window.open()` instead, don't retry the iframe.
11. `public/app.js` is a generated build artifact, not the source — edit `src/app.js` and run `npm run build`, or your change gets silently overwritten (by the next build) or never deployed (if you forget to build before `firebase deploy`).
12. A class-name/wildcard immediately followed by `/` inside a `<style>` comment in `public/index.html` (e.g. `foo-*/bar`) closes the `/* */` comment early — everything after becomes raw invalid CSS, with symptoms (layout gaps, elements losing `position:fixed`) that look unrelated to the actual cause.
12. A plain `<link rel="stylesheet">` to a third-party origin (Google Fonts in `<head>`) is render-blocking — on a slow/filtered connection it can stall first paint for the whole page (measured: 44.86s LCP). Load third-party stylesheets non-blocking (the `media="print" onload="this.media='all'"` loadCSS trick) instead.
13. `admin.auth().createCustomToken()` (email OTP sign-in) needs the Cloud Functions runtime service account to hold `roles/iam.serviceAccountTokenCreator` **on itself** — a one-time console grant this repo's code can't make; missing it fails with a `PERMISSION_DENIED`/`signBlob` error that looks unrelated to auth.
14. `el.style.display = ""` restores whatever the **stylesheet** says, not "visible" — clearing an inline style on an element a CSS rule hides by default just re-hides it. Set both branches explicitly.
15. A Keycard Form attachment exists under **two** filename schemes (`Signed_CardN.pdf` and `Cubework_Keycard_Form_v2.1_<date>.pdf`) written by two unrelated paths that each dedupe only against their own name — filter/count/replace code that knows one pattern silently ships the other too (this is how a sent request went out with two Keycard Forms).
16. A `<canvas>` whose pixel buffer is sized off a zero-width box loses whatever is drawn into it, silently — sizing "lazily, at first use" isn't enough when the use is async (a restored signature's `Image.onload`); it must **retry**. A `ResizeObserver` armed inside a `display:none` subtree does *not* fire when that subtree is revealed, and `requestAnimationFrame` can be starved in a non-compositing window.
17. Truncating a data URL to a size cap yields a **corrupt** image, not a smaller one — binary payload caps must reject, not `.slice()`, or the damage only surfaces much later as a blank canvas with no error anywhere.
18. A `<canvas>` blit that passes `canvas.width`/`canvas.height` (device px) through a context already carrying `ctx.scale(dpr, dpr)` draws the image **dpr× too large and clipped** — invisible at `devicePixelRatio` 1, so it never reproduces on an ordinary monitor, and its symptom is indistinguishable from pitfall #16.
