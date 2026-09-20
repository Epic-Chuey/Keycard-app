# Shared tag feature (`STANDUP_TAGS` + one shared custom catalog)

> Part of the [doc map](../CLAUDE.md#documentation-map). Read before touching tags on Standup, Daily To-Do, or Issue — `STANDUP_TAGS`, `CUSTOM_TAG_COLOR_PALETTE`, `sharedTagCatalog`, `*AllTags()`/`*TagOptionsHtml()`/`*NextTagColor()`/`*TagCatalogList` in `app.js`, `addSharedTag`/`deleteSharedTag` in `functions/index.js`.

Standup/Daily To-Do/Issue each have a tag select, built from one fixed base set (`STANDUP_TAGS`, never written to) plus **one** shared runtime-growable custom catalog (`sharedTagCatalog`). A custom tag created from any tab is visible/deletable from the other two. **Exception: Issue's picker omits the fixed 8** (see below). Formerly 3 separate catalogs (`standupTagCatalog`/`dailyTodoTagCatalog`/`issueTagCatalog`), now merged (see Migration). The two cross-tab bridges (Daily To-Do→Standup, Standup→Issue) now pass `item.tag` through unchanged.

## `STANDUP_TAGS` (fixed base, `app.js`)

```js
const STANDUP_TAGS = [
  { key: "critical", label: "Critical/Urgent", color: "#dc2626" },
  { key: "helpdesk", label: "Helpdesk",        color: "#d97706" },
  { key: "inventory", label: "Inventory",      color: "#0d9488" },
  { key: "newHire", label: "New Hire",         color: "#16a34a" },
  { key: "layout", label: "Layout",            color: "#9333ea" },
  { key: "followUp", label: "Follow Up",       color: "#db2777" },
  { key: "troubleshoot", label: "Troubleshoot", color: "#0891b2" },
  { key: "travel", label: "Travel",            color: "#ea580c" },
  { key: "other", label: "Other",              color: "#6b7280" },
];
```
`functions/index.js` hand-mirrors these 9 keys only as `STANDUP_TAG_KEYS` (no shared module between client/functions — keep both lists in sync by hand if a tag is ever added/renamed/removed). Plain `const`, no admin UI — renaming/recoloring needs a code change + deploy.

**Backend validation (consolidated 2026-09-08):** every write path that stores a tag key — `saveStandupReport`'s `tag`/`tags`, `saveDailyTodo`'s per-entry `tag`, and Issue's `addIssueItem`/`updateIssueItem`/`setIssueItemTag` — now normalizes through one shared `isValidSharedTagKey(tag)` helper (`functions/index.js`, defined right next to `STANDUP_TAG_KEYS`): `STANDUP_TAG_KEYS.includes(tag) || /^custom:[A-Za-z0-9_-]{1,80}$/.test(tag)`. Previously only `saveStandupReport` validated against the canonical key set — `saveDailyTodo`/`addIssueItem`/`updateIssueItem`/`setIssueItemTag` accepted any trimmed string up to 60 chars, so a value that didn't match a real `STANDUP_TAGS` key or `custom:<sharedTagCatalog docId>` could be stored and would then silently fall back to "other"'s color/label (or nothing) wherever that tag was rendered/grouped/exported. Standup's item still defaults an invalid/missing tag to `"other"` (a Standup item is always tagged); Daily To-Do's entry and Issue's item still default to `null` (untagged is valid there) — only the *shape* of what counts as a valid non-null tag was unified, not each tab's fallback-when-absent behavior.

## Shared custom catalog

```js
function sharedAllTags() {
  const custom = allSharedCustomTags.map((t) => ({ key: `custom:${t.id}`, label: t.label, color: t.color || "#6b7280" }));
  return [...STANDUP_TAGS, ...custom];
}
```
`standupAllTags()`/`dailyTodoAllTags()`/`issueAllTags()` are thin wrappers (kept for existing call sites) — all return the same list now.

| Piece | Name |
|---|---|
| Per-tab wrapper | `standupAllTags()` / `dailyTodoAllTags()` / `issueAllTags()` |
| Shared fn | `sharedAllTags()` |
| In-memory cache | `allSharedCustomTags` |
| Firestore collection | `sharedTagCatalog` |
| Add / delete callables | `addSharedTag` / `deleteSharedTag` |

A custom tag's `key` is `custom:<doc id>` — stored on an item's `tag` field (never the raw label); same key everywhere now.

**Doc shape** `sharedTagCatalog/{docId}`: `label` (≤60 chars), `color` (≤20 chars hex, default `"#6b7280"`), `addedBy` (email), `addedAt` (`serverTimestamp`).

**`addSharedTag({label,color})`**: needs `requireRole(request,"edit")`; `invalid-argument` if `label` empty after trim; case-insensitive label match reuses existing doc (`{ok:true,id,reused:true}`); else truncates label/color to 60/20 chars, writes doc, returns `{ok:true,id}`.

**`deleteSharedTag({id})`**: needs `edit`; `invalid-argument` if `id` missing; deletes doc (removes tag from all 3 tabs at once). No attached files → no Storage cleanup needed.

**Rules**:
```
match /sharedTagCatalog/{docId} {
  allow read: if hasAnyRole() && (tabAllowed("standup") || tabAllowed("dailyTodo") || tabAllowed("issue"));
  allow write: if false;
}
```
Readable with access to *any one* of the three tag-using tabs.

## Creating a tag from the UI

`*TagOptionsHtml(selectedTag)` (`standupTagOptionsHtml`/`dailyTodoTagOptionsHtml`/`issueTagOptionsHtml`) builds: blank "No tag" → `sharedAllTags()` entries → trailing `<option value="__new__">+ New tag…</option>`. `change` listener on `__new__`:
1. `prompt("New tag name:")` — plain browser prompt (only place tag creation uses one).
2. Blank → reset select to blank, no-op.
3. Case-insensitive match against `sharedAllTags()` reuses existing; else `*NextTagColor()` picks a color, `addSharedTagFn({label,color})` is called, then push into `allSharedCustomTags` and set select to `custom:<id>` immediately (don't wait for `onSnapshot`).

## `CUSTOM_TAG_COLOR_PALETTE` (16 colors, shared, distinct from `STANDUP_TAGS` colors)

```js
const CUSTOM_TAG_COLOR_PALETTE = [
  "#0ea5e9", "#84cc16", "#f97316", "#8b5cf6", "#14b8a6", "#f43f5e", "#64748b", "#eab308",
  "#4f46e5", "#c026d3", "#059669", "#0891b2", "#a16207", "#65a30d", "#be123c", "#7c3aed",
];
```
`sharedNextTagColor()` picks the first palette color not currently used by any fixed or custom tag (checked by actual use, not a counter — deleting a tag frees its color):
```js
function sharedNextTagColor() {
  const used = new Set(STANDUP_TAGS.map((t) => t.color).concat(allSharedCustomTags.map((t) => t.color || "#6b7280")));
  const unused = CUSTOM_TAG_COLOR_PALETTE.find((c) => !used.has(c));
  if (unused) return unused;
  const hue = Math.round((allSharedCustomTags.length * 137.508) % 360);
  return `hsl(${hue}, 65%, 45%)`;
}
```
Past 16 in-use colors, falls back to a golden-angle hue step (137.508°) — guarantees no exact duplicate, not general color distance. `standupNextTagColor()`/`dailyTodoNextTagColor()`/`issueNextTagColor()` unchanged wrappers.

## Rendering

- **Standup/Daily To-Do**: colored dot, `<span style="width:10px;height:10px;border-radius:50%;background:${tagInfo.color};"></span>`. Standup falls back to `"other"` if unresolvable; Daily To-Do falls back to gray `#cbd5e1`.
- **Issue**: colored-outline `.tag` pill (`renderIssueItemCard()`): `<span class="tag" style="border-color:${tagInfo.color}; color:${tagInfo.color};">${label}</span>` (shared `.tag` class: white fill, 1px border, 999px radius, colors overridden). More room on Issue's cards than dense Standup/Daily To-Do rows.
- Cleanup lists (`#standupTagCatalogWrap`, `#dailyTodoTagCatalogWrap`, `#issueTagCatalogWrap`) always render **dots**, even Issue's.

### Manage custom tags cleanup UI

Panels stay separate per tab; only data is shared. `render*TagCatalogList()` (one per panel) read `allSharedCustomTags`: sorted alphabetically, dot + label + `secondary` Delete button. Summaries read "(shared across Standup, Daily To-Do & Issue)". Delete → `confirm()` → disable button → `deleteSharedTagFn({id})`. One shared `onSnapshot` (`subscribeToSharedTagCatalog`) re-renders all 3 panels + whichever tab's live select/cards are open.

Standup's/Daily To-Do's panels stay inside their step's form. **Issue's panel is its own always-visible block** between `#issueToolbar` and `#issueList` (not nested in `#issueAddRow`) — needed since tags can be created from any region's card `.issue-edit-tag` select, not just New.

### Issue's row pill is itself the picker

For `canEdit()` users, `renderIssueItemCard()` renders the tag spot as `<select class="issue-row-tag-select">` (`.issue-row-tag-select`/`.issue-row-tag-select-empty` CSS: dashed "+ Tag" untagged, colored pill tagged), options from `issueTagOptionsHtml()`. Change fires `setIssueItemTag` (dedicated callable, separate from `updateIssueItem` to avoid racing a full edit), persists immediately, no Save step. "+ New tag…" → prompt → dedupe against `issueSelectableTags()` → `addSharedTagFn` → `setIssueItemTagFn`. View-only users see the old read-only `<span class="tag">` (or nothing).

## Issue's divergence: no fixed 8 in the picker

Standup/Daily To-Do keep offering the fixed 8 + custom catalog. Issue's picker = custom-only, alphabetical:

- `issueSelectableTags()` → `allSharedCustomTags` mapped to `{key,label,color}`, sorted alphabetically, no `STANDUP_TAGS`. Drives `issueTagOptionsHtml()`'s options and both "+ New tag…" dedupe checks (New form's `issueTagSelect`, card `.issue-edit-tag`) — checking against this custom-only list means typing a name matching a fixed label (e.g. "Critical/Urgent") creates a real new custom tag instead of resurrecting the fixed one.
- `issueAllTags()` unchanged (`sharedAllTags()`) — still resolves a tag key to label/color for display (card pill, `exportIssueListToExcel()` Tag column). Old items with fixed-key tags still render correctly; just can't be re-picked.
- `issueTagOptionsHtml(selectedTag)`: if `selectedTag` is a fixed key absent from `issueSelectableTags()`, injects it as its own option labeled "`<label>` (legacy)" so the select doesn't revert to blank. Firestore data untouched either way; saving without changing the tag keeps it legacy; changing it swaps in a real custom tag.

## Tags in exports

- **Standup**: central. `buildStandupExcelWorkbook()` — one sheet per tag (name via `standupExcelSheetName()`, see [pitfalls](pitfalls.md) #3) + an Overview tag→count sheet. Report step breakdown/email also grouped by tag.
- **Daily To-Do**: tag **not** in report or Excel export — both group by *location* only (`groupItemsByLocation()`); tag is logging-time classification only.
- **Issue**: `Tag` column in `exportIssueListToExcel()` (`tagInfo.label` via `issueAllTags()`). PDF/PNG (`exportIssueListToFile`) snapshots `#issueList` as rendered — tag appears only as whatever pill is currently visible.

## Cross-tab bridges (pass tag through as-is)

- **Daily To-Do → Standup** ("Add to Standup checklist"): carries `item.tag` directly.
- **Standup → Issue** ("Transfer to Issue", Standup Report Section 2): carries `item.tag` directly. See [Standup](standup-tab.md)/[Issue](issue-tab.md) for full field mapping.

## Migrating pre-existing data

`migrateTagCatalogsToShared` (owner-only, `functions/index.js`) merges the 3 old collections into `sharedTagCatalog` (first-seen label wins on collision) and rewrites `custom:<oldId>` refs in `issueItems`/`standupSaves`/`dailyTodoSaves` to the merged doc. Run once (dry-run then real — see dated log entry) before deleting the old collections.
