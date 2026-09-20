# Keycard "Troubleshoot" step-by-step guide (specification)

> Part of the [keycard-app documentation map](../CLAUDE.md#documentation-map).
> Read [CW Email Request tab](email-request-attachments-embed-tab.md) and the
> [Keycard "Activate" step-by-step guide](keycard-activate-guide.md) →
> [Guide_Activate_2026-08-29.md](Guide_Activate_2026-08-29.md) first — this is
> a sibling of Activate's, De-activate's and Replacement's guides, reusing the
> exact same chooser-free/resume/Back-Next engine (`STEPS`/`FLOW`,
> `guideState`, `eraGuideStart`, the `gate()`/`popup` step shape) rather than
> inventing a new one.

**Status: built (2026-09-05), per Huy's own exact 14-step spec.** Built
directly into `public/index.html` (the guide engine — see
`keycard-activate-guide.md` §"Where it lives"). `node --check` was run against
the extracted guide-engine script; it was **not** driven end-to-end in a live
browser against real Firebase data — this repo has no local-auth path (see
[pitfalls](pitfalls.md)). **Click through one real Troubleshoot request before
relying on this.**

## The main unlock

Troubleshoot had no `GUIDE_MODE_INFO` entry before this pass, so
`currentGuideMode()` returned `null` for it and the 3 global toolbar controls
(Enable/Resume/Steps Selection, under `#era_tabs`) stayed hidden — see
[keycard-activate-guide.md](keycard-activate-guide.md#global-toolbar--steps-selection-2026-08-30).
Adding `troubleshoot: { title: "Troubleshoot a keycard", stepsList: function
() { return STEPS; } }` to `GUIDE_MODE_INFO`, plus `"troubleshoot"` to
`GUIDE_MODES`, is what makes the page "configured" and surfaces the 3
controls. Steps Selection itself is unaffected — its own click handler still
only ever populates Activate's list or Request Blank Keycard's (see
"What this deliberately does not do", below); Troubleshoot's `stepsList` entry
exists only so `GUIDE_MODE_INFO[mode]` has a shape to read (`.title`, used by
the "Enable Step-by-Step Guide" confirm box) — it is never actually rendered.

## Troubleshoot's real fields (verified against the entry markup and its own visibility toggle)

Troubleshoot shares Activate's per-card entry markup (`.era-entry-block`, the
same `j()`-built template every Keycard action uses) rather than having a
separate set of `.era-k-troubleshoot-*` fields of its own. Its per-action
visibility toggle (the `i()` function inside the main Keycard entry script)
was read directly to confirm exactly which of the shared fields show for
Troubleshoot (`l` in that function, `t.querySelector(".era-k-troubleshoot").checked`):

| Field | Selector | Shown for Troubleshoot? |
|---|---|---|
| Company Name | `.era-k-companyName` (inside `.era-k-companyName-wrap`) | **Yes** — its own typed value, not mirrored from Tenant Name (that mirroring only applies while the wrap is hidden) |
| Tenant First/Last Name | `.era-k-tenantName` | Yes |
| Keycard Number | `.era-k-keycard` | Yes |
| Access Level | `.era-k-accessLevel-wrap` / `.era-k-access-standard`/`-wh`/`-office`/`-other` | Yes (hidden only for De-activate) |
| Descriptive Box | `.era-k-issue` (textarea) | **Yes — Troubleshoot-only.** Every other Keycard action hides this field; Troubleshoot is the only action that shows it. |
| Tenant Email/Phone | `.era-k-contact-row` (`.era-k-email`/`.era-k-phone`) | No — hidden for Troubleshoot same as De-activate/Replacement/Transfer/Request Blank Keycard |
| Fee | `.era-k-fee-row` | No — hidden |
| + Add Note / Notes | `.era-add-note-btn` / `.era-k-notes` | No — always hidden for Troubleshoot (unlike De-activate/Request Blank Keycard, which reveal it once their own "+ Add Note" is clicked) |
| Date Issued/Returned, Signature/ID, Photo ID | `.era-k-signid-wrap` | No — hidden |

Serves (Cubework/Unis) and Access System (HikCentral/Unifi) are **not**
per-card fields for Troubleshoot — they are the same request-level, shared
`#era_k_servesCard`/`#era_k_body` controls (`#era_k_serves_cubework`/
`#era_k_serves_unis`, `#era_k_hikcentral`/`#era_k_unifi`) that Activate,
De-activate and Request Blank Keycard all read too. They are entered **once
per request**, not once per card — confirmed by reading the real markup's own
comment ("plain, always-visible, freely-selectable checkboxes with zero
interdependency") and De-activate's own `D_SERVES_COMPANY`/`D_SERVES_SYSTEM`,
which target the identical elements.

**"Both" for Access System is not a separate option** — HikCentral and Unifi
are two independent checkboxes; picking "both" just means checking both of
them, exactly as De-activate's own `D_SERVES_SYSTEM` popup already presents
it. There is no third "Both" control on the real form to invent.

"+ Add another keycard" is the one, shared `#era_k_addEntryBtn` button every
Keycard action uses (not a Troubleshoot-specific button) — same reuse
relationship every other guide in this family already has with it.

## The 14 steps

1. **Location** — `#era_location`, request-level. Required. Native
   browser autocomplete; arrow keys and Enter are the browser's own dropdown
   behavior, not guide chrome.
2. **+ Add Location** — `#era_addLocationBtn`, request-level. Optional; a
   "Step 2 ↔ Step 2-1" round trip (mirrors Activate's/De-activate's/
   Replacement's own Location round trip) repeats for Location #2, #3, ….
3. **Your Email** — `#era_requesterEmailLocal`, request-level. Required
   (`isRequesterEmail()`, the same gate every other guide in this family
   uses).
4. **SERVES — Cubework or Unis** — `#era_k_servesCard`'s own `.era-checks`
   row, request-level (shared across every card, see above). Required (at
   least one). Popup mirrors `D_SERVES_COMPANY` — mutually exclusive.
5. **Access System — HikCentral / Unifi** — `#era_k_body`'s own
   `.era-checks` row, request-level (shared). Required (at least one). Popup
   mirrors `D_SERVES_SYSTEM` — independent toggles, either or both.
6. **Company Name** — `.era-k-companyName`, per card. Required (non-empty).
7. **Tenant First and Last Name** — `.era-k-tenantName`, per card. Required
   (`/\S+\s+\S+/`).
8. **Keycard Number** — `.era-k-keycard`, per card. Required (10 digits).
9. **Access Level** — `.era-k-accessLevel-wrap`, per card. Required (at
   least one of Standard/WH Only/Office Only/Other). Popup mirrors Activate's
   own `accessLevel` step exactly.
10. **Describe the Issue** — `.era-k-issue` (the Descriptive Box textarea),
    per card. No gate — the real field carries no required mark.
11. **Add Another Keycard** — `#era_k_addEntryBtn`. Optional; pressed → a
    card added from this exact step is defaulted to **Troubleshoot** on its
    own Action select (a real `change` event, the same scoped, step-keyed
    default-to-mode behavior Replacement's own Step 11 already established),
    then the guide repeats **only** Steps 6–11 for that new card — not
    pressed → Step 12. Card 3, 4, 5, … follow the same pattern, dynamically,
    driven by the same `tourCards()`/FLOW-rebuild mechanism every other guide
    in this family uses (see "MAX_CARDS", below, for what this does **not**
    enforce).
12. **Preview** — target is the real `#era_submitBtn`'s parent; gate holds
    until the real Preview modal is actually open (same
    autosave → Keycard Form PDF build → validation → `buildCwEmailRequestPreview`
    chain every mode's own Preview step already drives — never a second/mock
    preview).
13. **Preview Email / Email Body** (terminal) — target is
    `#era_previewSendBtn`'s parent, inside the real `#era_previewModal`.
    Covers reading the body and the four action buttons (Edit/Cancel/Save/
    Send) in one stop — Troubleshoot's 14-step spec combines what
    Replacement's own 16-step spec split into three stops (Recipients/
    Subject/Body) into this single review step, same as Activate's own
    `previewBody` + `finalActions` are effectively combined for Request Blank
    Keycard.
14. **Final Send Check** — not a separate FLOW stop, same as every other
    guide in this family: while the guide sits on Step 13, the existing
    capturing listener on `#era_previewSendBtn` holds the click until the
    shared Yes/No confirmation is answered. **Yes** re-dispatches the real
    click (sends for real, ends the tour). **No** closes the confirmation and
    returns the guide to **Step 13** — keyed off Troubleshoot's own
    `t_previewBody`, not Activate's `finalActions` or Replacement's
    `r_previewBody` — the modal stays open, nothing already entered is
    touched.

## What was adjusted from the literal spec text

- **Serves/Access System are request-level, not per-card.** The task
  description listed them between the request-level head (Location/Email)
  and the per-card block (Company Name onward), which already implied
  request-level placement, but called them out alongside per-card fields —
  confirmed by reading the real form that they are in fact the same shared,
  once-per-request `#era_k_servesCard`/`#era_k_body` controls Activate/
  De-activate/Request Blank Keycard already target, **not** a per-card
  control like Replacement's own `.era-k-repl-serves-*`/`.era-k-repl-hikunifi-row`.
  Steps 4–5 are pushed once, ahead of the repeating block, exactly like
  De-activate's own `D_SERVES_COMPANY`/`D_SERVES_SYSTEM`.
- **"Both" for Access System is not a real third option** — it's simply
  checking both HikCentral and Unifi. Implemented with the same
  independent-toggle popup `D_SERVES_SYSTEM` already uses; no invented
  "Both" control.
- **MAX_CARDS is not actually enforced by any of this guide family's own
  "Add another keycard" gates.** `MAX_CARDS = 7` exists only inside the
  separate Keycard Form modal `<script>` block, where it caps how many
  `CARD` blocks get written onto the PDF (`entries.slice(0, MAX_CARDS)`) — it
  does not disable `#era_k_addEntryBtn` or gate `addKeycard`/`d_addKeycard`/
  `r_addKeycard`'s own `pendingNewCards()` check. Troubleshoot's own
  `T_ADD_KEYCARD` step therefore reuses `pendingNewCards()` exactly like
  De-activate's/Replacement's own Add-Keycard steps do — the task's
  instruction to "respect the existing MAX_CARDS limit" has nothing further
  to hook into; adding a brand-new enforcement here would be a real,
  Troubleshoot-only behavior change no other guide in this family has, so it
  was deliberately left out.
- **No Activate/De-activate hand-off for a card added mid-tour.** De-activate
  and Replacement both let a card added via their own "+ Add another
  keycard" step be switched to a different action and splice in that other
  guide's own per-card block. Huy's own 14-step spec for Troubleshoot never
  asked for this, so every card this tour walks always runs Troubleshoot's
  own `T_*` block, regardless of that card's own Action-select value —
  simpler, and consistent with how Request Blank Keycard's own guide already
  works (also no hand-off).

## What this deliberately does not do

No existing Activate, De-activate or Replacement step, gate, FLOW-building
logic, e-sign-skip rule, or Submission > Edit resume marker was modified.
`buildFlow()`'s dispatch is unchanged in shape — one new early-return branch
on `st.action === "troubleshoot"` calling `buildTroubleshootFlow()`, mirroring
the existing `"replacement"`/`"deactivate"`/`"requestcard"` branches exactly.
Steps Selection (the 23-step jump picker) stays Activate-only — picking it
while Troubleshoot is the mode on screen still shows Activate's own list and
resolves against `activateEntries()[0]` exactly as it already does for
De-activate/Replacement, per the pre-existing, documented product decision.
The per-entry "Resume Step-by-Step Guide" button (inside each card, under its
Action select) stays Activate-only too — the global toolbar under the tab bar
covers Troubleshoot, same as it already covers De-activate/Replacement/
Request Blank Keycard.

## Testing

`node --check` on the extracted guide-engine `<script>` block passes. A full
read of every touch point this pass needed — the real Troubleshoot field
markup and its `i()` visibility toggle, the shared `#era_k_servesCard`/
`#era_k_body` controls and De-activate's own steps that already target them,
`buildFlow()`'s dispatch, the "+ Add another keycard" click listener's
step-keyed default-to-mode branch, the Send-confirmation guard's key check
and its "No" branch, and `MAX_CARDS`' actual (PDF-only) scope — was done by
hand against the code it mirrors.

**Not done this pass:** an actual driven click-through in a browser. Click
through one real Troubleshoot request — including the request-level head,
adding a second keycard, and sending through to the Final Send Check — before
relying on this in production.
