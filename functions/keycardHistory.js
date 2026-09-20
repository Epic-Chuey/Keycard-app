// Keycard Submission History (added 2026-08-19) - a persisted record of
// every Keycard-mode CW Email Request send, tracked through the
// signing process so staff can see which requests are still awaiting the
// customer's signature + photo ID vs. already complete. See
// docs/email-request-attachments-embed-tab.md.
//
// One doc per submission at keycardRequestHistory/{requestId}, requestId is
// minted CLIENT-SIDE (public/index.html embed script) the first time the
// Keycard mode is touched for a draft, so signing sub-flows that finish
// before Send can still tag their data with it. All writes are
// `.set(..., {merge:true})` from functions/index.js's onCall/onRequest
// handlers (Admin SDK) - this file only holds the pure, dependency-free
// helpers those handlers share, same split as signatureRequests.js.
//
// Status rollup: "yes" (physical form) submissions are complete the moment
// they're sent - the signed paper is already an attachment. "no" (digital
// signature) submissions start "pending" and only become "complete" once
// EVERY card counted at Send time (cardCount) has both a photo ID on file
// and a completed signature - computeKeycardHistoryStatus is the single
// source of truth for that so the in-person save path and the remote
// sign.html path (which can each complete different cards, in either
// order) can't disagree about the overall status.

const KEYCARD_REQUEST_HISTORY_COLLECTION = "keycardRequestHistory";
const KEYCARD_PHOTO_ID_STORAGE_PREFIX = "keycardPhotoIds";
const MAX_KEYCARD_PHOTO_ID_BYTES = 8 * 1024 * 1024; // 8 MB, matches roadmap/issue attachment caps
const MAX_KEYCARD_PHOTO_ID_BASE64_CHARS = Math.ceil((MAX_KEYCARD_PHOTO_ID_BYTES * 4) / 3) + 1024;
const KEYCARD_REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const KEYCARD_CARD_NUMBER_RE = /^[1-7]$/;

function sanitizeEntriesSummary(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((e) => e && typeof e === "object")
    .slice(0, 7)
    .map((e) => ({
      companyName: typeof e.companyName === "string" ? e.companyName.trim().slice(0, 200) : "",
      tenantName: typeof e.tenantName === "string" ? e.tenantName.trim().slice(0, 200) : "",
      keycardNumber: typeof e.keycardNumber === "string" ? e.keycardNumber.trim().slice(0, 40) : "",
      email: typeof e.email === "string" ? e.email.trim().slice(0, 200) : "",
      phone: typeof e.phone === "string" ? e.phone.trim().slice(0, 40) : "",
      action: typeof e.action === "string" ? e.action.trim().slice(0, 40) : "",
    }));
}

function sanitizeExtraLocationLines(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s) => typeof s === "string" && s.trim())
    .slice(0, 20)
    .map((s) => s.trim().slice(0, 300));
}

