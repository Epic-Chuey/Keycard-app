const{onCall,onRequest,HttpsError}=require("firebase-functions/v2/https"),{setGlobalOptions}=require("firebase-functions/v2"),admin=require("firebase-admin"),crypto=require("crypto"),{Client}=require("@microsoft/microsoft-graph-client"),{GoogleGenAI}=require("@google/genai"),{getAccessToken}=require("./graphAuth"),{submitEmailRequest:buildAndSendEmailRequest,buildEmailRequest,entryKeycardAction}=require("./emailRequest"),{buildSignedKeycardFormPdf,sha256Hex:signatureSha256Hex}=require("./signatureRequests"),{KEYCARD_REQUEST_HISTORY_COLLECTION,KEYCARD_PHOTO_ID_STORAGE_PREFIX,MAX_KEYCARD_PHOTO_ID_BYTES,MAX_KEYCARD_PHOTO_ID_BASE64_CHARS,KEYCARD_REQUEST_ID_RE,KEYCARD_CARD_NUMBER_RE,sanitizeEntriesSummary:sanitizeKeycardEntriesSummary,sanitizeExtraLocationLines:sanitizeKeycardExtraLocationLines,sanitizeKeycardFullEntries,sanitizeKeycardFormSnapshot,sanitizeKeycardSignIdSignatureDataUrl,computeKeycardHistoryStatus,buildKeycardFormPdfInputsFromHistory}=require("./keycardHistory");admin.initializeApp();const db=admin.firestore(),bucket=admin.storage().bucket(),FIREBASE_PROJECT_ID="keycard-helpdesk";
// Timestamp/FieldValue via the modular "firebase-admin/firestore" import, not
// admin.firestore.Timestamp/FieldValue - the Functions
// Emulator (firebase-tools' admin-init shim for onCall v2 functions) leaves
// BOTH namespaced statics undefined inside a db.runTransaction() callback
// even though admin.firestore() itself resolves fine (confirmed: fixing just
// Timestamp surfaced the identical "Cannot read properties of undefined"
// failure one line later on FieldValue.serverTimestamp()). This modular
// import isn't affected and matches Google's own current recommendation over
// the namespaced statics. Untested in production but harmless there either
// way - same class/methods either import path.
const{Timestamp,FieldValue}=require("firebase-admin/firestore");setGlobalOptions({region:"us-central1",secrets:["MS_CLIENT_ID","MS_CLIENT_SECRET","MS_TENANT_ID","MS_REFRESH_TOKEN"]});const MAILBOX_USER=process.env.MAILBOX_USER||"huy.nguyen@cubework.com",OWNER_EMAIL=MAILBOX_USER,ACCESS_CONTROL_COLLECTION="accessControl",ROLE_RANK={view:1,edit:2,full:3};function normalizeEmail(t){return typeof t=="string"?t.trim().toLowerCase():""}const NAME_FROM_EMAIL_DENYLIST=new Set(["noreply","no-reply","donotreply","do-not-reply","info","support","helpdesk","admin","notifications","alerts","notification","mailer","postmaster","webmaster","system","automated"]);function nameFromEmail(t){if(typeof t!="string"||!t.includes("@"))return null;const e=t.split("@")[0];if(NAME_FROM_EMAIL_DENYLIST.has(e.toLowerCase().replace(/[._-]/g,"")))return null;const a=e.split(/[._+-]+/).filter(Boolean).filter(n=>!/^\d+$/.test(n));return a.length?a.map(n=>n.charAt(0).toUpperCase()+n.slice(1).toLowerCase()).join(" "):null}function senderDisplayName(t,e){const a=typeof t=="string"?t.trim():"";return a&&!a.includes("@")?a:nameFromEmail(e||a)||a||null}function normalizeStateCode(t){if(typeof t!="string")return null;const e=t.trim().toUpperCase();return e?e.slice(0,2):null}const MANAGEABLE_TABS=["standup","dailyTodo","roadmap","emailRequestAttachmentsEmbed","issue"];
// sanitizeTabs (and the sibling era sanitizers just below) used to collapse
// "every current option checked" down to null, on the theory that null means
// "unrestricted." That was the bug (2026-09-02, "no automatic access
// assignment" request): null was also read back as "unrestricted," which
// silently included any tab/mode/action/category added to these lists
// *after* the user's doc was last saved - a brand new permission (like the
// "hardware" era mode) showed up granted to everyone with no admin action.
// Now these always persist an explicit snapshot of exactly what was checked
// at save time, so a future addition to MANAGEABLE_TABS/ERA_MODES/etc. is
// unassigned for every existing user until an admin explicitly grants it via
// Manage Access - see getAccessInfo below for the matching read-side change,
// and migrateAccessControlPermissions for the one-time backfill this needed
// for accounts saved before this change (their doc's field is still literally
// null/missing).
function sanitizeTabs(t){return Array.isArray(t)?[...new Set(t.filter(a=>MANAGEABLE_TABS.includes(a)))]:[]}
// Granular CW Email Request access (2026-08-30): eraModes/eraKeycardActions
// mirror tabs/sanitizeTabs exactly (null = unrestricted/all) but only mean
// anything when emailRequestAttachmentsEmbed is itself an allowed tab.
const ERA_MODES=["keycard","wifi","printer","phone","app","laptop","hardware","electrical"];
const ERA_KEYCARD_ACTIONS=["activate","deactivate","replacement","troubleshoot","transfer","requestcard"];
// Hardware tab sub-permission (2026-09-02) - same null=unrestricted shape as
// ERA_KEYCARD_ACTIONS above, gating the Hardware mode's 5 top-level menu
// categories (see docs/hardware-tab-hover-menu.md for the full hierarchy
// each one covers).
const ERA_HARDWARE_CATEGORIES=["apnode","camera","nvr","laptopphone","printer"];
function sanitizeEraModes(t){return Array.isArray(t)?[...new Set(t.filter(a=>ERA_MODES.includes(a)))]:[]}
function sanitizeEraKeycardActions(t){return Array.isArray(t)?[...new Set(t.filter(a=>ERA_KEYCARD_ACTIONS.includes(a)))]:[]}
function sanitizeEraHardwareCategories(t){return Array.isArray(t)?[...new Set(t.filter(a=>ERA_HARDWARE_CATEGORIES.includes(a)))]:[]}

// Canonical CW Email Request permission tree (2026-09-19 rebuild) - server
// copy of src/app.js's ERA_TREE (kept byte-for-byte equivalent in shape;
// see that file's own big comment for the full rationale). This is the ONE
// place backend authorization (requireEraAccess, below) and the one-time/
// read-time legacy migration (deriveEraPermissionsFromLegacy) resolve real
// submit-request fields into leaf paths against. ERA_MODES/ERA_KEYCARD_
// ACTIONS/ERA_HARDWARE_CATEGORIES above are NOT removed - they stay as the
// vocabulary legacy accessControl docs' eraModes/eraKeycardActions/
// eraHardwareCategories fields are still validated against (sanitizeEraModes
// etc. are still called wherever those legacy fields are still written/
// read - see updateAuthorizedUserRole) - but neither they nor those fields
// are consulted for live gating/enforcement anymore; only eraPermissions is.
const ERA_TREE={
  KEYCARD:{label:"Keycard",children:{ACTIVATE:"Activate",DEACTIVATE:"De-Activate",REPLACEMENT:"Replacement",TROUBLESHOOT:"Troubleshoot",TRANSFER:"Transfer",REQUEST_BLANK_KEYCARD:"Request Blank Keycard"}},
  WIFI:{label:"Wi-Fi",children:{CUBEWORK:"Cubework",UNIS:"Unis"}},
  ELECTRICAL:{label:"Electrical",children:{
    CUBEWORK:{label:"Cubework",children:{CREATE:"Create",TROUBLESHOOT:"Troubleshoot",DEACTIVATE:"De-Activate"}},
    UNIS:{label:"Unis",children:{CREATE:"Create",TROUBLESHOOT:"Troubleshoot",DEACTIVATE:"De-Activate"}},
  }},
  SOFTWARE:{label:"Software",children:{
    CUBEWORK:{label:"Cubework",children:{
      LAPTOP:{label:"Laptop",children:{NEW_INSTALL:"New Install",TROUBLESHOOT:"Troubleshoot",REMOVE:"Remove"}},
      PHONE:{label:"Phone",children:{NEW_INSTALL:"New Install",TROUBLESHOOT:"Troubleshoot",REMOVE:"Remove"}},
    }},
    UNIS:{label:"Unis",children:{
      LAPTOP:{label:"Laptop",children:{NEW_INSTALL:"New Install",TROUBLESHOOT:"Troubleshoot",REMOVE:"Remove"}},
      PHONE:{label:"Phone",children:{NEW_INSTALL:"New Install",TROUBLESHOOT:"Troubleshoot",REMOVE:"Remove"}},
    }},
  }},
  HARDWARE:{label:"Hardware",children:{
    AP_NODE:{label:"AP/Node",children:{NEW_AP_NODE:"New AP/Node",TROUBLESHOOT:"Troubleshoot",REPLACEMENT:"Replacement"}},
    CAMERA:{label:"Camera",children:{NEW_CAMERA:"New Camera",TROUBLESHOOT:"Troubleshoot",REPLACEMENT:"Replacement"}},
    NVR:{label:"NVR",children:{NEW_NVR:"New NVR",TROUBLESHOOT:"Troubleshoot",REPLACEMENT:"Replacement"}},
    LAPTOP_PHONE:{label:"Laptop/Phone",children:{NEW_HIRE:"New Hire",LAPTOP:"Laptop",PHONE:"Phone"}},
    PRINTER:{label:"Printer",children:{
      CUBEWORK:{label:"Cubework",children:{SETUP_NEW_PRINTER:"Setup New Printer",NEW_REPLACE_PRINTER:"New/Replace Printer",TROUBLESHOOT:"Troubleshoot"}},
      TENANT:{label:"Tenant",children:{TROUBLESHOOT:"Troubleshoot"}},
    }},
  }},
};
function walkEraTree(visit,tree,prefix){
  const t=tree||ERA_TREE;
  Object.keys(t).forEach(key=>{
    const node=t[key];
    const path=prefix?`${prefix}.${key}`:key;
    if(typeof node==="string"){visit(path,node,true)}
    else{visit(path,node,false);if(node.children)walkEraTree(visit,node.children,path)}
  });
}
const ERA_ALL_LEAVES=(()=>{const leaves=new Set();walkEraTree((path,node,isLeaf)=>{if(isLeaf)leaves.add(path)});return leaves})();
function eraLeavesUnder(path){
  if(ERA_ALL_LEAVES.has(path))return[path];
  const prefix=path+".";
  return Array.from(ERA_ALL_LEAVES).filter(leaf=>leaf.startsWith(prefix));
}
function sanitizeEraPermissions(t){return Array.isArray(t)?[...new Set(t.filter(a=>ERA_ALL_LEAVES.has(a)))]:[]}
// requireEraAccess (below) checks a submitted request's implied leaf(s)
// against a granted set with .includes()/.some() - "unrestricted" (the
// owner's own null) is handled separately by requireEraAccess's own
// email===OWNER_EMAIL early-return, so this helper never needs to special-
// case null.
function eraHasLeaf(grantedLeaves,leafId){return grantedLeaves.includes(leafId)}
function eraHasAnyLeafUnder(grantedLeaves,pathPrefix){return grantedLeaves.some(leaf=>leaf===pathPrefix||leaf.startsWith(pathPrefix+"."))}
// True only if EVERY leaf under pathPrefix is granted - used where an
// unmapped action (no single corresponding ERA_TREE leaf) must not be
// satisfied by holding just one narrower leaf under that branch, which
// would grant broader access than what was actually checked on the Access
// Page (see requireEraAccess's Phone "replacement"/"activate" handling).
function eraHasAllLeavesUnder(grantedLeaves,pathPrefix){const leaves=eraLeavesUnder(pathPrefix);return leaves.length>0&&leaves.every(leaf=>grantedLeaves.includes(leaf))}

// One-time-migration + read-time-fallback mapping from the legacy flat
// eraModes/eraKeycardActions/eraHardwareCategories fields to the new nested
// eraPermissions leaf set - used both by getAccessInfo (so an unmigrated
// user reads correctly even before migrateAccessControlPermissions has run
// against their doc) and by migrateAccessControlPermissions itself (see its
// own comment for the batch job). See docs/log/ for the exact mapping this
// implements, restated here:
//  - eraModes has "keycard": each old eraKeycardActions entry maps to its
//    KEYCARD.<X> leaf (requestcard->REQUEST_BLANK_KEYCARD, deactivate->
//    DEACTIVATE, the rest are the same name uppercased).
//  - eraModes has "wifi": both WIFI.CUBEWORK and WIFI.UNIS (the old grant
//    was mode-level, not serves-split - granting both is equivalent, not
//    broader).
//  - eraModes has "electrical": all 6 ELECTRICAL.* leaves (same reasoning).
//  - eraModes has "app": all 12 SOFTWARE.* leaves (legacy-compat only - the
//    current UI has no control that submits mode:"app" anymore; Software's
//    own Laptop/Phone cascade routes into mode:"laptop"/"phone" instead -
//    see buildLaptop/buildPhone in emailRequest.js - so this branch is a
//    no-op for any account whose access was granted after that split).
//  - eraModes has "laptop": SOFTWARE.CUBEWORK.LAPTOP.*, SOFTWARE.UNIS.
//    LAPTOP.*, AND HARDWARE.LAPTOP_PHONE.LAPTOP only if eraHardwareCategories
//    also had "laptopphone" (matches today's real dual-gate for that leaf).
//  - eraModes has "phone": same shape as laptop, phone leaves.
//  - eraModes has "printer" AND eraHardwareCategories has "printer": all
//    HARDWARE.PRINTER.* leaves (today's real dual-gate for this path).
//  - eraHardwareCategories has "apnode"/"camera"/"nvr": the full leaf set
//    under that category (placeholder actions, UI-only either way).
//  - eraHardwareCategories has "laptopphone": HARDWARE.LAPTOP_PHONE.NEW_HIRE
//    only (placeholder, category-gated only, no dual requirement).
//  - eraModes has bare "hardware" with no categories: nothing (the old "tab
//    shell only, no category" state has no equivalent under "checking a
//    parent grants all children" - conservative, not broader).
const KEYCARD_ACTION_TO_LEAF={activate:"ACTIVATE",deactivate:"DEACTIVATE",replacement:"REPLACEMENT",troubleshoot:"TROUBLESHOOT",transfer:"TRANSFER",requestcard:"REQUEST_BLANK_KEYCARD"};
function deriveEraPermissionsFromLegacy(d){
  const modes=Array.isArray(d.eraModes)?d.eraModes:[];
  const actions=Array.isArray(d.eraKeycardActions)?d.eraKeycardActions:[];
  const categories=Array.isArray(d.eraHardwareCategories)?d.eraHardwareCategories:[];
  const leaves=new Set();
  if(modes.includes("keycard")){
    actions.forEach(a=>{const leaf=KEYCARD_ACTION_TO_LEAF[a];if(leaf)leaves.add(`KEYCARD.${leaf}`)});
  }
  if(modes.includes("wifi")){leaves.add("WIFI.CUBEWORK");leaves.add("WIFI.UNIS")}
  if(modes.includes("electrical")){eraLeavesUnder("ELECTRICAL").forEach(l=>leaves.add(l))}
  if(modes.includes("app")){eraLeavesUnder("SOFTWARE").forEach(l=>leaves.add(l))}
  if(modes.includes("laptop")){
    eraLeavesUnder("SOFTWARE.CUBEWORK.LAPTOP").forEach(l=>leaves.add(l));
    eraLeavesUnder("SOFTWARE.UNIS.LAPTOP").forEach(l=>leaves.add(l));
    if(categories.includes("laptopphone"))leaves.add("HARDWARE.LAPTOP_PHONE.LAPTOP");
  }
  if(modes.includes("phone")){
    eraLeavesUnder("SOFTWARE.CUBEWORK.PHONE").forEach(l=>leaves.add(l));
    eraLeavesUnder("SOFTWARE.UNIS.PHONE").forEach(l=>leaves.add(l));
    if(categories.includes("laptopphone"))leaves.add("HARDWARE.LAPTOP_PHONE.PHONE");
  }
  if(modes.includes("printer")&&categories.includes("printer")){eraLeavesUnder("HARDWARE.PRINTER").forEach(l=>leaves.add(l))}
  if(categories.includes("apnode")){eraLeavesUnder("HARDWARE.AP_NODE").forEach(l=>leaves.add(l))}
  if(categories.includes("camera")){eraLeavesUnder("HARDWARE.CAMERA").forEach(l=>leaves.add(l))}
  if(categories.includes("nvr")){eraLeavesUnder("HARDWARE.NVR").forEach(l=>leaves.add(l))}
  if(categories.includes("laptopphone")){leaves.add("HARDWARE.LAPTOP_PHONE.NEW_HIRE")}
  return Array.from(leaves);
}

// tabs/eraModes/eraKeycardActions/eraHardwareCategories: null only for the
// OWNER_EMAIL branch below now (the one deliberate, hardcoded exception - see
// OWNER_EMAIL's own comment: that account can never be locked out, so it
// stays unrestricted forever regardless of any doc). Every other branch
// (no email, no doc, an OTP session past its 30-day expiry, or a real doc)
// resolves these to an explicit array - [] means "nothing granted," matching
// sanitize*'s write-side contract above. A legacy doc saved before this
// change, with the field still literally missing/null, is treated as []
// (no access) rather than re-expanding to "every current option" the way it
// used to - see migrateAccessControlPermissions for the one-time backfill
// that gives those accounts back an explicit snapshot of what they actually
// had, so this change doesn't silently revoke anyone's existing access.
async function getAccessInfo(t){const e=normalizeEmail(t);if(!e)return{role:null,tabs:[],eraModes:[],eraKeycardActions:[],eraHardwareCategories:[],eraPermissions:[],showVideo:!0,disableAnimations:!1};if(e===OWNER_EMAIL.toLowerCase())return{role:"full",tabs:null,eraModes:null,eraKeycardActions:null,eraHardwareCategories:null,eraPermissions:null,showVideo:!0,disableAnimations:!1};const a=await db.collection(ACCESS_CONTROL_COLLECTION).doc(e).get();if(!a.exists)return{role:null,tabs:[],eraModes:[],eraKeycardActions:[],eraHardwareCategories:[],eraPermissions:[],showVideo:!0,disableAnimations:!1};const n=a.data();
// A session established via email OTP (see verifyEmailOtp, further down in
// this file) is only good for OTP_SESSION_MAX_AGE_MS since the last
// verification, stamped as otpVerifiedAt on this same doc - past that, this
// account counts as having no access at all until they verify a new code,
// exactly matching the identical otpSessionValid() check in firestore.rules.
// A doc with no otpVerifiedAt (every account added directly via Manage
// Access) is unaffected by this and never expires this way.
if(n.otpVerifiedAt&&typeof n.otpVerifiedAt.toMillis==="function"&&Date.now()-n.otpVerifiedAt.toMillis()>OTP_SESSION_MAX_AGE_MS){return{role:null,tabs:[],eraModes:[],eraKeycardActions:[],eraHardwareCategories:[],eraPermissions:[],showVideo:!0,disableAnimations:!0}}
return{role:n.role||null,tabs:Array.isArray(n.tabs)?n.tabs:[],eraModes:Array.isArray(n.eraModes)?n.eraModes:[],eraKeycardActions:Array.isArray(n.eraKeycardActions)?n.eraKeycardActions:[],eraHardwareCategories:Array.isArray(n.eraHardwareCategories)?n.eraHardwareCategories:[],
// eraPermissions (2026-09-19 rebuild): a doc already migrated stores/
// validates it directly; a doc not yet touched by migrateAccessControlPermissions
// falls back to deriving it live from the legacy fields just above, so an
// unmigrated user is never wrongly denied mid-rollout (see that function's
// own comment, and deriveEraPermissionsFromLegacy's).
eraPermissions:Array.isArray(n.eraPermissions)?sanitizeEraPermissions(n.eraPermissions):deriveEraPermissionsFromLegacy(n),
showVideo:n.showVideo!==!1,disableAnimations:n.disableAnimations===!0}}async function getRole(t){return(await getAccessInfo(t)).role}async function requireRole(t,e){if(!t.auth)throw new HttpsError("unauthenticated","Sign in first.");const a=await getRole(t.auth.token.email);if(!a||ROLE_RANK[a]<ROLE_RANK[e])throw new HttpsError("permission-denied",`This action requires ${e} access.`);return a}function requireOwner(t){if(!t.auth)throw new HttpsError("unauthenticated","Sign in first.");if(normalizeEmail(t.auth.token.email)!==OWNER_EMAIL.toLowerCase())throw new HttpsError("permission-denied",`Only ${OWNER_EMAIL} can manage access.`)}

