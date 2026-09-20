# Keycard "Activate" Step-by-Step Guide — implemented specification (2026-08-29)

> Scope: **CW Email Request → Keycard → Activate → Step-by-Step Guide**.
> Feature doc: [keycard-activate-guide.md](keycard-activate-guide.md) · Tab doc: [email-request-attachments-embed-tab.md](email-request-attachments-embed-tab.md)
> Everything lives in one self-contained `<style>`/`<script>` block at the end of `public/index.html` (currently lines ~9851–10875). No other file changed.

This replaces the 2026-08-28 auto-advancing walkthrough. The guide is now an **interactive popup** with its own `Back` / `Next` / `Step X of 23` chrome. The old static bottom instruction line inside the tooltip (`.era-guide-hint`, "Click outside this step to continue.") and the click-outside-to-advance mechanic are both gone.

---

## Hard rules

| Rule | How it is enforced |
|---|---|
| **Never auto-advance** | `goNext()` is called from exactly one place — `activateNext()`, which both the `Next` button's click handler and the `Enter` key handler go through (see below). Nothing else in the file calls it. Filling a field, ticking a checkbox, a signature or Photo ID arriving, Save, the Preview modal populating, **and adding a keycard** all run through `refresh()`, which only ever **enables/disables `Next`**. |
| **`Enter` is the `Next` button, nothing more** | A capturing `keydown` listener, live only while the guide is running, calls the same `activateNext()` — same gate, same validation, same disabled/hidden checks, so it can never advance anywhere a click couldn't. It always `preventDefault()`s, so the key can't reach anything else. It stands down entirely where `Enter` already means something: the Send confirmation and the chooser, `textarea`s and the Preview body's `contentEditable`, a Preview recipient add-input **that has an address typed in it** (an empty one falls through to `Next`, since step 22 auto-focuses that very input), buttons/links, and the guide's own tooltip. |
| **Never create a card** | The guide has no card-creation path. `+ Add another keycard` is the form's own button running the form's own `j()`; the guide only listens for the click and enrolls whatever card appeared. |
| `Next` moves exactly one step | `stepIndex++`, then `renderStep()`. |
| `Exit` never moves a step | Step 21's Save & Leave branch only. It clicks the form's own `#era_k_saveBtn` and parks the tour where it stands; it does not call `goNext()`. |
| `Back` moves exactly one step | `stepIndex--`, then `renderStep()`. |
| `Back` disabled only on step 1 | `elBack.disabled = stepIndex === 0`. |
| Required fields control `Next` | Each step's `gate(ctx)` reads the **real** control's own state. A step with no `gate` is optional and `Next` stays live. |
| Optional fields never block | No `gate` ⇒ `canAdvance()` returns `true`. |
| Data is preserved | The guide never clears or resets a field. The only writes it makes are the ones the user explicitly requests by clicking a choice inside a step's popup, and those go through the real control plus a real `input`+`change` event so the app's own handlers/validation run normally. Guide position and popup answers live in a `WeakMap` keyed by the real `.era-entry-block`. |
| Existing values detected on entry | `renderStep()` calls `refresh(true)` immediately, so a step that is already satisfied (e.g. Access Level's default **Standard**) opens with `Next` live. |

---

## The 23 steps (26 stops — step 22 has 22-1 / 22-2 / 22-3; plus 16-1 per added card; plus a Step 2 ↔ Step 2-1 round trip per added location)

Every stop targets a real, already-existing Keycard element. Nothing is duplicated.

| # | Title | Target | Required to unlock `Next` |
|---|---|---|---|
| 1 | Location(s) | `#era_location` | Non-empty |
| 2 | + Add location | `#era_addLocationBtn` | — optional |
| 3 | Your email | `#era_requesterEmailLocal` | Valid email (a bare local part is accepted — the form appends `@cubework.com` itself) |
| 4 | Licensee Company Name | `#era_k_licenseeCompanyName` | Non-empty. Yardi Deal#/Account#, Floor #, Unit # in the same card are **not** gated |
| 5 | SERVES — Cubework / Unis | `#era_k_servesCard > .era-checks` | ≥1 checked. **Popup:** single-select (picking one clears the other) |
| 6 | SERVES — HikCentral / Unifi | `#era_k_body > .era-checks` | ≥1 checked. **Popup:** independent toggles |
| 7 | Tenant Name | `.era-k-tenantName` | First **and** last name (`/\S+\s+\S+/`) |
| 8 | Keycard Number | `.era-k-keycard` | Exactly 10 digits (`/^\d{10}$/`) |
| 9 | Access Level | `.era-k-accessLevel-wrap` | ≥1 checked. **Popup:** the four existing checkboxes (Standard / WH Only / Office Only / Other) |
| 10 | Tenant Email | `.era-k-email` | Valid email. **Popup:** every distinct tenant / e-signature email already on this request, click to reuse |
| 11 | Phone | `.era-k-phone` | 10 digits (the field's own `000-000-0000` formatter is untouched) |
| 12 | Fee | `.era-k-fee-row` | An explicit **Yes / No**. **Popup:** Yes ticks `.era-k-fee`, No clears it |
| 13 | Dates | the `.era-row2` holding `.era-k-dateIssued` | Date Issued non-empty. **Date Returned stays optional** |
| 14 | E-Signature | the `.era-k-signid-esign` label | Checkbox checked. **Popup:** one action that checks it. **Not in the walk at all** for a card covered by an earlier card's signature under the same-tenant-email rule (2026-08-30) — see below |
| 15 | Signature Workflow | decision buttons → wait status → e-sign row → sign/ID wrap (first visible) | See below |
| 16 | Additional Keycard | `#era_k_addEntryBtn` | Optional, with a conditional hold — see below |
| 17 | Staff Name | `#era_k_issuedBy_name` | Non-empty |
| 18 | Staff Date | `#era_k_issuedBy_date` | Non-empty |
| 19 | Staff Signature | `#era_k_issuedBy_canvas` | Ink captured (polls `#era_k_issuedBy_inkStatus` for the ✅ it already prints) |
| 20 | Attachments | `#era_k_attachCard` | — optional (view / delete only) |
| 21 | Save / Preview | the row holding `#era_k_saveBtn` + `#era_submitBtn` | Preview modal actually open — **or `Exit` replaces `Next` entirely** while a walked card still has no signature + Photo ID (see below) |
| 22 | Preview Email — Recipients | the `To:` `.era-preview-recip-row` | — review only |
| 22-1 | Preview Email — Subject | `#era_previewSubject`'s row | — review only |
| 22-2 | Preview Email — Attachments | `#era_previewKformSection`, falling back to `#era_previewBody` | Clicking **View** on the **Signed Keycard Form** row runs a per-card verification sub-flow (every card's Tenant Signature in turn → Staff Signature → manual Close) — see below; `Next` stays locked until it completes |
| 22-3 | Preview Email — Body | `#era_previewBody` | — review only |
| 23 | Final Actions | the row holding `#era_previewFormatBtn` / `#era_previewEditBtn` / `#era_previewSaveBtn` / `#era_previewSendBtn` | — `Next` reads **Finish** and ends the tour |

The progress line reads `Step 1 of 23` … `Step 22 of 23`, `Step 22-1 of 23`, `Step 22-2 of 23`, `Step 22-3 of 23`, `Step 23 of 23` — plus `Step 16-1 of 23` once a second card is added (see below).

### `FLOW` — what `Back` / `Next` actually walk

`STEPS` above is the definition table; `stepIndex` indexes a separate `FLOW` array built from it:

| Segment | Steps | How many times |
|---|---|---|
| Request head | 1 – 6 (with a `2-1` / "Step 2 again" pair per added location inserted right after 2) | once |
| Card block (`16-1` intro for cards 2+, then 7 – 16, **minus 14** for a same-tenant-email card) | 7 – 16 | **once per card in the tour** |
| Request tail | 17 – 23 | once |

`FLOW` is rebuilt (`rebuildFlow()`) whenever the set of cards, the set of extra location rows, **or the set of cards whose step 14 is skipped** changes. The rebuild re-finds the stop staff is standing on by `(step key, entry element)` and keeps `stepIndex` on it, so the visible step never changes without a `Back`/`Next` click. If that stop's card (or location row) is gone, it walks **backwards** to the nearest surviving earlier stop — recovery only, never a forward move.

| Extra stop | Title | Target | Required to unlock `Next` |
|---|---|---|---|
| 16-1 | Next keycard | that card's `.era-k-action-wrap` | — optional |
| 2-1 | Location #(N+1) | that row's `.era-extra-location` input | — optional |
| *(none — reuses "2")* | + Add location, shown again | `#era_addLocationBtn` | — optional |

For each extra-location row, `buildFlow()` pushes **two** entries right after step 2: `locationStepAt(idx)` (always labeled `2-1`, title/target pointing at that row) and `addLocationReturnStepAt(idx)` — a second, distinct-keyed copy of step 2's own title/body/target, so staff sees an identical "Step 2: + Add location" again. `Next` walks the whole chain in order: `2 → 2-1 (row 1) → 2 → 2-1 (row 2) → 2 → … → 3`. Nothing skips ahead — adding a row while sitting on any of these stops just appends one more `2-1`/`2` pair after the current position.

---

## Conditional behavior

### Step 2 — "+ Add location", and the Step 2 ↔ Step 2-1 round trip (2026-08-29, revised same day)

Optional by default. Clicking the form's own **+ Add location**:

1. runs the form's own `eraAddLocationRow()` — the guide creates no row itself, and every row (including earlier ones) is re-rendered by `eraRenderExtraLocationRows()` as a side effect, which is why the location step's `target` is always re-queried by index rather than a captured element;
2. rebuilds `FLOW` so a `2-1` stop (that row, via `locationStepAt()`) followed by a fresh copy of step 2 itself (`addLocationReturnStepAt()` — identical title/body/target, its own FLOW key) slots in right after the current position;
3. **leaves the visible step exactly where it is** — Next is still the only thing that walks forward.

`Next` from step 2 walks into `2-1` (that row); `Next` from `2-1` **returns to step 2**, not onward to step 3 or to another `2-1`. From that re-shown step 2, staff can either click **+ Add location** again — which repeats the same `2-1 → 2` pair for the new row — or click `Next` directly to move on to step 3 (Your email) once there is no next row already queued up. Clicking **Remove this location** drops that row's stop from the flow and falls **back** to the nearest surviving earlier stop, same recovery rule as removing a keycard. The originally-reported sequence (Location #2 → Location #3 → Location #4 → …) still happens across repeated add/click-through cycles — it just always passes back through step 2 in between, rather than chaining `2-1`, `2-2`, `2-3` directly.

Steps 1 and 3 – 23 never repeat for this. Nothing already entered is read, cleared, or rewritten — each `2-N` stop only highlights the corresponding row's own input.

### Step 14 — E-Signature, skipped for a same-tenant-email card (2026-08-30)

**Same tenant email as an earlier card in this tour** whose own
`eraSignIdIsSatisfied()` is already true (`reusedFromEntry()`, the identical
predicate step 15/16/21 have always used, reading the real `.era-k-email`
inputs live) ⇒ that card's step 14 is **not in `FLOW` at all**. `Next` walks
`13 → 15`, and the progress line never shows `Step 14` for it. **Different
tenant email** ⇒ step 14 is exactly what it always was, and that card runs the
full separate e-signature flow.

Two consequences worth knowing:

- **The skip re-evaluates live, but never moves the visible step.** It hangs off
  a value staff types at step 10, so a skip-set key (`esignSkipKey()`) rides the
  same deferred `input`/`change`/`click` sweep as gate re-evaluation and triggers
  `rebuildFlow()` when it moves. If reuse turns on while step 14 is *on screen*
  — the donor's Photo ID landing is enough — that stop is deliberately **kept**
  (`flowCurrentStop`, set by `rebuildFlow()` only). To stop it becoming a dead
  end, step 14's `gate()` also passes when `reusedFrom()` holds, reading *"Same
  tenant email as Card N — this step is no longer needed for this card. Click
  Next."*; the step drops out for real once the guide walks off it.
- **The donor's signature is actually put on the reusing card.** Skipping step 14
  without this would re-create the bug fixed on 2026-08-29 one layer up:
  `buildKeycardFormPdfInputsFromHistory()` maps `signIdSignatures[n] →
  card{n}_signature`, so a card with nothing in its own slot goes out with a
  blank Signature field on the Keycard Form PDF. `stampReuseSignature()` hands
  the ink over through the card's **own**
  `eraSignIdRestore({signatureDataUrl, persist: true})` — the same entry point
  Submission > Edit uses — so it is painted on that card's canvas, attached as
  its own `Signature_CardN.png`, and persisted into its own `signIdSignatures`
  slot. It runs only for a card the tour has already **reached step 15** on (a
  half-typed email that momentarily matches can never stamp anything), only onto
  a card with **no ink of its own**, and at most once per card. The Photo ID is
  not copied — same as on the Edit path, one physical ID document covers both
  cards and `photoIds` is owned by `submitSignatureRequest`/`uploadKeycardPhotoId`.

  A live session has no saved copy of the ink (the only copy is the donor's
  canvas, private to `eraWireKeycardSignId()`'s closure), so
  `eraSignIdHasInk()` and `eraSignIdGetSignatureDataUrl()` were exposed on the
  entry alongside the existing `eraSignIdIsSatisfied` /
  `eraSignIdGetPhotoFilename`. The export is composited onto opaque white, same
  as `syncSignature()`'s, and falls back to the parked
  decoded-but-not-yet-drawable image so a donor with no layout box can still
  donate.

**Known limitation:** editing a card's tenant email *after* the stamp does not
withdraw the donated signature — the guide never clears a field. The normal path
self-corrects (step 14 returns to the walk; a completed remote e-signature
paints over the donated ink), but a card whose email is edited late and is never
re-signed keeps the earlier tenant's signature. `eraKeycardReuseDonors()` on the
Edit path has the same exposure and predates this.

### Step 15 — Signature Workflow

The popup offers exactly the two real buttons the app already shows once **Send for E-Signature** has gone out:

- **Save & Leave** — *"Tenant is not present and will sign / upload Photo ID later."* → clicks the real `.era-k-signid-saveLeaveBtn`; `Next` unlocks immediately.
- **Wait for Signature Now** — *"Tenant is present and ready to sign / upload Photo ID using Phone or Laptop. Phone is recommended — it is easier."* → clicks the real `.era-k-signid-waitBtn`; `Next` stays locked with *"Waiting on the tenant — Next unlocks once the signature and Photo ID have both come in."* until the entry's own `eraSignIdIsSatisfied()` (`hasInk && photoIdFilename`, the app's existing predicate) returns true.

Until the decision panel is actually visible, both options render disabled with the note *"Send the E-Signature request first — these unlock once it goes out."* Signature/Photo ID arriving **enables** `Next`; it never clicks it.

### Step 16 — Additional Keycard, and repeating the card steps

Optional by default, and the loop hinge. Clicking the form's own **+ Add another keycard**:

1. runs the form's own `j()` — the guide creates nothing;
2. enrolls the card that appeared into the tour's `cards` list (anything in `baseEntries`, i.e. present before the tour, is ignored);
3. rebuilds `FLOW` so that card's own block (`16-1`, then 7 – 16) sits after the current stop;
4. **leaves the visible step exactly where it is** and adds a note: *"Card N is added and waiting — click Next to walk through its card steps. Everything already entered is kept."*

`Next` then opens stop **`16-1`**, which highlights the guide's **existing** `Back` button (`.era-guide-back-hi`, a blue pulse — no new navigation control was introduced) and explains that Back returns to the previous card. `Next` from there begins that card's step 7. Card 3, 4, … repeat the same way, for as long as staff keeps adding; staff stops simply by not adding another and clicking `Next` at step 16 to reach step 17.

Steps 1 – 6 and 17 – 23 never repeat. Nothing already entered — on the request or on any earlier card — is read, cleared, or rewritten.

**Which card is active** is shown by a `Card N` badge in the tooltip header, read straight off the form's own `.era-k-entry-num` (so it follows the form's renumbering after a removal). The badge is hidden while the tour is walking a single card.

**Same-email / different-email signature rule**, now applied to every card the guide walks (`reusedFrom()`):

- **Same tenant email** as an earlier card in this tour whose `eraSignIdIsSatisfied()` is already true → that card's signature + Photo ID cover this one. **Step 14 is skipped outright and that card's signature is stamped onto this one** (2026-08-30, see above). Step 15's `Next` stays live, with a note naming the card being reused and a matching popup header.
- **Different tenant email** → identical to card 1: an explicit Save & Leave / Wait for Signature Now choice, and under "Wait", `Next` holds until this card's own `eraSignIdIsSatisfied()` is true.

Step 16's own gate (`pendingNewCards()`) is the remaining safety net: it holds `Next` for an Activate card that appeared during the tour but was **never enrolled** in it (so the guide never walks its steps) and whose tenant email matches no guided card's. A card added with `+ Add another keycard` is enrolled and handled by its own steps instead.

**Edge cases handled**

- **Adding from a request-tail step** (e.g. scrolling up from Staff Name): the card is enrolled, the visible step still doesn't move, and the note reads *"Card N was added behind this step — use Back to walk through its card steps."* It clears the moment that card is rendered.
- **Removing a card mid-tour**: dropped from `cards`, `FLOW` rebuilt, staff stays on the same stop; if the removed card *was* the stop, the tour falls back to the nearest surviving earlier one. Removing the entry the tour started on ends the tour (that entry owns the Resume button).
- **Fee / Signature-Workflow answers are already per card** — `guideStateFor(entryEl).answers` is keyed by the real entry, and `ctx.entryEl` is whichever card the current stop belongs to.
- **Step 21's Save & Leave note** lists every walked card still missing its signature + Photo ID, not just the first.

### Step 21 — Save / Preview, and the `Exit` branch

`Next` unlocks when `#era_previewModal` is actually open — **unless** a walked Activate card still has no signature + Photo ID, in which case there is nothing to go forward to at all: `Le()` refuses to build a preview for an Activate request with no attachments, and the signature/Photo ID are what put attachments there. That is a genuine constraint of the existing form, not one the guide adds. So in that state:

- **`Next` stands down and `Exit` takes its place** (`.era-guide-exit`, hidden on every other step).
- The form's **own Preview button** (`#era_submitBtn`) is held out of reach with a guide-owned class, `.era-guide-preview-hidden`. `eraGuideEnd()` clears it unconditionally, so a parked or finished tour can never leave the button hidden. The button's markup, handler and validation are untouched.
- **`Exit`** clicks the form's own `#era_k_saveBtn` and parks the tour on step 21. It is **not** a forward move — `goNext()` is untouched, so the guide still advances from exactly one place.
- The tooltip reads *"Preview is unavailable until the tenant's signature and Photo ID are in — click **Exit** to Save and leave the guide"*, followed by the list of cards still waiting.

**The condition is read live, never remembered.** `signIdPendingCards()` walks `tourCards()` and asks each one's own `eraSignIdIsSatisfied()` (the app's `hasInk && photoIdFilename`); a card covered by another walked card with the same tenant email counts as satisfied, same as step 16's reuse rule. Two consequences:

1. When the signature and Photo ID land while staff is standing on step 21, `Next` comes back and `Exit` goes away **without the step advancing** — the same "arriving data only unlocks, never clicks" rule as step 15.
2. It is still correct after **Submission > Edit** has rebuilt the entries, when the guide's own step-15 answer no longer exists. That is exactly when it matters most — see below.

### Step 22-2 — View signature-verification sub-flow (2026-08-29, corrected same day, made per-card later the same day)

Clicking **View** on the merged **Signed Keycard Form** row (the one row that carries every card's Tenant signature and the Staff signature) while the tour is actually standing on step 22-2 opens a mini walkthrough scoped to that lightbox, on top of the guide's own scrim/spotlight/arrow/tooltip. **The stops are built from the cards actually in that PDF** — one per card, then staff, then the wait on Close:

1. …*n*. **Card *N* Tenant Signature**, one stop per card the PDF carries, in order. Each one scrolls the lightbox to that card's row and outlines its own `cardN_signature` box. (`Back` from the second card onwards.)
2. **Staff Signature** — scrolls to the **Issued By** block at the foot of the form and outlines *Cubework, Authorized Staff - Signature* (`staff_signature`).
3. After that `Next`, the arrow parks on the lightbox's own **Close** and waits — nothing auto-clicks it, and `Next` is hidden on this stop so neither a click nor `Enter` can finish it for staff.

The progress line counts the real verifications only: `Verifying signatures — step 2 of 3` for a two-card request (2 cards + staff), `… of 4` for three cards, `… of 2` for one — a single-card request behaves exactly as the original two-stop flow did.

Step 22-2's `Next` stays locked (a `gate` was added — it had none before) until Close is actually clicked on the final stop. Closing the lightbox part-way through (its own Close, or Preview's Cancel) drops back to step 22-2 with `Next` **still locked**, so verification has to be run again from the top. Any other View (a different row, a different step, or the tour not running) is untouched and still opens the plain `<iframe>` viewer.

**How the card count is read.** Out of the PDF itself, not guessed from the form. `pdf.js`'s `page.getTextContent()` is matched against the template's own per-card text-field rects (`cardN_name` / `cardN_keycard_number` / `cardN_email` / `cardN_phone`, `N` = 1…7): once `pdf-lib`'s `form.flatten()` has run, a filled row's values are ordinary page text sitting inside those boxes, and an unused row draws nothing at all — so a card is "in this PDF" exactly when one of its own boxes contains a non-empty text run. The rects come from `window.eraGetKeycardTemplateFieldRects()`, a new unfiltered sibling of the existing `eraGetKeycardTemplateSignatureRects()` bridge (both are now views of one cached read of the blank template, so it is still parsed once and the signature-only bridge returns exactly what it always did). If the text lookup comes back empty — an unexpected template, or a PDF with no text layer — it falls back to the card blocks the form itself is showing, so verification still walks every card rather than silently dropping back to "Card 1 only".

The spotlight outlines the REAL AcroForm field rects read straight off the actual PDF (a pdf.js canvas render, `viewport.convertToViewportRectangle()`, then the same `placeOverlay()` the main tour uses) — not an approximated position; measured against an independently computed field box it lands within 0.25 px. If `staff_signature`'s rect can't be found at all, verification is skipped outright (Next unlocks, nothing is faked). Full detail in [that day's log entry](log/2026-08-29-keycard-view-signature-verify-and-step23-formatting.md) and [the per-card follow-up](log/2026-08-29-keycard-per-card-verify-cc-and-enter-key.md).

### Resuming on step 21 after Submission > Edit

`guideState` is a `WeakMap` keyed by the real `.era-entry-block`, so it dies with the entry — and Edit rebuilds every entry, possibly days later in a different session. The one fact that has to outlive that is *"this request was left on step 21 waiting for the tenant"*, so it is written against the request's own id instead:

- `Exit` writes `localStorage["eraGuideResumeAt:<requestId>"] = "savePreview"` (request id via `window.getCwEmailRequestKeycardRequestId()`).
- `window.eraEditKeycardHistoryEntry` is **wrapped**, not replaced: the original runs first and unchanged, then the marker is consumed and the tour reopens on **step 21** for that request's first Activate card. Every Activate card is enrolled in `cards`, so a multi-card request is checked in full. The entries are polled for, because Edit re-fetches ink and Photo ID asynchronously.
- Nothing else is persisted. Signature/Photo ID state is re-read from the restored form, so the live check above decides what step 21 shows: **both present → `Next`** (still gated on the Preview modal, still needing a manual click to reach step 22); **either missing → `Exit` stays and Preview stays hidden**.

Opening the tour at its parked step is what ✕ → Resume already did — it is not an advance.

### Step 23 — Final Actions and the Send confirmation

- **Edit** (`#era_previewFormatBtn`) — toggles in-place body editing. Does not advance.
- **Cancel** (`#era_previewEditBtn`) — closes Preview; the guide parks itself back on **step 21** so it lands on the main form.
- **Save** (`#era_previewSaveBtn`) — saves again. Does not advance.
- **Send** (`#era_previewSendBtn`) — a document-level **capturing** listener, live only while the guide is on step 23, holds the click and shows:

  > **Are you sure everything is correct and exactly the way you want it? This will SEND the email.**

  - **Yes** → the guide finishes and re-dispatches *the same click*, which reaches the app's own unmodified Send handler.
  - **No** → the confirmation closes and the guide returns to **step 22** (Preview Email); the modal stays open.

  With the guide inactive, or on any other step, Send behaves exactly as it always did.

The step-23 body ends with *"Tip: hover over each button for its tooltip."* — and the guide sets a `title` on each of the four buttons **only if one isn't already there**, so the reminder is true.

---

## Chooser, Resume, and exit

- **Trigger** (unchanged): any `.era-k-action-select` transitioning *into* `activate`, via the per-entry select or the Keycard tab dropdown's quick-pick, shows the two-button chooser. **"Manually (I am a professional)"** and a backdrop click still do nothing but close it.
- **Resume** (`.era-k-resume-guide-btn`, per entry): returns to the **exact** step the tour was parked on. The 2026-08-28 "skip forward over steps already completed by hand" behavior was **removed** — silently jumping ahead is a form of auto-advance. The only adjustment left is walking **back** to the nearest earlier step whose target is on screen (the classic case: the Preview modal was closed meanwhile).
- **✕** parks the tour (Resume picks it up); reaching step 23's **Finish**, or sending, completes it and relabels the button **"Restart Step-by-Step Guide"**. Restart replays from step 1 with every value intact.

---

## Implementation notes

- **One tooltip, one popup.** The tooltip *is* the popup: title + ✕, scrollable body, per-step choice list, a blocked/info strip, and the `Back · Step X of 23 · Next` footer. Scrim, spotlight ring and arrow stay `pointer-events:none`, so the real form underneath is always clickable and the guide can never swallow a click meant for the app.
- **`gate()` reads, popups write only on request.** Every gate is a pure read of the real control. Popup choices call `checkboxSet()` / `inputSet()`, which set the value **and** fire real `input`+`change` events, then let the app's own listeners react — the guide re-implements no validation and no business logic.
- **`reposition()` is separate from the rAF loop.** Positioning runs from the animation frame loop *and* from `scroll`, `resize`, and the deferred `input`/`change`/`click` handler. `requestAnimationFrame` is throttled — sometimes to a dead stop — whenever the page isn't being composited, so the rAF loop alone is not a dependable clock. Gate re-evaluation rides the same event path for the same reason.
- **Multi-element spotlight.** `target()` may return an array; the spotlight/tooltip use the union rect.
- **Graceful abort with grace.** A target that vanishes is tolerated for ~90 frames before the tour parks itself, so a card re-render mid-step doesn't end the guide.
- **Per-entry state.** `WeakMap<entryEl, {mode, step, completed, answers, baseEntries, cards}>` — dies with the entry, needs no cleanup, and lets two entries each hold their own resume point. Tour-level fields live on `ctx.rootEl` (the entry the tour started on); `answers` is read off `ctx.entryEl` (the card the current stop belongs to), which is what makes per-card Fee/workflow answers work with no extra store. `answers` holds only guide-local choices — never form data, which stays in the real controls.
- **The guide owns no card numbering.** `cardNumberOf()` parses the form's own `.era-k-entry-num`, which `le()` already keeps in sync on every add/remove. Nothing is mirrored, so a removal renumbers the badge for free.

## Interpretation notes

Two lines of the spec did not map 1:1 onto today's DOM; these are the readings implemented:

1. **"Remove old bottom instructions."** There is no static instruction list at the bottom of the Keycard form — the only bottom instruction line in scope was the guide tooltip's own `.era-guide-hint` ("Click outside this step to continue."), which existed purely to explain the old auto-advance mechanic. It and its CSS are gone. The Attachments card's `era-note` / `era-hint` copy is real form guidance, not guide chrome, and was left alone.
2. **Step 5 "Cubework OR Unis" vs step 6 "HikCentral and/or Unifi."** The underlying controls are plain checkboxes in both cases. The popups honor the distinction (5 is single-select, 6 is independent), but both `gate()`s only require **at least one** checked, so a value set by hand outside the guide is never rejected.

## Testing

No test runner exists in this repo. Verified by:

1. `node --check` on the extracted guide `<script>` block.
2. The **real** `public/index.html` served on `http://localhost:5173` and driven from the browser, covering: the chooser (both buttons); every one of the 26 stops in order; each required gate rejecting a bad value and unlocking on a good one (location, email, licensee, both SERVES groups, tenant name, 10-digit keycard, access level, tenant email, 10-digit phone, fee Yes/No, date issued, e-signature, staff name/date/signature, preview open); optional steps leaving `Next` live; `Back` disabled on step 1 and moving exactly one step everywhere else (including across 22 → 22-1 → 22-2 → 22-3 → 23); every popup driving the real control; step 15 both branches, including `Next` staying locked through "Wait for Signature Now" and unlocking — **without advancing** — when the signature + Photo ID predicate flips; step 16 same-email reuse vs different-email hold; the step-21 Save & Leave note; Edit and Save not advancing; Cancel parking on step 21; the Send confirmation holding the click, "No" returning to step 22, and "Yes" passing the very same click to the app's own handler (verified with a probe listener and a stubbed callable — nothing was sent); Finish ending the tour; ✕ → Resume returning to the exact step with data intact; Resume walking back when the Preview modal was closed; Restart replaying from step 1; and "Manually" doing nothing. No guide-related console output at any point.
3. Tooltip/popup/confirmation CSS checked visually in a throwaway harness (not committed).

### Multi-card pass (2026-08-29, "Add another Keycard")

Same method — real `public/index.html` on `http://localhost:5173`, driven from the browser, with each card's `eraSignIdIsSatisfied()` stubbed to flip the signature/Photo ID predicate on demand. Confirmed:

- Card 1 walked 1 → 16 normally; badge hidden throughout (single card).
- **+ Add another keycard** at step 16: card count 1 → 2, guide **still on step 16**, badge appears (`Card 1`), note names Card 2, all of card 1's values unchanged.
- `Next` → `Step 16-1 of 23`, badge `Card 2`, `Back` carrying `era-guide-back-hi` (computed `animation-name: eraGuideBackPulse`, blue border/background), spotlight inline geometry exactly on card 2's `.era-k-action-wrap`.
- `Next` → `Step 7 of 23`, badge `Card 2`, `Next` **locked** on the empty name, spotlight on card 2's own `.era-k-tenantName`, Back highlight cleared.
- `Back` ×3 / `Next` ×3 across the card boundary: exactly one stop each, badge and Back highlight tracking correctly (`16-1 → 16 (Card 1) → 15 (Card 1) → 16 → 16-1 → 7 (Card 2)`).
- Card 2 with a **different** email: repeated 7 – 15, its own Fee answer required again, `Next` held at 15 until a workflow choice; "Wait for Signature Now" held with the waiting message, and flipping the signature predicate **unlocked `Next` without advancing** (still step 15).
- Card 3 with the **same** email as card 2: `Next` live at step 15 with *"Same tenant email as Card 2 — that card's signature and Photo ID already cover this tenant"* and the matching popup header.
- Staff stopping: `Next` at card 3's step 16 → step 17; steps 17 – 23 ran once, badge hidden on all of them.
- Step 21's note listed `Card 1` after that card's predicate was flipped false.
- All three cards' name / number / email / phone / date / e-signature / access level intact at every point.
- ✕ → Resume returned to the exact stop **on the exact card** (`Step 10 of 23`, badge `Card 3`); Resume button visible only on the entry the tour started on.
- Removing card 2 while standing on card 3: guide stayed on the same element, badge renumbered to `Card 2`, flow rebuilt to 2 cards. Removing the card being shown fell **back** to card 1's step 16.
- Adding a card from step 17: card enrolled, guide stayed on step 17, "added behind this step" note shown, `Back` walked into it and cleared the note.
- Preview tail unchanged: 21 → 22 → 22-1 → 22-2 → 22-3 → 23, the Send capturing guard still held the click (a probe listener on `#era_previewSendBtn` never fired), "No" returned to step 22, `Finish` completed the tour and Restart replayed from step 1 with data intact.
- Card count never changed except on an explicit click of the form's own button or Remove.
- No guide-related console output at any point (only the expected unauthenticated Firebase/Functions errors — this is a signed-out local run).

**Still not covered:** the same gap as above — a signed-in, end-to-end run against live Firebase. `eraSignIdIsSatisfied()` was stubbed rather than driven by a real signature/Photo ID round trip, and the Preview modal was opened directly rather than built by `Le()`.

**Not covered:** a signed-in, end-to-end run against live Firebase. This repo has no local-auth path, so the Graph send, the real e-signature round trip, and real Photo ID uploads were exercised only through their DOM-visible effects. Click through one real Activate request before relying on it.

### Step 14 same-email skip pass (2026-08-30)

Same method — the **real** `public/index.html` served locally and driven from the browser, with `window.devicePixelRatio` forced to 2.5 (so the signature canvas genuinely carried a scaled context), Card 1's signature drawn with real mouse events, each card's Photo ID stood in for by stubbing that card's own `eraSignIdIsSatisfied()`, and `saveKeycardSignIdSignature` replaced with a spy. Confirmed:

- **Card 1** (no earlier card): 7 → 13 → **14 (locked, "Required for this workflow.")** → 15 → 16, unchanged.
- **Card 2, same tenant email** typed at step 10: nothing stamped at step 10 (`eraSignIdHasInk()` still false — the deliberate "don't stamp on a half-typed match" guard); `Next` from 13 landed on **15**, unlocked, with the reuse body/note. Card 2's canvas then held Card 1's ink at an ink bounding box of `[46, 83, 440, 213]` against Card 1's `[46, 83, 441, 213]` on an identically sized 1425×350 buffer; `Signature_Card2.png` appeared in Attachments exactly once; the spy recorded one `saveKeycardSignIdSignature({cardNumber: "2"})` carrying the identical 23,058-character data URL as card 1; the E-Signature checkbox was never touched. `Back` from 15 → **13**.
- **Card 3, different tenant email**: 13 → **14, locked**, popup note "Required for this workflow.", nothing stamped, no extra persist.
- **Reuse turning on while standing on step 14** (Card 2's email edited from a different address to Card 1's): the stop stayed on screen (never yanked), unlocked, and said *"this step is no longer needed for this card"*; `Next` → 15 with the stamp applied; `Back` → 13, the step now gone from the walk.
- **Restart** with reuse already true replayed from step 1: Card 1 `…13, 14, 15, 16`, Card 2 `…13, 15, 16`, Card 3 `…13, 14` — and no second persist for any card.
- The exported donor PNG was fully opaque (0 transparent pixels) with the ink intact, and a side-by-side render of both canvases matched visually.
- No guide-related console output throughout (only the expected unauthenticated Firebase/Functions errors of a signed-out local run).

**Still not covered:** the same gap — `eraSignIdIsSatisfied()` was stubbed rather than driven by a real Photo ID upload, and `card2_signature` was verified through `signIdSignatures["2"]` receiving Card 1's data URL rather than by rendering the merged PDF.

### Per-card verification / Cc / `Enter` pass (2026-08-29)

Same method — the **real** `public/index.html` served locally and driven from the browser. The merged Keycard Form PDFs were built in-page with the app's own `window.ensurePdfLib()` against the real `/assets/keycard-form/Cubework_Keycard_Form_v2.1.pdf`, mirroring `functions/signatureRequests.js`'s own fill → `form.flatten()` → stamp-PNG order, and fed in through the real `buildKeycardHistoryFormPdf` callable (stubbed to return those bytes) so `eraMaybeBuildKeycardFormPdf()` attached them exactly as it does in production. Confirmed:

- **Card detection off the PDF:** 1-, 2- and 3-card PDFs each detected exactly their own cards, with no false positive from the template's own static text (323 text runs on the 1-card page, only card 1 matched).
- **Stops:** 1 card → `step 1 of 2` (card 1, staff) — identical to the pre-change flow; 2 cards → `1 of 3`, `2 of 3`, `3 of 3`; 3 cards → `1 of 4` … `4 of 4`; then in every case the Close stop with `Back`/`Next` hidden.
- **Positions:** every stop's spotlight inline geometry matched an independently computed field box (page-space rect → canvas client rect) to within **0.25 px**, for `card1_signature`, `card2_signature`, `card3_signature` and `staff_signature`.
- **Scrolling:** the lightbox scroller moved 92 → 176 → 262 → 567 px across the four stops, each field centred in view (the staff stop clamped at the page foot, still fully visible). Screenshots confirmed the Issued By block with *Cubework Authorized Staff – Signature* outlined.
- **Close gating:** extra `Next`/`Enter` presses on the Close stop did nothing; only the real Close click unlocked step 22-2's `Next`. Closing the lightbox **part-way through** (on card 2) returned to step 22-2 with `Next` still locked and the blocked message intact.
- **Fallback:** a PDF with no card rows filled fell back to the form's own card blocks (2 blocks → `1 of 3`, both cards walked).
- **Untouched paths:** `eraGetKeycardTemplateSignatureRects()` still returns exactly the 8 `*_signature` fields; a View taken with the guide **not** running still renders the original `<iframe>`, not the canvas.
- **`Enter`:** a genuine (`isTrusted`) browser keypress advanced 22-1 → 22-2 and walked all four View stops. It did **not** advance from a `textarea`, from a recipient add-input holding a typed address (which still committed the address), or while the Send confirmation was up — the confirmation stayed open, the tour did not finish, and a probe listener showed the real Send handler never ran.
- **Preview recipients:** a real Preview build gave **To** `helpdesk@unisco.com`, **Cc** `keycard@cubework.com` + `huy.nguyen@cubework.com`, **Bcc** `(none)`. Hand-moving the requester into Bcc and adding a second Bcc address, then Cancel → Preview again, restored **Bcc empty** and the requester **back in Cc**. The same round trip in **Wi-Fi** mode kept its hand-added Bcc, confirming the invariant is Keycard-only.

No guide-related console output throughout (only the expected unauthenticated Firebase/Functions errors of a signed-out local run).
