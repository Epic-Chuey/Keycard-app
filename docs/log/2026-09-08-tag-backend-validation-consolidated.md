# 2026-09-08 — Tag backend validation consolidated

## What changed

Audited every place tags are created, displayed, stored, filtered, or assigned across Standup, Daily To-Do, and Issue (client and Cloud Functions) to confirm the whole app uses one canonical tag set.

**Client (`app.js`):** already fully unified — `STANDUP_TAGS` (9 fixed tags) + `sharedTagCatalog` (custom tags) via `sharedAllTags()`, with `standupAllTags()`/`dailyTodoAllTags()`/`issueAllTags()` as thin wrappers. No change needed there.

**Backend (`functions/index.js`):** found one real inconsistency. `saveStandupReport` already validated an item's `tag`/`tags` against `STANDUP_TAG_KEYS.includes(...) || /^custom:[A-Za-z0-9_-]{1,80}$/.test(...)`, falling back to `"other"`. But `saveDailyTodo`, `addIssueItem`, `updateIssueItem`, and `setIssueItemTag` each accepted **any** trimmed string up to 60 chars as a tag — no check against the canonical key set at all. A value that wasn't a real `STANDUP_TAGS` key or `custom:<sharedTagCatalog docId>` could be written and would then silently render as untagged/gray wherever the app resolves tag key → label/color.

Added one shared helper, `isValidSharedTagKey(tag)`, next to `STANDUP_TAG_KEYS`, and switched all 5 write paths to use it:

- `saveStandupReport` — unchanged behavior (still defaults to `"other"`), just reads through the shared helper now instead of its own inline regex.
- `saveDailyTodo`'s per-entry `tag`, `addIssueItem`'s `tag`, `updateIssueItem`'s `tag`, `setIssueItemTag`'s `tag` — now validate through the same helper, still defaulting to `null` (untagged) when absent/invalid, matching each tab's existing null-is-valid semantics.

No Firestore documents were touched/migrated — this only tightens what a *future* write can store; every tag already saved by the real UI was already a canonical key (the client never sent anything else), so nothing existing breaks or changes appearance.

Also fixed two stale comments that undercounted the tag set (said "8" — it's been 9 since the 2026-08-18 Troubleshoot tag was added): `firestore.rules`' `sharedTagCatalog` comment, and the `STANDUP_TAGS` code sample in [docs/tag-feature.md](../tag-feature.md).

## Why

Requested as an app-wide tag-consistency pass: same tag definitions, same keys/casing, same data structure everywhere, frontend and backend alike, with the existing 20+ tags (9 fixed + custom catalog) preserved as-is — no new tag system, no duplicate/parallel tag list.

See [docs/tag-feature.md](../tag-feature.md) for the full current tag architecture.