// Full, unsummarized keycard entries (added for the "Save"/Edit flow below) -
// contrast with sanitizeEntriesSummary above, which only keeps 5 display
// fields per entry and is lossy (loses Transfer/Replacement/Request Card
// sub-fields, notes, access level, replacement pairs, etc.). This keeps
// every field the client's Se() "keycard" case / eraBuildKeycardEntryDataForHistory()
// can produce, so a saved-then-Edited submission can fully repopulate both
// the outer CW Email Request form and the Keycard Form modal, not just the
// Keycard Form modal's Card blocks.
function sanitizeKeycardFullEntries(arr) {
  if (!Array.isArray(arr)) return [];
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const bool = (v) => v === true;
  return arr
    .filter((e) => e && typeof e === "object")
    .slice(0, 30)
    .map((e) => ({
      companyName: str(e.companyName, 200),
      tenantName: str(e.tenantName, 200),
      keycard: str(e.keycard, 40),
      // Date Issued/Date Returned (added per-card, 2026-08-21) - these were
      // already being collected client-side (eraBuildKeycardEntryDataForHistory)
      // but silently dropped here, so they never survived to Firestore at
      // all - "Missing the Date Issued" on the generated Keycard Form PDF
      // traced back to this, not to the PDF-fill code itself.
      dateIssued: str(e.dateIssued, 20),
      dateReturned: str(e.dateReturned, 20),
      notes: str(e.notes, 2000),
      email: str(e.email, 200),
      phone: str(e.phone, 40),
      activate: bool(e.activate),
      deactivate: bool(e.deactivate),
      troubleshoot: bool(e.troubleshoot),
      transfer: bool(e.transfer),
      transferFrom: str(e.transferFrom, 300),
      transferTo: str(e.transferTo, 300),
      requestcard: bool(e.requestcard),
      location: str(e.location, 300),
      quantity: str(e.quantity, 10),
      managerEmail: str(e.managerEmail, 200),
      issue: str(e.issue, 2000),
      fee: bool(e.fee),
      accessValue: str(e.accessValue, 300),
      replacement: bool(e.replacement),
      replLocation: str(e.replLocation, 300),
      replServesCubework: bool(e.replServesCubework),
      replServesUnis: bool(e.replServesUnis),
      replServesHikcentral: bool(e.replServesHikcentral),
      replServesUnifi: bool(e.replServesUnifi),
      replCompanyName: str(e.replCompanyName, 200),
      replTenantName: str(e.replTenantName, 200),
      replEmail: str(e.replEmail, 200),
      replPhone: str(e.replPhone, 40),
      replPairs: Array.isArray(e.replPairs)
        ? e.replPairs
            .filter((p) => p && typeof p === "object")
            .slice(0, 20)
            .map((p) => ({ oldKeycard: str(p.oldKeycard, 40), newKeycard: str(p.newKeycard, 40), fee: bool(p.fee) }))
        : [],
    }));
}

// Keycard Form modal snapshot (added for the "Save"/Edit flow below) - the
// same shape the modal's own savedFormState/saveFormStateSnapshot() already
// use for a same-session close+reopen restore, persisted server-side too so
// Editing a Pending submission from a DIFFERENT session (or after the page
// was reloaded) can still restore it. Signatures are data: URLs (drawn PNG
// canvases) - capped in size/count below since Firestore has a 1MB/doc limit.
const KEYCARD_FORM_SIGNATURE_DATAURL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const MAX_KEYCARD_FORM_SIGNATURE_DATAURL_CHARS = 300000;

function sanitizeKeycardFormSnapshot(snap) {
  if (!snap || typeof snap !== "object") return null;
  const byField = {};
  if (snap.byField && typeof snap.byField === "object") {
    for (const [k, v] of Object.entries(snap.byField).slice(0, 60)) {
      if (typeof v === "string") byField[String(k).slice(0, 60)] = v.slice(0, 2000);
    }
  }
  const byCheckbox = {};
  if (snap.byCheckbox && typeof snap.byCheckbox === "object") {
    for (const [k, v] of Object.entries(snap.byCheckbox).slice(0, 60)) {
      byCheckbox[String(k).slice(0, 60)] = v === true;
    }
  }
  const photoId = {};
  if (snap.photoId && typeof snap.photoId === "object") {
    for (const [k, v] of Object.entries(snap.photoId).slice(0, 20)) {
      if (typeof v === "string") photoId[String(k).slice(0, 10)] = v.slice(0, 20);
    }
  }
  const cardActions = {};
  if (snap.cardActions && typeof snap.cardActions === "object") {
    for (const [k, v] of Object.entries(snap.cardActions).slice(0, 20)) {
      if (typeof v === "string") cardActions[String(k).slice(0, 10)] = v.slice(0, 40);
    }
  }
  const signatures = {};
  if (snap.signatures && typeof snap.signatures === "object") {
    for (const [k, v] of Object.entries(snap.signatures).slice(0, 10)) {
      if (!v || typeof v !== "object") continue;
      const dataUrl =
        typeof v.dataUrl === "string" && KEYCARD_FORM_SIGNATURE_DATAURL_RE.test(v.dataUrl)
          ? v.dataUrl.slice(0, MAX_KEYCARD_FORM_SIGNATURE_DATAURL_CHARS)
          : "";
      if (!dataUrl) continue;
      signatures[String(k).slice(0, 60)] = {
        dataUrl,
        signerName: typeof v.signerName === "string" ? v.signerName.trim().slice(0, 200) : "",
        consented: v.consented === true,
      };
    }
  }
  return { byField, byCheckbox, photoId, cardActions, signatures };
}

