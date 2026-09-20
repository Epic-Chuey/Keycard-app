# Huy Nguyen — Daily Standup Report Workflow

**Owner:** Huy Nguyen · IT Operations Engineer · Cubework
**Assistant nickname:** Chuey
**Purpose:** Generate a daily standup report (HTML + PDF) from Outlook email activity, plus a pre-filled email to leadership.

---

## Quick Start

Say **"It's morphing time [MM/DD/YYYY]"** — that triggers the full workflow below.

If no date is given, assume today.

---

## The Workflow (5 steps)

*(2026-08-02: the dashboard's own step nav is centered and stays pinned just below the app-switcher tabs while scrolling, matching how the Roadmap app's controls row already behaves.)*

*(2026-08-02, later the same day: on the dashboard specifically, steps 1 (Pull) and 2 (Show the checklist) below no longer have separate tabs — Huy asked for them combined since they were showing largely the same content twice. Pulling emails immediately renders the editable checklist inline in that same "1. Pull" panel.)*

*(2026-08-03: on the dashboard, step 4 (Provide the email link) below was folded into step 3's own tab too — "Open in Outlook Web" now sits right next to "Generate report", since the old standalone Email tab was mostly just repeating content already visible in the Report above it. The dashboard's step nav is now just Pull/Report/Saved (3 buttons). The numbered steps below still describe the full conceptual workflow (5 steps) that applies whether Huy's working through the dashboard or in chat — only the dashboard's own tab count changed, twice now.)*

*(2026-08-05: `standupSaves` was backfilled for every PT day from 2026-05-07 (the first day Huy ever sent a standup email) through 2026-07-31, pulled from the `Inbox > Kuan > Standup` Outlook folder rather than reconstructed via a fresh Pull. Only 10 of those 44 days (07/09, 07/20–07/24, 07/27–07/30) already used the current tag format and got real per-tag items; the other 34 predate the tag taxonomy entirely (narrative updates, priority tiers, per-site write-ups, or a bare "Attached" with no body) and were saved instead as a single `other`-tagged item summarizing that day, rather than force-fit into categories that didn't apply. Days 05/07–07/23 also had their Report/Email snapshot regenerated (Load into Checklist → Generate → Save) so "View report" shows real content instead of empty.)*

### 1. Pull emails
- Search Outlook for the target PT calendar day
- **Scope: Sent Items only, not the whole mailbox or Inbox.** *(2026-08-02: Huy found the old whole-mailbox pull "too random" — a standup is about what Huy actually sent that day, not everything that landed in his mailbox.)*
- **UTC conversion:** a PT day runs `T07:00:00Z` → next day `T07:00:00Z`
- Paginate if 25+ results are returned (use `offset`)
- **Then run a supplemental free-text search** (same Sent Items scope) for new-hire / equipment keywords, as a safety net in case the plain date filter misses something
  - *Origin: the "Angel Albornoz lesson" — a new-hire thread was filed outside the inbox and got skipped. Less applicable now that the pull is Sent-Items-only, but kept as a second pass regardless.*
- **For each pulled message, also fetch the original request it's replying to** — a sent reply's own body is often just "Thanks" plus a signature block, which says nothing about what was actually asked. This is the one exception to the Sent-Items-only scope above: a single targeted lookup by conversationId (earliest message in the thread, wherever it actually lives), not a broad pull, so it doesn't reintroduce whole-mailbox noise. *(2026-08-04: Huy noticed the pulled reply alone didn't show what the original request was.)* *(Bug found and fixed 2026-08-07: this lookup had actually been silently failing on every single call since 2026-08-04 — Microsoft Graph rejects combining a `conversationId` filter with a sort-by-date on `/me/messages` (error: "the restriction or sort order is too complex"), so the code was falling back to "no original request found" every time, quietly, the whole time. Fixed by asking Graph for the matching messages unsorted and picking the earliest one out of that list in code instead of asking Graph to sort them.)*
- **Optional "Pull with Summary" button** (dashboard only, added 2026-08-06) — sits next to the plain "Pull emails" button. Instead of just fetching the original request above, this fetches *every* message in each result's full conversation thread (initial request through the latest reply, not just the root) and summarizes the whole thread with AI into one paragraph — what the request was, what was done, what's still open. Slower than a plain pull (up to a 5-minute timeout) since it's one extra Graph call plus one AI call per unique thread. See step 2 below for how that summary shows up in the checklist. *(2026-08-07: found to have the exact same Graph bug as the original-request lookup above — every thread's message fetch was failing the same way, so the AI summarizer was never actually being reached; "0 with summaries" out of every pull. Fixed the same way, so both this and the original-request lookup should now actually populate.)*
- Re-run the pull if Huy says something is missing

