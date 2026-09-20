// Server-side Keycard Form PDF fill/stamp for the remote e-signature
// workflow (added 2026-08-18). Mirrors public/index.html's client-side
// buildFilledPdf() field-for-field (see docs/email-request-attachments-embed-tab.md,
// "Keycard Form remote e-signature") but runs in Node so a tenant's
// remotely-submitted signature (received by submitSignatureRequest, with no
// Firebase Auth session at all) can be merged server-side into the exact
// same document the staff member filled out when they sent the signing
// link - the client never gets to build/flatten this copy itself.
//
// PDF field names come from the same authoritative pypdf field dump used by
// the in-person flow - see functions/index.js's logKeycardFormSignature
// comment and docs/email-request-attachments-embed-tab.md.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument } = require("pdf-lib");

const FORM_PDF_PATH = path.join(__dirname, "assets", "keycard-form", "Cubework_Keycard_Form_v2.1.pdf");
let cachedFormBytes = null;
function loadFormBytes() {
  if (!cachedFormBytes) cachedFormBytes = fs.readFileSync(FORM_PDF_PATH);
  return cachedFormBytes;
}

function pngDataUrlToBytes(pngBase64) {
  const base64 = pngBase64.includes(",") ? pngBase64.split(",")[1] : pngBase64;
  return Buffer.from(base64, "base64");
}

// { fieldValues: {name: text}, checkboxFields: {name: bool},
//   photoIdSelections: {"1": "yes"|"no", ...}, signatures: [{field, pngBase64}] }
// `signatures` must include EVERY signature stamp for this document (any
// locally-drawn ones captured when the link was sent, plus the newly
// submitted remote one) - order matters the same way the client-side
// version does: capture every signature field's widget rect BEFORE
// form.flatten() removes the interactive fields, fill everything else,
// flatten, THEN stamp the PNGs at their captured rects.
async function buildSignedKeycardFormPdf({ fieldValues, checkboxFields, photoIdSelections, signatures }) {
  const pdfDoc = await PDFDocument.load(loadFormBytes());
  const form = pdfDoc.getForm();
  const page = pdfDoc.getPages()[0]; // single-page form

  const sigRects = {};
  (signatures || []).forEach(({ field }) => {
    try {
      const widget = form.getTextField(field).acroField.getWidgets()[0];
      sigRects[field] = widget.getRectangle();
    } catch (e) {
      console.error("buildSignedKeycardFormPdf: couldn't find signature field", field, e.message);
    }
  });

  Object.entries(fieldValues || {}).forEach(([name, value]) => {
    try {
      form.getTextField(name).setText(typeof value === "string" ? value : "");
    } catch (e) {
      console.error("buildSignedKeycardFormPdf: couldn't set text field", name, e.message);
    }
  });
  Object.entries(checkboxFields || {}).forEach(([name, checked]) => {
    try {
      const cb = form.getCheckBox(name);
      if (checked) cb.check();
      else cb.uncheck();
    } catch (e) {
      console.error("buildSignedKeycardFormPdf: couldn't set checkbox", name, e.message);
    }
  });
  Object.entries(photoIdSelections || {}).forEach(([n, val]) => {
    ["yes", "no"].forEach((which) => {
      try {
        const cb = form.getCheckBox(`card${n}_photo_id_${which}`);
        if (val === which) cb.check();
        else cb.uncheck();
      } catch (e) {
        console.error("buildSignedKeycardFormPdf: couldn't set photo id field", n, which, e.message);
      }
    });
  });

  form.flatten();

  for (const s of signatures || []) {
    const rect = sigRects[s.field];
    if (!rect || !s.pngBase64) continue;
    const pngBytes = pngDataUrlToBytes(s.pngBase64);
    const pngImage = await pdfDoc.embedPng(pngBytes);
    const pad = 2;
    const maxW = Math.max(1, rect.width - pad * 2);
    const maxH = Math.max(1, rect.height - pad * 2);
    const scale = Math.min(maxW / pngImage.width, maxH / pngImage.height);
    const w = pngImage.width * scale;
    const h = pngImage.height * scale;
    page.drawImage(pngImage, {
      x: rect.x + pad + (maxW - w) / 2,
      y: rect.y + pad + (maxH - h) / 2,
      width: w,
      height: h,
    });
  }

  return pdfDoc.save();
}

function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

module.exports = { buildSignedKeycardFormPdf, sha256Hex };
