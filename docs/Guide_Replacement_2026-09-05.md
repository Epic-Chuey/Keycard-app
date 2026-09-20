# Keycard "Replacement" step-by-step guide (specification)

> Part of the [keycard-app documentation map](../CLAUDE.md#documentation-map).
> Read [CW Email Request tab](email-request-attachments-embed-tab.md) and the
> [Keycard "Activate" step-by-step guide](keycard-activate-guide.md) →
> [Guide_Activate_2026-08-29.md](Guide_Activate_2026-08-29.md) first — this is
> a sibling of Activate's and De-activate's guides, reusing the exact same
> chooser/resume/Back-Next engine (`STEPS`/`FLOW`, `guideState`,
> `eraGuideStart`, the `gate()`/`popup` step shape) rather than inventing a
> new one.

**Status: rebuilt (2026-09-05, later the same day as the original 11-step
version), per Huy's own exact 16-step spec.** Built directly into
`public/index.html` (the guide engine — see `keycard-activate-guide.md`
§"Where it lives"). `node --check` was run against the extracted
guide-engine script; it was **not** driven end-to-end in a live browser
against real Firebase data — this repo has no local-auth path (see
[pitfalls](pitfalls.md)). **Click through one real Replacement request
before relying on this.**

## What changed from the original 11-step version

The original pass (see [its own log entry](log/2026-09-05-keycard-replacement-guide.md))
was deliberately scoped to Replacement's own per-card fields only, no
request-level head, and stopped at reaching Preview. Huy's own follow-up
spec, later the same day, replaced that with an exact 16-step order:

- **Steps 1–3 are new** — a request-level head (Location, +Add Location,
  Your Email), pushed once regardless of card count, the same shape
  De-activate's own `D_LOCATION`/`D_ADD_LOCATION`/`D_YOUR_EMAIL` already
  have. Everything Replacement-specific shifts down by 3 (New Location is
  now Step 4, not Step 1).
- **Company Name, Tenant First/Last Name, Tenant Email and Tenant Phone
  are now ONE step** ("Tenant Information", Step 7) instead of four
  separate stops.
- **Free or Fee is now its own step** (Step 9), split out of what used to
  be a Fee mention inside the Old→New Keycard step's own body (now Step 8,
  "Replace Keycard").
