# 2026-08-29 — Keycard "Activate" guide: "Add another Keycard" repeats the card steps

Part of the [project log](../../CHAT_LOG.md). Current behavior lives in [keycard-activate-guide.md](../keycard-activate-guide.md); the full implemented specification is [Guide_Activate_2026-08-29.md](../Guide_Activate_2026-08-29.md). Follow-up to [the same day's manual-popup rework](2026-08-29-keycard-activate-guide-manual-popup.md).

## What changed

Before this, step 16 ("+ Add another keycard") only *watched* for cards added during the tour — it held `Next` until a new card with a different tenant email had its own signature and Photo ID, but it never actually walked that card. Staff added a second card and were then left to fill it in unguided.

Now, when staff clicks **+ Add another keycard**, the guide repeats **only the card-specific steps** for that card and keeps everything else:

- **The tour walks a list of cards, not one card.** `stepIndex` now indexes a `FLOW` array built from the step table: the request-level head (steps 1–6) once, then the card block (steps 7–16) once per card, then the request-level tail (17–23) once. Adding a card rebuilds `FLOW` and slots the new block in — it never re-enters or re-renders the stop staff is standing on.
- **Steps 1–6 and 17–23 never repeat.** The 23-step workflow is not restarted; locations, requester email, licensee, SERVES, staff sign-off and Preview stay exactly as they were.
- **A new stop, `16-1` "Next keycard"**, opens each added card. It highlights the guide's **existing `Back` button** (a blue pulse — no new control was added) and explains that Back returns to the previous card. `Next` then begins that card's Tenant Name step.
- **A "Card N" badge** in the tooltip header shows which card the card-specific steps are on, read straight off the form's own `.era-k-entry-num` so it follows renumbering. It stays hidden while the tour is walking a single card.
- **Nothing is created and nothing advances on its own.** Cards are only ever created by staff clicking the form's own button; adding one leaves the visible step unchanged and only updates its note ("Card 2 is added and waiting — click Next…"). `goNext()` is still reachable from exactly one place.
- **The same-email / different-email rule now applies per card.** A card whose tenant email matches an earlier card in the tour that already has its signature + Photo ID reuses them: step 15 stays unlocked with a note saying which card it reuses. A different email behaves exactly as card 1 does — its own workflow choice, and its own `eraSignIdIsSatisfied()` hold under "Wait for Signature Now".
- **Per-card answers already worked and still do.** Fee and Signature-Workflow choices live in `guideStateFor(entryEl).answers`, keyed by the real entry, so each card answers for itself. Step 21's Save & Leave note now lists every card still waiting rather than only the first.
- **Removing a card mid-tour** drops it from the flow and falls **back** to the nearest surviving earlier stop (recovery only, never a forward move). Removing the entry the tour started on ends the tour, since that is where the Resume button lives.
- **Adding a card from a request-tail step** (scrolling up from Staff Name, say) is handled too: the card is enrolled, the visible step doesn't move, and a note says it was added *behind* this step and Back is the way in.

## Why

Requested directly: staff issuing two or three cards on one request were getting a guided first card and an unguided second one, and the obvious alternative — restarting the whole 23-step walkthrough per card — would have re-asked every request-level question.

## Scope

`public/index.html` only — the one self-contained guide `<style>`/`<script>` block at the end of the file. No existing Keycard function, validation rule, Firestore write, or submit/save path was modified; the card-creation mechanic (`j()` / `le()` / `#era_k_addEntryBtn`) is untouched and the guide reuses the form's own `Card #N` numbering and per-card signature state rather than duplicating either. `src/`, `functions/`, and the security rules are untouched.
