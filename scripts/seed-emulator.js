// Seeds the Firestore Emulator's accessControl collection with a couple of
// representative test accounts, for local Preview only (see
// .claude/launch.json's "emulator-preview" config and firebase.json's
// "emulators" block). Run this while `firebase emulators:start` (or the
// "emulator-preview" launch config) is up:
//
//   npm run seed:emulator
//
// Setting FIRESTORE_EMULATOR_HOST below points the Admin SDK at the local
// emulator instead of the real "keycard-helpdesk" project - this script can
// never write to production Firestore, even by accident, because there is no
// code path here that uses real credentials.
//
// Safe to re-run: every write uses { merge: true } against a fixed doc ID.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const admin = require("firebase-admin");
admin.initializeApp({ projectId: "keycard-helpdesk" });
const db = admin.firestore();

// Mirrors MANAGEABLE_TABS in functions/index.js - kept in sync by hand since
// this script intentionally never requires functions/index.js (that file
// calls admin.initializeApp() itself and wires Cloud Functions secrets that
// don't resolve outside a deployed/emulated function).
const MANAGEABLE_TABS = ["standup", "dailyTodo", "roadmap", "emailRequestAttachmentsEmbed", "issue"];

// A representative slice of ERA_TREE's leaves (functions/index.js) - covers
// every top-level mode so CW Email Request's permission gating has something
// real to exercise in Preview, without hand-duplicating the entire tree here.
const ERA_PERMISSIONS_FULL = [
  "KEYCARD.ACTIVATE", "KEYCARD.DEACTIVATE", "KEYCARD.REPLACEMENT", "KEYCARD.TROUBLESHOOT", "KEYCARD.TRANSFER", "KEYCARD.REQUEST_BLANK_KEYCARD",
  "WIFI.CUBEWORK", "WIFI.UNIS",
  "ELECTRICAL.CUBEWORK.CREATE", "ELECTRICAL.CUBEWORK.TROUBLESHOOT", "ELECTRICAL.CUBEWORK.DEACTIVATE",
  "ELECTRICAL.UNIS.CREATE", "ELECTRICAL.UNIS.TROUBLESHOOT", "ELECTRICAL.UNIS.DEACTIVATE",
  "SOFTWARE.CUBEWORK.LAPTOP.NEW_INSTALL", "SOFTWARE.CUBEWORK.LAPTOP.TROUBLESHOOT", "SOFTWARE.CUBEWORK.LAPTOP.REMOVE",
  "SOFTWARE.CUBEWORK.PHONE.NEW_INSTALL", "SOFTWARE.CUBEWORK.PHONE.TROUBLESHOOT", "SOFTWARE.CUBEWORK.PHONE.REMOVE",
  "SOFTWARE.UNIS.LAPTOP.NEW_INSTALL", "SOFTWARE.UNIS.LAPTOP.TROUBLESHOOT", "SOFTWARE.UNIS.LAPTOP.REMOVE",
  "SOFTWARE.UNIS.PHONE.NEW_INSTALL", "SOFTWARE.UNIS.PHONE.TROUBLESHOOT", "SOFTWARE.UNIS.PHONE.REMOVE",
  "HARDWARE.AP_NODE.NEW_AP_NODE", "HARDWARE.AP_NODE.TROUBLESHOOT", "HARDWARE.AP_NODE.REPLACEMENT",
  "HARDWARE.CAMERA.NEW_CAMERA", "HARDWARE.CAMERA.TROUBLESHOOT", "HARDWARE.CAMERA.REPLACEMENT",
  "HARDWARE.NVR.NEW_NVR", "HARDWARE.NVR.TROUBLESHOOT", "HARDWARE.NVR.REPLACEMENT",
  "HARDWARE.LAPTOP_PHONE.NEW_HIRE", "HARDWARE.LAPTOP_PHONE.LAPTOP", "HARDWARE.LAPTOP_PHONE.PHONE",
  "HARDWARE.PRINTER.CUBEWORK.SETUP_NEW_PRINTER", "HARDWARE.PRINTER.CUBEWORK.NEW_REPLACE_PRINTER", "HARDWARE.PRINTER.CUBEWORK.TROUBLESHOOT",
  "HARDWARE.PRINTER.TENANT.TROUBLESHOOT",
];

// Note: the real owner (huy.nguyen@cubework.com) is NOT seeded here - it
// doesn't need an accessControl doc at all. getAccessInfo() in
// functions/index.js hardcodes OWNER_EMAIL to role "full" with every
// tab/permission unrestricted (null), bypassing this collection entirely -
// see firestore.rules' isOwner()/isOwner-bypass comments for the same rule
// client-side. These two accounts exist purely to test *non-owner*
// permission gating (Manage Access, CW Email Request mode gating) in
// Preview without touching real accounts.
const SEED_ACCOUNTS = [
  {
    email: "preview.full@cubework.com",
    role: "full",
    position: "dev",
    tabs: MANAGEABLE_TABS,
    eraModes: [],
    eraKeycardActions: [],
    eraHardwareCategories: [],
    eraPermissions: ERA_PERMISSIONS_FULL,
    showVideo: true,
    disableAnimations: false,
  },
  {
    email: "preview.view@cubework.com",
    role: "view",
    position: "sale",
    tabs: ["emailRequestAttachmentsEmbed"],
    eraModes: [],
    eraKeycardActions: [],
    eraHardwareCategories: [],
    eraPermissions: ["KEYCARD.ACTIVATE"],
    showVideo: true,
    disableAnimations: false,
  },
];

async function main() {
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();
  for (const account of SEED_ACCOUNTS) {
    const ref = db.collection("accessControl").doc(account.email);
    batch.set(ref, { ...account, addedBy: "seed-script", addedAt: now }, { merge: true });
  }
  await batch.commit();
  console.log(`Seeded ${SEED_ACCOUNTS.length} accessControl doc(s) into the Firestore emulator (${process.env.FIRESTORE_EMULATOR_HOST}):`);
  SEED_ACCOUNTS.forEach((a) => console.log(`  - ${a.email} (${a.role})`));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed - is the Firestore emulator running (firebase emulators:start)?", err.message);
    process.exit(1);
  });
