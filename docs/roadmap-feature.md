# Project Roadmap feature

> Part of the [keycard-app documentation map](../CLAUDE.md#documentation-map). Read before touching Roadmap (list/timeline/compare views, exports, `roadmapItems`/`roadmapSettings`).

Self-contained manual-entry deployment tracker, unrelated to mail sync:

- `roadmapItems` docs hold `lineItems: [{ desc, qty, amount, vendor }]`; `vendor` ∈ `unifi | amazon | homedepot | lts` (`ROADMAP_VENDORS` in `app.js`, mirrored server-side in `functions/index.js`'s `updateRoadmapItem`).
- `roadmapSettings`: shared self-learning `{vendor}_{desc}` → last-used-price catalog, fed by every saved line item, powers cross-user autocomplete.
- `fetchProductPrice` (Cloud Function): live price from a pasted product URL, restricted to `PRODUCT_PRICE_VENDOR_DOMAINS` (one hostname/vendor).
- List/Timeline(Gantt)/multi-select "Compare mode" (side-by-side cards, per-line-item copy/remove/qty-edit)/Excel/PDF/PNG export all read from `allRoadmapItems`/`lastRenderedRoadmapItems`, never separately-fetched data.
- Export libs (`xlsx`, `html2canvas`, `jspdf`, `pdf.js`) load from cdnjs in `index.html`, not bundled — check there first on "library failed to load."
- `#roadmapTitleInput` ("New roadmap item" title): autocompletes over `window.CUBEWORK_LOCATIONS` (see [location-catalog.md](location-catalog.md)), same populate/filter/cap pattern as Email Request's Location field. On an *exact* catalog match, `submitRoadmapItem()` reshapes the title via `roadmapTitleFromLocationLabel()` (strips trailing `, ST[ ZIP]`, e.g. `"218 Machlin Ct, Walnut, CA 91789"` → `"218 Machlin Ct, Walnut"`) and `autofillRoadmapStateFromTitle()` mirrors the state into the State field via `roadmapStateFromLocationLabel()`. State auto-fill tracks its last-written value (`roadmapStateAutoFilledValue`) to keep updating across location changes, but any manually-typed State that doesn't match it is treated as a manual edit from then on (reset to `null` after a successful Add). Only Title/State are affected.

See also: [Known pitfalls](pitfalls.md) — SheetJS/Excel-export and html2canvas Timeline-export gotchas.
