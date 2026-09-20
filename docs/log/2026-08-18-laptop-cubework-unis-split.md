# 2026-08-18: CW Email Request > Laptop — Cubework/Unis split

The Laptop tab, previously one shared shape (Company Name/Tenant Name/Unit Number/Laptop Model or Asset Tag/Office or Warehouse/Email/Phone via `ERA_SIMPLE_MODES`), is now split behind a Serves gate (Cubework/Unis, same mutually-exclusive pair as Keycard/Wi-Fi/Printer).

**Cubework** gets a bespoke per-entry field set: autocomplete Location (shared Cubework location catalog), a new Job Title select (Janitor/Maintenance/Facility Lead/Facility Manager/Coordinator/National Manager/C-Level/Development/Sales, shown only for New Laptop), Employee Name/Employee ID (renamed from Company/Tenant Name), a new Report to Manager (email) field (New Laptop only, auto-Cc'd), and Employee Personal Email/Phone (renamed from Email/Phone, optional, labels gain " or CW" under Troubleshoot). Office or Warehouse, Unit Number, and Laptop Model/Asset Tag are removed entirely for Cubework. The IT Form attachment is required for New Laptop, not required for Troubleshoot.

**Unis** is untouched — same shape, moved off the shared `laptop` `ERA_SIMPLE_MODES` key onto its own `laptopUnis` key/`era_lt_unis_*` ids so Cubework's bespoke entries could take over `era_lt_entries`.

Implementation follows Phone's 2026-08-16 precedent (a shared shape diverging enough to warrant a bespoke rebuild rather than more branching in `ERA_SIMPLE_MODES`/`buildGeneric()`): new `eraCreateLaptopEntry()` client-side, and `buildLaptop()`/`buildLaptopCubework()` server-side in `functions/emailRequest.js` (Unis still routes through the original, unmodified `buildGeneric("laptop", p)`). Both `public/index.html` and `functions/emailRequest.js` must deploy together since Laptop's payload shape changed on both sides for Cubework.

Files: `public/index.html`, `functions/emailRequest.js`
