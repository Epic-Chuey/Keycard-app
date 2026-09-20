# Request Blank Keycard — Step-by-Step Guide (specification)

> Part of the [keycard-app documentation map](../CLAUDE.md#documentation-map). This is a
> **specification for a not-yet-built feature** — written at the end of a
> requirements-gathering session, before implementation. Read
> [CW Email Request tab](email-request-attachments-embed-tab.md) and the
> [Keycard "Activate" step-by-step guide](keycard-activate-guide.md) →
> [Guide_Activate_2026-08-29.md](Guide_Activate_2026-08-29.md) first — this
> new guide is a sibling of Activate's and De-activate's, reusing the exact
> same chooser/resume/Back-Next engine (`STEPS`/`FLOW`, `guideState`,
> `eraGuideStart`, the `gate()`/`popup` step shape) rather than inventing a
> new one.

**Status: implemented (2026-09-03), same session.** Everything below was
scoped first, then built directly into `public/index.html` (the guide
engine, per the existing "self-contained `<style>`/`<script>` block, no
build step" pattern — see `keycard-activate-guide.md` §"Where it lives")
and `functions/emailRequest.js` (subject/body wording). §7's open questions
were resolved during implementation, noted inline where each was decided;
**not** re-verified end-to-end in a live browser against real Firebase
data — this repo has no local-auth path (see
[pitfalls](pitfalls.md)), the same limitation
`keycard-activate-guide.md`'s own Testing section flags for its guide.
`node --check` was run against the extracted guide-engine script and
`functions/emailRequest.js`; click through one real Request Blank Keycard
run before relying on it. See §8 for the outstanding manual-test checklist.

## 1. Rename: "Request Card" → "Request Blank Keycard"

Every **user-visible** occurrence of "Request Card" inside the Keycard tab
of CW Email Request becomes **"Request Blank Keycard"**:

- The Keycard tab dropdown quick-pick (`#era_k_tabDropdownMenu`, currently
  `<div class="era-tab-dropdown-item" data-k-action="requestcard">Request Card</div>`,
  `public/index.html:2110`) → label text "Request Blank Keycard". Keep
  `data-k-action="requestcard"` unchanged.
- The per-entry Action `<select class="era-k-action-select">` option text
  for the `requestcard` choice (built by `eraActionTabs()`,
  `public/index.html:5614`) → "Request Blank Keycard". Keep the option
  `value="requestcard"` unchanged.
- Any on-screen row label/heading text for the Request Card fields
  (`.era-k-requestcard-row` — Location / Keycard Quantity / Manager Email)
  that currently reads "Request Card" → "Request Blank Keycard".
- Doc prose in `email-request-attachments-embed-tab.md` that describes this
  action should be updated to the new name in the same pass (not required
  for the feature to work, but keeps the doc from going stale the way the
  2026-08-19 dropdown-consolidation note flagged for a different field).

**Left unchanged (backend/internal, per the session's explicit instruction
not to rename these unless absolutely required):**

- Firestore field/collection names, if any exist under the `requestcard`
  key.
- The hidden `.era-k-requestcard` radio, `.era-k-requestcardLocation`,
  `.era-k-requestcardQty`, `.era-k-requestcardManagerEmail` DOM classes.
- `entryKeycardAction()`'s `"requestcard"` precedence value
  (`functions/emailRequest.js`).
- The `data-k-action="requestcard"` / select `value="requestcard"` attribute
  values themselves (only the human-readable label changes).
- Any callable/Cloud Function name.

## 2026-09-03 update

Three follow-up changes, made in the same session that shipped §§1-8 below:

- **All three toolbar buttons show immediately**, on page load, rather than
  Resume/Steps Selection waiting for a tour to already exist. The toolbar
  (`#era_k_guideToolbar`) is centered via `justify-content:center` +
  `flex:0 0 auto` on its buttons (previously `flex:1 1 auto`, which
  stretched them to fill the row). `refreshGlobalGuideToolbar()` no longer
  toggles `era-field-hidden` on Resume/Steps Selection at all - it only
  still flips Resume's own label text ("Resume"/"Restart") once a tour
  exists. Clicking either with no tour running is an unchanged no-op /
  falls back to Activate's own `STEPS` list, exactly as it already did.
- **Step 8-2 (Add a Note) now has a real "+ Add Note" toggle button**,
  reusing the exact box De-activate's own Notes step already has (the
  shared `.era-add-note-btn` / `dataset.eraNoteOpened` mechanism in `i()`)
  rather than showing `.era-k-notes` unconditionally. `u` (Request Blank
  Keycard) was added alongside `n` (De-activate) everywhere that mechanism
  gates visibility, and `.era-add-note-btn` was moved out of
  `.era-k-standard-fields` (which is hidden outright for `u`) so it's
  actually reachable. `RBK_NOTE`'s target now matches `D_NOTES`'s
  `firstVisible([era-add-note-btn, era-k-notes])` shape. A previously-saved
  note still auto-opens the box on Submission > Edit, same as De-activate.
- **Preview Email body's request line dropped the trailing quantity/location
  clause** - see the rewritten §5 below. Location stays in the Subject only
  (unchanged); it was never duplicated into the body beyond this line.

## 2. Guide Controls (new toolbar row)

Placed **centered**, in the same slot the existing Activate/De-activate
guide toolbar already occupies — between the Keycard tab bar
(`#era_tabs`) and the Location card (`#era_k_guideToolbar`, currently
holding "Resume Step-by-Step Guide" + "Steps Selection" per
`public/index.html:2279-2282`). This session's three controls extend that
same row (or sit in a second row directly under it if crowding becomes an
issue — implementation's call, not a requirement) rather than replacing it,
since Activate/De-activate's own Resume/Steps Selection buttons must keep
working exactly as they do today:

```
[Enable Step-by-Step Guide]  [Resume Step-By-Step Guide]  [Step Selection]
```

These three are **specific to the Request Blank Keycard flow** — a new,
third guide (alongside Activate's `A_*` steps and De-activate's `D_*`
steps) with its own step table (call it `RBK_*` below) and its own
`guideState`-shaped state. It does not reuse Activate's 23-step `STEPS`
array or De-activate's 10-step one; it defines its own steps per §4.

### Enable Step-by-Step Guide

- New button. Click → confirm dialog: **"Do you want to start the
  Step-by-Step Guide?"** with **Yes** / **No**.
  - **Yes** → starts the Request Blank Keycard guide at **Step 1**
    (Location), on a **fresh keycard entry** the guide creates for itself
    (see §4, Step 6 — the guide does not require staff to have already
    picked an action or created an entry by hand; it drives the whole
    thing from a blank slate, the same way Activate's chooser is reached
    only after an entry already exists and is set to Activate — the
    difference here is this guide is the thing that gets the entry into
    Request Blank Keycard mode, not a response to it already being there).
  - **No** → closes the dialog, no further action, nothing started.
- Unlike Activate's chooser (which appears only after staff manually
  switches an entry's Action to `activate`), this button is the **sole
  entry point** into the Request Blank Keycard guide — there is no
  "manually pick Request Blank Keycard from the dropdown and get offered
  the guide" path, because this guide's Steps 1–5 (Location, +Add
  Location, Your Email, Serves, Access Systems) are collected **before**
  any action is chosen. Manually picking "Request Blank Keycard" from the
  tab dropdown or the per-entry Action select continues to work exactly as
  it does today (plain form, no guide offered) — this is the "normal
  non-guide Keycard workflow" requirement 10 asks to keep verifying.
- **Manual-only navigation, same rule as Activate/De-activate:** nothing
  but a click on `Next` (or `Enter`, routed through the same single
  `goNext()`-equivalent gate function) advances a step. No auto-advance on
  field input, checkbox, popup pick, or any async event.

### Resume Step-By-Step Guide

- Resumes the **last saved/in-progress** Request Blank Keycard guide,
  restoring its answers exactly as left (mirrors Activate's per-entry
  `WeakMap`-backed resume: `{step, answers, locations, notes, ...}` keyed
  to the entry the guide is driving).
- **If none exists** (no in-progress Request Blank Keycard guide state to
  resume): show an inline message indicating there is nothing to resume
  (mirrors the existing pattern elsewhere in this file of a small toast/
  inline note rather than a blocking alert — implementation's call on
  exact wording, e.g. "Nothing to resume.").
- Resumes at the **exact step** last left on (same corollary as Activate's
  Resume: never silently skip forward over steps completed by hand; only
  walk back if the saved step's target isn't currently on screen, e.g. the
  Preview modal was closed).

### Step Selection

- Opens a step picker (same chrome as Activate's existing Steps Selection
  modal, `public/index.html:10850` area) listing the Request Blank
  Keycard guide's top-level steps (1 through 9, plus the "+ Add Location"
  sub-loop and "Add a Note" as a note under Step 8, not separately
  selectable — same convention Activate uses for its `2-1`/`16-1`-style
  sub-stops).