// Per-entry "Signature / ID" ink (2026-08-21+, CW Email Request -> Keycard
// -> Submission "Edit" full restore) - one PNG data URL per card/entry
// NUMBER (string "1".."7"), same positional convention photoIds/signedCards
// above already use. This is the inline per-entry canvas on the MAIN form
// (era-k-signid-canvas), a separate, simpler feature from the Keycard Form
// modal's own signatures map inside sanitizeKeycardFormSnapshot above - but
// the exported PNG shape is identical (opaque background, no alpha), so the
// same regex/size cap applies unchanged.
// Oversized is REJECTED, not truncated (2026-08-29 fix). This used to
// .slice() to the cap like sanitizeKeycardFormSnapshot above does - but a
// PNG data URL cut off mid-stream is not a smaller signature, it's an
// undecodable one, and it was stored under signIdSignatures as if it were
// fine. Submission > Edit then fed it to an Image that could never fire
// onload, so the card came back with no signature and no error anywhere. The
// caller (saveKeycardSignIdSignature, functions/index.js) already turns ""
// into an "Invalid or oversized signature image." HttpsError, so refusing
// here surfaces the problem instead of silently persisting a corrupt one.
function sanitizeKeycardSignIdSignatureDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return "";
  if (!KEYCARD_FORM_SIGNATURE_DATAURL_RE.test(dataUrl)) return "";
  if (dataUrl.length > MAX_KEYCARD_FORM_SIGNATURE_DATAURL_CHARS) return "";
  return dataUrl;
}

// "complete" iff (a) the request has actually been sent (Preview > Send,
// not just Save'd as a draft - see the `sent` param, added so a fully
// signed-and-photo'd-but-never-sent submission doesn't silently drop out of
// the "Pending" tab before anyone actually emailed it) AND (b) every card
// 1..cardCount has both a photo ID and a signature-completion marker
// (signedCards). cardCount === 0 (no cards tracked yet, e.g. before any
// entry was set to Activate/Replacement) never reports complete on its own
// here - callers only invoke this once there's at least one relevant card.
// `sent` also now gates the "yes" (physical-form) path, which previously
// bypassed this helper and was marked complete the moment ANY
// recordKeycardSubmission call touched it (including a plain Save) - see
// functions/index.js's recordKeycardSubmission.
function computeKeycardHistoryStatus(photoIds, signedCards, cardCount, sent) {
  if (sent !== true) return "pending";
  if (!Number.isInteger(cardCount) || cardCount <= 0) return "pending";
  const ids = photoIds && typeof photoIds === "object" ? photoIds : {};
  const signed = signedCards && typeof signedCards === "object" ? signedCards : {};
  for (let n = 1; n <= cardCount; n++) {
    const key = String(n);
    if (!ids[key] || !signed[key]) return "pending";
  }
  return "complete";
}

function dataUrlToBase64(dataUrl) {
  if (typeof dataUrl !== "string") return "";
  const idx = dataUrl.indexOf(",");
  return idx !== -1 ? dataUrl.slice(idx + 1) : dataUrl;
}

