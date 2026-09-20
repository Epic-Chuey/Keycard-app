# Shared location catalog (`public/locations.js`)

> Part of the [keycard-app documentation map](../CLAUDE.md#documentation-map). Read before touching `public/locations.js`, `standupLocationCatalog`, or location-matching/grouping code.

Single source of truth for Cubework addresses; loaded as a plain (non-module) script before `app.js`, so `window.CUBEWORK_LOCATIONS` exists whenever a consumer reads it. **To add a location, edit `locations.js` only.**

**Consumers (5):** 4 do exact-ish, case-insensitive matching on `loc.label`:
1. Email Request's Location field (`email-request.html`'s `LOCATIONS`/`populateLocationOptions`)
2. Roadmap Duplicate flow's location picker (`openDuplicateRoadmapModal`/`populateDuplicateRoadmapLocationOptions`)
3. Roadmap's "New roadmap item" title field ([roadmap-feature.md](roadmap-feature.md))
4. CW Email Request's Location field + Keycard Transfer From/To fields (`index.html`'s `eraPopulateLocationOptions`/`eraPopulateLocationDatalist`/`eraFindLocation`), reading `window.CUBEWORK_LOCATIONS` directly, not via `app.js`

The 5th, `detectEntryLocationEntry()`/`detectEntryLocationLabel()` (Standup tab), does loose fuzzy token matching (street-number token must match exactly, plus ≥1 more overlapping token — ticket subjects/voice transcripts rarely match an address exactly). Returns the whole matched entry (label + state, parsed from the label's trailing ", XX"); replaced the old state-only `standupDetectLocationState()` once grouping-by-location needed the full label (2026-08-05).

**2026-08-15:** added `"500 W Warner Ave Ste 200, Santa Ana, CA 92707"` — no consumer changes needed, confirming the single-source design.

**Second, runtime-growable source:** `locations.js` only grows via deploy; the fuzzy-matching consumer also merges the `standupLocationCatalog` Firestore collection, fed by Standup Report step's "ask before adding" prompt (`addStandupLocation` callable). `standupRebuildLocationIndex()` in `app.js` combines both into `STANDUP_LOCATION_INDEX` on every change — shared by Standup and Daily To-Do only; the other 3 consumers read `locations.js` directly.

**Override dropdown:** `allLocationCatalogLabels()`/`locationOverrideOptionsHtml()` (2026-08-05) expose the combined index as a flat, CA-first-then-alphabetical `<option>` list for the manual location-override dropdown on Standup/Daily To-Do entries. `effectiveEntryLocation(item)` — `item.locationOverride`, else `detectEntryLocationLabel(item.text)` — is the one function everything (grouping, summary breakdown, "ask before adding") reads a row's location from. `groupItemsByLocation(items)` buckets by that (CA-state groups first, then alphabetical; unmatched returned separately as `unassigned`, never dropped); shared by Standup's summary breakdown and Daily To-Do's report.