// --- Email OTP sign-in (2026-08-27) ---------------------------------------
// A second, self-service way in alongside the Microsoft 365 popup above: an
// unauthenticated visitor types a @cubework.com address, gets a 6-digit code
// by email, and verifying it both signs them in (via a minted Firebase
// custom token - see verifyEmailOtp below) and, the first time, auto-adds
// them to accessControl as a "basic" account (role "view", limited to the
// CW Email Request tab only). Every other tab, and the Access tab itself,
// stays gated exactly as it already is for everyone else - requireRole/
// requireOwner and firestore.rules' tabAllowed()/isOwner() don't know or
// care how a session was established, only what's in the accessControl doc.
const OTP_COLLECTION = "otpRequests";
const OTP_CODE_RE = /^\d{6}$/;
const OTP_TTL_MS = 10 * 60 * 1000; // a code is good for 10 minutes
const OTP_RESEND_MIN_INTERVAL_MS = 60 * 1000; // 60s between sends
const OTP_MAX_SENDS_PER_WINDOW = 5; // then throttled until the window rolls over
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
const OTP_MAX_VERIFY_ATTEMPTS = 5; // per code, then it's dead - request a new one
// How long a session established via OTP stays valid without re-verifying -
// see otpVerifiedAt below and the matching otpSessionValid() check in
// firestore.rules. Only accounts that carry this field are ever subject to
// it; an admin-added accessControl doc (no otpVerifiedAt) is unaffected.
const OTP_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Basic OTP-created accounts land on CW Email Request only, with the
// existing per-user "no animation" preference (disableAnimations, see
// getAccessInfo/getMyRole above) defaulted on - satisfies "don't run the
// Phoenix background animation for these accounts" without needing a
// separate flag, since app.js/index.html already gate every bit of that
// animation's spawn/rAF work (not just its CSS) behind body.no-animations.
// Matches EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY in src/app.js and the
// "emailRequestAttachmentsEmbed" entry in MANAGEABLE_TABS below - kept as a
// literal here (rather than importing/sharing a constant) since the two
// files already don't share any code, same as every other app key.
const OTP_BASIC_TABS = ["emailRequestAttachmentsEmbed"];
// (2026-09-19: a brand-new OTP self-signup account now gets every
// eraPermissions leaf granted, not a Keycard-only subset - see the
// !snap.exists branch in verifyEmailOtp below. The old OTP_BASIC_ERA_MODES/
// OTP_BASIC_ERA_KEYCARD_ACTIONS scoped-down defaults were removed as dead
// code along with this change.)

function isCubeworkEmail(email) {
  const e = normalizeEmail(email);
  return !!e && e.endsWith("@cubework.com") && e.length > "@cubework.com".length;
}

function generateOtpCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

function hashOtpCode(code, salt) {
  return crypto.createHmac("sha256", salt).update(code).digest("hex");
}

// Never trust a client-supplied role/uid anywhere in this flow - the only
// inputs accepted below are the email itself and (at verify time) the code
// the server generated and emailed.
exports.requestEmailOtp = onCall({ timeoutSeconds: 30 }, async (request) => {
  const email = normalizeEmail(request.data?.email);
  if (!isCubeworkEmail(email)) {
    throw new HttpsError("invalid-argument", "Enter a valid @cubework.com email address.");
  }

  const ref = db.collection(OTP_COLLECTION).doc(email);
  const now = Date.now();
  let code;
  try {
    ({ code } = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;
      if (data?.lastSentAt && now - data.lastSentAt.toMillis() < OTP_RESEND_MIN_INTERVAL_MS) {
        throw new HttpsError("resource-exhausted", "Please wait a moment before requesting another code.");
      }
      let windowStart = data?.windowStart?.toMillis?.() ?? null;
      let sendCount = data?.sendCount ?? 0;
      if (!windowStart || now - windowStart > OTP_SEND_WINDOW_MS) {
        windowStart = now;
        sendCount = 0;
      }
      if (sendCount >= OTP_MAX_SENDS_PER_WINDOW) {
        throw new HttpsError("resource-exhausted", "Too many code requests. Please try again in a while.");
      }
      const freshCode = generateOtpCode();
      const salt = crypto.randomBytes(16).toString("hex");
      tx.set(ref, {
        email,
        codeHash: hashOtpCode(freshCode, salt),
        salt,
        expiresAt: Timestamp.fromMillis(now + OTP_TTL_MS),
        attempts: 0,
        consumedAt: null,
        lastSentAt: FieldValue.serverTimestamp(),
        windowStart: Timestamp.fromMillis(windowStart),
        sendCount: sendCount + 1,
        createdAt: data?.createdAt || FieldValue.serverTimestamp(),
      });
      return { code: freshCode };
    }));
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error("requestEmailOtp: transaction failed:", err);
    throw new HttpsError("internal", "Could not generate a code. Try again.");
  }

  // Local Preview only (see functions/.secret.local) - the emulator's Graph
  // secrets are dummy values by design, so the real send below always fails
  // closed rather than reaching Microsoft. Without this, there'd be no way
  // to ever see a generated code locally. FUNCTIONS_EMULATOR is set by the
  // Cloud Functions runtime itself only when running under
  // `firebase emulators:start`, never in a deployed function - this can
  // never fire in production.
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    console.log(`[emulator] OTP code for ${email}: ${code}`);
  }

  try {
    const graphClient = await getGraphClientForSend();
    await sendPlainHtmlEmail(graphClient, {
      toEmail: email,
      subject: `Your Keycard Helpdesk sign-in code: ${code}`,
      html:
        `<p>Your Keycard Helpdesk sign-in code is:</p>` +
        `<p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>` +
        `<p>This code expires in 10 minutes and can only be used once. If you didn't request this, you can ignore this email.</p>`,
    });
  } catch (err) {
    console.error("requestEmailOtp: failed to send email:", err);
    throw new HttpsError("internal", "Could not send the code email. Try again in a moment.");
  }

  // Deliberately generic - never confirm or deny whether this address
  // already has an accessControl doc (see getAccessInfo below).
  return { ok: true };
});

exports.verifyEmailOtp = onCall({ timeoutSeconds: 30 }, async (request) => {
  const email = normalizeEmail(request.data?.email);
  const code = typeof request.data?.code === "string" ? request.data.code.trim() : "";
  if (!isCubeworkEmail(email) || !OTP_CODE_RE.test(code)) {
    throw new HttpsError("invalid-argument", "Enter the 6-digit code sent to your email.");
  }

  const ref = db.collection(OTP_COLLECTION).doc(email);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: "missing" };
    const data = snap.data();
    if (data.consumedAt) return { status: "consumed" };
    if (!data.expiresAt || data.expiresAt.toMillis() < Date.now()) return { status: "expired" };
    const attempts = data.attempts || 0;
    if (attempts >= OTP_MAX_VERIFY_ATTEMPTS) return { status: "locked" };

    const candidateHash = hashOtpCode(code, data.salt);
    const ok =
      typeof data.codeHash === "string" &&
      candidateHash.length === data.codeHash.length &&
      crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(data.codeHash));

    if (ok) {
      tx.update(ref, { consumedAt: FieldValue.serverTimestamp(), attempts: attempts + 1 });
      return { status: "ok" };
    }
    tx.update(ref, { attempts: attempts + 1 });
    return { status: "bad" };
  });

  if (result.status === "missing") throw new HttpsError("failed-precondition", "Request a new code first.");
  if (result.status === "consumed") throw new HttpsError("failed-precondition", "This code was already used. Request a new one.");
  if (result.status === "expired") throw new HttpsError("deadline-exceeded", "This code has expired. Request a new one.");
  if (result.status === "locked") throw new HttpsError("resource-exhausted", "Too many incorrect attempts. Request a new code.");
  if (result.status === "bad") throw new HttpsError("invalid-argument", "Incorrect code.");

  // Code verified - find-or-create the Firebase Auth user (email is the
  // unique identity per-spec; a stray concurrent verify racing this same
  // create is caught below rather than left to throw).
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw new HttpsError("internal", "Could not prepare your account. Try again.");
    try {
      userRecord = await admin.auth().createUser({ email, emailVerified: true });
    } catch (createErr) {
      if (createErr.code === "auth/email-already-exists") {
        userRecord = await admin.auth().getUserByEmail(email);
      } else {
        console.error("verifyEmailOtp: could not create Firebase user:", createErr);
        throw new HttpsError("internal", "Could not prepare your account. Try again.");
      }
    }
  }
  if (!userRecord.emailVerified) {
    await admin.auth().updateUser(userRecord.uid, { emailVerified: true }).catch(() => {});
  }

  // Bootstrap accessControl exactly once per email, in a transaction so two
  // concurrent verifications for the same address can't both "win" and
  // create/overwrite the doc - the owner is skipped entirely, matching the
  // existing invariant that the owner never has (or needs) a doc at all.
  if (email !== OWNER_EMAIL.toLowerCase()) {
    const accessRef = db.collection(ACCESS_CONTROL_COLLECTION).doc(email);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(accessRef);
      if (!snap.exists) {
        // New-user default access (2026-09-19): a brand-new account - this
        // "doc doesn't exist yet" branch only ever runs once, at the exact
        // moment the accessControl doc is first created - gets full CW
        // Email Request access, every current ERA_TREE leaf granted. This
        // must NOT be reapplied on any later login/verify (see the `else`
        // branch below, which only ever merges otpVerifiedAt): an admin's
        // later edit in Manage Access, including removing the
        // emailRequestAttachmentsEmbed tab entirely or narrowing
        // eraPermissions, is permanent and must survive every future
        // sign-in, refresh, or re-verification.
        tx.set(accessRef, {
          email,
          role: "view",
          position: null,
          tabs: OTP_BASIC_TABS,
          eraModes: ERA_MODES,
          eraKeycardActions: ERA_KEYCARD_ACTIONS,
          eraHardwareCategories: ERA_HARDWARE_CATEGORIES,
          // Full grant: every leaf under ERA_TREE (Keycard/Wi-Fi/Electrical/
          // Software/Hardware, all sub-actions) - see getAccessInfo/
          // sanitizeEraPermissions above for how this is validated/enforced.
          eraPermissions: Array.from(ERA_ALL_LEAVES),
          showVideo: true,
          disableAnimations: true,
          authMethod: "otp",
          addedBy: "otp-self-signup",
          addedAt: FieldValue.serverTimestamp(),
          otpVerifiedAt: FieldValue.serverTimestamp(),
        });
      } else {
        // Already exists (self-signed-up earlier, or added by an admin via
        // Manage Access) - never touch role/tabs/position/etc, only refresh
        // the OTP-session freshness stamp (see OTP_SESSION_MAX_AGE_MS above).
        tx.set(accessRef, { otpVerifiedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    });
  }

  let token;
  try {
    token = await admin.auth().createCustomToken(userRecord.uid);
  } catch (err) {
    // Most likely cause: the runtime service account is missing
    // roles/iam.serviceAccountTokenCreator on itself - see docs/pitfalls.md
    // ("admin.auth().createCustomToken() needs an IAM role..."). That's an
    // operator/console fix, not something retryable from here.
    console.error("verifyEmailOtp: could not mint a sign-in token:", err);
    throw new HttpsError("internal", "Sign-in is temporarily unavailable. Please try again later or contact an admin.");
  }
  return { token };
});