### 2. Show the checklist (NEVER SKIP)
- Always present an interactive task checklist for review/approval **before** generating any report
- **Primary:** in-chat interactive widget — has a working **"Generate report ↗"** button that sends selections directly back into chat
- **Fallback:** if the widget fails twice, build a standalone HTML checklist file
  - Template: `july3_checklist.html`
  - Mobile-friendly, tap-to-edit, tag management, add-task form
  - Has **"Copy selections"** + a **"Select All & Copy"** button in the fallback textarea (for mobile clipboard issues)
  - ⚠️ A downloaded file **cannot** auto-send back to chat — Huy must paste manually. This is a hard technical limit, not a design choice.
- **Dashboard's own Pull step:** each entry shows the existing "View request"/"View original request" toggle for the full text, plus a checkbox/tag-dropdown/remove for editing. *(This checklist used to live in its own separate "Checklist" tab; merged into the same "1. Pull" panel 2026-08-02, since the two tabs were showing largely the same content.)* *(An AI-generated one-line summary used to show above the toggle too — one batched call per Pull via `summarizeStandupEntries` in `functions/index.js`, calling Vertex AI's Gemini models via the `@google/genai` SDK. Removed 2026-08-02: it turned out `gemini-2.0-flash-001` had been fully retired by Google on 2026-06-01, so the "real" summary had actually been silently falling back to a plain-truncation excerpt of the reply's own body the whole time — which just wasted row space showing "Thanks + signature" text. The backend call was removed too rather than left running for an unused value; `summarizeStandupEntries` itself is still there in case the summary line comes back.)* *(That removal only ever applied to the plain "Pull emails" button above — the AI summary came back, in a different shape, for "Pull with Summary" specifically: added 2026-08-06 as a collapsed "📝 Thread Summary" toggle next to "View original request"; refined 2026-08-07 into an always-visible textarea shown directly underneath the entry's title, which Huy can hand-edit like the title itself. An edited (or AI-generated) summary is now saved with the rest of the entry — it survives a reload or loading that day back in from Saved, the same way the title/tag/location already did. Auto-tagging a newly pulled entry now also prefers this summary over the raw subject/original-request text when one exists, since it reflects the whole thread rather than just the opening message.)*
- **Checklist sort** (2026-08-07): entries are grouped by tag first, same fixed order as the Report Formatting Rules below — but within a tag group, entries are now secondarily sorted by location, so tasks about the same address sit next to each other instead of in pull/add order. Entries with no resolvable location sort to the bottom of their tag group.

### 3. Generate the report
Filename format:
```
Huy_Nguyen_Standup_MMDDYYYY_001.html
Huy_Nguyen_Standup_MMDDYYYY_001.pdf
```

*(2026-08-05: the dashboard's Report step also has an "Export to Excel" button next to Download PDF — one sheet per tag that has any included tasks that day, plus a leading "Overview" sheet totaling tasks per category, filename `Huy_Nguyen_Standup_MMDDYYYY_V1.0.xlsx` (bumping to `V1.1`, `V1.2`, ... for additional same-day exports, same versioning as the Roadmap tab's own Excel export). The Saved tab has the same per-day export on each row, built from that day's saved snapshot instead of the live checklist.)*

