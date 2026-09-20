# Daily To-Do tab

> Part of the [documentation map](../CLAUDE.md#documentation-map). Read before touching Log/Report/Saved, `dailyTodoSaves`, or `dailyTodo*` in app.js.

Seventh "app" (`DAILY_TODO_APP_KEY = "dailyTodo"`, added 2026-08-02): voice-or-typed to-do list rolled into an end-of-day report. Own tab/collection (`dailyTodoSaves`), not folded into [Standup](standup-tab.md), despite near-identical shape (same Log/Report/Saved pattern as Standup's Pull/Report/Saved, same in-memory-until-Save model, same one-doc-per-day persistence via `saveDailyTodo`/`deleteDailyTodoSave`) — Huy wants voice to-dos and the mail-based Standup checklist reviewed side by side, never merged.

## 1. Log

- `dailyTodoMicBtn` drives `SpeechRecognition`/`webkitSpeechRecognition` in `continuous` mode; each finalized result → editable entry in `dailyTodoEntries` (checkbox/text/remove). 100% client-side, no audio sent to server.
- Chrome/Edge only; `updateDailyTodoMicAvailability()` disables mic + explains fallback elsewhere. "+ Add task" (typed) always works.
- Chrome auto-ends a session after silence despite `continuous:true`. Fix: `startDailyTodoRecognitionSession()` treats each session as single-use, restarts itself from its own `onend`, gated by `dailyTodoStopRequested` (set only by Stop or an unrecoverable error like `not-allowed`) — so it only stops on explicit Stop.
- Engine finalizes a new result on every mid-sentence pause. `appendToDailyTodoLiveEntry()` (2026-08-05) folds every finalized phrase within one Start→Stop session into a single growing entry (tracked by `dailyTodoLiveEntryId`, cleared on Stop/error) instead of one row per phrase.

## 2. Report

- `buildDailyTodoReportHtml()` groups entries by location (2026-08-05, via shared `groupItemsByLocation()`/`effectiveEntryLocation()`, same as Standup's summary), with an **Unassigned** bucket last for unmatched items (no other section to fall into here, unlike Standup).
- Each Log entry has its own `📍` location `<select>` (`daily-todo-location`) — voice transcription regularly garbles street names past fuzzy-match recovery (e.g. "Machlin Ct" → "Madeline"/"matchland"), especially with no street number to anchor on.
- "Save" → `saveDailyTodoFn` → `dailyTodoSaves/{date}` (includes `locationOverride`).
- "Export to Excel" (`dailyTodoExportExcelBtn`, 2026-08-06): `buildDailyTodoExcelWorkbook()` mirrors Standup's export (same SheetJS limits, see [pitfalls.md](pitfalls.md)) but groups sheets by *location* via `dailyTodoExcelSheetName()`; tracks used names and appends " (2)"-style suffix on 31-char-truncation collisions (more likely here than in Standup, since addresses are long/varied vs. STANDUP_TAGS' short fixed set).
- "Add to Standup checklist ↗": pushes included entries (with `locationOverride`) into `standupChecklistItems` (tagged `"other"`), re-renders Standup's checklist. Explicit, one-click, one-directional only — never automatic; stays on Daily To-Do tab after.

## 3. Saved

- `dailyTodoSaves/{date}` (`allow write: if false`, writes only via `saveDailyTodo`), read via `subscribeToDailyTodoSaves()`'s `onSnapshot` (one of the `unsubscribeX` siblings every `subscribeTo*` tears down first).
- "Load into Log": restores a day into `dailyTodoEntries`, jumps to step 1. "Delete": same `confirm()`-then-callable pattern as `deleteStandupSave`/`deleteRoadmapItem`.
- Per-row "Export to Excel" (2026-08-06): builds that day's workbook from `save.entries` via the same `buildDailyTodoExcelWorkbook()`.
- "Export All" (`exportAllDailyTodoSavesToExcel()`): one workbook — "Overview" sheet (one row/day, newest-first, total/unassigned counts) + one sheet per location pooling items across all days (rows tagged with source `Date`). Same shape as Standup's Export All, minus date-range/Outlook (no email step here).

`DAILY_TODO_APP_KEY` wired everywhere `STANDUP_APP_KEY` is in app.js (`MANAGEABLE_TABS`, `updateAppChrome`'s `hideTicketChrome`/`isTicketApp`, `HERO_COPY`, `subscribeToCurrentApp`) and mirrored in functions/index.js's own `MANAGEABLE_TABS` (`sanitizeTabs`) — both copies kept in sync by hand (see [Architecture: core invariants](architecture-core.md)).