const THREAD_STATUS_COLLECTION="threadStatus",ROADMAP_COLLECTION="roadmapItems",ISSUE_COLLECTION="issueItems";async function getGraphClient(){const t=await getAccessToken();return Client.init({authProvider:e=>e(null,t)})}async function getGraphClientForSend(){const t=await getAccessToken(["https://graph.microsoft.com/Mail.Send"]);return Client.init({authProvider:e=>e(null,t)})}const MAX_FULL_BODY_CHARS=2e4;function htmlToPlainText(t){return t.replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<br\s*\/?>/gi,`
`).replace(/<\/p>/gi,`

`).replace(/<\/div>/gi,`
`).replace(/<[^>]+>/g,"").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\r\n/g,`
`).replace(/\n{3,}/g,`

`).trim()}function extractFullBodyText(t){const e=t.body;return e?.content?(e.contentType==="text"?e.content.trim():htmlToPlainText(e.content)).slice(0,MAX_FULL_BODY_CHARS):null}const STANDUP_SELECT_FIELDS="id,conversationId,subject,sender,receivedDateTime,bodyPreview,body,webLink",STANDUP_MAX_MESSAGES=200;function ptDateToUtcRange(t){if(!/^\d{4}-\d{2}-\d{2}$/.test(t||""))throw new HttpsError("invalid-argument","date must be a YYYY-MM-DD string.");const e=`${t}T07:00:00Z`,a=Date.parse(e);if(Number.isNaN(a))throw new HttpsError("invalid-argument",`Could not parse date '${t}'.`);const n=new Date(a+1440*60*1e3).toISOString().replace(/\.\d{3}Z$/,"Z");return{start:e,end:n}}function toStandupMessage(t){return{id:t.id,conversationId:t.conversationId||null,subject:t.subject||null,senderName:t.sender?.emailAddress?.name||null,senderEmail:t.sender?.emailAddress?.address||null,receivedDateTime:t.receivedDateTime||null,bodyPreview:t.bodyPreview||null,fullBody:extractFullBodyText(t),webLink:t.webLink||null}}const STANDUP_SOURCE_FOLDER_PATH="/me/mailFolders/sentitems/messages";async function fetchMessagesInRange(t,e,a){let n=await t.api(STANDUP_SOURCE_FOLDER_PATH).select(STANDUP_SELECT_FIELDS).filter(`receivedDateTime ge ${e} and receivedDateTime lt ${a}`).orderby("receivedDateTime desc").top(25).get();const o=[];for(;n&&(o.push(...n.value.map(toStandupMessage)),!(o.length>=STANDUP_MAX_MESSAGES||!n["@odata.nextLink"]));)n=await t.api(n["@odata.nextLink"]).get();return o}async function searchSupplementalMessages(t,e,a,n){const o=await t.api(STANDUP_SOURCE_FOLDER_PATH).header("ConsistencyLevel","eventual").search('"new hire" OR equipment').select(STANDUP_SELECT_FIELDS).top(25).get(),i=Date.parse(e),d=Date.parse(a);return(o.value||[]).filter(r=>{if(n.has(r.id))return!1;const s=Date.parse(r.receivedDateTime);return!Number.isNaN(s)&&s>=i&&s<d}).map(toStandupMessage)}async function fetchConversationRootMessage(t,e){if(!e)return null;try{const n=(await t.api("/me/messages").header("ConsistencyLevel","eventual").select(STANDUP_SELECT_FIELDS).filter(`conversationId eq '${e}'`).top(25).get()).value||[];if(!n.length)return null;const o=n.reduce((i,d)=>new Date(i.receivedDateTime)<=new Date(d.receivedDateTime)?i:d);return toStandupMessage(o)}catch(a){return console.error(`fetchConversationRootMessage failed for conversationId=${e}:`,a),null}}const STANDUP_AI_MODEL="gemini-2.5-flash-lite",STANDUP_AI_LOCATION="us-central1",STANDUP_AI_MAX_ENTRY_CHARS=2e3;async function summarizeStandupEntries(t){if(!t.length)return t.map(()=>null);const e=(o,i)=>typeof o.id=="string"&&o.id?o.id:String(i),a=t.map((o,i)=>{const d=(o.text||"").slice(0,STANDUP_AI_MAX_ENTRY_CHARS),r=(o.ownReply||"").slice(0,STANDUP_AI_MAX_ENTRY_CHARS),s=r?`
Huy's own reply/action taken: ${r}`:"",m=o.requesterName?`
Requester: ${o.requesterName}`:"";return`id: ${e(o,i)}
Subject: ${o.subject||"(no subject)"}
Original request: ${d||"(no body)"}${m}${s}`}).join(`

---

`),n=`Below are ${t.length} email(s) from an IT operations standup. For EACH one, write 1-2 short, plain-English sentences (no more than ~30 words total) covering (1) what was actually requested, and (2) - only when a "Huy's own reply/action taken" line is given below - what was done about it, or that it's still pending/open if the reply doesn't clearly resolve it. If no reply line is given, just summarize the request. If a "Requester" line is given below, work that person's name naturally into your sentence as the one who made the request (e.g. "Jane Smith requested Amazon account access for 1228 Cornerway; account created and confirmed same day."). If no Requester line is given, do not state or guess anyone's name (not the requester's, not Huy's) - describe only the request/action itself, e.g. "Reported a broken camera at Rio Grande Service Center; still awaiting a replacement part." Do not include the id or subject in the summary text itself.

Respond with ONLY a JSON array of ${t.length} objects, one per entry, each in the exact form {"id": "<the entry's id, copied exactly>", "summary": "<your summary>"} - and nothing else, no markdown fences, no commentary. Every id below must appear exactly once in your response, unchanged.

${a}`;try{const r=((await new GoogleGenAI({vertexai:!0,project:process.env.GCLOUD_PROJECT||FIREBASE_PROJECT_ID,location:STANDUP_AI_LOCATION}).models.generateContent({model:STANDUP_AI_MODEL,contents:n})).text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/```$/,"").trim(),s=JSON.parse(r);if(!Array.isArray(s))throw new Error("Expected a JSON array in the AI response.");const m=new Map;for(const p of s)p&&typeof p.id=="string"&&typeof p.summary=="string"&&m.set(p.id,p.summary.trim());return t.map((p,l)=>m.get(e(p,l))??null)}catch(o){return console.error("summarizeStandupEntries failed:",o),t.map(()=>null)}}exports.summarizeStandupReportEntries=onCall({timeoutSeconds:60},async t=>{await requireRole(t,"view");const a=(Array.isArray(t.data?.entries)?t.data.entries:[]).slice(0,200).map((o,i)=>({id:typeof o?.id=="string"&&o.id?o.id.slice(0,200):String(i),subject:typeof o?.subject=="string"?o.subject.slice(0,300):"",text:typeof o?.text=="string"?o.text:"",ownReply:typeof o?.ownReply=="string"?o.ownReply:"",requesterName:typeof o?.requesterName=="string"?o.requesterName.slice(0,200):""}));return{summaries:await summarizeStandupEntries(a)}});const STANDUP_KUAN_BRIEF_MAX_ITEM_CHARS=300,STANDUP_KUAN_BRIEF_MAX_ITEMS=200;async function callStandupKuanBrief(t,e){await requireRole(t,"view");const a=typeof t.data?.date=="string"?t.data.date.slice(0,20):"",o=(Array.isArray(t.data?.items)?t.data.items:[]).filter(r=>r?.included!==!1&&typeof r?.text=="string"&&r.text.trim()).slice(0,STANDUP_KUAN_BRIEF_MAX_ITEMS);if(!o.length)throw new HttpsError("failed-precondition","This saved day has no included tasks to summarize.");const i=o.map(r=>`- (${typeof r.tag=="string"?r.tag:"other"}) ${r.text.slice(0,STANDUP_KUAN_BRIEF_MAX_ITEM_CHARS)}`).join(`
`),d=e(a,i);try{const m=((await new GoogleGenAI({vertexai:!0,project:process.env.GCLOUD_PROJECT||FIREBASE_PROJECT_ID,location:STANDUP_AI_LOCATION}).models.generateContent({model:STANDUP_AI_MODEL,contents:d})).text||"").trim();if(!m)throw new Error("Model returned an empty response.");return{summary:m}}catch(r){throw console.error("callStandupKuanBrief failed:",r),new HttpsError("internal","Could not generate the summary. Try again in a moment.")}}exports.summarizeStandupReportForKuan=onCall({timeoutSeconds:60},t=>callStandupKuanBrief(t,(e,a)=>`You are drafting a short, professional daily standup brief for a manager named Kuan Goh, written from his IT Operations Engineer, Huy Nguyen. Format your answer EXACTLY like this, with nothing else before or after:
1. One short opening sentence giving an overview of the day.
2. Then 3 to 6 bullet points, each on its own line starting with "- ", grouping the tasks below into natural themes (don't just list every task 1:1). Each bullet must start with a short 2-4 word bolded theme label followed by a colon, for example: "- **Camera Issues**: Followed up on two down-camera tickets, at Sugarland and Ontario."
Professional but not stiff. Do not add headers, greetings, or sign-offs. Do not invent any detail not present in the tasks below.

Date: ${e||"(unspecified)"}
Tasks:
${a}`)),exports.summarizeStandupReportForKuanLong=onCall({timeoutSeconds:60},t=>callStandupKuanBrief(t,(e,a)=>`You are drafting a detailed, professional daily standup brief for a manager named Kuan Goh, written from his IT Operations Engineer, Huy Nguyen. Format your answer EXACTLY like this, with nothing else before or after:
1. One short opening sentence giving an overview of the day.
2. Then one bullet point per task below (or, only when two tasks are clearly the same underlying issue, one bullet for that tight cluster) - covering every task individually rather than collapsing them into a handful of broad themes. Each bullet must start with a short 2-4 word bolded theme label followed by a colon, then 1-2 sentences with real, specific detail (site/location, what was actually done or found), for example: "- **Sugarland Cameras**: Investigated a report of down cameras at 12510 Airport, Sugarland TX, and coordinated with the site contact on next steps."
Professional but not stiff. Do not add headers, greetings, or sign-offs. Do not omit any task below. Do not invent any detail not present in the tasks below.

Date: ${e||"(unspecified)"}
Tasks:
${a}`)),exports.pullStandupEmails=onCall({timeoutSeconds:120},async t=>{await requireRole(t,"view");const{start:e,end:a}=ptDateToUtcRange(t.data?.date),n=await getGraphClient(),o=await fetchMessagesInRange(n,e,a),i=await searchSupplementalMessages(n,e,a,new Set(o.map(l=>l.id))),d=[...new Set([...o,...i].map(l=>l.conversationId).filter(Boolean))],r={};await Promise.all(d.map(async l=>{r[l]=await fetchConversationRootMessage(n,l)}));const s=l=>{const g=l.conversationId?r[l.conversationId]:null;return{...l,initial:g&&g.id!==l.id?g:null}},m=o.map(s),p=i.map(s);return{dateRangeUtc:{start:e,end:a},primary:m,supplemental:p}});const STANDUP_CONVERSATION_SELECT_FIELDS="id,conversationId,subject,sender,receivedDateTime,bodyPreview,body",STANDUP_CONVERSATION_MAX_MESSAGES=500;async function fetchConversationMessages(t,e){if(!e)return[];try{let a=await t.api("/me/messages").header("ConsistencyLevel","eventual").select(STANDUP_CONVERSATION_SELECT_FIELDS).filter(`conversationId eq '${e}'`).top(25).get();const n=[];for(;a&&(n.push(...a.value||[]),!(n.length>=STANDUP_CONVERSATION_MAX_MESSAGES||!a["@odata.nextLink"]));)a=await t.api(a["@odata.nextLink"]).get();return n.sort((o,i)=>new Date(o.receivedDateTime)-new Date(i.receivedDateTime)),n.map(toStandupMessage)}catch(a){return console.error(`fetchConversationMessages failed for conversationId=${e}:`,a),[]}}const STANDUP_CONVERSATION_SUMMARY_MAX_CHARS=8e3,STANDUP_CONVERSATION_CLIENT_MAX_MESSAGES=30;async function summarizeConversation(t){if(!t.length)return null;const e=t[0],a=e&&normalizeEmail(e.senderEmail)!==normalizeEmail(OWNER_EMAIL)?senderDisplayName(e.senderName,e.senderEmail):null,n=t.map((d,r)=>{const s=(d.fullBody||d.bodyPreview||"").slice(0,2e3);return`message ${r+1} (from: ${d.senderName||d.senderEmail||"unknown"}, ${d.receivedDateTime||"unknown"}):
Subject: ${d.subject||"(no subject)"}
${s||"(no body)"}`}).join(`

---

`),i=`Below is a full email conversation thread (all messages in chronological order) from a helpdesk standup inbox. Write 1-2 short, plain-English sentences (no more than ~30 words total) summarizing the entire thread: what the request was about, and what was done about it or what's still pending/open if it isn't resolved yet. ${a?`The original requester's name is ${a} - work their name naturally into your summary as the one who made the request (e.g. "${a} requested...").`:"Do not state or guess anyone's name in your summary."} Do not list every message individually or restate every detail - synthesize down to just what matters for a daily standup. Do not include headers, greetings, or sign-offs.

Conversation (${t.length} messages):
${n}`;try{const s=((await new GoogleGenAI({vertexai:!0,project:process.env.GCLOUD_PROJECT||FIREBASE_PROJECT_ID,location:STANDUP_AI_LOCATION}).models.generateContent({model:STANDUP_AI_MODEL,contents:i})).text||"").trim();return s?s.slice(0,STANDUP_CONVERSATION_SUMMARY_MAX_CHARS):null}catch(d){return console.error("summarizeConversation failed:",d),null}}exports.pullStandupEmailsWithSummary=onCall({timeoutSeconds:300},async t=>{await requireRole(t,"view");const{start:e,end:a}=ptDateToUtcRange(t.data?.date),n=await getGraphClient(),o=await fetchMessagesInRange(n,e,a),i=await searchSupplementalMessages(n,e,a,new Set(o.map(u=>u.id))),d=[...o,...i],r=[...new Set(d.map(u=>u.conversationId).filter(Boolean))],s={},cm={};await Promise.all(r.map(async u=>{const f=await fetchConversationMessages(n,u);f.length&&(cm[u]=f,s[u]=await summarizeConversation(f))}));const m=u=>({...u,threadSummary:u.conversationId?s[u.conversationId]??null:null,conversationMessages:u.conversationId?(cm[u.conversationId]||[]).slice(-STANDUP_CONVERSATION_CLIENT_MAX_MESSAGES):[]}),p=o.map(m),l=i.map(m),g=[...p,...l],h=[...new Set(g.map(u=>u.conversationId).filter(Boolean))],c={};await Promise.all(h.map(async u=>{c[u]=await fetchConversationRootMessage(n,u)}));const w=u=>{const f=u.conversationId?c[u.conversationId]:null;return{...u,initial:f&&f.id!==u.id?f:null}};return{dateRangeUtc:{start:e,end:a},primary:p.map(w),supplemental:l.map(w)}});
// "Pull All" (2026-09-11) - full-mailbox Graph $search (NOT folder-scoped -
// deliberately not STANDUP_SOURCE_FOLDER_PATH/Sent Items) against
// /me/messages, same delegated auth/account as every other Standup Graph
// call in this file. Strictly read-only: only .get() calls below, never a
// PATCH/DELETE/move/send against the source mailbox. Results can be from any
// folder (Inbox, Sent Items, etc.) - toStandupMessage()/fetchConversation*
// already treat sender/subject/conversationId generically (no assumption
// the sender is Huy), so no changes needed there for this to work on
// received-by-Huy mail too. Paginates like fetchMessagesInRange, then trims
// to the exact UTC range client-side (search's own date-range KQL is
// day-granularity only) the same defensive way searchSupplementalMessages
// already does.
const STANDUP_MAILBOX_ALL_MAX_MESSAGES=400;
async function fetchMailboxSearchInRange(client,startIso,endIso){
  const startDate=startIso.slice(0,10),endDateExclusive=endIso.slice(0,10);
  let page=await client.api("/me/messages").header("ConsistencyLevel","eventual").search(`"received:${startDate}..${endDateExclusive}"`).select(STANDUP_SELECT_FIELDS).top(25).get();
  const out=[];
  for(;page&&(out.push(...(page.value||[])),!(out.length>=STANDUP_MAILBOX_ALL_MAX_MESSAGES||!page["@odata.nextLink"]));)page=await client.api(page["@odata.nextLink"]).get();
  const startMs=Date.parse(startIso),endMs=Date.parse(endIso);
  return out.filter(msg=>{const ms=Date.parse(msg.receivedDateTime);return !Number.isNaN(ms)&&ms>=startMs&&ms<endMs}).map(toStandupMessage);
}
exports.pullStandupMailboxAll=onCall({timeoutSeconds:300},async t=>{
  await requireRole(t,"view");
  const{start:e,end:a}=ptDateToUtcRange(t.data?.date),n=await getGraphClient(),o=await fetchMailboxSearchInRange(n,e,a);
  const r=[...new Set(o.map(u=>u.conversationId).filter(Boolean))],s={},cm={};
  await Promise.all(r.map(async u=>{const f=await fetchConversationMessages(n,u);f.length&&(cm[u]=f,s[u]=await summarizeConversation(f))}));
  const m=u=>({...u,threadSummary:u.conversationId?s[u.conversationId]??null:null,conversationMessages:u.conversationId?(cm[u.conversationId]||[]).slice(-STANDUP_CONVERSATION_CLIENT_MAX_MESSAGES):[]}),p=o.map(m);
  const h=[...new Set(p.map(u=>u.conversationId).filter(Boolean))],c={};
  await Promise.all(h.map(async u=>{c[u]=await fetchConversationRootMessage(n,u)}));
  const w=u=>{const f=u.conversationId?c[u.conversationId]:null;return{...u,initial:f&&f.id!==u.id?f:null}};
  return{dateRangeUtc:{start:e,end:a},primary:p.map(w),supplemental:[]};
}),exports.sendStandupCaliIssuesEmail=onCall({timeoutSeconds:60},async t=>{await requireRole(t,"view");const{subject:e,html:a}=t.data||{};if(!e||typeof e!="string")throw new HttpsError("invalid-argument","subject (string) is required.");if(!a||typeof a!="string")throw new HttpsError("invalid-argument","html (string) is required.");const n=await getGraphClientForSend(),o={subject:e,body:{contentType:"HTML",content:a},toRecipients:[{emailAddress:{address:"kuan.goh@cubework.com"}},{emailAddress:{address:"huy.nguyen@cubework.com"}}]};return await n.api("/me/sendMail").post({message:o,saveToSentItems:!0}),{ok:!0}});const STANDUP_SAVES_COLLECTION="standupSaves",STANDUP_TAG_KEYS=["critical","helpdesk","inventory","newHire","layout","followUp","troubleshoot","travel","other"],SHARED_TAG_KEY_RE=/^custom:[A-Za-z0-9_-]{1,80}$/;function isValidSharedTagKey(t){return typeof t=="string"&&(STANDUP_TAG_KEYS.includes(t)||SHARED_TAG_KEY_RE.test(t))}exports.saveStandupReport=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{date:e,items:a,reportHtml:n,emailSubject:o,emailBody:i,summaryIntroText:d}=t.data||{};if(!/^\d{4}-\d{2}-\d{2}$/.test(e||""))throw new HttpsError("invalid-argument","date (YYYY-MM-DD string) is required.");if(!Array.isArray(a))throw new HttpsError("invalid-argument","items (array) is required.");const r=a.filter(s=>s&&typeof s.text=="string"&&s.text.trim()).slice(0,500).map(s=>({text:s.text.trim().slice(0,2e3),tag:isValidSharedTagKey(s.tag)?s.tag:"other",tags:Array.isArray(s.tags)?s.tags.filter(x=>isValidSharedTagKey(x)).slice(0,10):null,included:s.included!==!1,locationOverride:typeof s.locationOverride=="string"&&s.locationOverride.trim()?s.locationOverride.trim().slice(0,300):null,threadSummary:typeof s.threadSummary=="string"&&s.threadSummary.trim()?s.threadSummary.trim().slice(0,8e3):null,requesterName:typeof s.requesterName=="string"&&s.requesterName.trim()?s.requesterName.trim().slice(0,200):null,
// 2026-09-11 row redesign: persist the full ordered conversation thread
// ("View Conversation" toggle) alongside the rest of the row - same
// size-cap convention as every other field here (cap array length, cap
// each message's own string fields), not a free-form blob.
conversationMessages:Array.isArray(s.conversationMessages)?s.conversationMessages.slice(0,30).map(cm=>({id:typeof cm?.id=="string"?cm.id.slice(0,200):null,conversationId:typeof cm?.conversationId=="string"?cm.conversationId.slice(0,300):null,subject:typeof cm?.subject=="string"?cm.subject.slice(0,300):null,senderName:typeof cm?.senderName=="string"?cm.senderName.slice(0,200):null,senderEmail:typeof cm?.senderEmail=="string"?cm.senderEmail.slice(0,200):null,receivedDateTime:typeof cm?.receivedDateTime=="string"?cm.receivedDateTime.slice(0,40):null,bodyPreview:typeof cm?.bodyPreview=="string"?cm.bodyPreview.slice(0,1000):null,fullBody:typeof cm?.fullBody=="string"?cm.fullBody.slice(0,4000):null})):[]}));return await db.collection(STANDUP_SAVES_COLLECTION).doc(e).set({date:e,items:r,reportHtml:typeof n=="string"?n.slice(0,5e5):null,emailSubject:typeof o=="string"?o.slice(0,200):null,emailBody:typeof i=="string"?i.slice(0,2e4):null,summaryIntroText:typeof d=="string"?d.slice(0,2e4):null,savedBy:t.auth.token.email,savedAt:FieldValue.serverTimestamp()},{merge:!0}),{ok:!0}}),exports.deleteStandupSave=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const e=t.data?.date;if(!/^\d{4}-\d{2}-\d{2}$/.test(e||""))throw new HttpsError("invalid-argument","date (YYYY-MM-DD string) is required.");return await db.collection(STANDUP_SAVES_COLLECTION).doc(e).delete(),{ok:!0}});
// Summary attachments (2026-09-14) - mirrors addIssueAttachment/removeIssueAttachment
// exactly (same 8MB cap, same Storage-path-prefixed-by-id convention, same
// arrayUnion onto the parent doc), just keyed by the standup day's date
// instead of an itemId. {merge:true} means the standupSaves/{date} doc
// doesn't need to exist yet - an attachment can be added before the day is
// ever explicitly Saved, same as addIssueAttachment doesn't require the
// issue item to have been edited since creation.
const MAX_STANDUP_ATTACHMENT_BYTES=8*1024*1024;
exports.addStandupAttachment=onCall({timeoutSeconds:60},async t=>{await requireRole(t,"edit");const{date:e,fileName:a,contentType:n,base64Data:o}=t.data||{};if(!/^\d{4}-\d{2}-\d{2}$/.test(e||""))throw new HttpsError("invalid-argument","date (YYYY-MM-DD string) is required.");if(!a||!o)throw new HttpsError("invalid-argument","fileName and base64Data are required.");const i=Buffer.from(o,"base64");if(i.length>MAX_STANDUP_ATTACHMENT_BYTES)throw new HttpsError("invalid-argument","File is too large (max 8 MB).");const d=a.replace(/[^a-zA-Z0-9._-]/g,"_"),r=`standupAttachments/${e}/${Date.now()}-${d}`;return await bucket.file(r).save(i,{contentType:n||"application/octet-stream",metadata:{cacheControl:"public, max-age=31536000"}}),await db.collection(STANDUP_SAVES_COLLECTION).doc(e).set({date:e,summaryAttachments:FieldValue.arrayUnion({path:r,name:a,contentType:n||"application/octet-stream"})},{merge:!0}),{ok:!0,path:r}});
exports.removeStandupAttachment=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{date:e,path:a}=t.data||{};if(!/^\d{4}-\d{2}-\d{2}$/.test(e||""))throw new HttpsError("invalid-argument","date (YYYY-MM-DD string) is required.");if(!a)throw new HttpsError("invalid-argument","path is required.");if(!a.startsWith(`standupAttachments/${e}/`))throw new HttpsError("invalid-argument","path does not belong to this day.");const n=db.collection(STANDUP_SAVES_COLLECTION).doc(e),i=((await n.get()).data()?.summaryAttachments||[]).filter(d=>d.path!==a);return await n.set({summaryAttachments:i},{merge:!0}),bucket.file(a).delete().catch(()=>{}),{ok:!0}});
const DAILY_TODO_SAVES_COLLECTION="dailyTodoSaves";exports.saveDailyTodo=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{date:e,entries:a,reportHtml:n}=t.data||{};if(!/^\d{4}-\d{2}-\d{2}$/.test(e||""))throw new HttpsError("invalid-argument","date (YYYY-MM-DD string) is required.");if(!Array.isArray(a))throw new HttpsError("invalid-argument","entries (array) is required.");const o=a.filter(i=>i&&typeof i.text=="string"&&i.text.trim()).slice(0,500).map(i=>({text:i.text.trim().slice(0,2e3),time:typeof i.time=="string"?i.time.slice(0,20):"",included:i.included!==!1,locationOverride:typeof i.locationOverride=="string"&&i.locationOverride.trim()?i.locationOverride.trim().slice(0,300):null,tag:isValidSharedTagKey(i.tag)?i.tag:null}));return await db.collection(DAILY_TODO_SAVES_COLLECTION).doc(e).set({date:e,entries:o,reportHtml:typeof n=="string"?n.slice(0,5e5):null,savedBy:t.auth.token.email,savedAt:FieldValue.serverTimestamp()},{merge:!0}),{ok:!0}}),exports.deleteDailyTodoSave=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const e=t.data?.date;if(!/^\d{4}-\d{2}-\d{2}$/.test(e||""))throw new HttpsError("invalid-argument","date (YYYY-MM-DD string) is required.");return await db.collection(DAILY_TODO_SAVES_COLLECTION).doc(e).delete(),{ok:!0}});const STANDUP_LOCATION_CATALOG_COLLECTION="standupLocationCatalog";exports.addStandupLocation=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const e=(t.data?.label||"").trim(),a=(t.data?.state||"").trim().toUpperCase();if(!e)throw new HttpsError("invalid-argument","label (non-empty string) is required.");if(!a)throw new HttpsError("invalid-argument","state (non-empty string) is required.");return{ok:!0,id:(await db.collection(STANDUP_LOCATION_CATALOG_COLLECTION).add({label:e.slice(0,300),state:a.slice(0,20),addedBy:t.auth.token.email,addedAt:FieldValue.serverTimestamp()})).id}}),exports.deleteStandupLocation=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const e=t.data?.id;if(!e||typeof e!="string")throw new HttpsError("invalid-argument","id (string) is required.");return await db.collection(STANDUP_LOCATION_CATALOG_COLLECTION).doc(e).delete(),{ok:!0}});const SHARED_TAG_CATALOG_COLLECTION="sharedTagCatalog";exports.addSharedTag=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const e=(t.data?.label||"").trim(),a=(t.data?.color||"").trim();if(!e)throw new HttpsError("invalid-argument","label (non-empty string) is required.");const n=e.toLowerCase(),i=(await db.collection(SHARED_TAG_CATALOG_COLLECTION).get()).docs.find(r=>(r.data().label||"").trim().toLowerCase()===n);return i?{ok:!0,id:i.id,reused:!0}:{ok:!0,id:(await db.collection(SHARED_TAG_CATALOG_COLLECTION).add({label:e.slice(0,60),color:a.slice(0,20)||"#6b7280",addedBy:t.auth.token.email,addedAt:FieldValue.serverTimestamp()})).id}}),exports.deleteSharedTag=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const e=t.data?.id;if(!e||typeof e!="string")throw new HttpsError("invalid-argument","id (string) is required.");return await db.collection(SHARED_TAG_CATALOG_COLLECTION).doc(e).delete(),{ok:!0}});

// Shared, org-wide "recently used email addresses" catalog for the CW Email
// Request tab (2026-08-18) - one doc per fixed field key (not per user/email),
// each holding up to SHARED_EMAIL_HISTORY_MAX most-recent, deduped
// (case-insensitive) emails typed into that field by anyone. Written only via
// these two callables (Admin SDK bypasses firestore.rules'
// sharedEmailHistory/{fieldKey} allow write: if false). requireRole(request,
// "view") matches submitEmailRequest/buildEmailRequestPreview's own minimum -
// anyone who can submit a request through this tab can save/reuse an email
// they typed into it. See docs/email-request-attachments-embed-tab.md.
const SHARED_EMAIL_HISTORY_COLLECTION = "sharedEmailHistory";
const SHARED_EMAIL_HISTORY_MAX = 5;
const SHARED_EMAIL_HISTORY_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// One key per distinct email field across the tab's six modes - see the
// ERA_EMAIL_FIELDS table in index.html's embed <script> for the selector
// each key maps to. Keep the two lists in sync.
const SHARED_EMAIL_HISTORY_FIELD_KEYS = new Set([
  "requesterEmail",
  "keycardTenantEmail",
  "keycardManagerEmail",
  "simpleEmail",
  "simpleManagerEmail",
  "phoneManagerEmail",
  "appHardwareManagerEmail",
  "laptopManagerEmail",
  "laptopPersonalEmail",
]);

exports.addSharedEmailHistory = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const fieldKey = request.data?.fieldKey;
  if (typeof fieldKey !== "string" || !SHARED_EMAIL_HISTORY_FIELD_KEYS.has(fieldKey)) {
    throw new HttpsError("invalid-argument", "fieldKey is not recognized.");
  }
  const email = (request.data?.email || "").trim().slice(0, 120);
  if (!email || !SHARED_EMAIL_HISTORY_EMAIL_RE.test(email)) {
    throw new HttpsError("invalid-argument", "email (valid email string) is required.");
  }
  const ref = db.collection(SHARED_EMAIL_HISTORY_COLLECTION).doc(fieldKey);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = Array.isArray(snap.data()?.emails) ? snap.data().emails : [];
    const deduped = existing.filter((e) => e.toLowerCase() !== email.toLowerCase());
    const next = [email, ...deduped].slice(0, SHARED_EMAIL_HISTORY_MAX);
    tx.set(ref, { emails: next, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

exports.deleteSharedEmailHistory = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const fieldKey = request.data?.fieldKey;
  if (typeof fieldKey !== "string" || !SHARED_EMAIL_HISTORY_FIELD_KEYS.has(fieldKey)) {
    throw new HttpsError("invalid-argument", "fieldKey is not recognized.");
  }
  const email = (request.data?.email || "").trim();
  if (!email) throw new HttpsError("invalid-argument", "email (string) is required.");
  const ref = db.collection(SHARED_EMAIL_HISTORY_COLLECTION).doc(fieldKey);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = Array.isArray(snap.data()?.emails) ? snap.data().emails : [];
    const next = existing.filter((e) => e.toLowerCase() !== email.toLowerCase());
    tx.set(ref, { emails: next, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

// Shared, org-wide "recently used phone numbers" catalog (2026-08-19) -
// mirrors sharedEmailHistory above exactly (one doc per fixed field key, up
// to SHARED_PHONE_HISTORY_MAX most-recent deduped entries, written only via
// these two callables), added for the CW Email Request tab's Replacement
// Tenant Phone field. Dedup compares digits-only so "555-123-4567" and
// "(555) 123-4567" collide, but the ORIGINAL formatted string is what's
// stored/returned (the client already live-formats to ###-###-#### as you
// type, so in practice everything saved is already in that shape). See the
// ERA_PHONE_FIELDS table in index.html's embed <script> for the selector
// each key maps to.
const SHARED_PHONE_HISTORY_COLLECTION = "sharedPhoneHistory";
const SHARED_PHONE_HISTORY_MAX = 5;
const SHARED_PHONE_HISTORY_FIELD_KEYS = new Set(["keycardTenantPhone"]);
function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

exports.addSharedPhoneHistory = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const fieldKey = request.data?.fieldKey;
  if (typeof fieldKey !== "string" || !SHARED_PHONE_HISTORY_FIELD_KEYS.has(fieldKey)) {
    throw new HttpsError("invalid-argument", "fieldKey is not recognized.");
  }
  const phone = (request.data?.phone || "").trim().slice(0, 20);
  const digits = phoneDigits(phone);
  if (digits.length !== 10) {
    throw new HttpsError("invalid-argument", "phone (10-digit string) is required.");
  }
  const ref = db.collection(SHARED_PHONE_HISTORY_COLLECTION).doc(fieldKey);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = Array.isArray(snap.data()?.phones) ? snap.data().phones : [];
    const deduped = existing.filter((p) => phoneDigits(p) !== digits);
    const next = [phone, ...deduped].slice(0, SHARED_PHONE_HISTORY_MAX);
    tx.set(ref, { phones: next, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

exports.deleteSharedPhoneHistory = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const fieldKey = request.data?.fieldKey;
  if (typeof fieldKey !== "string" || !SHARED_PHONE_HISTORY_FIELD_KEYS.has(fieldKey)) {
    throw new HttpsError("invalid-argument", "fieldKey is not recognized.");
  }
  const phone = (request.data?.phone || "").trim();
  const digits = phoneDigits(phone);
  if (!digits) throw new HttpsError("invalid-argument", "phone (string) is required.");
  const ref = db.collection(SHARED_PHONE_HISTORY_COLLECTION).doc(fieldKey);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = Array.isArray(snap.data()?.phones) ? snap.data().phones : [];
    const next = existing.filter((p) => phoneDigits(p) !== digits);
    tx.set(ref, { phones: next, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

// Keycard Form fill/sign audit log (added 2026-08-19) - server-side record
// of every drawn-signature save from the Keycard Form modal (see
// docs/email-request-attachments-embed-tab.md and the "Keycard Form"
// section of that doc). Exists to close the gap a plain client-side PDF
// stamp leaves for legal defensibility: an electronic signature generally
// needs (1) consent to sign electronically, (2) attribution to a specific
// person, and (3) a way to detect the record was altered afterward - none
// of which "burn an image into a PDF client-side" provides on its own.
// This callable is the one piece of that which MUST be server-side (an
// Admin-SDK write the client can't forge, unlike anything baked into the
// PDF itself):
// - submittedByEmail/submittedAt/ip come from the authenticated request,
//   not the client payload, so they can't be spoofed.
// - sha256 is a client-computed digest of the final, already-flattened PDF
//   bytes (see the embed script's sha256Hex()) - a later request to fetch
//   this doc lets someone verify the attached PDF wasn't modified after
//   the fact by recomputing the hash and comparing.
// - signers requires an explicit typed name + a checked consent box per
//   signature that actually has ink (validated client-side before Save,
//   re-validated here) - "someone drew a squiggle" alone is not accepted.
// This is still not a full e-signature platform (no per-signer identity
// verification, no cryptographic certificate) - it's the scoped
// improvement Huy asked for on top of the existing PDF-stamping flow, not
// a DocuSign/Adobe Sign replacement.
const KEYCARD_FORM_AUDIT_COLLECTION = "keycardFormSignatureAudit";
const KEYCARD_FORM_SHA256_RE = /^[0-9a-f]{64}$/i;
exports.logKeycardFormSignature = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const data = request.data || {};
  const filename = typeof data.filename === "string" ? data.filename.trim().slice(0, 300) : "";
  const sha256 = typeof data.sha256 === "string" && KEYCARD_FORM_SHA256_RE.test(data.sha256) ? data.sha256.toLowerCase() : null;
  if (!filename || !sha256) {
    throw new HttpsError("invalid-argument", "filename and a valid sha256 hex digest are required.");
  }
  const signers = (Array.isArray(data.signers) ? data.signers : [])
    .filter((s) => s && typeof s.field === "string" && s.field && typeof s.signerName === "string" && s.signerName.trim() && s.consented === true)
    .slice(0, 20)
    .map((s) => ({ field: s.field.slice(0, 60), signerName: s.signerName.trim().slice(0, 200), consented: true }));
  if (!signers.length) {
    throw new HttpsError("invalid-argument", "At least one consented signer (field + signerName + consented:true) is required.");
  }
  const locationText = typeof data.locationText === "string" && data.locationText.trim() ? data.locationText.trim().slice(0, 300) : null;
  const forwardedFor = request.rawRequest?.headers?.["x-forwarded-for"];
  const ip = (typeof forwardedFor === "string" && forwardedFor.split(",")[0].trim()) || request.rawRequest?.ip || null;
  const docRef = await db.collection(KEYCARD_FORM_AUDIT_COLLECTION).add({
    filename,
    sha256,
    signers,
    locationText,
    submittedByEmail: request.auth.token.email,
    submittedAt: FieldValue.serverTimestamp(),
    ip,
    userAgent: typeof data.userAgent === "string" ? data.userAgent.slice(0, 300) : null,
  });
  return { ok: true, auditId: docRef.id };
});

// Keycard Form remote e-signature workflow (added 2026-08-18) - lets a
// staff member send the tenant/customer a secure, single-use link to sign
// their own card's signature field remotely (email/phone, no in-person
// drawing by staff, no Firebase Auth account on the tenant's side at all),
// with the completed PDF and an audit record automatically synced back
// into this app. See docs/email-request-attachments-embed-tab.md.
//
// Security model: the token IS the credential (crypto.randomBytes(32) hex,
// 256 bits - not brute-forceable), same trust model as a password-reset or
// DocuSign envelope link, not this app's normal Firebase Auth + role model
// - a tenant has no @cubework.com account. Both public endpoints below are
// onRequest (no request.auth check possible/expected), reached only via the
// Hosting rewrites in firebase.json (same-origin from public/sign.html, no
// CORS needed) and are the ONLY things a client without a role may call in
// this whole file.
// - createKeycardSignatureRequest (onCall, staff-only) mints the token,
//   stores everything needed to finish the document later, and emails the
//   tenant the link via the same delegated Graph mailbox every other
//   outgoing email in this app already uses.
// - getSignatureRequest (public GET) lets sign.html render the pending
//   request without exposing anything beyond the display fields.
// - submitSignatureRequest (public POST) is where duplicate-signing is
//   actually prevented: a Firestore transaction atomically flips
//   status "pending" -> "processing" (throwing failed-precondition/409 for
//   anything not pending), so two concurrent submits for the same token
//   can't both succeed - only after that claim succeeds does it build the
//   final PDF (server-side pdf-lib, same field-fill/flatten/stamp order as
//   the in-person flow - see signatureRequests.js), hash it, save it to
//   Storage, log it into the SAME keycardFormSignatureAudit collection the
//   in-person flow uses (submittedByEmail is a "remote-signer:<email>"
//   marker rather than an authenticated staff email, since there is none),
//   and only then flips status to "completed". A build/save failure reverts
//   status back to "pending" so the tenant can retry instead of the link
//   being permanently stuck.
// - getSignedKeycardFormPdf (onCall, staff-only) is how the completed PDF
//   gets back into the app - same base64-download pattern as
//   getRoadmapAttachmentData, gated by status==="completed" so nothing can
//   be fetched before it's actually signed.
// What this is NOT: no SMS delivery (email only for now - adding SMS means
// a paid third-party provider like Twilio plus US carrier "A2P 10DLC"
// business-messaging registration, deliberately out of scope until that
// account/registration exists - see the chat log entry for this feature),
// and still no per-signer identity verification beyond "control of the
// email inbox the staff member sent the link to" - same scoped-improvement
// caveat as the in-person flow's own audit log.
const SIGNATURE_REQUESTS_COLLECTION = "signatureRequests";
const SIGNATURE_REQUEST_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PUBLIC_APP_ORIGIN = "https://keycard-helpdesk.web.app";
const SIGNATURE_TOKEN_RE = /^[0-9a-f]{64}$/;
const CARD_SIGNATURE_FIELD_RE = /^card[1-7]_signature$/;
const OTHER_SIGNATURE_FIELD_RE = /^(card[1-7]_signature|staff_signature)$/;
const SIGNATURE_REQUEST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SIGNATURE_PNG_BASE64_CHARS = 700000; // ~500KB decoded - generous for a drawn signature

function escapeHtmlForEmail(value) {
  return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function sanitizeStringMap(obj, maxKeys, maxValueChars) {
  const out = {};
  if (!obj || typeof obj != "object") return out;
  Object.keys(obj).slice(0, maxKeys).forEach((k) => {
    if (typeof k !== "string" || !k || k.length > 80) return;
    const v = obj[k];
    if (typeof v === "string") out[k] = v.slice(0, maxValueChars);
  });
  return out;
}
function sanitizeBoolMap(obj, maxKeys) {
  const out = {};
  if (!obj || typeof obj != "object") return out;
  Object.keys(obj).slice(0, maxKeys).forEach((k) => {
    if (typeof k === "string" && k && k.length <= 80) out[k] = obj[k] === true;
  });
  return out;
}
function sanitizePhotoIdMap(obj) {
  const out = {};
  if (!obj || typeof obj != "object") return out;
  Object.keys(obj).slice(0, 7).forEach((k) => {
    if (/^[1-7]$/.test(k) && (obj[k] === "yes" || obj[k] === "no")) out[k] = obj[k];
  });
  return out;
}
function sanitizeOtherSignatures(arr, excludeField) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(
      (s) =>
        s &&
        typeof s.field === "string" &&
        OTHER_SIGNATURE_FIELD_RE.test(s.field) &&
        s.field !== excludeField &&
        typeof s.pngBase64 === "string" &&
        s.pngBase64.length > 0 &&
        s.pngBase64.length <= MAX_SIGNATURE_PNG_BASE64_CHARS
    )
    .slice(0, 8)
    .map((s) => ({ field: s.field, pngBase64: s.pngBase64 }));
}
// Builds the COMPLETE {fieldValues, checkboxFields, photoIdSelections,
// signatures} for the signed PDF from the LIVE keycardRequestHistory doc at
// the moment the tenant actually signs, instead of trusting the narrow
// per-card fieldValues snapshot captured back when the signature request was
// first sent (see createKeycardSignatureRequest) - that snapshot only ever
// held 5 outer + 4 per-card TEXT fields for the one card being sent, so the
// signed PDF was always missing every OTHER card, every checkbox (Fee/Photo
// ID Yes-No), Date Issued/Returned, and the staff "Issued By"
// signature/print name/date entirely - not just stale on edits.
// buildKeycardFormPdfInputsFromHistory() (functions/keycardHistory.js) is the
// single shared assembler for this - same one buildKeycardHistoryFormPdf
// (below) uses for the on-demand "whole submission" PDF - so the two never
// drift apart on field-name mapping again (see the card_keycard# vs
// card_keycard_number bug this replaced, confirmed against the real PDF's
// own AcroForm field dump). Falls back to the original stale, narrower
// snapshot whenever the history doc can't be resolved (deleted record, no
// historyRequestId on an older/non-History-linked request) rather than
// throwing - a signing flow already in flight should still complete.
async function buildSigningPdfInputsFromHistory(historyRequestId, targetField, signaturePngBase64, staleData) {
  const fallback = {
    fieldValues: (staleData && staleData.fieldValues) || {},
    checkboxFields: (staleData && staleData.checkboxFields) || {},
    photoIdSelections: (staleData && staleData.photoIdSelections) || {},
    signatures: ((staleData && staleData.otherSignatures) || []).concat([{ field: targetField, pngBase64: signaturePngBase64 }]),
  };
  if (!historyRequestId) return fallback;
  try {
    const histSnap = await db.collection(KEYCARD_REQUEST_HISTORY_COLLECTION).doc(historyRequestId).get();
    if (!histSnap.exists) return fallback;
    const inputs = buildKeycardFormPdfInputsFromHistory(histSnap.data());
    const cardMatch = /^card([1-7])_signature$/.exec(targetField || "");
    const n = cardMatch ? cardMatch[1] : null;
    if (n) inputs.photoIdSelections[n] = "yes"; // a photo ID is always submitted alongside the signature itself
    // Override (not append) this card's own signature with the one just
    // submitted - the history doc's own signIdSignatures[n] (if any) is
    // written by the CLIENT afterward, once this call returns, so it can't
    // be relied on to already hold it yet.
    inputs.signatures = inputs.signatures.filter((s) => s.field !== targetField);
    inputs.signatures.push({ field: targetField, pngBase64: signaturePngBase64 });
    return inputs;
  } catch (e) {
    console.error("buildSigningPdfInputsFromHistory failed, falling back to stored snapshot:", e);
    return fallback;
  }
}
async function sendPlainHtmlEmail(graphClient, { toEmail, subject, html }) {
  await graphClient.api("/me/sendMail").post({
    message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: toEmail } }] },
    saveToSentItems: true,
  });
}

exports.createKeycardSignatureRequest = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const data = request.data || {};
  const targetField = typeof data.targetField === "string" ? data.targetField : "";
  if (!CARD_SIGNATURE_FIELD_RE.test(targetField)) {
    throw new HttpsError("invalid-argument", "targetField must be one of card1_signature..card7_signature.");
  }
  const tenantEmail = (data.tenantEmail || "").trim();
  if (!SIGNATURE_REQUEST_EMAIL_RE.test(tenantEmail)) {
    throw new HttpsError("invalid-argument", "A valid tenantEmail is required.");
  }
  const tenantName = typeof data.tenantName === "string" ? data.tenantName.trim().slice(0, 200) : "";
  const companyName = typeof data.companyName === "string" ? data.companyName.trim().slice(0, 200) : "";
  const locationText = typeof data.locationText === "string" ? data.locationText.trim().slice(0, 300) : "";
  const fieldValues = sanitizeStringMap(data.fieldValues, 60, 300);
  const checkboxFields = sanitizeBoolMap(data.checkboxFields, 20);
  const photoIdSelections = sanitizePhotoIdMap(data.photoIdSelections);
  const otherSignatures = sanitizeOtherSignatures(data.otherSignatures, targetField);
  // Correlates this per-card remote signature request back to the overall
  // Keycard Submission History record (see keycardHistory.js) - minted
  // client-side, so only validate its shape here, don't require it (an
  // older client / a request outside the History flow simply won't link).
  const historyRequestId = typeof data.historyRequestId === "string" && KEYCARD_REQUEST_ID_RE.test(data.historyRequestId) ? data.historyRequestId : null;

  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + SIGNATURE_REQUEST_EXPIRY_MS);

  await db.collection(SIGNATURE_REQUESTS_COLLECTION).doc(token).set({
    status: "pending",
    targetField,
    tenantName,
    companyName,
    tenantEmail,
    locationText,
    fieldValues,
    checkboxFields,
    photoIdSelections,
    otherSignatures,
    historyRequestId,
    createdBy: request.auth.token.email,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    completedAt: null,
    signedPdfPath: null,
    sha256: null,
  });

  const signUrl = `${PUBLIC_APP_ORIGIN}/sign.html?t=${token}`;
  const expiresLabel = new Date(now + SIGNATURE_REQUEST_EXPIRY_MS).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // Greeting line per Huy's spec (2026-09-20 pass): "[Company Name] -
  // [Tenant First Last name]", gracefully degrading when either half is
  // missing (companyName is optional - not every card has one on file) so
  // the greeting never reads as "Hello - ," or "Hello ,".
  const greetingName = [companyName, tenantName].filter(Boolean).join(" - ");
  try {
    const graphClient = await getGraphClientForSend();
    await sendPlainHtmlEmail(graphClient, {
      toEmail: tenantEmail,
      subject: "Cubework Keycard Form — signature requested",
      html:
        `<p>Hello${greetingName ? " " + escapeHtmlForEmail(greetingName) : ""},</p>` +
        `<p>Cubework has requested your signature and photo ID on a Keycard Authorization Form${
          locationText ? " for " + escapeHtmlForEmail(locationText) : ""
        }.</p>` +
        `<p><a href="${signUrl}">Click Here to Review, Sign, and Upload Photo ID</a></p>` +
        `<p>This link is unique to you and expires on ${expiresLabel}. Please don't forward it to anyone else.</p>` +
        `<p>If you weren't expecting this, you can ignore this email.</p>`,
    });
  } catch (err) {
    console.error("createKeycardSignatureRequest: failed to send email:", err);
    await db.collection(SIGNATURE_REQUESTS_COLLECTION).doc(token).delete().catch(() => {});
    throw new HttpsError("internal", "Could not send the signature request email. Try again in a moment.");
  }

  return { ok: true, token };
});

