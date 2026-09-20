# 2026-08-31 — CW Email Request, Keycard tab: De-Activate Step-by-Step Guide (Steps 1–10, stops at Preview)

## What changed

Following Huy's own numbered spec, the Step-by-Step Guide now has a real (not
placeholder) walkthrough for **De-activate**, built in `public/index.html`
alongside Activate's own, untouched 23-step guide. The trigger itself
(an entry's Action select transitioning into `deactivate`) was **not**
touched, per explicit instruction — it already worked from the mechanism
pass earlier the same day.

### The 10 steps

1. **Location(s)** — same request-level field/target as Activate's own Step
   1, plus the same "+ Add location" round trip (its own `D_ADD_LOCATION` /
   `dLocationStepAt()` / `dAddLocationReturnStepAt()`, separate FLOW-key
   namespace from Activate's so the two can never collide).
2. **Your email** — `era_requesterEmailLocal`; already wired into the shared
   email-history/reuse feature (selector-based, not guide-specific), so
   "save entered emails for reuse" needed no new code.
3. **SERVES — Cubework or Unis** — popup, same `optionsHtml()`/native
   `<button>` mechanism as Activate's own SERVES step, so mouse click and
   Spacebar both work identically (native button activation — not
   guide-specific code).
4. **Access System — HikCentral / Unifi** — same pattern, independent
   checkboxes.
5. **Company Name** *(per card)* — new field, specific to a De-activate
   card (Activate hides this and auto-mirrors Tenant Name into it instead).
6. **Tenant First and Last Name** *(per card)*.
7. **Keycard Number** *(per card)* — 10-digit gate.
8. **+ Add Note** *(per card, optional)*.
9. **+ Add Another Keycard** *(per card)* — the decision point. Not
   pressed → Step 10. Pressed → a new card is enrolled (defaults to
   Activate, matching the form's own default radio), and staff picks
   De-activate or Activate on **that card's own** Action select:
   - **De-activate** → repeats Steps 5–9 for that card.
   - **Activate** → hands off to Activate's own real per-card steps
     (`STEPS[CARD_FIRST..CARD_LAST]` — Tenant Name through Additional
     Keycard, e-sign-skip rule included), spliced in **by reference**, not
     copied.
   A card's action can also be flipped **after** it's added — a mid-tour
   `change` listener rebuilds FLOW live so the guide re-splices the correct
   per-card block immediately (verified: switching a card back and forth
   between Activate ⇄ De-activate immediately changes the "Card N, set to
   ___" intro-stop wording and which fields the guide walks next).
10. **Preview** — terminal. Target is the real `#era_submitBtn`; gate holds
    until the real Preview modal is actually open (same "never fake a
    preview" rule Activate's own Step 21 follows). Reaching it with the
    modal open shows **Finish** and ends the guide. **Nothing past this
    exists yet — stopping here on purpose**, per Huy: "we will test this
    flow before adding further steps."

### Also done, per the same spec

- The per-entry "Resume Step-by-Step Guide" button (inside each card) is
  Activate-only again — removed from a De-activate card, since the global
  toolbar under the tab bar already covers it.
- That global toolbar (`#era_k_guideToolbar`) is now `position: sticky`,
  pinned just below the (also sticky) tab bar, with its offset measured
  live via `ResizeObserver` (the tab bar wraps to more than one row on a
  narrow/mobile viewport, so a fixed pixel guess would've been wrong there).
- Enter-as-Next and Spacebar-on-popup-options needed **no new code** —
  both already worked generically (the existing Enter-key router, and
  native `<button>` semantics for Space) and just carried over to the new
  steps automatically.

## What this deliberately does not do

No existing Activate step, gate, FLOW-building logic, e-sign-skip rule, or
Submission > Edit resume marker was modified. `buildFlow()` gained exactly
one early-return branch (`st.action === "deactivate"`) before any of
Activate's own card/location code runs; everything below that line in the
file is untouched. Steps Selection (the 23-step jump picker) stays
Activate-only — hidden for a De-activate tour, since there's nothing built
for it to jump to yet on this side.

## Testing

Driven end-to-end against the **real** `public/index.html`, served locally
(`static-preview` launch config) with the sign-in screen bypassed by hand
(`#signInScreen`/`#app` display toggle — this repo has no local-auth path,
see [pitfalls](../pitfalls.md)) since Firestore itself stayed
permission-denied throughout (expected, unauthenticated).

Exercised: the real Keycard-tab-dropdown "De-activate" quick-pick
(confirms `body.era-k-gated` clears the normal way); the chooser and its
dynamic title; Steps 1–4 including the SERVES/Access-System popups; the
full per-card block (Company Name → + Add Another Keycard); adding Card 2
via the form's own real button; flipping Card 2's action between
De-activate and Activate **twice**, confirming both the live intro-stop
wording and the actual per-card steps it walks into; reaching Step 10 with
Next correctly disabled/blocked until Preview opens.

One real bug was found and fixed during this pass: switching an
already-enrolled card's action mid-tour rebuilt `FLOW` correctly but didn't
re-render the *currently displayed* step's dynamic body/title text (that's
only evaluated inside `renderStep()`, not `refresh()`) — the mid-tour
`change` listener now calls `renderStep()` instead. `node --check` on the
extracted guide script block passes.

A real Send was **not** exercised (would require a live, authenticated
Preview build — no local-auth path for that here); click through one real
De-activate request before relying on it.

See [docs/keycard-activate-guide.md](../keycard-activate-guide.md) for how
the shared guide engine (chooser, tooltip, Back/Next, FLOW/`buildFlow()`)
works.