- Jumping to a step **preserves all existing data** — no field is reset,
  same `startKey`-into-`eraGuideStart`-equivalent mechanism Activate's
  Steps Selection already uses to land directly on a step without a
  Step-1 flash.
- Continues normally with Back / Next / Enter from wherever it lands.

### Guide stays draggable

The Request Blank Keycard guide's tooltip/popup chrome is the same
draggable overlay component Activate/De-activate already use (scrim +
spotlight ring + arrow + draggable tooltip) — no new drag implementation,
just a third consumer of the existing one.

## 3. Naming note (flagged, not resolved)

The session's control list writes **"Resume Step-By-Step Guide"** and
**"Step Selection"**; the existing toolbar already ships **"Resume
Step-by-Step Guide"** and **"Steps Selection"** (plural, `public/index.html:2280-2281`).
Treated as the same casing/pluralization already in place — **no rename**
of the existing buttons' text, since nothing in the session called out a
label change for them, only a new "Enable" button added alongside. If a
literal label match to the session transcript is wanted instead, that's a
one-line text change (flag to confirm with Huy before making it).

## 4. Request Blank Keycard Guide — step table

Modeled directly on Activate's `STEPS` shape (`key`, `label`, `title`,
`body`, `target()`, `gate()`, `blocked`, optional `popup`) —
see `keycard-activate-guide.md` §"The one rule that matters" for the
non-negotiable constraints this table must honor (gate only decides
whether `Next` is enabled; popups drive the real controls via real
`input`/`change` events; nothing but `Next`/`Enter` advances a step).