// Public (no Firebase Auth) - reached only via the /api/getSignatureRequest
// Hosting rewrite from public/sign.html. Returns just enough to render the
// signing page; never the full fieldValues snapshot.
exports.getSignatureRequest = onRequest({ timeoutSeconds: 20 }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!SIGNATURE_TOKEN_RE.test(token)) {
    res.status(400).json({ ok: false, error: "invalid_token" });
    return;
  }
  try {
    const snap = await db.collection(SIGNATURE_REQUESTS_COLLECTION).doc(token).get();
    if (!snap.exists) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    const d = snap.data();
    if (d.status === "completed") {
      res.json({ ok: true, status: "completed" });
      return;
    }
    if (d.status === "processing") {
      res.json({ ok: true, status: "processing" });
      return;
    }
    const expiresAtMs = d.expiresAt && d.expiresAt.toMillis ? d.expiresAt.toMillis() : 0;
    if (expiresAtMs && expiresAtMs < Date.now()) {
      res.json({ ok: true, status: "expired" });
      return;
    }
    const cardNumber = (d.targetField || "").replace(/^card/, "").replace(/_signature$/, "");
    res.json({
      ok: true,
      status: "pending",
      data: {
        tenantName: d.tenantName || "",
        locationText: d.locationText || "",
        keycardNumber: (d.fieldValues && d.fieldValues["card" + cardNumber + "_keycard_number"]) || "",
        expiresAtIso: d.expiresAt && d.expiresAt.toDate ? d.expiresAt.toDate().toISOString() : null,
      },
    });
  } catch (err) {
    console.error("getSignatureRequest failed:", err);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// Public (no Firebase Auth) - reached only via the /api/submitSignatureRequest
// Hosting rewrite from public/sign.html. See the big comment above this
// section for the duplicate-signing/atomicity design.
exports.submitSignatureRequest = onRequest({ timeoutSeconds: 60 }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  const body = req.body || {};
  const token = typeof body.token === "string" ? body.token : "";
  const signerName = typeof body.signerName === "string" ? body.signerName.trim().slice(0, 200) : "";
  const consented = body.consented === true;
  const signaturePngBase64 = typeof body.signaturePngBase64 === "string" ? body.signaturePngBase64 : "";
  // Photo ID is a hard requirement of the digital-signature process (both
  // signing surfaces, in-person and remote) - never trust the client-side
  // check alone on a public, unauthenticated endpoint like this one.
  const photoIdBase64 = typeof body.photoIdBase64 === "string" ? body.photoIdBase64 : "";
  const photoIdContentType = typeof body.photoIdContentType === "string" ? body.photoIdContentType.slice(0, 100) : "application/octet-stream";
  const photoIdFileName = typeof body.photoIdFileName === "string" && body.photoIdFileName.trim() ? body.photoIdFileName.trim().slice(0, 200) : "photo-id";
  if (!SIGNATURE_TOKEN_RE.test(token)) {
    res.status(400).json({ ok: false, error: "invalid_token" });
    return;
  }
  if (!signerName || !consented) {
    res.status(400).json({ ok: false, error: "consent_required" });
    return;
  }
  if (!signaturePngBase64 || signaturePngBase64.length > MAX_SIGNATURE_PNG_BASE64_CHARS) {
    res.status(400).json({ ok: false, error: "invalid_signature_image" });
    return;
  }
  if (!photoIdBase64 || photoIdBase64.length > MAX_KEYCARD_PHOTO_ID_BASE64_CHARS) {
    res.status(400).json({ ok: false, error: "photo_id_required" });
    return;
  }

  const ref = db.collection(SIGNATURE_REQUESTS_COLLECTION).doc(token);
  let claimed;
  try {
    claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, code: 404, error: "not_found" };
      const d = snap.data();
      if (d.status === "completed") return { ok: false, code: 409, error: "already_signed" };
      if (d.status === "processing") return { ok: false, code: 409, error: "in_progress" };
      const expiresAtMs = d.expiresAt && d.expiresAt.toMillis ? d.expiresAt.toMillis() : 0;
      if (expiresAtMs && expiresAtMs < Date.now()) return { ok: false, code: 410, error: "expired" };
      if (d.status !== "pending") return { ok: false, code: 409, error: "not_pending" };
      tx.update(ref, { status: "processing" });
      return { ok: true, data: d };
    });
  } catch (err) {
    console.error("submitSignatureRequest: transaction failed:", err);
    res.status(500).json({ ok: false, error: "internal" });
    return;
  }
  if (!claimed.ok) {
    res.status(claimed.code).json({ ok: false, error: claimed.error });
    return;
  }

  const d = claimed.data;
  try {
    const pdfInputs = await buildSigningPdfInputsFromHistory(d.historyRequestId, d.targetField, signaturePngBase64, d);
    const bytes = await buildSignedKeycardFormPdf(pdfInputs);
    const sha256 = signatureSha256Hex(bytes);
    const storagePath = `signatureRequests/${token}.pdf`;
    await bucket.file(storagePath).save(Buffer.from(bytes), {
      contentType: "application/pdf",
      metadata: { cacheControl: "private, max-age=0" },
    });

    // Per Huy's request (2026-08-21): keep the tenant's raw signature image
    // and photo ID retrievable on their own (not just baked into the PDF),
    // so the CW Email Request card can ink the actual signature onto its
    // own canvas and attach the photo ID once the tenant comes back.
    const signaturePngPath = `signatureRequests/${token}-signature.png`;
    // signaturePngBase64 is sign.html's canvas.toDataURL("image/png") VERBATIM
    // - a full "data:image/png;base64,...." string, not bare base64. Every
    // OTHER consumer of this same value strips the "data:...base64," prefix
    // first (pngDataUrlToBytes() inside buildSignedKeycardFormPdf, used a few
    // lines above via buildSigningPdfInputsFromHistory - that's why the PDF
    // baked at signing time has always looked fine). This particular write
    // didn't, so Buffer.from(fullDataUrl, "base64") silently decoded a
    // corrupted PNG (Node's base64 decoder skips the prefix's non-base64
    // characters like ":"/"/"/";" instead of erroring) - the stored file
    // looked like a real .png but failed to decode in the browser, which is
    // exactly the "finishRemoteSignature: couldn't load signature image"
    // console error and the root cause of the customer signature never
    // reaching signIdSignatures (2026-08-21 "customer signature missing"
    // investigation, 2nd occurrence).
    const signaturePngBytes = signaturePngBase64.includes(",") ? signaturePngBase64.split(",")[1] : signaturePngBase64;
    await bucket.file(signaturePngPath).save(Buffer.from(signaturePngBytes, "base64"), {
      contentType: "image/png",
      metadata: { cacheControl: "private, max-age=0" },
    });
    const sanitizedAttachmentPhotoIdName = photoIdFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const photoIdAttachmentPath = `signatureRequests/${token}-photoid-${sanitizedAttachmentPhotoIdName}`;
    await bucket.file(photoIdAttachmentPath).save(Buffer.from(photoIdBase64, "base64"), {
      contentType: photoIdContentType,
      metadata: { cacheControl: "private, max-age=0" },
    });

    const forwardedFor = req.headers["x-forwarded-for"];
    const ip = (typeof forwardedFor === "string" && forwardedFor.split(",")[0].trim()) || req.ip || null;

    await db.collection(KEYCARD_FORM_AUDIT_COLLECTION).add({
      filename: `Cubework_Keycard_Form_v2.1_remote_${token.slice(0, 8)}.pdf`,
      sha256,
      signers: [{ field: d.targetField, signerName, consented: true }],
      locationText: d.locationText || null,
      submittedByEmail: `remote-signer:${d.tenantEmail}`,
      submittedAt: FieldValue.serverTimestamp(),
      ip,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 300) : null,
      signatureRequestToken: token,
      signedRemotely: true,
    });

    await ref.update({
      status: "completed",
      completedAt: FieldValue.serverTimestamp(),
      signedPdfPath: storagePath,
      signaturePngPath,
      photoIdAttachmentPath,
      photoIdContentType,
      photoIdFileName,
      sha256,
      signerName,
      signerIp: ip,
    });

    // Fold the photo ID + this card's completion into the overall Keycard
    // Submission History record, if this remote request was tagged with one
    // (see createKeycardSignatureRequest). Best-effort: a failure here must
    // not unwind the signature that already succeeded above.
    if (d.historyRequestId) {
      try {
        const cardNumberMatch = (d.targetField || "").match(/^card([1-7])_signature$/);
        const cardNumber = cardNumberMatch ? cardNumberMatch[1] : "";
        if (cardNumber) {
          const sanitizedName = photoIdFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const photoIdPath = `${KEYCARD_PHOTO_ID_STORAGE_PREFIX}/${d.historyRequestId}/card${cardNumber}-remote-${token.slice(0, 8)}-${sanitizedName}`;
          await bucket.file(photoIdPath).save(Buffer.from(photoIdBase64, "base64"), {
            contentType: photoIdContentType,
            metadata: { cacheControl: "private, max-age=0" },
          });
          const histRef = db.collection(KEYCARD_REQUEST_HISTORY_COLLECTION).doc(d.historyRequestId);
          const histSnap = await histRef.get();
          const histExisting = histSnap.exists ? histSnap.data() : {};
          const cardCount = Number.isInteger(histExisting.cardCount) ? histExisting.cardCount : 0;
          const photoIds = {
            ...(histExisting.photoIds || {}),
            [cardNumber]: {
              path: photoIdPath,
              name: photoIdFileName,
              contentType: photoIdContentType,
              uploadedAt: FieldValue.serverTimestamp(),
              uploadedVia: "remote",
            },
          };
          const signedCards = { ...(histExisting.signedCards || {}), [cardNumber]: true };
          // Manual override (added 2026-08-20) - see recordKeycardSubmission's
          // own comment; a remote signature completing shouldn't silently
          // clobber a hand-set status either.
          const newStatus =
            histExisting.manualOverride === true
              ? histExisting.status
              : computeKeycardHistoryStatus(photoIds, signedCards, cardCount, histExisting.sent === true);
          await histRef.set(
            {
              photoIds,
              signedCards,
              status: newStatus,
              completedAt: newStatus === "complete" ? FieldValue.serverTimestamp() : histExisting.completedAt || null,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (histErr) {
        console.error("submitSignatureRequest: failed to update keycardRequestHistory (signature still saved):", histErr);
      }
    }

    try {
      const graphClient = await getGraphClientForSend();
      // "[Tenant Company Name] - [Tenant First Last name]" per Huy's spec
      // (2026-09-20 pass) - falls back to just the signer's typed name if
      // neither companyName nor tenantName was on file for this request.
      const signedByLabel = [d.companyName, d.tenantName].filter(Boolean).join(" - ") || signerName;
      // Keycard Number must come from the SAME authoritative source as the
      // signed PDF itself (pdfInputs.fieldValues, built off the LIVE
      // keycardRequestHistory doc by buildSigningPdfInputsFromHistory above)
      // rather than d.fieldValues - the narrow snapshot captured back when
      // the signature request was first sent, which goes stale if the card
      // was edited in the meantime. cardNumber is re-derived from
      // d.targetField the same way buildSigningPdfInputsFromHistory does,
      // since d never stored it as its own field. Falls back to the stale
      // snapshot only when the live lookup didn't have it (deleted history
      // record, older non-History-linked request).
      const notifyCardMatch = /^card([1-7])_signature$/.exec(d.targetField || "");
      const notifyCardNumber = notifyCardMatch ? notifyCardMatch[1] : "";
      const keycardNumber =
        (notifyCardNumber &&
          ((pdfInputs.fieldValues && pdfInputs.fieldValues["card" + notifyCardNumber + "_keycard_number"]) ||
            (d.fieldValues && d.fieldValues["card" + notifyCardNumber + "_keycard_number"]))) ||
        "";
      await sendPlainHtmlEmail(graphClient, {
        toEmail: d.createdBy,
        subject: "Signed: Cubework Keycard Form" + (d.tenantName ? " — " + escapeHtmlForEmail(d.tenantName) : ""),
        html:
          `<p>${escapeHtmlForEmail(signedByLabel)} just signed the Keycard Authorization Form${
            d.locationText ? " for " + escapeHtmlForEmail(d.locationText) : ""
          }.</p>` +
          `<p>Keycard Number: ${keycardNumber ? escapeHtmlForEmail(keycardNumber) : "N/A"}</p>` +
          `<p>Open the CW Email Request Tab, click on Submission, click on Edit, and ensure the Signature and Photo ID are attached.</p>` +
          `<p><a href="${PUBLIC_APP_ORIGIN}/">Open CW Email Request</a></p>`,
      });
    } catch (notifyErr) {
      console.error("submitSignatureRequest: staff notification email failed (signature still saved):", notifyErr);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("submitSignatureRequest: failed to finalize, reverting to pending:", err);
    await ref.update({ status: "pending" }).catch(() => {});
    res.status(500).json({ ok: false, error: "internal" });
  }
});

exports.getSignedKeycardFormPdf = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const token = typeof request.data?.token === "string" ? request.data.token : "";
  if (!SIGNATURE_TOKEN_RE.test(token)) throw new HttpsError("invalid-argument", "A valid token is required.");
  const snap = await db.collection(SIGNATURE_REQUESTS_COLLECTION).doc(token).get();
  if (!snap.exists) throw new HttpsError("not-found", "No such signature request.");
  const d = snap.data();
  if (d.status !== "completed" || !d.signedPdfPath) {
    throw new HttpsError("failed-precondition", "This signature request hasn't been completed yet.");
  }
  try {
    const [bytes] = await bucket.file(d.signedPdfPath).download();
    // Per Huy's request (2026-08-21): also hand back the tenant's raw
    // signature image and photo ID (when this request saved them - older
    // completed requests predate these fields) so the caller can ink the
    // signature onto its own canvas and attach the photo ID, not just the
    // final PDF. Best-effort - a missing/unreadable extra file must not
    // block the PDF the caller actually needs.
    let signatureBase64 = null;
    if (d.signaturePngPath) {
      try {
        const [sigBytes] = await bucket.file(d.signaturePngPath).download();
        signatureBase64 = sigBytes.toString("base64");
      } catch (sigErr) {
        console.error(`getSignedKeycardFormPdf: could not read ${d.signaturePngPath}:`, sigErr.message);
      }
    }
    let photoIdBase64 = null;
    if (d.photoIdAttachmentPath) {
      try {
        const [idBytes] = await bucket.file(d.photoIdAttachmentPath).download();
        photoIdBase64 = idBytes.toString("base64");
      } catch (idErr) {
        console.error(`getSignedKeycardFormPdf: could not read ${d.photoIdAttachmentPath}:`, idErr.message);
      }
    }
    return {
      ok: true,
      base64Data: bytes.toString("base64"),
      sha256: d.sha256 || null,
      signatureBase64,
      photoIdBase64,
      photoIdContentType: d.photoIdContentType || null,
      photoIdFileName: d.photoIdFileName || null,
    };
  } catch (err) {
    console.error(`getSignedKeycardFormPdf: could not read ${d.signedPdfPath}:`, err.message);
    throw new HttpsError("not-found", "Could not read the signed PDF.");
  }
});

