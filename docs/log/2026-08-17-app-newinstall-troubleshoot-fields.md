# 2026-08-17: CW Email Request, App/Soft/Hardware: New Install/Access + Troubleshoot field changes

New Install/Access and Troubleshoot (sharing `ERA_SIMPLE_MODES`'s `app` entry / `buildGeneric("app", p)`; Hardware Request is untouched) gained a descriptive note ("Please describe what needs to be set up.") above Company Name, Office or Warehouse moved directly below that note (`moveTypeAboveCompany`/`separateEmailFromType` flags), and a new optional "Laptop SBN#" field below Office or Warehouse. The per-entry "Email" field became optional and was renamed "Manager's Email" (`emailLabelOverride`/`emailOptionalOverride`). Attachment was already optional/unvalidated for this tab, so no change was needed there.

Server side, `GENERIC_CONFIG.app` gained `emailOptional: true` and `emailLabel: "Manager's Email"`; `buildGeneric()`'s required-fields list drops `"email"` when `cfg.emailOptional` (Company Name, Unit Number, Application Name, Phone stay required). Entry lines now print `${cfg.emailLabel || "Email"}: ...` and a new `Laptop SBN#: ...` line when `entry.sbn` is present.

Files: `public/index.html`, `functions/emailRequest.js`
