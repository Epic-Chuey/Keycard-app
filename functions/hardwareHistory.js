// Hardware Submission History (added 2026-10-02, per Huy's written spec:
// "Dashboard > Hardware Submission ... reuse the existing Dashboard
// Submission features") - same shape as functions/softwareHistory.js /
// functions/employeeHistory.js. See functions/index.js's
// recordHardwareSubmission/deleteHardwareHistory/setHardwareHistoryStatus
// callables and docs/email-request-attachments-embed-tab.md.
//
// One doc per Hardware request (Printer, Phone, or Hardware-route Laptop) at
// hardwareRequestHistory/{requestId}; requestId is minted CLIENT-SIDE
// (public/index.html embed script) the first time a Hardware request is
// Saved, Previewed or Sent, so Save -> Preview -> Send is one record. Writes
// are `.set(..., {merge:true})` from the callables (Admin SDK) - this file
// only holds the pure sanitizers.
//
// The three forms have unrelated field sets, so the doc stores a generic,
// display-ready summary (`details` = request-level label/value rows,
// `entries[].rows` = one label/value list per entry) plus `formStateJson`, an
// opaque snapshot of the form's controls that the client uses to refill the
// form on Edit. Firestore forbids nested arrays, hence entries as objects and
// the snapshot as a JSON string.

const HARDWARE_REQUEST_HISTORY_COLLECTION = "hardwareRequestHistory";
const HARDWARE_REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const HARDWARE_MODES = ["printer", "phone", "laptop"];
const HARDWARE_CATEGORY_BY_MODE = { printer: "Printer", phone: "Phone", laptop: "Laptop" };

const clip = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function sanitizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .slice(0, 40)
    .map((r) => ({ label: clip(r && r.label, 100), value: clip(r && r.value, 2000) }))
    .filter((r) => r.label && r.value);
}

function sanitizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, 50).map((en) => ({ rows: sanitizeRows(en && en.rows) }));
}

// Opaque to the server: must be a JSON string that parses; anything else (or
// anything over the cap) is dropped rather than truncated - a truncated JSON
// string would be corrupt, not smaller (see docs/pitfalls.md #17).
function sanitizeFormStateJson(v) {
  if (typeof v !== "string" || v.length > 60000) return "";
  try {
    JSON.parse(v);
  } catch (e) {
    return "";
  }
  return v;
}

module.exports = {
  HARDWARE_REQUEST_HISTORY_COLLECTION,
  HARDWARE_REQUEST_ID_RE,
  HARDWARE_MODES,
  HARDWARE_CATEGORY_BY_MODE,
  sanitizeRows,
  sanitizeEntries,
  sanitizeFormStateJson,
  clip,
};