// Keycard Submission History (added 2026-08-19) - see the big comment at
// the top of functions/keycardHistory.js for the overall design. requestId
// is minted client-side (public/index.html embed script) and reused across
// every call below for one draft/submission, so these three onCall
// functions all validate its shape the same way rather than trusting it as
// an existing Firestore doc id blindly.
const KEYCARD_HAVE_FORM_VALUES = ["yes", "no"];

// Called at Send time for Keycard-mode submissions (alongside
// submitEmailRequest). "yes" (physical form already signed) is complete
// immediately; "no" starts pending until every card gets a photo ID +
// signature via uploadKeycardPhotoId/updateKeycardHistoryStatus (in-person)
// or submitSignatureRequest (remote). Idempotent .set(merge) - Send and a
// signing sub-flow finishing first can happen in either order.
exports.recordKeycardSubmission = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const data = request.data || {};
  const requestId = typeof data.requestId === "string" && KEYCARD_REQUEST_ID_RE.test(data.requestId) ? data.requestId : "";
  if (!requestId) throw new HttpsError("invalid-argument", "A valid requestId is required.");
  const path = KEYCARD_HAVE_FORM_VALUES.includes(data.path) ? data.path : null;
  if (!path) throw new HttpsError("invalid-argument", "path must be 'yes' or 'no'.");
  const cardCount = Number.isInteger(data.cardCount) && data.cardCount >= 0 ? Math.min(data.cardCount, 7) : 0;
  const entriesSummary = sanitizeKeycardEntriesSummary(data.entriesSummary);
  const extraLocationBodyLines = sanitizeKeycardExtraLocationLines(data.extraLocationBodyLines);

  const ref = db.collection(KEYCARD_REQUEST_HISTORY_COLLECTION).doc(requestId);
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() : {};
  // "sent" (added for repair: don't move to Complete before Preview > Send
  // is actually pressed) - sticky once true, since a Save-time call (which
  // never sets it) must not un-send an already-sent request. Gates BOTH
  // paths: "yes" (physical form) previously went straight to "complete" the
  // moment ANY recordKeycardSubmission call touched it, including a plain
  // Save - now it stays "pending" until sent too.
  const sentFlag = data.sent === true || existingData.sent === true;
  // Manual override (added 2026-08-20) - once staff has hand-set the status
  // via setKeycardHistoryStatus, a plain Save or a real Preview > Send on
  // this same submission must not silently recompute/overwrite it back.
  const status =
    existingData.manualOverride === true
      ? existingData.status
      : path === "yes"
      ? (sentFlag ? "complete" : "pending")
      : computeKeycardHistoryStatus(existingData.photoIds, existingData.signedCards, cardCount, sentFlag);

  const updatePayload = {
    status,
    sent: sentFlag,
    path,
    locationText: typeof data.locationText === "string" ? data.locationText.trim().slice(0, 300) : "",
    extraLocationBodyLines,
    requesterEmail: typeof data.requesterEmail === "string" ? data.requesterEmail.trim().slice(0, 200) : "",
    entriesSummary,
    cardCount,
    createdBy: existingData.createdBy || request.auth.token.email,
    createdAt: existingData.createdAt || FieldValue.serverTimestamp(),
    completedAt: status === "complete" ? existingData.completedAt || FieldValue.serverTimestamp() : existingData.completedAt || null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // Full outer-form state (added for the Save/Edit flow, docs/email-request-attachments-embed-tab.md
  // "Keycard Submission History") - only written when the caller actually
  // sent it, so a Send-time recordKeycardSubmission call (which doesn't
  // build these) can't clobber a richer draft an earlier Save already wrote.
  if (Array.isArray(data.fullEntries)) updatePayload.fullEntries = sanitizeKeycardFullEntries(data.fullEntries);
  if (typeof data.serves === "string") updatePayload.serves = data.serves.slice(0, 40);
  if (typeof data.hikcentral === "boolean") updatePayload.hikcentral = data.hikcentral;
  if (typeof data.unifi === "boolean") updatePayload.unifi = data.unifi;
  // Deal & LICENSEE outer fields (docs/Keycard.md §5.1, 2026-08-21) - new,
  // optional, same "only written when the caller actually built them" guard
  // as serves/hikcentral/unifi above so an older-shaped call can't clobber
  // these with blanks.
  if (typeof data.licenseeCompanyName === "string") updatePayload.licenseeCompanyName = data.licenseeCompanyName.trim().slice(0, 200);
  if (typeof data.yardiDealAccount === "string") updatePayload.yardiDealAccount = data.yardiDealAccount.trim().slice(0, 100);
  if (typeof data.floorNumber === "string") updatePayload.floorNumber = data.floorNumber.trim().slice(0, 40);
  if (typeof data.unitNumber === "string") updatePayload.unitNumber = data.unitNumber.trim().slice(0, 40);
  // "Issued By" staff sign-off (added per Huy's request, re-introducing this
  // one field from the retired Keycard Form modal into the newer per-card
  // Signature/ID flow) - just the typed name; the drawn signature itself
  // goes through its own dedicated saveKeycardIssuedBySignature callable
  // below, same reasoning saveKeycardSignIdSignature was split out for.
  if (typeof data.issuedByName === "string") updatePayload.issuedByName = data.issuedByName.trim().slice(0, 200);
  // Staff sign-off Date (added alongside Name/Signature per Huy's request) -
  // same plain-field treatment as issuedByName; the signature PNG itself
  // still goes through its own saveKeycardIssuedBySignature callable.
  if (typeof data.issuedByDate === "string") updatePayload.issuedByDate = data.issuedByDate.trim().slice(0, 20);
  if (data.formSnapshot && typeof data.formSnapshot === "object") {
    const sanitizedSnapshot = sanitizeKeycardFormSnapshot(data.formSnapshot);
    if (sanitizedSnapshot) updatePayload.formSnapshot = sanitizedSnapshot;
  }

  await ref.set(updatePayload, { merge: true });
  return { ok: true, requestId, status };
});