| # | Key | Title | Target / gate |
|---|---|---|---|
| 1 | `location` | Location | `#era_location` — required, same as Activate's own Step 1. |
| 2 | `addLocation` | + Add Location | `#era_addLocationBtn` — optional; see sub-loop below. |
| 3 | `yourEmail` | Your Email | `#era_requesterEmailLocal` — required, valid email. |
| 4 | `serves` | Serves | Popup: Cubework / Unis (mutually exclusive) — same fields/behavior as Activate's existing "SERVES — Cubework or Unis" step (`era_k_serves_cubework`/`era_k_serves_unis`). |
| 5 | `accessSystems` | Access Systems | Popup: HikCentral and/or Unifi (independent) — same fields as Activate's existing "SERVES — HikCentral / Unifi" step (`era_k_hikcentral`/`era_k_unifi`). |
| 6 | `keycard1` | Keycard 1 | See §4.1 below — special-cased step, not a plain field gate. |
| 7 | `managerEmail` | Manager Email | `.era-k-requestcardManagerEmail` — required, valid email. |
| 8 | `quantity` | Keycard Quantity | `.era-k-requestcardQty` — required, numeric ≥ 1 (existing field already validates 1–50 server-side per the Request Card row's current spec; reuse that range). |
| 8-2 | `addNote` | Add a Note | Optional — a button that reveals a free-text notes field for this request (reuses `.era-k-notes` if the Request Card row already renders one hidden, or adds one scoped to this flow — see §5 open question). |
| 9 | `savePreview` | Save / Preview | Two actions, not a single gated `Next` — see §4.2. |
| 10 | (modal step) | Preview Email | Targets fields inside `#era_previewModal`, same pattern as Activate's Steps 22+ (`previewTo`/`previewSubject`/`previewBody`/`finalActions`) — triggers the real Preview flow (a real click on the Preview button) rather than a second/mock preview, exactly as documented in `keycard-activate-guide.md` §"Global toolbar + Steps Selection". |

### 4.1 Step 6 — Keycard 1 (guide-scoped field rearrangement)

When the guide reaches Step 6, it:

1. Creates (if not already present) one keycard entry and sets its Action
   to **Request Blank Keycard** automatically (dispatches the same real
   `change` event on `.era-k-action-select` that a manual pick would, so
   `i()`'s show/hide logic and every existing listener runs unchanged).
2. **Disables every other Action option** on that entry's select for the
   duration of this guide — Request Blank Keycard is the only choice
   available while this specific guide is driving that entry. This mirrors
   Activate's own "gated" pattern (the Keycard tab itself is gated behind
   a chooser pick) rather than introducing a new disabling mechanism.
3. **Hides the per-entry Location field** (`.era-k-requestcardLocation`)
   for this entry, since Location(s) were already collected in Steps 1–2
   at the request level and re-asking for it here would be redundant.
4. **Visually reorders** the row so **Manager Email** sits in the position
   Location used to occupy — immediately **left of Keycard Quantity**.

**Scope of this change — guide-only, not global** (inferred from the
step's own parallel wording: "Disable all other Keycard actions/options
**for this flow**" explicitly scopes the disabling to the guide; "Remove
Location" / "Put Manager Email in the Location position" are the same
sentence's next clauses and are read the same way). Concretely:

- Staff who picks "Request Blank Keycard" **manually** (dropdown or the
  entry's own Action select, outside the guide) continues to see the
  **existing** row layout — Location, Keycard Quantity, Manager Email, in
  the current order — completely unchanged. Requirement 10 ("verify the
  normal non-guide Keycard workflow continues working") depends on this.
- The hide/reorder in Step 6 is therefore either (a) a guide-only CSS/DOM
  toggle applied to that specific entry while `guideState.mode` is active
  for it, reverted if the guide is abandoned before Step 9's Save, or (b)
  scoped via a data attribute the guide sets and clears. Implementation's
  call which; either satisfies "reuse the existing form, don't fork it."
- **Flag to confirm with Huy before building:** this reading (guide-only)
  is the specification's best inference, not a verbatim instruction — if
  the intent was actually a **permanent** layout change to the Request
  Card row (Location removed for everyone, Manager Email always left of
  Quantity), that changes item 2 in Implementation Requirements below and
  should be confirmed before the first line of code is written, since it
  would also affect the manual Request Blank Keycard workflow requirement
  10 asks to preserve as-is.

### 4.2 Step 9 — Save / Preview

Not a single `Next`-gated step — two distinct actions, same shape as
Activate's Step 21 Exit/Next branch:

- **Save & Come Back Later** — saves the current guide state (all answers,
  entry data) and exits/parks the guide, same as Activate's `Exit` action
  (autosave + park; a resume marker brings it back here via **Resume
  Step-By-Step Guide**).
- **Preview** — runs the real Preview flow: autosave → validation →
  `buildCwEmailRequestPreview` → the modal opening (same real click-through
  as Activate's own Preview button, not a second/mock preview) → advances
  the guide to Step 10 once the modal is confirmed visible. If validation
  fails (e.g. missing Manager Email), the real error surfaces exactly as
  it always does and the guide stays on Step 9 rather than advancing.

### 4.3 Step 2 — + Add Location (sub-loop)

Preserves the **existing** multi-location behavior verbatim (the shared
`#era_addLocationBtn`/`#era_extraLocations` mechanism, `eraAddLocationRow()`
/`eraRenumberLocationRows()`, per-mode state via `eraExtraLocationsByMode`):

- No additional location → `Enter`/`Next` goes straight to Step 3.
- Clicking **+ Add Location** → guide highlights the newly-added row,
  waits for a value, then `Enter`/`Next` returns focus to the **+ Add
  Location** button again (so the loop is: fill a location → Next → land
  back on "add another?" → Next-with-nothing-typed moves on, or click +
  Add Location again for a 3rd/4th/…). This is the same repeating-sub-step
  pattern Activate uses for repeated keycards (§"More than one keycard" —
  `16-1` "Next keycard" repeating the card block), applied here to
  repeated location rows instead of repeated cards.
- When finished (no further location added) → Step 3.

## 5. Step 10 — Preview Email

**Subject:**

```
[Location Address] - Request Blank Keycard - ([quantities])
```

- `[Location Address]` — Location #1 (`locationSubjectName`), same source
  every other mode's subject already uses; extra locations from Step 2
  never reach the subject, same as the existing "Subject Logic is
  untouched" rule for multi-location Keycard requests.
- `([quantities])` — the Keycard Quantity value(s) entered at Step 8, in
  parentheses. If multiple Request Blank Keycard entries exist in one
  request (the guide currently only drives one — see §7 open question),
  this would need a list/sum convention; single-entry case is
  `(qty)` e.g. `(5)`.

**Body**, in order (2026-09-03: the request line itself was shortened - see
below):

1. `(Serves) - Request Blank Keycard - (Quantity)`, e.g.
   `Cubework - Request Blank Keycard - 50`. `(Serves)` is the request-level
   Serves value picked at Step 4 (`Cubework` or `Unis`), read live off
   `e.serves`; `(Quantity)` is the Step 8 value. Neither the "keycard(s)"
   word nor the Location is in this line any more — Location stays in the
   Subject only (`buildKeycard()`'s `A` line, untouched).
2. *(blank line)*
3. `Manager Email: <value>`
4. *(only if Notes were entered at Step 8-2)* — *(blank line)*, then the
   Notes text directly under the Manager Email line.

Server-side, this is a new `entryKeycardAction() === "requestcard"`
branch's greeting/body assembly in `buildKeycard()`
(`functions/emailRequest.js`) — additive, not a change to any other
action's body assembly.

**Controls** (same ids/behavior as the existing Preview modal —
`#era_previewFormatBtn`/`#era_previewEditBtn`/`#era_previewSendBtn`, all
already renamed "Edit"/"Cancel"/"Send" per the 2026-08-19 pass, see
`email-request-attachments-embed-tab.md` §"Preview modal button renames"):

- **Edit** → returns to the form (Step 9), preserving all data.
- **Cancel** → returns to the main form (same "Cancel" behavior the
  Preview modal already has — closes the modal, no send).
- **Save** → saves and exits, same as Step 9's "Save & Come Back Later".
- **Send** → confirm dialog **"Send Email?"** → **Yes** sends (same guarded
  real click-through pattern Activate's final step uses on
  `#era_previewSendBtn` — a capturing listener holds the click until
  confirmed, then re-dispatches into the app's own unmodified handler);
  **No** stays on Preview, nothing sent.

## 6. Implementation requirements (carried from the session, for the build pass)

1. Reuse the existing Step-by-Step Guide framework/UX (`STEPS`/`FLOW`-shaped
   table, `gate()`/`popup`, draggable tooltip, scrim/spotlight/arrow) — no
   parallel engine.
2. Do not break existing Keycard actions/workflows (Activate, De-activate,
   Replacement, Troubleshoot, Transfer, and the **manual** Request Blank
   Keycard path all continue exactly as today).
3. Preserve existing multi-location behavior (§4.3) verbatim.
4. Manual navigation only; `Enter` = `Next`, routed through one gate
   function, same as the existing guides' "nothing advances except Next"
   rule.
5. Guide remains draggable.
6. Preserve data through Resume, Step Selection, Edit, Save, Preview, and
   Cancel — no field is ever reset by any of these.
7. Do not rename backend structures, callables, APIs, or IDs unless
   absolutely required (per §1, only the label text changes).
8. Request Blank Keycard is the **only** enabled Keycard action within
   this guide flow (§4.1, item 2).
9. Test the complete flow end-to-end, including: multiple locations, Notes,
   Resume, Step Selection, Edit, Preview, Cancel, Save, Send.
10. Verify the normal **non-guide** Keycard workflow (manual Request Blank
    Keycard selection, and every other action) continues working
    unchanged.

## 7. Open questions — resolved during implementation

These were the spec's own inferences where the session's instructions were
silent or could be read more than one way. Each is now settled by what was
actually built; still worth a quick confirm with Huy since none of these
were verbatim instructions:

- **§4.1 scope — RESOLVED as guide-only.** `setupRequestBlankKeycardEntry()`/
  `teardownRequestBlankKeycardEntry()` apply the Location-hide/Manager-Email-
  move/other-options-lock only while a Request Blank Keycard tour is
  actually driving that entry, and undo all three the instant the tour ends
  (Finish, Exit, or ✕) — `eraGuideEnd()` calls the teardown unconditionally
  whenever the ending tour's `action` was `"requestcard"`. Manually picking
  Request Blank Keycard outside the guide still shows the original
  Location/Quantity/Manager Email layout, untouched.
- **Multiple Request Blank Keycard entries in one request — RESOLVED as
  single-entry.** `buildRequestBlankKeycardFlow()` pins `st.cards` to
  exactly the one entry the guide started on; there is no "+ Add Another
  Keycard"-equivalent step. A second Request Blank Keycard entry on the
  same request means running **Enable Step-by-Step Guide** again (which
  reuses the same first entry — see below) or adding one manually outside
  the guide.
- **Step 8-2 "Add a Note" — RESOLVED, no extra wiring needed.** Turned out
  `i()`'s existing visibility formula in `j()` (`public/index.html`) already
  leaves `.era-k-notes` **unhidden** for a Request Card/Request Blank
  Keycard entry (`l||rep||(n&&...)` is false when the entry is neither
  Troubleshoot, Replacement, nor an unopened De-activate note) — the field
  was already there, just needed a step pointing at it (`RBK_NOTE`). No
  second notes field, no pitfall #15 risk.
- **Naming casing — RESOLVED, kept as shipped.** The existing "Resume
  Step-by-Step Guide"/"Steps Selection" button labels were left exactly as
  they already were; only the new "Enable Step-by-Step Guide" button was
  added alongside them (§2/§3 both still describe the reasoning).
- **New, found during implementation — per-entry Location field still
  required server-side.** `buildKeycard()` (`functions/emailRequest.js`)
  requires a non-empty `location` on every `requestcard` entry and prints
  it in the email body — simply hiding `.era-k-requestcardLocation` (as a
  literal reading of "Remove Location" might suggest) would silently break
  submission. Resolved by keeping the real input in the DOM (hidden, not
  removed) and continuously mirroring the shared Location #1 field
  (`#era_location`) into it via `syncRbkLocation()`, called on setup and on
  every guide-active `input`/`change`/`click` (piggybacking the existing
  `scheduleRefresh()` hook) — so the value is always correct by the time
  Preview/Send runs, even if staff edits Location #1 after Step 1.

## 8. Testing checklist (for the implementation pass, not yet executed)

- [ ] `node --check` on the extracted/edited script (same discipline as
      `keycard-activate-guide.md`'s own testing note).
- [ ] Full driven run of all steps 1 → 10, fresh (Enable → Yes).
- [ ] Multiple locations at Step 2 (2, then 3+ rows), confirm each survives
      Resume/Step Selection/Edit.
- [ ] Notes entered at Step 8-2, confirm they land correctly formatted
      (blank line before, directly under Manager Email) in the Preview and
      sent body.
- [ ] No notes entered — confirm no stray blank line appears.
- [ ] Resume after Save & Come Back Later — lands on the exact step left,
      data intact.
- [ ] Step Selection jump to each step, confirm no data reset.
- [ ] Edit from Preview → back to Step 9 with data intact.
- [ ] Cancel from Preview → back to main form.
- [ ] Send → "Send Email?" Yes actually sends (there is no dry-run mode on
      any submit path, per `email-request-attachments-embed-tab.md` — a
      first test sends a real email); No stays on Preview.
- [ ] Manual (non-guide) Request Blank Keycard selection still shows the
      existing row layout unchanged, and still submits correctly.
- [ ] Every other Keycard action (Activate, De-activate, Replacement,
      Troubleshoot, Transfer) unaffected — spot-check each still opens and
      the Activate/De-activate guides still work exactly as documented in
      `keycard-activate-guide.md`.
