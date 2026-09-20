# 2026-08-29 — Keycard "Activate" guide reworked into a manually-driven popup

Part of the [project log](../../CHAT_LOG.md). Current behavior lives in [keycard-activate-guide.md](../keycard-activate-guide.md); the full implemented specification is [Guide_Activate_2026-08-29.md](../Guide_Activate_2026-08-29.md).

## What changed

The 2026-08-28 Activate walkthrough advanced by itself: required steps polled the real field and jumped forward the instant it became valid, optional steps advanced on a click anywhere outside the highlight, and a static hint line at the bottom of the tooltip explained that mechanic. Staff had no way to pause on a step, re-read it, or go back.

It is now an interactive popup with its own `Back` / `Next` / `Step X of 23` chrome:

- **Nothing auto-advances, ever** — not a filled field, not a ticked checkbox, not an e-signature or Photo ID arriving, not Save, not the Preview modal populating. Required steps only decide whether `Next` is *enabled*. `goNext()` is reachable from exactly one place, the `Next` button.
- **`Back`** moves exactly one step and is disabled only on step 1.
- **The old static bottom instruction line** (`.era-guide-hint`) and the click-outside-to-advance mechanic are gone.
- **Six steps gained popups** that drive the existing controls: SERVES (Cubework/Unis), SERVES (HikCentral/Unifi), Access Level, Fee (Yes/No), E-Signature, and the Save & Leave / Wait for Signature Now workflow. Step 10 also offers the tenant emails already on the request as one-click reuse.
- **More steps are now gated**, matching how the form is actually meant to be filled: Licensee Company Name, a 10-digit Keycard Number, an Access Level, a valid Tenant Email, a 10-digit Phone, an explicit Fee answer, and Date Issued (Date Returned stays optional).
- **Step 22 gained three sub-stops** — `22` recipients, `22-1` subject, `22-2` attachments, `22-3` body — so Preview gets reviewed piece by piece. The count shown stays "of 23".
- **Send now asks first.** On the final step a capturing listener holds the click on `#era_previewSendBtn` and asks *"Are you sure everything is correct and exactly the way you want it? This will SEND the email."* "Yes" re-dispatches the same click into the app's own unmodified handler; "No" returns to step 22. With the guide inactive, Send is untouched.
- **Conditional holds** were added for the two workflows that genuinely wait on someone else: "Wait for Signature Now" keeps `Next` locked until the entry's own `eraSignIdIsSatisfied()` is true, and a keycard added *during* the tour with a different tenant email holds `Next` until it has its own signature + Photo ID (same email reuses what's already collected).
- **Resume no longer skips forward** over steps completed by hand — that was auto-advance by another name. It returns to the exact parked step, only walking back when that step's target isn't on screen.
- **Positioning no longer depends on `requestAnimationFrame` alone.** `reposition()` also runs on `scroll`, `resize`, and the deferred interaction handler, after rAF was observed sitting at zero frames while the page wasn't being composited.

## Why

Staff were being pulled through the form faster than they could read it, with no way back. The Activate flow also has two genuinely asynchronous waits (tenant e-signature, tenant Photo ID) and a multi-card branch, none of which a "move on as soon as the field is valid" model can express.

## Scope

`public/index.html` only — the one self-contained guide `<style>`/`<script>` block at the end of the file. No existing Keycard function, validation rule, Firestore write, or submit/save path was modified; `src/`, `functions/`, and the security rules are untouched.