// Per-entry "Signature / ID" ink on the MAIN Keycard form (2026-08-21+,
// full Edit-restore pass) - persists one card's canvas as a small PNG data
// URL directly on the keycardRequestHistory doc under signIdSignatures,
// keyed by card/entry number, so "Edit" on a Pending submission can redraw
// the ink even after a page refresh or in a different browser session
// (contrast with the Keycard Form modal's own formSnapshot.signatures,
// which this simpler per-entry UI deliberately doesn't reuse - see the
// "Per-card Signature / ID" comment in public/index.html). A single
// dedicated callable (rather than piggybacking on recordKeycardSubmission)
// so a signature captured mid-draw can't accidentally clobber
// entriesSummary/cardCount, which recordKeycardSubmission always
// recomputes and writes unconditionally. Passing an empty/missing dataUrl
// deletes that card's stored signature (used by the Clear button).
exports.saveKeycardSignIdSignature = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const data = request.data || {};
  const requestId = typeof data.requestId === "string" && KEYCARD_REQUEST_ID_RE.test(data.requestId) ? data.requestId : "";
  const cardNumber = typeof data.cardNumber === "string" && KEYCARD_CARD_NUMBER_RE.test(data.cardNumber) ? data.cardNumber : "";
  if (!requestId || !cardNumber) throw new HttpsError("invalid-argument", "requestId and cardNumber are required.");
  let value;
  if (typeof data.dataUrl === "string" && data.dataUrl) {
    const sanitized = sanitizeKeycardSignIdSignatureDataUrl(data.dataUrl);
    if (!sanitized) throw new HttpsError("invalid-argument", "Invalid or oversized signature image.");
    value = sanitized;
  } else {
    value = FieldValue.delete();
  }
  await db.collection(KEYCARD_REQUEST_HISTORY_COLLECTION).doc(requestId).set(
    { signIdSignatures: { [cardNumber]: value }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true };
});

// "Issued By" staff sign-off signature (added per Huy's request) - a single
// submission-level counterpart to saveKeycardSignIdSignature above (no
// cardNumber - there's exactly one Issued By block per submission, not one
// per card), stored as its own top-level field so it can't collide with the
// per-card signIdSignatures map. Same dedicated-callable reasoning: a
// signature captured mid-draw shouldn't clobber entriesSummary/cardCount via
// recordKeycardSubmission. Passing an empty/missing dataUrl deletes it
// (Clear button).
exports.saveKeycardIssuedBySignature = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const data = request.data || {};
  const requestId = typeof data.requestId === "string" && KEYCARD_REQUEST_ID_RE.test(data.requestId) ? data.requestId : "";
  if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");
  let value;
  if (typeof data.dataUrl === "string" && data.dataUrl) {
    const sanitized = sanitizeKeycardSignIdSignatureDataUrl(data.dataUrl);
    if (!sanitized) throw new HttpsError("invalid-argument", "Invalid or oversized signature image.");
    value = sanitized;
  } else {
    value = FieldValue.delete();
  }
  await db.collection(KEYCARD_REQUEST_HISTORY_COLLECTION).doc(requestId).set(
    { issuedBySignature: value, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true };
});

// Used by the in-person Keycard Form modal (staff is authenticated, so a
// plain onCall works here - contrast with submitSignatureRequest's public
// onRequest, needed because a remote tenant has no session at all).
exports.uploadKeycardPhotoId = onCall({ timeoutSeconds: 60 }, async (request) => {
  await requireRole(request, "view");
  const data = request.data || {};
  const requestId = typeof data.requestId === "string" && KEYCARD_REQUEST_ID_RE.test(data.requestId) ? data.requestId : "";
  const cardNumber = typeof data.cardNumber === "string" && KEYCARD_CARD_NUMBER_RE.test(data.cardNumber) ? data.cardNumber : "";
  const fileName = typeof data.fileName === "string" && data.fileName.trim() ? data.fileName.trim() : "";
  const base64Data = typeof data.base64Data === "string" ? data.base64Data : "";
  if (!requestId || !cardNumber || !fileName || !base64Data) {
    throw new HttpsError("invalid-argument", "requestId, cardNumber, fileName, and base64Data are required.");
  }
  const bytes = Buffer.from(base64Data, "base64");
  if (bytes.length > MAX_KEYCARD_PHOTO_ID_BYTES) throw new HttpsError("invalid-argument", "File is too large (max 8 MB).");
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const contentType = typeof data.contentType === "string" && data.contentType ? data.contentType.slice(0, 100) : "application/octet-stream";
  const storagePath = `${KEYCARD_PHOTO_ID_STORAGE_PREFIX}/${requestId}/card${cardNumber}-${Date.now()}-${sanitizedName}`;
  await bucket.file(storagePath).save(bytes, {
    contentType,
    metadata: { cacheControl: "private, max-age=0" },
  });
  await db.collection(KEYCARD_REQUEST_HISTORY_COLLECTION).doc(requestId).set(
    {
      photoIds: {
        [cardNumber]: {
          path: storagePath,
          name: fileName.slice(0, 200),
          contentType,
          uploadedAt: FieldValue.serverTimestamp(),
          uploadedVia: "in-person",
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, path: storagePath };
});

// Called by the in-person Keycard Form modal's Save/Save & Attach PDF after
// a card's signature is successfully captured, to mark that card signed and
// recompute the overall submission's status.
exports.updateKeycardHistoryStatus = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const data = request.data || {};
  const requestId = typeof data.requestId === "string" && KEYCARD_REQUEST_ID_RE.test(data.requestId) ? data.requestId : "";
  const cardNumber = typeof data.cardNumber === "string" && KEYCARD_CARD_NUMBER_RE.test(data.cardNumber) ? data.cardNumber : "";
  if (!requestId || !cardNumber) throw new HttpsError("invalid-argument", "requestId and cardNumber are required.");

  const ref = db.collection(KEYCARD_REQUEST_HISTORY_COLLECTION).doc(requestId);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() : {};
  const cardCount = Number.isInteger(existing.cardCount) ? existing.cardCount : 0;
  const signedCards = { ...(existing.signedCards || {}), [cardNumber]: true };
  // Manual override (added 2026-08-20) - see recordKeycardSubmission's own
  // comment above; a card getting signed in-person shouldn't silently
  // clobber a hand-set status either.
  const status = existing.manualOverride === true ? existing.status : computeKeycardHistoryStatus(existing.photoIds, signedCards, cardCount, existing.sent === true);

  await ref.set(
    {
      signedCards,
      status,
      completedAt: status === "complete" ? existing.completedAt || FieldValue.serverTimestamp() : existing.completedAt || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, status };
});

// Lets staff view a stored photo ID from the History Submission card - same
// base64-download shape as getRoadmapAttachmentData.
exports.getKeycardPhotoIdData = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "view");
  const { requestId, path: filePath } = request.data || {};
  if (!requestId || !filePath) throw new HttpsError("invalid-argument", "requestId and path are required.");
  if (!filePath.startsWith(`${KEYCARD_PHOTO_ID_STORAGE_PREFIX}/${requestId}/`)) {
    throw new HttpsError("invalid-argument", "path does not belong to this request.");
  }
  try {
    const file = bucket.file(filePath);
    const [bytes] = await file.download();
    const [meta] = await file.getMetadata();
    return { ok: true, base64Data: bytes.toString("base64"), contentType: meta.contentType || "application/octet-stream" };
  } catch (err) {
    console.error(`getKeycardPhotoIdData: could not read ${filePath}:`, err.message);
    throw new HttpsError("not-found", "Could not read that photo ID.");
  }
});

// Builds ONE complete Cubework_Keycard_Form_v2.1 PDF for the whole
// submission (every card's data/checkboxes/signature, plus the staff
// "Issued By" signature/print name/date) from the live keycardRequestHistory
// doc - per Huy's request that everything (entries, checked boxes, customer
// signature, photo ID yes/no, staff signature/name/date) actually be
// transferred into the Keycard Form, not just fragments (a raw
// Signature_CardN.png/photo file for in-person cards, or a per-card partial
// PDF for remote ones - neither of which ever carried the FULL picture; see
// buildKeycardFormPdfInputsFromHistory's own comment in keycardHistory.js).
// Called by the client right before Preview/Send (public/index.html) so the
// attached Keycard Form always reflects whatever's currently saved. Same
// base64-return shape as getSignedKeycardFormPdf/getKeycardPhotoIdData.
exports.buildKeycardHistoryFormPdf = onCall({ timeoutSeconds: 60 }, async (request) => {
  await requireRole(request, "view");
  const data = request.data || {};
  const requestId = typeof data.requestId === "string" && KEYCARD_REQUEST_ID_RE.test(data.requestId) ? data.requestId : "";
  if (!requestId) throw new HttpsError("invalid-argument", "A valid requestId is required.");
  const snap = await db.collection(KEYCARD_REQUEST_HISTORY_COLLECTION).doc(requestId).get();
  if (!snap.exists) throw new HttpsError("not-found", "No submission found for that requestId.");
  const inputs = buildKeycardFormPdfInputsFromHistory(snap.data());
  const bytes = await buildSignedKeycardFormPdf(inputs);
  return { ok: true, base64Data: Buffer.from(bytes).toString("base64") };
});

// Keycard Submission History "Delete" (added 2026-08-19) - a REAL,
// permanent removal of the history record, called from the History
// card's own Delete button (public/index.html). Contrast with "Your
// Signature Requests"' own Remove button, which is purely client-side
// (localStorage) and never reaches this file at all - deleting a
// signatureRequests doc isn't part of that feature, only this one.
// requireRole(..., "edit") matches every other delete callable in this
// file (deleteRoadmapItem, deleteIssueItem) rather than "view" like the
// read/upload keycard callables above, since this is a destructive action.
exports.deleteKeycardHistory = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "edit");
  const data = request.data || {};
  const requestId = typeof data.requestId === "string" && KEYCARD_REQUEST_ID_RE.test(data.requestId) ? data.requestId : "";
  if (!requestId) throw new HttpsError("invalid-argument", "A valid requestId is required.");
  await db.collection(KEYCARD_REQUEST_HISTORY_COLLECTION).doc(requestId).delete();
  return { ok: true };
});

// Manual Pending<->Complete override (added 2026-08-20) - called from the
// History card's own "Mark Pending"/"Mark Complete" button so staff can
// correct a status by hand regardless of what the photo-ID/signature
// auto-computation (computeKeycardHistoryStatus) would say. Sets
// manualOverride:true, which recordKeycardSubmission, uploadKeycardPhotoId's
// sibling updateKeycardHistoryStatus, and submitSignatureRequest above all
// check before recomputing `status` - so this sticks even through a later
// plain Save or a real Preview > Send on the same submission, not just until
// the next automatic write. requireRole(..., "edit") matches
// deleteKeycardHistory above, since this is a manual correction, not a
// read-only action.
const KEYCARD_MANUAL_STATUSES = ["pending", "complete"];
exports.setKeycardHistoryStatus = onCall({ timeoutSeconds: 30 }, async (request) => {
  await requireRole(request, "edit");
  const data = request.data || {};
  const requestId = typeof data.requestId === "string" && KEYCARD_REQUEST_ID_RE.test(data.requestId) ? data.requestId : "";
  const status = KEYCARD_MANUAL_STATUSES.includes(data.status) ? data.status : "";
  if (!requestId || !status) throw new HttpsError("invalid-argument", "requestId and status (pending|complete) are required.");

  const ref = db.collection(KEYCARD_REQUEST_HISTORY_COLLECTION).doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "No such submission.");
  const existing = snap.data();

  await ref.set(
    {
      status,
      manualOverride: true,
      manualOverrideBy: request.auth.token.email,
      manualOverrideAt: FieldValue.serverTimestamp(),
      completedAt: status === "complete" ? existing.completedAt || FieldValue.serverTimestamp() : existing.completedAt || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, status };
});

