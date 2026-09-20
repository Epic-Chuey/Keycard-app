# 2026-09-05 — CW Email Request, Keycard tab: Replacement guide rebuilt into Huy's exact 16-step spec

## What changed

Later the same day as [the original 11-step Replacement guide](2026-09-05-keycard-replacement-guide.md),
Huy sent an exact 16-step spec for the guide and it was rebuilt to match, in
`public/index.html`. Full step-by-step detail:
[Guide_Replacement_2026-09-05.md](../Guide_Replacement_2026-09-05.md) (rewritten
in place for this pass).

Summary of what moved:

- **New Steps 1–3** — a request-level head (Location, +Add Location, Your
  Email), pushed once ahead of the per-card loop, same shape as
  De-activate's own `D_LOCATION`/`D_ADD_LOCATION`/`D_YOUR_EMAIL` (own
  `r_location`/`r_addLocation`/`r_yourEmail` keys, own round-trip functions,
  so FLOW-key namespaces never collide across guide families). Everything
  Replacement-specific shifted down by 3.
- **Company Name/Tenant Name/Tenant Email/Tenant Phone merged into one
  step** ("Tenant Information", Step 7) — `R_COMPANY_NAME`/`R_TENANT_NAME`/
  `R_TENANT_EMAIL`/`R_TENANT_PHONE` removed, replaced by `R_TENANT_INFO`
  (ANDed gate, single target anchored on the Company/Tenant Name row).
- **New Step 9, "Free or Fee"** — split out of the Old→New Keycard step's
  body text into its own stop, targeting the pair row's own
  `.era-k-repl-pair-fee` checkbox, with a Free/Fee popup (Free unchecks,
  Fee checks — one real checkbox, not two).
- **Step 10 and Step 11 renamed** — guide title/wording only; the real
  button DOM text is untouched (shared markup with every other action).
- **Step 11 also changed real behavior**: the existing "+ Add another
  keycard" click listener now force-sets a new card's Action select to
  `"replacement"` (real `change` event) when — and only when — it's added
  from this exact step (`fromKey === "r_addKeycard"`), read at the moment
  of the click. Adding a card from Activate's/De-activate's own equivalent
  steps is untouched.
- **Preview is no longer terminal.** New Steps 13–15
  (`R_PREVIEW_TO`/`R_PREVIEW_SUBJECT`/`R_PREVIEW_BODY`) walk the real
  Preview modal, mirroring Activate's own `previewTo`/`previewSubject`/
  `finalActions` (Attachments deliberately left out — not in Huy's list).
  Step 15 (`r_previewBody`) is the new terminal step.
- **The shared Send-confirmation guard** (the capturing listener that holds
  a click on `#era_previewSendBtn` until the Yes/No popup is answered) now
  also fires for `guardStep.key === "r_previewBody"`, not just
  `"finalActions"`. Its "No" branch now returns a Replacement tour to
  `r_previewBody` specifically (Activate/RBK still go to their own
  `previewTo`/`finalActions`).
- `TOTAL_LABEL_REPLACEMENT` is now `"16"` (was `"11"`).

## What this deliberately does not do

Same posture as the original pass: no existing Activate or De-activate
step, gate, FLOW-building logic, e-sign-skip rule, or Submission > Edit
resume marker was touched. `buildFlow()`'s dispatch on
`st.action === "replacement"` is unchanged. Steps Selection stays
Activate-only. Attachments review is intentionally not part of this spec.

## Testing

`node --check` on the extracted guide-engine `<script>` block
(`public/index.html` lines 11129–14432 as of this pass) passes. Every touch
point was read by hand against the code it mirrors.

**Not done this pass:** an actual driven click-through in a browser (no
local-auth path in this repo — see [pitfalls](../pitfalls.md)). Click
through one real Replacement request — the full 16 steps, including a
second keycard pair, a second Company/Tenant card confirmed to default to
Replacement, and Send through Verification — before relying on this in
production.

See [docs/keycard-activate-guide.md](../keycard-activate-guide.md) for how
the shared guide engine works, and
[Guide_Replacement_2026-09-05.md](../Guide_Replacement_2026-09-05.md) for
the full current spec.
