# 2026-09-05 — CW Email Request, Keycard tab: Replacement Step-by-Step Guide (Steps 1–11, stops at Preview)

## What changed

Per Huy's request, the Step-by-Step Guide now has a real (not placeholder)
walkthrough for **Replacement**, built in `public/index.html` alongside
Activate's and De-activate's own guides. Three scope questions were asked
and answered before writing any code — see
[Guide_Replacement_2026-09-05.md](../Guide_Replacement_2026-09-05.md) §"Scope,
per Huy's own choices this session":

1. **Trigger**: same auto-chooser as Activate/De-activate, on an entry's
   Action select transitioning into `"replacement"`.
2. **Scope**: Replacement's own fields only — no new request-level head
   (Location/Your Email/SERVES), stops at reaching Preview (terminal).
3. **Docs**: a full spec doc, this log entry, and a `CLAUDE.md` doc-map row.

### The 11 steps

1. **New Location** *(optional)* — `.era-k-replacementLocation`.
2. **Card Serves — Cubework or Unis** — popup, mutually exclusive, mirrors
   `D_SERVES_COMPANY`.
3. **Card Serves — HikCentral / Unifi** — popup, independent toggles,
   mirrors `D_SERVES_SYSTEM`. Steps 2+3 together are the real form's own
   two-tier gate that reveals Company Name/Tenant/Keycard pairs
   (`updateReplExtra()`), which is also what auto-adds the first keycard
   pair row — so Step 8 never needs a separate "add the first pair" click.
4. **Company Name** *(per card, required)*.
5. **Tenant First and Last Name** *(per card, required)*.
6. **Tenant Email** *(per card, optional)*.
7. **Tenant Phone** *(per card, optional)*.
8. **Old Keycard → New Keycard (first pair)** *(optional, no gate — neither
   field carries a required mark on the real form)*.
9. **+ Add Another Keycard Replacement** *(optional)* — same "Step N ↔
   Step N-1" round trip Activate's own Location step uses, repeatable per
   pair added.
10. **+ Add Another Keycard** *(per card)* — the decision point, mirrors
    `D_ADD_KEYCARD`. Not pressed → Step 11. Pressed → picks up whichever
    action the new card's own Action select ends up on:
    - **Activate** → hands off to Activate's real per-card steps
      (`STEPS[CARD_FIRST..CARD_LAST]`, e-sign-skip rule included), by
      reference.
    - **De-activate** → hands off to De-activate's own five-step `D_*`
      block, by reference.
    - **Replacement** (default) → repeats Steps 1–10 for that card.
    A card's action can also be flipped **after** it's enrolled — the
    existing mid-tour `change` listener (previously De-activate-only) now
    rebuilds `FLOW` for a Replacement-started tour too.
11. **Preview** — terminal. Target is the real `#era_submitBtn`; gate holds
    until the real Preview modal is actually open. **Nothing past this
    exists yet — stopping here on purpose**, same as De-activate's own
    spec.

### Also done, per the same pass

- Chooser title branches three ways now: "Activate a keycard" / "De-activate
  a keycard" / "Replace a keycard".
- `refreshGlobalGuideToolbar()`'s visibility check gained `"replacement"`
  alongside `"activate"`/`"deactivate"`/`"requestcard"`. The per-entry
  Resume button stays Activate-only (same precedent as De-activate) — the
  global toolbar covers Replacement instead.
- The "+ Add Entry mid-tour" `cardIntro`-key fallback (used when a new card
  is added from a stop that's already past the new card's own steps) now
  resolves to `r_cardIntro` for a Replacement tour, alongside the existing
  `d_cardIntro`/`cardIntro` branches.
- The Step-of-N progress label (`"Step X of Y"`) gained a
  `TOTAL_LABEL_REPLACEMENT` ("11") branch.

## What this deliberately does not do

No existing Activate or De-activate step, gate, FLOW-building logic,
e-sign-skip rule, or Submission > Edit resume marker was modified.
`buildFlow()` gained exactly one more early-return branch
(`st.action === "replacement"`) alongside its existing `"deactivate"`/
`"requestcard"` branches; everything below those lines is untouched. Steps
Selection (the 23-step jump picker) stays Activate-only, same as it already
was for De-activate and Request Blank Keycard.

## Testing

`node --check` on the extracted guide-engine `<script>` block
(`public/index.html` lines 11129–14292 as of this pass) passes. Every touch
point — the trigger listener, chooser title branch, `eraGuideStart()`'s
`st.action` resolution, `buildFlow()`'s dispatch, the mid-tour `cardIntro`
key fallback, the card-action-switched-mid-tour listener, and the
Step-of-N progress label — was read by hand against the real
De-activate/Activate code it mirrors.

**Not done this pass, unlike the De-activate stub**: an actual driven
click-through in a browser (this repo has no local-auth path — see
[pitfalls](../pitfalls.md) — and this session didn't set up the manual
sign-in-screen bypass De-activate's own testing pass used). Click through
one real Replacement request — including a second keycard pair, a second
card with its action flipped, and reaching Preview — before relying on
this in production.

See [docs/keycard-activate-guide.md](../keycard-activate-guide.md) for how
the shared guide engine works, and
[Guide_Replacement_2026-09-05.md](../Guide_Replacement_2026-09-05.md) for
the full step-by-step spec.