exports.migrateTagCatalogsToShared=onCall({timeoutSeconds:300},async t=>{requireOwner(t);const e=t.data?.dryRun!==!1,a=["standupTagCatalog","dailyTodoTagCatalog","issueTagCatalog"],n=new Map,o=new Map;let i=0;for(const l of a){const g=await db.collection(l).orderBy("addedAt","asc").get().catch(()=>db.collection(l).get());for(const h of g.docs){const c=h.data(),w=(c.label||"").trim();if(!w)continue;const u=w.toLowerCase();let f=o.get(u);f?i++:(f={id:null,label:w,color:c.color||"#6b7280",addedBy:c.addedBy||null,addedAt:c.addedAt||FieldValue.serverTimestamp()},o.set(u,f)),n.set(h.id,f)}}if(!e)for(const l of o.values()){const g=await db.collection(SHARED_TAG_CATALOG_COLLECTION).add({label:l.label,color:l.color,addedBy:l.addedBy,addedAt:l.addedAt});l.id=g.id}const d={};for(const[l,g]of n.entries())d[l]=g.id;const r=l=>{if(typeof l!="string"||!l.startsWith("custom:"))return null;const g=l.slice(7),h=d[g];return!h||h===g?null:`custom:${h}`};let s=0,m=0,p=0;if(!e){const l=await db.collection("issueItems").get();for(const c of l.docs){const w=r(c.data().tag);w&&(await c.ref.update({tag:w}),s++)}const g=await db.collection(STANDUP_SAVES_COLLECTION).get();for(const c of g.docs){const w=Array.isArray(c.data().items)?c.data().items:[];let u=!1;const f=w.map(y=>{const v=r(y.tag);return v?(u=!0,{...y,tag:v}):y});u&&(await c.ref.update({items:f}),m++)}const h=await db.collection(DAILY_TODO_SAVES_COLLECTION).get();for(const c of h.docs){const w=Array.isArray(c.data().entries)?c.data().entries:[];let u=!1;const f=w.map(y=>{const v=r(y.tag);return v?(u=!0,{...y,tag:v}):y});u&&(await c.ref.update({entries:f}),p++)}}return{ok:!0,dryRun:e,uniqueTagsFound:o.size,labelCollisionsMerged:i,tagsCreatedInSharedCatalog:e?0:o.size,issueItemsUpdated:s,standupSavesUpdated:m,dailyTodoSavesUpdated:p,labelMapping:Array.from(o.values()).map(l=>({label:l.label,newId:l.id}))}}),exports.setThreadCompleted=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{threadKey:e,completed:a}=t.data||{};if(!e||typeof a!="boolean")throw new HttpsError("invalid-argument","threadKey (string) and completed (boolean) are required.");return await db.collection(THREAD_STATUS_COLLECTION).doc(e).set({completed:a,completedAt:a?FieldValue.serverTimestamp():null,updatedBy:t.auth.token.email},{merge:!0}),{ok:!0}}),exports.addRoadmapItem=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const e=(t.data?.title||"").trim();if(!e)throw new HttpsError("invalid-argument","title (non-empty string) is required.");const a=(t.data?.notes||"").trim(),n=normalizeStateCode(t.data?.state);return{ok:!0,id:(await db.collection(ROADMAP_COLLECTION).add({title:e,notes:a||null,state:n,status:"planning",completed:!1,completedAt:null,createdAt:FieldValue.serverTimestamp(),createdBy:t.auth.token.email})).id}}),exports.updateRoadmapItem=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e}=t.data||{},a=(t.data?.title||"").trim();if(!e||!a)throw new HttpsError("invalid-argument","itemId (string) and title (non-empty string) are required.");const n=(t.data?.notes||"").trim(),o=normalizeStateCode(t.data?.state),i=/^\d{4}-\d{2}-\d{2}$/,d=(t.data?.deploymentStart||"").trim(),r=(t.data?.deploymentEnd||"").trim(),s=i.test(d)?d:null,m=i.test(r)?r:null,p=["unifi","amazon","homedepot","lts"],g=(Array.isArray(t.data?.lineItems)?t.data.lineItems:[]).filter(c=>c&&typeof c.amount=="number"&&isFinite(c.amount)).slice(0,200).map(c=>({desc:typeof c.desc=="string"?c.desc.trim().slice(0,300):"",qty:typeof c.qty=="number"&&isFinite(c.qty)?c.qty:1,amount:c.amount,vendor:p.includes(c.vendor)?c.vendor:"unifi"}));await db.collection(ROADMAP_COLLECTION).doc(e).set({title:a,notes:n||null,state:o,lineItems:g,deploymentStart:s,deploymentEnd:m,updatedAt:FieldValue.serverTimestamp(),updatedBy:t.auth.token.email},{merge:!0});const h={};for(const c of g){const w=c.desc.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,120);if(!w)continue;const u=`${c.vendor}_${w}`;h[u]={desc:c.desc,amount:c.amount,vendor:c.vendor,updatedAt:FieldValue.serverTimestamp()}}return Object.keys(h).length&&await db.collection("roadmapSettings").doc("customLineItems").set({items:h},{merge:!0}),{ok:!0}});const ROADMAP_STATUSES=["planning","active","pending","complete"];exports.setRoadmapItemStatus=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e,status:a}=t.data||{};if(!e||!ROADMAP_STATUSES.includes(a))throw new HttpsError("invalid-argument","itemId (string) and status (pending|active|complete) are required.");return await db.collection(ROADMAP_COLLECTION).doc(e).set({status:a,completed:a==="complete",completedAt:a==="complete"?FieldValue.serverTimestamp():null},{merge:!0}),{ok:!0}}),exports.setRoadmapItemResolution=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e}=t.data||{};if(!e)throw new HttpsError("invalid-argument","itemId (string) is required.");const a=(t.data?.resolution||"").trim();return await db.collection(ROADMAP_COLLECTION).doc(e).set({resolution:a||null,resolutionUpdatedAt:FieldValue.serverTimestamp(),resolutionUpdatedBy:t.auth.token.email},{merge:!0}),{ok:!0}}),exports.setRoadmapItemPendingReason=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e}=t.data||{};if(!e)throw new HttpsError("invalid-argument","itemId (string) is required.");const a=(t.data?.pendingReason||"").trim();return await db.collection(ROADMAP_COLLECTION).doc(e).set({pendingReason:a||null,pendingReasonUpdatedAt:FieldValue.serverTimestamp(),pendingReasonUpdatedBy:t.auth.token.email},{merge:!0}),{ok:!0}});const MAX_ROADMAP_ATTACHMENT_BYTES=8*1024*1024;exports.getRoadmapAttachmentData=onCall({timeoutSeconds:60},async t=>{await requireRole(t,"view");const{itemId:e,path:a}=t.data||{};if(!e||!a)throw new HttpsError("invalid-argument","itemId and path are required.");if(!a.startsWith(`roadmapAttachments/${e}/`))throw new HttpsError("invalid-argument","path does not belong to this item.");try{const n=bucket.file(a),[o]=await n.download(),[i]=await n.getMetadata();return{base64Data:o.toString("base64"),contentType:i.contentType||"application/octet-stream"}}catch(n){throw console.error(`Could not read attachment ${a}:`,n.message),new HttpsError("not-found","Could not read that attachment.")}}),exports.fetchUnifiPrice=onCall({timeoutSeconds:20},async t=>{await requireRole(t,"edit");const{url:e,sku:a}=t.data||{};if(typeof e!="string"||!e.startsWith("https://store.ui.com/"))throw new HttpsError("invalid-argument","url must be a store.ui.com page.");let n;try{const s=await fetch(e,{headers:{"User-Agent":"Mozilla/5.0 (compatible; KeycardHelpdesk/1.0)"}});if(!s.ok)throw new Error(`status ${s.status}`);n=await s.text()}catch(s){throw console.error(`Could not fetch ${e}:`,s.message),new HttpsError("unavailable","Could not reach the UniFi store.")}const o=n.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&");let i=0;if(typeof a=="string"&&a){const s=o.indexOf(a);s>=0&&(i=s)}const r=o.slice(i,i+400).match(/\$([\d,]+(?:\.\d{2})?)/);if(!r)throw new HttpsError("not-found","Could not find a price on that page.");return{price:parseFloat(r[1].replace(/,/g,""))}});const PRODUCT_PRICE_VENDOR_DOMAINS={unifi:"store.ui.com",amazon:"amazon.com",homedepot:"homedepot.com",lts:"ltsecurityinc.com"};exports.fetchProductPrice=onCall({timeoutSeconds:20},async t=>{await requireRole(t,"edit");const{url:e,sku:a,vendor:n}=t.data||{},o=PRODUCT_PRICE_VENDOR_DOMAINS[n];if(!o)throw new HttpsError("invalid-argument",`vendor must be one of: ${Object.keys(PRODUCT_PRICE_VENDOR_DOMAINS).join(", ")}.`);let i;try{i=new URL(e)}catch{throw new HttpsError("invalid-argument","url is not a valid URL.")}if(i.protocol!=="https:"||!i.hostname.endsWith(o))throw new HttpsError("invalid-argument",`url must be an https:// link on ${o}.`);let d;try{const l=await fetch(i.toString(),{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}});if(!l.ok)throw new Error(`status ${l.status}`);d=await l.text()}catch(l){throw console.error(`Could not fetch ${e}:`,l.message),new HttpsError("unavailable","Could not reach that page.")}const r=d.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&");let s=0;if(typeof a=="string"&&a){const l=r.indexOf(a);l>=0&&(s=l)}const p=r.slice(s,s+2e3).match(/\$([\d,]+(?:\.\d{2})?)/)||r.match(/\$([\d,]+(?:\.\d{2})?)/);if(!p)throw new HttpsError("not-found","Could not find a price on that page.");return{price:parseFloat(p[1].replace(/,/g,""))}}),exports.addRoadmapAttachment=onCall({timeoutSeconds:60},async t=>{await requireRole(t,"edit");const{itemId:e,fileName:a,contentType:n,base64Data:o}=t.data||{};if(!e||!a||!o)throw new HttpsError("invalid-argument","itemId, fileName, and base64Data are required.");const i=Buffer.from(o,"base64");if(i.length>MAX_ROADMAP_ATTACHMENT_BYTES)throw new HttpsError("invalid-argument","File is too large (max 8 MB).");const d=a.replace(/[^a-zA-Z0-9._-]/g,"_"),r=`roadmapAttachments/${e}/${Date.now()}-${d}`;return await bucket.file(r).save(i,{contentType:n||"application/octet-stream",metadata:{cacheControl:"public, max-age=31536000"}}),await db.collection(ROADMAP_COLLECTION).doc(e).set({attachments:FieldValue.arrayUnion({path:r,name:a})},{merge:!0}),{ok:!0,path:r}}),exports.replaceRoadmapAttachment=onCall({timeoutSeconds:60},async t=>{await requireRole(t,"edit");const{itemId:e,originalPath:a,fileName:n,base64Data:o}=t.data||{};if(!e||!a||!n||!o)throw new HttpsError("invalid-argument","itemId, originalPath, fileName, and base64Data are required.");if(!a.startsWith(`roadmapAttachments/${e}/`))throw new HttpsError("invalid-argument","originalPath does not belong to this item.");const i=Buffer.from(o,"base64");if(i.length>MAX_ROADMAP_ATTACHMENT_BYTES)throw new HttpsError("invalid-argument","File is too large (max 8 MB).");const d=n.replace(/[^a-zA-Z0-9._-]/g,"_"),r=`roadmapAttachments/${e}/${Date.now()}-${d}`;await bucket.file(r).save(i,{contentType:"image/png",metadata:{cacheControl:"public, max-age=31536000"}});const s=db.collection(ROADMAP_COLLECTION).doc(e),l=((await s.get()).data()?.attachments||[]).filter(g=>g.path!==a);return l.push({path:r,name:n}),await s.set({attachments:l},{merge:!0}),bucket.file(a).delete().catch(()=>{}),{ok:!0,path:r}}),exports.setRoadmapAttachmentNotes=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e,path:a,notes:n}=t.data||{};if(!e||!a||!Array.isArray(n))throw new HttpsError("invalid-argument","itemId, path, and notes (array) are required.");if(!a.startsWith(`roadmapAttachments/${e}/`))throw new HttpsError("invalid-argument","path does not belong to this item.");const o=/^#[0-9a-fA-F]{3,8}$/,i=n.filter(m=>m&&typeof m.x=="number"&&typeof m.y=="number"&&typeof m.text=="string"&&m.text.trim()).slice(0,200).map(m=>({x:m.x,y:m.y,text:m.text.slice(0,500),color:typeof m.color=="string"&&o.test(m.color)?m.color:"#7c3aed"})),d=db.collection(ROADMAP_COLLECTION).doc(e),s=(await d.get()).data()?.attachmentNotes||{};return s[a]=i,await d.set({attachmentNotes:s},{merge:!0}),{ok:!0}}),exports.removeRoadmapAttachment=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e,path:a}=t.data||{};if(!e||!a)throw new HttpsError("invalid-argument","itemId and path are required.");if(!a.startsWith(`roadmapAttachments/${e}/`))throw new HttpsError("invalid-argument","path does not belong to this item.");const n=db.collection(ROADMAP_COLLECTION).doc(e),d=((await n.get()).data()?.attachments||[]).filter(r=>r.path!==a);return await n.set({attachments:d},{merge:!0}),bucket.file(a).delete().catch(()=>{}),{ok:!0}}),exports.deleteRoadmapItem=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e}=t.data||{};if(!e)throw new HttpsError("invalid-argument","itemId (string) is required.");return await db.collection(ROADMAP_COLLECTION).doc(e).delete(),{ok:!0}});const ISSUE_REGIONS=["cali","outsideCali"],ISSUE_STATUSES=["active","pending","complete"],US_STATE_CODES=["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","OTHER"];function issueRegionForState(t){return t==="CA"?"cali":"outsideCali"}exports.addIssueItem=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const e=(t.data?.title||"").trim();if(!e)throw new HttpsError("invalid-argument","title (non-empty string) is required.");const a=US_STATE_CODES.includes(t.data?.state)?t.data.state:null,n=a?issueRegionForState(a):ISSUE_REGIONS.includes(t.data?.region)?t.data.region:"cali",o=(t.data?.ticket||"").trim(),i=(t.data?.location||"").trim(),d=(t.data?.notes||"").trim(),r=isValidSharedTagKey(t.data?.tag)?t.data.tag:null;return{ok:!0,id:(await db.collection(ISSUE_COLLECTION).add({title:e,ticket:o||null,location:i||null,region:n,state:a,tag:r,notes:d||null,status:"active",resolution:null,pendingReason:null,attachments:[],createdAt:FieldValue.serverTimestamp(),createdBy:t.auth.token.email})).id,region:n}}),exports.updateIssueItem=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e}=t.data||{},a=(t.data?.title||"").trim();if(!e||!a)throw new HttpsError("invalid-argument","itemId (string) and title (non-empty string) are required.");const n=(t.data?.ticket||"").trim(),o=(t.data?.location||"").trim(),i=(t.data?.notes||"").trim(),d=isValidSharedTagKey(t.data?.tag)?t.data.tag:null;return await db.collection(ISSUE_COLLECTION).doc(e).set({title:a,ticket:n||null,location:o||null,notes:i||null,tag:d,updatedAt:FieldValue.serverTimestamp(),updatedBy:t.auth.token.email},{merge:!0}),{ok:!0}}),exports.setIssueItemStatus=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e,status:a}=t.data||{};if(!e||!ISSUE_STATUSES.includes(a))throw new HttpsError("invalid-argument","itemId (string) and status (active|pending|complete) are required.");return await db.collection(ISSUE_COLLECTION).doc(e).set({status:a,statusUpdatedAt:FieldValue.serverTimestamp(),statusUpdatedBy:t.auth.token.email},{merge:!0}),{ok:!0}}),exports.setIssueItemTag=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e}=t.data||{};if(!e)throw new HttpsError("invalid-argument","itemId (string) is required.");const a=isValidSharedTagKey(t.data?.tag)?t.data.tag:null;return await db.collection(ISSUE_COLLECTION).doc(e).set({tag:a,tagUpdatedAt:FieldValue.serverTimestamp(),tagUpdatedBy:t.auth.token.email},{merge:!0}),{ok:!0}}),exports.setIssueItemResolution=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e}=t.data||{};if(!e)throw new HttpsError("invalid-argument","itemId (string) is required.");const a=(t.data?.resolution||"").trim();return await db.collection(ISSUE_COLLECTION).doc(e).set({resolution:a||null,resolutionUpdatedAt:FieldValue.serverTimestamp(),resolutionUpdatedBy:t.auth.token.email},{merge:!0}),{ok:!0}}),exports.setIssueItemPendingReason=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e}=t.data||{};if(!e)throw new HttpsError("invalid-argument","itemId (string) is required.");const a=(t.data?.pendingReason||"").trim();return await db.collection(ISSUE_COLLECTION).doc(e).set({pendingReason:a||null,pendingReasonUpdatedAt:FieldValue.serverTimestamp(),pendingReasonUpdatedBy:t.auth.token.email},{merge:!0}),{ok:!0}}),exports.deleteIssueItem=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e}=t.data||{};if(!e)throw new HttpsError("invalid-argument","itemId (string) is required.");return await db.collection(ISSUE_COLLECTION).doc(e).delete(),{ok:!0}});const MAX_ISSUE_ATTACHMENT_BYTES=8*1024*1024;exports.addIssueAttachment=onCall({timeoutSeconds:60},async t=>{await requireRole(t,"edit");const{itemId:e,fileName:a,contentType:n,base64Data:o}=t.data||{};if(!e||!a||!o)throw new HttpsError("invalid-argument","itemId, fileName, and base64Data are required.");const i=Buffer.from(o,"base64");if(i.length>MAX_ISSUE_ATTACHMENT_BYTES)throw new HttpsError("invalid-argument","File is too large (max 8 MB).");const d=a.replace(/[^a-zA-Z0-9._-]/g,"_"),r=`issueAttachments/${e}/${Date.now()}-${d}`;return await bucket.file(r).save(i,{contentType:n||"application/octet-stream",metadata:{cacheControl:"public, max-age=31536000"}}),await db.collection(ISSUE_COLLECTION).doc(e).set({attachments:FieldValue.arrayUnion({path:r,name:a})},{merge:!0}),{ok:!0,path:r}}),exports.removeIssueAttachment=onCall({timeoutSeconds:30},async t=>{await requireRole(t,"edit");const{itemId:e,path:a}=t.data||{};if(!e||!a)throw new HttpsError("invalid-argument","itemId and path are required.");if(!a.startsWith(`issueAttachments/${e}/`))throw new HttpsError("invalid-argument","path does not belong to this item.");const n=db.collection(ISSUE_COLLECTION).doc(e),d=((await n.get()).data()?.attachments||[]).filter(r=>r.path!==a);return await n.set({attachments:d},{merge:!0}),bucket.file(a).delete().catch(()=>{}),{ok:!0}}),exports.migrateRoadmapActiveToPlanning=onCall({timeoutSeconds:60},async t=>{await requireRole(t,"full");const e=await db.collection(ROADMAP_COLLECTION).get();let a=db.batch(),n=0,o=0;for(const i of e.docs){const d=i.data();(d.status||(d.completed?"complete":"active"))==="active"&&(a.set(i.ref,{status:"planning"},{merge:!0}),o++,n++,n>=400&&(await a.commit(),a=db.batch(),n=0))}return n>0&&await a.commit(),{updated:o}}),exports.getMyRole=onCall({timeoutSeconds:15},async t=>{if(!t.auth)throw new HttpsError("unauthenticated","Sign in first.");const{role:e,tabs:a,eraModes:m,eraKeycardActions:k,eraHardwareCategories:h,eraPermissions:p,showVideo:n,disableAnimations:s}=await getAccessInfo(t.auth.token.email);return{role:e,tabs:a,eraModes:m,eraKeycardActions:k,eraHardwareCategories:h,eraPermissions:p,showVideo:n,disableAnimations:s}});const VALID_ROLES=["view","edit","full"],VALID_POSITIONS=["dev","sale","facilityLead","facilityManager","boss","hr"];function sanitizePosition(t){return VALID_POSITIONS.includes(t)?t:null}exports.addAuthorizedUser=onCall({timeoutSeconds:30},async t=>{
  requireOwner(t);
  const e=normalizeEmail(t.data?.email),a=t.data?.role;
  if(!e||!e.includes("@")||!VALID_ROLES.includes(a))throw new HttpsError("invalid-argument","A valid email and role (view|edit|full) are required.");
  const em=sanitizeEraModes(t.data?.eraModes),ek=sanitizeEraKeycardActions(t.data?.eraKeycardActions),eh=sanitizeEraHardwareCategories(t.data?.eraHardwareCategories),o=t.data?.showVideo!==!1,s=t.data?.disableAnimations===!0,i=sanitizePosition(t.data?.position);
  let n=sanitizeTabs(t.data?.tabs),ep=sanitizeEraPermissions(t.data?.eraPermissions);
  const docRef=db.collection(ACCESS_CONTROL_COLLECTION).doc(e);
  // New-user default access (2026-09-19): a brand-new accessControl doc -
  // this email has never been added before, by an admin or via OTP self-
  // signup - automatically gets full CW Email Request access (every
  // eraPermissions leaf, plus the emailRequestAttachmentsEmbed tab) on top
  // of whatever else the Manage Access "add user" form sent, matching the
  // same default verifyEmailOtp applies on self-signup. This must only fire
  // when the doc doesn't exist yet: re-adding an email that already has a
  // doc (re-inviting someone previously removed, or an admin "adding" a
  // user who already self-signed-up via OTP) must NOT reset their existing
  // access back to full - an existing doc gets exactly what this call sends
  // for tabs/eraPermissions, same as before this change.
  if(!(await docRef.get()).exists){
    if(!n.includes("emailRequestAttachmentsEmbed"))n=[...n,"emailRequestAttachmentsEmbed"];
    ep=Array.from(ERA_ALL_LEAVES);
  }
  return await docRef.set({email:e,role:a,position:i,tabs:n,eraModes:em,eraKeycardActions:ek,eraHardwareCategories:eh,eraPermissions:ep,showVideo:o,disableAnimations:s,addedBy:t.auth.token.email,addedAt:FieldValue.serverTimestamp()},{merge:!0}),{ok:!0}
}),exports.updateAuthorizedUserRole=onCall({timeoutSeconds:30},async t=>{requireOwner(t);const e=normalizeEmail(t.data?.email),a=t.data?.role;if(!e||!VALID_ROLES.includes(a))throw new HttpsError("invalid-argument","A valid email and role (view|edit|full) are required.");const n={role:a,updatedBy:t.auth.token.email,updatedAt:FieldValue.serverTimestamp()};return t.data?.tabs!==void 0&&(n.tabs=sanitizeTabs(t.data.tabs)),t.data?.eraModes!==void 0&&(n.eraModes=sanitizeEraModes(t.data.eraModes)),t.data?.eraKeycardActions!==void 0&&(n.eraKeycardActions=sanitizeEraKeycardActions(t.data.eraKeycardActions)),t.data?.eraHardwareCategories!==void 0&&(n.eraHardwareCategories=sanitizeEraHardwareCategories(t.data.eraHardwareCategories)),
// eraPermissions (2026-09-19 rebuild) - same conditional-write pattern as
// every other field here: the client (Access Page) no longer sends
// eraModes/eraKeycardActions/eraHardwareCategories at all now, so those
// three branches above simply never fire for a save made from the rebuilt
// UI, leaving an existing user's legacy fields completely untouched.
t.data?.eraPermissions!==void 0&&(n.eraPermissions=sanitizeEraPermissions(t.data.eraPermissions)),
t.data?.showVideo!==void 0&&(n.showVideo=t.data.showVideo!==!1),t.data?.disableAnimations!==void 0&&(n.disableAnimations=t.data.disableAnimations===!0),t.data?.position!==void 0&&(n.position=sanitizePosition(t.data.position)),await db.collection(ACCESS_CONTROL_COLLECTION).doc(e).set(n,{merge:!0}),{ok:!0}}),exports.removeAuthorizedUser=onCall({timeoutSeconds:30},async t=>{requireOwner(t);const e=normalizeEmail(t.data?.email);if(!e)throw new HttpsError("invalid-argument","email (string) is required.");return await db.collection(ACCESS_CONTROL_COLLECTION).doc(e).delete(),{ok:!0}});
// One-time accessControl backfill (2026-09-02, "no automatic access
// assignment" request) - companion to the sanitizeTabs/sanitizeEraModes/etc.
// and getAccessInfo changes above that stopped treating a null/missing tabs-
// or era-field as "unrestricted (includes anything added later)". Without
// this backfill, every account saved before today under the old convention
// would have its access silently *reduced* to nothing the moment those code
// changes deployed, since a still-null field now reads as "granted nothing"
// instead of "granted everything". This runs once (safe to run again - a
// second pass finds nothing left with a null/missing field, aside from
// re-stripping "hardware" from anyone who picks it back up, which is a
// no-op once nobody has it) and, per that request:
//  1. Snapshots today's full MANAGEABLE_TABS/ERA_KEYCARD_ACTIONS/
//     ERA_HARDWARE_CATEGORIES list as an explicit array onto any doc whose
//     corresponding field is still null/missing - preserving exactly the
//     access those accounts already had, frozen at today's tab/action/
//     category list rather than continuing to silently expand to whatever
//     gets added in the future.
//  2. Does the same for eraModes, EXCEPT "hardware" is left out of that
//     snapshot - and stripped from any doc that already has an explicit
//     eraModes array containing it - since Hardware is brand new today and
//     nobody should end up with it just from this backfill; an admin grants
//     it explicitly afterward via Manage Access if/when someone needs it.
// The owner's own doc (if one even exists) is skipped - OWNER_EMAIL always
// resolves to unrestricted regardless of any doc, see getAccessInfo.
exports.migrateAccessControlPermissions=onCall({timeoutSeconds:120},async t=>{
  requireOwner(t);
  const dryRun=t.data?.dryRun!==!1;
  const ERA_MODES_NO_HARDWARE=ERA_MODES.filter(m=>m!=="hardware");
  const snap=await db.collection(ACCESS_CONTROL_COLLECTION).get();
  let tabsBackfilled=0,eraModesBackfilled=0,eraActionsBackfilled=0,eraHwBackfilled=0,hardwareStripped=0,eraPermissionsBackfilled=0;
  const updatedEmails=[];
  for(const doc of snap.docs){
    const email=doc.id;
    if(email===OWNER_EMAIL.toLowerCase())continue;
    const d=doc.data();
    const patch={};
    if(!Array.isArray(d.tabs)){patch.tabs=[...MANAGEABLE_TABS];tabsBackfilled++}
    let eraModes=Array.isArray(d.eraModes)?[...d.eraModes]:null;
    if(eraModes===null){eraModes=[...ERA_MODES_NO_HARDWARE];eraModesBackfilled++;patch.eraModes=eraModes}
    else if(eraModes.includes("hardware")){eraModes=eraModes.filter(m=>m!=="hardware");hardwareStripped++;patch.eraModes=eraModes}
    if(!Array.isArray(d.eraKeycardActions)){patch.eraKeycardActions=[...ERA_KEYCARD_ACTIONS];eraActionsBackfilled++}
    if(!Array.isArray(d.eraHardwareCategories)){patch.eraHardwareCategories=[...ERA_HARDWARE_CATEGORIES];eraHwBackfilled++}
    // eraPermissions (2026-09-19 ERA_TREE rebuild) - derived from this doc's
    // ORIGINAL legacy fields (d, not the possibly-just-backfilled patch
    // above), so it's an exact snapshot of what this account actually had
    // before today, not padded out by the tabs/eraModes/etc. backfill this
    // same pass may also be doing. Idempotent - a doc that already has an
    // explicit eraPermissions array (from a prior run of this migration, or
    // a save made through the rebuilt Access Page) is left untouched.
    if(!Array.isArray(d.eraPermissions)){
      patch.eraPermissions=deriveEraPermissionsFromLegacy(d);
      patch.eraPermissionsMigratedAt=FieldValue.serverTimestamp();
      eraPermissionsBackfilled++;
    }
    if(Object.keys(patch).length){
      updatedEmails.push(email);
      if(!dryRun)await doc.ref.set(patch,{merge:!0})
    }
  }
  return{ok:!0,dryRun,usersScanned:snap.size,usersUpdated:updatedEmails.length,tabsBackfilled,eraModesBackfilled,hardwareStripped,eraActionsBackfilled,eraHwBackfilled,eraPermissionsBackfilled,updatedEmails};
});
// Server-side enforcement of eraPermissions (2026-08-30, rebuilt 2026-09-19
// onto ERA_TREE) - the client-side hide/filter in the CW Email Request embed
// (public/index.html, eraApplyAccessGating/the eraCanSeeModeCompat etc.
// tables there) is UX-only; this is the real gate, mirroring the tabs/
// emailRequestAttachmentsEmbed check the client already relies on
// requireRole+canSeeTab for. The owner is exempt, matching every other
// owner-bypass in this file. getAccessInfo already resolves eraPermissions
// through the legacy-fallback (deriveEraPermissionsFromLegacy) for any
// not-yet-migrated doc, so this function only ever deals with the new leaf
// vocabulary, never eraModes/eraKeycardActions/eraHardwareCategories
// directly.
//
// Resolves each mode's real submit fields (functions/emailRequest.js) to
// the ERA_TREE leaf(s) it implies, straight off GENERIC_CONFIG/buildWifi/
// buildPhone/buildLaptop's own field names - keep this in sync if those
// field names ever change:
//  - keycard: per-entry, KEYCARD.<mapped action> via entryKeycardAction().
//  - wifi: WIFI.CUBEWORK or WIFI.UNIS from fields.serves.
//  - electrical: ELECTRICAL.<CUBEWORK|UNIS>.<CREATE|TROUBLESHOOT|DEACTIVATE>
//    from fields.serves + create/troubleshoot/deactivate (GENERIC_CONFIG.
//    electrical's hasPlainServes/hasDeactivateToggle).
//  - laptop: SOFTWARE.<CUBEWORK|UNIS>.LAPTOP.<NEW_INSTALL|TROUBLESHOOT|
//    REMOVE> from fields.serves + create/troubleshoot/remove, OR
//    HARDWARE.LAPTOP_PHONE.LAPTOP - either menu path (Software's own
//    cascade, or Hardware > Laptop/Phone > Laptop) unlocks this one real
//    backend action, per the plan's explicit dual-location design.
//  - phone: same OR shape, phone leaves, from each entry's own `action`
//    field (buildPhone/PHONE_ACTION_LABELS). NOTE: PHONE_ACTION_LABELS has
//    5 actions (create/troubleshoot/replacement/activate/remove) but
//    ERA_TREE's Software>Phone branch only has 3 leaves (NEW_INSTALL/
//    TROUBLESHOOT/REMOVE) - a gap in the tree itself, not this enforcement.
//    "replacement"/"activate" have no single corresponding leaf, so holding
//    just one narrower Phone leaf (e.g. only NEW_INSTALL) must NOT be
//    enough - that would grant broader access than what was actually
//    checked on the Access Page. These two require ALL THREE Phone leaves
//    under one serves branch (eraHasAllLeavesUnder) instead, or the
//    coarser HARDWARE.LAPTOP_PHONE.PHONE leaf; flagged in this rebuild's
//    own report as needing a tree decision (add REPLACEMENT/ACTIVATE
//    leaves, or fold them into an existing one) from Huy.
//  - printer: HARDWARE.PRINTER.<CUBEWORK|TENANT>.<SETUP_NEW_PRINTER|
//    NEW_REPLACE_PRINTER|TROUBLESHOOT> from fields.cubework/tenant +
//    create/troubleshoot/newreplace (GENERIC_CONFIG.printer's hasServes).
//  - app: mode:"app" predates the Laptop/Phone split and nothing in the
//    current UI submits it anymore (buildLaptop/buildPhone route Software's
//    own cascade into mode:"laptop"/"phone" instead) - if it's ever
//    reachable again, this requires ANY granted leaf under SOFTWARE rather
//    than inventing new granularity for a mode nothing currently submits.
//  - AP/Node, Camera, NVR, Hardware's own "New Hire" leaf, and bare
//    mode:"hardware": no real submit callable exists for any of these today
//    (Hardware's menu only ever feeds mode "laptop"/"phone"/"printer" for a
//    real submit) - known, pre-existing gap, not a regression from this
//    rebuild; nothing to enforce here yet.
function eraLeafForKeycardEntry(entry){const leaf=KEYCARD_ACTION_TO_LEAF[entryKeycardAction(entry)];return leaf?`KEYCARD.${leaf}`:null}
async function requireEraAccess(t,e){
  const email=normalizeEmail(t.auth&&t.auth.token&&t.auth.token.email);
  if(email===OWNER_EMAIL.toLowerCase())return;
  const{tabs,eraPermissions}=await getAccessInfo(email);
  if(Array.isArray(tabs)&&!tabs.includes("emailRequestAttachmentsEmbed"))throw new HttpsError("permission-denied","You don't have access to submit this type of request.");
  const granted=Array.isArray(eraPermissions)?eraPermissions:[];
  const deny=()=>{throw new HttpsError("permission-denied","You don't have access to submit this type of request.")};
  const mode=e&&e.mode;
  const fields=(e&&e.fields)||{};
  if(mode==="keycard"){
    const entries=Array.isArray(fields.entries)?fields.entries:[];
    for(const entry of entries){
      const leaf=eraLeafForKeycardEntry(entry);
      if(!leaf||!eraHasLeaf(granted,leaf))deny();
    }
    return;
  }
  if(mode==="wifi"){
    const leaf=fields.serves==="Unis"?"WIFI.UNIS":fields.serves==="Cubework"?"WIFI.CUBEWORK":null;
    if(!leaf||!eraHasLeaf(granted,leaf))deny();
    return;
  }
  if(mode==="electrical"){
    const branch=fields.serves==="Unis"?"ELECTRICAL.UNIS":fields.serves==="Cubework"?"ELECTRICAL.CUBEWORK":null;
    const action=fields.create?"CREATE":fields.troubleshoot?"TROUBLESHOOT":fields.deactivate?"DEACTIVATE":null;
    if(!branch||!action||!eraHasLeaf(granted,`${branch}.${action}`))deny();
    return;
  }
  if(mode==="laptop"){
    const serves=fields.serves==="Unis"?"UNIS":"CUBEWORK";
    const action=fields.create?"NEW_INSTALL":fields.troubleshoot?"TROUBLESHOOT":fields.remove?"REMOVE":null;
    const softwareOk=action&&eraHasLeaf(granted,`SOFTWARE.${serves}.LAPTOP.${action}`);
    if(!softwareOk&&!eraHasLeaf(granted,"HARDWARE.LAPTOP_PHONE.LAPTOP"))deny();
    return;
  }
  if(mode==="phone"){
    const entries=Array.isArray(fields.entries)?fields.entries:[];
    for(const entry of entries){
      const act=entry&&entry.action;
      const action=act==="create"?"NEW_INSTALL":act==="troubleshoot"?"TROUBLESHOOT":act==="remove"?"REMOVE":null;
      // PHONE_ACTION_LABELS (functions/emailRequest.js) has 5 real,
      // submittable actions - create/troubleshoot/replacement/activate/
      // remove - but ERA_TREE's Software>Phone branch only has the 3 the
      // task's spec calls for (NEW_INSTALL/TROUBLESHOOT/REMOVE). For
      // "replacement"/"activate" (action stays null above), there is no
      // single corresponding leaf - requiring just ANY one Phone leaf (e.g.
      // only NEW_INSTALL) would grant broader access than what was actually
      // checked on the Access Page, so this requires ALL THREE Phone leaves
      // under one serves branch instead (or the coarser
      // HARDWARE.LAPTOP_PHONE.PHONE leaf, same as the mapped-action case).
      const softwareOk=action
        ? (eraHasLeaf(granted,`SOFTWARE.CUBEWORK.PHONE.${action}`)||eraHasLeaf(granted,`SOFTWARE.UNIS.PHONE.${action}`))
        : (eraHasAllLeavesUnder(granted,"SOFTWARE.CUBEWORK.PHONE")||eraHasAllLeavesUnder(granted,"SOFTWARE.UNIS.PHONE"));
      if(!softwareOk&&!eraHasLeaf(granted,"HARDWARE.LAPTOP_PHONE.PHONE"))deny();
    }
    return;
  }
  if(mode==="printer"){
    const branch=fields.cubework?"HARDWARE.PRINTER.CUBEWORK":fields.tenant?"HARDWARE.PRINTER.TENANT":null;
    if(!branch)deny();
    const action=branch==="HARDWARE.PRINTER.CUBEWORK"
      ?(fields.newreplace?"NEW_REPLACE_PRINTER":fields.create?"SETUP_NEW_PRINTER":fields.troubleshoot?"TROUBLESHOOT":null)
      :(fields.troubleshoot?"TROUBLESHOOT":null);
    if(!action||!eraHasLeaf(granted,`${branch}.${action}`))deny();
    return;
  }
  if(mode==="app"){
    if(!eraHasAnyLeafUnder(granted,"SOFTWARE"))deny();
    return;
  }
  // Every other mode (including "hardware" itself) has no real submit
  // callable today - see this function's own comment above.
}
exports.submitEmailRequest=onCall({timeoutSeconds:180},async t=>{await requireRole(t,"view");await requireEraAccess(t,t.data||{});const e=await getGraphClientForSend();return buildAndSendEmailRequest(e,t.data||{})}),exports.buildEmailRequestPreview=onCall({timeoutSeconds:30},async t=>(await requireRole(t,"view"),await requireEraAccess(t,t.data||{}),buildEmailRequest(t.data||{})));