- **Step 10 is renamed** ("Add another card replacement for the same
  Company/Tenant", was "+ Add Another Keycard Replacement") and **Step 11
  is renamed** ("New Company/Tenant Card Replacement", was "+ Add Another
  Keycard") — guide wording only, the real button's own DOM text is
  untouched.
- **A card added from Step 11 now defaults to Replacement**, not Activate —
  the one real functional change alongside the renames (see "Step 11",
  below).
- **The guide no longer stops at Preview.** It now walks the real Preview
  modal — Email Auto Populate (Step 13), Subject Naming Convention
  (Step 14), Email Body (Step 15, terminal) — ending in the same
  confirm-on-Send guard Activate's own final step already uses.

## The 16 steps

1. **Location** — `#era_location`, request-level (not per card). Required.
   Native browser autocomplete/typeahead; arrow keys and Enter are the
   browser's own dropdown behavior, not guide chrome.
2. **+ Add Location** — `#era_addLocationBtn`, request-level. Optional; a
   "Step 2 ↔ Step 2-1" round trip (mirrors Activate's/De-activate's own
   Location round trip) repeats for Location #2, #3, ….
3. **Your Email** — `#era_requesterEmailLocal`, request-level. Required
   (same `isRequesterEmail()` gate Activate/De-activate use).
4. **New Location** — `.era-k-replacementLocation`, per card. Optional (no
   required mark on the real field).
5. **Card Serves** — `.era-k-replacement-row > .era-checks` (Cubework /
   Unis), per card. Required (at least one). Popup mirrors
   `D_SERVES_COMPANY` — mutually exclusive.
6. **Access System** — `.era-k-repl-hikunifi-row` (HikCentral / Unifi), per
   card. Required (at least one). Popup mirrors `D_SERVES_SYSTEM` —
   independent toggles.

   Steps 5 and 6 together are the real form's own two-tier gate: the
   Company Name/Tenant/Keycard-pairs block (`.era-k-repl-extra`) only
   becomes visible once **both** are satisfied — `updateReplExtra()`
   reveals it and auto-adds the first keycard-pair row the moment that
   happens, which is why Step 8 never needs its own "add the first pair"
   click.
7. **Tenant Information** — Company Name (`.era-k-repl-companyName`),
   Tenant First/Last Name (`.era-k-repl-tenantName`), Tenant Email
   (`.era-k-repl-email`) and Tenant Phone (`.era-k-repl-phone`), all in one
   stop. Gate: Company Name non-empty AND first+last name present (same
   `/\S+\s+\S+/` rule as before); Email/Phone stay optional. Target anchors
   the Company Name/Tenant Name row; the Email/Phone row sits directly
   beneath it, unhidden.
8. **Replace Keycard** — the first `.era-k-repl-pair-row`'s Old Keycard #/
   New Keycard # (`.era-k-repl-old`/`.era-k-repl-new`). No gate — neither
   field carries a required mark on the real form.
9. **Free or Fee** — that same pair row's Fee checkbox
   (`.era-k-repl-pair-fee`). No gate. Popup offers "Free"/"Fee": Free
   unchecks the real checkbox, Fee checks it — the real form has one
   checkbox, not two mutually exclusive ones, so the popup just drives that
   one control both ways.
10. **Add another card replacement for the same Company/Tenant** (renamed
    from "+ Add Another Keycard Replacement") — `.era-k-repl-addPairBtn`.
    Optional. Pressed → a "Step 10 ↔ Step 10-1" round trip walks the new
    pair's Old/New Keycard # and Free/Fee together, then returns here so
    more pairs can be added; not pressed → Step 11.
11. **New Company/Tenant Card Replacement** (renamed from "+ Add Another
    Keycard") — `era_k_addEntryBtn`. Optional; blocked only while a
    newly-added **Activate** card still needs its signature + Photo ID
    (`pendingNewCards()`). **A card added from this step defaults to
    Replacement, not Activate** — a real, guide-scoped behavior change (see
    below) — though its own Action select can still be changed to Activate
    or De-activate afterward, same three-way handoff as before:
    - **Activate** → Activate's own `STEPS[CARD_FIRST..CARD_LAST]`, by
      reference.
    - **De-activate** → De-activate's own five-step `D_*` block, by
      reference.
    - **Replacement** (now the default) → this guide's own Steps 4–11
      again, starting at New Location, for that new Company/Tenant.
12. **Preview Email** — target is the real `#era_submitBtn`'s parent; gate
    holds until the real Preview modal is actually open. No longer
    terminal.
13. **Email Auto Populate** — recipients (`#era_previewToList`'s row).
    Staff may add/edit/remove Cc/Bcc; no gate.
14. **Subject Naming Convention** — `#era_previewSubject`'s row. No gate.
15. **Email Body** (terminal) — target is `#era_previewSendBtn`'s parent.
    Covers reading the body and the four action buttons (Edit/Cancel/Save/
    Send) in one stop, mirroring Activate's own `previewBody` +
    `finalActions` combined.
16. **Verification** — not a separate FLOW stop, same as Activate's own
    spec never had one either: while the guide sits on Step 15, a capturing
    listener holds the real Send button's click until the existing Yes/No
    confirmation popup is answered. **Yes** re-dispatches the real click
    (sends for real, ends the tour). **No** closes the popup and returns
    the guide to Step 15 — Replacement's own key (`r_previewBody`), not
    Activate's `previewTo` — the modal stays open, nothing is sent.

### Step 11's real functional change

Every other rename in this spec is guide wording only. Step 11 also changes
real behavior: the "+ Add another keycard" click listener (which already
existed, to enroll a new card into the running tour) now checks whether the
guide's current step is `r_addKeycard` and, only then, sets the new card's
own `.era-k-action-select` to `"replacement"` and fires a real `change`
event — the same event the form's own handlers already listen for, so the
Replacement fields reveal exactly as a manual pick would. This is scoped to
that one step: adding a card from Activate's or De-activate's own "+ Add
another keycard" steps (even inside a Replacement-started tour, after a
card's action was flipped) still defaults to the real button's own
Activate default, untouched.

## What this deliberately does not do

No existing Activate or De-activate step, gate, FLOW-building logic,
e-sign-skip rule, or Submission > Edit resume marker was modified.
`buildFlow()`'s dispatch is unchanged (still one early-return branch on
`st.action === "replacement"`). Steps Selection (the 23-step jump picker)
stays Activate-only. The per-entry "Resume Step-by-Step Guide" button stays
Activate-only too — the global toolbar under the tab bar covers Replacement.
Attachments review (Activate's own `previewAttachments`/22-2 stop) is
deliberately **not** part of this 16-step spec — Huy's own list omits it.

## Testing

`node --check` on the extracted guide-engine `<script>` block passes. A
full read of every touch point this rebuild needed — the new request-level
head steps, the combined Tenant Information step, the new Free-or-Fee step,
the two renames, the Step-11 default-to-Replacement click-listener change,
the Preview/Email review steps, and the shared Send-confirmation guard's
key check and "No" branch — was done by hand against the code it mirrors
(De-activate's own head, Activate's own `previewTo`/`previewSubject`/
`finalActions`).

**Not done this pass:** an actual driven click-through in a browser. Click
through one real Replacement request — including the request-level head,
adding a second keycard pair, adding a second Company/Tenant card (and
confirming it defaults to Replacement), and sending through to Verification
— before relying on this in production.
