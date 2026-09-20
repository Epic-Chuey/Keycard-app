# 2026-08-29 (second pass): Submission/Signature/Guide hidden behind the Keycard gate, and Location/Preview not gated with it

> Scope: **CW Email Request → Keycard → Submission**.
> Regression in the same-day reveal-on-selection gate documented in
> [2026-08-29-keycard-gate-step21-exit-and-attachment-fix.md](2026-08-29-keycard-gate-step21-exit-and-attachment-fix.md).
> All in `public/index.html` only — same self-contained `<style>`/`<script>` block, no `src/`, no `functions/`, no rules.

## The bug

The gate's own CSS rule hides everything matching the file's existing
definition of "Keycard content" — `.era-mode-fields[data-mode="keycard"]` —
until an action is picked from the Keycard tab's dropdown:

```
body.era-k-gated .era-mode-fields[data-mode="keycard"]:not(#era_previewSaveBtn){display:none !important;}
```

`#era_k_historyCard` — the **"📋 Submission"** history section — carries
that exact class/attribute pair too (it's shown/hidden by the same
tab-switcher as every other Keycard field), so the gate swept it in along
with the rest. It was the one card that shouldn't have been: it shows
*past* requests, not the one currently being filled in, and it's where
Submission's **Edit** flow lives — which restores the Signature/Photo ID
canvas and is also how `eraEditKeycardHistoryEntry` resumes the
Step-by-Step Guide at a parked step (§3 of the first pass's write-up).
With the whole card hidden until a fresh pick, staff landing back on the
Keycard tab with no action chosen yet (which is the *default* state — the
gate is on from first paint) could not reach Submission at all, and by
extension could not reach Signature or reopen the Guide.

Separately, the shared **Location** card (`#era_location`'s own `.era-card`,
holds "Location" + "Your email") and the form's own **Preview** button
(`#era_submitBtn`, not to be confused with `#era_previewSaveBtn` inside the
modal) are deliberately *not* `.era-mode-fields[data-mode="keycard"]`
elements — every one of the other five modes reuses both as-is, per the
existing comments in the markup. That's correct for those other modes, but
it meant Location and Preview stayed fully visible/usable on the Keycard tab
even while gated — Location advertising a location/email for a request no
action had been picked for yet, and Preview letting someone build/send a
request with no entries at all — the two pieces of chrome that visibly
ignored the gate everything else on the tab was obeying.

## The fix

Both fixed in the same `<style>`/`<script>` block from the first pass:

- **`#era_k_historyCard` added to the CSS `:not()` chain**, right alongside
  `#era_previewSaveBtn`. Same treatment, same reasoning: it carries the
  gating attributes but isn't actually part of the thing being gated.
- **Location and Preview each get a second, narrower hide**, driven by JS
  instead of the blanket CSS rule (which can't reach either without also
  hiding them on every other mode): a `currentMode` variable, updated from
  the same capturing click listener already tracking tab switches, plus a
  `syncSharedChromeGate()` call at every point the original `gate()` already
  ran (dropdown pick, tab switch, app-leave via the existing
  `MutationObserver`) and once at load. It toggles two new
  `display:none !important` classes — `.era-k-location-hidden` on
  `#era_location`'s `.era-card`, `.era-k-preview-hidden` on `#era_submitBtn`
  — each only when **both** the gate is on **and** the active tab is
  Keycard; every other mode is untouched.

No new DOM ids, no duplicate hide logic — both fixes reuse the existing
`gate()`/click-listener machinery and the existing element ids.

## Testing

No test runner exists in this repo. Verified by:

1. `node --check` on the extracted gate `<script>` block (passes).
2. The real `public/index.html` served on `http://localhost:5173`, driven
   from the browser, signed out (only the expected Firebase
   `permission-denied` errors):
   - Load (Keycard tab, no pick): gated — `era_k_historyCard` **visible**
     (`display:block`), Location **hidden**, Preview **hidden**, Deal &
     Licensee still hidden as before.
   - Pick "Activate" from the Keycard dropdown: ungated — history card,
     Location, Preview, and Deal & Licensee all visible.
   - Switch to the Wi-Fi tab: gate re-applies, but Location and Preview stay
     **visible** (shared chrome for that mode preserved); history card
     hides same as before (normal per-mode display, unrelated to the gate).
   - Switch back to the Keycard tab with no fresh pick: re-gated — Location
     and Preview hidden again, history card still visible.

**Not covered:** a signed-in, end-to-end run — clicking Submission > Edit
to confirm Signature restore and Guide resume actually fire, since that
needs a real saved keycard request behind Firebase Auth.