### 4. Provide the email link
- Plain clickable Outlook Web deeplink (`outlook.office.com`) — Huy clicks it himself
- ❌ Do **NOT** use browser automation (`claude-in-chrome`) — that opens a separate small popup window instead of his normal browser
- **To:** `kuan.goh@cubework.com` **AND** `huy.nguyen@cubework.com` (both in To)
  - ⚠️ The `cc` parameter is unreliable on this tenant — it silently drops. Do not use a separate Cc field.
- **Subject:** `Standup - MM/DD/YYYY`
- **Body:** leads with the same Summary intro shown (and editable) in step 3's Report, then the bullet summary grouped by tag. *(2026-08-02: Huy asked for Email to "take what's in Report exist and also the edit and new changes" — reuses the exact same `standupSummaryIntroText` state the Report step's textarea edits, so the two never drift apart; there's no separate summary generation for Email anymore.)*
- *(2026-08-03: the deeplink itself no longer carries the body — a long day's report (~15-20+ tasks) made the URL long enough that Outlook's own sign-in redirect failed with "AADSTS90015: Requested query string is too long," which looks like a Microsoft account error rather than a Cubework bug. Fixed by only putting `to`/`subject` in the link and instead copying the body to the clipboard when "Open in Outlook Web" is clicked — the compose window opens with an empty body, and Huy just pastes it in with Ctrl+V. Same day, this whole step also stopped being its own dashboard tab — see the note at the top of this section.)*
- *(2026-08-08: Ctrl+V removed on a normal day. "Open in Outlook Web" now tries the full link — `to`+`subject`+`body` — and only drops back to the `to`/`subject`-only link + clipboard-paste above if that full link would be long enough to risk the same AADSTS90015 failure (a conservative length cutoff, tuned by feel rather than an exact known limit — flag it if this triggers the paste fallback more or less often than expected). Considered copying the Email Request tool's `mailto:`-wrapped deeplink instead, since it already achieves this same paste-free result for Wi-Fi/Keycard requests — decided against it because wrapping the whole thing as one `mailto:` URI double-encodes the body, which uses up the same length budget faster, not slower, than Standup's own plainer link style. On the rare day the fallback does kick in, everything behaves exactly as it did before this change.)*

### 5. Share the files
Present HTML + PDF + Excel for download so Huy can attach them to that draft and send. *(2026-08-05: Excel added alongside HTML/PDF — see the Step 3 note above.)*

