# Recovery point: Update-V1.1 - Ki Particle / Ice Spike / Thunder

**Created:** 2026-08-23

**Why this checkpoint exists:** captures `public/index.html` and its doc
(`docs/email-request-attachments-embed-tab.md`) right after the CW Email
Request tab's three decorative hover-animation features were all in a known
good, working-per-static-checks state:

- **Ki Particle swirl** — Keycard tab dropdown (`.era-dd-ki-*`, `era_k_tabDropdownMenu`).
- **Ice Spikes** — Wi-Fi tab dropdown (`.era-icespikes-*`, `eraWireIceSpikesHover()`, `era_w_tabDropdown`).
- **Thunder** — Printer tab dropdown (`.era-thunder-*`, `eraWireThunderStormHover()`, `era_pr_tabDropdown`): bolts, flashes, explosion sparks, and broken-ground cracks, in white/blue/purple, quantity 5 per burst, randomized around the cursor. Full build history is in the `printer-tab-thunder-strikes-feature` project memory and in the doc file captured here.

**What's in this folder:**
- `index.html` — exact snapshot of `public/index.html` at this point.
- `email-request-attachments-embed-tab.md` — exact snapshot of the matching doc.

**How to restore:** copy `index.html` from this folder back over
`public/index.html` (and the `.md` back over
`docs/email-request-attachments-embed-tab.md` if you want the docs to match
too), then `firebase deploy --only hosting` to push it live. This repo has no
git history and `public/app.js`/`public/index.html` have no build step for
this particular file (index.html is edited directly, per
[CLAUDE.md](../../CLAUDE.md) pitfall #11), so this snapshot is the only way
to get back to this exact state short of re-doing the edits by hand.

**Verification status at time of snapshot:** all three effects were checked
statically only (the embed's `<script>` re-parses cleanly via
`node -e "new Function(code)"`, and the readable `<style>` block's `/*`/`*/`
and `{`/`}` counts balance) — none were click-tested in a live browser, since
the tab sits behind Firebase Auth. If something looks wrong live, that's the
first thing to double-check.