// Assembles the {fieldValues, checkboxFields, photoIdSelections, signatures}
// input buildSignedKeycardFormPdf() (signatureRequests.js) needs, from a LIVE
// keycardRequestHistory doc - covering EVERY card (not just one) plus the
// staff "Issued By" sign-off, so the resulting PDF actually reflects the
// whole submission instead of one card's fragment. Card position n (1-7)
// maps directly to fullEntries[n-1]/signIdSignatures[n]/photoIds[n] - the
// same positional convention every other per-card feature in this file
// already uses (see eraWireKeycardSignId's entryNumber() on the client:
// DOM-entry-index+1, not a fanned-out Replacement-pair count), so a
// Replacement entry contributes exactly one card block (its FIRST
// old->new pair, if any) same as it always has for this newer per-entry
// UI - unlike the retired Keycard Form modal's fanOutEntriesForCards(),
// which fanned one Replacement entry into one card per pair.
function buildKeycardFormPdfInputsFromHistory(hist) {
  hist = hist && typeof hist === "object" ? hist : {};
  const fieldValues = {};
  const checkboxFields = {};
  const photoIdSelections = {};
  const signatures = [];

  if (typeof hist.licenseeCompanyName === "string") fieldValues.licensee_company_name = hist.licenseeCompanyName;
  if (typeof hist.yardiDealAccount === "string") fieldValues.yardi_deal_account_number = hist.yardiDealAccount;
  if (typeof hist.locationText === "string") fieldValues.property_access_location = hist.locationText;
  if (typeof hist.floorNumber === "string") fieldValues.floor_number = hist.floorNumber;
  if (typeof hist.unitNumber === "string") fieldValues.unit_number = hist.unitNumber;
  if (typeof hist.issuedByName === "string") fieldValues.staff_print_name = hist.issuedByName;
  if (typeof hist.issuedByDate === "string") fieldValues.issued_date = hist.issuedByDate;
  if (typeof hist.issuedBySignature === "string" && hist.issuedBySignature) {
    signatures.push({ field: "staff_signature", pngBase64: dataUrlToBase64(hist.issuedBySignature) });
  }

  const entries = Array.isArray(hist.fullEntries) ? hist.fullEntries : [];
  const signIdSignatures = hist.signIdSignatures && typeof hist.signIdSignatures === "object" ? hist.signIdSignatures : {};
  const photoIds = hist.photoIds && typeof hist.photoIds === "object" ? hist.photoIds : {};

  entries.slice(0, 7).forEach((entry, idx) => {
    // Replacement no longer uses the Keycard Form fill/sign flow (2026-08-22,
    // per Huy's request - see docs/email-request-attachments-embed-tab.md,
    // "Replacement: doesn't use Keycard Form / doesn't attach to
    // Attachments") - only Activate entries get a card here now. Card
    // position n (1-7) still maps to the entry's own DOM index+1 (not
    // renumbered), same convention as before.
    if (!entry || !entry.activate) return;
    const n = idx + 1;
    const key = String(n);
    fieldValues["card" + n + "_name"] = entry.tenantName || "";
    fieldValues["card" + n + "_keycard_number"] = entry.keycard || "";
    fieldValues["card" + n + "_email"] = entry.email || "";
    fieldValues["card" + n + "_phone"] = entry.phone || "";
    if (entry.dateIssued) fieldValues["card" + n + "_date_issued"] = entry.dateIssued;
    if (entry.dateReturned) fieldValues["card" + n + "_date_returned"] = entry.dateReturned;
    checkboxFields["card" + n + "_fee_included"] = !!entry.fee;
    if (photoIds[key]) photoIdSelections[key] = "yes";
    const sig = signIdSignatures[key];
    if (typeof sig === "string" && sig) signatures.push({ field: "card" + n + "_signature", pngBase64: dataUrlToBase64(sig) });
  });

  return { fieldValues, checkboxFields, photoIdSelections, signatures };
}

module.exports = {
  KEYCARD_REQUEST_HISTORY_COLLECTION,
  KEYCARD_PHOTO_ID_STORAGE_PREFIX,
  MAX_KEYCARD_PHOTO_ID_BYTES,
  MAX_KEYCARD_PHOTO_ID_BASE64_CHARS,
  KEYCARD_REQUEST_ID_RE,
  KEYCARD_CARD_NUMBER_RE,
  sanitizeEntriesSummary,
  sanitizeExtraLocationLines,
  sanitizeKeycardFullEntries,
  sanitizeKeycardFormSnapshot,
  sanitizeKeycardSignIdSignatureDataUrl,
  computeKeycardHistoryStatus,
  buildKeycardFormPdfInputsFromHistory,
};