*(2026-08-02: on the dashboard itself, clicking "Open in Outlook Web ↗" also saves the day's snapshot straight to the Saved tab — same `saveStandupReport` write the Report step's own Save button uses, just triggered from the email action too, so sending the email is enough to land the day in Saved without a separate trip back to Save. If Report was never generated this session, the saved snapshot's `reportHtml` is just null — only `items`/`emailSubject`/`emailBody` are guaranteed present.)*

*(2026-08-02, later the same day: each entry in the dashboard's own "Saved" tab now also has a "Delete" button, behind a confirm dialog, for removing a day's saved snapshot outright.)*

*(2026-08-05: the Saved tab gained a toolbar above the list with two more tools, both distinct from the per-day Report/Save workflow above:*
- *"Export All" — one Excel workbook covering every saved day at once: an "Overview" sheet (one row per day, newest-first, with a per-category task count) plus one sheet per tag pooling that tag's tasks across every day (each row tagged with a Date column, since a sheet now spans many days instead of one).*
- *A From/To date-range picker + "Generate Report then Open Outlook" button, for the different case of an ad-hoc "what were you doing between X and Y" request from Kuan rather than a single day's own standup. This pools every included task from every saved day in the picked range into one plain-text summary — grouped by tag, each line prefixed with its own `[MM/DD/YYYY]` since it spans multiple days — copies it to the clipboard, and opens a fresh Outlook compose window addressed the same way as step 4 above. Unlike everything else on this page, it's read-only: it never saves/overwrites anything in `standupSaves`, and it doesn't touch or navigate to the Report step's live checklist — it only ever reads what's already saved.)*

---

## Report Formatting Rules (permanent)

### Tag order — always this sequence
| Tag | Color |
|---|---|
| **Critical/Urgent** | Red (always first) |
| Helpdesk | Amber |
| Inventory | Teal |
| New Hire | Green |
| Layout | Purple |
| Follow Up | Pink/Red |
| Travel | Orange |
| Other | Gray |

All tags appear in every checklist.

### Structure
- ✅ Group and sort **by tag** — never by time period (no Morning/Afternoon/Evening)
- ✅ **Boss summary** block, placed above Critical/Urgent — auto-generated recap addressed directly to Kuan Goh (the standup's recipient, greeted by name). Two parts: (1) an intro sentence (total task count + per-tag breakdown) that's editable in a plain textarea after Generate — seeded fresh each time Generate is pressed, then left alone until the next Generate, with every edit updating the live preview and whatever Download/Print/Save then use; (2) a **colored per-tag itemized breakdown** underneath, same tag colors/order as the report's own sections below, always freshly derived from the checklist (step 2 above — on the dashboard specifically, that checklist now lives inside the "1. Pull" panel) rather than freeform-edited, so editing a task there shows up here automatically and the colored structure can never get lost to a stray edit. *(2026-08-02: supersedes the old "No Day Summary" rule below — Huy asked for this back, then asked for full detail addressed to Kuan specifically, then asked to edit it after generating, then asked to keep the colored structure — which is why it's now split into an editable intro + a fixed, always-live colored breakdown instead of one freeform block.)*
- *(2026-08-03: the editable intro sentence also gets an auto-built location breakdown appended below it — "Cali Issues:" and "Outside Cali Issues:" sections listing each included task, matching exactly what Huy used to type by hand every day. Detected by matching each task's bullet text against the shared address catalog (`window.CUBEWORK_LOCATIONS`, `public/locations.js`) with a loose fuzzy match - ticket subjects rarely spell an address exactly like the catalog - requiring the street number plus at least one more word to line up before it counts. A task whose location can't be confidently determined (a client name, a vague subject, or a real address that just isn't in the catalog yet) is left out of this breakdown entirely rather than guessed into the wrong bucket - it's still fully present in the tag-grouped sections below. Same as the count sentence, this is just the auto-seeded starting point - freely editable afterward.)*
- *(2026-08-03, immediate follow-up: Huy asked to be asked before anything actually gets added to the catalog, rather than it happening silently in the background. So every time Generate runs, any included task that looks address-like (has a number in it) but still didn't match gets flagged in a small prompt right in the Report step, with a California / Outside California / "not a location" choice. Confirming one writes it to a small Firestore collection that only this detector reads - `public/locations.js` itself stays a static file, unaffected - so it's recognized on every future report, not just today's, without needing a code deploy each time. Not every unmatched task gets asked about, only ones that look like they have an address in them (a bare client name or vague subject is never flagged).)*
- ❌ **No** Carry Forward / Next Actions section — removed permanently
- ❌ **No** Excalidraw output — HTML and PDF only

### PDF page breaks
Apply to **every** card and **every** tag-section (header + divider + all cards inside):
```css
page-break-inside: avoid;
break-inside: avoid;
```
Also glue tag headers to their content:
```css
.tag-header { page-break-after: avoid; break-after: avoid; }
```
No card or section should ever be cut mid-way across a page boundary — push the whole block to the next page.

> Note: applying `page-break-inside:avoid` to a whole `.tag-section` forces the *entire* section to one page. If a section is long, apply it only to individual `.card` elements so overflow cards move down naturally.

> *(2026-08-04: the dashboard's own "Download PDF" button is a one-click rasterized export (html2canvas + jsPDF), not a real browser print, so this page-break CSS doesn't do anything for it — html2canvas has no concept of CSS pagination. That button instead measures each `.card`/`.tag-header`/`.boss-summary` block's actual pixel position and only cuts a new page between blocks, reimplementing the same "never split a block" rule in JS. The CSS above still matters for the separate "Download HTML" file if it's ever printed manually.)*

### Onsite deployment reports (e.g. Austin build)
- Format as **Critical/Urgent mega-cards**
- Sub-blocks for **"Huy's Tasks"** / **"Logan's Tasks"** (use `.person-label`)
- Monospace `.chain` formatting for installation sequences
  - e.g. `Camera Drop → Junction Box → Connector → ½" Conduit → Connector → Junction Box → Camera`
- Color-coded HTML summary tables (`st-done` green / `st-wait` amber / `st-prog` blue / `st-sched` gray / `st-warn` red)
- Blue **Key Accomplishments** block
- **Shoutout blocks** for notable remote or onsite contributors

### Chat recaps
Bullet points grouped by tag — **not** paragraph prose.

---

## PDF Generation Pipeline

```bash
sed 's/⚠/!/g; s/✓/v/g; s/📍//g' report.html \
  | perl -CSD -pe 's/[\x{1F000}-\x{1FAFF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}\x{FE0F}\x{200D}]//g' \
  > /tmp/clean.html

python3 -c "
from weasyprint import HTML
HTML('/tmp/clean.html').write_pdf('report.pdf')"
```

Verify page starts afterward:
```python
from pypdf import PdfReader
r = PdfReader('report.pdf')
for i, p in enumerate(r.pages):
    print(f'Page {i+1}:', p.extract_text()[:60])
```

If `weasyprint` is missing:
```bash
pip install weasyprint pypdf --break-system-packages
```

---

## Key Colleagues

| Name | Role |
|---|---|
| **Kuan Goh** | Approvals / escalations (standup recipient) |
| **Logan Boudreaux** | Onsite deployment partner |
| **Alfredo Duran** ("The Heavy") | Onsite facilities support |
| **Casey Weber** | Lead Project Coordinator |
| **Jose Ortiz** | Stimson project / field IT |
| **Jerimar Castaneda** | UNIS/item.com network team |
| **David Rodriguez** | UNIS/item.com network team |
| **William Shih / Kent Ho** | LT Security — hardware, RMA |
| **Mesrop Niyazyan** | Facility Manager |
| **Debbie Bernal** | Austin Property Associate |
| **Erik Solis** | ICC Telcom |
| **Justin Cho** | Remote IT support |
| **Danny Paredes** | Banana Fontana site |
| **Marcus Rey Falealili** | Kent WA site |

---

## Tools & Systems

- **Microsoft 365 / Outlook** — email pulls (`afterDateTime` / `beforeDateTime` in UTC)
- **UniFi** — camera/network management (`app.cubework.com`)
- **HikCentral** — legacy camera system
- **Yardi** — work orders
- **Assettiger** — asset tracking
- **Navan** — corporate card
- **WeasyPrint + pypdf** — PDF generation/verification

---

## Known Limitations

| Issue | Reality |
|---|---|
| Widget "Generate" button in downloaded files | Impossible — a downloaded file has no channel back into chat |
| Outlook `cc=` parameter | Unreliable on this tenant; put both addresses in To |
| Browser automation window | Always opens a separate small MCP popup; can't be redirected to the default browser |
| Clipboard auto-copy on mobile | Often blocked for local files; the "Select All & Copy" fallback button handles it |
| Interactive widget outages | Intermittent 400 errors, server-side; retry, then fall back to file |

---

## Memory & Continuity

- Rules are stored in assistant memory and persist across chats
- **Memory is scoped per Project** — start new chats *inside this same Project*
- Long threads burn usage faster (full history is re-read each message) → **start a fresh chat each day**
- Deleted conversations have their derived memory removed nightly
- Incognito chats are not saved

---

*Last updated: August 7, 2026 (Graph "original request"/thread-summary lookup bug fix)*
