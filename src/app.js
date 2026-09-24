import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  OAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {
  getStorage,
  ref,
  getDownloadURL,
  connectStorageEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAaeFlH7k1unYiakOg0EoX1jlMpuozoMhA",
  authDomain: "keycard-helpdesk.firebaseapp.com",
  projectId: "keycard-helpdesk",
  storageBucket: "keycard-helpdesk.firebasestorage.app",
  messagingSenderId: "3222930413",
  appId: "1:3222930413:web:3352240cb853d52a1d5de4",
};

// Who's allowed in, and what they can do, is decided server-side by the
// getMyRole callable (see functions/index.js) against the accessControl
// collection - "view", "edit", or "full". null means no access at all.
// Set once right after sign-in, then read everywhere the UI needs to show/
// hide edit-only or admin-only controls.
let currentUserRole = null;
function canEdit() {
  return currentUserRole === "edit" || currentUserRole === "full";
}
function isFullAccess() {
  return currentUserRole === "full";
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Local Preview runs against the Firebase Local Emulator Suite instead of
// the live "keycard-helpdesk" project - see .claude/launch.json's
// "emulator-preview" config and firebase.json's "emulators" block. This is
// the ONLY thing that distinguishes Preview from Production; firebaseConfig
// above stays the same real project either way, so this check must never
// accidentally pass on the deployed site. Gated on port 5000 specifically
// (the Hosting emulator's fixed port, per firebase.json), not just
// "localhost" - the older "static-preview" launch config (plain http-server,
// port 5173, no emulators running) still exists for a quick static check
// and must keep hitting the real project like it always did, not fail
// trying to reach emulators that aren't up.
const USE_EMULATORS =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1") &&
  location.port === "5000";
if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  console.info("Preview: connected to Firebase Local Emulator Suite (not the live project).");
}

// Sign-in/out are wired up immediately, before anything else in this file
// runs. If a later feature (attachments, tabs, etc.) ever throws during
// module load, sign-in must still work - an uncaught error partway through
// a <script type="module"> aborts every line after it, and this used to
// sit at the bottom of the file, so a Storage init failure once took the
// sign-in button down with it.
document.getElementById("signInBtn").addEventListener("click", async () => {
  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({ tenant: "091ba9e6-3b95-480c-82d7-90e84ab87aeb" });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    alert("Sign-in failed: " + err.message);
  }
});

document.getElementById("signOutBtn").addEventListener("click", () => signOut(auth));

// Light/Dark/Cubework theme toggle (2026-09-11, third mode added 2026-09-18,
// CubeWork Mode forced on every initial load 2026-09-19) - wired up
// immediately, same as sign-in/out above, so it works even before
// Firestore/auth finish initializing (it's pure client-side CSS/UI, no
// server round-trip). The actual `data-theme` attribute is stamped on
// <html> as early as possible by a tiny inline <script> in index.html's
// <head> (before this module even starts loading) to avoid a flash of the
// wrong theme on first paint - this just takes over from there for the
// click handling and persistence. Key name/valid-value list must stay in
// sync with that inline copy if either ever changes.
// "cubework" is a third mode mirroring cubework.com's own live brand
// palette (its green #52c571 + near-black/grey UI, not this app's own
// #2fb457 green) - see :root[data-theme="cubework"] in index.html.
// As of 2026-09-19: every fresh page load/reload always STARTS in
// "cubework", regardless of any saved cw_theme preference - the inline
// <head> script (index.html) already stamps data-theme="cubework"
// unconditionally before this module runs, and initThemeToggle() below
// just takes over from that same forced starting point rather than
// re-reading localStorage. A user's manual Light/Dark pick during the
// session still applies immediately and is still saved to cw_theme (via
// the click handler below) purely so within-session behavior/other code
// reading that key is unaffected - it's just never consulted again until
// the user picks it again, since the next reload forces cubework anyway.
const THEME_STORAGE_KEY = "cw_theme";
const THEME_CYCLE = ["dark", "light", "cubework"];
const DEFAULT_THEME = "cubework";

const THEME_LABELS = {
  dark: "dark theme",
  light: "light theme",
  cubework: "Cubework Mode",
};

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggleBtn");
  const moonIcon = document.getElementById("themeToggleIconMoon");
  const sunIcon = document.getElementById("themeToggleIconSun");
  const cubeIcon = document.getElementById("themeToggleIconCube");
  if (btn) {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    btn.setAttribute("aria-pressed", String(theme !== "dark"));
    btn.setAttribute("aria-label", `Switch to ${THEME_LABELS[next]}`);
    btn.title = `Switch to ${THEME_LABELS[next]}`;
  }
  if (moonIcon) moonIcon.style.display = theme === "dark" ? "" : "none";
  if (sunIcon) sunIcon.style.display = theme === "light" ? "" : "none";
  if (cubeIcon) cubeIcon.style.display = theme === "cubework" ? "" : "none";
}

function initThemeToggle() {
  // Sync the button's icon/label to whatever the inline <head> script
  // already stamped on <html> (always "cubework" on a fresh load) rather
  // than re-reading cw_theme - see comment above.
  applyTheme(document.documentElement.getAttribute("data-theme") || DEFAULT_THEME);
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (e) {
      // localStorage unavailable (private mode, storage disabled, etc.) -
      // the toggle still works for the rest of this session, it just won't
      // persist across reloads.
    }
  });
}
initThemeToggle();

// Sidebar collapse/expand (2026-09-22, per Huy's request) - lets the left
// nav shrink to the same icon-only rail the narrow @media(max-width:640px)
// breakpoint already uses, but toggled manually (body.sidebar-manual-
// collapsed, see index.html's CSS block) so the content area can claim the
// freed-up width on any screen size, not just narrow ones. Persisted in
// localStorage so the choice survives a reload.
const SIDEBAR_COLLAPSE_STORAGE_KEY = "cw_sidebar_collapsed";

function applySidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-manual-collapsed", collapsed);
  const btn = document.getElementById("sidebarToggleBtn");
  if (btn) {
    // The arrow inside #sidebarToggleBtn's svg flips via a pure-CSS rule
    // keyed off this same aria-pressed attribute (see
    // .sidebar-toggle-fab[aria-pressed="true"] in index.html) - no separate
    // icon-swap needed here.
    btn.setAttribute("aria-pressed", String(collapsed));
    btn.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    btn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  }
}

function initSidebarCollapse() {
  let initial = false;
  try {
    initial = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "1";
  } catch (e) {
    // localStorage unavailable - just start expanded.
  }
  applySidebarCollapsed(initial);
  const btn = document.getElementById("sidebarToggleBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = !document.body.classList.contains("sidebar-manual-collapsed");
    applySidebarCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, next ? "1" : "0");
    } catch (e) {
      // localStorage unavailable - the toggle still works for the rest of
      // this session, it just won't persist across reloads.
    }
  });
}
initSidebarCollapse();

// Email OTP sign-in (2026-08-27) - a second, self-service way in alongside
// the Microsoft popup above, for anyone without (or who'd rather not use)
// the 365 popup: type a @cubework.com address, get a 6-digit code by email,
// verify it. See requestEmailOtp/verifyEmailOtp in functions/index.js for
// the actual generation/verification/rate-limiting/account-bootstrap logic -
// this block is just the UI wiring; every real decision (is this email
// allowed, is the code right, what role/tabs a brand-new account gets) is
// made server-side. Kept in this same early, resilient block as the
// Microsoft button for the same reason noted above.
const requestEmailOtpFn = httpsCallable(functions, "requestEmailOtp");
const verifyEmailOtpFn = httpsCallable(functions, "verifyEmailOtp");

const otpToggleBtn = document.getElementById("otpToggleBtn");
const otpPanel = document.getElementById("otpPanel");
const otpEmailInput = document.getElementById("otpEmailInput");
const otpSendBtn = document.getElementById("otpSendBtn");
const otpCodeRow = document.getElementById("otpCodeRow");
const otpCodeInput = document.getElementById("otpCodeInput");
const otpVerifyBtn = document.getElementById("otpVerifyBtn");
const otpResendBtn = document.getElementById("otpResendBtn");
const otpStatus = document.getElementById("otpStatus");

function setOtpStatus(message, isError) {
  if (!otpStatus) return;
  otpStatus.textContent = message || "";
  otpStatus.style.color = isError ? "#fca5a5" : "rgba(255,255,255,.72)";
}

// Client-side mirror of the server's resend throttle (functions/index.js'
// OTP_RESEND_MIN_INTERVAL_MS) - purely UX (disables the button + shows a
// countdown) so someone doesn't fire a request that the server will reject
// anyway; the server enforces the real limit regardless of this timer ever
// running or being bypassed.
let otpResendCooldownTimer = null;
function startOtpResendCooldown(seconds) {
  let remaining = seconds;
  clearInterval(otpResendCooldownTimer);
  const tick = () => {
    if (otpResendBtn) {
      otpResendBtn.disabled = remaining > 0;
      otpResendBtn.textContent = remaining > 0 ? `Resend code (${remaining}s)` : "Resend code";
    }
    remaining -= 1;
    if (remaining < 0) clearInterval(otpResendCooldownTimer);
  };
  tick();
  otpResendCooldownTimer = setInterval(tick, 1000);
}

async function sendOtpCode() {
  const email = (otpEmailInput?.value || "").trim();
  if (!/^[^\s@]+@cubework\.com$/i.test(email)) {
    setOtpStatus("Enter a valid @cubework.com email address.", true);
    return;
  }
  if (otpSendBtn) otpSendBtn.disabled = true;
  setOtpStatus("Sending code…", false);
  try {
    await requestEmailOtpFn({ email });
    setOtpStatus(`Code sent to ${email}. Check your inbox.`, false);
    if (otpCodeRow) otpCodeRow.style.display = "flex";
    if (otpEmailInput) otpEmailInput.disabled = true;
    startOtpResendCooldown(60);
    otpCodeInput?.focus();
  } catch (err) {
    // Local Preview only: functions/.secret.local deliberately makes the
    // real Graph email send fail (see that file's comment) so Preview can
    // never send a real email through the real mailbox - requestEmailOtp
    // still generates/stores the code and logs it server-side
    // ([emulator] OTP code for ... - see functions/index.js) before hitting
    // that failure. Without this branch, Preview could never get past this
    // screen at all: the code step only ever appears here, on success.
    // "functions/internal" is the one error this send-step can throw (see
    // requestEmailOtp's second try/catch) - invalid-argument/resource-
    // exhausted from the earlier code-generation step still block normally,
    // in Preview or not, since those reflect a real problem with the request
    // itself rather than the emulator's fake Graph credentials.
    if (USE_EMULATORS && err.code === "functions/internal") {
      setOtpStatus(`Preview: real email send is disabled here. Check the Functions emulator console/log for "[emulator] OTP code for ${email}".`, false);
      if (otpCodeRow) otpCodeRow.style.display = "flex";
      if (otpEmailInput) otpEmailInput.disabled = true;
      startOtpResendCooldown(60);
      otpCodeInput?.focus();
      return;
    }
    setOtpStatus(err.message || "Could not send the code. Try again.", true);
  } finally {
    if (otpSendBtn) otpSendBtn.disabled = false;
  }
}

otpToggleBtn?.addEventListener("click", () => {
  const showing = otpPanel && otpPanel.style.display !== "none";
  if (otpPanel) otpPanel.style.display = showing ? "none" : "flex";
  otpToggleBtn.textContent = showing ? "Create/Login with Email Code" : "Return Users Login instead";
  if (!showing) otpEmailInput?.focus();
});

otpSendBtn?.addEventListener("click", sendOtpCode);
otpResendBtn?.addEventListener("click", sendOtpCode);

otpVerifyBtn?.addEventListener("click", async () => {
  const email = (otpEmailInput?.value || "").trim();
  const code = (otpCodeInput?.value || "").trim();
  if (!/^\d{6}$/.test(code)) {
    setOtpStatus("Enter the 6-digit code sent to your email.", true);
    return;
  }
  otpVerifyBtn.disabled = true;
  setOtpStatus("Verifying…", false);
  try {
    const result = await verifyEmailOtpFn({ email, code });
    const token = result.data?.token;
    if (!token) throw new Error("No sign-in token returned.");
    await signInWithCustomToken(auth, token);
    // onAuthStateChanged (below) takes it from here exactly as it does for
    // a Microsoft sign-in - resolves role/tabs, shows the app, etc.
  } catch (err) {
    setOtpStatus(err.message || "Could not verify that code. Try again.", true);
  } finally {
    otpVerifyBtn.disabled = false;
  }
});

// Storage is optional at runtime - if the Storage bucket hasn't been
// enabled yet in the Firebase console, or the SDK can't reach it for any
// other reason, this must NOT throw here. This file is a single <script
// type="module">, so an uncaught error at the top level aborts every line
// after it - including the sign-in button wiring further down. Attachment
// thumbnails degrading gracefully is much better than the whole app
// breaking because of them.
let storage = null;
try {
  storage = getStorage(app);
  if (USE_EMULATORS) {
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
} catch (err) {
  console.error("Firebase Storage unavailable - attachment thumbnails will be skipped:", err);
}

// Storage paths never change once uploaded, so a resolved download URL can
// be cached for the lifetime of the page - no need to re-resolve on every
// render.
const attachmentUrlCache = new Map();
async function resolveAttachmentUrl(path) {
  if (!storage) return null;
  if (attachmentUrlCache.has(path)) return attachmentUrlCache.get(path);
  try {
    const url = await getDownloadURL(ref(storage, path));
    attachmentUrlCache.set(path, url);
    return url;
  } catch (err) {
    console.error("Could not load attachment", path, err);
    return null;
  }
}

const signInScreen = document.getElementById("signInScreen");
const appScreen = document.getElementById("app");

// Targets the text-only span inside the header brand, not the brand itself -
// kept for screen readers only since the 2026-09-22 header redesign folded
// the app switcher into the header bar and removed the standalone visible
// title/slogan this used to drive - see syncHeaderForCurrentApp() below.
const appHeading = document.getElementById("appHeadingLabel");
const signedInAs = document.getElementById("signedInAs");
const listEl = document.getElementById("list");
const loadingEl = document.getElementById("loading");
const emptyEl = document.getElementById("empty");
const toolbarEl = document.getElementById("toolbar");
const searchInput = document.getElementById("searchInput");
const sortOrderEl = document.getElementById("sortOrder");
const sortByDeploymentOptionEl = document.getElementById("sortByDeploymentOption");
const appSwitcherEl = document.getElementById("appSwitcher");

// #appSwitcher lives inside <header>, which is now a fixed-left sidebar
// (2026-09-22 sidebar-nav redesign) rather than a horizontal top bar - the
// old --header-h sync (headerEl.offsetHeight, used to offset sticky content
// below the bar) is gone along with every var(--header-h) consumer in
// index.html, since nothing sits above content vertically anymore.

const actionTabsEl = document.getElementById("actionTabs");
const roadmapAddRowEl = document.getElementById("roadmapAddRow");
const roadmapTitleInput = document.getElementById("roadmapTitleInput");
const roadmapTitleLocationOptionsEl = document.getElementById("roadmapTitleLocationOptions");
const roadmapStateInput = document.getElementById("roadmapStateInput");
const roadmapNotesInput = document.getElementById("roadmapNotesInput");
const roadmapAddBtn = document.getElementById("roadmapAddBtn");
const roadmapExportBtn = document.getElementById("roadmapExportBtn");
const roadmapSelectionInfoEl = document.getElementById("roadmapSelectionInfo");
const roadmapClearSelectionBtn = document.getElementById("roadmapClearSelectionBtn");
const roadmapCompareBtn = document.getElementById("roadmapCompareBtn");
const roadmapCompareModalEl = document.getElementById("roadmapCompareModal");
const roadmapCompareColumnsEl = document.getElementById("roadmapCompareColumns");
const roadmapCompareCloseBtn = document.getElementById("roadmapCompareCloseBtn");
const roadmapGrandTotalBarEl = document.getElementById("roadmapGrandTotalBar");
const roadmapGrandTotalLabelEl = document.getElementById("roadmapGrandTotalLabel");
const roadmapGrandTotalSelectAllEl = document.getElementById("roadmapGrandTotalSelectAll");
const roadmapGrandTotalBreakdownEl = document.getElementById("roadmapGrandTotalBreakdown");
const roadmapGrandTotalBreakdownToggleEl = document.getElementById("roadmapGrandTotalBreakdownToggle");
const roadmapStateFilterRowEl = document.getElementById("roadmapStateFilterRow");
const roadmapStateFilterSelect = document.getElementById("roadmapStateFilterSelect");
const roadmapViewToggleEl = document.getElementById("roadmapViewToggle");
const roadmapControlsDividerEl = document.getElementById("roadmapControlsDivider");
const roadmapTimelineEl = document.getElementById("roadmapTimeline");
const imageLightboxEl = document.getElementById("imageLightbox");
const imageLightboxImgEl = document.getElementById("imageLightboxImg");
const markupEditorEl = document.getElementById("markupEditor");
const markupCanvasEl = document.getElementById("markupCanvas");
const markupStatusEl = document.getElementById("markupStatus");
const markupToolbarEl = document.getElementById("markupToolbar");
const markupUndoBtn = document.getElementById("markupUndoBtn");
const markupClearBtn = document.getElementById("markupClearBtn");
const markupCancelBtn = document.getElementById("markupCancelBtn");
const markupSaveOverBtn = document.getElementById("markupSaveOverBtn");
const markupSaveAsBtn = document.getElementById("markupSaveAsBtn");
const markupPanelEl = document.querySelector("#markupEditor .markup-panel");
const markupCanvasWrapEl = document.getElementById("markupCanvasWrap");
const markupIconPaletteEl = document.getElementById("markupIconPalette");
const markupRotateBtn = document.getElementById("markupRotateBtn");
const markupMaximizeBtn = document.getElementById("markupMaximizeBtn");
const markupZoomInBtn = document.getElementById("markupZoomInBtn");
const markupZoomOutBtn = document.getElementById("markupZoomOutBtn");
const markupZoomValueEl = document.getElementById("markupZoomValue");
const markupHoverTooltipEl = document.getElementById("markupHoverTooltip");
const markupSizeInput = document.getElementById("markupSizeInput");
const markupSizeValueEl = document.getElementById("markupSizeValue");
const markupColorPaletteEl = document.getElementById("markupColorPalette");
const markupColorCustomInput = document.getElementById("markupColorCustom");
const markupShapeToolSelect = document.getElementById("markupShapeToolSelect");
const exportColumnModalEl = document.getElementById("exportColumnModal");
const exportColumnListEl = document.getElementById("exportColumnList");
const exportColumnCancelBtn = document.getElementById("exportColumnCancelBtn");
const exportColumnConfirmBtn = document.getElementById("exportColumnConfirmBtn");
const exportFormatModalEl = document.getElementById("exportFormatModal");
const exportFormatCancelBtn = document.getElementById("exportFormatCancelBtn");
const exportFormatPngBtn = document.getElementById("exportFormatPngBtn");
const exportFormatPdfBtn = document.getElementById("exportFormatPdfBtn");
const markupNoteModalEl = document.getElementById("markupNoteModal");
const markupNoteTextareaEl = document.getElementById("markupNoteTextarea");
const markupNoteSaveBtn = document.getElementById("markupNoteSaveBtn");
const markupNoteRemoveBtn = document.getElementById("markupNoteRemoveBtn");
const markupNoteCancelBtn = document.getElementById("markupNoteCancelBtn");
const duplicateRoadmapModalEl = document.getElementById("duplicateRoadmapModal");
const duplicateRoadmapLocationInput = document.getElementById("duplicateRoadmapLocationInput");
const duplicateRoadmapLocationOptionsEl = document.getElementById("duplicateRoadmapLocationOptions");
const duplicateRoadmapDateInput = document.getElementById("duplicateRoadmapDateInput");
const duplicateRoadmapCancelBtn = document.getElementById("duplicateRoadmapCancelBtn");
const duplicateRoadmapConfirmBtn = document.getElementById("duplicateRoadmapConfirmBtn");

// ---- Lazy-loaded export/markup libraries -----------------------------
// XLSX, html2canvas, jsPDF and pdf.js are only used by the Export buttons
// (Excel/PDF/PNG, across Standup/Daily To-Do/Roadmap/Issue) and the Markup
// editor's PDF-attachment preview - nothing on initial load needs them.
// They used to be loaded unconditionally via blocking <script> tags in
// index.html on every single visit (~1-2MB combined, whether or not the
// visitor ever touches Export). These ensureX() helpers inject each
// <script> tag on first actual use instead - safe to call repeatedly (each
// library loads at most once; concurrent callers all await the same
// in-flight load rather than injecting duplicate tags), and every call site
// below already had a "library missing" guard from when these were
// eagerly loaded, so this just turns "give up" into "load it, then
// continue" at each of those same guards.
const LAZY_LIB_URLS = {
  xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  html2canvas: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  pdflib: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
};
const lazyLibLoadPromises = {};
function loadLazyScript(url) {
  if (!lazyLibLoadPromises[url]) {
    lazyLibLoadPromises[url] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => {
        delete lazyLibLoadPromises[url]; // let a later click retry after a flaky connection instead of failing forever
        reject(new Error("Export library failed to load — check your connection and try again."));
      };
      document.head.appendChild(s);
    });
  }
  return lazyLibLoadPromises[url];
}
async function ensureXLSX() {
  if (typeof XLSX === "undefined") await loadLazyScript(LAZY_LIB_URLS.xlsx);
}
async function ensureHtml2Canvas() {
  if (typeof html2canvas === "undefined") await loadLazyScript(LAZY_LIB_URLS.html2canvas);
}
async function ensureJsPDF() {
  if (!window.jspdf?.jsPDF) await loadLazyScript(LAZY_LIB_URLS.jspdf);
}
async function ensurePdfJs() {
  if (typeof pdfjsLib === "undefined") {
    await loadLazyScript(LAZY_LIB_URLS.pdfjs);
    // pdf.js needs a worker script URL up front - same cdnjs version as the
    // main library - set once, right after the library itself finishes loading.
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
}
async function ensurePdfLib() {
  if (typeof window.PDFLib === "undefined") await loadLazyScript(LAZY_LIB_URLS.pdflib);
}
// Bridged onto window (added 2026-08-19) for the same reason as
// window.EMAIL_REQUEST_ATTACHMENTS_URL above - the CW Email Request embed's
// classic <script> (Keycard Form fill/sign modal) can't import this
// module-scoped function directly, so it calls window.ensurePdfLib() instead.
window.ensurePdfLib = ensurePdfLib;
// Same bridge, for the same reason (added 2026-08-29) - the Activate guide's
// Step 22-2 View sub-flow (classic <script> block, end of index.html) needs
// pdf.js itself, at `pdfjsLib` on window once this resolves, to render the
// merged Keycard Form PDF onto a <canvas> and compute exact on-screen
// signature-field positions via its viewport - see that block's
// prepareKformView().
window.ensurePdfJs = ensurePdfJs;
const accessTabBtn = document.getElementById("accessTabBtn");
const noAccessViewEl = document.getElementById("noAccessView");
const accessViewEl = document.getElementById("accessView");
const standupViewEl = document.getElementById("standupView");
const standupWorkflowNavEl = document.getElementById("standupWorkflowNav");
const standupPullPanelEl = document.getElementById("standupPullPanel");
const standupReportPanelEl = document.getElementById("standupReportPanel");
const standupSavedPanelEl = document.getElementById("standupSavedPanel");
const standupDateInput = document.getElementById("standupDateInput");
const standupAddDateBtn = document.getElementById("standupAddDateBtn");
const standupRangeFromInput = document.getElementById("standupRangeFromInput");
const standupRangeToInput = document.getElementById("standupRangeToInput");
const standupAddRangeBtn = document.getElementById("standupAddRangeBtn");
const standupDateChipsEl = document.getElementById("standupDateChips");
const standupPullBtn = document.getElementById("standupPullBtn");
// 2026-09-11: "Pull All" - additive sibling of standupPullBtn, same queued
// date(s), calls pullStandupMailboxAllFn (full-mailbox $search) instead of
// pullStandupEmailsWithSummaryFn (Sent Items only) - see that handler below.
const standupPullAllBtn = document.getElementById("standupPullAllBtn");
const standupPullStatusEl = document.getElementById("standupPullStatus");
// 2026-09-11: category sort/filter chips (view-only, session-persisted in
// localStorage) - see renderStandupCategoryFilter below.
const standupCategoryFilterWrapEl = document.getElementById("standupCategoryFilterWrap");
const standupAddTaskBtn = document.getElementById("standupAddTaskBtn");
// 2026-09-14: the only thing that groups the checklist by category now -
// see the "no automatic sort" rewrite of renderStandupChecklist below.
const standupSortAllBtn = document.getElementById("standupSortAllBtn");
const standupChecklistStatusEl = document.getElementById("standupChecklistStatus");
const standupChecklistListEl = document.getElementById("standupChecklistList");
const standupGenerateReportBtn = document.getElementById("standupGenerateReportBtn");
const standupEmailOpenLinkEl = document.getElementById("standupEmailOpenLink");
const standupEmailOpenBtn = document.getElementById("standupEmailOpenBtn");
// Preview-before-send modal (2026-08-15, seventh pass) - see
// standupEmailOpenBtn's click handler below for the full flow.
const standupEmailPreviewModalEl = document.getElementById("standupEmailPreviewModal");
const standupEmailPreviewSubjectEl = document.getElementById("standupEmailPreviewSubject");
const standupEmailPreviewBodyEl = document.getElementById("standupEmailPreviewBody");
const standupEmailPreviewCancelBtn = document.getElementById("standupEmailPreviewCancelBtn");
const standupEmailPreviewSendBtn = document.getElementById("standupEmailPreviewSendBtn");
// Format toolbar (2026-08-18) - same Format/Edit/Submit pattern as the CW
// Email Request tool's own preview modal.
const standupEmailPreviewFormatBtn = document.getElementById("standupEmailPreviewFormatBtn");
const standupEmailPreviewToolbarEl = document.getElementById("standupEmailPreviewToolbar");
const standupEmailFmtBoldBtn = document.getElementById("standupEmailFmtBold");
const standupEmailFmtItalicBtn = document.getElementById("standupEmailFmtItalic");
const standupEmailFmtUnderlineBtn = document.getElementById("standupEmailFmtUnderline");
const standupEmailFmtFontSelect = document.getElementById("standupEmailFmtFont");
const standupEmailFmtSizeSelect = document.getElementById("standupEmailFmtSize");
const standupEmailFmtColorInput = document.getElementById("standupEmailFmtColor");
const standupDownloadHtmlBtn = document.getElementById("standupDownloadHtmlBtn");
const standupDownloadPdfBtn = document.getElementById("standupDownloadPdfBtn");
const standupExportExcelBtn = document.getElementById("standupExportExcelBtn");
const standupSaveBtn = document.getElementById("standupSaveBtn");
const standupSummaryEditWrapEl = document.getElementById("standupSummaryEditWrap");
const standupSummaryInputEl = document.getElementById("standupSummaryInput");
// Summary attachments (2026-09-14) - see standupBuildAttachmentsHtml/
// renderStandupSummaryAttachmentsList below.
const standupSummaryAttachBtn = document.getElementById("standupSummaryAttachBtn");
const standupSummaryAttachmentsInputEl = document.getElementById("standupSummaryAttachmentsInput");
const standupSummaryAttachStatusEl = document.getElementById("standupSummaryAttachStatus");
const standupSummaryAttachmentsListEl = document.getElementById("standupSummaryAttachmentsList");
const standupLocationCandidatesEl = document.getElementById("standupLocationCandidates");
const standupLocationCatalogListEl = document.getElementById("standupLocationCatalogList");
const standupTagCatalogListEl = document.getElementById("standupTagCatalogList");
const standupReportStatusEl = document.getElementById("standupReportStatus");
const standupReportPreviewEl = document.getElementById("standupReportPreview");
// (2026-08-08) Section 2 of the Report step - "1. Pull" entries, editable
// here too - see buildStandupReportEntriesEditorHtml below.
const standupReportSection2WrapEl = document.getElementById("standupReportSection2Wrap");
const standupReportEntriesEditEl = document.getElementById("standupReportEntriesEdit");
const standupReportAddEntryBtn = document.getElementById("standupReportAddEntryBtn");
// "Transfer to Issue" bridge - see docs/standup-tab.md.
const standupTransferSelectAllBtn = document.getElementById("standupTransferSelectAllBtn");
const standupTransferSelectNoneBtn = document.getElementById("standupTransferSelectNoneBtn");
const standupTransferToIssueBtn = document.getElementById("standupTransferToIssueBtn");
const standupTransferToIssueStatusEl = document.getElementById("standupTransferToIssueStatus");
const standupTransferLocationPromptEl = document.getElementById("standupTransferLocationPrompt");
const standupSavedListEl = document.getElementById("standupSavedList");
const standupExportAllBtn = document.getElementById("standupExportAllBtn");
const standupSavedFromInput = document.getElementById("standupSavedFromInput");
const standupSavedToInput = document.getElementById("standupSavedToInput");
const standupSavedViewBtn = document.getElementById("standupSavedViewBtn");
const standupSavedCollapseAllBtn = document.getElementById("standupSavedCollapseAllBtn");
// Saved-tab display cap: with no From/To range applied, only the 10 newest
// saved days render (allStandupSaves is already newest-first per its
// onSnapshot query - see subscribeToStandupSaves - so this is a plain
// slice). Entering both From and To and clicking "View" switches the list to
// every save whose date falls in that range instead, however many that is.
const STANDUP_SAVED_DEFAULT_LIMIT = 10;
const dailyTodoViewEl = document.getElementById("dailyTodoView");
const dailyTodoWorkflowNavEl = document.getElementById("dailyTodoWorkflowNav");
const dailyTodoLogPanelEl = document.getElementById("dailyTodoLogPanel");
const dailyTodoReportPanelEl = document.getElementById("dailyTodoReportPanel");
const dailyTodoSavedPanelEl = document.getElementById("dailyTodoSavedPanel");
const dailyTodoMicBtn = document.getElementById("dailyTodoMicBtn");
const dailyTodoMicStatusEl = document.getElementById("dailyTodoMicStatus");
const dailyTodoAddTaskBtn = document.getElementById("dailyTodoAddTaskBtn");
const dailyTodoListEl = document.getElementById("dailyTodoList");
const dailyTodoTagCatalogListEl = document.getElementById("dailyTodoTagCatalogList");
const dailyTodoGenerateReportBtn = document.getElementById("dailyTodoGenerateReportBtn");
const dailyTodoDownloadHtmlBtn = document.getElementById("dailyTodoDownloadHtmlBtn");
const dailyTodoExportExcelBtn = document.getElementById("dailyTodoExportExcelBtn");
const dailyTodoSaveBtn = document.getElementById("dailyTodoSaveBtn");
const dailyTodoAddToStandupBtn = document.getElementById("dailyTodoAddToStandupBtn");
const dailyTodoReportStatusEl = document.getElementById("dailyTodoReportStatus");
const dailyTodoReportPreviewEl = document.getElementById("dailyTodoReportPreview");
const dailyTodoSavedListEl = document.getElementById("dailyTodoSavedList");
const dailyTodoExportAllBtn = document.getElementById("dailyTodoExportAllBtn");
const emailRequestViewEl = document.getElementById("emailRequestView");
const emailRequestFrameEl = document.getElementById("emailRequestFrame");
const emailRequestWorkflowNavEl = document.getElementById("emailRequestWorkflowNav");
const emailRequestAttachmentsEmbedViewEl = document.getElementById("emailRequestAttachmentsEmbedView");
const issueViewEl = document.getElementById("issueView");
const issueRegionTabsEl = document.getElementById("issueRegionTabs");
const issueStatusTabsEl = document.getElementById("issueStatusTabs");
const issueToolbarEl = document.getElementById("issueToolbar");
const issueSearchInput = document.getElementById("issueSearchInput");
const issueAddRowEl = document.getElementById("issueAddRow");
const issueTitleInput = document.getElementById("issueTitleInput");
const issueTicketInput = document.getElementById("issueTicketInput");
const issueStateSelect = document.getElementById("issueStateSelect");
const issueTagSelect = document.getElementById("issueTagSelect");
const issueLocationInput = document.getElementById("issueLocationInput");
const issueLocationOptionsEl = document.getElementById("issueLocationOptions");
const issueNotesInput = document.getElementById("issueNotesInput");
const issueMicBtn = document.getElementById("issueMicBtn");
const issueMicStatusEl = document.getElementById("issueMicStatus");
const issueAttachmentsInput = document.getElementById("issueAttachmentsInput");
const issueAttachmentsPreviewEl = document.getElementById("issueAttachmentsPreview");
const issueAddBtn = document.getElementById("issueAddBtn");
const issueExportBtn = document.getElementById("issueExportBtn");
const issueSelectionInfoEl = document.getElementById("issueSelectionInfo");
const issueClearSelectionBtn = document.getElementById("issueClearSelectionBtn");
const issueSelectAllEl = document.getElementById("issueSelectAll");
const issueTagCatalogListEl = document.getElementById("issueTagCatalogList");
const issueEmptyEl = document.getElementById("issueEmpty");
const issueListEl = document.getElementById("issueList");
const issueExportFormatModalEl = document.getElementById("issueExportFormatModal");
const issueExportFormatCancelBtn = document.getElementById("issueExportFormatCancelBtn");
const issueExportFormatPngBtn = document.getElementById("issueExportFormatPngBtn");
const issueExportFormatPdfBtn = document.getElementById("issueExportFormatPdfBtn");
const issueExportFormatExcelBtn = document.getElementById("issueExportFormatExcelBtn");

// Keeps the Email Request iframe's height matched to its actual content
// height, so it grows/shrinks like a normal block of this page (and the
// outer page's own scrollbar handles it) instead of sitting in a fixed-size
// box with its own independent inner scrollbar - same-origin (it's served
// from this app's own hosting), so reading its document is allowed.
function syncEmailRequestFrameHeight() {
  if (!emailRequestFrameEl) return;
  try {
    const doc = emailRequestFrameEl.contentDocument;
    if (!doc || !doc.documentElement) return;
    const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
    if (height > 0) emailRequestFrameEl.style.height = height + "px";
  } catch (err) {
    // Cross-origin (shouldn't happen - same host) or not loaded yet: leave
    // the fallback height in place rather than throwing.
  }
}

// Keeps #emailRequestWorkflowNav's active button matched to the iframe's own
// currentMode - called alongside syncEmailRequestFrameHeight (same load/
// resize/mutation triggers below) so it reflects a mode change no matter how
// it happened inside the iframe: a click on this host nav (handled below,
// which also calls switchMode() there directly), the iframe's own .tabs on a
// direct non-embedded visit, or restoreDraftState() re-applying a saved
// mode on load - not just clicks made here.
function syncEmailRequestModeNav() {
  if (!emailRequestWorkflowNavEl || !emailRequestFrameEl) return;
  try {
    const mode = emailRequestFrameEl.contentWindow?.currentMode;
    if (!mode) return;
    emailRequestWorkflowNavEl.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.mode === mode);
    });
  } catch (err) {
    // Cross-origin (shouldn't happen - same host) or not loaded yet.
  }
}

emailRequestWorkflowNavEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  emailRequestWorkflowNavEl.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  try {
    emailRequestFrameEl?.contentWindow?.switchMode?.(btn.dataset.mode);
  } catch (err) {
    console.error(err);
  }
});

// Combined callback for the observers below - both are cheap, and every
// trigger that should re-measure height (resize, entries added/removed,
// mode switched, etc.) should also re-check which mode is now active.
function syncEmailRequestFrame() {
  syncEmailRequestFrameHeight();
  syncEmailRequestModeNav();
}

emailRequestFrameEl?.addEventListener("load", () => {
  syncEmailRequestFrame();
  try {
    const doc = emailRequestFrameEl.contentDocument;
    // Catches height changes from user interaction inside the frame itself
    // (adding/removing entries, switching its Keycard/Wi-Fi tab, showing the
    // preview card) - a plain "load" listener only fires once, on the
    // initial page load.
    //
    // Observe <body>, not <html>: <html> is the root element that
    // establishes the initial containing block, and browsers size its
    // border box to the iframe's own viewport rather than to its overflowing
    // content in some cases - so ResizeObserver can silently fail to fire
    // when content (e.g. a newly-added entry) pushes the page taller than
    // the iframe's last-synced height, even though scrollHeight did grow.
    // <body> is a normal block box that reliably grows to fit its in-flow
    // children, so its observed size tracks real content growth. Observing
    // both here anyway costs nothing (a same-size no-op just re-runs the
    // sync harmlessly) and is extra insurance against that root-element
    // quirk in any one browser.
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(syncEmailRequestFrame);
      if (doc?.body) ro.observe(doc.body);
      if (doc?.documentElement) ro.observe(doc.documentElement);
    }
    // Belt-and-suspenders: catches any content change ResizeObserver might
    // miss (e.g. a size change too small to register, or a browser quirk)
    // by re-measuring whenever the DOM inside the frame is mutated at all -
    // adding/removing a Keycard or Wi-Fi entry (childList), and also
    // switching between the Keycard/Wi-Fi tabs or expanding a Fee/
    // Troubleshoot description box, both of which just toggle an existing
    // element's inline style="display:..." rather than adding/removing
    // nodes (attributes: style), so childList alone would miss those - and
    // both are also exactly the "class"/"style" attribute changes
    // syncEmailRequestModeNav (bundled into syncEmailRequestFrame) needs to
    // pick up a mode switch made via this same iframe's own .tabs, on a
    // direct non-embedded visit.
    if (doc?.body && "MutationObserver" in window) {
      new MutationObserver(syncEmailRequestFrame).observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });
    }
  } catch (err) {
    console.error(err);
  }
});
const accessEmailInput = document.getElementById("accessEmailInput");
const accessRoleSelect = document.getElementById("accessRoleSelect");
const accessPositionSelect = document.getElementById("accessPositionSelect");
const accessNewTabsRowEl = document.getElementById("accessNewTabsRow");
const accessAddBtn = document.getElementById("accessAddBtn");
const accessBulkPanelEl = document.getElementById("accessBulkPanel");
const tagMigrationPreviewBtn = document.getElementById("tagMigrationPreviewBtn");
const tagMigrationRunBtn = document.getElementById("tagMigrationRunBtn");
const tagMigrationResultEl = document.getElementById("tagMigrationResult");
const accessMigrationPreviewBtn = document.getElementById("accessMigrationPreviewBtn");
const accessMigrationRunBtn = document.getElementById("accessMigrationRunBtn");
const accessMigrationResultEl = document.getElementById("accessMigrationResult");

// Labels for the position select (add-new-user row + each selected user's
// editor in the Existing Users bulk panel) - "" (no position) has no label
// of its own since it's just left unselected.
const POSITION_LABELS = {
  dev: "Dev",
  sale: "Sale",
  facilityLead: "Facility Lead",
  facilityManager: "Facility Manager",
  boss: "Boss",
  hr: "HR",
};

// Subsequence fuzzy match, same idea as a command-palette filter: every
// character of `query` (in order, case-insensitive) must appear somewhere in
// `text`, not necessarily contiguously - so "hgn" matches "huy.nguyen". Empty
// query matches everything. Returns a score (lower = better match, tighter
// grouping of the matched characters) or null when it doesn't match at all,
// so callers can filter with `!== null` and sort by score.
function fuzzyMatchScore(text, query) {
  if (!query) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return null;
    if (firstMatch === -1) firstMatch = idx;
    lastMatch = idx;
    ti = idx + 1;
  }
  // Span of the match (tighter/earlier matches score better) plus a small
  // penalty per matched character so a shorter overall span among otherwise
  // tied results still wins.
  return lastMatch - firstMatch + firstMatch * 0.01;
}

// Project Roadmap is its own "app" but a different shape entirely: items
// are typed in by hand (no mail sync, no threads) - it's special-cased
// wherever currentApp is checked.
const ROADMAP_APP_KEY = "roadmap";
const ROADMAP_LABEL = "Project Roadmap";
const ROADMAP_SEARCH_PLACEHOLDER = "Search roadmap items...";
// "all" is a sentinel status value (never stored on an item) meaning "don't
// filter by status at all" - see renderRoadmapView's wantStatus handling.
const ROADMAP_TABS = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "complete", label: "Complete" },
  { value: "all", label: "All" },
];
const ROADMAP_STATUS_LABELS = { planning: "Planning", active: "Active", pending: "Pending", complete: "Complete" };

// Items added before any status field existed only have the old boolean
// `completed` field (no `status`) - fall back to that instead of treating
// them as unset. Planning (not Active) is the fallback now, matching the
// new default for freshly-added items.
function effectiveRoadmapStatus(item) {
  return item.status || (item.completed ? "complete" : "planning");
}

// Access is a fourth "app" tab, only ever shown to full-access users (see
// updateAppChrome) - it's a plain user list + add/remove form, nothing
// like the ticket or roadmap views, so it's entirely special-cased too.
const ACCESS_APP_KEY = "access";
const ACCESS_LABEL = "Manage access";
const ROLE_LABELS = { view: "View", edit: "Edit", full: "Full access" };

// Landing state for a signed-in user whose tabs have been narrowed down to
// none at all (an empty array, not the null "unrestricted" convention - see
// canSeeTab/MANAGEABLE_TABS above) - not a real tab, never appears in
// MANAGEABLE_TABS or #appSwitcher, just a sentinel currentApp value so the
// post-sign-in landing logic below has somewhere honest to send someone with
// zero access instead of defaulting them onto Roadmap's full UI shell
// (toolbar/add-row/etc.) despite Roadmap's own tab button being hidden - see
// that landing logic's own comment for the bug this replaced.
const NO_ACCESS_APP_KEY = "noAccess";
const NO_ACCESS_LABEL = "No access";

// Email Request is a fifth "app" tab: just an embedded iframe (the
// standalone Keycard/Wi-Fi request-drafting tool, public/email-request.html)
// with no Firestore data of its own, no search/sort, no action tabs - the
// simplest of the special-cased tabs.
const EMAIL_REQUEST_APP_KEY = "emailRequest";
const EMAIL_REQUEST_LABEL = "Email Request";
const EMAIL_REQUEST_ATTACHMENTS_EMBED_LABEL = "Cubework Email Request";

// Standup is a sixth "app" tab: no Firestore-synced mail collection of its
// own - instead #standupWorkflowNav holds one button
// per step of the STANDUP_PROJECT_README.md workflow, each an on-demand
// Graph pull via a callable rather than a live onSnapshot listener. Only
// step 1 ("Pull") exists so far. Wired up the same minimal chrome as Email
// Request otherwise (no search/sort/action tabs).
const STANDUP_APP_KEY = "standup";
const STANDUP_LABEL = "Standup";

// Daily To-Do is a seventh "app" tab: a running list of voice-or-typed
// to-do entries logged through the day (browser Web Speech API does the
// actual voice-to-text, entirely client-side - no audio ever leaves the
// browser), rolled into an end-of-day report via #dailyTodoWorkflowNav's
// own Log/Report/Saved steps, same shape as Standup's workflow but with no
// mail sync/tags of its own. Deliberately its own tab/collection rather
// than folded into Standup - see the "Add to Standup checklist" button in
// its Report step for how the two are reviewed side by side instead of
// silently merged.
const DAILY_TODO_APP_KEY = "dailyTodo";
const DAILY_TODO_LABEL = "Daily To-Do";

// Issue is an eighth "app" tab, added 2026-08-05: manually-logged
// facilities/IT issues, split into two region tabs (Cali / Outside Cali)
// client-side rather than two separate collections - closer in shape to
// Project Roadmap (hand-entered, no mail sync, own Firestore collection,
// live per-item edits) than to Standup/Daily To-Do's own
// pull-once-then-in-memory-until-Save workflow. Inherits Roadmap's
// selection-checkbox-for-export mechanic and its Planning/Active/Pending/
// Complete-style status tabs (minus Planning - Issue only ever starts
// Active), Standup's tag set, and the shared Location field/catalog every
// other manual-entry tab already reads from.
const ISSUE_APP_KEY = "issue";
const ISSUE_LABEL = "Issue";
const ISSUE_REGIONS = [
  { key: "cali", label: "Cali" },
  { key: "outsideCali", label: "Outside Cali" },
];
// "all" is a sentinel status value (never stored on an item), same meaning
// as Roadmap's own "all" tab - "don't filter by status at all".
const ISSUE_STATUS_TABS = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "complete", label: "Complete" },
  { value: "all", label: "All" },
];
const ISSUE_STATUS_LABELS = { active: "Active", pending: "Pending", complete: "Complete" };

// Backs the "New" tab's (2026-08-05) State dropdown - a real 2-letter USPS
// code list rather than free text, so region routing (issueRegionForState
// below) can't be thrown off by a typo the way a plain text field would be.
// Mirrors US_STATE_CODES in functions/index.js - keep the two in sync if
// this list ever changes (the server is the actual source of truth; this
// is just what renders in the <select>).
const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "OTHER", name: "Other / International" },
];
// The one place the Cali-vs-Outside-Cali split actually happens for the
// "New" tab - everything that isn't California (including "OTHER") lands in
// Outside Cali. Mirrors issueRegionForState in functions/index.js, which is
// the version that's actually enforced (this client copy only drives what
// tab the newly-created card shows up under immediately after Add issue).
function issueRegionForState(state) {
  return state === "CA" ? "cali" : "outsideCali";
}

// Email Request (Attachments) is a button in the app switcher, NOT a real
// "app" tab (added 2026-08-09, revised same day) - it never sets currentApp
// and has no view/iframe of its own. It points at a *separate*,
// externally-hosted Google Apps Script web app
// (script.google.com/macros/s/.../exec - see "Email Request Google Apps
// Script.md" in the sibling "Google Script" project folder for that app's
// own Code.gs/deploy notes) that duplicates this app's own
// Keycard/Wi-Fi/Printer/Phone/Application-Software request types but sends
// via GmailApp with real file-upload support, which mailto can't do.
// Originally built as a cross-origin iframe (same shape as Email Request's
// own #emailRequestFrame) - live-tested and confirmed broken:
// script.google.com sends an X-Frame-Options/CSP header that blocks it from
// being framed by any other origin at all (Chrome shows literally
// "script.google.com refused to connect"), so there is no way to embed this
// page inline on this domain. Switched to a plain window.open() in a new
// tab instead (see the appSwitcherEl click handler below) - see
// docs/email-request-attachments-tab.md and pitfalls.md for the
// full writeup.
const EMAIL_REQUEST_ATTACHMENTS_APP_KEY = "emailRequestAttachments";
// Kept as a named constant (rather than inlined at the window.open() call
// site) so it's easy to find/update if the Apps Script project is ever
// redeployed under Deploy -> New deployment (a new deployment ID means a
// new /exec URL - see pitfall 3 in that project's own docs) instead of the
// routine "Manage deployments -> New version" path that keeps this same URL.
const EMAIL_REQUEST_ATTACHMENTS_URL =
  // 2026-08-13: repointed to the new Apps Script project deployed under the
  // correct account (huy.nguyen@cubework.com) - the old URL below pointed at
  // a project owned by a personal Gmail account, which is what caused
  // "Send failed: Gmail operation not allowed." (see
  // docs/log/2026-08-13-email-request-attachments-account-migration-and-index-fix.md).
  // Old URL (superseded, do not use):
  // "https://script.google.com/macros/s/AKfycby0idHkoU90ytw7MdPlQo82FJVg5__q82GlIwtp6WEd2_5QNdgLbNitTq7vCOVK2rVZ/exec"
  "https://script.google.com/macros/s/AKfycbxYI8TLGbxG1tVaa-dOJNk1UeVAvDW87CR1HoMDy70cAoUrkQqujH_iIwgoqOxryJiF/exec";
// Bridged onto window (added 2026-08-10) purely so index.html's plain
// classic <script> for the older, hidden "Email Request (Attachments)"
// button tab can read this same constant instead of hardcoding a second
// copy of the URL - app.js is loaded as type="module" (see index.html), so
// its own top-level consts are NOT bare globals to any other script on the
// page without an explicit assignment like this one.
// As of 2026-08-13, this URL is NOT used by "CW Email Request" anymore -
// see submitEmailRequestFn/window.submitCwEmailRequest below instead.
window.EMAIL_REQUEST_ATTACHMENTS_URL = EMAIL_REQUEST_ATTACHMENTS_URL;

// "CW Email Request" (added 2026-08-10, originally "Email (Attach.) Inline",
// then briefly "Email Request V2" before this name) - a second, *real* tab,
// same request form as the "Email Request (Attachments)" button tab above
// but ported directly into this page (see #emailRequestAttachmentsEmbedView
// in index.html) instead of window.open()-ing an external page.
//
// 2026-08-10 -> 2026-08-13: originally submitted via a cross-origin
// fetch() POST straight to an external Google Apps Script project's /exec
// URL (EMAIL_REQUEST_ATTACHMENTS_URL above) - that project kept hitting
// "Send failed: Gmail operation not allowed" and lived outside this repo.
// 2026-08-13: moved to this repo's own standalone backend instead -
// functions/emailRequest.js (ported from that project's Code.js
// unchanged) sends via Microsoft Graph instead of GmailApp, called through
// the submitEmailRequestFn callable below, bridged onto
// window.submitCwEmailRequest (bridged further down, right after
// submitEmailRequestFn's own declaration - it can't be bridged here, this
// runs before that const exists yet) for the same reason
// EMAIL_REQUEST_ATTACHMENTS_URL is bridged above - the embed's own <script>
// (see index.html) is a plain classic script, not part of this module's
// scope. The now-unused fallback link back to the Apps Script tab ("Open
// 'Email (Attachments) ↗' instead") was removed from index.html the same
// day - see docs/log/2026-08-13-cw-email-request-standalone-backend.md.
// The older "Email Request (Attachments)" button tab above is untouched
// and still points at the Apps Script project, in case it's ever needed
// again.
const EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY = "emailRequestAttachmentsEmbed";

// The one owner email (see OWNER_EMAIL in functions/index.js) is the only
// account allowed to manage the Access tab, regardless of who else might
// ever hold a "full" role - keeps access-control itself from being
// delegable. Mirrors the server-side check in requireOwner there; this
// client copy is only for hiding/showing UI, not enforcement.
const OWNER_EMAIL = "huy.nguyen@cubework.com";
let currentUserEmail = null;
function isOwner() {
  return !!currentUserEmail && currentUserEmail.toLowerCase() === OWNER_EMAIL;
}

// Tabs the owner can grant/revoke per user (see the Access tab) - "access"
// itself isn't here, since that one is always owner-only regardless of
// anyone's tabs list (see isOwner() above and requireOwner in
// functions/index.js). Order here also drives the checkbox order in both
// the "add user" row and each selected existing user's editor in
// renderAccessBulkPanel.
// "Email Request" and "Email Request (Attachments)" entries removed
// (2026-08-15) - those two tabs were already globally hidden from the nav
// (2026-08-10, see EMAIL_REQUEST_APP_KEY/EMAIL_REQUEST_ATTACHMENTS_APP_KEY
// below), so their per-user grant checkboxes here were inert; this drops
// them from the Access tab entirely too. functions/index.js's own
// MANAGEABLE_TABS was updated to match.
const MANAGEABLE_TABS = [
  { key: STANDUP_APP_KEY, label: "Standup" },
  { key: DAILY_TODO_APP_KEY, label: "Daily To-Do" },
  { key: ROADMAP_APP_KEY, label: "Roadmap" },
  { key: EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY, label: "Cubework Email Request" },
  { key: ISSUE_APP_KEY, label: "Issue" },
];

// null = unrestricted (every tab) - matches how the server stores/returns
// it (see getMyRole/sanitizeTabs in functions/index.js): a brand-new user
// added before this feature existed, and a user who currently has every
// manageable tab checked, are indistinguishable and both read as null.
let currentUserTabs = null;
function canSeeTab(appKey) {
  return isOwner() || currentUserTabs === null || currentUserTabs.includes(appKey);
}

// Canonical CW Email Request permission tree (2026-09-19 rebuild) - replaces
// the old flat, non-cascading eraModes/eraKeycardActions/eraHardwareCategories
// arrays with one nested structure that drives the Access Page's checkbox
// tree, the CW Email Request tab's own UI gating, AND backend authorization
// (mirrored verbatim in functions/index.js - no build-time sharing exists
// between client/functions, per CLAUDE.md's no-bundler note; this embed
// script in public/index.html is a separate classic <script> that can't
// import this ES module either, so it keeps its own small mode/leaf mapping
// tables that point INTO this same tree by dotted path string - see
// eraApplyAccessGating() there). Leaf IDs are dotted paths through this
// object, e.g. "KEYCARD.ACTIVATE", "SOFTWARE.CUBEWORK.LAPTOP.NEW_INSTALL",
// "HARDWARE.PRINTER.TENANT.TROUBLESHOOT" - only leaves are ever "granted";
// a branch (Keycard, Electrical.Cubework, etc.) is just a grouping whose own
// checkbox state is derived from its leaves (see eraNodeState below).
// See docs/email-request-attachments-embed-tab.md for the mapping from each
// leaf back to its real submit-field meaning, and CHAT_LOG.md / docs/log/
// for the migration this rebuild required from the old flat fields.
const ERA_TREE = {
  KEYCARD: { label: "Keycard", children: { ACTIVATE: "Activate", DEACTIVATE: "De-Activate", REPLACEMENT: "Replacement", TROUBLESHOOT: "Troubleshoot", TRANSFER: "Transfer", REQUEST_BLANK_KEYCARD: "Request Blank Keycard" } },
  WIFI: { label: "Wi-Fi", children: { CUBEWORK: "Cubework", UNIS: "Unis" } },
  ELECTRICAL: {
    label: "Electrical",
    children: {
      CUBEWORK: { label: "Cubework", children: { CREATE: "Create", TROUBLESHOOT: "Troubleshoot", DEACTIVATE: "De-Activate" } },
      UNIS: { label: "Unis", children: { CREATE: "Create", TROUBLESHOOT: "Troubleshoot", DEACTIVATE: "De-Activate" } },
    },
  },
  SOFTWARE: {
    label: "Software",
    children: {
      CUBEWORK: {
        label: "Cubework",
        children: {
          LAPTOP: { label: "Laptop", children: { NEW_INSTALL: "New Install", TROUBLESHOOT: "Troubleshoot", REMOVE: "Remove", ACCESS_HIKCENTRAL: "Access HikCentral", ACCESS_UNIFI: "Access Unifi", ACCESS_APP_CW: "Access App.CW.Com" } },
          PHONE: { label: "Phone", children: { NEW_INSTALL: "New Install", TROUBLESHOOT: "Troubleshoot", REMOVE: "Remove", ACCESS_HIKCENTRAL: "Access HikCentral", ACCESS_UNIFI: "Access Unifi", ACCESS_APP_CW: "Access App.CW.Com" } },
        },
      },
      UNIS: {
        label: "Unis",
        children: {
          LAPTOP: { label: "Laptop", children: { NEW_INSTALL: "New Install", TROUBLESHOOT: "Troubleshoot", REMOVE: "Remove" } },
          PHONE: { label: "Phone", children: { NEW_INSTALL: "New Install", TROUBLESHOOT: "Troubleshoot", REMOVE: "Remove" } },
        },
      },
    },
  },
  HARDWARE: {
    label: "Hardware",
    children: {
      AP_NODE: { label: "AP/Node", children: { NEW_AP_NODE: "New AP/Node", TROUBLESHOOT: "Troubleshoot", REPLACEMENT: "Replacement" } },
      CAMERA: { label: "Camera", children: { NEW_CAMERA: "New Camera", TROUBLESHOOT: "Troubleshoot", REPLACEMENT: "Replacement" } },
      NVR: { label: "NVR", children: { NEW_NVR: "New NVR", TROUBLESHOOT: "Troubleshoot", REPLACEMENT: "Replacement" } },
      LAPTOP_PHONE: { label: "Laptop/Phone", children: { NEW_HIRE: "New Hire", LAPTOP: "Laptop", PHONE: "Phone" } },
      PRINTER: {
        label: "Printer",
        children: {
          CUBEWORK: { label: "Cubework", children: { SETUP_NEW_PRINTER: "Setup New Printer", NEW_REPLACE_PRINTER: "New/Replace Printer", TROUBLESHOOT: "Troubleshoot" } },
          TENANT: { label: "Tenant", children: { TROUBLESHOOT: "Troubleshoot" } },
        },
      },
    },
  },
};

// Visits every node of ERA_TREE (or a sub-tree passed as `tree`) depth-first.
// visit(path, node, isLeaf) - a leaf's `node` is its label string, a
// branch's is {label, children}. The one place that knows the tree's shape;
// every other tree-walking helper below is built on this.
function walkEraTree(visit, tree, prefix) {
  const t = tree || ERA_TREE;
  Object.keys(t).forEach((key) => {
    const node = t[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof node === "string") {
      visit(path, node, true);
    } else {
      visit(path, node, false);
      if (node.children) walkEraTree(visit, node.children, path);
    }
  });
}

// Flat Set of every leaf's dotted path - what a stored eraPermissions array
// is validated/expanded against.
const ERA_ALL_LEAVES = (() => {
  const leaves = new Set();
  walkEraTree((path, node, isLeaf) => {
    if (isLeaf) leaves.add(path);
  });
  return leaves;
})();

// Every leaf at or under `path` (a leaf path just returns itself) - what
// checking/unchecking a tree node cascades into, and what eraNodeState/
// eraHasBranch check membership against.
function eraLeavesUnder(path) {
  if (ERA_ALL_LEAVES.has(path)) return [path];
  const prefix = path + ".";
  return Array.from(ERA_ALL_LEAVES).filter((leaf) => leaf.startsWith(prefix));
}

// "checked" (every leaf under path is granted), "unchecked" (none), or
// "indeterminate" (some) - drives a tree node checkbox's checked/
// indeterminate state in the Access Page renderer.
function eraNodeState(path, grantedLeavesSet) {
  const leaves = eraLeavesUnder(path);
  if (!leaves.length) return "unchecked";
  const n = leaves.filter((l) => grantedLeavesSet.has(l)).length;
  if (n === 0) return "unchecked";
  if (n === leaves.length) return "checked";
  return "indeterminate";
}

// Same tri-state computation as eraNodeState, but across the WHOLE tree
// (every top-level branch) - what the "CW Email Request" row's own main
// checkbox reflects, since 2026-09-19's follow-up made it the tree's root
// (see buildAccessTabsSectionsHtml/recomputeEraTreeIndeterminate below).
function eraOverallState(grantedLeavesSet) {
  if (!ERA_ALL_LEAVES.size) return "unchecked";
  let n = 0;
  ERA_ALL_LEAVES.forEach((leaf) => {
    if (grantedLeavesSet.has(leaf)) n++;
  });
  if (n === 0) return "unchecked";
  if (n === ERA_ALL_LEAVES.size) return "checked";
  return "indeterminate";
}

// Granular CW Email Request access (2026-08-30, rebuilt 2026-09-19 onto
// ERA_TREE above) - eraPermissions only means anything when
// emailRequestAttachmentsEmbed is itself an allowed tab; same
// null=unrestricted convention as tabs/currentUserTabs above. Server-side
// enforcement lives in functions/index.js's requireEraAccess - this (and the
// window.era* bridges below) is UX-only, same disclaimer as canSeeTab().
let currentUserEraPermissions = null;
// Exact leaf check.
function eraHasLeaf(leafId) {
  return isOwner() || currentUserEraPermissions === null || currentUserEraPermissions.includes(leafId);
}
// True if any granted leaf is at or under pathPrefix - used to decide
// whether a whole tab/dropdown/sub-menu shows at all (a branch itself is
// never "granted" - only its leaves are).
function eraHasBranch(pathPrefix) {
  if (isOwner() || currentUserEraPermissions === null) return true;
  return currentUserEraPermissions.some((leaf) => leaf === pathPrefix || leaf.startsWith(pathPrefix + "."));
}


// Cubework Email Request is the default landing tab (2026-09-22, per Huy's
// request - it lands on that tab's own Dashboard sub-page, see
// eraActivateMode's `dashboard` default in index.html). See appSwitcher's
// static "active" class in index.html, which must be kept in sync with this.
let currentApp = EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY;
let currentActionFilter = "";
// Only meaningful while currentApp === ROADMAP_APP_KEY - "list" is the
// original card view, "timeline" plots each item's "Deployment: <date> -
// <date>" note line as a Gantt-style bar instead.
let currentRoadmapView = "list";
// Whatever renderRoadmapView last put on screen (same tab/search/state
// filter/sort as the visible List or Timeline) - the Export button reads
// straight from this instead of recomputing the filter chain itself.
let lastRenderedRoadmapItems = [];

roadmapViewToggleEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  currentRoadmapView = btn.dataset.view;
  roadmapViewToggleEl.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  // The state filter applies to Timeline's data too (see the shared filter
  // chain in renderRoadmapView), so it stays visible in both views instead
  // of only List.
  render();
});
// "desc" (newest first) is the default - matches how the dashboard has
// always behaved. The toggle just makes that explicit/switchable instead
// of only ever being the hardcoded behavior.
let currentSortOrder = "desc";

sortOrderEl?.addEventListener("change", () => {
  currentSortOrder = sortOrderEl.value;
  render();
});

// Roadmap-only: filters the List view down to a single state instead of
// just reordering everything - "" means no filter (all states). Only
// shown while List is the active roadmap view - see the roadmapViewToggle
// click handler and updateAppChrome below for where its visibility is
// controlled, and populateRoadmapStateFilterOptions for where its <option>
// list gets (re)built.
let currentRoadmapStateFilter = "";

// Prefers a manually-entered state (set via the add/edit form) over
// parsing one out of the title, since titles aren't guaranteed to end in
// ", ST" and a manual override should always win when present.
function roadmapStateCode(item) {
  if (item.state) return String(item.state).trim().toUpperCase();
  const m = (item.title || "").trim().match(/,\s*([A-Za-z]{2})\s*$/);
  return m ? m[1].toUpperCase() : "";
}

// Rebuilds the dropdown's options from whatever states actually appear
// across every roadmap item (regardless of the current status tab, so the
// choices stay stable as you switch between Planning/Active/Pending/
// Complete), preserving the current selection if it's still a valid choice.
function populateRoadmapStateFilterOptions() {
  if (!roadmapStateFilterSelect) return;
  const states = [...new Set(allRoadmapItems.map(roadmapStateCode).filter(Boolean))].sort();
  const previous = currentRoadmapStateFilter;
  roadmapStateFilterSelect.innerHTML =
    '<option value="">All states</option>' + states.map((s) => `<option value="${s}">${s}</option>`).join("");
  if (states.includes(previous)) {
    roadmapStateFilterSelect.value = previous;
  } else {
    currentRoadmapStateFilter = "";
    roadmapStateFilterSelect.value = "";
  }
}

roadmapStateFilterSelect?.addEventListener("change", () => {
  currentRoadmapStateFilter = roadmapStateFilterSelect.value;
  render();
});

function renderActionTabs() {
  if (currentApp !== ROADMAP_APP_KEY) {
    // Access, Email Request, Standup, and Daily To-Do have no tabs of their
    // own - callers already guard against calling this for them, but bail
    // out safely just in case.
    actionTabsEl.innerHTML = "";
    return;
  }
  const tabs = ROADMAP_TABS;
  // Default selection is whichever tab represents "no filter" (value "") -
  // Roadmap has no "" entry (its default is "planning"), so it falls back
  // to index 0.
  const defaultTab = tabs.find((t) => t.value === "") || tabs[0];
  actionTabsEl.innerHTML = tabs
    .map((t) => `<button class="tab${t === defaultTab ? " active" : ""}" data-action="${t.value}">${t.label}</button>`)
    .join("");
  currentActionFilter = defaultTab?.value || "";
}

actionTabsEl?.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  currentActionFilter = tab.dataset.action;
  actionTabsEl.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
  render();
});

// Roadmap is the only tab left that uses the shared chrome (search/sort/
// tabs); Access, Email Request, Standup, and Daily To-Do each swap it out
// for whatever actually applies to them instead. Email Request
// (Attachments) never reaches this function at all - it's a plain
// window.open() from the appSwitcherEl click handler, never a currentApp
// value (see EMAIL_REQUEST_ATTACHMENTS_APP_KEY above for why).
function updateAppChrome() {
  const isRoadmap = currentApp === ROADMAP_APP_KEY;
  const isAccess = currentApp === ACCESS_APP_KEY;
  const isEmailRequest = currentApp === EMAIL_REQUEST_APP_KEY;
  const isEmailRequestAttachmentsEmbed = currentApp === EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY;
  const isStandup = currentApp === STANDUP_APP_KEY;
  const isDailyTodo = currentApp === DAILY_TODO_APP_KEY;
  const isIssue = currentApp === ISSUE_APP_KEY;
  const isNoAccess = currentApp === NO_ACCESS_APP_KEY;
  // Access, Email Request, Standup, Daily To-Do, and Issue (see
  // #standupView/#dailyTodoView/#issueView - each has its own nav handling
  // step/region/status navigation instead) have none of the shared chrome
  // at all (no search/sort/tabs) - i.e. everyone except Roadmap now.
  const hideSharedChrome = !isRoadmap;

  if (toolbarEl) toolbarEl.style.display = hideSharedChrome ? "none" : "flex";
  if (actionTabsEl) actionTabsEl.style.display = hideSharedChrome ? "none" : "flex";
  if (roadmapAddRowEl) roadmapAddRowEl.style.display = isRoadmap && canEdit() ? "flex" : "none";
  if (roadmapViewToggleEl) roadmapViewToggleEl.style.display = isRoadmap ? "flex" : "none";
  if (roadmapControlsDividerEl) roadmapControlsDividerEl.style.display = isRoadmap ? "block" : "none";
  // Visible in both List and Timeline - the state filter applies to
  // whichever data feeds either view (see the shared filter chain in
  // renderRoadmapView), so hiding it in Timeline was just an oversight.
  if (roadmapStateFilterRowEl) roadmapStateFilterRowEl.style.display = isRoadmap ? "block" : "none";
  if (accessViewEl) accessViewEl.style.display = isAccess ? "block" : "none";
  if (standupViewEl) standupViewEl.style.display = isStandup ? "block" : "none";
  if (isStandup) {
    ensureStandupDateDefault();
    // 2026-09-11: seed the example category labels as shared custom tags
    // (idempotent - see ensureStandupDefaultTagsExist) and render the
    // category filter chips before the checklist itself, so
    // standupGuessSubjectCategories has real tags to resolve to and the
    // filter row isn't empty.
    ensureStandupDefaultTagsExist();
    renderStandupCategoryFilter();
    // Pull's checklist used to only ever get its first render from switching
    // into the old separate "2. Checklist" tab; now that it's merged into
    // this same "1. Pull" panel (the default active step), render it here too
    // so the "No tasks yet" placeholder shows immediately on first visit
    // instead of a blank panel.
    renderStandupChecklist();
  }
  if (dailyTodoViewEl) dailyTodoViewEl.style.display = isDailyTodo ? "block" : "none";
  if (isDailyTodo) {
    // Same "render immediately on first visit" reasoning as Standup's Pull
    // panel above - shows the "Nothing logged yet" placeholder right away
    // instead of a blank panel, and flips the mic button's label/enabled
    // state to match whatever this browser actually supports.
    renderDailyTodoList();
    updateDailyTodoMicAvailability();
  }
  if (emailRequestViewEl) emailRequestViewEl.style.display = isEmailRequest ? "block" : "none";
  if (emailRequestAttachmentsEmbedViewEl) emailRequestAttachmentsEmbedViewEl.style.display = isEmailRequestAttachmentsEmbed ? "block" : "none";
  // Granular CW Email Request access (2026-08-30, rebuilt 2026-09-19 onto
  // ERA_TREE) - re-apply the mode-tab/Keycard-action gating
  // (window.eraHasLeaf/eraHasBranch, eraApplyAccessGating() in index.html's
  // embed script) every time this tab becomes visible, since
  // currentUserEraPermissions may not have resolved yet the first time the
  // embed script itself ran
  // (its own inline <script> runs at page load, well before sign-in
  // resolves getMyRole). UX-only - real enforcement is requireEraAccess in
  // functions/index.js.
  if (isEmailRequestAttachmentsEmbed) window.eraApplyAccessGating?.();
  if (issueViewEl) issueViewEl.style.display = isIssue ? "block" : "none";
  if (noAccessViewEl) noAccessViewEl.style.display = isNoAccess ? "block" : "none";
  // Coarse "could this ever show" gate - just enough so the form doesn't
  // flash visible while switching away from Issue entirely. renderIssueView()
  // (called right below) sets the actual final display, since only it knows
  // whether the New tab specifically (vs. Cali/Outside Cali) is selected.
  if (issueAddRowEl) issueAddRowEl.style.display = isIssue && canEdit() ? "flex" : "none";
  if (isIssue) {
    // Same "render immediately on first visit" reasoning as Standup's Pull
    // panel/Daily To-Do's Log panel above - shows the region/status tabs'
    // current selection and whatever's already loaded right away instead of
    // a blank panel.
    renderIssueView();
    // Same "flip the mic button's label/enabled state to match whatever this
    // browser actually supports" reasoning as Daily To-Do's own
    // updateDailyTodoMicAvailability call just above.
    updateIssueMicAvailability();
  }
  // Belt-and-suspenders alongside the ResizeObserver set up on "load" above:
  // while this view is display:none, the iframe's content has no real
  // layout box, so its last-known height can be stale by the time this tab
  // is opened again - re-measure once it's actually visible. The rAF gives
  // the display:block above one paint to take effect first.
  if (isEmailRequest) requestAnimationFrame(syncEmailRequestFrame);
  if (loadingEl && hideSharedChrome) loadingEl.style.display = "none";
  if (emptyEl && hideSharedChrome) emptyEl.style.display = "none";
  if (sortByDeploymentOptionEl) sortByDeploymentOptionEl.hidden = !isRoadmap;

  if (!isRoadmap) {
    // Leaving Roadmap always lands back on List next time it's opened, and
    // makes sure its timeline container isn't left visible under whichever
    // other tab is now showing.
    currentRoadmapView = "list";
    if (roadmapViewToggleEl) {
      roadmapViewToggleEl.querySelectorAll(".tab").forEach((t, i) => t.classList.toggle("active", i === 0));
    }
    if (roadmapTimelineEl) roadmapTimelineEl.style.display = "none";
    listEl.style.display = hideSharedChrome ? "none" : "";
    listEl.classList.remove("roadmap-grid");
    currentRoadmapStateFilter = "";
    if (roadmapStateFilterSelect) roadmapStateFilterSelect.value = "";
    // "Deployment start date" only makes sense for Roadmap - drop back to
    // the normal newest-first sort for everything else.
    if (currentSortOrder === "deployment") {
      currentSortOrder = "desc";
      if (sortOrderEl) sortOrderEl.value = "desc";
    }
  } else {
    // Roadmap's default sort is deployment start date, not newest-first -
    // this only runs from the app-switcher click handler (guarded there
    // against re-firing while already on Roadmap), so it sets the default
    // on arrival without stomping a manual re-sort during the same visit.
    currentSortOrder = "deployment";
    if (sortOrderEl) sortOrderEl.value = "deployment";
  }
  updateRoadmapGrandTotalBar();
}

// Sets the header text + search placeholder to match whatever currentApp
// currently is - shared by the tab-click handler below and the initial
// sign-in flow, so none of these ever have to be duplicated (and can't
// drift) between "user clicked a tab" and "page just loaded with its
// default tab already set".
function syncHeaderForCurrentApp() {
  if (appHeading) {
    if (currentApp === ROADMAP_APP_KEY) appHeading.textContent = ROADMAP_LABEL;
    else if (currentApp === ACCESS_APP_KEY) appHeading.textContent = ACCESS_LABEL;
    else if (currentApp === EMAIL_REQUEST_APP_KEY) appHeading.textContent = EMAIL_REQUEST_LABEL;
    else if (currentApp === EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY) appHeading.textContent = EMAIL_REQUEST_ATTACHMENTS_EMBED_LABEL;
    else if (currentApp === STANDUP_APP_KEY) appHeading.textContent = STANDUP_LABEL;
    else if (currentApp === DAILY_TODO_APP_KEY) appHeading.textContent = DAILY_TODO_LABEL;
    else if (currentApp === ISSUE_APP_KEY) appHeading.textContent = ISSUE_LABEL;
    else if (currentApp === NO_ACCESS_APP_KEY) appHeading.textContent = NO_ACCESS_LABEL;
  }
  if (currentApp === ROADMAP_APP_KEY) searchInput.placeholder = ROADMAP_SEARCH_PLACEHOLDER;
}

appSwitcherEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  const appKey = btn.dataset.app;
  // Cubework Email Request sub-nav (2026-09-22, per Huy's request) - the six
  // .tab-sub buttons under it share the parent's own data-app value (so the
  // rest of this handler's canSeeTab/currentApp plumbing applies to them
  // for free) plus their own data-era-mode identifying which #era_tabs mode
  // to open, forwarded to window.eraGoToMode() (index.html's own "CW Email
  // Request embed logic" script) below.
  const eraMode = btn.dataset.eraMode;
  if (!appKey) return;
  if (appKey === ACCESS_APP_KEY && !isOwner()) return;
  if (appKey !== ACCESS_APP_KEY && !canSeeTab(appKey)) return;
  // Email Request (Attachments) is a link, not a tab - see
  // EMAIL_REQUEST_ATTACHMENTS_APP_KEY above for why (script.google.com
  // can't be framed on this domain). Open its Apps Script URL in a new tab
  // and stop here - never touch currentApp/the active-tab highlight/any
  // view, exactly as if this button weren't part of the switcher at all.
  if (appKey === EMAIL_REQUEST_ATTACHMENTS_APP_KEY) {
    window.open(EMAIL_REQUEST_ATTACHMENTS_URL, "_blank", "noopener,noreferrer");
    return;
  }
  if (appKey === currentApp) {
    // Already on this tab - a sub-nav click still needs to switch the
    // in-page mode; a re-click of the already-active top-level tab itself
    // (no data-era-mode) stays a no-op, same as before this sub-nav existed.
    if (eraMode) window.eraGoToMode?.(eraMode);
    return;
  }

  currentApp = appKey;
  // .tab-sub excluded here (2026-09-22) - all six share data-app with their
  // parent, so matching on t===btn like before would highlight only
  // whichever one was clicked and, wrongly, un-highlight the parent when
  // that's a sub-item. Matching on data-app instead correctly highlights the
  // parent whenever any of its subs (or itself) is clicked; the specific
  // sub-item's own highlight is handled separately by eraActivateMode's
  // sidebar-sync (index.html), the single source of truth for that.
  appSwitcherEl.querySelectorAll(".tab:not(.tab-sub)").forEach((t) => t.classList.toggle("active", t.dataset.app === appKey));
  searchInput.value = "";
  syncHeaderForCurrentApp();
  updateAppChrome();
  if (eraMode) window.eraGoToMode?.(eraMode);
  if (currentApp !== ACCESS_APP_KEY && currentApp !== EMAIL_REQUEST_APP_KEY && currentApp !== EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY && currentApp !== STANDUP_APP_KEY && currentApp !== DAILY_TODO_APP_KEY && currentApp !== ISSUE_APP_KEY) renderActionTabs();
  subscribeToCurrentApp();
});

// Help (account menu, 2026-09-22, per Huy's request). Reuses the app's own
// routing - a click on the Cubework Email Request switcher tab, same as the
// person clicking it themselves - then opens that tab's existing Video
// Tutorials player (window.eraOpenVideoTutorials, index.html) rather than a
// second help/tutorial system. Hidden for anyone who can't see that tab
// (see the per-user tab-visibility loop in onAuthStateChanged below).
const helpBtnEl = document.getElementById("helpBtn");
helpBtnEl?.addEventListener("click", () => {
  document.getElementById("userPopover")?.classList.remove("open");
  if (!canSeeTab(EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY)) return;
  appSwitcherEl?.querySelector(`.tab[data-app="${EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY}"]`)?.click();
  window.eraOpenVideoTutorials?.();
});

// Completed state per thread, synced live from the threadStatus collection.
// Writes go through the setThreadCompleted callable, not straight to
// Firestore - clients only ever have read access (see firestore.rules).
// Currently unused by any tab's own UI (it backed the removed Keycard/New
// Hire ticket dashboards' completion checkbox), but kept in place per the
// server-side collection/callable it mirrors - see docs/architecture-core.md.
let threadStatusMap = {};
const setThreadCompletedFn = httpsCallable(functions, "setThreadCompleted");

const addRoadmapItemFn = httpsCallable(functions, "addRoadmapItem");
const updateRoadmapItemFn = httpsCallable(functions, "updateRoadmapItem");
const setRoadmapItemStatusFn = httpsCallable(functions, "setRoadmapItemStatus");
const deleteRoadmapItemFn = httpsCallable(functions, "deleteRoadmapItem");
const addRoadmapAttachmentFn = httpsCallable(functions, "addRoadmapAttachment");
const setRoadmapItemResolutionFn = httpsCallable(functions, "setRoadmapItemResolution");
const setRoadmapItemPendingReasonFn = httpsCallable(functions, "setRoadmapItemPendingReason");
const replaceRoadmapAttachmentFn = httpsCallable(functions, "replaceRoadmapAttachment");
const getRoadmapAttachmentDataFn = httpsCallable(functions, "getRoadmapAttachmentData");
const removeRoadmapAttachmentFn = httpsCallable(functions, "removeRoadmapAttachment");
const setRoadmapAttachmentNotesFn = httpsCallable(functions, "setRoadmapAttachmentNotes");
const fetchUnifiPriceFn = httpsCallable(functions, "fetchUnifiPrice");
const fetchProductPriceFn = httpsCallable(functions, "fetchProductPrice");
// CW Email Request's own standalone backend (2026-08-13) - replaces the
// external Apps Script project's /exec URL (see EMAIL_REQUEST_ATTACHMENTS_URL
// above, still used by the older, hidden "Email Request (Attachments)"
// button tab only). Longer timeout than the other callables here since a
// large photo/PDF attachment can take a while to upload to Graph - see
// functions/emailRequest.js's own large-attachment path.
const submitEmailRequestFn = httpsCallable(functions, "submitEmailRequest", { timeout: 180000 });
// Bridged onto window for the same reason EMAIL_REQUEST_ATTACHMENTS_URL is
// (see that constant's own comment, above) - index.html's "CW Email
// Request" embed <script> is a plain classic script, not part of this
// module's scope, so it can't call submitEmailRequestFn directly.
window.submitCwEmailRequest = submitEmailRequestFn;
// "Open in Outlook" fallback (2026-08-13) - the build-only half of
// submitEmailRequest, no Graph/Mail.Send involved at all (see
// buildEmailRequestPreview's own comment in functions/index.js). The embed
// script uses this to build an Outlook Web deeplink itself, the same
// no-backend-send approach as the Standup tab's own "Open in Outlook Web"
// button (standupEmailOpenBtn above), instead of routing through Google
// Apps Script the way this tab's now-removed fallback link used to.
const buildEmailRequestPreviewFn = httpsCallable(functions, "buildEmailRequestPreview", { timeout: 30000 });
window.buildCwEmailRequestPreview = buildEmailRequestPreviewFn;

// Shared "recently used emails" catalog for the CW Email Request tab
// (2026-08-18) - one doc per field key, up to 5 emails each, shared org-wide
// (see docs/email-request-attachments-embed-tab.md). Same bridging reason as
// submitCwEmailRequest/buildCwEmailRequestPreview above: index.html's embed
// <script> is a plain classic script and can't import the Firestore SDK, so
// this module does the one onSnapshot subscription (per the "reads go
// straight from client via onSnapshot" rule in docs/architecture-core.md)
// and hands the embed a live-cache getter plus the two mutating callables.
let sharedEmailHistoryByField = {};
function subscribeToSharedEmailHistory() {
  onSnapshot(
    collection(db, "sharedEmailHistory"),
    (snapshot) => {
      const next = {};
      snapshot.docs.forEach((d) => {
        const emails = d.data().emails;
        next[d.id] = Array.isArray(emails) ? emails : [];
      });
      sharedEmailHistoryByField = next;
    },
    (err) => console.error(err)
  );
}
subscribeToSharedEmailHistory();
window.getSharedEmailHistory = () => sharedEmailHistoryByField;
const addSharedEmailHistoryFn = httpsCallable(functions, "addSharedEmailHistory");
const deleteSharedEmailHistoryFn = httpsCallable(functions, "deleteSharedEmailHistory");
window.addSharedEmailHistoryEntry = addSharedEmailHistoryFn;
window.deleteSharedEmailHistoryEntry = deleteSharedEmailHistoryFn;

// Shared "recently used phone numbers" catalog (2026-08-19) - mirrors the
// email history bridge immediately above, for the CW Email Request tab's
// Replacement Tenant Phone field (see the ERA_PHONE_FIELDS table in
// index.html's embed <script> and sharedPhoneHistory in functions/index.js).
let sharedPhoneHistoryByField = {};
function subscribeToSharedPhoneHistory() {
  onSnapshot(
    collection(db, "sharedPhoneHistory"),
    (snapshot) => {
      const next = {};
      snapshot.docs.forEach((d) => {
        const phones = d.data().phones;
        next[d.id] = Array.isArray(phones) ? phones : [];
      });
      sharedPhoneHistoryByField = next;
    },
    (err) => console.error(err)
  );
}
subscribeToSharedPhoneHistory();
window.getSharedPhoneHistory = () => sharedPhoneHistoryByField;
const addSharedPhoneHistoryFn = httpsCallable(functions, "addSharedPhoneHistory");
const deleteSharedPhoneHistoryFn = httpsCallable(functions, "deleteSharedPhoneHistory");
window.addSharedPhoneHistoryEntry = addSharedPhoneHistoryFn;
window.deleteSharedPhoneHistoryEntry = deleteSharedPhoneHistoryFn;
// Keycard Form fill/sign audit log (added 2026-08-19) - bridged for the same
// reason as the callables above; called by the Keycard Form modal's own
// script (index.html) right after a signed PDF is built, so the signer
// attribution/consent + PDF hash are recorded server-side alongside the
// existing PDF-stamping flow. See functions/index.js's own comment on
// logKeycardFormSignature for what this is (and isn't) a substitute for.
const logKeycardFormSignatureFn = httpsCallable(functions, "logKeycardFormSignature");
window.logKeycardFormSignatureAudit = logKeycardFormSignatureFn;

// Signed-in staff display name (2026-08-19) - bridged so the Keycard Form
// modal's own classic <script> (index.html) can default its "ISSUED BY"
// print-name field to whoever is actually signed in, instead of always
// starting blank. Prefers the Firebase Auth displayName (rarely set for
// this Google-Workspace-backed sign-in), falling back to the email
// currentUserRole/getMyRole already resolved at sign-in.
window.getCurrentUserDisplayName = () => auth.currentUser?.displayName || currentUserEmail || "";
// Same bridging reason, for the "Your Signature Requests" resume panel
// (2026-08-19) - lets the modal filter the already-live signatureRequests
// cache down to "created by me" without a Firestore query of its own.
window.getCurrentUserEmail = () => currentUserEmail || "";
// Granular CW Email Request access (2026-08-30, rebuilt 2026-09-19 onto
// ERA_TREE) - the embed script in index.html is a separate classic <script>
// (can't import from this ES module), so it consults these bridges the same
// way it already consults window.getCurrentUserEmail above. UX-only; real
// enforcement is requireEraAccess in functions/index.js.
window.eraHasLeaf = (leafId) => eraHasLeaf(leafId);
window.eraHasBranch = (pathPrefix) => eraHasBranch(pathPrefix);

// Keycard Form remote e-signature workflow (added 2026-08-18) - lets a
// tenant/customer sign their own card's signature field remotely (email
// link, no in-person drawing) with the signed result synced back
// automatically; see docs/email-request-attachments-embed-tab.md and
// functions/index.js's createKeycardSignatureRequest comment for the full
// design. Same bridging reason as every other callable here: the Keycard
// Form modal's own script (index.html) is a classic script and can't import
// the Firestore/Functions SDKs directly.
const createKeycardSignatureRequestFn = httpsCallable(functions, "createKeycardSignatureRequest");
const getSignedKeycardFormPdfFn = httpsCallable(functions, "getSignedKeycardFormPdf");
window.createKeycardSignatureRequest = createKeycardSignatureRequestFn;
window.getSignedKeycardFormPdf = getSignedKeycardFormPdfFn;
// Builds the ONE complete, filled Cubework_Keycard_Form_v2.1 PDF for a whole
// submission (every card + the staff Issued By sign-off) from its live
// keycardRequestHistory doc - see functions/index.js's own comment on
// buildKeycardHistoryFormPdf. Called from public/index.html's
// eraMaybeBuildKeycardFormPdf() right before Preview/Send.
window.buildKeycardHistoryFormPdf = httpsCallable(functions, "buildKeycardHistoryFormPdf");

// Live status cache for the small "pending signatures" panel in the
// Keycard Form modal - same "one onSnapshot cache + a sync getter" pattern
// as sharedEmailHistoryByField above. Firestore rules gate this to staff
// with the emailRequestAttachmentsEmbed tab (see firestore.rules);
// the tenant themselves never touches Firestore directly at all - their
// side of this workflow only ever calls the public getSignatureRequest/
// submitSignatureRequest Cloud Functions (via /api/... Hosting rewrites),
// with no Firebase Auth session and no Firestore SDK involved.
let signatureRequestsById = {};
function subscribeToSignatureRequests() {
  onSnapshot(
    collection(db, "signatureRequests"),
    (snapshot) => {
      const next = {};
      snapshot.docs.forEach((d) => {
        next[d.id] = d.data();
      });
      signatureRequestsById = next;
    },
    (err) => console.error(err)
  );
}
subscribeToSignatureRequests();
window.getSignatureRequestsCache = () => signatureRequestsById;

// Fresh, targeted read (2026-08-2x) - contrast with the always-subscribed
// FULL-collection cache above, which can be briefly empty right after a
// page load/reload (its first onSnapshot delivery hasn't landed yet). The
// CW Email Request embed's "Wait for Signature" auto-check on Edit
// (public/index.html's eraAutoCheckSignaturesOnEdit) needs a guaranteed-
// current answer at the exact moment Edit is clicked, not whatever the
// passive cache happens to hold yet, so it calls this instead. Firestore
// rules already permit this read (same `hasAnyRole() && tabAllowed(...)`
// gate as the cache's own subscription), so this is a plain client query,
// no new callable needed.
window.getKeycardSignatureRequestsForHistory = async (requestId) => {
  const snap = await getDocs(query(collection(db, "signatureRequests"), where("historyRequestId", "==", requestId)));
  const out = {};
  snap.docs.forEach((d) => { out[d.id] = d.data(); });
  return out;
};

// Keycard Submission History (added 2026-08-19) - persists every
// Keycard-mode CW Email Request send so staff can track requests still
// awaiting the customer's digital signature + photo ID; see
// functions/keycardHistory.js and docs/email-request-attachments-embed-tab.md.
// Same bridging reason as every other callable/cache here: the embed
// <script> in index.html is a classic script and can't import the
// Firestore/Functions SDKs directly - it owns the History card's own DOM
// and tab-switching, this module just hands it a live cache + callables.
const recordKeycardSubmissionFn = httpsCallable(functions, "recordKeycardSubmission");
const uploadKeycardPhotoIdFn = httpsCallable(functions, "uploadKeycardPhotoId");
const updateKeycardHistoryStatusFn = httpsCallable(functions, "updateKeycardHistoryStatus");
const getKeycardPhotoIdDataFn = httpsCallable(functions, "getKeycardPhotoIdData");
// Delete (2026-08-19) - a real, permanent removal of the history record;
// see functions/index.js's own comment on deleteKeycardHistory for how
// this differs from the "Your Signature Requests" panel's own
// localStorage-only Remove button.
const deleteKeycardHistoryFn = httpsCallable(functions, "deleteKeycardHistory");
// Manual Pending<->Complete override (added 2026-08-20) - lets staff flip a
// submission's status by hand from the History card itself, overriding
// whatever the photo-ID/signature auto-computation would otherwise say, and
// STICKS across a later plain "Save" or Preview > Send on that same
// submission (recordKeycardSubmission/uploadKeycardPhotoId/
// updateKeycardHistoryStatus/submitSignatureRequest in functions/index.js
// all check the manualOverride flag this sets and skip recomputing status
// while it's on). See functions/index.js's setKeycardHistoryStatus.
const setKeycardHistoryStatusFn = httpsCallable(functions, "setKeycardHistoryStatus");
// Per-entry "Signature / ID" ink on the MAIN Keycard form (2026-08-21+,
// full Edit-restore pass) - see functions/index.js's own comment on
// saveKeycardSignIdSignature.
const saveKeycardSignIdSignatureFn = httpsCallable(functions, "saveKeycardSignIdSignature");
// "Issued By" staff sign-off signature - see functions/index.js's own
// comment on saveKeycardIssuedBySignature.
const saveKeycardIssuedBySignatureFn = httpsCallable(functions, "saveKeycardIssuedBySignature");
window.recordKeycardSubmission = recordKeycardSubmissionFn;
window.uploadKeycardPhotoId = uploadKeycardPhotoIdFn;
window.saveKeycardSignIdSignature = saveKeycardSignIdSignatureFn;
window.saveKeycardIssuedBySignature = saveKeycardIssuedBySignatureFn;
window.updateKeycardHistoryStatus = updateKeycardHistoryStatusFn;
window.getKeycardPhotoIdData = getKeycardPhotoIdDataFn;
window.deleteKeycardHistory = deleteKeycardHistoryFn;
window.setKeycardHistoryStatus = setKeycardHistoryStatusFn;
let keycardHistoryById = {};
let unsubscribeKeycardHistory = null;
// Dashboard > Submission ownership filtering (permanent, 2026-09-23): a
// non-full-admin only ever sees their own submissions (createdBy == their
// signed-in email, set once server-side in recordKeycardSubmission - never
// client-supplied), enforced here AND in firestore.rules (a listable
// collection query is denied outright unless every doc it could return
// already satisfies the rule, so both sides must agree). FULL admins keep
// the old unfiltered view. Called from onAuthStateChanged once role/email
// are known (and again, with no email, on sign-out) rather than once at
// module load, since the filter depends on who's signed in.
function subscribeToKeycardHistory(email, role) {
  if (unsubscribeKeycardHistory) {
    unsubscribeKeycardHistory();
    unsubscribeKeycardHistory = null;
  }
  keycardHistoryById = {};
  if (!email) return;
  const historyQuery =
    role === "full"
      ? collection(db, "keycardRequestHistory")
      : query(collection(db, "keycardRequestHistory"), where("createdBy", "==", email));
  unsubscribeKeycardHistory = onSnapshot(
    historyQuery,
    (snapshot) => {
      const next = {};
      snapshot.docs.forEach((d) => {
        next[d.id] = d.data();
      });
      keycardHistoryById = next;
    },
    (err) => console.error(err)
  );
}
window.getKeycardHistoryCache = () => keycardHistoryById;

// 2026-08-10: no longer called anywhere in this file - the plain "Pull
// emails" button that used this was removed once #standupPullBtn (renamed
// from "Pull with Summary") became the only Pull action, always doing the
// fuller pullStandupEmailsWithSummary fetch below. Left defined (like
// summarizeStandupEntries elsewhere in this app) in case a plain, faster,
// no-AI-summary pull option comes back.
const pullStandupEmailsFn = httpsCallable(functions, "pullStandupEmails", { timeout: 120000 });
const pullStandupEmailsWithSummaryFn = httpsCallable(functions, "pullStandupEmailsWithSummary", { timeout: 300000 });
// 2026-09-11: "Pull All" - full-mailbox Graph $search (not folder-scoped),
// strictly read-only (GET/$search only, never a Graph PATCH/DELETE/move/send
// call) - see pullStandupMailboxAll in functions/index.js.
const pullStandupMailboxAllFn = httpsCallable(functions, "pullStandupMailboxAll", { timeout: 300000 });
const summarizeStandupReportEntriesFn = httpsCallable(functions, "summarizeStandupReportEntries", { timeout: 60000 });
const summarizeStandupReportForKuanFn = httpsCallable(functions, "summarizeStandupReportForKuan", { timeout: 60000 });
const summarizeStandupReportForKuanLongFn = httpsCallable(functions, "summarizeStandupReportForKuanLong", { timeout: 60000 });
// Sends the Report step's Cali Issues/Outside Cali Issues email for real via
// Microsoft Graph (2026-08-15, sixth pass) - see standupEmailOpenBtn's click
// handler below and sendStandupCaliIssuesEmail in functions/index.js.
const sendStandupCaliIssuesEmailFn = httpsCallable(functions, "sendStandupCaliIssuesEmail", { timeout: 60000 });
const saveStandupReportFn = httpsCallable(functions, "saveStandupReport");
const deleteStandupSaveFn = httpsCallable(functions, "deleteStandupSave");
const addStandupLocationFn = httpsCallable(functions, "addStandupLocation");
const deleteStandupLocationFn = httpsCallable(functions, "deleteStandupLocation");
// Summary attachments (2026-09-14) - mirrors addIssueAttachment/removeIssueAttachment.
const addStandupAttachmentFn = httpsCallable(functions, "addStandupAttachment", { timeout: 60000 });
const removeStandupAttachmentFn = httpsCallable(functions, "removeStandupAttachment");

const saveDailyTodoFn = httpsCallable(functions, "saveDailyTodo");
const deleteDailyTodoSaveFn = httpsCallable(functions, "deleteDailyTodoSave");

const addIssueItemFn = httpsCallable(functions, "addIssueItem");
const updateIssueItemFn = httpsCallable(functions, "updateIssueItem");
const setIssueItemStatusFn = httpsCallable(functions, "setIssueItemStatus");
const setIssueItemTagFn = httpsCallable(functions, "setIssueItemTag");
const setIssueItemResolutionFn = httpsCallable(functions, "setIssueItemResolution");
const setIssueItemPendingReasonFn = httpsCallable(functions, "setIssueItemPendingReason");
const deleteIssueItemFn = httpsCallable(functions, "deleteIssueItem");
const addIssueAttachmentFn = httpsCallable(functions, "addIssueAttachment");
const removeIssueAttachmentFn = httpsCallable(functions, "removeIssueAttachment");

// Shared tag catalog (2026-08-10 unification) - one pair of callables used
// by all three tabs' "+ New tag..."/"Manage custom tags" UI now, replacing
// the three separate add/delete*Tag pairs each tab used to have. See
// sharedAllTags() below (Standup tab section) for the full write-up.
const addSharedTagFn = httpsCallable(functions, "addSharedTag");
const deleteSharedTagFn = httpsCallable(functions, "deleteSharedTag");

const getMyRoleFn = httpsCallable(functions, "getMyRole");
const addAuthorizedUserFn = httpsCallable(functions, "addAuthorizedUser");
const updateAuthorizedUserRoleFn = httpsCallable(functions, "updateAuthorizedUserRole");
const removeAuthorizedUserFn = httpsCallable(functions, "removeAuthorizedUser");
// One-time tag-catalog migration (2026-08-10) - see #tagMigrationWrap in
// index.html and migrateTagCatalogsToShared in functions/index.js.
const migrateTagCatalogsToSharedFn = httpsCallable(functions, "migrateTagCatalogsToShared", { timeout: 280000 });
// One-time accessControl backfill (2026-09-02) - see #accessMigrationWrap in
// index.html and migrateAccessControlPermissions in functions/index.js.
const migrateAccessControlPermissionsFn = httpsCallable(functions, "migrateAccessControlPermissions", { timeout: 110000 });

function isThreadCompleted(key) {
  return !!threadStatusMap[key]?.completed;
}

async function toggleThreadCompleted(key, completed) {
  // Optimistic update so the checkbox feels instant - the threadStatus
  // onSnapshot listener will reconcile with the server's value right after.
  threadStatusMap[key] = { ...(threadStatusMap[key] || {}), completed };
  render();
  try {
    await setThreadCompletedFn({ threadKey: key, completed });
  } catch (err) {
    console.error(err);
    alert("Could not update completed status: " + err.message);
    threadStatusMap[key] = { ...(threadStatusMap[key] || {}), completed: !completed };
    render();
  }
}


// ============================================================================
// Standup tab - see STANDUP_PROJECT_README.md for the full workflow. 4 steps:
// Pull (which also does the editable checklist inline - the two used to be
// separate steps/panels but were merged 2026-08-02 since they were showing
// largely the same content), Report, Email, Saved. Only Saved is persisted
// to Firestore - everything else is in-memory client state, rebuilt fresh
// every time step 1 is re-run.
// ============================================================================

// The 8 built-in tags' keys/labels/colors - this array's own order no
// longer means anything (2026-08-10: the README's old "Report Formatting
// Rules" permanent Critical/Urgent-first sequence was removed per Huy's
// request, after weighing the trade-off that an urgent task could then sort
// below an alphabetically-earlier custom tag - he decided alphabetical
// everywhere was worth it). sharedAllTags() below sorts these together with
// every custom tag purely by label now; this array exists just to define
// each built-in tag's key/label/color, read by key everywhere (never by
// position).
const STANDUP_TAGS = [
  { key: "critical", label: "Critical/Urgent", color: "#dc2626" },
  { key: "helpdesk", label: "Helpdesk", color: "#d97706" },
  { key: "inventory", label: "Inventory", color: "#0d9488" },
  { key: "newHire", label: "New Hire", color: "#16a34a" },
  { key: "layout", label: "Layout", color: "#9333ea" },
  { key: "followUp", label: "Follow Up", color: "#db2777" },
  // Added 2026-08-18 alongside multi-tag support/priority ordering below -
  // there was no "Troubleshoot" tag before this.
  { key: "troubleshoot", label: "Troubleshoot", color: "#0891b2" },
  { key: "travel", label: "Travel", color: "#ea580c" },
  { key: "other", label: "Other", color: "#6b7280" },
];

// 2026-08-18 request: entries can now carry more than one tag (see
// standupItemTags/standupPrimaryTag below), but must still display under
// exactly one tag section - never duplicated across sections. These three
// keys win that placement over any other tag an entry also carries, in this
// fixed order; every other tag (built-in or custom) remains purely
// alphabetical among itself, same as the 2026-08-10 decision documented on
// sharedAllTags() above - this is a partial, not full, reversion of that.
const STANDUP_TAG_PRIORITY_KEYS = ["critical", "followUp", "troubleshoot"];

// Every tag key an entry currently carries - the source of truth for the
// multi-select tag pickers. Falls back to the legacy single `item.tag` field
// (and finally to "other") so a row created before multi-tag support (a
// manually-added item, an old standupSaves doc saved before the `tags` array
// existed, a row seeded straight from guessStandupTag) always has at least
// one tag to key off of without every call site needing its own fallback.
function standupItemTags(item) {
  // 2026-09-14: only fall back to item.tag/"other" when item.tags is
  // genuinely absent (a legacy row from before multi-tag support). A row
  // with tags explicitly set to [] (subject-based auto-detection found no
  // category match - see standupGuessSubjectCategories) must stay [] here so
  // its tag-picker checkboxes render with nothing checked instead of
  // silently reappearing under "Other" - Huy asked for an empty selection
  // over a forced guess. standupPrimaryTag() below is the one place that
  // still needs a non-empty fallback (grouping an item into some section for
  // display), and handles that itself.
  if (Array.isArray(item.tags)) return item.tags;
  if (item.tag) return [item.tag];
  return ["other"];
}

// The single tag an entry is grouped/displayed under - see
// STANDUP_TAG_PRIORITY_KEYS above for the rule. Among non-priority tags (or
// when none of the 3 priority tags are present), picks whichever of the
// entry's tags sorts first in standupAllTags()'s own (alphabetical) order,
// so the choice is deterministic rather than "whichever was clicked first."
function standupPrimaryTag(item, allTags = standupAllTags()) {
  const tags = standupItemTags(item);
  // 2026-09-14: an item can now legitimately carry zero tags (no subject
  // keyword matched - see standupGuessSubjectCategories/standupItemTags).
  // That's fine for the tag-picker's own checkbox state, but every grouping/
  // section-lookup call site here still needs *some* key to bucket the item
  // under, so only this display-facing resolution falls back to "other" -
  // it never writes that fallback back onto item.tags itself.
  if (!tags.length) return "other";
  for (const key of STANDUP_TAG_PRIORITY_KEYS) {
    if (tags.includes(key)) return key;
  }
  const order = new Map(allTags.map((t, i) => [t.key, i]));
  return tags.slice().sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999))[0];
}

// Shared tag catalog (2026-08-10 unification) - Standup, Daily To-Do, and
// Issue used to each keep their own separate runtime-growable tag catalog on
// top of the fixed 8 STANDUP_TAGS above (mirrored server-side as
// standupTagCatalog/dailyTodoTagCatalog/issueTagCatalog). That meant a
// custom tag created from one tab's "+ New tag..." option was invisible to
// the other two, and every bridge between tabs (Daily To-Do -> Standup,
// Standup -> Issue) had to special-case custom tags away (force to "other" /
// drop to null) since a "custom:<id>" key from one tab's catalog meant
// nothing in another's. Merged into one sharedTagCatalog collection/cache so
// a tag created anywhere shows up (and can be picked or deleted) everywhere,
// and those bridges can now carry over any tag as-is. See
// docs/tag-feature.md and docs/log/2026-08-10-shared-tag-catalog.md.
let allSharedCustomTags = [];
// Every tag - all 8 built-ins plus every custom tag - sorted together by
// label, alphabetically, with no fixed position for any of them (2026-08-10:
// first pass only alphabetized the custom tags appended after a fixed
// Critical/Urgent-first sequence of the 8 built-ins; this pass removes that
// fixed sequence entirely per Huy's request, so Critical/Urgent now sorts
// wherever "C" falls alphabetically same as everything else - it can end up
// after an earlier-lettered custom tag like "Access Control"). This is the
// single source every tag <select>/checklist-sort/report-grouping/Excel-
// sheet-order across Standup, Daily To-Do, and Issue reads (via
// standupAllTags()/dailyTodoAllTags()/issueAllTags(), all thin wrappers
// around this), so the change applies everywhere at once. See the "Tag
// order" section of STANDUP_PROJECT_README.md for the full history/
// reasoning - this was a "permanent" rule until today.
function sharedAllTags() {
  const custom = allSharedCustomTags.map((t) => ({ key: `custom:${t.id}`, label: t.label, color: t.color || "#6b7280" }));
  return [...STANDUP_TAGS, ...custom].sort((a, b) => (a.label || "").localeCompare(b.label || ""));
}
// Picks the first palette color not already in use by an existing tag
// (fixed STANDUP_TAGS or an existing custom tag) instead of a plain
// length-based rotation (added 2026-08-10 - the old rotation started
// repeating colors once there were more than 8 custom tags, so two
// unrelated tags could end up visually identical). Once every palette
// color is taken, falls back to a color generated by walking the hue wheel
// in golden-angle steps (137.508°) - never repeats an already-used hex, and
// spaces new hues away from each other rather than clustering.
function sharedNextTagColor() {
  const used = new Set(
    STANDUP_TAGS.map((t) => t.color).concat(allSharedCustomTags.map((t) => t.color || "#6b7280"))
  );
  const unused = CUSTOM_TAG_COLOR_PALETTE.find((c) => !used.has(c));
  if (unused) return unused;
  const hue = Math.round((allSharedCustomTags.length * 137.508) % 360);
  return `hsl(${hue}, 65%, 45%)`;
}

// standupAllTags()/dailyTodoAllTags()/issueAllTags() below are kept as thin,
// identically-named wrappers around sharedAllTags() (same for each tab's own
// *NextTagColor()) rather than rewriting every one of their many call sites
// throughout this file - each tab's code still asks for "its own" tag set,
// it's just backed by the one shared catalog now.
function standupAllTags() {
  return sharedAllTags();
}

function standupNextTagColor() {
  return sharedNextTagColor();
}

// 2026-08-06 bug fix - the "+ New tag..." flow (both here and server-side in
// addStandupTag) now refuses to create a second tag sharing an existing
// label, but that doesn't repair a catalog that already has two tags
// labeled the same (e.g. two separately-created "Camera" entries with
// different `custom:<id>` keys) from before the fix. buildStandupReportHtml
// / buildStandupExcelWorkbook used to group strictly by standupAllTags()'s
// raw key, so a pre-existing duplicate label rendered as two identical-
// looking "Camera" headers/sheets, one per key, each holding whichever
// items happened to carry that specific key - not two bullets under one
// heading. This groups standupAllTags() by normalized label instead,
// merging every key sharing a label into one group (keeping the first-seen
// tag's color/display label, first-seen order for the group itself) so
// callers that need "every item under this label" can flatten across
// group.keys - repairing the display regardless of whether the underlying
// duplicate doc(s) are ever cleaned up via "Manage custom tags".
function standupTagGroups() {
  const groups = [];
  const byLabel = new Map();
  const allTags = standupAllTags();
  // 2026-08-18: pull the 3 priority tags (see STANDUP_TAG_PRIORITY_KEYS) out
  // to the front, in that fixed order, ahead of the otherwise-alphabetical
  // rest - a partial reinstatement of the pre-2026-08-10 fixed ordering,
  // scoped to just these 3 tags.
  const priorityFirst = [
    ...STANDUP_TAG_PRIORITY_KEYS.map((key) => allTags.find((t) => t.key === key)).filter(Boolean),
    ...allTags.filter((t) => !STANDUP_TAG_PRIORITY_KEYS.includes(t.key)),
  ];
  priorityFirst.forEach((t) => {
    const normalized = (t.label || "").trim().toLowerCase();
    const existing = byLabel.get(normalized);
    if (existing) {
      existing.keys.push(t.key);
    } else {
      const group = { label: t.label, color: t.color, keys: [t.key] };
      byLabel.set(normalized, group);
      groups.push(group);
    }
  });
  return groups;
}

// Which standupTagGroups() index a given tag key falls under - shared by
// every "sort entries by tag section" call site (the Pull checklist, Excel
// Section 2) so they all agree on the same priority-then-alphabetical order
// standupTagGroups() defines, without each re-deriving it.
function standupTagGroupOrderIndex(tagKey, groups = standupTagGroups()) {
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].keys.includes(tagKey)) return i;
  }
  return groups.length;
}

// Shared "sort by tag section, then location within it" used by every place
// that lists standup entries in tag order (the Pull checklist, the Report
// step's Section 2 editor and its static/exported mirror, the Saved tab
// editor) - keyed off each entry's standupPrimaryTag() and
// standupTagGroups()'s priority-then-alphabetical order, so all of them stay
// visually consistent with each other and with the priority rule.
function standupSortByTagThenLocation(items, allTags = standupAllTags()) {
  const groups = standupTagGroups();
  const order = new Map();
  groups.forEach((g, i) => g.keys.forEach((k) => order.set(k, i)));
  return items.slice().sort((a, b) => {
    const tagDiff =
      (order.get(standupPrimaryTag(a, allTags)) ?? groups.length) - (order.get(standupPrimaryTag(b, allTags)) ?? groups.length);
    if (tagDiff !== 0) return tagDiff;
    const locA = effectiveEntryLocation(a) || "￿";
    const locB = effectiveEntryLocation(b) || "￿";
    return locA.localeCompare(locB);
  });
}

// Compact multi-select tag picker shared by every row across the Pull
// checklist (classPrefix "standup-task-tag"), the Report step's Section 2
// editor ("standup-report-edit-tag"), and the Saved tab editor
// ("standup-save-edit-tag") - 2026-08-18 request to allow more than one tag
// per entry (see standupItemTags/standupPrimaryTag above). A
// <details>/<summary> popover rather than a real multi-select <select> so
// the compact single-line row layout everywhere else on these rows is
// unaffected; the popover collapses on every toggle since the caller
// re-renders the whole row/list right after (same "re-render on tag change"
// behavior the old single-select already had).
// allowDelete (2026-08-27, Pull checklist only - classPrefix "standup-task-tag")
// adds a small "×" next to each custom tag's option row so a tag can be
// deleted from the catalog without leaving the popover to find the separate
// "Manage custom tags" list. Only custom tags (key starts with "custom:")
// get one - the 8 fixed STANDUP_TAGS aren't part of the deletable catalog,
// same restriction renderStandupTagCatalogList() already enforces.
function standupTagPickerHtml(item, allTags, classPrefix, isOpen = false, allowDelete = false) {
  const selected = standupItemTags(item);
  const primary = standupPrimaryTag(item, allTags);
  const primaryInfo = allTags.find((t) => t.key === primary) || STANDUP_TAGS.find((t) => t.key === "other");
  // 2026-09-14: zero matched categories (no subject keyword hit - see
  // standupGuessSubjectCategories) shows "Uncategorized" on the popover
  // summary rather than "Other" - standupPrimaryTag still resolves "other"
  // internally for section-grouping purposes, but nothing is actually
  // checked in this case, so the label shouldn't imply otherwise.
  const summaryLabel =
    selected.length === 0
      ? "Uncategorized"
      : selected.length > 1
        ? `${escapeHtml(primaryInfo.label)} +${selected.length - 1}`
        : escapeHtml(primaryInfo.label);
  const optionsHtml = allTags
    .map((t) => {
      // The delete button is a sibling of the <label>, not nested inside it -
      // a button nested inside a <label> still triggers the label's own
      // "click forwards to my checkbox" default behavior on the way up,
      // which would silently toggle the tag at the same time it's deleted.
      const deleteBtn =
        allowDelete && t.key.startsWith("custom:")
          ? `<button type="button" class="${classPrefix}-delete" data-tag-key="${t.key}" title="Delete this tag" style="flex-shrink:0; border:none; background:none; color:var(--danger-light); font-size:13px; line-height:1; padding:2px 4px; cursor:pointer;">×</button>`
          : "";
      return `<div style="display:flex; align-items:center; gap:2px; padding:1px 4px;">
        <label style="display:flex; align-items:center; gap:6px; padding:2px 0; font-size:12px; white-space:nowrap; cursor:pointer; flex:1; min-width:0;">
          <input type="checkbox" class="${classPrefix}-option" value="${t.key}" ${selected.includes(t.key) ? "checked" : ""} />
          <span style="width:8px; height:8px; border-radius:50%; background:${t.color}; flex-shrink:0;"></span>${escapeHtml(t.label)}
        </label>${deleteBtn}
      </div>`;
    })
    .join("");
  // 2026-09-14: the scrollable options list carries its own
  // `${classPrefix}-options` class specifically so a caller re-rendering
  // this row (every checkbox toggle re-renders the whole row - see the
  // "standup-task-tag-option"/"standup-report-edit-tag-option" change
  // handlers below) can capture its scrollTop beforehand and restore it onto
  // the freshly-rendered replacement afterward - a plain innerHTML swap
  // otherwise silently resets scroll to the top on every single selection,
  // which is disorienting in a long tag list. See those handlers' own
  // comments for the capture/restore itself; this function only ever
  // renders the *current* scroll position back to 0 (a fresh element always
  // starts unscrolled) - restoring the previous position is the caller's job.
  return `<details class="${classPrefix}-picker" style="position:relative; display:inline-block;" ${isOpen ? "open" : ""}>
    <summary style="list-style:none; cursor:pointer; padding:6px 8px; border:1px solid var(--border); border-radius:6px; font-size:12px; background:var(--input-bg); white-space:nowrap;">🏷 ${summaryLabel}</summary>
    <div class="${classPrefix}-options" style="position:absolute; z-index:30; top:100%; right:0; margin-top:4px; background:var(--surface); border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:8px; padding:6px; box-shadow:0 4px 14px rgba(15,23,42,0.18); min-width:180px; max-height:240px; overflow-y:auto;">
      ${optionsHtml}
      <button type="button" class="${classPrefix}-add" style="width:100%; margin-top:4px; font-size:11px; padding:4px 8px;">+ New tag…</button>
    </div>
  </details>`;
}

// Shared restore helper for the tag-picker scroll-position fix above -
// re-finds the picker's own scrollable options div (by row id, since a
// row's DOM node is destroyed and rebuilt on every re-render, so the old
// element reference is dead) and applies whatever scrollTop the caller
// captured from it right before re-rendering. A no-op (nothing to restore
// onto) if the row/options element isn't found, e.g. the row was removed.
function standupRestoreTagPickerScroll(listEl, rowClass, classPrefix, itemId, scrollTop) {
  if (!listEl || !scrollTop) return;
  const row = Array.from(listEl.querySelectorAll(`.${rowClass}`)).find((r) => r.dataset.id === itemId);
  const optionsEl = row?.querySelector(`.${classPrefix}-options`);
  if (optionsEl) optionsEl.scrollTop = scrollTop;
}

// Adds/removes one tag from an item's multi-select tags in place, keeping
// the legacy single `item.tag` field in sync (= standupPrimaryTag(item)) so
// every call site that still reads item.tag directly (Excel Section 2's
// sort/category, the Transfer-to-Issue payload, saveStandupReport's
// validation) keeps working without each needing its own fallback. Never
// leaves an entry with zero tags (falls back to "other") - a picker with
// every box unchecked would otherwise vanish from every tag section.
function standupToggleItemTag(item, tagKey, checked) {
  const tags = new Set(standupItemTags(item));
  if (checked) tags.add(tagKey);
  else tags.delete(tagKey);
  if (!tags.size) tags.add("other");
  item.tags = [...tags];
  item.tag = standupPrimaryTag(item);
}

// Normalizes a typed tag label for duplicate comparison - trims leading/
// trailing whitespace and lowercases, so "Follow Up", " follow up", and
// "FOLLOW UP" are all recognized as the same tag. Shared by every
// duplicate-detection call site below (client-side pre-check here, and
// mirrored server-side in addSharedTag/functions/index.js) so both agree on
// what counts as "the same tag".
function standupNormalizeTagLabel(label) {
  return (label || "").trim().toLowerCase();
}

// Shared "+ New tag…" flow for every multi-select tag picker (Pull
// checklist/Report Section 2/Saved tab) - reuses an existing tag whose label
// matches case-insensitively (same 2026-08-06 fix the old single-select's
// own handler had) rather than creating a duplicate, then adds it to the
// given item's tags and hands control back to the caller's own re-render.
function standupPromptAddTagToItem(item, onDone) {
  const label = (prompt("New tag name:") || "").trim();
  if (!label) return;
  const normalizedLabel = standupNormalizeTagLabel(label);
  const existingTag = standupAllTags().find((t) => standupNormalizeTagLabel(t.label) === normalizedLabel);
  if (existingTag) {
    // 2026-08-27: don't just silently reuse it - Huy asked for a clear
    // signal that this wasn't actually a new tag, so a typo'd re-creation
    // attempt (extra space, different casing) doesn't look like a no-op.
    alert(`"${existingTag.label}" already exists — added it to this task instead of creating a duplicate.`);
    standupToggleItemTag(item, existingTag.key, true);
    onDone();
    return;
  }
  const color = standupNextTagColor();
  addSharedTagFn({ label, color })
    .then((res) => {
      // Reflected locally right away, same as addStandupLocationFn's success
      // handler, rather than waiting on the sharedTagCatalog onSnapshot
      // round-trip - res.data may carry an existing id (reused: true) if
      // another tab/device won a race creating the same label (addSharedTag,
      // functions/index.js, does the authoritative trim+lowercase dedupe
      // check server-side, so this covers the case the client-side check
      // above couldn't have caught).
      if (!allSharedCustomTags.some((t) => t.id === res.data.id)) {
        allSharedCustomTags.push({ id: res.data.id, label, color });
      }
      if (res.data.reused) {
        const reusedLabel = allSharedCustomTags.find((t) => t.id === res.data.id)?.label || label;
        alert(`"${reusedLabel}" already exists — added it to this task instead of creating a duplicate.`);
      }
      standupToggleItemTag(item, `custom:${res.data.id}`, true);
      onDone();
    })
    .catch((err) => {
      console.error(err);
      alert("Could not add tag: " + (err?.message || "Something went wrong."));
      onDone();
    });
}

// (2026-08-08, originally) Was a scoped alphabetical-by-label exception for
// Section 1 ("Summary for Kuan Goh") only, back when standupTagGroups()
// itself followed the old fixed Critical/Urgent-first order everywhere else.
// (2026-08-10) That fixed order was removed - standupTagGroups() is now
// alphabetical by construction, since it just reflects sharedAllTags()'s own
// order, which is alphabetical for every tag now - so this is a plain alias
// kept only so its existing call sites (buildStandupSummaryIntroText/
// buildStandupSummaryDetailSectionsHtml, the Excel "Section 1"/"Categories"
// sheets) don't need to change.
function standupTagGroupsAlphabetical() {
  return standupTagGroups();
}

// One nav button per workflow step - pure navigation (swap which panel is
// visible), same click-delegation pattern as roadmapViewToggleEl above.
// Separate from each panel's own action button (standupPullBtn,
// standupGenerateReportBtn, etc.) so adding a step never implies it also
// fires a side effect just by switching to it.
const STANDUP_STEP_PANELS = {
  pull: standupPullPanelEl,
  report: standupReportPanelEl,
  saved: standupSavedPanelEl,
};
let currentStandupStep = "pull";

standupWorkflowNavEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  currentStandupStep = btn.dataset.step;
  standupWorkflowNavEl.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  Object.entries(STANDUP_STEP_PANELS).forEach(([step, el]) => {
    if (el) el.style.display = step === currentStandupStep ? "block" : "none";
  });
  // Pull/Saved panels reflect whatever their underlying state currently
  // looks like - re-render on every visit rather than only when edited, so
  // switching over after editing something elsewhere (e.g. loading a day back
  // in from Saved) never shows stale content. Saved's own data instead comes
  // from the standupSaves onSnapshot listener (see subscribeToStandupSaves),
  // so this re-render just reflects whatever's currently cached in
  // allStandupSaves. Section 1 of Report has no equivalent re-render here
  // since it's only ever populated by an explicit "Generate report" click -
  // but every action inside it (Download HTML/PDF, Save, Open in Outlook
  // Web) still refreshes from the latest checklist/intro state first
  // regardless (see standupRefreshReportIfGenerated), so it can never go
  // stale in the ways that actually matter. (2026-08-08: Section 2 - see
  // standupReportEntriesEditEl - is the one part of Report that DOES
  // re-render on every visit, same as Pull/Saved above, since it's meant to
  // mirror step 1's checklist exactly and an edit made over on step 1 while
  // Report was last showing an older snapshot should never look stale here
  // either. A no-op if Generate hasn't been pressed yet this session -
  // standupReportEntriesEditEl is still display:none then.)
  if (currentStandupStep === "pull") renderStandupChecklist();
  if (currentStandupStep === "saved") renderStandupSavedList();
  if (currentStandupStep === "report" && standupReportEntriesEditEl) {
    standupReportEntriesEditEl.innerHTML = buildStandupReportEntriesEditorHtml();
  }
  // 2026-09-14: attachments already uploaded for the current target day -
  // re-render on every visit, same reasoning as Section 2 just above.
  if (currentStandupStep === "report") renderStandupSummaryAttachmentsList();
});

// Defaults the date picker to today (local browser date, which for this
// single-office dashboard is always PT) the first time the tab is shown,
// without stomping on whatever day Huy has already picked if he switches
// tabs and comes back. Just pre-fills the input field itself - does NOT
// queue anything. (2026-08-10: briefly also auto-queued today as the first
// chip so Pull had something to run on a first visit without an extra
// click; Huy asked for that removed - he wants to manually pick and add
// every day himself via "+ Add day"/"+ Add range," with nothing queued
// until he does.)
function ensureStandupDateDefault() {
  if (!standupDateInput || standupDateInput.value) return;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  standupDateInput.value = `${yyyy}-${mm}-${dd}`;
}

// Every PT day currently queued up to pull, as "YYYY-MM-DD" strings, kept
// sorted ascending and de-duplicated (2026-08-10: the Pull step's date
// picker became multi-select - #standupDateInput just picks one day at a
// time to add via #standupAddDateBtn, and this array is what #standupPullBtn
// actually pulls - and merges the results of - when clicked).
let standupSelectedDates = [];

function addStandupSelectedDate(isoDate) {
  if (!isoDate || standupSelectedDates.includes(isoDate)) return;
  standupSelectedDates.push(isoDate);
  standupSelectedDates.sort();
  renderStandupDateChips();
}

function removeStandupSelectedDate(isoDate) {
  standupSelectedDates = standupSelectedDates.filter((d) => d !== isoDate);
  renderStandupDateChips();
}

// standupDateToMMDDYYYY is defined further down (Steps 3 & 4's shared date
// helpers) but hoisted the same as every other top-level `function` in this
// file, so calling it here at click-time is safe regardless of file order.
function renderStandupDateChips() {
  if (!standupDateChipsEl) return;
  standupDateChipsEl.innerHTML = standupSelectedDates
    .map(
      (d) =>
        `<span class="standup-date-chip" data-date="${d}">${standupDateToMMDDYYYY(d)}<button type="button" data-remove-date="${d}" title="Remove ${d}">×</button></span>`
    )
    .join("");
}

standupDateChipsEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove-date]");
  if (!btn) return;
  removeStandupSelectedDate(btn.dataset.removeDate);
});

standupAddDateBtn?.addEventListener("click", () => {
  if (!standupDateInput?.value) {
    if (standupPullStatusEl) standupPullStatusEl.textContent = "Pick a day first.";
    return;
  }
  addStandupSelectedDate(standupDateInput.value);
});

// Every "YYYY-MM-DD" day from `fromIso` to `toIso`, inclusive, in order.
// Walks in UTC (noon, to dodge any DST edge) purely as a date-arithmetic
// trick - these are plain calendar-day strings with no timezone meaning of
// their own, same as everywhere else standupSelectedDates is used.
function enumerateStandupDateRange(fromIso, toIso) {
  const days = [];
  const cursor = new Date(`${fromIso}T12:00:00Z`);
  const end = new Date(`${toIso}T12:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// Defensive cap on one "+ Add range" click - a typo'd year (e.g. 2025
// instead of 2026) could otherwise silently queue thousands of days and one
// pullStandupEmailsWithSummary call each. A deliberately-wide range still
// works, it just takes another click past this many days.
const STANDUP_ADD_RANGE_MAX_DAYS = 31;

// "+ Add range" (2026-08-10) - a faster way to fill standupSelectedDates
// than clicking "+ Add day" once per day. Queues every day From/To
// inclusive; each one still gets pulled/deduped individually when Pull
// runs, exactly as if it had been added one at a time.
standupAddRangeBtn?.addEventListener("click", () => {
  const from = standupRangeFromInput?.value;
  const to = standupRangeToInput?.value;
  if (!from || !to) {
    if (standupPullStatusEl) standupPullStatusEl.textContent = "Pick both a start and end day for the range.";
    return;
  }
  if (from > to) {
    if (standupPullStatusEl) standupPullStatusEl.textContent = "Range start is after its end — swap them.";
    return;
  }
  const allDays = enumerateStandupDateRange(from, to);
  const capped = allDays.slice(0, STANDUP_ADD_RANGE_MAX_DAYS);
  capped.forEach(addStandupSelectedDate);
  if (standupPullStatusEl) {
    standupPullStatusEl.textContent =
      allDays.length > capped.length
        ? `Queued ${capped.length} of ${allDays.length} days (capped at ${STANDUP_ADD_RANGE_MAX_DAYS} per range) — add the rest as another range.`
        : `Queued ${capped.length} day(s): ${standupDateToMMDDYYYY(capped[0])} – ${standupDateToMMDDYYYY(capped[capped.length - 1])}.`;
  }
});

// ---- Step 1: Pull + Checklist (merged) -------------------------------------
// Used to be a plain read-only render (renderStandupMessageList) here in
// "1. Pull" plus a separate editable "2. Checklist" step underneath it,
// showing largely the same content twice. Removed the plain render entirely
// and merged the two steps into one - the checklist below (renderStandupChecklist)
// is a strict superset of what the old plain list showed (subject, AI
// summary, thread toggle) plus tagging/include/remove, so there's nothing
// lost by only showing it once.

// Centralized keyword -> category matching (2026-09-14 rewrite of the old
// single-match guessStandupTag). This is the ONE place subject keyword
// rules live - both standupGuessSubjectCategories (multi-category, subject
// only, used by Pull-seeding below) and anything else that ever needs "does
// this text mention category X" should read from here rather than growing a
// second parallel keyword list. Each rule is independent - unlike the old
// function's first-match-wins `if/return` chain, every rule is tested and
// every match kept, so a subject can resolve to more than one category (see
// standupGuessSubjectCategories). `resolve` returns a tag key given the
// current tag catalog: a literal key for the 8 fixed STANDUP_TAGS, or a
// label lookup for a category seeded as a custom shared tag (Network, Wi-Fi,
// Keycard, Phone, Laptop, Camera - see STANDUP_DEFAULT_EXTRA_TAG_LABELS
// below), which can return null if that tag hasn't been created yet.
function standupFindTagKeyByLabel(allTags, label) {
  return allTags.find((t) => (t.label || "").toLowerCase() === label.toLowerCase())?.key || null;
}
const STANDUP_SUBJECT_CATEGORY_RULES = [
  { test: /\burgent\b|\bcritical\b|\bemergency\b|\basap\b/, resolve: () => "critical" },
  { test: /\bnew hire\b|\bonboard(ing)?\b/, resolve: () => "newHire" },
  // "Wi-Fi"/"WiFi"/"wi fi", plus generic wireless/SSID phrasing.
  { test: /\bwi[- ]?fi\b|\bwireless\b|\bssid\b/, resolve: (allTags) => standupFindTagKeyByLabel(allTags, "Wi-Fi") },
  { test: /\bnetwork\b|\bvlan\b|\bethernet\b|\brouter\b|\bswitch\b|\bfirewall\b/, resolve: (allTags) => standupFindTagKeyByLabel(allTags, "Network") },
  // "Keycard"/"Key Card"/"Keycards"/"Key-Card", etc.
  { test: /\bkey[- ]?cards?\b|\bbadges?\b|\baccess (card|request)s?\b|\bhikcentral\b|\bunifi\b/, resolve: (allTags) => standupFindTagKeyByLabel(allTags, "Keycard") },
  { test: /\bcameras?\b|\bcctv\b/, resolve: (allTags) => standupFindTagKeyByLabel(allTags, "Camera") },
  { test: /\bphones?\b|\bcell ?phones?\b|\bvoicemail\b/, resolve: (allTags) => standupFindTagKeyByLabel(allTags, "Phone") },
  { test: /\blaptops?\b|\bnotebooks?\b|\bmacbooks?\b/, resolve: (allTags) => standupFindTagKeyByLabel(allTags, "Laptop") },
  { test: /\btravel\b|\bflight\b|\bhotel\b|\bnavan\b|\bitinerary\b/, resolve: () => "travel" },
  { test: /\blayout\b|\bfloor ?plan\b/, resolve: () => "layout" },
  { test: /\binventory\b|\bstock\b|\bequipment\b|\bshipment\b|\bship(ped|ping)?\b|\border(ed)?\b/, resolve: () => "inventory" },
  { test: /\bhelpdesk\b/, resolve: () => "helpdesk" },
  { test: /\bfollow[- ]?up\b|\breminder\b|\bpending\b|\bstill waiting\b/, resolve: () => "followUp" },
];

// Subject-only, multi-category auto-detection (2026-09-14 requirement: "no
// single winning category" - a subject mentioning more than one category's
// keywords must pre-select all of them, not just whichever rule matched
// first). Case-insensitive (subject lowercased once). Dedupes by resolved
// key, so multiple keywords for the same category ("Keycard ... Key Card
// ...") only add that category once. Skips a rule whose target tag hasn't
// been created yet (resolve() returned null) rather than guessing a
// different category for it. Returns [] - never a forced default - when
// nothing matches, so the Pull checklist's tag picker shows no category
// checked rather than silently landing on "Other" (that still happens, but
// only as a display-grouping fallback in standupPrimaryTag, never written
// back into item.tags).
function standupGuessSubjectCategories(subject, allTags = standupAllTags()) {
  const text = (subject || "").toLowerCase();
  const matched = [];
  for (const rule of STANDUP_SUBJECT_CATEGORY_RULES) {
    if (!rule.test.test(text)) continue;
    const key = rule.resolve(allTags);
    if (key && !matched.includes(key)) matched.push(key);
  }
  return matched;
}

// Ticket-number extraction (2026-09-11) - same bracketed pattern mail-sync's
// own parseEmail.js already uses (TICKET_ID_RE = /\[(ITS-\d+)\]/i), widened
// from ITS-only to any bracketed [LETTERS-digits] ticket prefix per the
// redesign's row spec. Checked against subject/threadSummary/original-
// request body/own text, in that order of usefulness.
const STANDUP_TICKET_ID_RE = /\[([A-Za-z]+-\d+)\]/;
function standupExtractTicketNumber(item) {
  const haystack = [item.text, item.threadSummary, item.initial?.fullBody, item.initial?.bodyPreview, item.fullBody]
    .filter((s) => typeof s === "string" && s)
    .join(" ");
  const m = haystack.match(STANDUP_TICKET_ID_RE);
  return m ? m[1] : null;
}

// 2026-09-11: Standup's category set = STANDUP_TAGS (fixed) + sharedTagCatalog
// (custom) - no parallel category array. These labels ("Helpdesk"/"New
// Hire" already exist as fixed STANDUP_TAGS keys and are skipped) are
// ensured to exist as flat custom tags the same way the "+ New tag..." flow
// already creates one - addSharedTagFn, which dedupes case-insensitively by
// label server-side, so calling this redundantly (e.g. every time Standup
// becomes the current app) is always safe and never creates a duplicate.
// "Camera" added 2026-09-14 alongside the subject keyword auto-categorization
// rewrite (STANDUP_SUBJECT_CATEGORY_RULES above needs a real tag to resolve
// "Camera Issue"-style subjects to) - same mechanism as the original 5, not a
// new category system.
const STANDUP_DEFAULT_EXTRA_TAG_LABELS = ["Network", "Wi-Fi", "Keycard", "Phone", "Laptop", "Camera"];
let standupDefaultTagsEnsured = false;
function ensureStandupDefaultTagsExist() {
  if (standupDefaultTagsEnsured) return;
  standupDefaultTagsEnsured = true;
  const existingLabels = new Set(standupAllTags().map((t) => (t.label || "").toLowerCase()));
  STANDUP_DEFAULT_EXTRA_TAG_LABELS.filter((label) => !existingLabels.has(label.toLowerCase())).forEach((label) => {
    const color = standupNextTagColor();
    addSharedTagFn({ label, color })
      .then((res) => {
        if (!allSharedCustomTags.some((t) => t.id === res.data.id)) {
          allSharedCustomTags.push({ id: res.data.id, label, color });
        }
        if (currentStandupStep === "pull") renderStandupChecklist();
        renderStandupCategoryFilter();
      })
      .catch((err) => console.error("ensureStandupDefaultTagsExist failed for", label, err));
  });
}

// 2026-09-11: Category Sort/Filter (Pull step checklist, shared with the
// Report step's Section 2 editor since it reads the same in-memory state) -
// purely a client-side display filter, persisted in-memory/localStorage for
// the session only. Never calls addSharedTag/deleteSharedTag/mutates
// sharedTagCatalog - it only hides/shows rows already in
// standupChecklistItems by their resolved standupPrimaryTag().
const STANDUP_CATEGORY_FILTER_STORAGE_KEY = "standupCategoryFilterHidden";
let standupCategoryFilterHidden = new Set();
try {
  const stored = JSON.parse(localStorage.getItem(STANDUP_CATEGORY_FILTER_STORAGE_KEY) || "[]");
  if (Array.isArray(stored)) standupCategoryFilterHidden = new Set(stored);
} catch (err) {
  standupCategoryFilterHidden = new Set();
}
function standupSaveCategoryFilterState() {
  try {
    localStorage.setItem(STANDUP_CATEGORY_FILTER_STORAGE_KEY, JSON.stringify([...standupCategoryFilterHidden]));
  } catch (err) {
    // Best-effort only - a private window or blocked site data just means
    // the filter resets next load, same fallback behavior documented for
    // every other localStorage use in this app.
  }
}
function standupIsTagVisible(tagKey) {
  return !standupCategoryFilterHidden.has(tagKey);
}
function renderStandupCategoryFilter() {
  if (!standupCategoryFilterWrapEl) return;
  const allTags = standupAllTags();
  standupCategoryFilterWrapEl.innerHTML = allTags
    .map((t) => {
      const hidden = standupCategoryFilterHidden.has(t.key);
      return `<label class="standup-filter-chip${hidden ? " is-hidden" : ""}">
        <input type="checkbox" class="standup-category-filter-option" value="${t.key}" ${hidden ? "" : "checked"} />
        <span style="width:8px; height:8px; border-radius:50%; background:${t.color}; flex-shrink:0;"></span>${escapeHtml(t.label)}
      </label>`;
    })
    .join("");
}
standupCategoryFilterWrapEl?.addEventListener("change", (e) => {
  if (!e.target.classList.contains("standup-category-filter-option")) return;
  const key = e.target.value;
  if (e.target.checked) standupCategoryFilterHidden.delete(key);
  else standupCategoryFilterHidden.add(key);
  standupSaveCategoryFilterState();
  renderStandupCategoryFilter();
  if (currentStandupStep === "pull") renderStandupChecklist();
  standupRefreshReportEntriesEditor();
});

// Every checklist item currently shown in step 1's inline checklist - seeded
// fresh from each Pull (see standupPullBtn below), then freely editable/removable,
// plus whatever's been added manually via standupAddTaskBtn. Re-pulling
// replaces this array entirely rather than merging, matching "Re-run the
// pull if Huy says something is missing" from the README - a fresh pull for
// a day is meant to be the new starting point, not merged with stale edits.
let standupChecklistItems = [];
// Which row's tag picker (standupTagPickerHtml, classPrefix "standup-task-tag")
// should render already-open on the next renderStandupChecklist() call - the
// picker is a native <details>, which loses its open state whenever the row
// is rebuilt via innerHTML (every checkbox toggle re-renders the whole list),
// so without this tracked id the popover would close after every single tag
// pick instead of staying open for a multi-tag selection. Set on open/toggle
// (see the "toggle" listener below) and on any interaction that keeps the
// same picker open across a re-render (tag checkbox toggle, "+ New tag...");
// cleared when the picker closes (summary click or an outside click).
let standupPullOpenTagPickerId = null;
// The PT day (YYYY-MM-DD) the checklist was last seeded for - carried into
// the Report/Email steps' filename and "Standup - MM/DD/YYYY" subject line,
// so those stay correct even if the date picker itself gets changed
// afterward without re-pulling. Once multiple days can be pulled at once
// (2026-08-10, see standupSelectedDates), this is always the LATEST of
// those days - Save/filenames/email-subject still need exactly one date to
// key off of, and "latest" is the most natural single day to attribute a
// merged pull to.
let standupLastPulledDate = null;
// Every day actually included in the most recent Pull (2026-08-10), sorted
// ascending - length 1 for the common single-day case, longer when several
// days were queued and pulled together. Used only to decide whether the
// Report header/email subject/filename should show a date *range* instead
// of the single standupLastPulledDate above (see standupDateOrRangeLabel/
// standupFilenameStampOrRange) and to label each checklist row with which
// day it came from when more than one day is in play.
let standupLastPulledDates = [];

// Normalizes whitespace/case and keeps only the first message seen per
// subject - primary results come first and are already newest-first within
// themselves, so "first seen" naturally prefers the most recent primary
// message over an older supplemental one sharing the same subject.
function dedupeStandupMessagesBySubject(messages) {
  const seen = new Set();
  return messages.filter((m) => {
    const key = (m.subject || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Sole Pull action (2026-08-10: the old separate plain "Pull emails" button
// is gone, and this button - renamed from "Pull with Summary" - is now the
// only way to pull a day's mail, always including the full-thread-fetch +
// AI-summarize pass that button used to be an opt-in extra step for). Also
// now pulls every day queued up in standupSelectedDates in one click (the
// date picker itself became multi-select 2026-08-10 too - see
// addStandupSelectedDate above), merging each day's results into one
// checklist instead of only ever handling a single day at a time. Each
// queued day still gets its own Graph date-range query - Graph has no
// "give me these N arbitrary days" filter - so this is N sequential
// pullStandupEmailsWithSummary calls, not one bigger call.
// Shared body for both #standupPullBtn ("Pull", Sent Items only) and
// #standupPullAllBtn ("Pull All", 2026-09-11 - full-mailbox $search) - same
// multi-day-queue/dedupe/tag/seed pipeline either way, just a different
// backing callable and a "source: mailbox" tag on the seeded rows so
// renderStandupChecklist can badge them (see mailboxSourceBadge there).
// Neither button merges into the existing checklist - a fresh pull (by
// either button) replaces standupChecklistItems entirely, matching "a fresh
// pull for a day is meant to be the new starting point" documented on the
// original standupChecklistItems declaration above.
async function standupRunPull(buttonEl, pullFn, pullSourceTag) {
  if (!standupSelectedDates.length) {
    if (standupPullStatusEl) standupPullStatusEl.textContent = "Add a target day first.";
    return;
  }
  buttonEl.disabled = true;
  const originalText = buttonEl.textContent;
  if (standupPullStatusEl) standupPullStatusEl.textContent = "";
  try {
    const datesToPull = [...standupSelectedDates];
    const pulledByDate = [];
    let earliestStart = null;
    let latestEnd = null;
    for (const date of datesToPull) {
      buttonEl.textContent = datesToPull.length > 1 ? `Pulling ${standupDateToMMDDYYYY(date)}…` : "Pulling…";
      const result = await pullFn({ date });
      const { primary, supplemental, dateRangeUtc } = result.data;
      // Same subject pulled twice on the SAME day almost always means "two
      // emails about the same task" (e.g. a reply, then a follow-up later
      // that day), not two separate tasks - but only dedup within a day; the
      // same subject showing up on two different queued days is two
      // separate tasks, one per day.
      const dedupedForDate = dedupeStandupMessagesBySubject([...primary, ...(supplemental || [])]).map((m) => ({
        ...m,
        pulledDate: date,
      }));
      pulledByDate.push({ date, messages: dedupedForDate, rawCount: primary.length + (supplemental || []).length });
      if (!earliestStart || dateRangeUtc.start < earliestStart) earliestStart = dateRangeUtc.start;
      if (!latestEnd || dateRangeUtc.end > latestEnd) latestEnd = dateRangeUtc.end;
    }
    const allDeduped = pulledByDate.flatMap((p) => p.messages);
    if (standupPullStatusEl) {
      const rawCount = pulledByDate.reduce((sum, p) => sum + p.rawCount, 0);
      const dupeNote = allDeduped.length < rawCount ? ` (${rawCount - allDeduped.length} duplicate subject(s) merged)` : "";
      const withSummary = allDeduped.filter((m) => m.threadSummary).length;
      const dayNote = datesToPull.length > 1 ? ` across ${datesToPull.length} days` : "";
      standupPullStatusEl.textContent = `${allDeduped.length} task(s)${dayNote}${dupeNote}, ${withSummary} with summaries — ${earliestStart} → ${latestEnd}`;
    }
    const allTags = standupAllTags();
    standupChecklistItems = allDeduped.map((m, i) => {
      // 2026-09-14: subject-only, multi-category auto-detection (see
      // standupGuessSubjectCategories/STANDUP_SUBJECT_CATEGORY_RULES) -
      // replaces the old single-tag guessStandupTag(), which also read the
      // thread summary/body and returned only its first keyword match. Every
      // category whose keywords appear anywhere in the subject is
      // pre-selected, not just one; a subject with no keyword match seeds an
      // empty tags array rather than guessing "Other" (item.tag still
      // resolves to "other" for display grouping via standupPrimaryTag, but
      // the tag-picker checkboxes show nothing checked - see
      // standupItemTags).
      const matchedTags = standupGuessSubjectCategories(m.subject, allTags);
      return {
        id: `msg-${m.pulledDate}-${m.id || i}`,
        text: m.subject || "(no subject)",
        tag: matchedTags.length ? standupPrimaryTag({ tags: matchedTags }, allTags) : "other",
        // Every matched category, not just one (2026-08-18 multi-tag support
        // made this possible; 2026-09-14 is what actually populates more
        // than one entry here). May be [] - see comment above.
        tags: matchedTags,
        included: true,
        fullBody: m.fullBody || m.bodyPreview || "",
        initial: m.initial || null,
        // Always set (even to null) rather than left undefined - this key's
        // mere presence is what tells renderStandupChecklist to show the
        // always-visible summary editor for this row (see hasSummarySlot
        // below); a manually-added row never gets this key at all, so it
        // never shows that editor.
        threadSummary: m.threadSummary || null,
        // 2026-09-11: full ordered thread (see fetchConversationMessages,
        // functions/index.js) plumbed straight through from the pull
        // response instead of being fetched again client-side - powers
        // standupConversationHtml's "View Conversation" toggle.
        conversationMessages: Array.isArray(m.conversationMessages) ? m.conversationMessages : [],
        locationOverride: null,
        // Which queued PT day this row came from (2026-08-10) - only shown in
        // the checklist when more than one day was pulled together; carried
        // through so a multi-day pull can still tell its rows apart.
        pulledDate: m.pulledDate,
        // 2026-09-11: which pull action seeded this row ("mailboxAll" for
        // Pull All, undefined/omitted for the plain Sent-Items Pull) - drives
        // the optional "source: mailbox" badge in renderStandupChecklist.
        ...(pullSourceTag ? { pullSource: pullSourceTag } : {}),
      };
    });
    standupLastPulledDates = datesToPull;
    standupLastPulledDate = datesToPull[datesToPull.length - 1];
    renderStandupChecklist();
    buttonEl.textContent = originalText;
  } catch (err) {
    buttonEl.textContent = "Pull failed";
    if (standupPullStatusEl) standupPullStatusEl.textContent = err?.message || "Something went wrong.";
    console.error(err);
  } finally {
    buttonEl.disabled = false;
    setTimeout(() => {
      if (buttonEl.textContent === "Pull failed") buttonEl.textContent = originalText;
    }, 3000);
  }
}

// Sole Sent-Items Pull action (2026-08-10: the old separate plain "Pull
// emails" button is gone, and this button - renamed from "Pull with
// Summary" - is now the only way to pull a day's mail via Sent Items,
// always including the full-thread-fetch + AI-summarize pass that button
// used to be an opt-in extra step for). Also now pulls every day queued up
// in standupSelectedDates in one click (the date picker itself became
// multi-select 2026-08-10 too - see addStandupSelectedDate above), merging
// each day's results into one checklist instead of only ever handling a
// single day at a time. Each queued day still gets its own Graph date-range
// query - Graph has no "give me these N arbitrary days" filter - so this is
// N sequential pullStandupEmailsWithSummary calls, not one bigger call.
standupPullBtn?.addEventListener("click", () => {
  if (standupPullBtn) standupPullBtn.textContent = "Pull";
  standupRunPull(standupPullBtn, pullStandupEmailsWithSummaryFn, null);
});

// "Pull All" (2026-09-11) - same queued date(s)/pipeline as Pull above, but
// against pullStandupMailboxAllFn (full-mailbox Graph $search, strictly
// read-only - see that callable in functions/index.js) instead of
// pullStandupEmailsWithSummaryFn (Sent Items only).
standupPullAllBtn?.addEventListener("click", () => {
  if (standupPullAllBtn) standupPullAllBtn.textContent = "Pull All";
  standupRunPull(standupPullAllBtn, pullStandupMailboxAllFn, "mailboxAll");
});

// ---- Step 1 (cont'd): the inline checklist itself --------------------------
// 2026-08-02: removed the always-visible one-line summary (and its
// standupEntrySummaryText plain-truncation helper) from each row - it was
// wasting space and, since it was really just showing an excerpt of a
// reply's own "Thanks + signature" body (the real AI-generated version
// never worked - see the pullStandupEmails note in functions/index.js), it
// wasn't earning that space. The "View request"/"View original request"
// toggle below still holds the full text on demand.

function renderStandupChecklist() {
  if (!standupChecklistListEl) return;
  if (standupChecklistStatusEl) {
    const includedCount = standupChecklistItems.filter((i) => i.included).length;
    standupChecklistStatusEl.textContent = standupChecklistItems.length
      ? `${includedCount} of ${standupChecklistItems.length} included`
      : "";
  }
  if (!standupChecklistItems.length) {
    standupChecklistListEl.innerHTML = `<p style="font-size:13px; color:var(--text); text-align:center;">No tasks yet — pull in step 1, or add one manually.</p>`;
    return;
  }
  // Sorted by tag for display (same alphabetical order as everywhere else,
  // 2026-08-10 - no tag pinned first anymore), not by pull/add order - a
  // stable sort, so items that share a tag stay in whatever order they were
  // pulled/added in relative to each other. Sorts a copy rather than
  // standupChecklistItems itself so
  // insertion order (and therefore "the last item added" for the Add-task
  // focus below) is unaffected.
  const allTags = standupAllTags();
  // 2026-09-14: NOT sorted by tag anymore. This used to run
  // standupSortByTagThenLocation() on every render - including a render
  // triggered by nothing more than checking a box in a row's own category
  // picker (see the "standup-task-tag-option" listener below) - so picking a
  // category for one task would immediately regroup the whole list under
  // it, visibly jumping rows around ("flicker"). The list is now displayed
  // in whatever order standupChecklistItems is already in (pull/add order,
  // or whatever Sort All last left it in - see standupSortAllBtn below) and
  // never silently reordered by a selection change. Sorts a copy only in the
  // sense that filtering below doesn't touch standupChecklistItems itself.
  const sortedItems = standupChecklistItems;
  // 2026-09-11 Category Sort/Filter - a pure display filter (still doesn't
  // reorder anything) - see standupIsTagVisible/renderStandupCategoryFilter
  // above.
  const visibleItems = sortedItems.filter((item) => standupIsTagVisible(standupPrimaryTag(item, allTags)));
  if (!visibleItems.length) {
    standupChecklistListEl.innerHTML = `<p style="font-size:13px; color:var(--text); text-align:center;">No tasks match the current category filter.</p>`;
    return;
  }

  standupChecklistListEl.innerHTML = visibleItems
    .map((item) => {
      // Falls back to the actual "Other" entry (not "whatever the last
      // array element happens to be") - that used to be safe when
      // STANDUP_TAGS was the only source, but "Other" is no longer
      // guaranteed to be last once custom tags are appended after it.
      // Keyed off standupPrimaryTag() (2026-08-18), not the raw item.tag,
      // since an entry can now carry more than one tag - this dot always
      // reflects the tag section the row is actually sorted/grouped under.
      const tagInfo = allTags.find((t) => t.key === standupPrimaryTag(item, allTags)) || STANDUP_TAGS.find((t) => t.key === "other");
      // The row itself stays a compact flex line (checkbox/tag dot/editable
      // bullet text/tag select/remove); the original request text - full
      // email body, not just the subject the bullet text was seeded from -
      // is tucked into a collapsed <details> underneath so it's there to
      // reference while editing/tagging without cluttering every row.
      // When this item came from a reply with an actual original request
      // behind it (item.initial), show that instead of - not just alongside
      // - the reply's own body, since the original is almost always what
      // Huy actually needs to remember while editing/tagging (a reply's own
      // body is often just "Thanks" plus a signature).
      const requestBody = item.initial?.fullBody || item.initial?.bodyPreview || item.fullBody;
      const requestLabel = item.initial ? "View original request" : "View request";
      const requestDetails = requestBody
        ? `<details style="margin:2px 0 0 26px;">
            <summary style="cursor:pointer; font-size:12px; color:var(--accent-blue);">${escapeHtml(requestLabel)}</summary>
            <div style="white-space:pre-wrap; font-size:12px; color:var(--text); margin-top:4px; max-height:220px; overflow-y:auto; background:var(--surface-2); border:1px solid var(--border); border-radius:6px; padding:8px;">${escapeHtml(requestBody)}</div>
          </details>`
        : "";
      // 2026-08-07 request: the AI thread summary (initial request through
      // last reply - see threadSummary in pullStandupEmailsWithSummary,
      // functions/index.js) now sits always-visible right underneath the
      // title/bullet-text row, as an editable textarea - not a collapsed
      // <details> like "View original request" above stays as. Only rendered
      // for a row that actually has a threadSummary *slot* (its key is
      // present, even if null) - i.e. rows pulled via "Pull with Summary" or
      // restored from a Saved day - so a plain "Pull emails" or manually
      // added row's layout is unaffected. An empty box (slot present, value
      // null/blank) still renders so Huy can type one in by hand if the AI
      // summary failed for that thread.
      const hasSummarySlot = Object.prototype.hasOwnProperty.call(item, "threadSummary");
      // Manually-added rows (standupAddTaskBtn) also carry a threadSummary
      // slot (see that handler) so they get this same box, but the "AI
      // summary (full thread...)" wording only makes sense for a Pull-sourced
      // row that actually had a thread to summarize - swap in plainer
      // copy for a manual row instead of relabeling the whole block.
      const isManualTask = typeof item.id === "string" && item.id.startsWith("manual-");
      const summaryLabel = isManualTask ? "📝 Summary (editable):" : "📝 AI summary (full thread, editable):";
      const summaryPlaceholder = isManualTask
        ? "Add a short summary for this task..."
        : "No summary generated for this thread — type one in by hand if you'd like.";
      // 2026-09-11 row redesign: Line 2's editable summary box gets a small
      // "Clear" button alongside the label - the box itself was already
      // always-editable (live on every keystroke, see the input listener
      // below), so this just adds an explicit one-click "empty it out"
      // affordance rather than a second field, matching the "reuse/extend
      // rather than add a second description field" instruction.
      const summaryBlock = hasSummarySlot
        ? `<div class="standup-task-line2">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:2px;">
              <label style="font-size:11px; color:#a78bfa;">${summaryLabel}</label>
              <button type="button" class="standup-task-summary-clear secondary" style="font-size:10px; padding:1px 6px;" title="Clear this summary">Clear</button>
            </div>
            <textarea class="standup-task-summary" placeholder="${escapeHtml(summaryPlaceholder)}" style="width:100%; min-height:52px; padding:6px 8px; border:1px solid #e9d5ff; background:#faf5ff; border-radius:6px; font-size:12px; color:#3b0764; resize:vertical; font-family:inherit; box-sizing:border-box;">${escapeHtml(item.threadSummary || "")}</textarea>
          </div>`
        : "";
      // A pulled-day badge only earns its space once more than one day is
      // actually in play (2026-08-10 multi-day Pull) - a normal single-day
      // pull leaves standupLastPulledDates at length 1 and every row looks
      // exactly as it did before this feature.
      const dateBadge =
        standupLastPulledDates.length > 1 && item.pulledDate
          ? `<span style="font-size:10px; font-weight:700; color:var(--info-text); background:var(--info-bg); border:1px solid #1d3a5f; border-radius:9999px; padding:2px 8px; flex-shrink:0; white-space:nowrap;">${standupDateToMMDDYYYY(item.pulledDate)}</span>`
          : "";
      // "source: mailbox" badge (2026-09-11, "Pull All" requirement 2) -
      // distinguishes a row pulled via the full-mailbox search from a plain
      // Sent-Items Pull. Not required for downstream features to work
      // (every field is seeded the same way either source), purely
      // informational.
      const mailboxSourceBadge = item.pullSource === "mailboxAll"
        ? `<span style="font-size:10px; font-weight:700; color:#6d28d9; background:#f3e8ff; border:1px solid #c4b5fd; border-radius:9999px; padding:2px 8px; flex-shrink:0; white-space:nowrap;" title="Pulled via full-mailbox search, not just Sent Items">source: mailbox</span>`
        : "";
      // Ticket number badge (2026-09-11 row redesign) - see
      // standupExtractTicketNumber above.
      const ticketNumber = standupExtractTicketNumber(item);
      const ticketBadge = ticketNumber
        ? `<span style="font-size:10px; font-weight:700; color:var(--text); background:var(--surface-2); border:1px solid var(--border); border-radius:6px; padding:2px 6px; flex-shrink:0; white-space:nowrap;">${escapeHtml(ticketNumber)}</span>`
        : "";
      // Line 4 - "View Conversation" (2026-09-11 row redesign): chronological
      // full-thread expand/collapse, distinct from the existing "View
      // request"/"View original request" toggle above (which only ever
      // shows the single root/reply body). Populated server-side by
      // pullStandupEmailsWithSummary/pullStandupMailboxAll (both already
      // call fetchConversationMessages for the AI summary pass, so this
      // reuses that same fetch rather than hitting Graph again) - see
      // item.conversationMessages.
      const conversationHtml = standupConversationHtml(item);
      return `<div class="standup-task-row" data-id="${item.id}" style="padding:8px; border:1px solid var(--border); border-radius:8px; margin-bottom:6px; background:var(--surface);">
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="checkbox" class="standup-task-included" ${item.included ? "checked" : ""} />
          <span style="width:10px; height:10px; border-radius:50%; background:${tagInfo.color}; flex-shrink:0;"></span>
          ${dateBadge}
          ${mailboxSourceBadge}
          ${ticketBadge}
          <input type="text" class="standup-task-text" value="${escapeHtml(item.text)}" style="flex:1; min-width:120px; padding:6px 8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:6px; font-size:13px;" />
          ${standupTagPickerHtml(item, allTags, "standup-task-tag", item.id === standupPullOpenTagPickerId, true)}
          <button type="button" class="standup-task-remove secondary" style="font-size:12px; padding:4px 8px;">Remove</button>
        </div>
        ${summaryBlock}
        <div style="display:flex; gap:6px; align-items:center; margin:6px 0 0 26px;">
          <span style="font-size:11px; color:var(--text);">📍</span>
          ${locationInputHtml("standup-task-location", `standup-loc-opts-${item.id}`, item.locationOverride)}
        </div>
        ${requestDetails}
        ${conversationHtml}
      </div>`;
    })
    .join("");
}

// Line 4 of the redesigned row (2026-09-11) - chronologically ordered full
// thread, visually distinguishing Huy's own messages (right-aligned,
// accent background) from everyone else's (left-aligned, neutral
// background), same "own vs. other" idea as a chat UI. item.conversationMessages
// is already sorted ascending by receivedDateTime server-side
// (fetchConversationMessages) - no re-sort needed here.
function standupConversationHtml(item) {
  const messages = Array.isArray(item.conversationMessages) ? item.conversationMessages : [];
  if (!messages.length) return "";
  const rows = messages
    .map((m) => {
      const isOwn = (m.senderEmail || "").trim().toLowerCase() === STANDUP_OWN_EMAIL;
      const who = m.senderName || m.senderEmail || "Unknown";
      const when = m.receivedDateTime ? new Date(m.receivedDateTime).toLocaleString() : "";
      const body = (m.fullBody || m.bodyPreview || "").slice(0, 4000);
      return `<div style="align-self:${isOwn ? "flex-end" : "flex-start"}; max-width:90%; background:${
        isOwn ? "var(--info-bg)" : "var(--surface-2)"
      }; border:1px solid var(--border); border-radius:8px; padding:6px 8px;">
        <div style="font-size:11px; font-weight:700; color:var(--text);">${escapeHtml(who)} <span style="font-weight:400; color:var(--muted);">${escapeHtml(when)}</span></div>
        <div style="font-size:12px; color:var(--text); white-space:pre-wrap; margin-top:2px;">${escapeHtml(body)}</div>
      </div>`;
    })
    .join("");
  return `<details style="margin:6px 0 0 26px;">
    <summary style="cursor:pointer; font-size:12px; color:var(--accent-blue);">View Conversation (${messages.length})</summary>
    <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px; max-height:320px; overflow-y:auto;">${rows}</div>
  </details>`;
}

// Event delegation throughout (rows get replaced wholesale by innerHTML on
// every render, so per-row listeners would be lost) - one listener per event
// type on the never-replaced list container instead.
standupChecklistListEl?.addEventListener("input", (e) => {
  const row = e.target.closest(".standup-task-row");
  const item = standupChecklistItems.find((i) => i.id === row?.dataset.id);
  if (!item) return;
  if (e.target.classList.contains("standup-task-text")) {
    item.text = e.target.value;
  }
  if (e.target.classList.contains("standup-task-summary")) {
    // 2026-08-07 request: the AI thread summary is now hand-editable, same
    // "live on every keystroke" behavior as the title/bullet-text field
    // above. Empty out to null (not "") so it round-trips through
    // saveStandupReport identically to a never-generated summary.
    item.threadSummary = e.target.value.trim() ? e.target.value : null;
  }
  if (e.target.classList.contains("standup-task-location")) {
    // "" means "back to Auto-detect" - stored as null so
    // effectiveEntryLocation falls through to detectEntryLocationLabel
    // again. Live on every keystroke (not just change/blur) so a manually
    // typed override that isn't in the catalog still sticks the moment
    // you're done typing it, matching how the text field above behaves.
    item.locationOverride = e.target.value.trim() || null;
    const datalist = row.querySelector("datalist");
    populateLocationDatalist(datalist, e.target.value.trim());
  }
});

standupChecklistListEl?.addEventListener("change", (e) => {
  const row = e.target.closest(".standup-task-row");
  const item = standupChecklistItems.find((i) => i.id === row?.dataset.id);
  if (!item) return;
  if (e.target.classList.contains("standup-task-included")) {
    item.included = e.target.checked;
    if (standupChecklistStatusEl) {
      const includedCount = standupChecklistItems.filter((i) => i.included).length;
      standupChecklistStatusEl.textContent = `${includedCount} of ${standupChecklistItems.length} included`;
    }
  }
  // 2026-08-18: the single tag <select> is now a multi-select checkbox
  // picker (standupTagPickerHtml) - each checkbox toggle mutates
  // item.tags in place via standupToggleItemTag, then re-renders (same
  // "re-render so the row's colored dot/sort follows the change" behavior
  // the old single-select already had). The "+ New tag…" flow moved to its
  // own button, handled in the click listener below since it's not itself a
  // checkbox toggle.
  if (e.target.classList.contains("standup-task-tag-option")) {
    // Keep this row's picker open across the re-render below (see
    // standupPullOpenTagPickerId) - without this, selecting a second/third
    // tag would require reopening the popover after every single pick.
    standupPullOpenTagPickerId = item.id;
    // 2026-09-14: capture the picker's own scroll position before the
    // re-render destroys/rebuilds it (see standupTagPickerHtml's
    // "${classPrefix}-options" class), so a pick made after scrolling down a
    // long tag list doesn't jump the list back to the top - see
    // standupRestoreTagPickerScroll above.
    const scrollTop = row.querySelector(".standup-task-tag-options")?.scrollTop || 0;
    standupToggleItemTag(item, e.target.value, e.target.checked);
    renderStandupChecklist();
    standupRestoreTagPickerScroll(standupChecklistListEl, "standup-task-row", "standup-task-tag", item.id, scrollTop);
  }
});

// Native <details> "toggle" event - does not bubble, but a capture-phase
// listener still sees it on its way down to the target, so this delegates
// fine from the never-replaced list container. Keeps standupPullOpenTagPickerId
// in sync with the user explicitly opening/closing a picker via its summary,
// so a later re-render (e.g. from an unrelated field edit) doesn't
// re-open one the user just closed, or fail to reflect one they just opened.
standupChecklistListEl?.addEventListener(
  "toggle",
  (e) => {
    if (!e.target.classList?.contains("standup-task-tag-picker")) return;
    const row = e.target.closest(".standup-task-row");
    const itemId = row?.dataset.id;
    if (e.target.open) {
      standupPullOpenTagPickerId = itemId ?? null;
    } else if (standupPullOpenTagPickerId === itemId) {
      standupPullOpenTagPickerId = null;
    }
  },
  true
);

// Native <details> only closes again via its own summary - clicking anywhere
// else leaves it open indefinitely. Close it on an outside click, matching
// the requested "closes only when the user clicks outside, finishes
// selection, or explicitly closes it" behavior.
document.addEventListener("click", (e) => {
  if (!standupPullOpenTagPickerId) return;
  const openPicker = standupChecklistListEl?.querySelector(".standup-task-tag-picker[open]");
  if (openPicker && !openPicker.contains(e.target)) {
    openPicker.removeAttribute("open");
    standupPullOpenTagPickerId = null;
  }
});

standupChecklistListEl?.addEventListener("click", (e) => {
  const deleteTagBtn = e.target.closest(".standup-task-tag-delete");
  if (deleteTagBtn) {
    // Deletes the tag from the shared catalog entirely (same
    // deleteSharedTagFn/confirm() as the "Manage custom tags" list) rather
    // than just unchecking it from this one item - the popover only shows a
    // × on custom tags (see standupTagPickerHtml's allowDelete), so this can
    // never target one of the 8 fixed STANDUP_TAGS.
    const tagKey = deleteTagBtn.dataset.tagKey;
    const id = tagKey?.startsWith("custom:") ? tagKey.slice("custom:".length) : null;
    if (!id) return;
    const tagLabel = allSharedCustomTags.find((t) => t.id === id)?.label || "this tag";
    if (
      !confirm(
        `Remove "${tagLabel}" everywhere (Standup, Daily To-Do, and Issue)? Tasks already using it will fall back to Other next time they're saved. This can't be undone.`
      )
    )
      return;
    // Keep this row's picker open across the re-render the delete triggers
    // (subscribeToSharedTagCatalog's onSnapshot -> renderStandupChecklist,
    // same reasoning as the checkbox-toggle/"+ New tag..." cases above).
    const row = deleteTagBtn.closest(".standup-task-row");
    if (row?.dataset.id) standupPullOpenTagPickerId = row.dataset.id;
    deleteTagBtn.disabled = true;
    deleteSharedTagFn({ id }).catch((err) => {
      console.error(err);
      alert("Could not delete: " + (err?.message || "Something went wrong."));
      deleteTagBtn.disabled = false;
    });
    return;
  }
  const addTagBtn = e.target.closest(".standup-task-tag-add");
  if (addTagBtn) {
    const row = addTagBtn.closest(".standup-task-row");
    const item = standupChecklistItems.find((i) => i.id === row?.dataset.id);
    // Keep the picker open through the "+ New tag..." flow's re-render too,
    // same reasoning as the checkbox toggle above.
    if (item) {
      standupPullOpenTagPickerId = item.id;
      standupPromptAddTagToItem(item, () => renderStandupChecklist());
    }
    return;
  }
  // 2026-09-11 row redesign: explicit "Clear" button next to the Line 2
  // summary label - same "empty the box, set item.threadSummary to null"
  // behavior the textarea's own input listener already does when hand-
  // cleared, just one click instead of select-all+delete.
  const clearSummaryBtn = e.target.closest(".standup-task-summary-clear");
  if (clearSummaryBtn) {
    const row = clearSummaryBtn.closest(".standup-task-row");
    const item = standupChecklistItems.find((i) => i.id === row?.dataset.id);
    if (item) {
      item.threadSummary = null;
      renderStandupChecklist();
    }
    return;
  }
  const removeBtn = e.target.closest(".standup-task-remove");
  if (!removeBtn) return;
  const row = removeBtn.closest(".standup-task-row");
  standupChecklistItems = standupChecklistItems.filter((i) => i.id !== row.dataset.id);
  renderStandupChecklist();
});

standupAddTaskBtn?.addEventListener("click", () => {
  standupChecklistItems.push({
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: "",
    tag: "other",
    tags: ["other"],
    included: true,
    locationOverride: null,
    // Present (even though null) so the row renders the same editable
    // Summary box a Pull-sourced row gets (see hasSummarySlot above) -
    // 2026-08-27 request to add a Summary field to manually-added tasks.
    threadSummary: null,
    // 2026-09-11: present (even though empty) so a manually-added row never
    // trips on Array.isArray checks elsewhere (standupConversationHtml,
    // saveCurrentStandupSnapshot) - there's simply no thread to show.
    conversationMessages: [],
  });
  renderStandupChecklist();
  const textInputs = standupChecklistListEl?.querySelectorAll(".standup-task-text");
  textInputs?.[textInputs.length - 1]?.focus();
});

// "Sort All" (2026-09-14) - the only place standupChecklistItems itself gets
// reordered now (see the "no automatic sort" note on renderStandupChecklist
// above). Reuses the exact same priority-then-alphabetical-tag, then-
// location grouping every other Standup view already sorts by
// (standupSortByTagThenLocation/STANDUP_TAG_PRIORITY_KEYS), just applied
// once, on demand, to the live array instead of on every render - so a
// category assigned after this still stays wherever it was until Sort All
// is pressed again.
standupSortAllBtn?.addEventListener("click", () => {
  standupChecklistItems = standupSortByTagThenLocation(standupChecklistItems, standupAllTags());
  renderStandupChecklist();
  standupRefreshReportIfGenerated();
});

// ---- Steps 3 & 4: Report + Email (shared date/formatting helpers) ---------

function standupDateToMMDDYYYY(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y}`;
}

function standupDateToFilenameStamp(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${m}${d}${y}`;
}

function standupTargetDate() {
  return standupLastPulledDate || standupDateInput?.value || null;
}

// Report header / email subject only ever need ONE date string to key off
// (Save's own `standupSaves/{date}` doc id, in particular, has to be a
// single day), so standupTargetDate() above stays a single ISO date - the
// LATEST day pulled, when more than one was queued together (2026-08-10).
// These two helpers are purely cosmetic on top of that: when the live
// checklist actually spans more than one pulled day, they show the full
// span instead of just its latest day, so a merged multi-day report/email
// doesn't read as if it only covered its last day. Deliberately scoped to
// only fire when dateStr is exactly the live standupTargetDate() - a Saved
// day's own single dateStr (passed explicitly by Load/export call sites)
// always falls through to the plain single-date formatting below.
function standupDateOrRangeLabel(dateStr) {
  if (dateStr && dateStr === standupLastPulledDate && standupLastPulledDates.length > 1) {
    const sorted = [...standupLastPulledDates].sort();
    return `${standupDateToMMDDYYYY(sorted[0])} – ${standupDateToMMDDYYYY(sorted[sorted.length - 1])}`;
  }
  return dateStr ? standupDateToMMDDYYYY(dateStr) : "";
}

function standupFilenameStampOrRange(dateStr) {
  if (dateStr && dateStr === standupLastPulledDate && standupLastPulledDates.length > 1) {
    const sorted = [...standupLastPulledDates].sort();
    return `${standupDateToFilenameStamp(sorted[0])}-${standupDateToFilenameStamp(sorted[sorted.length - 1])}`;
  }
  return dateStr ? standupDateToFilenameStamp(dateStr) : "unknown-date";
}

// Collapses checklist rows that are effectively the same task (identical
// bullet text once whitespace/case is normalized) down to the first one
// seen - catches duplicates the Pull step's own subject-based dedup
// (dedupeStandupMessagesBySubject above) can't, e.g. a manually re-added
// task, or two pulled rows whose subjects differ slightly but whose edited
// bullet text ended up identical. Applied here (not by mutating
// standupChecklistItems itself) so the checklist in step 1 still shows every
// row for editing/removal - only what actually renders into the
// report/summary/email is deduped. Blank text is left alone rather than
// collapsed to a single row, same as the "non-blank" filter below already
// assumes it won't see blanks anyway.
//
// keyFn lets a caller dedupe by something other than the raw subject text -
// see standupReportDedupe below, which needs to dedupe by the AI summary
// once one exists (a reply's subject and the pulled "original request"
// subject for the same ticket are worded differently, so raw-text dedup
// here can't catch them, but they can summarize to the exact same sentence
// once standupSummarizeIncludedItemsForReport runs). Defaults to item.text
// so every existing caller keeps behaving exactly as before.
function dedupeStandupItemsByText(items, keyFn) {
  const getKey = keyFn || ((item) => item.text || "");
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item).trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Only checked-in, non-blank checklist rows count toward the report/email -
// unchecking a row in step 1's checklist is how Huy excludes something
// without deleting it outright.
// `items` defaults to the live checklist (standupChecklistItems) so every
// existing call site in Steps 1-2 below keeps behaving exactly as before -
// added (2026-08-06) so the "View Report" Summary/Entries editors in Step 3
// can call these same functions against a *saved day's* save.items instead,
// without duplicating the filter/dedup logic.
function standupIncludedItemsByTag(tagKey, items = standupChecklistItems) {
  // standupPrimaryTag(), not a raw i.tag === tagKey check (2026-08-18) - an
  // entry can now carry more than one tag, but must still show under exactly
  // one tag section (never duplicated), so membership here is keyed off the
  // single resolved primary tag rather than "does it have this tag at all."
  return dedupeStandupItemsByText(items.filter((i) => i.included && standupPrimaryTag(i) === tagKey && (i.text || "").trim()));
}

function standupHasIncludedItems() {
  return standupChecklistItems.some((i) => i.included && i.text.trim());
}

// Same "checked-in, non-blank, deduped" filter as standupIncludedItemsByTag,
// just without the tag filter - for the location breakdown below, which
// groups across all tags at once.
function standupIncludedItems(items = standupChecklistItems) {
  return dedupeStandupItemsByText(items.filter((i) => i.included && (i.text || "").trim()));
}

// ---- Location auto-detection (California vs. everywhere else) -------------
// Best-effort matching against the shared Cubework location catalog
// (window.CUBEWORK_LOCATIONS, public/locations.js - see
// docs/location-catalog.md) so the Report intro can auto-build the "Cali
// Issues"/"Outside Cali Issues" breakdown Huy used to type by hand every
// day (2026-08-03 request). Ticket subjects rarely spell an address exactly
// like the catalog (abbreviations, missing commas, nicknames like "COI" for
// City of Industry), so this is deliberately loose: normalize both sides to
// a token set and only call it a match when the street number AND at least
// one more meaningful word overlap - strict enough to avoid miscategorizing
// an unrelated ticket (e.g. a client name that happens to share a word),
// loose enough to catch "3950 E Airport Dr Ontario" against the catalog's
// "3950 E Airport Dr, Ontario, CA 91761". Anything that doesn't clear that
// bar is left out of the location breakdown entirely rather than guessed
// into either bucket - it's still fully present in the tag-grouped sections
// below, so nothing is silently lost, just not summarized by location.
const STANDUP_LOCATION_STOPWORDS = new Set([
  "st", "ave", "dr", "rd", "ln", "ct", "pl", "blvd", "pky", "hwy", "ste", "unit", "bldg", "of", "the", "and", "building",
]);

function standupNormalizeLocationTokens(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 2 && !STANDUP_LOCATION_STOPWORDS.has(t));
}

// One entry's {tokens, numberToken, state} for the index below. state is
// either given directly (standupLocationCatalog's user-confirmed additions
// already know their state - see the "ask before adding" flow further down)
// or parsed from the label's own trailing ", XX" pattern (e.g. ", CA 91789"
// or ", CA") for window.CUBEWORK_LOCATIONS entries, since that catalog
// doesn't expose state as its own field.
function standupLocationIndexEntry(label, explicitState) {
  const tokens = standupNormalizeLocationTokens(label);
  const numberToken = tokens.find((t) => /^\d+$/.test(t)) || null;
  let state = explicitState || null;
  if (!state) {
    const stateMatch = (label || "").match(/,\s*([A-Z]{2})\b(?!.*,\s*[A-Z]{2}\b)/);
    state = stateMatch ? stateMatch[1] : null;
  }
  // label itself is kept (not just its tokens) so callers can show/group by
  // the actual location string, not just its CA/Outside-CA state - see
  // detectEntryLocationLabel below.
  return { label, tokens: new Set(tokens), numberToken, state };
}

// Rebuilt whenever allStandupCustomLocations changes (see
// subscribeToStandupLocationCatalog below) - window.CUBEWORK_LOCATIONS
// itself never changes at runtime (a static file, only editable by a code
// deploy), but the user-confirmed additions on top of it do, so this can't
// just be a one-time const the way it started out as.
let STANDUP_LOCATION_INDEX = (window.CUBEWORK_LOCATIONS || []).map((loc) => standupLocationIndexEntry(loc.label));

function standupRebuildLocationIndex() {
  const builtIn = (window.CUBEWORK_LOCATIONS || []).map((loc) => standupLocationIndexEntry(loc.label));
  const custom = allStandupCustomLocations
    .filter((c) => c && typeof c.label === "string" && typeof c.state === "string")
    .map((c) => standupLocationIndexEntry(c.label, c.state));
  STANDUP_LOCATION_INDEX = [...builtIn, ...custom];
}

// Same fuzzy match STANDUP_LOCATION_INDEX has always used (street number
// token must match exactly, plus at least one more overlapping token so a
// bare coincidental number alone can't count) - now returns the whole
// matched entry (label + state) instead of just a state, so callers that
// need the actual location string (grouping/titling entries - see
// detectEntryLocationLabel and groupItemsByLocation below) have it.
function detectEntryLocationEntry(text) {
  const tokenSet = new Set(standupNormalizeLocationTokens(text));
  if (!tokenSet.size) return null;
  let best = null;
  let bestScore = 0;
  for (const entry of STANDUP_LOCATION_INDEX) {
    if (!entry.numberToken || !tokenSet.has(entry.numberToken)) continue; // street number must match exactly
    let score = 0;
    entry.tokens.forEach((t) => {
      if (tokenSet.has(t)) score++;
    });
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best && bestScore >= 2 ? best : null;
}

function detectEntryLocationLabel(text) {
  return detectEntryLocationEntry(text)?.label || null;
}

// Every known location label (built-in window.CUBEWORK_LOCATIONS plus the
// runtime-growable standupLocationCatalog additions), sorted CA-state-first
// then alphabetically - powers the manual override dropdown on each
// Standup/Daily To-Do row (see the "-location" <select> in
// renderStandupChecklist/renderDailyTodoList) so a garbled voice
// transcription can still be pointed at the right address by hand.
function allLocationCatalogLabels() {
  return STANDUP_LOCATION_INDEX.map((e) => e.label)
    .filter(Boolean)
    .sort((a, b) => {
      const stateA = STANDUP_LOCATION_INDEX.find((e) => e.label === a)?.state || "";
      const stateB = STANDUP_LOCATION_INDEX.find((e) => e.label === b)?.state || "";
      const rankA = stateA === "CA" ? 0 : 1;
      const rankB = stateB === "CA" ? 0 : 1;
      return rankA !== rankB ? rankA - rankB : a.localeCompare(b);
    });
}

// A row's actual location for grouping/display purposes - whatever was
// manually picked in its override dropdown, else whatever auto-detection
// finds from its own text, else null (unassigned). Shared by Standup
// checklist rows and Daily To-Do entries alike, both of which now carry a
// locationOverride field.
function effectiveEntryLocation(item) {
  return item.locationOverride || detectEntryLocationLabel(item.text) || null;
}

// Location field markup, shared by both rows' render functions
// (renderStandupChecklist/renderDailyTodoList) - 2026-08-03 replaced the old
// `<select>` of every known location (clicking it popped open the full
// list) with the same "empty until you type" pattern Email Request's own
// Location field already uses (see populateLocationOptions in
// email-request.html): a plain text input backed by an empty `<datalist>`
// that only fills in with a handful of fuzzy matches once you start typing
// (see populateLocationDatalist below). An empty value means "Auto-detect"
// (falls through to detectEntryLocationLabel), same meaning the old select's
// blank option had - typing anything not in the catalog is still accepted
// as a manual override, matching Email Request's own "manual entry is fine"
// behavior. datalistId must be unique per row since every row on the page
// renders its own.
function locationInputHtml(rowClass, datalistId, selectedValue) {
  return `<input type="text" class="${rowClass}" list="${datalistId}" value="${escapeHtml(selectedValue || "")}" placeholder="Auto-detect" autocomplete="off" style="flex:1; padding:4px 6px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:6px; font-size:11px; color:var(--text); max-width:280px;" /><datalist id="${datalistId}"></datalist>`;
}

const LOCATION_SUGGESTION_LIMIT = 8;

// Fills in a row's (currently empty) datalist with up to
// LOCATION_SUGGESTION_LIMIT catalog labels containing the typed query -
// mirrors populateLocationOptions in email-request.html exactly, including
// leaving the datalist empty once the value is already an exact match (that
// closes the suggestion popup rather than leaving a single redundant option
// showing).
function populateLocationDatalist(datalistEl, query) {
  if (!datalistEl) return;
  datalistEl.innerHTML = "";
  if (!query) return; // stay empty until the user types something
  const labels = allLocationCatalogLabels();
  const isExactMatch = labels.some((l) => l.toLowerCase() === query.toLowerCase());
  if (isExactMatch) return;
  const q = query.toLowerCase();
  labels
    .filter((l) => l.toLowerCase().includes(q))
    .slice(0, LOCATION_SUGGESTION_LIMIT)
    .forEach((l) => {
      const o = document.createElement("option");
      o.value = l;
      datalistEl.appendChild(o);
    });
}

// Groups a list of checklist/entry items by their effective location (see
// effectiveEntryLocation - manual override, else auto-detected from the
// item's own text), sorted CA-state locations first then Outside-CA,
// alphabetically within each. Items with no resolvable location come back
// separately as `unassigned` rather than silently dropped, so callers can
// decide whether to surface them - Daily To-Do's report has no other
// section to fall back on and must show them; Standup's summary
// intentionally leaves them out of this breakdown since they're still fully
// visible in the tag sections below it (same "no confident match - leave
// out entirely, don't guess" spirit this already had).
function groupItemsByLocation(items) {
  const byLabel = new Map();
  const unassigned = [];
  items.forEach((item) => {
    const label = effectiveEntryLocation(item);
    if (!label) {
      unassigned.push(item);
      return;
    }
    if (!byLabel.has(label)) {
      const state = STANDUP_LOCATION_INDEX.find((e) => e.label === label)?.state || null;
      byLabel.set(label, { label, state, items: [] });
    }
    byLabel.get(label).items.push(item);
  });
  const groups = [...byLabel.values()].sort((a, b) => {
    const rankA = a.state === "CA" ? 0 : 1;
    const rankB = b.state === "CA" ? 0 : 1;
    return rankA !== rankB ? rankA - rankB : a.label.localeCompare(b.label);
  });
  return { groups, unassigned };
}

// What to actually show as a task's bullet text once it's rendering into
// the report (the summary's location breakdown and per-tag breakdown below)
// - prefers item.threadSummary (the full-thread AI summary from "Pull with
// Summary" - request, action taken, outcome/open items) when there is one,
// else item.aiReportSummary (the shorter original-request-focused summary
// set by the Generate report click handler below, see
// summarizeStandupReportEntriesFn, one network call per Generate press, not
// per keystroke), else its raw text (which up to now was always just the
// pulled email's subject line, e.g. "Re: 218 MACHLIN - WALNUT: KEYCARD
// ACTIVATION"). Deliberately NOT used by anything that needs item.text's
// own literal words - location matching
// (effectiveEntryLocation/standupDetectLocationState/standupLocationCandidates)
// still reads item.text directly, since a summary can drop the exact
// street-number token the fuzzy matcher keys off of - and not by step 1's
// checklist itself, which only ever shows/edits item.text. Falls back to
// item.text whenever there's no summary yet (AI call never run, failed, or
// returned null for this entry - summarizeStandupEntries fails closed on
// any error) so the report never renders blank.
//
// (2026-08-09: also names the requester - standupRequesterName below -
// when this task is a reply to a thread someone else started. Huy asked
// for report bullets to say who actually made a request, not just what it
// was; the name comes straight from the pulled email's own sender
// metadata, not an AI guess.)
//
// (2026-08-09, same-day follow-up: originally this always prepended
// "Name: " onto whatever body it picked. Huy asked for the name woven into
// the sentence itself instead of stuck on the front as a label - since the
// name is only reliable, not the actual wording, that had to happen inside
// the AI prompts themselves (see summarizeStandupEntries/summarizeConversation
// in functions/index.js, both of which now take the resolved name and are
// told to use it grammatically), not here. This function still resolves
// the name - both to build the AI request in
// standupSummarizeIncludedItemsForReport below, and as a fallback prefix
// for item.text itself (no AI summary exists to weave a name into) - but
// only prepends it when the body doesn't already appear to contain it, so
// an older aiReportSummary/threadSummary generated before this change
// (which never mentions the name) still gets one, while a freshly
// AI-generated one (which already names them per the updated prompts)
// doesn't get a redundant "Name: Name already said this" prefix. Matching
// is a simple case-insensitive substring check, not a strict guarantee -
// good enough since the failure mode either way is cosmetic (a rare
// missing or doubled name), not lost information.
function standupItemDisplayText(item) {
  const body = item.threadSummary || item.aiReportSummary || item.text;
  const requester = standupRequesterName(item);
  if (!requester) return body;
  return body.toLowerCase().includes(requester.toLowerCase()) ? body : `${requester}: ${body}`;
}

// The name of the person who actually asked for this task, when it's known
// - i.e. this task is a reply to a thread someone else started (item.initial,
// see fetchConversationRootMessage in functions/index.js) and that original
// message's sender isn't Huy himself (a chain of his own outbound notes
// isn't "someone else's request"). Read directly from Graph's own sender
// metadata rather than asked of the AI, since a real name is available
// without guessing - added 2026-08-09 per Huy's "who made the request" ask.
// Returns null (no prefix added) for a self-started thread, a manually
// added task, or when the sender's address matches Huy's own.
//
// (2026-08-09, same-day follow-up: checks item.requesterName FIRST, before
// falling back to deriving it from item.initial. item.initial itself is
// live-Pull-only - it's never part of what saveStandupReport persists (see
// its own comment), so a checklist item loaded back in via "3. Saved" ->
// "Load into Checklist" never has an item.initial to derive from, even for
// a day that originally had a resolved requester. item.requesterName is
// this function's own resolved OUTPUT from when the item was last saved -
// saveCurrentStandupSnapshot() computes and sends it alongside threadSummary
// specifically so Load-into-Checklist can hand it straight back here
// without needing the original email metadata at all. A live-pulled item
// never has item.requesterName set, so it always falls through to the
// item.initial path below exactly as before this change.)
const STANDUP_OWN_EMAIL = "huy.nguyen@cubework.com";

// Graph's own sender.emailAddress.name isn't always an actual display name
// - a sender with no saved contact/display name (a fair number of external
// vendors, service accounts, etc.) comes back with the email address
// itself sitting in that field. Huy asked for report bullets to always
// name an actual person, not show an email address - this infers one from
// the address's own local-part (before the @) when there's no real name to
// use, e.g. "jane.smith@vendor.com" -> "Jane Smith". Best-effort only: a
// local part with no recognizable separator (a single run like
// "jsmith123") can't be reliably split into first/last, so it's just
// title-cased as one word rather than guessed at further - still better
// than showing the raw address. Mirrors nameFromEmail in
// functions/index.js (summarizeConversation's own version of this same
// fallback) - kept in sync by hand, same as every other client/server pair
// in this file (see "Two monolith files, not a component tree" in
// docs/architecture-core.md).
// Generic mailboxes that are never a person's name no matter how you split
// them - "Noreply requested..." or "Info requested..." would read as a
// wrong (or at least confusing) name rather than just no name at all, so
// these are excluded up front rather than title-cased like a real local
// part would be. Mirrors NAME_FROM_EMAIL_DENYLIST in functions/index.js.
const STANDUP_NAME_FROM_EMAIL_DENYLIST = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply", "info", "support",
  "helpdesk", "admin", "notifications", "alerts", "notification", "mailer",
  "postmaster", "webmaster", "system", "automated",
]);

function standupNameFromEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return null;
  const local = email.split("@")[0];
  if (STANDUP_NAME_FROM_EMAIL_DENYLIST.has(local.toLowerCase().replace(/[._-]/g, ""))) return null;
  const parts = local
    .split(/[._+-]+/)
    .filter(Boolean)
    .filter((p) => !/^\d+$/.test(p));
  if (!parts.length) return null;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

function standupRequesterName(item) {
  if (typeof item.requesterName === "string" && item.requesterName.trim()) return item.requesterName.trim();
  const initial = item.initial;
  if (!initial) return null;
  if (initial.senderEmail && initial.senderEmail.toLowerCase() === STANDUP_OWN_EMAIL) return null;
  const rawName = typeof initial.senderName === "string" ? initial.senderName.trim() : "";
  // Graph gave us a real display name (doesn't itself look like an email
  // address) - use it as-is.
  if (rawName && !rawName.includes("@")) return rawName;
  // No display name, or Graph handed back the address again as the "name"
  // - fall back to inferring one from the email itself.
  return standupNameFromEmail(initial.senderEmail || rawName) || (rawName || null);
}

// Second dedup pass, applied only to what the report actually renders
// (the intro's counts, the location breakdown, and the colored per-tag
// breakdown - see the three callers below), AFTER
// standupSummarizeIncludedItemsForReport has run. dedupeStandupItemsByText's
// default (raw item.text) dedup already ran once when these items were
// pulled out of standupChecklistItems via standupIncludedItems/
// standupIncludedItemsByTag - that catches identical subjects, but not two
// *differently worded* subjects for the same ticket (e.g. a reply's own
// subject vs. the pulled "original request" subject) that only turn out to
// be duplicates once the AI summarizes them down to the same short
// sentence (2026-08-06 - this is exactly what surfaced once real summaries
// started rendering: "Replace HikCentral to Unifi at 11179 Banana Ave."
// showing up twice). Deliberately a separate function rather than folding
// this into standupIncludedItems/standupIncludedItemsByTag themselves,
// since standupSummarizeIncludedItemsForReport calls those to decide what
// to *send* to the AI in the first place, before any summary exists yet to
// dedupe by - collapsing on stale/absent summaries there would shrink the
// batch sent to the AI for the wrong reason.
function standupReportDedupe(items) {
  return dedupeStandupItemsByText(items, standupItemDisplayText);
}

// Groups today's included tasks under "Cali Issues" / "Outside Cali Issues"
// (matching exactly how Huy was typing this by hand), same as before - but
// now nests each task under its own specific matched location within those
// two buckets (2026-08-05 request), instead of one flat bullet dump per
// bucket, so "which site" is visible at a glance, not just "CA or not".
// Returns "" when nothing matched at all, so callers can skip adding an
// empty section.
function standupBuildLocationBreakdown(items = standupChecklistItems) {
  const { groups } = groupItemsByLocation(standupReportDedupe(standupIncludedItems(items)));
  if (!groups.length) return "";

  const renderGroups = (list) =>
    list.map((g) => `  ${g.label}:\n${g.items.map((i) => `  - ${standupItemDisplayText(i)}`).join("\n")}`).join("\n");
  const section = (label, list) => (list.length ? `${label}:\n${renderGroups(list)}` : "");
  const caGroups = groups.filter((g) => g.state === "CA");
  const otherGroups = groups.filter((g) => g.state !== "CA");
  return [section("Cali Issues", caGroups), section("Outside Cali Issues", otherGroups)].filter(Boolean).join("\n\n");
}

// Included tasks that look address-like (contain a street-number-style
// token, 2+ digits) but didn't clear standupDetectLocationState's match bar
// - i.e. plausibly a real Cubework location that's just not in the catalog
// yet, as opposed to a client name or vague subject with nothing to detect
// at all. Only this subset gets asked about (per Huy's 2026-08-03 request
// to be asked before anything gets added to the catalog) - flagging every
// unmatched task regardless of content would mean asking about things like
// "Driver's License SERGIO" that were never going to have a location.
function standupLocationCandidates(items = standupChecklistItems) {
  return standupIncludedItems(items).filter((item) => {
    // Already resolved - whether by auto-detection or by picking a location
    // manually in the row's override dropdown - so nothing left to ask about.
    if (effectiveEntryLocation(item)) return false;
    return standupNormalizeLocationTokens(item.text).some((t) => /^\d{2,}$/.test(t));
  });
}

function standupReportFilename() {
  return `Huy_Nguyen_Standup_${standupFilenameStampOrRange(standupTargetDate())}_001`;
}

// Grouped/sorted by tag (README: "never by time period"), skipping any tag
// with zero included items so the report itself isn't cluttered with empty
// sections - step 1's checklist dropdown is where all 8 tags always show
// up, not necessarily the generated report. page-break-inside:avoid is
// applied per-card (not to the whole .tag-section) per the README's own
// note, so a long section's overflow cards move to the next page naturally
// instead of the entire section being forced onto one page. No Carry
// Forward/Next Actions section, no Day Summary section, no Excalidraw output
// - all three permanently removed per the README.
// Auto-generated recap placed above Critical/Urgent (see the 2026-08-02 note
// in STANDUP_PROJECT_README.md's Structure section, which supersedes the old
// "No Day Summary" rule). Addressed directly to Kuan Goh (the standup's
// recipient - see Key Colleagues in the README). Split into two pieces per
// Huy's follow-up requests: an editable plain-text intro sentence (this
// function - seeds #standupSummaryInput, then freely rewritable without
// being silently overwritten), and a separately-rendered colored per-tag
// breakdown that's always derived live from the current checklist state
// (buildStandupSummaryDetailSectionsHtml below) - keeping that part
// non-freeform is what preserves the colored tag structure Huy asked to
// keep, since a single freeform textarea couldn't guarantee it survives
// edits.
// `items` defaults to the live checklist so the existing Step 2 call site
// (buildStandupSummaryIntroText() with no args, run when "Generate report"
// is pressed) is unaffected - added (2026-08-06) so the Saved step's Summary
// editor can seed a past day's intro from save.items instead.
//
// (2026-08-08: Huy asked for the auto-generated "Hi Kuan — N tasks logged
// today across M categories: ..." count sentence removed entirely - this
// function now returns *only* the Cali/Outside-Cali location breakdown
// below, seeded fresh into the editable #standupSummaryInput textarea at
// Generate time exactly as before, just without that leading sentence.
// `whenLabel` is kept as a parameter purely so every existing call site -
// including the Saved step's Summary editor, which passes "on MM/DD/YYYY"
// for a past day - still works unchanged; it's unused here now that the
// sentence it used to phrase is gone. This also changes "Open in Outlook
// Web" and the Excel "Section 1" sheet, both of which reuse this same
// text - see buildStandupEmailBody's own 2026-08-08 note below for why that
// email change needed a second edit, not just this one.)
function buildStandupSummaryIntroText(items = standupChecklistItems, whenLabel = "today") {
  // Auto-built "Cali Issues"/"Outside Cali Issues" breakdown (2026-08-03
  // request) - same spot Huy was typing this by hand every day. Still just
  // plain text in this editable intro, so it's freely rewritable afterward.
  // Empty string (not the count sentence this used to fall back to) when
  // nothing resolves to a location - per Huy's 2026-08-08 request, this
  // block is now the intro's *only* content, so there's nothing left to
  // fall back to.
  return standupBuildLocationBreakdown(items);
}

// The colored, per-tag itemized breakdown under the intro - not part of the
// editable textarea, always rebuilt fresh from standupChecklistItems (same
// tag colors/order the report used to repeat in separate cards below this
// block, before that duplication was removed), so editing a task's
// text/tag/inclusion in step 1's checklist is reflected here automatically
// without needing to touch the Summary step at all.
// `items` defaults to the live checklist so the existing Step 2 call site
// (with no args) is unaffected - param added (2026-08-06) for the Saved
// step's Summary editor, same reasoning as standupIncludedItemsByTag above.
// 2026-09-14 restructure: each category's items are now nested one level
// deeper, under the specific location they resolved to (reusing
// groupItemsByLocation - the exact same matcher standupBuildLocationBreakdown
// above and the Cali/Outside-Cali Excel sheets already use, so "location" here
// means the same thing everywhere else in this app) - "CATEGORY -> address
// bullet -> hyphen detail", per Huy's requested report format, instead of a
// flat per-tag list of bare bullets with no address anywhere. An item whose
// location never resolved (no catalog match, no manual 📍 override) is not
// given a fabricated address - it's grouped under an explicit "No location on
// file" bullet instead, so the structure stays consistent (every item still
// sits under *a* bullet) without inventing one.
function standupCategoryLocationBlockHtml(items) {
  const { groups, unassigned } = groupItemsByLocation(items);
  const locationBlock = (label, list) => `<div style="margin:8px 0 0 2px;">
        <div style="font-size:13px; font-weight:600; color:#0f172a;">&bull; ${escapeHtml(label)}</div>
        <ul style="margin:2px 0 0 20px; padding:0; list-style:none; font-size:13px; color:#334155; line-height:1.5;">
          ${list.map((i) => `<li>- ${escapeHtml(standupItemDisplayText(i))}</li>`).join("")}
        </ul>
      </div>`;
  return [
    ...groups.map((g) => locationBlock(g.label, g.items)),
    unassigned.length ? locationBlock("No location on file", unassigned) : "",
  ].join("");
}

function buildStandupSummaryDetailSectionsHtml(items = standupChecklistItems) {
  // Grouped by label (standupTagGroups), not raw key (standupAllTags) - see
  // that function's own comment for the duplicate-tag ("two 'Camera'
  // headers") bug this fixes. Flattening every key in the group before
  // deduping means two genuinely different tasks that happen to share a
  // duplicate tag still both show up (under one heading now, not two), while
  // the same task pulled/tagged twice still collapses to one line exactly
  // like before.
  // (2026-08-08) standupTagGroupsAlphabetical(), not standupTagGroups() -
  // Section 1 only, per Huy's request; see that helper's own comment.
  const includedByTag = standupTagGroupsAlphabetical()
    .map((tag) => ({
      tag,
      items: standupReportDedupe(tag.keys.flatMap((key) => standupIncludedItemsByTag(key, items))),
    }))
    .filter((c) => c.items.length);
  return includedByTag
    .map(
      (c) => `<div style="margin-top:16px;">
        <div style="font-weight:700; font-size:13.5px; letter-spacing:.02em; text-transform:uppercase; color:${c.tag.color};">${escapeHtml(c.tag.label)}</div>
        ${standupCategoryLocationBlockHtml(c.items)}
      </div>`
    )
    .join("");
}

// ---- Summary attachments (2026-09-14) --------------------------------------
// Images/files inserted into "Summary for Kuan Goh". Stored on the
// standupSaves/{date} doc itself (summaryAttachments array of {path, name,
// contentType}, written via addStandupAttachmentFn/removeStandupAttachmentFn -
// mirrors addIssueAttachment/removeIssueAttachment in functions/index.js,
// same Storage-path-prefixed-by-id convention) rather than a new store, so
// they round-trip through Save/Load/reload exactly like everything else this
// tab persists - see docs/standup-tab.md. Read back from allStandupSaves (the
// standupSaves onSnapshot listener's own in-memory cache - see
// subscribeToStandupSaves) instead of a second Firestore listener, same
// reasoning as every other Saved-tab-cache reuse in this file.
function standupAttachmentsForDate(dateStr = standupTargetDate()) {
  if (!dateStr) return [];
  const save = allStandupSaves.find((s) => s.id === dateStr);
  return Array.isArray(save?.summaryAttachments) ? save.summaryAttachments : [];
}

// Renders straight into the exported/stored report document (buildStandupReportHtml)
// and the Saved tab's own Summary panel, so it has to stay synchronous - a
// download URL not yet resolved into attachmentUrlCache (see resolveAttachmentUrl
// above) renders a "Loading…" placeholder and kicks off the resolve in the
// background; standupRefreshReportIfGenerated()'s call site re-runs this once
// it lands, same "best-effort, self-heals on next render" pattern Roadmap/
// Issue attachment thumbnails already use.
function standupBuildAttachmentsHtml(dateStr = standupTargetDate()) {
  const atts = standupAttachmentsForDate(dateStr);
  if (!atts.length) return "";
  const tiles = atts.map((a) => {
    const cached = attachmentUrlCache.get(a.path);
    if (!cached) {
      resolveAttachmentUrl(a.path).then((url) => {
        if (url) standupRefreshReportIfGenerated();
      });
      return `<span style="font-size:12px; color:#94a3b8;">Loading "${escapeHtml(a.name)}"…</span>`;
    }
    const isImage = (a.contentType || "").startsWith("image/") || isImageFileName(a.name);
    if (isImage) {
      return `<a href="${cached}" target="_blank" rel="noopener"><img src="${cached}" alt="${escapeHtml(a.name)}" style="max-width:220px; max-height:160px; border-radius:8px; border:1px solid #e2e8f0; object-fit:cover; display:block;" /></a>`;
    }
    return `<a href="${cached}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:6px 10px; border-radius:8px; background:#f1f5f9; border:1px solid #e2e8f0; color:#0f172a; text-decoration:none;">📎 ${escapeHtml(a.name)}</a>`;
  });
  return `<div style="margin-top:16px; padding-top:12px; border-top:1px solid #e2e8f0;">
    <div style="font-weight:700; font-size:13px; color:#0f172a; margin-bottom:8px;">Attachments</div>
    <div style="display:flex; flex-wrap:wrap; gap:10px;">${tiles.join("")}</div>
  </div>`;
}

// The upload widget's own list (in the live edit UI, not the generated
// report) - thumbnails/tags plus a Remove button per attachment. Async, same
// "resolve each path's download URL, then render" shape as
// hydrateIssueAttachments/hydrateRoadmapTimelineAttachments.
async function renderStandupSummaryAttachmentsList() {
  if (!standupSummaryAttachmentsListEl) return;
  const atts = standupAttachmentsForDate();
  if (!atts.length) {
    standupSummaryAttachmentsListEl.innerHTML = "";
    return;
  }
  const entries = await Promise.all(
    atts.map(async (a) => ({ ...a, url: await resolveAttachmentUrl(a.path) }))
  );
  standupSummaryAttachmentsListEl.innerHTML = entries
    .filter((e) => e.url)
    .map((e) => {
      const isImage = (e.contentType || "").startsWith("image/") || isImageFileName(e.name);
      const removeBtn = `<button type="button" class="standup-summary-attachment-remove" data-path="${escapeHtml(e.path)}" title="Remove" style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; line-height:16px; padding:0; border-radius:50%; background:var(--danger); color:#fff; border:1px solid var(--surface); font-size:11px; cursor:pointer;">✕</button>`;
      const thumb = isImage
        ? `<img class="standup-summary-attachment-thumb" src="${e.url}" data-full="${e.url}" alt="${escapeHtml(e.name)}" style="width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid var(--border); cursor:zoom-in; display:block;" />`
        : `<a href="${e.url}" target="_blank" rel="noopener" style="display:flex; align-items:center; gap:5px; font-size:12px; padding:8px 10px; border-radius:8px; background:var(--surface-2); border:1px solid var(--border); color:var(--text); text-decoration:none; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📎 ${escapeHtml(e.name)}</a>`;
      return `<div style="position:relative;">${thumb}${removeBtn}</div>`;
    })
    .join("");
}

const MAX_STANDUP_ATTACHMENT_BYTES = 8 * 1024 * 1024;

// Mirrors uploadIssueFile - the day's standupSaves doc doesn't need to exist
// yet (addStandupAttachment merges it into existence, same as
// addIssueAttachment does for an issue item), so this can run the moment a
// target day is set, well before "Save" is ever pressed.
async function uploadStandupSummaryAttachment(dateStr, file) {
  if (file.size > MAX_STANDUP_ATTACHMENT_BYTES) {
    alert(`"${file.name}" is too large (max 8 MB) - skipped.`);
    return;
  }
  const base64Data = await readFileAsBase64(file);
  await addStandupAttachmentFn({
    date: dateStr,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    base64Data,
  });
}

standupSummaryAttachBtn?.addEventListener("click", () => standupSummaryAttachmentsInputEl?.click());

standupSummaryAttachmentsInputEl?.addEventListener("change", async () => {
  const dateStr = standupTargetDate();
  const files = Array.from(standupSummaryAttachmentsInputEl.files || []);
  if (!dateStr || !files.length) return;
  standupSummaryAttachBtn.disabled = true;
  if (standupSummaryAttachStatusEl) standupSummaryAttachStatusEl.textContent = "Uploading…";
  try {
    for (const file of files) {
      await uploadStandupSummaryAttachment(dateStr, file);
    }
    if (standupSummaryAttachStatusEl) standupSummaryAttachStatusEl.textContent = "";
    // Firestore's own onSnapshot (subscribeToStandupSaves) will update
    // allStandupSaves and re-render the list/report on its own once the
    // write lands - no optimistic update needed here.
  } catch (err) {
    console.error(err);
    if (standupSummaryAttachStatusEl) standupSummaryAttachStatusEl.textContent = "Upload failed: " + (err?.message || "Something went wrong.");
  } finally {
    standupSummaryAttachBtn.disabled = false;
    standupSummaryAttachmentsInputEl.value = "";
  }
});

standupSummaryAttachmentsListEl?.addEventListener("click", (e) => {
  const removeBtn = e.target.closest(".standup-summary-attachment-remove");
  if (removeBtn) {
    const dateStr = standupTargetDate();
    const path = removeBtn.dataset.path;
    if (!dateStr || !path) return;
    removeBtn.disabled = true;
    removeStandupAttachmentFn({ date: dateStr, path }).catch((err) => {
      console.error(err);
      alert("Could not remove attachment: " + (err?.message || "Something went wrong."));
      removeBtn.disabled = false;
    });
    return;
  }
  const thumb = e.target.closest(".standup-summary-attachment-thumb");
  if (thumb && imageLightboxEl && imageLightboxImgEl) {
    imageLightboxImgEl.src = thumb.dataset.full || thumb.src;
    imageLightboxImgEl.alt = thumb.alt || "";
    imageLightboxEl.style.display = "flex";
  }
});

// The editable intro state - seeded fresh from buildStandupSummaryIntroText()
// every time "Generate report" is pressed, then left alone (never silently
// overwritten) once Huy starts editing #standupSummaryInput. This is what
// buildStandupReportHtml() actually renders for the intro line, not the
// auto-generated text directly, so edits flow through to Download/Print/
// Save. The colored per-tag breakdown underneath is separate and always
// live (see buildStandupSummaryDetailSectionsHtml above).
let standupSummaryIntroText = "";

// (2026-08-08) Static (non-interactive) rendering of Section 2 - "1. Pull"
// entries, exactly as pulled/edited - for the exported/stored document
// (Download HTML/PDF, the Save snapshot). The live Report step shows the
// real editable version instead (buildStandupReportEntriesEditorHtml
// below), which obviously can't be baked into a downloaded file. Lists
// every item with text, included or not (a ✓/☐ mark, not filtered down to
// just included ones - "exactly as is" per Huy's request means the whole
// checklist, not just what made it into the breakdown above it), in the
// same fixed tag order used everywhere except Section 1 (see
// standupTagGroupsAlphabetical's own comment for why Section 1 alone is
// alphabetical). Each row carries the .card class so
// generateStandupReportPdf's page-break measurement (see the
// STANDUP_PDF_* boundary logic below) treats it as its own unsplittable
// block, the same "never cut a block mid-page" rule as every other block in
// this report.
function standupReportEntriesStaticHtml(items) {
  const list = (items || []).filter((i) => (i.text || "").trim());
  if (!list.length) {
    return `<div style="font-size:13px; color:#0f172a;">No entries.</div>`;
  }
  const allTags = standupAllTags();
  const sorted = standupSortByTagThenLocation(list, allTags);
  return sorted
    .map((item) => {
      // Keyed off standupPrimaryTag() (2026-08-18), not the raw item.tag -
      // see step 1's own row render for why. The label lists every tag the
      // entry carries (not just the primary one it's grouped under) so this
      // static export still shows the full picture.
      const tags = standupItemTags(item);
      const primary = standupPrimaryTag(item, allTags);
      const tagInfo = allTags.find((t) => t.key === primary) || STANDUP_TAGS.find((t) => t.key === "other");
      const tagLabel = tags
        .map((k) => (allTags.find((t) => t.key === k) || STANDUP_TAGS.find((t) => t.key === "other")).label)
        .join(", ");
      const loc = effectiveEntryLocation(item);
      return `<div class="card" style="page-break-inside:avoid; break-inside:avoid; display:flex; gap:8px; align-items:flex-start; padding:6px 8px; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:4px; font-size:12px;">
        <span>${item.included !== false ? "✓" : "☐"}</span>
        <span style="width:8px; height:8px; border-radius:50%; background:${tagInfo.color}; margin-top:3px; flex-shrink:0;"></span>
        <span style="flex:1;">${escapeHtml(item.text || "")}${loc ? ` <span style="color:#0f172a;">(${escapeHtml(loc)})</span>` : ""}</span>
        <span style="color:#0f172a; white-space:nowrap;">${escapeHtml(tagLabel)}</span>
      </div>`;
    })
    .join("");
}

// `items`/`introText`/`dateStr` all default to the live Step 2 state (no
// args) so the existing standupRefreshReportIfGenerated() call site below is
// unaffected - params added (2026-08-06) so the Saved step's Summary editor
// can rebuild this same document for a past day's save.items + its own
// saved/edited intro text instead of the live checklist.
function buildStandupReportHtml(items = standupChecklistItems, introText = standupSummaryIntroText, dateStr = standupTargetDate()) {
  const mmddyyyy = standupDateOrRangeLabel(dateStr);

  // The per-tag cards used to render here, below the summary block - removed
  // per Huy's request: the boss-summary block below already has its own
  // colored per-tag breakdown (buildStandupSummaryDetailSectionsHtml), which
  // lists every included task grouped and colored exactly like these cards
  // did, so having both meant every task appeared twice in the same report.
  // The summary block is now the report's only content.

  // Intro line renders whatever's currently in introText (the editable state
  // - see the textarea input listener below), plain pre-wrapped text since
  // it's freely rewritable. The per-tag breakdown underneath keeps its
  // colored structure since it's always freshly derived from `items`, never
  // freeform-edited. Attachments (2026-09-14) render inside the same
  // .boss-summary block, after the breakdown - see standupBuildAttachmentsHtml.
  // Class/structure kept exactly as `.boss-summary` (still one atomic,
  // never-split block for generateStandupReportPdf's pagination - see its
  // own comment) - only the internal typography/spacing changed here.
  const summaryHtml = `<div class="boss-summary" style="page-break-inside:avoid; break-inside:avoid; background:#f8fafc; border:1px solid #dbe3ee; border-radius:12px; padding:20px 22px; margin-bottom:26px;">
    <div style="font-weight:700; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#2563eb; margin-bottom:4px;">Summary for Kuan Goh</div>
    <div style="font-size:13.5px; line-height:1.55; color:#1e293b; white-space:pre-wrap;">${escapeHtml(introText || "")}</div>
    ${buildStandupSummaryDetailSectionsHtml(items)}
    ${standupBuildAttachmentsHtml(dateStr)}
  </div>`;

  // (2026-08-08) Section 2 - see standupReportEntriesStaticHtml's own
  // comment for why this is the plain/static rendering, not the live
  // editable one.
  const sectionTwoHtml = `<div style="margin-top:26px;">
    <div style="font-weight:700; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#64748b; margin-bottom:10px;">Section 2 &mdash; Pull entries</div>
    ${standupReportEntriesStaticHtml(items)}
  </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Standup - ${mmddyyyy}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#1e293b; margin: 32px; background:#ffffff; }
  h1 { font-size:21px; font-weight:800; letter-spacing:-.3px; margin:0 0 4px; color:#0f172a; }
  .subtitle { font-size:12.5px; color:#64748b; margin-bottom:22px; padding-bottom:14px; border-bottom:1px solid #e2e8f0; }
</style>
</head>
<body>
  <h1>Standup &mdash; ${mmddyyyy}</h1>
  <div class="subtitle">Huy Nguyen &middot; IT Operations Engineer &middot; Cubework</div>
  ${summaryHtml}
  ${sectionTwoHtml}
</body>
</html>`;
}

// ---- Step 2: Report (+ the "Open in Outlook Web" email action) ------------

let standupReportHtml = null;

// Rebuilds standupReportHtml (and the live iframe preview, if it's showing)
// from whatever's currently in standupChecklistItems/standupSummaryIntroText
// right now - called at the top of every action below (Download HTML/PDF,
// Save, Open in Outlook Web) so all of them always reflect the latest
// checklist edits, not just intro-textarea edits (which already updated
// standupReportHtml live via the input listener below). A no-op before the
// first Generate (standupReportHtml is still null then).
function standupRefreshReportIfGenerated() {
  if (standupReportHtml === null) return;
  standupReportHtml = buildStandupReportHtml();
  const frame = document.getElementById("standupReportFrame");
  if (frame) frame.srcdoc = standupReportHtml;
}

// ---- Step 2 (cont'd): Section 2 - "1. Pull" entries, editable right here --
// (2026-08-08) Huy asked for a second section on the Report step showing
// step 1's checklist entries exactly as pulled - so reviewing the report
// and fixing/adding a detail doesn't require flipping back to step 1. Same
// row shape/behavior as step 1's own checklist (renderStandupChecklist) -
// checkbox/text/tag-select (with "+ New tag…")/📍-location/Remove, "+ Add
// entry" - and every edit mutates the exact same standupChecklistItems
// objects in place (found by item.id), same as step 1's own listeners,
// rather than collecting rows into a rebuilt array the way the Saved tab's
// deferred "Save changes" editor does (buildStandupSaveEntriesEditorHtml) -
// there's no separate save step here since nothing here is a Firestore
// write (that's what the Report step's own "Save" button does, for the
// whole day), so mutating in place is both simpler and safer: it can never
// silently drop a pulled item's other fields (its original request text,
// AI thread summary, etc.) the way rebuilding fresh objects from just the
// visible fields would risk. Kept as its own render function/classes
// (standup-report-edit-*) rather than literally sharing step 1's DOM, both
// to avoid duplicate element ids if both were ever visible in the DOM at
// once and to keep this panel's event delegation distinct from step 1's own
// (standup-task-*) and the Saved tab's (standup-save-edit-*) - same
// reasoning as the comment on standupSaveEditRowHtml. Every edit here also
// calls standupRefreshReportIfGenerated() so Section 1 above reflects it
// immediately, without needing Generate pressed again.
function buildStandupReportEntriesEditorHtml() {
  if (!standupChecklistItems.length) {
    return '<p class="standup-report-entries-empty" style="font-size:13px; color:var(--text);">No entries — pull in step 1, or add one below.</p>';
  }
  // Same tag-then-location sort as step 1's own checklist (2026-08-18:
  // priority-then-alphabetical - see standupSortByTagThenLocation above), so
  // the two stay visually consistent with each other.
  const allTags = standupAllTags();
  const sortedItems = standupSortByTagThenLocation(standupChecklistItems, allTags);
  // 2026-09-11: shares the Pull step's own category filter state (see
  // standupIsTagVisible) rather than a second filter UI - "reasonably...
  // share" per the redesign's filter requirement.
  const visibleItems = sortedItems.filter((item) => standupIsTagVisible(standupPrimaryTag(item, allTags)));
  if (!visibleItems.length) {
    return '<p class="standup-report-entries-empty" style="font-size:13px; color:var(--text);">No entries match the current category filter.</p>';
  }
  return visibleItems.map((item) => standupReportEditRowHtml(item)).join("");
}

function standupReportEditRowHtml(item) {
  const allTags = standupAllTags();
  // Keyed off standupPrimaryTag() (2026-08-18), not the raw item.tag - see
  // step 1's own row render for why.
  const tagInfo = allTags.find((t) => t.key === standupPrimaryTag(item, allTags)) || STANDUP_TAGS.find((t) => t.key === "other");
  // "Transfer to Issue" selection - its own checkbox, separate from
  // "included" above. Defaults to UNCHECKED (2026-08-18 request - Huy must
  // manually pick which entries actually transfer, rather than every
  // included entry pre-selecting itself), then fully independent once he's
  // toggled it either way for a given row.
  if (item.selectedForTransfer === undefined) item.selectedForTransfer = false;
  const alreadyTransferred = !!item.transferredToIssueId;
  const transferCheckboxHtml = alreadyTransferred
    ? `<span class="standup-report-transfer-badge" title="Already sent to Issue this session" style="font-size:11px; color:var(--success-text); font-weight:600; white-space:nowrap;">✓ In Issue</span>`
    : `<label style="display:flex; align-items:center; gap:4px; font-size:11px; color:var(--info-text); white-space:nowrap; cursor:pointer;" title="Send this entry to the Issue tab when Transfer to Issue is clicked">
        <input type="checkbox" class="standup-report-transfer-select" ${item.selectedForTransfer ? "checked" : ""} />→ Issue
      </label>`;
  return `<div class="standup-report-edit-row" data-id="${item.id}" style="padding:8px; border:1px solid var(--border); border-radius:8px; margin-bottom:6px; background:#ffffff;">
    <div style="display:flex; gap:8px; align-items:center;">
      <input type="checkbox" class="standup-report-edit-included" ${item.included ? "checked" : ""} />
      <span style="width:10px; height:10px; border-radius:50%; background:${tagInfo.color}; flex-shrink:0;"></span>
      <input type="text" class="standup-report-edit-text" value="${escapeHtml(item.text)}" style="flex:1; min-width:120px; padding:6px 8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:6px; font-size:13px;" />
      ${standupTagPickerHtml(item, allTags, "standup-report-edit-tag")}
      ${transferCheckboxHtml}
      <button type="button" class="standup-report-edit-remove secondary" style="font-size:12px; padding:4px 8px;">Remove</button>
    </div>
    <div style="display:flex; gap:6px; align-items:center; margin:6px 0 0 26px;">
      <span style="font-size:11px; color:var(--text);">📍</span>
      ${locationInputHtml("standup-report-edit-location", `standup-report-edit-loc-opts-${item.id}`, item.locationOverride)}
    </div>
  </div>`;
}

// Re-renders Section 2 and, since this panel's edits change the same
// standupChecklistItems every other view reads from, refreshes Section 1
// (standupRefreshReportIfGenerated) and re-checks for new location
// candidates too - called after every edit below so nothing here can go
// stale relative to what was just changed.
function standupRefreshReportEntriesEditor() {
  if (standupReportEntriesEditEl) standupReportEntriesEditEl.innerHTML = buildStandupReportEntriesEditorHtml();
  standupRefreshReportIfGenerated();
  renderStandupLocationCandidates();
}

standupReportEntriesEditEl?.addEventListener("input", (e) => {
  const row = e.target.closest(".standup-report-edit-row");
  const item = standupChecklistItems.find((i) => i.id === row?.dataset.id);
  if (!item) return;
  if (e.target.classList.contains("standup-report-edit-text")) {
    item.text = e.target.value;
    standupRefreshReportIfGenerated();
  }
  if (e.target.classList.contains("standup-report-edit-location")) {
    item.locationOverride = e.target.value.trim() || null;
    populateLocationDatalist(row.querySelector("datalist"), e.target.value.trim());
    standupRefreshReportIfGenerated();
  }
});

standupReportEntriesEditEl?.addEventListener("change", (e) => {
  const row = e.target.closest(".standup-report-edit-row");
  const item = standupChecklistItems.find((i) => i.id === row?.dataset.id);
  if (!item) return;
  if (e.target.classList.contains("standup-report-edit-included")) {
    item.included = e.target.checked;
    standupRefreshReportEntriesEditor();
    return;
  }
  if (e.target.classList.contains("standup-report-transfer-select")) {
    item.selectedForTransfer = e.target.checked;
    return; // no re-render needed - nothing else on the page depends on this
  }
  // 2026-08-18: multi-select checkbox tag picker, same as step 1's own
  // checklist - see its change-handler comment. 2026-09-14: same scroll-
  // position capture/restore as step 1's own handler, same reasoning.
  if (e.target.classList.contains("standup-report-edit-tag-option")) {
    const scrollTop = row.querySelector(".standup-report-edit-tag-options")?.scrollTop || 0;
    standupToggleItemTag(item, e.target.value, e.target.checked);
    standupRefreshReportEntriesEditor();
    standupRestoreTagPickerScroll(standupReportEntriesEditEl, "standup-report-edit-row", "standup-report-edit-tag", item.id, scrollTop);
  }
});

standupReportEntriesEditEl?.addEventListener("click", (e) => {
  const addTagBtn = e.target.closest(".standup-report-edit-tag-add");
  if (addTagBtn) {
    const row = addTagBtn.closest(".standup-report-edit-row");
    const item = standupChecklistItems.find((i) => i.id === row?.dataset.id);
    if (item) standupPromptAddTagToItem(item, () => standupRefreshReportEntriesEditor());
    return;
  }
  const removeBtn = e.target.closest(".standup-report-edit-remove");
  if (!removeBtn) return;
  const row = removeBtn.closest(".standup-report-edit-row");
  standupChecklistItems = standupChecklistItems.filter((i) => i.id !== row.dataset.id);
  standupRefreshReportEntriesEditor();
});

standupReportAddEntryBtn?.addEventListener("click", () => {
  standupChecklistItems.push({
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: "",
    tag: "other",
    tags: ["other"],
    included: true,
    locationOverride: null,
  });
  if (standupReportEntriesEditEl) standupReportEntriesEditEl.innerHTML = buildStandupReportEntriesEditorHtml();
  const textInputs = standupReportEntriesEditEl?.querySelectorAll(".standup-report-edit-text");
  textInputs?.[textInputs.length - 1]?.focus();
});

// ---- "Transfer to Issue" bridge (2026-08-10) ----------------------------
// Sends selected Section 2 entries to the Issue tab via the real
// addIssueItem callable. See docs/standup-tab.md's "Transfer to Issue"
// bullet for the full write-up.

// item.id -> "cali" | "outsideCali" | "skip" for entries with no
// catalog-matched location - session-only, same as transferredToIssueId.
let standupTransferManualRegion = new Map();

// Auto region resolution via the same location-catalog lookup the Summary
// breakdown uses. Returns null (never a guess) on no match.
function standupAutoIssueLocation(item) {
  const label = effectiveEntryLocation(item);
  if (!label) return null;
  const entry = STANDUP_LOCATION_INDEX.find((e) => e.label === label);
  if (!entry || !entry.state) return null;
  return { location: label, state: entry.state, region: issueRegionForState(entry.state) };
}

// Entries with their own "→ Issue" checkbox on (not "included"), not yet
// transferred, with real text.
function standupEntriesSelectedForTransfer() {
  return standupChecklistItems.filter((i) => i.selectedForTransfer && !i.transferredToIssueId && (i.text || "").trim());
}

standupTransferSelectAllBtn?.addEventListener("click", () => {
  standupChecklistItems.forEach((i) => {
    if (!i.transferredToIssueId) i.selectedForTransfer = true;
  });
  standupRefreshReportEntriesEditor();
});

standupTransferSelectNoneBtn?.addEventListener("click", () => {
  standupChecklistItems.forEach((i) => {
    i.selectedForTransfer = false;
  });
  standupRefreshReportEntriesEditor();
});

// Title = raw entry text (not the AI-summarized display text). Description
// = existing AI summary, if any. Tag carries over as-is, whatever it is -
// before the 2026-08-10 shared-tag-catalog unification, a custom Standup
// tag had no Issue-side equivalent (its "custom:<id>" key only meant
// something in Standup's own now-retired catalog) so this used to drop
// anything but the 8 fixed tags to null; now that all three tabs read the
// same catalog, any tag - fixed or custom - resolves the same way on the
// Issue side too.
function standupBuildIssuePayload(item, autoLocation, manualRegion) {
  const title = (item.text || "").trim();
  const notes = item.threadSummary || item.aiReportSummary || "";
  const tag = item.tag || null;
  let location = item.locationOverride || "";
  let state = "";
  if (autoLocation) {
    location = autoLocation.location;
    state = autoLocation.state;
  } else if (manualRegion === "cali") {
    state = "CA";
  } else if (manualRegion === "outsideCali") {
    state = "OTHER"; // mirrors the New tab's own catch-all state
  }
  return { title, ticket: "", location, region: state ? issueRegionForState(state) : "outsideCali", state, tag, notes };
}

// Splits a selection into resolved (payload ready) / unresolved (needs a
// decision) / skipped.
function standupCategorizeForTransfer(selected) {
  const resolved = [];
  const unresolved = [];
  let skipped = 0;
  selected.forEach((item) => {
    const auto = standupAutoIssueLocation(item);
    if (auto) {
      resolved.push({ item, payload: standupBuildIssuePayload(item, auto, null) });
      return;
    }
    const manual = standupTransferManualRegion.get(item.id);
    if (manual === "skip") {
      skipped++;
      return;
    }
    if (manual === "cali" || manual === "outsideCali") {
      resolved.push({ item, payload: standupBuildIssuePayload(item, null, manual) });
      return;
    }
    unresolved.push(item);
  });
  return { resolved, unresolved, skipped };
}

// Sends one payload per resolved item to addIssueItem, sequentially, each
// in its own try/catch so one failure can't sink the batch.
async function standupRunIssueTransfer(resolved) {
  let sent = 0;
  let cali = 0;
  let outsideCali = 0;
  const failures = [];
  for (let i = 0; i < resolved.length; i++) {
    const { item, payload } = resolved[i];
    if (standupTransferToIssueStatusEl) standupTransferToIssueStatusEl.textContent = `Transferring… (${i + 1}/${resolved.length})`;
    try {
      const res = await addIssueItemFn(payload);
      item.transferredToIssueId = res?.data?.id || true;
      item.selectedForTransfer = false;
      standupTransferManualRegion.delete(item.id);
      sent++;
      if (res?.data?.region === "cali") cali++;
      else outsideCali++;
    } catch (err) {
      console.error(err);
      const shortTitle = payload.title.length > 40 ? `${payload.title.slice(0, 40)}…` : payload.title;
      failures.push(`"${shortTitle}": ${err?.message || "failed"}`);
    }
  }
  standupRefreshReportEntriesEditor();
  const parts = [`Transferred ${sent} of ${resolved.length} to Issue`];
  if (sent) parts.push(`(${cali} → Cali, ${outsideCali} → Outside Cali)`);
  if (failures.length) parts.push(`— ${failures.length} failed: ${failures.join("; ")}`);
  if (standupTransferToIssueStatusEl) standupTransferToIssueStatusEl.textContent = parts.join(" ");
}

// California/Outside California/Skip prompt for entries with no
// auto-resolved location - same "ask before guessing" shape as
// renderStandupLocationCandidates() above.
function renderStandupTransferLocationPrompt(unresolvedItems) {
  if (!standupTransferLocationPromptEl) return;
  if (!unresolvedItems.length) {
    standupTransferLocationPromptEl.style.display = "none";
    standupTransferLocationPromptEl.innerHTML = "";
    return;
  }
  standupTransferLocationPromptEl.style.display = "block";
  standupTransferLocationPromptEl.innerHTML = `
    <div style="font-size:13px; font-weight:600; color:var(--warning); margin-bottom:8px;">${unresolvedItems.length} selected entr${
    unresolvedItems.length === 1 ? "y has" : "ies have"
  } no matched location — pick where each goes, edit its 📍 field below and try again, or skip it for this transfer:</div>
    ${unresolvedItems
      .map((item) => {
        const label = escapeHtml((item.text || "(no text)").slice(0, 70));
        const overrideNote = item.locationOverride
          ? ` <span style="color:var(--warning);">(📍 ${escapeHtml(item.locationOverride)} — not in catalog)</span>`
          : "";
        return `<div class="standup-transfer-unresolved-row" data-id="${item.id}" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:6px 0; border-top:1px solid var(--warning-border);">
          <span style="flex:1; min-width:160px; font-size:12px; color:#78350f;">${label}${overrideNote}</span>
          <button type="button" class="standup-transfer-region-btn secondary" data-region="cali" style="font-size:12px; padding:4px 10px;">California</button>
          <button type="button" class="standup-transfer-region-btn secondary" data-region="outsideCali" style="font-size:12px; padding:4px 10px;">Outside California</button>
          <button type="button" class="standup-transfer-region-btn secondary" data-region="skip" style="font-size:12px; padding:4px 10px;">Skip</button>
        </div>`;
      })
      .join("")}
    <div style="margin-top:10px;">
      <button type="button" id="standupTransferContinueBtn" style="font-size:13px; padding:6px 12px;">Continue transfer</button>
      <span style="font-size:11px; color:var(--warning); margin-left:8px;">Anything left undecided below is skipped, never guessed.</span>
    </div>`;
}

standupTransferLocationPromptEl?.addEventListener("click", (e) => {
  const regionBtn = e.target.closest(".standup-transfer-region-btn");
  if (regionBtn) {
    const row = regionBtn.closest(".standup-transfer-unresolved-row");
    standupTransferManualRegion.set(row.dataset.id, regionBtn.dataset.region);
    row.querySelectorAll("button").forEach((b) => (b.disabled = true));
    row.style.opacity = "0.6";
    const decided = document.createElement("span");
    decided.style.cssText = "font-size:11px; color:var(--success-text); font-weight:600;";
    decided.textContent =
      regionBtn.dataset.region === "cali" ? "✓ California" : regionBtn.dataset.region === "outsideCali" ? "✓ Outside California" : "✓ Skipped";
    row.appendChild(decided);
    return;
  }
  if (e.target.closest("#standupTransferContinueBtn")) standupBeginIssueTransfer();
});

// Entry point for "Transfer to Issue →" (after its confirm) and "Continue
// transfer". Re-categorizes fresh each run so a 📍 edit between clicks is
// picked up.
function standupBeginIssueTransfer() {
  const selected = standupEntriesSelectedForTransfer();
  if (!selected.length) {
    renderStandupTransferLocationPrompt([]);
    if (standupTransferToIssueStatusEl) standupTransferToIssueStatusEl.textContent = 'Nothing selected to transfer — check a row\'s "→ Issue" box first.';
    return;
  }
  const { resolved, unresolved } = standupCategorizeForTransfer(selected);
  renderStandupTransferLocationPrompt(unresolved);
  if (unresolved.length) {
    if (standupTransferToIssueStatusEl) {
      standupTransferToIssueStatusEl.textContent = `${unresolved.length} entr${
        unresolved.length === 1 ? "y needs" : "ies need"
      } a location decision above before they can transfer — everything else will send once you hit "Continue transfer".`;
    }
    return;
  }
  if (!resolved.length) {
    if (standupTransferToIssueStatusEl) standupTransferToIssueStatusEl.textContent = "Nothing left to transfer — every selected entry was skipped.";
    return;
  }
  standupTransferToIssueBtn.disabled = true;
  standupRunIssueTransfer(resolved).finally(() => {
    standupTransferToIssueBtn.disabled = false;
  });
}

standupTransferToIssueBtn?.addEventListener("click", () => {
  const selected = standupEntriesSelectedForTransfer();
  if (!selected.length) {
    if (standupTransferToIssueStatusEl) standupTransferToIssueStatusEl.textContent = 'Nothing selected to transfer — check a row\'s "→ Issue" box first.';
    return;
  }
  const { resolved, unresolved, skipped } = standupCategorizeForTransfer(selected);
  const caliCount = resolved.filter((r) => r.payload.region === "cali").length;
  const outsideCount = resolved.filter((r) => r.payload.region === "outsideCali").length;
  const parts = [`Transfer ${selected.length} entr${selected.length === 1 ? "y" : "ies"} to Issue?`];
  if (caliCount) parts.push(`${caliCount} → Cali`);
  if (outsideCount) parts.push(`${outsideCount} → Outside Cali`);
  if (unresolved.length) parts.push(`${unresolved.length} need a location decision first`);
  if (skipped) parts.push(`${skipped} already marked Skip`);
  parts.push("This creates new Issue items; it does not remove or change anything in Standup.");
  if (!confirm(parts.join(" "))) return;
  standupBeginIssueTransfer();
});

// "Ask before adding" prompt (2026-08-03 request) - one row per
// standupLocationCandidates() entry, each with a California/Outside
// California button (writes to the standupLocationCatalog collection via
// addStandupLocationFn, so future reports recognize it automatically - see
// standupRebuildLocationIndex) and a "Not a location" button that just
// dismisses the row for this session without persisting anything. Recomputed
// fresh every time Generate report runs, same as the location breakdown
// itself in the intro.
function renderStandupLocationCandidates() {
  if (!standupLocationCandidatesEl) return;
  const candidates = standupLocationCandidates();
  if (!candidates.length) {
    standupLocationCandidatesEl.style.display = "none";
    standupLocationCandidatesEl.innerHTML = "";
    return;
  }
  standupLocationCandidatesEl.style.display = "block";
  standupLocationCandidatesEl.innerHTML = `
    <div style="font-size:12px; color:var(--warning); margin-bottom:6px;">These look like they mention a location that's not in the catalog yet - edit the box down to just the clean address (not the whole ticket subject - see the field below), then add it so future reports catch it automatically, or mark it as not a location:</div>
    ${candidates
      .map(
        (item) => `<div class="standup-location-candidate-row" data-item-id="${item.id}" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:6px 8px; border:1px solid var(--warning-border); border-radius:6px; margin-bottom:6px; background:var(--warning-bg);">
        <span style="font-size:11px; color:var(--warning); width:100%;">${escapeHtml(item.text)}</span>
        <input type="text" class="standup-location-label-input" value="${escapeHtml(item.text)}" placeholder="Clean address, e.g. 218 Machlin Ct, Walnut, CA 91789" style="flex:1; min-width:200px; padding:4px 6px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:6px; font-size:12px;" />
        <button type="button" class="standup-location-add-btn secondary" data-state="CA" style="font-size:11px; padding:3px 8px;">+ California</button>
        <button type="button" class="standup-location-add-btn secondary" data-state="OTHER" style="font-size:11px; padding:3px 8px;">+ Outside CA</button>
        <button type="button" class="standup-location-skip-btn secondary" style="font-size:11px; padding:3px 8px;">Not a location</button>
      </div>`
      )
      .join("")}
  `;
}

standupLocationCandidatesEl?.addEventListener("click", (e) => {
  const row = e.target.closest(".standup-location-candidate-row");
  if (!row) return;
  const item = standupChecklistItems.find((i) => i.id === row.dataset.itemId);
  if (!item) return;

  if (e.target.closest(".standup-location-skip-btn")) {
    row.remove();
    return;
  }
  const addBtn = e.target.closest(".standup-location-add-btn");
  if (!addBtn) return;
  const state = addBtn.dataset.state;
  // The editable label input (defaults to the raw ticket text, but Huy is
  // meant to trim it down to just the clean address first) - falls back to
  // item.text only if the input somehow isn't there. Using the raw subject
  // verbatim as a "location" is exactly what caused entries like "Re:
  // Sugarland Cameras [ITS-12199]" to self-match as their own heading once
  // per-location grouping shipped (2026-08-05) - this is what prevents that
  // going forward.
  const labelInput = row.querySelector(".standup-location-label-input");
  const label = (labelInput?.value || item.text || "").trim();
  if (!label) return;
  row.querySelectorAll("button, input").forEach((el) => (el.disabled = true));
  addStandupLocationFn({ label, state })
    .then(() => {
      // Reflected locally right away rather than waiting on the
      // standupLocationCatalog onSnapshot round-trip, so the item is
      // recognized immediately below without a timing gap.
      allStandupCustomLocations.push({ label, state });
      standupRebuildLocationIndex();
      row.remove();
      // (2026-08-15, sixth pass) No longer re-seeds standupSummaryIntroText
      // here - the Report step's Cali Issues/Outside Cali Issues intro is
      // sourced from the Issue tab's Active issues now, not this Standup
      // location catalog, so adding an entry to it has no effect on that
      // text anymore. standupRefreshReportIfGenerated() below still picks up
      // the new catalog entry wherever else it matters (e.g. each
      // checklist/Section-2 row's own 📍 location override options).
      standupRefreshReportIfGenerated();
    })
    .catch((err) => {
      console.error(err);
      row.querySelectorAll("button, input").forEach((el) => (el.disabled = false));
      alert("Could not add: " + (err?.message || "Something went wrong."));
    });
});

// Collapsed cleanup list (2026-08-05) for the runtime-growable part of the
// address catalog (allStandupCustomLocations) - lets Huy delete a bad entry
// outright, e.g. one where the earlier "ask before adding" flow saved a raw
// ticket subject as a "location" instead of a real address (see
// deleteStandupLocation in functions/index.js). Re-rendered every time
// allStandupCustomLocations changes (see subscribeToStandupLocationCatalog),
// same live-list treatment as everything else backed by an onSnapshot.
// window.CUBEWORK_LOCATIONS entries aren't shown here - that file is static
// and can only change via a code deploy, so there's nothing to delete.
function renderStandupLocationCatalogList() {
  if (!standupLocationCatalogListEl) return;
  if (!allStandupCustomLocations.length) {
    standupLocationCatalogListEl.innerHTML = '<p style="font-size:12px; color:var(--text);">No manually-added locations yet.</p>';
    return;
  }
  standupLocationCatalogListEl.innerHTML = allStandupCustomLocations
    .slice()
    .sort((a, b) => (a.label || "").localeCompare(b.label || ""))
    .map(
      (loc) => `<div class="standup-location-catalog-row" data-id="${loc.id || ""}" style="display:flex; gap:8px; align-items:center; padding:4px 6px; border-bottom:1px solid var(--hover-bg);">
        <span style="font-size:12px; color:var(--text); flex:1;">${escapeHtml(loc.label || "")}</span>
        <span style="font-size:11px; color:var(--text);">${escapeHtml(loc.state || "")}</span>
        <button type="button" class="standup-location-catalog-delete secondary" style="font-size:11px; padding:3px 8px; color:var(--danger-light); border-color:var(--danger-border);" ${loc.id ? "" : "disabled"}>Delete</button>
      </div>`
    )
    .join("");
}

standupLocationCatalogListEl?.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest(".standup-location-catalog-delete");
  if (!deleteBtn) return;
  const row = deleteBtn.closest(".standup-location-catalog-row");
  const id = row?.dataset.id;
  if (!id) return;
  if (!confirm("Remove this location from the catalog? This can't be undone.")) return;
  deleteBtn.disabled = true;
  deleteBtn.textContent = "Deleting…";
  deleteStandupLocationFn({ id })
    .then(() => {
      // subscribeToStandupLocationCatalog's onSnapshot listener re-renders
      // this list (and rebuilds STANDUP_LOCATION_INDEX) the moment the
      // delete actually lands - nothing else to do on success here.
    })
    .catch((err) => {
      console.error(err);
      alert("Could not delete: " + (err?.message || "Something went wrong."));
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete";
    });
});

// Before building the report itself, ask summarizeStandupReportEntriesFn to
// summarize each included task's *original* conversation content (2026-08-06
// experiment - "let's see how this turns out") - one batched network call,
// not one per task. Mutates each item in place (item.aiReportSummary),
// which is exactly what standupItemDisplayText above reads, and since
// standupIncludedItems()/standupIncludedItemsByTag() return references into
// standupChecklistItems (not copies), every other reader of those items
// picks the summary up automatically without any extra plumbing. Fails
// closed like summarizeStandupEntries always has: a thrown/rejected call
// just leaves aiReportSummary as whatever it already was (null on a first
// Generate), so the report falls back to each task's raw text exactly like
// before this existed - Generate itself is never blocked by this failing.
//
// (2026-08-09: skips items that already have a threadSummary - see the
// "Pull with Summary" doc section - since that's already a full-thread
// summary (request + action taken + outcome), strictly richer than this
// original-request-only call would produce; standupItemDisplayText already
// prefers threadSummary over aiReportSummary, so calling this for those
// items would just be a wasted AI call whose result never gets read. Also
// now sends `ownReply` - the task's own sent body, i.e. what Huy actually
// wrote - alongside the original request, so the summary can say what was
// done/is still pending, not just restate the request; see
// summarizeStandupEntries' own prompt in functions/index.js.
//
// (2026-08-09, same-day follow-up: also sends `requesterName` -
// standupRequesterName(item)'s already-resolved name, real Graph sender
// metadata, not something the model is asked to find - so the summary can
// name the requester naturally as part of its own sentence, per Huy's
// request, instead of standupItemDisplayText prepending "Name: " onto the
// result afterward.)
async function standupSummarizeIncludedItemsForReport() {
  const items = standupIncludedItems().filter((item) => !item.threadSummary);
  if (!items.length) return;
  const entries = items.map((item) => ({
    // Load-bearing, not just a label: this is what lets
    // summarizeStandupEntries (functions/index.js) match the model's
    // response back to the right entry even if the model reorders/drops/
    // merges entries in its own output - see that function's comment for
    // the real bug this fixes (a plain array-position zip was silently
    // attaching one ticket's summary to a completely different ticket).
    id: item.id,
    subject: item.text,
    // The thread's actual original request when there is one (see
    // fetchConversationRootMessage in functions/index.js) - falls back to
    // this task's own body for the (probably self-started) threads that
    // don't have one, same fallback order the "View request" toggle in
    // step 1's checklist already uses.
    text: item.initial?.fullBody || item.initial?.bodyPreview || item.fullBody || "",
    // Huy's own sent message for this task - what he actually wrote in
    // response, which is where "what was done" lives if it's anywhere.
    // Left empty when there's no `initial` (a self-started thread), since
    // `text` above already IS this same body in that case - sending it
    // twice would just waste prompt space without adding information.
    ownReply: item.initial ? item.fullBody || "" : "",
    requesterName: standupRequesterName(item) || "",
  }));
  try {
    const { data } = await summarizeStandupReportEntriesFn({ entries });
    const summaries = Array.isArray(data?.summaries) ? data.summaries : [];
    // The client<->server hop here is positionally safe on its own (the
    // server just maps over the exact `entries` it received, in order,
    // and summarizeStandupEntries' return already reconciled the risky
    // hop - the model's own response - by id internally). This zip is
    // NOT where the id-based fix lives; it's already covered.
    items.forEach((item, i) => {
      item.aiReportSummary = typeof summaries[i] === "string" && summaries[i].trim() ? summaries[i].trim() : null;
    });
  } catch (err) {
    console.error("summarizeStandupReportEntries failed:", err);
    // Leave every item's aiReportSummary untouched - see the fail-closed
    // note above.
  }
}

standupGenerateReportBtn?.addEventListener("click", async () => {
  if (!standupHasIncludedItems()) {
    if (standupReportStatusEl) {
      standupReportStatusEl.textContent = "Nothing to report — check off or add at least one task in step 1's checklist first.";
    }
    return;
  }
  standupGenerateReportBtn.disabled = true;
  const originalGenerateBtnText = standupGenerateReportBtn.textContent;
  standupGenerateReportBtn.textContent = "Summarizing…";
  if (standupReportStatusEl) standupReportStatusEl.textContent = "Summarizing original requests…";
  await standupSummarizeIncludedItemsForReport();

  // Cali Issues/Outside Cali Issues (2026-08-15, sixth pass) - pulled fresh
  // from the Issue tab's own Active issues per region, NOT today's Standup
  // pull (see fetchActiveIssueItemsFresh's own comment above, next to
  // effectiveIssueStatus). Kuan's colored per-tag breakdown just below this
  // intro (buildStandupSummaryDetailSectionsHtml, called inside
  // buildStandupReportHtml) is unrelated and untouched - still today's
  // checklist items only, same as Section 2 further down.
  if (standupReportStatusEl) standupReportStatusEl.textContent = "Summarizing original requests… pulling Issue tab…";
  const freshIssueItems = await fetchActiveIssueItemsFresh();
  const caliActiveIssues = activeIssueItemsForRegion(freshIssueItems, "cali");
  const outsideCaliActiveIssues = activeIssueItemsForRegion(freshIssueItems, "outsideCali");

  standupGenerateReportBtn.disabled = false;
  standupGenerateReportBtn.textContent = originalGenerateBtnText;

  // Fresh seed every time Generate is pressed - matches "regenerated fresh
  // each time" for everything else in this report, even though the intro
  // becomes freely editable immediately afterward via #standupSummaryInput.
  standupSummaryIntroText = buildIssueCaliIssuesIntroText(caliActiveIssues, outsideCaliActiveIssues);
  renderStandupLocationCandidates();
  standupReportHtml = buildStandupReportHtml();
  if (standupReportPreviewEl) {
    // srcdoc'd iframe so the report's own <style> block can't leak into (or
    // get overridden by) the dashboard's own page styles.
    standupReportPreviewEl.innerHTML =
      '<iframe id="standupReportFrame" style="width:100%; height:600px; border:1px solid var(--border); border-radius:8px; background:var(--surface-2);"></iframe>';
    document.getElementById("standupReportFrame").srcdoc = standupReportHtml;
  }
  if (standupSummaryEditWrapEl) standupSummaryEditWrapEl.style.display = "block";
  if (standupSummaryInputEl) standupSummaryInputEl.value = standupSummaryIntroText;
  renderStandupSummaryAttachmentsList();
  if (standupDownloadHtmlBtn) standupDownloadHtmlBtn.style.display = "";
  if (standupDownloadPdfBtn) standupDownloadPdfBtn.style.display = "";
  if (standupExportExcelBtn) standupExportExcelBtn.style.display = "";
  if (standupSaveBtn) standupSaveBtn.style.display = "";
  // (2026-08-08) Section 2 - shown/populated the same way as the other
  // action buttons above, hidden until Generate has run once.
  if (standupReportEntriesEditEl) standupReportEntriesEditEl.innerHTML = buildStandupReportEntriesEditorHtml();
  if (standupReportSection2WrapEl) standupReportSection2WrapEl.style.display = "block";
  // (2026-08-15, sixth pass) No more href to prime here - the button below
  // now sends via Graph directly instead of opening a deeplink, so just
  // reveal it; see standupEmailOpenBtn's click handler for why.
  if (standupEmailOpenLinkEl) standupEmailOpenLinkEl.style.display = "";
  if (standupReportStatusEl) standupReportStatusEl.textContent = `Ready: ${standupReportFilename()}.html`;
});

// Every edit rebuilds standupReportHtml and refreshes the live iframe
// preview immediately, so Download/Print/Save always reflect whatever's
// currently in the textarea, not the auto-generated starting point. Only
// the intro line is affected - the colored breakdown below it is rebuilt
// fresh from the checklist every time regardless (see buildStandupReportHtml).
standupSummaryInputEl?.addEventListener("input", () => {
  standupSummaryIntroText = standupSummaryInputEl.value;
  standupRefreshReportIfGenerated();
});

standupDownloadHtmlBtn?.addEventListener("click", () => {
  standupRefreshReportIfGenerated();
  if (!standupReportHtml) return;
  const blob = new Blob([standupReportHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${standupReportFilename()}.html`;
  a.click();
  URL.revokeObjectURL(url);
});

// One-click "Download PDF" via html2canvas + jsPDF (same libraries as the
// Roadmap Timeline export in index.html), replacing the earlier
// Print/Save-as-PDF flow per Huy's 2026-08-04 request - no print dialog, no
// pop-up. Tradeoff (flagged and accepted): this is a rasterized image PDF,
// not real vector/selectable text, and the report's own
// page-break-inside:avoid/break-after:avoid CSS means nothing to a
// screenshot - so this reimplements "never split a card or a tag-header
// from its content" itself, by measuring each block's actual pixel position
// (offscreen, in the main document - html2canvas can't reach into the
// srcdoc iframe used for the live preview) and only cutting a new page
// between blocks, never through one. Unlike a real print, each output page
// is sized to its own content height rather than a fixed Letter/A4 size -
// same convention the Roadmap Timeline export already uses.
const STANDUP_PDF_RENDER_WIDTH = 800; // CSS px - a comfortable column width
const STANDUP_PDF_PAGE_HEIGHT = 1000; // CSS px per page, before the scale factor
const STANDUP_PDF_SCALE = 2; // matches the Roadmap Timeline export's scale for crisp text

async function generateStandupReportPdf() {
  if (!standupReportHtml) return null;
  await ensureHtml2Canvas();
  await ensureJsPDF();

  // Renders into the main document (not the srcdoc iframe) since html2canvas
  // can't capture into a nested document - positioned far off-screen rather
  // than display:none so layout/measurement still happens normally. Only
  // <body>'s contents are used; the <style> block in standupReportHtml
  // exists for the Print/Download-HTML paths and isn't needed here since
  // every element's visual formatting is already inline.
  const container = document.createElement("div");
  container.style.cssText = `position:absolute; left:-10000px; top:0; width:${STANDUP_PDF_RENDER_WIDTH}px; background:#ffffff;`;
  container.innerHTML = new DOMParser().parseFromString(standupReportHtml, "text/html").body.innerHTML;
  document.body.appendChild(container);

  try {
    // Every .boss-summary/.tag-header/.card is an atomic block that must
    // never be split across a page - mirrors the Print path's page-break
    // rules, just computed from measured pixel positions since html2canvas
    // has no concept of CSS pagination. offsetTop is relative to `container`
    // itself (the nearest positioned ancestor of all of these), matching
    // the coordinate space html2canvas captures from. (2026-08-08: ".card"
    // added back - Section 2's static entry rows, see
    // standupReportEntriesStaticHtml, carry this class specifically so they
    // get the same protection; there's no .tag-header anymore since the
    // per-tag cards this comment originally described were removed.)
    const boundaries = Array.from(container.querySelectorAll(".boss-summary, .card")).map((el) => ({
      top: el.offsetTop,
      bottom: el.offsetTop + el.offsetHeight,
    }));

    const canvas = await html2canvas(container, { backgroundColor: "#ffffff", scale: STANDUP_PDF_SCALE });
    const contentHeightPx = canvas.height / STANDUP_PDF_SCALE;

    // Walk the measured blocks, cutting a new page whenever the next block
    // would push past STANDUP_PDF_PAGE_HEIGHT - always at the *start* of
    // that block (never mid-block).
    const pageBreaksPx = [];
    let pageStart = 0;
    for (const b of boundaries) {
      if (b.bottom - pageStart > STANDUP_PDF_PAGE_HEIGHT && b.top > pageStart) {
        pageBreaksPx.push(b.top);
        pageStart = b.top;
      }
    }
    const cutPoints = [0, ...pageBreaksPx, contentHeightPx];

    const { jsPDF } = window.jspdf;
    let pdf = null;
    for (let i = 0; i < cutPoints.length - 1; i++) {
      const startPx = cutPoints[i];
      const sliceHeightPx = cutPoints[i + 1] - startPx;
      if (sliceHeightPx <= 0) continue;

      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.round(sliceHeightPx * STANDUP_PDF_SCALE);
      const ctx = sliceCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        Math.round(startPx * STANDUP_PDF_SCALE),
        canvas.width,
        sliceCanvas.height,
        0,
        0,
        canvas.width,
        sliceCanvas.height
      );

      const imgData = sliceCanvas.toDataURL("image/png");
      if (!pdf) {
        pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [sliceCanvas.width, sliceCanvas.height] });
      } else {
        pdf.addPage([sliceCanvas.width, sliceCanvas.height]);
      }
      pdf.addImage(imgData, "PNG", 0, 0, sliceCanvas.width, sliceCanvas.height);
    }
    return pdf;
  } finally {
    document.body.removeChild(container);
  }
}

standupDownloadPdfBtn?.addEventListener("click", async () => {
  standupRefreshReportIfGenerated();
  if (!standupReportHtml) return;
  standupDownloadPdfBtn.disabled = true;
  const originalText = standupDownloadPdfBtn.textContent;
  standupDownloadPdfBtn.textContent = "Generating…";
  try {
    const pdf = await generateStandupReportPdf();
    if (pdf) pdf.save(`${standupReportFilename()}.pdf`);
  } catch (err) {
    console.error(err);
    if (standupReportStatusEl) standupReportStatusEl.textContent = err?.message || "PDF generation failed.";
  } finally {
    standupDownloadPdfBtn.disabled = false;
    standupDownloadPdfBtn.textContent = originalText;
  }
});

// ---- Excel export (Step 2 "Export to Excel" + Step 3's per-day export) ----
// Mirrors the Roadmap tab's export conventions (see exportRoadmapListToExcel
// above): same bare XLSX global from the cdnjs script tag in index.html, same
// "no cell styles in the free SheetJS build, so lean on !cols/!rows/!merges"
// approach, same per-calendar-day version-stamped filename via localStorage
// so re-exporting the same day never silently overwrites a prior file.
//
// (2026-08-08) Restructured to 5 fixed sheets, replacing the earlier
// "Overview + one sheet per tag" layout, per Huy's request: Section 1
// (Summary for Kuan Goh, as text - same alphabetical tag order as the live
// Section 1, see standupTagGroupsAlphabetical), Section 2 (every pulled
// entry, included or not - "exactly as is," mirroring the live Section 2
// editor above), Cali, Outside Cali (same groupItemsByLocation buckets the
// live Summary breakdown uses), and Categories (alphabetical, with counts -
// the old Overview sheet's Category/Tasks columns, renamed/moved/resorted).

// Excel sheet names can't contain \ / ? * [ ] : and are capped at 31 chars -
// "Critical/Urgent" (STANDUP_TAGS' own label) would otherwise silently break
// XLSX.utils.book_append_sheet.
function standupExcelSheetName(label) {
  return label.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
}

function nextStandupExportFileTag(dateStr) {
  const storageKey = "standupExportCount_" + dateStr;
  const count = parseInt(localStorage.getItem(storageKey) || "0", 10) + 1;
  localStorage.setItem(storageKey, String(count));
  return `V1.${count - 1}`;
}

// Builds one sheet's worth of rows for a list of location groups (as
// returned by groupItemsByLocation) - shared by the Cali/Outside Cali
// sheets below, which differ only in which groups they're given.
function standupLocationSheetRows(groups) {
  return groups.flatMap((g) => g.items.map((i) => ({ Location: g.label, Task: standupItemDisplayText(i) })));
}

function standupApplyTaskColumnSizing(ws, rows, taskKey) {
  ws["!rows"] = [{ hpt: 18 }, ...rows.map((row) => ({ hpt: Math.max(1, String(row[taskKey] || "").split("\n").length) * 15 }))];
}

// items is any array shaped like standupChecklistItems/save.items - both
// carry the same { text, tag, included } shape (see saveStandupReport's
// sanitizedItems in functions/index.js), so this works identically whether
// called from the live Step 2 checklist or a historical Step 3 snapshot.
// `introText` defaults to a freshly generated one if not passed - the live
// Report step's own call site passes the current (possibly hand-edited)
// standupSummaryIntroText instead, same "reflect whatever's actually being
// shown" principle as everything else in this step.
async function buildStandupExcelWorkbook(dateStr, items, introText) {
  await ensureXLSX();
  const allItems = items || [];
  if (!allItems.some((i) => (i.text || "").trim())) {
    alert("Nothing to export yet.");
    return null;
  }
  const mmddyyyy = standupDateToMMDDYYYY(dateStr);
  const resolvedIntroText = typeof introText === "string" && introText ? introText : buildStandupSummaryIntroText(allItems, "today");

  // Same post-summary dedup as the HTML report (standupReportDedupe) - a
  // live-checklist export can hit the same "two different subjects, same
  // AI summary" duplicate the report does; a Saved-day export just never
  // has aiReportSummary set (not persisted - see saveCurrentStandupSnapshot),
  // so this is a no-op there and falls back to plain raw-text dedup. Grouped
  // by standupTagGroupsAlphabetical (2026-08-18: priority-then-alphabetical,
  // despite the name kept for its existing call sites - see its own
  // comment), same as the live Summary block. Membership is keyed off
  // standupPrimaryTag (2026-08-18), not a raw i.tag === key check, since an
  // entry can now carry more than one tag but must still land in exactly one
  // section here too.
  const alphaByTag = standupTagGroupsAlphabetical()
    .map((tag) => ({
      tag,
      items: dedupeStandupItemsByText(
        tag.keys.flatMap((key) => allItems.filter((i) => i.included !== false && standupPrimaryTag(i) === key && (i.text || "").trim())),
        standupItemDisplayText
      ),
    }))
    .filter((c) => c.items.length);

  const wb = XLSX.utils.book_new();

  // ---- Sheet 1: Section 1 (Summary for Kuan Goh, as text) ----
  const section1Aoa = [
    [`Summary for Kuan Goh — ${mmddyyyy}`],
    [],
    ...resolvedIntroText.split("\n").map((line) => [line]),
    [],
    ...alphaByTag.flatMap((c) => [[c.tag.label], ...c.items.map((i) => [`- ${standupItemDisplayText(i)}`]), []]),
  ];
  const section1Ws = XLSX.utils.aoa_to_sheet(section1Aoa);
  section1Ws["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, section1Ws, "Section 1");

  // ---- Sheet 2: Section 2 (every pulled entry, exactly as-is) ----
  // Priority-then-alphabetical tag order (2026-08-18 - see
  // standupSortByTagThenLocation), same as Section 1 and everywhere else.
  // Every entry, included or not, matching the live Section 2 editor's own
  // "exactly as is" scope (buildStandupReportEntriesEditorHtml).
  const allTagsForSort = standupAllTags();
  const section2Items = standupSortByTagThenLocation(
    allItems.filter((i) => (i.text || "").trim()),
    allTagsForSort
  );
  const section2Rows = section2Items.map((i, idx) => {
    // Category lists every tag the entry carries (not just the primary one
    // it's grouped/sorted under) - same "full picture" treatment as the
    // static HTML export (standupReportEntriesStaticHtml).
    const tagLabels = standupItemTags(i).map(
      (key) => (allTagsForSort.find((t) => t.key === key) || STANDUP_TAGS.find((t) => t.key === "other")).label
    );
    return {
      "#": idx + 1,
      Included: i.included !== false ? "Yes" : "No",
      Category: tagLabels.join(", "),
      Location: effectiveEntryLocation(i) || "",
      Task: standupItemDisplayText(i),
    };
  });
  const section2Ws = XLSX.utils.json_to_sheet(section2Rows);
  section2Ws["!cols"] = [{ wch: 5 }, { wch: 9 }, { wch: 16 }, { wch: 28 }, { wch: 80 }];
  standupApplyTaskColumnSizing(section2Ws, section2Rows, "Task");
  XLSX.utils.book_append_sheet(wb, section2Ws, "Section 2");

  // ---- Sheets 3 & 4: Cali / Outside Cali ----
  // Same groupItemsByLocation buckets the live Summary breakdown uses
  // (standupBuildLocationBreakdown) - CA-state groups then everything else,
  // alphabetical by location within each (groupItemsByLocation's own sort).
  const { groups: locationGroups } = groupItemsByLocation(standupReportDedupe(standupIncludedItems(allItems)));
  const caRows = standupLocationSheetRows(locationGroups.filter((g) => g.state === "CA"));
  const otherRows = standupLocationSheetRows(locationGroups.filter((g) => g.state !== "CA"));
  const caWs = XLSX.utils.json_to_sheet(caRows.length ? caRows : [{ Location: "", Task: "No entries." }]);
  const otherWs = XLSX.utils.json_to_sheet(otherRows.length ? otherRows : [{ Location: "", Task: "No entries." }]);
  [caWs, otherWs].forEach((ws) => (ws["!cols"] = [{ wch: 28 }, { wch: 80 }]));
  standupApplyTaskColumnSizing(caWs, caRows, "Task");
  standupApplyTaskColumnSizing(otherWs, otherRows, "Task");
  XLSX.utils.book_append_sheet(wb, caWs, "Cali");
  XLSX.utils.book_append_sheet(wb, otherWs, "Outside Cali");

  // ---- Sheet 5: Categories (alphabetical, with counts) ----
  // The old "Overview" sheet's Category/Tasks columns, renamed/moved to
  // last per Huy's request, and now alphabetical (standupTagGroupsAlphabetical)
  // instead of the fixed Critical/Urgent-first order.
  const totalIncluded = alphaByTag.reduce((sum, c) => sum + c.items.length, 0);
  const categoriesAoa = [
    ["Category", "Tasks"],
    ...alphaByTag.map((c) => [c.tag.label, c.items.length]),
    ["Total", totalIncluded],
  ];
  const categoriesWs = XLSX.utils.aoa_to_sheet(categoriesAoa);
  categoriesWs["!cols"] = [{ wch: 24 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, categoriesWs, "Categories");

  return wb;
}

async function exportStandupToExcel(dateStr, items, introText) {
  const wb = await buildStandupExcelWorkbook(dateStr, items, introText);
  if (!wb) return;
  const version = nextStandupExportFileTag(dateStr);
  const stamp = standupDateToFilenameStamp(dateStr);
  XLSX.writeFile(wb, `Huy_Nguyen_Standup_${stamp}_${version}.xlsx`);
}

standupExportExcelBtn?.addEventListener("click", async () => {
  standupRefreshReportIfGenerated(); // same "always reflect latest edits" convention as Download HTML/PDF/Save
  if (!standupReportHtml) return;
  try {
    await exportStandupToExcel(standupTargetDate(), standupChecklistItems, standupSummaryIntroText);
  } catch (err) {
    console.error(err);
    if (standupReportStatusEl) standupReportStatusEl.textContent = "Could not export to Excel: " + (err?.message || "Something went wrong.");
  }
});

// ---- Step 3's "Export All" (every saved day, one workbook) ----------------
// Unlike the single-day export above, this reads straight from
// allStandupSaves (the standupSaves onSnapshot listener's own in-memory
// cache - see subscribeToStandupSaves) rather than the live checklist, since
// the point is a consolidated view across every day that's been saved, not
// just whichever day happens to be loaded into Step 1/2 right now. Still
// "each category into its own sheet" per Huy's original request, just with
// every day's items pooled into that same category sheet (a Date column
// distinguishes which day each row came from) rather than one sheet set per
// day - 45+ saved days x 8 tags would otherwise mean 300+ sheets, which
// nobody could actually navigate.
function nextStandupExportAllFileTag() {
  const dateStr = dateToInputValue(new Date());
  const storageKey = "standupExportAllCount_" + dateStr;
  const count = parseInt(localStorage.getItem(storageKey) || "0", 10) + 1;
  localStorage.setItem(storageKey, String(count));
  return { dateStr, version: `V1.${count - 1}` };
}

async function buildStandupAllSavesExcelWorkbook(saves) {
  await ensureXLSX();
  if (!saves.length) {
    alert("Nothing saved yet to export.");
    return null;
  }

  // Most recent day first, then working backwards - matches the Saved
  // list's own newest-first display order (subscribeToStandupSaves'
  // orderBy("date", "desc")) and Huy's 2026-08-04 request that the export
  // read newest-on-top rather than as an oldest-first timeline.
  const sortedSaves = [...saves].sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

  const allTags = standupAllTags();
  const byTag = allTags.map((tag) => ({ tag, rows: [] }));
  const byTagLookup = new Map(byTag.map((c) => [c.tag.key, c]));
  const overviewRows = [];

  sortedSaves.forEach((save) => {
    const items = (save.items || []).filter((i) => i.included !== false && (i.text || "").trim());
    const perTagCounts = {};
    items.forEach((i) => {
      const bucket = byTagLookup.get(i.tag) || byTagLookup.get("other");
      bucket.rows.push({ Date: standupDateToMMDDYYYY(save.date), Task: i.text });
      perTagCounts[bucket.tag.key] = (perTagCounts[bucket.tag.key] || 0) + 1;
    });
    overviewRows.push({
      Date: standupDateToMMDDYYYY(save.date),
      "Total Tasks": items.length,
      ...Object.fromEntries(allTags.map((t) => [t.label, perTagCounts[t.key] || 0])),
    });
  });

  const wb = XLSX.utils.book_new();

  const overviewWs = XLSX.utils.json_to_sheet(overviewRows);
  overviewWs["!cols"] = [{ wch: 12 }, { wch: 12 }, ...allTags.map(() => ({ wch: 14 }))];
  XLSX.utils.book_append_sheet(wb, overviewWs, "Overview");

  byTag
    .filter((c) => c.rows.length)
    .forEach((c) => {
      const ws = XLSX.utils.json_to_sheet(c.rows);
      ws["!cols"] = [{ wch: 12 }, { wch: 90 }];
      const headerRow = { hpt: 18 };
      const dataRows = c.rows.map((row) => ({ hpt: Math.max(1, row.Task.split("\n").length) * 15 }));
      ws["!rows"] = [headerRow, ...dataRows];
      XLSX.utils.book_append_sheet(wb, ws, standupExcelSheetName(c.tag.label));
    });

  return wb;
}

async function exportAllStandupSavesToExcel() {
  const wb = await buildStandupAllSavesExcelWorkbook(allStandupSaves);
  if (!wb) return;
  const { dateStr, version } = nextStandupExportAllFileTag();
  XLSX.writeFile(wb, `Huy_Nguyen_Standup_AllSaved_${dateStr}_${version}.xlsx`);
}

standupExportAllBtn?.addEventListener("click", async () => {
  try {
    await exportAllStandupSavesToExcel();
  } catch (err) {
    console.error(err);
    alert("Could not export to Excel: " + (err?.message || "Something went wrong."));
  }
});

// "View" re-renders the Saved list against the current From/To inputs (see
// renderStandupSavedList's rangeActive check) - both fields must be filled
// or it just falls back to the default 10-newest view.
standupSavedViewBtn?.addEventListener("click", () => {
  renderStandupSavedList();
});

// "Collapse all" closes every row's expanded report panel in place, without
// touching the underlying allStandupSaves/render - same close path as a
// single row's own "Hide report" toggle (standup-save-view click handler
// below), just looped over every row currently on screen.
standupSavedCollapseAllBtn?.addEventListener("click", () => {
  standupSavedListEl?.querySelectorAll(".standup-save-row").forEach((row) => {
    const previewEl = row.querySelector(".standup-save-preview");
    const toggleBtn = row.querySelector(".standup-save-view");
    if (previewEl) {
      previewEl.style.display = "none";
      previewEl.innerHTML = "";
    }
    if (toggleBtn) toggleBtn.textContent = "View report";
  });
});

// Step 3's persistence hook - a snapshot of the checklist items plus
// whatever report/email content exists right now, written via the
// saveStandupReport callable (Firestore rules deny direct client writes, see
// standupSaves in firestore.rules). One doc per PT day; saving the same day
// twice overwrites rather than duplicating. Shared by two triggers: the
// Report step's manual Save button below, and its own "Open in Outlook Web"
// button right next to it - per Huy's 2026-08-02 request that sending the
// email should itself land the day in step 3 without a separate trip back
// to Save. Refreshes standupReportHtml from the current checklist/intro
// state first (same as standupRefreshReportIfGenerated used by the
// HTML/PDF downloads) so a save triggered from either button always
// captures the latest edits, not a stale snapshot from whenever Generate
// was last clicked. reportHtml can still end up null here (e.g. Save was
// never possible because Generate was never clicked this session) - the
// backend callable already treats it as optional/nullable.
async function saveCurrentStandupSnapshot() {
  const dateStr = standupTargetDate();
  if (!dateStr) throw new Error("No target day set — pull emails in step 1 first.");
  standupRefreshReportIfGenerated();
  await saveStandupReportFn({
    date: dateStr,
    items: standupChecklistItems.map((i) => ({
      text: i.text,
      tag: i.tag,
      // Persists the full multi-select tags array (2026-08-18) alongside the
      // legacy single tag - see saveStandupReport's own tags validation.
      tags: standupItemTags(i),
      included: i.included,
      locationOverride: i.locationOverride || null,
      // 2026-08-07 request: persist the (possibly hand-edited) AI thread
      // summary alongside the rest of the row, so it survives a reload or
      // a later Load-into-Checklist instead of only lasting this session.
      threadSummary: i.threadSummary || null,
      // 2026-08-09: persist the resolved requester name too (not the whole
      // item.initial object it's derived from, which never survives a save
      // at all - see saveStandupReport's own comment) - this is what lets
      // "Load into Checklist" hand a requester name straight back to
      // standupRequesterName without needing the original email metadata.
      requesterName: standupRequesterName(i) || null,
      // 2026-09-11: persist the full ordered thread too (capped defensively
      // client-side same as the server does) so "View Conversation" survives
      // a Load-into-Checklist round trip - see saveStandupReport's own
      // validation/cap in functions/index.js.
      conversationMessages: Array.isArray(i.conversationMessages) ? i.conversationMessages.slice(0, 30) : [],
    })),
    reportHtml: standupReportHtml || null,
    emailSubject: standupEmailSubject(),
    emailBody: buildStandupEmailBody(),
  });
}

standupSaveBtn?.addEventListener("click", async () => {
  if (!standupReportHtml) {
    if (standupReportStatusEl) standupReportStatusEl.textContent = "Generate the report first.";
    return;
  }
  standupSaveBtn.disabled = true;
  const originalText = standupSaveBtn.textContent;
  standupSaveBtn.textContent = "Saving…";
  try {
    await saveCurrentStandupSnapshot();
    standupSaveBtn.textContent = "Saved ✓";
  } catch (err) {
    standupSaveBtn.textContent = err?.message || "Save failed";
    console.error(err);
  } finally {
    standupSaveBtn.disabled = false;
    setTimeout(() => {
      standupSaveBtn.textContent = originalText;
    }, 2500);
  }
});

function standupEmailSubject() {
  return `Standup - ${standupDateOrRangeLabel(standupTargetDate())}`;
}

// Is the same Summary intro shown (and editable) in step 2's Report -
// standupSummaryIntroText already reflects whatever's currently in
// #standupSummaryInput, edits included, not just the auto-generated starting
// text - so the email always matches whatever Report was last generated/
// edited, per Huy's 2026-08-05 request to keep Email in sync with Report
// rather than building its own separate summary.
//
// (2026-08-08: Huy asked for the email to carry *only* the Cali/Outside-Cali
// location breakdown - no "Hi Kuan — N tasks..." lead sentence, and no
// per-tag itemized listing after it. The lead sentence is already gone from
// standupSummaryIntroText itself as of the same request (see that
// function's own 2026-08-08 note) - simply reusing it here still works.
// What changed in THIS function is dropping the per-tag loop that used to
// follow it - that loop was a plain-text re-rendering of the exact same
// per-tag breakdown Section 1's colored cards already show on screen, which
// is precisely what Huy asked to leave out of the email. If
// standupSummaryIntroText is empty - no locations resolved for any included
// task today - the email body is now simply empty; that's the direct
// consequence of "only the location breakdown," not a bug.)
function buildStandupEmailBody() {
  return (standupSummaryIntroText || "").trim();
}

// ---- Step 2 (cont'd): the "Preview & Send Email" action --------------------
// (2026-08-15, sixth pass) Rewritten from a plain Outlook Web deeplink to a
// real send via Microsoft Graph (sendStandupCaliIssuesEmailFn ->
// sendStandupCaliIssuesEmail in functions/index.js, the same
// getGraphClientForSend() CW Email Request's submitEmailRequest already
// uses). Huy asked for Cali Issues/Outside Cali Issues to go out with real
// color-coded topics - a deeplink's "body" query param can only ever carry
// plain text (see the AADSTS90015/STANDUP_EMAIL_LINK_SAFE_LENGTH history
// this replaces, below), so there was no way to keep the old link-based
// approach and satisfy that.
//
// (2026-08-15, seventh pass) Huy's first pass on this accepted sending
// immediately, no preview - then asked to see the email before it goes out
// after all, so this button now only builds the content and opens
// standupEmailPreviewModalEl showing the exact colored HTML/subject; the
// actual Graph send only happens when standupEmailPreviewSendBtn is clicked
// inside that modal (see its own listener below). standupEmailOpenLinkEl
// (the wrapping <a>, still just there for styling) never navigates anywhere
// either way - e.preventDefault() below makes sure a stray default
// navigation never fires.
//
// Content is rebuilt fresh from the live Issue tab here (not read from
// standupSummaryIntroText, which stays the plain, freely-editable version
// shown on screen per Huy's request) - see buildStandupReportEmailHtml's
// own comment above. Recipients/subject are unchanged from the old deeplink
// version: both "to" (not "cc", which silently drops on this tenant),
// standupEmailSubject() as-is.
//
// (Previously: a plain https://outlook.office.com/mail/deeplink/compose URL,
// never browser automation - see the README's Known Limitations - merged in
// from its own standalone "3. Email" step 2026-08-03. Its "body" param used
// to carry the full report text URL-encoded until Outlook's sign-in redirect
// started failing past ~15-20 tasks with "AADSTS90015: Requested query
// string is too long" [Azure AD's cap on the total request URL length during
// that redirect] - fixed at the time by a length cutoff
// [STANDUP_EMAIL_LINK_SAFE_LENGTH, 1500 chars] that fell back to a
// clipboard-copy-then-paste flow above it. None of that applies anymore:
// Graph's sendMail is a normal POST body, not a URL, so there's no
// AADSTS90015-style length ceiling for this content to hit.)

// Holds the exact {subject, html} the preview modal is currently showing, so
// standupEmailPreviewSendBtn's click handler sends *precisely* what Huy just
// reviewed rather than re-fetching the Issue tab a second time (which could
// theoretically race with an Issue tab edit made in another tab between
// preview and Send). Cleared (back to null) on both Cancel and after a
// successful/failed Send, so a stale payload can never linger and get sent
// by a later, unrelated click.
let standupPendingCaliIssuesEmail = null;

function closeStandupEmailPreview() {
  standupPendingCaliIssuesEmail = null;
  if (standupEmailPreviewModalEl) standupEmailPreviewModalEl.style.display = "none";
  standupResetEmailFormatMode();
}

// ---- "Format" step (2026-08-18) -------------------------------------------
// Mirrors the CW Email Request tool's own preview modal (era_previewModal in
// index.html/its bundled script) - Format toggles the body between plain
// preview and a contentEditable surface with a small execCommand-based
// toolbar, independent of Edit (which still just closes the modal without
// sending, untouched by this). Whether Format was ever turned on this open
// decides whether Submit sends the (possibly hand-edited) live body HTML
// instead of the originally-built one - see standupEmailPreviewSendBtn's
// click handler below.
let standupEmailFormatModeOn = false;

// Resets format mode back to its default (off) - called both when the modal
// opens (so a previous open's state can't leak into this one) and when it
// closes (Edit or Submit), same "always start clean" reasoning as
// closeStandupEmailPreview clearing standupPendingCaliIssuesEmail.
function standupResetEmailFormatMode() {
  standupEmailFormatModeOn = false;
  if (standupEmailPreviewBodyEl) standupEmailPreviewBodyEl.contentEditable = "false";
  if (standupEmailPreviewToolbarEl) standupEmailPreviewToolbarEl.style.display = "none";
  if (standupEmailPreviewFormatBtn) standupEmailPreviewFormatBtn.textContent = "Format";
}

standupEmailPreviewFormatBtn?.addEventListener("click", () => {
  standupEmailFormatModeOn = !standupEmailFormatModeOn;
  if (standupEmailPreviewBodyEl) standupEmailPreviewBodyEl.contentEditable = standupEmailFormatModeOn ? "true" : "false";
  if (standupEmailPreviewToolbarEl) standupEmailPreviewToolbarEl.style.display = standupEmailFormatModeOn ? "flex" : "none";
  standupEmailPreviewFormatBtn.textContent = standupEmailFormatModeOn ? "Done Formatting" : "Format";
  if (standupEmailFormatModeOn) standupEmailPreviewBodyEl?.focus();
});

function standupEmailExecCmd(cmd, val) {
  standupEmailPreviewBodyEl?.focus();
  document.execCommand(cmd, false, val);
}

standupEmailFmtBoldBtn?.addEventListener("click", () => standupEmailExecCmd("bold"));
standupEmailFmtItalicBtn?.addEventListener("click", () => standupEmailExecCmd("italic"));
standupEmailFmtUnderlineBtn?.addEventListener("click", () => standupEmailExecCmd("underline"));
standupEmailFmtFontSelect?.addEventListener("change", (e) => {
  if (e.target.value) standupEmailExecCmd("fontName", e.target.value);
  e.target.value = "";
});
standupEmailFmtSizeSelect?.addEventListener("change", (e) => {
  if (e.target.value) standupEmailExecCmd("fontSize", e.target.value);
  e.target.value = "";
});
standupEmailFmtColorInput?.addEventListener("input", (e) => standupEmailExecCmd("foreColor", e.target.value));

standupEmailOpenBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  standupRefreshReportIfGenerated();
  standupEmailOpenBtn.disabled = true;
  const originalBtnText = standupEmailOpenBtn.textContent;
  standupEmailOpenBtn.textContent = "Pulling Issue tab…";
  if (standupReportStatusEl) standupReportStatusEl.textContent = "Pulling active Issue tab items…";
  try {
    const freshIssueItems = await fetchActiveIssueItemsFresh();
    const caliActiveIssues = activeIssueItemsForRegion(freshIssueItems, "cali");
    const outsideCaliActiveIssues = activeIssueItemsForRegion(freshIssueItems, "outsideCali");
    const html = buildStandupReportEmailHtml(caliActiveIssues, outsideCaliActiveIssues);
    if (!html) {
      if (standupReportStatusEl) {
        standupReportStatusEl.textContent =
          "Nothing to send — no Active issues in Cali or Outside Cali, and nothing included in today's Standup checklist.";
      }
      return;
    }
    standupPendingCaliIssuesEmail = { subject: standupEmailSubject(), html };
    standupResetEmailFormatMode();
    if (standupEmailPreviewSubjectEl) standupEmailPreviewSubjectEl.textContent = standupPendingCaliIssuesEmail.subject;
    if (standupEmailPreviewBodyEl) standupEmailPreviewBodyEl.innerHTML = html;
    if (standupEmailPreviewModalEl) standupEmailPreviewModalEl.style.display = "flex";
    if (standupReportStatusEl) standupReportStatusEl.textContent = "Review the email, then click Send in the preview.";
  } catch (err) {
    console.error(err);
    if (standupReportStatusEl) standupReportStatusEl.textContent = `Could not build preview: ${err?.message || "Something went wrong."}`;
  } finally {
    standupEmailOpenBtn.disabled = false;
    standupEmailOpenBtn.textContent = originalBtnText;
  }
});

standupEmailPreviewCancelBtn?.addEventListener("click", () => {
  closeStandupEmailPreview();
  if (standupReportStatusEl) standupReportStatusEl.textContent = "Send cancelled — nothing was emailed.";
});

standupEmailPreviewSendBtn?.addEventListener("click", async () => {
  const pending = standupPendingCaliIssuesEmail;
  if (!pending) {
    closeStandupEmailPreview();
    return;
  }
  // If Format was ever turned on this open, Submit sends the live (possibly
  // hand-edited) body HTML instead of the originally-built one - same
  // "htmlBodyOverride" pattern as the CW Email Request tool's own Submit
  // handler (pt() in its bundled script).
  const outgoing = standupEmailFormatModeOn && standupEmailPreviewBodyEl ? { ...pending, html: standupEmailPreviewBodyEl.innerHTML } : pending;
  standupEmailPreviewSendBtn.disabled = true;
  standupEmailPreviewCancelBtn.disabled = true;
  const originalSendText = standupEmailPreviewSendBtn.textContent;
  standupEmailPreviewSendBtn.textContent = "Sending…";
  if (standupReportStatusEl) standupReportStatusEl.textContent = "Sending…";
  try {
    await sendStandupCaliIssuesEmailFn(outgoing);
    closeStandupEmailPreview();
    if (standupReportStatusEl) standupReportStatusEl.textContent = "Sending… saving…";
    try {
      await saveCurrentStandupSnapshot();
      if (standupReportStatusEl) standupReportStatusEl.textContent = "Sent ✓ — saved to step 3.";
    } catch (err) {
      console.error(err);
      if (standupReportStatusEl) standupReportStatusEl.textContent = `Sent ✓. ${err?.message || "Save failed — try the Save button."}`;
    }
  } catch (err) {
    console.error(err);
    // Left open (not closed) on a send failure - the modal already shows
    // exactly what Huy tried to send, so it's the one place to retry Send
    // from without rebuilding the preview via the main button all over again.
    if (standupReportStatusEl) standupReportStatusEl.textContent = `Could not send: ${err?.message || "Something went wrong."}`;
  } finally {
    standupEmailPreviewSendBtn.disabled = false;
    standupEmailPreviewCancelBtn.disabled = false;
    standupEmailPreviewSendBtn.textContent = originalSendText;
  }
});

// ---- Step 3: Saved -----------------------------------------------------------
// Backed by the standupSaves onSnapshot listener (subscribeToStandupSaves
// above), not in-memory state like steps 1-2 - allStandupSaves is kept in
// sync by that listener and this just reflects whatever it currently holds.

// (2026-08-18) Every row's report panel (Summary for Kuan Goh + Entries) now
// renders already expanded, showing every entry, instead of staying
// collapsed behind a "View report" click - Huy asked for that click
// requirement dropped. "View report"/"Hide report" (the button's label now
// tracks state, see the click handler below) still works as a manual
// collapse/reopen toggle for anyone who wants a shorter list, it just no
// longer gates the *first* view. "View Short Version"/"View Long Version"
// (the Vertex AI Kuan-brief feature) were removed outright per Huy's
// request - see docs/log/2026-08-18-standup-saved-issue-summary-and-cleanup.md.
// The backing summarizeStandupReportForKuan(Long) Cloud Functions and their
// client httpsCallable wrappers are left defined/unused, same "keep it in
// case it comes back" treatment as pullStandupEmailsFn elsewhere in this file.
//
// Cali Issues/Outside Cali Issues in each row's Summary section now source
// from the Issue tab's own Active issues (2026-08-18), same as the live
// Report step - fetched ONCE here for the whole list (not once per row),
// since every row is expanded by default now and would otherwise each pay
// their own Firestore read. See buildStandupSaveSummaryEditorHtml/
// standupFetchIssueRegions below.
async function renderStandupSavedList() {
  if (!standupSavedListEl) return;
  if (!allStandupSaves.length) {
    standupSavedListEl.innerHTML =
      '<p style="font-size:13px; color:var(--text);">Nothing saved yet — generate a report in step 2, then hit Save.</p>';
    return;
  }
  // From/To range (both must be filled - a lone From or To is treated as no
  // filter, same "ignore a half-entered range" rule as the Pull step's own
  // Add-range control) overrides the default 10-newest cap below.
  const fromDate = standupSavedFromInput?.value || "";
  const toDate = standupSavedToInput?.value || "";
  const rangeActive = Boolean(fromDate && toDate);
  let savesToRender = allStandupSaves;
  if (rangeActive) {
    savesToRender = allStandupSaves.filter((save) => save.date >= fromDate && save.date <= toDate);
  } else {
    savesToRender = allStandupSaves.slice(0, STANDUP_SAVED_DEFAULT_LIMIT);
  }
  if (!savesToRender.length) {
    standupSavedListEl.innerHTML = rangeActive
      ? '<p style="font-size:13px; color:var(--text);">No saved days in that range.</p>'
      : '<p style="font-size:13px; color:var(--text);">Nothing saved yet — generate a report in step 2, then hit Save.</p>';
    return;
  }
  const issueRegions = await standupFetchIssueRegions();
  const rowsHtml = await Promise.all(
    savesToRender.map(async (save) => {
      const mmddyyyy = standupDateToMMDDYYYY(save.date);
      const count = Array.isArray(save.items) ? save.items.length : 0;
      const savedAt = save.savedAt?.toDate ? save.savedAt.toDate().toLocaleString() : "";
      const meta = [`${count} task${count === 1 ? "" : "s"}`];
      if (savedAt) meta.push(`saved ${savedAt}`);
      if (save.savedBy) meta.push(`by ${save.savedBy}`);
      const previewHtml = await buildStandupSavePreviewHtml(save, issueRegions);
      return `<div class="standup-save-row" data-id="${save.id}" style="padding:10px 12px; border:1px solid var(--border); border-radius:8px; margin-bottom:8px; background:var(--surface);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <div style="font-weight:600; font-size:14px; color:var(--text);">${escapeHtml(mmddyyyy)}</div>
            <div style="font-size:12px; color:var(--text);">${escapeHtml(meta.join(" — "))}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="standup-save-view secondary" style="font-size:12px; padding:5px 10px;">Hide report</button>
            <button type="button" class="standup-save-export-summary secondary" style="font-size:12px; padding:5px 10px;">Export Summary for Kuan Goh</button>
            <button type="button" class="standup-save-load secondary" style="font-size:12px; padding:5px 10px;">Load into Checklist</button>
            <button type="button" class="standup-save-export secondary" style="font-size:12px; padding:5px 10px;">Export to Excel</button>
            <button type="button" class="standup-save-delete secondary" style="font-size:12px; padding:5px 10px; color:var(--danger-light); border-color:var(--danger-border);">Delete</button>
          </div>
        </div>
        <div class="standup-save-preview" style="display:block; margin-top:10px;">${previewHtml}</div>
      </div>`;
    })
  );
  standupSavedListEl.innerHTML = rowsHtml.join("");
  // Location-candidates prompts need each row's own <div> in the DOM first
  // (just built above) - same prompt the old "View report" click handler
  // used to populate on open, now populated for every already-expanded row.
  const rowEls = standupSavedListEl.querySelectorAll(".standup-save-row");
  rowEls.forEach((rowEl, idx) => standupRenderSaveLocationCandidates(rowEl, savesToRender[idx]));
}

// "View report" panel body. Originally (earlier today) just added an
// editable copy of save.items below a frozen, read-only iframe of the
// historical reportHtml snapshot. Per Huy's follow-up request, that frozen
// iframe is now gone entirely - "Summary for Kuan Goh" itself is editable
// and always reflects the current entries, which means it's no longer a
// record of "what was actually sent" (the whole reason that field used to be
// frozen - see the comment above STANDUP_SAVES_COLLECTION/saveStandupReport
// in functions/index.js). Saving from either section below overwrites
// save.reportHtml for that day going forward - a deliberate, explicit
// reversal of that invariant for this one area, not an oversight.
//
// Three stacked pieces: the Summary editor (intro textarea + always-live
// colored/location breakdown, built straight from save.items - see
// buildStandupSaveSummaryEditorHtml), a location-candidates prompt (only
// shown when something in save.items looks address-like but isn't in the
// catalog yet - see standupRenderSaveLocationCandidates), and the Entries
// editor (task rows - see buildStandupSaveEntriesEditorHtml). Saving Entries
// also refreshes the Summary section in place and re-checks for new location
// candidates, so a newly added/edited task shows up under Summary for Kuan
// Goh (and, once its location is resolved, the Cali/Outside-Cali breakdown)
// without needing a separate step.
// `issueRegions` lets a caller that already fetched fresh Issue data (e.g.
// renderStandupSavedList, building every row at once) pass it straight
// through instead of each row paying its own Firestore read - see
// standupFetchIssueRegions below. Optional; omitted, buildStandupSaveSummaryEditorHtml
// fetches its own.
async function buildStandupSavePreviewHtml(save, issueRegions) {
  const summaryHtml = await buildStandupSaveSummaryEditorHtml(save, issueRegions);
  return `<div class="standup-save-summary-edit" style="margin-bottom:14px;">${summaryHtml}</div>
    <div class="standup-save-location-candidates" style="display:none; margin-bottom:14px;"></div>
    <div>
      <div style="font-weight:600; font-size:12px; color:var(--text); margin-bottom:6px;">Entries — edit and save</div>
      <div class="standup-save-entries-edit">${buildStandupSaveEntriesEditorHtml(save)}</div>
    </div>`;
}

// Fetches this list's worth of "Cali Issues"/"Outside Cali Issues" source
// data fresh from the Issue tab's own Active issues per region - same
// fetchActiveIssueItemsFresh/activeIssueItemsForRegion pair the live Report
// step's Generate button already uses (see fetchActiveIssueItemsFresh's own
// comment, next to effectiveIssueStatus). Factored out so
// renderStandupSavedList can call it once for the whole list instead of once
// per row.
async function standupFetchIssueRegions() {
  const freshIssueItems = await fetchActiveIssueItemsFresh();
  return {
    caliActiveIssues: activeIssueItemsForRegion(freshIssueItems, "cali"),
    outsideCaliActiveIssues: activeIssueItemsForRegion(freshIssueItems, "outsideCali"),
  };
}

// Shared fallback for "what should a saved day's summaryIntroText default to
// when it doesn't have one saved yet" - Cali Issues/Outside Cali Issues
// pulled fresh from the Issue tab's Active issues (2026-08-18), replacing the
// old checklist-based buildStandupSummaryIntroText() this used to share with
// the live Report step. The live step switched sources on 2026-08-15 (see
// that day's "sixth pass" log); this panel was deliberately left on the old
// source at the time, for historical-accuracy reasons ("re-deriving it from
// today's Issue tab state would misrepresent history") - Huy asked for that
// tradeoff dropped so this panel always matches the live step's current
// source instead. `issueRegions` lets a caller that already fetched fresh
// Issue data skip a redundant read (see standupFetchIssueRegions above);
// omitted, this fetches its own.
async function standupSaveFallbackIntroText(issueRegions) {
  const regions = issueRegions || (await standupFetchIssueRegions());
  return buildIssueCaliIssuesIntroText(regions.caliActiveIssues, regions.outsideCaliActiveIssues);
}

// "Summary for Kuan Goh" editor - same editable-intro / always-live-breakdown
// split as the live Report step (buildStandupReportHtml /
// buildStandupSummaryDetailSectionsHtml): the intro textarea is freely
// rewritable and "Save changes" persists it into save.summaryIntroText, but
// the colored per-tag + location breakdown underneath it is always rebuilt
// fresh from save.items (never freeform-edited), so it can't get out of sync
// with whatever's currently in the Entries editor below, and a hand edit to
// the intro can never lose the colored structure. Falls back to
// standupSaveFallbackIntroText's Issue-tab-sourced text (2026-08-18) when
// this save has no summaryIntroText yet, e.g. every day saved before this
// field existed, or before the fallback source changed.
async function buildStandupSaveSummaryEditorHtml(save, issueRegions) {
  const items = Array.isArray(save.items) ? save.items : [];
  const introText =
    typeof save.summaryIntroText === "string" && save.summaryIntroText
      ? save.summaryIntroText
      : await standupSaveFallbackIntroText(issueRegions);
  return `<div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:14px 16px;">
    <div style="font-weight:700; font-size:14px; color:var(--text); margin-bottom:8px;">Summary for Kuan Goh</div>
    <textarea class="standup-save-summary-intro" style="width:100%; min-height:70px; padding:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:6px; font-size:13px; font-family:inherit; resize:vertical; box-sizing:border-box;">${escapeHtml(introText)}</textarea>
    <div class="standup-save-summary-detail">${buildStandupSummaryDetailSectionsHtml(items)}</div>
    <!-- Read-only here (2026-09-14) - attachments are added from the live
         Report step's own upload control; this panel just shows whatever's
         already on the day's standupSaves doc, same as every other
         Saved-tab field this editor round-trips without a dedicated editor
         of its own. -->
    ${standupBuildAttachmentsHtml(save.id)}
    <div style="display:flex; gap:8px; align-items:center; margin-top:10px;">
      <button type="button" class="standup-save-summary-save" style="font-size:12px; padding:5px 10px;">Save changes</button>
      <button type="button" class="standup-save-summary-cancel secondary" style="font-size:12px; padding:5px 10px;">Cancel</button>
      <span class="standup-save-summary-status" style="font-size:12px; color:var(--danger-light);"></span>
    </div>
  </div>`;
}

// Same "ask before adding" prompt as Step 1's checklist
// (standupLocationCandidates/renderStandupLocationCandidates) - flags entries
// in *this saved day* that look address-like but aren't in the catalog yet,
// so editing a past day's entries goes through the same confirm-before-
// catalog-write flow as everywhere else in the app, rather than silently
// creating (or silently skipping) a new location. Confirming a bucket adds it
// to the shared standupLocationCatalog (same addStandupLocationFn Step 1
// uses) and immediately re-renders this save's Summary section so the
// newly-recognized location shows up under its own heading in the breakdown
// right away, without waiting on a page reload.
function standupRenderSaveLocationCandidates(row, save) {
  const el = row.querySelector(".standup-save-location-candidates");
  if (!el) return;
  const items = Array.isArray(save.items) ? save.items : [];
  const candidates = standupLocationCandidates(items);
  if (!candidates.length) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  el.style.display = "block";
  el.innerHTML = `
    <div style="font-size:12px; color:var(--warning); margin-bottom:6px;">These entries look like they mention a location that's not in the catalog yet - edit the box down to just the clean address, then add it so this (and future) reports catch it automatically, or mark it as not a location:</div>
    ${candidates
      .map(
        (item) => `<div class="standup-save-location-candidate-row" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:6px 8px; border:1px solid var(--warning-border); border-radius:6px; margin-bottom:6px; background:var(--warning-bg);">
        <span style="font-size:11px; color:var(--warning); width:100%;">${escapeHtml(item.text)}</span>
        <input type="text" class="standup-save-location-label-input" value="${escapeHtml(item.text)}" placeholder="Clean address, e.g. 218 Machlin Ct, Walnut, CA 91789" style="flex:1; min-width:200px; padding:4px 6px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:6px; font-size:12px;" />
        <button type="button" class="standup-save-location-add-btn secondary" data-state="CA" style="font-size:11px; padding:3px 8px;">+ California</button>
        <button type="button" class="standup-save-location-add-btn secondary" data-state="OTHER" style="font-size:11px; padding:3px 8px;">+ Outside CA</button>
        <button type="button" class="standup-save-location-skip-btn secondary" style="font-size:11px; padding:3px 8px;">Not a location</button>
      </div>`
      )
      .join("")}
  `;
}

// Rows + toolbar for the entries editor above. Rebuilt fresh from save.items
// every time the panel opens (or Cancel is pressed) - like the Kuan-brief
// edit form just below, fields are read straight off the DOM at Save time
// rather than kept in a live-bound model, so "+ Add entry"/"Remove" can
// mutate the DOM directly without disturbing whatever's already been typed
// into any other still-open row.
function buildStandupSaveEntriesEditorHtml(save) {
  const items = Array.isArray(save.items) ? save.items : [];
  // Same priority-then-alphabetical tag order as the live checklist/Report
  // editor (2026-08-18) - see standupSortByTagThenLocation.
  const sortedItems = standupSortByTagThenLocation(items);
  const rowsHtml = sortedItems.length
    ? sortedItems.map((item, idx) => standupSaveEditRowHtml(save.id, item, idx)).join("")
    : '<p class="standup-save-entries-empty" style="font-size:13px; color:var(--text);">No entries — add one below.</p>';
  return `<div class="standup-save-entries-rows">${rowsHtml}</div>
    <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
      <button type="button" class="standup-save-entries-add secondary" style="font-size:12px; padding:5px 10px;">+ Add entry</button>
      <button type="button" class="standup-save-entries-save" style="font-size:12px; padding:5px 10px;">Save changes</button>
      <button type="button" class="standup-save-entries-cancel secondary" style="font-size:12px; padding:5px 10px;">Cancel</button>
      <span class="standup-save-entries-status" style="font-size:12px; color:var(--danger-light);"></span>
    </div>`;
}

// One editable entry row - same fields/shape saveStandupReport sanitizes
// (text/tag/tags/included/locationOverride), same controls as a live
// checklist row (renderStandupChecklist) but under their own
// `standup-save-edit-*` classes so this panel's event delegation (on
// standupSavedListEl) can't be confused with the live checklist's (on
// standupChecklistListEl) - different container elements, but keeping the
// classes distinct too avoids any doubt reading this file later. Unlike the
// live checklist/Report editor, this row has no backing JS item object to
// mutate in place - tag checkbox state lives purely in the DOM until "Save
// changes" reads it back out (see the click handler below), so the
// "+ New tag…" flow here (standup-save-edit-tag-add) inserts a checkbox
// directly rather than calling standupPromptAddTagToItem.
function standupSaveEditRowHtml(saveId, item, idx) {
  const allTags = standupAllTags();
  const datalistId = `standup-save-edit-loc-opts-${saveId}-${idx}`;
  return `<div class="standup-save-edit-row" style="padding:8px; border:1px solid var(--border); border-radius:8px; margin-bottom:6px; background:var(--surface-2);">
    <div style="display:flex; gap:8px; align-items:center;">
      <input type="checkbox" class="standup-save-edit-included" ${item.included !== false ? "checked" : ""} />
      <input type="text" class="standup-save-edit-text" value="${escapeHtml(item.text || "")}" style="flex:1; min-width:120px; padding:6px 8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:6px; font-size:13px;" />
      ${standupTagPickerHtml(item, allTags, "standup-save-edit-tag")}
      <button type="button" class="standup-save-edit-remove secondary" style="font-size:12px; padding:4px 8px;">Remove</button>
    </div>
    <div style="display:flex; gap:6px; align-items:center; margin:6px 0 0 26px;">
      <span style="font-size:11px; color:var(--text);">📍</span>
      ${locationInputHtml("standup-save-edit-location", datalistId, item.locationOverride)}
    </div>
    <!-- No visible summary editor here (Huy asked for that in the live Pull
         step's checklist, not this Entries editor) - a hidden field just
         round-trips whatever threadSummary this item already had so
         clicking "Save changes" here can't silently wipe it out (2026-08-07). -->
    <input type="hidden" class="standup-save-edit-summary" value="${escapeHtml(item.threadSummary || "")}" />
    <!-- Same round-trip-only treatment for the resolved requester name
         (2026-08-09) - no visible control here either, just carried through
         so re-saving edits made in this Entries editor can't silently drop
         the requester name a row already had. -->
    <input type="hidden" class="standup-save-edit-requester" value="${escapeHtml(item.requesterName || "")}" />
  </div>`;
}

standupSavedListEl?.addEventListener("click", async (e) => {
  const row = e.target.closest(".standup-save-row");
  if (!row) return;
  const save = allStandupSaves.find((s) => s.id === row.dataset.id);
  if (!save) return;

  if (e.target.closest(".standup-save-view")) {
    // Rows render already expanded (see renderStandupSavedList's 2026-08-18
    // comment) - this button is now just a manual collapse/reopen toggle,
    // its label tracking state instead of always reading "View report".
    const toggleBtn = e.target.closest(".standup-save-view");
    const previewEl = row.querySelector(".standup-save-preview");
    if (!previewEl) return;
    const isOpen = previewEl.style.display !== "none";
    if (isOpen) {
      previewEl.style.display = "none";
      previewEl.innerHTML = "";
      toggleBtn.textContent = "View report";
      return;
    }
    previewEl.style.display = "block";
    previewEl.innerHTML = await buildStandupSavePreviewHtml(save);
    standupRenderSaveLocationCandidates(row, save);
    toggleBtn.textContent = "Hide report";
    return;
  }

  if (e.target.closest(".standup-save-entries-add")) {
    const rowsContainer = row.querySelector(".standup-save-entries-rows");
    if (!rowsContainer) return;
    rowsContainer.querySelector(".standup-save-entries-empty")?.remove();
    const idx = rowsContainer.querySelectorAll(".standup-save-edit-row").length;
    rowsContainer.insertAdjacentHTML(
      "beforeend",
      standupSaveEditRowHtml(save.id, { text: "", tag: "other", tags: ["other"], included: true, locationOverride: null }, idx)
    );
    const textInputs = rowsContainer.querySelectorAll(".standup-save-edit-text");
    textInputs[textInputs.length - 1]?.focus();
    return;
  }

  if (e.target.closest(".standup-save-edit-remove")) {
    e.target.closest(".standup-save-edit-row")?.remove();
    return;
  }

  if (e.target.closest(".standup-save-entries-cancel")) {
    // Discards any unsaved edits by rebuilding fresh from save.items.
    const entriesEl = row.querySelector(".standup-save-entries-edit");
    if (entriesEl) entriesEl.innerHTML = buildStandupSaveEntriesEditorHtml(save);
    return;
  }

  if (e.target.closest(".standup-save-entries-save")) {
    const entriesEl = row.querySelector(".standup-save-entries-edit");
    if (!entriesEl) return;
    const items = Array.from(entriesEl.querySelectorAll(".standup-save-edit-row"))
      .map((rowEl) => {
        // Multi-select tag picker (2026-08-18) - collect every checked
        // checkbox, falling back to "other" if somehow none are (shouldn't
        // happen: standupToggleItemTag-style single-checkbox toggling isn't
        // used here since this row has no live item, but the picker never
        // renders with zero pre-checked boxes either).
        const checkedTags = Array.from(rowEl.querySelectorAll(".standup-save-edit-tag-option:checked")).map((cb) => cb.value);
        const tags = checkedTags.length ? checkedTags : ["other"];
        return {
          text: (rowEl.querySelector(".standup-save-edit-text")?.value || "").trim(),
          tag: standupPrimaryTag({ tags }),
          tags,
          included: rowEl.querySelector(".standup-save-edit-included")?.checked !== false,
          locationOverride: (rowEl.querySelector(".standup-save-edit-location")?.value || "").trim() || null,
          // Carried through from the hidden field on this row (see
          // standupSaveEditRowHtml) so this editor's "Save changes" can't
          // silently drop a thread summary this item already had, even though
          // this editor has no visible control for it.
          threadSummary: (rowEl.querySelector(".standup-save-edit-summary")?.value || "").trim() || null,
          // Same round-trip treatment for the requester name (2026-08-09) -
          // see standupSaveEditRowHtml's own comment.
          requesterName: (rowEl.querySelector(".standup-save-edit-requester")?.value || "").trim() || null,
        };
      })
      .filter((i) => i.text);
    const saveBtn = e.target.closest(".standup-save-entries-save");
    const statusEl = entriesEl.querySelector(".standup-save-entries-status");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    if (statusEl) statusEl.textContent = "";

    // Keeps whatever intro is already saved for this day (or generates one
    // fresh if it never had one) and rebuilds the auto-generated per-tag +
    // location breakdown from the just-edited items - same "always reflects
    // the latest edits" spirit as standupRefreshReportIfGenerated() in the
    // live Report step, just for a saved day instead of the live checklist.
    // The Summary editor above has its own separate Save for hand-editing
    // the intro text itself; this only ever touches `items`/`reportHtml`/
    // `summaryIntroText` together in one write so they can't drift out of
    // sync with each other.
    // Fallback intro (2026-08-18) is now Issue-tab-sourced - see
    // standupSaveFallbackIntroText's own comment for why this replaced the
    // old checklist-based buildStandupSummaryIntroText() call here.
    const introText =
      typeof save.summaryIntroText === "string" && save.summaryIntroText
        ? save.summaryIntroText
        : await standupSaveFallbackIntroText();
    const reportHtml = buildStandupReportHtml(items, introText, save.date);

    saveStandupReportFn({
      date: save.date,
      items,
      reportHtml,
      emailSubject: save.emailSubject || null,
      emailBody: save.emailBody || null,
      summaryIntroText: introText,
    })
      .then(async () => {
        // Reflected locally right away (same "don't wait for the onSnapshot
        // round-trip" pattern used elsewhere in this file, e.g.
        // addStandupLocationFn's success handler) - updates save.items/
        // save.reportHtml/save.summaryIntroText on the shared allStandupSaves
        // entry, then re-renders this row's Summary section, re-checks for
        // new location candidates, and rebuilds this Entries section itself,
        // all in place, so a newly added/edited task shows up under Summary
        // for Kuan Goh immediately instead of only after the eventual
        // onSnapshot re-render (which would also collapse every open panel).
        save.items = items;
        save.reportHtml = reportHtml;
        save.summaryIntroText = introText;
        const summaryEl = row.querySelector(".standup-save-summary-edit");
        if (summaryEl) summaryEl.innerHTML = await buildStandupSaveSummaryEditorHtml(save);
        standupRenderSaveLocationCandidates(row, save);
        entriesEl.innerHTML = buildStandupSaveEntriesEditorHtml(save);
      })
      .catch((err) => {
        console.error(err);
        saveBtn.disabled = false;
        saveBtn.textContent = "Save changes";
        if (statusEl) statusEl.textContent = "Could not save: " + (err?.message || "Something went wrong.");
      });
    return;
  }

  if (e.target.closest(".standup-save-summary-cancel")) {
    const summaryEl = row.querySelector(".standup-save-summary-edit");
    if (summaryEl) summaryEl.innerHTML = await buildStandupSaveSummaryEditorHtml(save);
    return;
  }

  if (e.target.closest(".standup-save-summary-save")) {
    const summaryEl = row.querySelector(".standup-save-summary-edit");
    if (!summaryEl) return;
    const introText = (summaryEl.querySelector(".standup-save-summary-intro")?.value || "").trim();
    const saveBtn = e.target.closest(".standup-save-summary-save");
    const statusEl = summaryEl.querySelector(".standup-save-summary-status");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    if (statusEl) statusEl.textContent = "";
    const items = Array.isArray(save.items) ? save.items : [];
    const reportHtml = buildStandupReportHtml(items, introText, save.date);
    saveStandupReportFn({
      date: save.date,
      items,
      reportHtml,
      emailSubject: save.emailSubject || null,
      emailBody: save.emailBody || null,
      summaryIntroText: introText,
    })
      .then(async () => {
        save.reportHtml = reportHtml;
        save.summaryIntroText = introText;
        summaryEl.innerHTML = await buildStandupSaveSummaryEditorHtml(save);
      })
      .catch((err) => {
        console.error(err);
        saveBtn.disabled = false;
        saveBtn.textContent = "Save changes";
        if (statusEl) statusEl.textContent = "Could not save: " + (err?.message || "Something went wrong.");
      });
    return;
  }

  if (e.target.closest(".standup-save-location-skip-btn")) {
    e.target.closest(".standup-save-location-candidate-row")?.remove();
    return;
  }

  if (e.target.closest(".standup-save-location-add-btn")) {
    const addBtn = e.target.closest(".standup-save-location-add-btn");
    const candidateRow = addBtn.closest(".standup-save-location-candidate-row");
    const labelInput = candidateRow?.querySelector(".standup-save-location-label-input");
    const label = (labelInput?.value || "").trim();
    if (!label) return;
    const state = addBtn.dataset.state;
    candidateRow.querySelectorAll("button, input").forEach((elx) => (elx.disabled = true));
    addStandupLocationFn({ label, state })
      .then(async () => {
        // Reflected locally right away, same as Step 1's own "ask before
        // adding" handler - so this day's Summary section groups the
        // newly-recognized location under its own heading immediately
        // instead of waiting on the standupLocationCatalog onSnapshot
        // round-trip.
        allStandupCustomLocations.push({ label, state });
        standupRebuildLocationIndex();
        candidateRow.remove();
        const summaryEl = row.querySelector(".standup-save-summary-edit");
        if (summaryEl) summaryEl.innerHTML = await buildStandupSaveSummaryEditorHtml(save);
      })
      .catch((err) => {
        console.error(err);
        candidateRow.querySelectorAll("button, input").forEach((elx) => (elx.disabled = false));
        alert("Could not add: " + (err?.message || "Something went wrong."));
      });
    return;
  }

  if (e.target.closest(".standup-save-export-summary")) {
    // Downloads this day's saved report snapshot (which already includes
    // the boss-summary block addressed to Kuan Goh - see the "Boss summary"
    // rule in the project README) as a standalone .html file, same
    // Blob+<a download> pattern as the live Report step's own "Download
    // HTML" button (standupDownloadHtmlBtn), just sourced from save.reportHtml
    // instead of the live standupReportHtml.
    if (!save.reportHtml) {
      alert("No report snapshot was saved for this day, so there's nothing to export.");
      return;
    }
    const stamp = standupDateToFilenameStamp(save.date);
    const blob = new Blob([save.reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Huy_Nguyen_Standup_${stamp}_Summary_for_Kuan_Goh.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (e.target.closest(".standup-save-load")) {
    // Restores this day's items back into the editable checklist in the Pull
    // step - fullBody isn't part of what's saved (see saveStandupReport's
    // sanitizedItems), so there's nothing to show in that step's "View
    // request" toggle for a loaded-from-Saved item.
    standupChecklistItems = (save.items || []).map((i, idx) => ({
      id: `saved-${save.id}-${idx}`,
      text: i.text,
      tag: i.tag,
      // Restores the full multi-select tags array (2026-08-18) when the
      // saved doc has one; falls back to the legacy single tag for a day
      // saved before multi-tag support existed - standupItemTags() would
      // apply the same fallback anyway, but setting it explicitly here means
      // every row loaded from Saved always has a real tags array up front.
      tags: Array.isArray(i.tags) && i.tags.length ? i.tags : [i.tag || "other"],
      included: i.included !== false,
      fullBody: "",
      locationOverride: i.locationOverride || null,
      // Restores whatever thread summary was last saved for this row (2026-
      // 08-07) - always sets the key (even to null) so the checklist's
      // editable summary box shows for every row loaded from a Saved day,
      // matching hasSummarySlot in renderStandupChecklist.
      threadSummary: i.threadSummary || null,
      // Restores whatever requester name was resolved and saved for this
      // row (2026-08-09) - standupRequesterName(item) reads this straight
      // back rather than needing item.initial, which (like fullBody above)
      // was never part of what's saved. Without this, a task pulled with a
      // real requester would silently lose that name the moment it's
      // loaded back in from a Saved day - Huy asked for Load-into-Checklist
      // to match a fresh Pull with Summary, and this is the missing piece.
      requesterName: i.requesterName || null,
      // 2026-09-11: restores the full ordered thread saved alongside this
      // row (see saveCurrentStandupSnapshot's own conversationMessages
      // field), so "View Conversation" still works after a Load - falls
      // back to [] for a day saved before this field existed.
      conversationMessages: Array.isArray(i.conversationMessages) ? i.conversationMessages : [],
    }));
    standupLastPulledDate = save.date;
    // A loaded-from-Saved day is always exactly one day - reset the
    // multi-day queue (2026-08-10) to just that day so the date chips/badges
    // reflect reality instead of whatever was queued before Load was clicked.
    standupLastPulledDates = [save.date];
    standupSelectedDates = [save.date];
    if (standupDateInput) standupDateInput.value = save.date;
    renderStandupDateChips();
    // Jump to the Pull step (reuses the nav's own click handler so the
    // panel-switch/re-render logic stays in one place).
    standupWorkflowNavEl?.querySelector('[data-step="pull"]')?.click();
    return;
  }

  if (e.target.closest(".standup-save-export")) {
    // Historical snapshot, not live state - export straight from save.items
    // (the same { text, tag, included } shape saveStandupReport sanitized
    // into) rather than standupChecklistItems, since Load-into-Checklist
    // hasn't necessarily been clicked for this row. Passes save.summaryIntroText
    // (2026-08-08) so Sheet 1 uses this day's actual saved/edited intro
    // when it has one, same fallback-to-freshly-generated behavior as
    // buildStandupSaveSummaryEditorHtml above.
    try {
      await exportStandupToExcel(save.date, save.items || [], save.summaryIntroText || null);
    } catch (err) {
      console.error(err);
      alert("Could not export to Excel: " + (err?.message || "Something went wrong."));
    }
    return;
  }

  if (e.target.closest(".standup-save-delete")) {
    // Same confirm()-then-callable pattern as deleteRoadmapItem/"Remove
    // access"/"Remove attachment" elsewhere in this file. No optimistic
    // removal from allStandupSaves here - the standupSaves onSnapshot
    // listener (subscribeToStandupSaves) already re-renders this list the
    // moment the delete actually lands in Firestore, so there's nothing
    // else to do on success. On failure the row is simply left as-is.
    if (!confirm(`Delete the saved standup for ${standupDateToMMDDYYYY(save.date)}? This can't be undone.`)) return;
    const deleteBtn = e.target.closest(".standup-save-delete");
    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting…";
    deleteStandupSaveFn({ date: save.date }).catch((err) => {
      console.error(err);
      alert("Could not delete: " + (err?.message || "Something went wrong."));
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete";
    });
  }
});

// Location field for a "View report" entries-editor row (see
// standupSaveEditRowHtml) - same "empty until you type" datalist pattern as
// the live checklist's own .standup-task-location input above
// (populateLocationDatalist), just scoped to this panel's own container.
standupSavedListEl?.addEventListener("input", (e) => {
  if (!e.target.classList.contains("standup-save-edit-location")) return;
  const row = e.target.closest(".standup-save-edit-row");
  populateLocationDatalist(row?.querySelector("datalist"), e.target.value.trim());
});

// "+ New tag…" for a "View report" entries-editor row's tag <select> - same
// Multi-select tag picker's checkboxes need no listener of their own here -
// checked/unchecked state is read straight off the DOM at Save time (see the
// .standup-save-entries-save handler above) rather than mirrored into any
// backing data model. Only "+ New tag…" needs a handler, to insert a
// checkbox for the newly-created (or reused) tag - "reuse an existing tag
// whose label matches case-insensitively" is the same fix as the live
// checklist's own "+ New tag…" flow (standupPromptAddTagToItem), adapted
// here for a plain DOM row instead of a standupChecklistItems entry.
standupSavedListEl?.addEventListener("click", (e) => {
  const addTagBtn = e.target.closest(".standup-save-edit-tag-add");
  if (!addTagBtn) return;
  const row = addTagBtn.closest(".standup-save-edit-row");
  if (!row) return;
  const label = (prompt("New tag name:") || "").trim();
  if (!label) return;
  const insertCheckbox = (key, text, color) => {
    let checkbox = row.querySelector(`.standup-save-edit-tag-option[value="${key}"]`);
    if (checkbox) {
      checkbox.checked = true;
      return;
    }
    const optLabel = document.createElement("label");
    optLabel.style.cssText = "display:flex; align-items:center; gap:6px; padding:3px 4px; font-size:12px; white-space:nowrap; cursor:pointer;";
    optLabel.innerHTML = `<input type="checkbox" class="standup-save-edit-tag-option" value="${key}" checked />
      <span style="width:8px; height:8px; border-radius:50%; background:${color}; flex-shrink:0;"></span>${escapeHtml(text)}`;
    addTagBtn.parentElement.insertBefore(optLabel, addTagBtn);
  };
  const normalizedLabel = label.toLowerCase();
  const existingTag = standupAllTags().find((t) => t.label.trim().toLowerCase() === normalizedLabel);
  if (existingTag) {
    insertCheckbox(existingTag.key, existingTag.label, existingTag.color);
    return;
  }
  const color = standupNextTagColor();
  addTagBtn.disabled = true;
  addSharedTagFn({ label, color })
    .then((res) => {
      // Reflected locally right away, same as the live checklist's own
      // "+ New tag…" success handler, rather than waiting on the
      // sharedTagCatalog onSnapshot round-trip.
      if (!allSharedCustomTags.some((t) => t.id === res.data.id)) {
        allSharedCustomTags.push({ id: res.data.id, label, color });
      }
      insertCheckbox(`custom:${res.data.id}`, label, color);
      addTagBtn.disabled = false;
    })
    .catch((err) => {
      console.error(err);
      alert("Could not add tag: " + (err?.message || "Something went wrong."));
      addTagBtn.disabled = false;
    });
});

// ============================================================================
// Daily To-Do tab: voice-or-typed to-do entries logged through the day
// (browser Web Speech API - fully client-side, no audio ever leaves the
// browser), rolled into an end-of-day report with the same
// Log/Report/Saved shape as the Standup tab above, but no mail sync or tags
// of its own. Reuses standupDateToMMDDYYYY/standupDateToFilenameStamp (pure
// date formatters, nothing Standup-specific about them).
// ============================================================================

// One nav button per workflow step - same pure-navigation pattern as
// STANDUP_STEP_PANELS above.
const DAILY_TODO_STEP_PANELS = {
  log: dailyTodoLogPanelEl,
  report: dailyTodoReportPanelEl,
  saved: dailyTodoSavedPanelEl,
};
let currentDailyTodoStep = "log";

dailyTodoWorkflowNavEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  currentDailyTodoStep = btn.dataset.step;
  dailyTodoWorkflowNavEl.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  Object.entries(DAILY_TODO_STEP_PANELS).forEach(([step, el]) => {
    if (el) el.style.display = step === currentDailyTodoStep ? "block" : "none";
  });
  if (currentDailyTodoStep === "log") renderDailyTodoList();
  if (currentDailyTodoStep === "saved") renderDailyTodoSavedList();
});

// ---- Step 1: Log -----------------------------------------------------------

// In-memory only until Save (step 2) persists it - same "ephemeral until
// saved" model as standupChecklistItems. Defaults to "today"; overwritten
// wholesale when a past day is loaded back in from step 3.
let dailyTodoEntries = [];
let dailyTodoTargetDateValue = null;

function ensureDailyTodoDateDefault() {
  if (dailyTodoTargetDateValue) return;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  dailyTodoTargetDateValue = `${yyyy}-${mm}-${dd}`;
}

function dailyTodoTargetDate() {
  ensureDailyTodoDateDefault();
  return dailyTodoTargetDateValue;
}

function dailyTodoNowTimeLabel() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Daily To-Do's own tag set - the same 8 fixed STANDUP_TAGS reused verbatim
// as a starter set (identical labels/colors, no need to duplicate them),
// plus whatever's been added to the shared runtime-growable catalog (see
// sharedAllTags() in the Standup tab section above for the 2026-08-10
// unification write-up - this tab's custom tags used to live in their own
// separate dailyTodoTagCatalog, and the "Add to Standup checklist"/Standup's
// own "Transfer to Issue" bridges used to force/drop tags because of that
// separation; both now carry over whatever tag is actually picked).
function dailyTodoAllTags() {
  return sharedAllTags();
}

// Fixed palette so a newly-created custom tag gets some color distinct from
// the built-in 8 without Huy needing to pick one by hand - there's no
// semantic mapping for a freeform tag the way "critical" -> red has.
// Expanded from 8 to 16 (2026-08-10) so sharedNextTagColor() (see above) has
// more room to find an unused color before it has to fall back to a
// generated hue.
const CUSTOM_TAG_COLOR_PALETTE = [
  "#0ea5e9", "#84cc16", "#f97316", "#8b5cf6", "#14b8a6", "#f43f5e", "#64748b", "#eab308",
  "#4f46e5", "#c026d3", "#059669", "#0891b2", "#a16207", "#65a30d", "#be123c", "#7c3aed",
];
function dailyTodoNextTagColor() {
  return sharedNextTagColor();
}

// `<option>`s for a row's tag select - a blank "No tag" default (matching
// the location field's own "blank = Auto-detect" convention), every known
// tag (built-in + custom), then a trailing "+ New tag..." action that isn't
// a real tag at all - picking it is intercepted by the change listener
// below before item.tag is ever set to "__new__".
function dailyTodoTagOptionsHtml(selectedTag) {
  const blank = `<option value="" ${!selectedTag ? "selected" : ""}>No tag</option>`;
  const known = dailyTodoAllTags()
    .map((t) => `<option value="${t.key}" ${t.key === selectedTag ? "selected" : ""}>${escapeHtml(t.label)}</option>`)
    .join("");
  return `${blank}${known}<option value="__new__">+ New tag…</option>`;
}

// Issue tab's own tag set - the shared runtime-growable catalog (see
// sharedAllTags() above) plus the fixed 8 STANDUP_TAGS, kept in issueAllTags()
// itself purely so an issue tagged with one of those 8 from before
// 2026-08-10 still resolves to the right label/color wherever a tag is
// *displayed* (card pill, Excel export, etc. - see the two issueAllTags()
// call sites below). This tab's custom tags used to live in their own
// separate issueTagCatalog before the 2026-08-10 unification.
function issueAllTags() {
  return sharedAllTags();
}

function issueNextTagColor() {
  return sharedNextTagColor();
}

// 2026-08-10 follow-up, per Huy: Issue shouldn't keep offering the fixed 8
// starter tags as new picks - just the custom ones as they're created, each
// with its own auto-assigned color (sharedNextTagColor() above already does
// this), sorted alphabetically so the list stays easy to scan as it grows.
// Deliberately separate from issueAllTags() above, which still needs to
// resolve the fixed 8 for anything already tagged with one of them.
function issueSelectableTags() {
  return allSharedCustomTags
    .map((t) => ({ key: `custom:${t.id}`, label: t.label, color: t.color || "#6b7280" }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Same shape as dailyTodoTagOptionsHtml above, but built from
// issueSelectableTags() (custom tags only, sorted) rather than
// issueAllTags() - see the comment on that function above for why. If the
// item passed in is already tagged with one of the fixed 8 (from before this
// change), that tag is injected as its own "(legacy)"-labeled option so it
// stays selected/visible instead of silently reverting to "No tag" the
// moment this renders - it just won't show up as a pickable option for a
// tag change going forward.
function issueTagOptionsHtml(selectedTag) {
  const blank = `<option value="" ${!selectedTag ? "selected" : ""}>No tag</option>`;
  const selectable = issueSelectableTags();
  const legacyFixedTag = selectedTag && !selectable.some((t) => t.key === selectedTag)
    ? STANDUP_TAGS.find((t) => t.key === selectedTag)
    : null;
  const known = selectable
    .map((t) => `<option value="${t.key}" ${t.key === selectedTag ? "selected" : ""}>${escapeHtml(t.label)}</option>`)
    .join("");
  const legacy = legacyFixedTag
    ? `<option value="${legacyFixedTag.key}" selected>${escapeHtml(legacyFixedTag.label)} (legacy)</option>`
    : "";
  return `${blank}${known}${legacy}<option value="__new__">+ New tag…</option>`;
}

function renderDailyTodoList() {
  if (!dailyTodoListEl) return;
  if (!dailyTodoEntries.length) {
    dailyTodoListEl.innerHTML = `<p style="font-size:13px; color:var(--text); text-align:center;">Nothing logged yet — hit "Start recording" and talk, or add a task manually.</p>`;
    return;
  }
  dailyTodoListEl.innerHTML = dailyTodoEntries
    .map((item) => {
      const tagInfo = dailyTodoAllTags().find((t) => t.key === item.tag);
      return `<div class="daily-todo-row" data-id="${item.id}" style="padding:8px; border:1px solid var(--border); border-radius:8px; margin-bottom:6px; background:var(--surface);">
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="checkbox" class="daily-todo-included" ${item.included ? "checked" : ""} />
          <span style="font-size:11px; color:var(--text); width:60px; flex-shrink:0;">${escapeHtml(item.time || "")}</span>
          <span style="width:10px; height:10px; border-radius:50%; background:${tagInfo ? tagInfo.color : "#6b6b70"}; flex-shrink:0;"></span>
          <input type="text" class="daily-todo-text" value="${escapeHtml(item.text)}" style="flex:1; min-width:120px; padding:6px 8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:6px; font-size:13px;" />
          <select class="daily-todo-tag" style="padding:6px 8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:6px; font-size:12px;">${dailyTodoTagOptionsHtml(item.tag)}</select>
          <button type="button" class="daily-todo-remove secondary" style="font-size:12px; padding:4px 8px;">Remove</button>
        </div>
        <div style="display:flex; gap:6px; align-items:center; margin:6px 0 0 68px;">
          <span style="font-size:11px; color:var(--text);">📍</span>
          ${locationInputHtml("daily-todo-location", `daily-todo-loc-opts-${item.id}`, item.locationOverride)}
        </div>
      </div>`;
    })
    .join("");
}

dailyTodoListEl?.addEventListener("input", (e) => {
  const row = e.target.closest(".daily-todo-row");
  const item = dailyTodoEntries.find((i) => i.id === row?.dataset.id);
  if (!item) return;
  if (e.target.classList.contains("daily-todo-text")) {
    item.text = e.target.value;
  }
  if (e.target.classList.contains("daily-todo-location")) {
    // "" means "back to Auto-detect" - stored as null so
    // effectiveEntryLocation falls through to detectEntryLocationLabel
    // again. Live on every keystroke, matching the text field above.
    item.locationOverride = e.target.value.trim() || null;
    const datalist = row.querySelector("datalist");
    populateLocationDatalist(datalist, e.target.value.trim());
  }
});

dailyTodoListEl?.addEventListener("change", (e) => {
  const row = e.target.closest(".daily-todo-row");
  const item = dailyTodoEntries.find((i) => i.id === row?.dataset.id);
  if (!item) return;
  if (e.target.classList.contains("daily-todo-included")) {
    item.included = e.target.checked;
  }
  if (e.target.classList.contains("daily-todo-tag")) {
    if (e.target.value === "__new__") {
      const label = (prompt("New tag name:") || "").trim();
      if (!label) {
        renderDailyTodoList(); // revert the select back to its previous value
        return;
      }
      // Reuse an existing tag (built-in or custom, from any tab, since the
      // catalog is shared) whose label matches case-insensitively instead of
      // creating a duplicate - same client-side check as Standup's own
      // tag-change handler; addSharedTag enforces this server-side too.
      const normalizedLabel = label.toLowerCase();
      const existingTag = dailyTodoAllTags().find((t) => t.label.trim().toLowerCase() === normalizedLabel);
      if (existingTag) {
        item.tag = existingTag.key;
        renderDailyTodoList();
        return;
      }
      const color = dailyTodoNextTagColor();
      addSharedTagFn({ label, color })
        .then((res) => {
          // Reflected locally right away, same as addStandupLocationFn's
          // success handler does for locations, rather than waiting on the
          // sharedTagCatalog onSnapshot round-trip.
          if (!allSharedCustomTags.some((t) => t.id === res.data.id)) {
            allSharedCustomTags.push({ id: res.data.id, label, color });
          }
          item.tag = `custom:${res.data.id}`;
          renderDailyTodoList();
        })
        .catch((err) => {
          console.error(err);
          alert("Could not add tag: " + (err?.message || "Something went wrong."));
          renderDailyTodoList();
        });
      return;
    }
    item.tag = e.target.value || null;
    renderDailyTodoList(); // re-render so the row's colored dot follows the new tag
  }
});

dailyTodoListEl?.addEventListener("click", (e) => {
  const removeBtn = e.target.closest(".daily-todo-remove");
  if (!removeBtn) return;
  const row = removeBtn.closest(".daily-todo-row");
  dailyTodoEntries = dailyTodoEntries.filter((i) => i.id !== row.dataset.id);
  renderDailyTodoList();
});

function addDailyTodoEntry(text) {
  dailyTodoEntries.push({
    id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: text || "",
    time: dailyTodoNowTimeLabel(),
    included: true,
    locationOverride: null,
    tag: null,
  });
  renderDailyTodoList();
}

dailyTodoAddTaskBtn?.addEventListener("click", () => {
  addDailyTodoEntry("");
  const textInputs = dailyTodoListEl?.querySelectorAll(".daily-todo-text");
  textInputs?.[textInputs.length - 1]?.focus();
});

// ---- Step 1 (cont'd): voice capture via the browser's own Web Speech API --
// Entirely client-side - transcription happens in the browser, nothing
// audio-related is ever sent anywhere. Chrome/Edge only (Firefox/Safari
// don't implement SpeechRecognition) - updateDailyTodoMicAvailability
// disables the button and explains the manual "+ Add task" fallback for
// unsupported browsers instead of failing silently.
const DailyTodoSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let dailyTodoRecognition = null;
let dailyTodoRecording = false;
// True only once the Stop button (or an unrecoverable mic error) has
// actually asked the session to end - lets onend below tell "Chrome ended
// this on its own" apart from "Huy pressed Stop", since only the latter
// should really stop things.
let dailyTodoStopRequested = false;
// The id of the one entry the current recording session is building up -
// null between recordings (so the next phrase starts a fresh entry) and set
// on the first phrase of a session (so every phrase after that appends onto
// the same entry instead of creating a new row). Deliberately module-level
// rather than local to a single SpeechRecognition instance, since Chrome's
// silence-triggered auto-restart (see startDailyTodoRecognitionSession's
// onend below) spins up a brand-new instance mid-session - this is what
// keeps everything said across those restarts landing in the same entry,
// with only an actual Stop/Start ever starting a new one.
let dailyTodoLiveEntryId = null;

// Appends onto the in-progress entry for this recording session, starting a
// new one the first time it's called (or if that entry was removed by hand
// mid-recording) - this is what turns "record until Stop" into one growing
// entry instead of a new row every time the speech engine finalizes a phrase.
function appendToDailyTodoLiveEntry(text) {
  const liveItem = dailyTodoLiveEntryId && dailyTodoEntries.find((i) => i.id === dailyTodoLiveEntryId);
  if (liveItem) {
    liveItem.text = liveItem.text ? `${liveItem.text} ${text}` : text;
    renderDailyTodoList();
    return;
  }
  addDailyTodoEntry(text);
  dailyTodoLiveEntryId = dailyTodoEntries[dailyTodoEntries.length - 1].id;
}

function updateDailyTodoMicAvailability() {
  if (!dailyTodoMicBtn) return;
  if (!DailyTodoSpeechRecognition) {
    dailyTodoMicBtn.disabled = true;
    dailyTodoMicBtn.textContent = "🎙️ Voice not supported in this browser";
    if (dailyTodoMicStatusEl) {
      dailyTodoMicStatusEl.textContent = "Try Chrome or Edge for voice logging, or use \"+ Add task\" to type instead.";
    }
  }
}

// Resets the button/status back to "not recording" - split out from
// stopDailyTodoRecording() below so onend can call it once the session has
// actually finished, without itself calling .stop() again.
function resetDailyTodoRecordingUi() {
  dailyTodoRecording = false;
  dailyTodoStopRequested = false;
  // Ends this recording session's live entry - the next recording starts a
  // brand-new one rather than continuing to append to this one.
  dailyTodoLiveEntryId = null;
  if (dailyTodoMicBtn) dailyTodoMicBtn.textContent = "🎙️ Start recording";
  if (dailyTodoMicStatusEl) dailyTodoMicStatusEl.textContent = "";
}

// Only ever called from the Stop button (or an unrecoverable error) - marks
// the session as deliberately ending so onend's auto-restart below backs off
// instead of starting yet another session.
function stopDailyTodoRecording() {
  dailyTodoStopRequested = true;
  if (dailyTodoRecognition) {
    try {
      dailyTodoRecognition.stop();
    } catch (err) {
      console.error(err);
      resetDailyTodoRecordingUi();
    }
  } else {
    resetDailyTodoRecordingUi();
  }
}

// Chrome (and most SpeechRecognition implementations) auto-ends a session
// after a stretch of silence even with continuous:true - by default that
// looked to Huy like recording had silently stopped mid-day. Per his
// request, recording should keep going until he actually presses Stop, so
// each SpeechRecognition instance is single-use (onend below immediately
// spins up a fresh one) rather than trying to keep one instance alive
// indefinitely - only dailyTodoStopRequested (set by the Stop button or an
// unrecoverable error) breaks that loop.
function startDailyTodoRecognitionSession() {
  dailyTodoRecognition = new DailyTodoSpeechRecognition();
  dailyTodoRecognition.continuous = true;
  dailyTodoRecognition.interimResults = false;
  dailyTodoRecognition.lang = "en-US";

  dailyTodoRecognition.onresult = (event) => {
    // Only the newly-finalized results in this event, not the whole
    // transcript-so-far - each finalized phrase gets appended onto this
    // session's one live entry (see appendToDailyTodoLiveEntry) rather than
    // becoming its own row, since the speech engine finalizes a phrase every
    // time you pause, not just when you press Stop.
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        const text = result[0]?.transcript?.trim();
        if (text) appendToDailyTodoLiveEntry(text);
      }
    }
  };

  dailyTodoRecognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    // Permission/hardware errors are unrecoverable - stop for real instead
    // of looping restart attempts forever. Everything else (e.g.
    // "no-speech", "network", "aborted") is left to onend just below to
    // auto-restart, since those fire immediately before onend anyway.
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
      dailyTodoStopRequested = true;
      if (dailyTodoMicStatusEl) dailyTodoMicStatusEl.textContent = `Mic error: ${event.error}`;
    }
  };

  dailyTodoRecognition.onend = () => {
    if (dailyTodoStopRequested || !dailyTodoRecording) {
      resetDailyTodoRecordingUi();
      return;
    }
    try {
      startDailyTodoRecognitionSession();
    } catch (err) {
      console.error(err);
      resetDailyTodoRecordingUi();
    }
  };

  dailyTodoRecognition.start();
}

dailyTodoMicBtn?.addEventListener("click", () => {
  if (!DailyTodoSpeechRecognition) return;

  if (dailyTodoRecording) {
    stopDailyTodoRecording();
    return;
  }

  dailyTodoRecording = true;
  dailyTodoStopRequested = false;
  try {
    startDailyTodoRecognitionSession();
    if (dailyTodoMicBtn) dailyTodoMicBtn.textContent = "⏹️ Stop recording";
    if (dailyTodoMicStatusEl) dailyTodoMicStatusEl.textContent = "Listening…";
  } catch (err) {
    console.error(err);
    if (dailyTodoMicStatusEl) dailyTodoMicStatusEl.textContent = "Could not start the mic — check browser permissions.";
    resetDailyTodoRecordingUi();
  }
});

// ---- Step 2: Report ---------------------------------------------------------

function dailyTodoIncludedEntries() {
  return dailyTodoEntries.filter((i) => i.included && i.text.trim());
}

function dailyTodoHasIncludedEntries() {
  return dailyTodoEntries.some((i) => i.included && i.text.trim());
}

function dailyTodoReportFilename() {
  const dateStr = dailyTodoTargetDate();
  return `Daily-To-Do-${dateStr ? standupDateToFilenameStamp(dateStr) : "report"}`;
}

// Renders one entry as a small time+text card - shared by every group below
// (matched locations and the trailing "Unassigned" bucket alike).
function dailyTodoEntryCardHtml(i) {
  return `<div class="card" style="border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-bottom:8px; font-size:14px; color:#0f172a; display:flex; gap:10px;">
    <span style="font-size:12px; color:#0f172a; flex-shrink:0; width:70px;">${escapeHtml(i.time || "")}</span>
    <span>${escapeHtml(i.text)}</span>
  </div>`;
}

// Grouped by location (2026-08-05 request) - matched/manually-assigned
// locations first (CA state first, then alphabetically - see
// groupItemsByLocation), with an "Unassigned" bucket last for anything that
// didn't auto-match and wasn't manually picked in its row's dropdown. Unlike
// Standup's own summary breakdown (which can afford to just drop unmatched
// items, since they're still visible in its tag sections), Daily To-Do has
// no other section for an unmatched item to fall back into - it has to show
// up somewhere, hence the Unassigned bucket rather than leaving it out.
function buildDailyTodoReportHtml() {
  const dateStr = dailyTodoTargetDate();
  const mmddyyyy = dateStr ? standupDateToMMDDYYYY(dateStr) : "";
  const items = dailyTodoIncludedEntries();
  const { groups, unassigned } = groupItemsByLocation(items);

  const groupSection = (label, groupItems) => `<div style="margin-bottom:22px;">
    <div style="font-weight:700; font-size:15px; color:#0f172a; margin-bottom:8px; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">${escapeHtml(label)}</div>
    ${groupItems.map(dailyTodoEntryCardHtml).join("")}
  </div>`;

  const sections = [
    ...groups.map((g) => groupSection(g.label, g.items)),
    unassigned.length ? groupSection("Unassigned", unassigned) : "",
  ]
    .filter(Boolean)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Daily To-Do - ${mmddyyyy}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#0f172a; margin: 28px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .subtitle { font-size:13px; color:#0f172a; margin-bottom:24px; }
</style>
</head>
<body>
  <h1>Daily To-Do - ${mmddyyyy}</h1>
  <div class="subtitle">Huy Nguyen &middot; ${items.length} item${items.length === 1 ? "" : "s"} logged</div>
  ${sections || '<p style="color:#0f172a;">No items checked off in step 1\'s log.</p>'}
</body>
</html>`;
}

let dailyTodoReportHtml = null;

function dailyTodoRefreshReportIfGenerated() {
  if (dailyTodoReportHtml === null) return;
  dailyTodoReportHtml = buildDailyTodoReportHtml();
  const frame = document.getElementById("dailyTodoReportFrame");
  if (frame) frame.srcdoc = dailyTodoReportHtml;
}

dailyTodoGenerateReportBtn?.addEventListener("click", () => {
  if (!dailyTodoHasIncludedEntries()) {
    if (dailyTodoReportStatusEl) {
      dailyTodoReportStatusEl.textContent = "Nothing to report — check off or add at least one item in step 1's log first.";
    }
    return;
  }
  dailyTodoReportHtml = buildDailyTodoReportHtml();
  if (dailyTodoReportPreviewEl) {
    dailyTodoReportPreviewEl.innerHTML =
      '<iframe id="dailyTodoReportFrame" style="width:100%; height:600px; border:1px solid var(--border); border-radius:8px; background:var(--surface-2);"></iframe>';
    document.getElementById("dailyTodoReportFrame").srcdoc = dailyTodoReportHtml;
  }
  if (dailyTodoDownloadHtmlBtn) dailyTodoDownloadHtmlBtn.style.display = "";
  if (dailyTodoExportExcelBtn) dailyTodoExportExcelBtn.style.display = "";
  if (dailyTodoSaveBtn) dailyTodoSaveBtn.style.display = "";
  if (dailyTodoAddToStandupBtn) dailyTodoAddToStandupBtn.style.display = "";
  if (dailyTodoReportStatusEl) dailyTodoReportStatusEl.textContent = `Ready: ${dailyTodoReportFilename()}.html`;
});

dailyTodoDownloadHtmlBtn?.addEventListener("click", () => {
  dailyTodoRefreshReportIfGenerated();
  if (!dailyTodoReportHtml) return;
  const blob = new Blob([dailyTodoReportHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dailyTodoReportFilename()}.html`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---- Excel export (2026-08-06) ---------------------------------------------
// Same SheetJS conventions as Standup's own export (see the big comment
// above standupExcelSheetName) - free-build limitations (no cell styles, so
// lean on !cols/!rows/!merges), per-calendar-day version-stamped filename via
// localStorage so re-exporting the same day never silently overwrites a
// prior file. Grouped by *location* instead of tag - Daily To-Do entries do
// carry their own tag (the shared tag catalog + the Log list row's tag
// select, see docs/tag-feature.md), it's just never used for grouping/export
// here, same as the report - same groupItemsByLocation() used by the report.
//
// Unlike STANDUP_TAGS (8 short, fixed, never-colliding labels), location
// labels are full street addresses - often well over Excel's 31-char sheet
// name cap, and two different long addresses can truncate down to the same
// 31 characters. dailyTodoExcelSheetName tracks every name already used in
// this workbook and appends a " (2)"-style suffix on collision, unlike
// standupExcelSheetName which never needed to.
function dailyTodoExcelSheetName(usedNames, label) {
  const base = (label || "Unassigned").replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
  let name = base;
  let n = 2;
  while (usedNames.has(name)) {
    const suffix = ` (${n})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  usedNames.add(name);
  return name;
}

function nextDailyTodoExportFileTag(dateStr) {
  const storageKey = "dailyTodoExportCount_" + dateStr;
  const count = parseInt(localStorage.getItem(storageKey) || "0", 10) + 1;
  localStorage.setItem(storageKey, String(count));
  return `V1.${count - 1}`;
}

// entries is any array shaped like dailyTodoEntries/save.entries - both
// carry the same { text, time, included, locationOverride } shape (see
// saveDailyTodo's sanitizedEntries in functions/index.js).
async function buildDailyTodoExcelWorkbook(dateStr, entries) {
  await ensureXLSX();
  const included = (entries || []).filter((i) => i.included !== false && (i.text || "").trim());
  if (!included.length) {
    alert("Nothing to export yet.");
    return null;
  }
  const { groups, unassigned } = groupItemsByLocation(included);

  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set(["Overview"]);

  // Overview sheet first, so opening the file lands on a summary rather than
  // whichever location happens to be alphabetically/positionally first.
  const overviewAoa = [
    [`Daily To-Do — ${standupDateToMMDDYYYY(dateStr)}`],
    [],
    ["Location", "Items"],
    ...groups.map((g) => [g.label, g.items.length]),
    ...(unassigned.length ? [["Unassigned", unassigned.length]] : []),
    ["Total", included.length],
  ];
  const overviewWs = XLSX.utils.aoa_to_sheet(overviewAoa);
  overviewWs["!cols"] = [{ wch: 44 }, { wch: 10 }];
  overviewWs["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  XLSX.utils.book_append_sheet(wb, overviewWs, "Overview");

  const appendGroupSheet = (label, items) => {
    const rows = items.map((i, idx) => ({ "#": idx + 1, Time: i.time || "", Task: i.text }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 5 }, { wch: 10 }, { wch: 90 }];
    // Same "!rows" row-height workaround the Roadmap/Standup exports use -
    // the free SheetJS build can't turn on Wrap Text, so a tall explicit row
    // height is what keeps a multi-line task from visually clipping.
    const headerRow = { hpt: 18 };
    const dataRows = rows.map((row) => ({ hpt: Math.max(1, row.Task.split("\n").length) * 15 }));
    ws["!rows"] = [headerRow, ...dataRows];
    XLSX.utils.book_append_sheet(wb, ws, dailyTodoExcelSheetName(usedSheetNames, label));
  };

  groups.forEach((g) => appendGroupSheet(g.label, g.items));
  if (unassigned.length) appendGroupSheet("Unassigned", unassigned);

  return wb;
}

async function exportDailyTodoToExcel(dateStr, entries) {
  const wb = await buildDailyTodoExcelWorkbook(dateStr, entries);
  if (!wb) return;
  const version = nextDailyTodoExportFileTag(dateStr);
  const stamp = standupDateToFilenameStamp(dateStr);
  XLSX.writeFile(wb, `Huy_Nguyen_DailyToDo_${stamp}_${version}.xlsx`);
}

dailyTodoExportExcelBtn?.addEventListener("click", async () => {
  dailyTodoRefreshReportIfGenerated(); // same "always reflect latest edits" convention as Download HTML/Save
  if (!dailyTodoReportHtml) return;
  try {
    await exportDailyTodoToExcel(dailyTodoTargetDate(), dailyTodoEntries);
  } catch (err) {
    console.error(err);
    if (dailyTodoReportStatusEl) dailyTodoReportStatusEl.textContent = "Could not export to Excel: " + (err?.message || "Something went wrong.");
  }
});

// ---- "Export All" (every saved day, one workbook) --------------------------
// Unlike the single-day export above, this reads straight from
// allDailyTodoSaves (the dailyTodoSaves onSnapshot listener's own in-memory
// cache - see subscribeToDailyTodoSaves) rather than the live log, since the
// point is a consolidated view across every day that's been saved. Still
// "each location gets its own sheet", just with every day's items pooled
// into that same location's sheet (a Date column distinguishes which day
// each row came from) rather than one full sheet set per day.
function nextDailyTodoExportAllFileTag() {
  const dateStr = dateToInputValue(new Date());
  const storageKey = "dailyTodoExportAllCount_" + dateStr;
  const count = parseInt(localStorage.getItem(storageKey) || "0", 10) + 1;
  localStorage.setItem(storageKey, String(count));
  return { dateStr, version: `V1.${count - 1}` };
}

async function buildDailyTodoAllSavesExcelWorkbook(saves) {
  await ensureXLSX();
  if (!saves.length) {
    alert("Nothing saved yet to export.");
    return null;
  }

  // Most recent day first, then working backwards - matches the Saved
  // list's own newest-first display order and Standup's own Export All.
  const sortedSaves = [...saves].sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

  const rowsByLabel = new Map(); // location label -> rows[]
  const unassignedRows = [];
  const overviewRows = [];

  sortedSaves.forEach((save) => {
    const items = (save.entries || []).filter((i) => i.included !== false && (i.text || "").trim());
    const { groups, unassigned } = groupItemsByLocation(items);
    groups.forEach((g) => {
      if (!rowsByLabel.has(g.label)) rowsByLabel.set(g.label, []);
      const bucket = rowsByLabel.get(g.label);
      g.items.forEach((i) => bucket.push({ Date: standupDateToMMDDYYYY(save.date), Time: i.time || "", Task: i.text }));
    });
    unassigned.forEach((i) => unassignedRows.push({ Date: standupDateToMMDDYYYY(save.date), Time: i.time || "", Task: i.text }));
    overviewRows.push({
      Date: standupDateToMMDDYYYY(save.date),
      "Total Items": items.length,
      Unassigned: unassigned.length,
    });
  });

  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set(["Overview"]);

  const overviewWs = XLSX.utils.json_to_sheet(overviewRows);
  overviewWs["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, overviewWs, "Overview");

  const appendPooledSheet = (label, rows) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 90 }];
    const headerRow = { hpt: 18 };
    const dataRows = rows.map((row) => ({ hpt: Math.max(1, row.Task.split("\n").length) * 15 }));
    ws["!rows"] = [headerRow, ...dataRows];
    XLSX.utils.book_append_sheet(wb, ws, dailyTodoExcelSheetName(usedSheetNames, label));
  };

  // CA-state locations first, then alphabetically - same ordering
  // groupItemsByLocation itself uses.
  const sortedLabels = [...rowsByLabel.keys()].sort((a, b) => {
    const stateA = STANDUP_LOCATION_INDEX.find((e) => e.label === a)?.state || "";
    const stateB = STANDUP_LOCATION_INDEX.find((e) => e.label === b)?.state || "";
    const rankA = stateA === "CA" ? 0 : 1;
    const rankB = stateB === "CA" ? 0 : 1;
    return rankA !== rankB ? rankA - rankB : a.localeCompare(b);
  });
  sortedLabels.forEach((label) => appendPooledSheet(label, rowsByLabel.get(label)));
  if (unassignedRows.length) appendPooledSheet("Unassigned", unassignedRows);

  return wb;
}

async function exportAllDailyTodoSavesToExcel() {
  const wb = await buildDailyTodoAllSavesExcelWorkbook(allDailyTodoSaves);
  if (!wb) return;
  const { dateStr, version } = nextDailyTodoExportAllFileTag();
  XLSX.writeFile(wb, `Huy_Nguyen_DailyToDo_AllSaved_${dateStr}_${version}.xlsx`);
}

dailyTodoExportAllBtn?.addEventListener("click", async () => {
  try {
    await exportAllDailyTodoSavesToExcel();
  } catch (err) {
    console.error(err);
    alert("Could not export to Excel: " + (err?.message || "Something went wrong."));
  }
});

async function saveCurrentDailyTodoSnapshot() {
  const dateStr = dailyTodoTargetDate();
  if (!dateStr) throw new Error("No target day set.");
  dailyTodoRefreshReportIfGenerated();
  await saveDailyTodoFn({
    date: dateStr,
    entries: dailyTodoEntries.map((i) => ({ text: i.text, time: i.time, included: i.included, locationOverride: i.locationOverride || null, tag: i.tag || null })),
    reportHtml: dailyTodoReportHtml || null,
  });
}

dailyTodoSaveBtn?.addEventListener("click", async () => {
  if (!dailyTodoReportHtml) {
    if (dailyTodoReportStatusEl) dailyTodoReportStatusEl.textContent = "Generate the report first.";
    return;
  }
  dailyTodoSaveBtn.disabled = true;
  const originalText = dailyTodoSaveBtn.textContent;
  dailyTodoSaveBtn.textContent = "Saving…";
  try {
    await saveCurrentDailyTodoSnapshot();
    dailyTodoSaveBtn.textContent = "Saved ✓";
  } catch (err) {
    dailyTodoSaveBtn.textContent = err?.message || "Save failed";
    console.error(err);
  } finally {
    dailyTodoSaveBtn.disabled = false;
    setTimeout(() => {
      dailyTodoSaveBtn.textContent = originalText;
    }, 2500);
  }
});

// Deliberate one-click, manual bridge into Standup's own Pull-step checklist
// (per Huy's request to review the two side by side rather than have them
// silently merged) - pushes every currently-included Daily To-Do entry in as
// its own Standup checklist row, then leaves Huy on this tab to keep
// reviewing/editing here; switching over to Standup to see them is a
// separate, explicit action. Tag carries over as-is (fixed or custom) as of
// the 2026-08-10 shared-tag-catalog unification - before that, a Daily
// To-Do entry's own tag was keyed against its own now-retired
// dailyTodoTagCatalog, which had no correspondence to Standup's own separate
// catalog, so this used to force every transferred row to "other" regardless
// of what was picked in Daily To-Do; see docs/tag-feature.md.
dailyTodoAddToStandupBtn?.addEventListener("click", () => {
  const items = dailyTodoIncludedEntries();
  if (!items.length) {
    if (dailyTodoReportStatusEl) dailyTodoReportStatusEl.textContent = "Nothing included to add.";
    return;
  }
  items.forEach((i) => {
    standupChecklistItems.push({
      id: `dailytodo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: i.text,
      tag: i.tag || "other",
      included: true,
      // Carries over whatever location was picked/detected back in Daily
      // To-Do, so a manual fix there isn't lost once it lands in Standup.
      locationOverride: i.locationOverride || null,
    });
  });
  renderStandupChecklist();
  if (dailyTodoReportStatusEl) {
    dailyTodoReportStatusEl.textContent = `Added ${items.length} item${items.length === 1 ? "" : "s"} to Standup's checklist — switch to the Standup tab to review.`;
  }
});

// ---- Step 3: Saved -----------------------------------------------------------
// Backed by the dailyTodoSaves onSnapshot listener (subscribeToDailyTodoSaves
// above), not in-memory state like steps 1-2.

function renderDailyTodoSavedList() {
  if (!dailyTodoSavedListEl) return;
  if (!allDailyTodoSaves.length) {
    dailyTodoSavedListEl.innerHTML =
      '<p style="font-size:13px; color:var(--text);">Nothing saved yet — generate a report in step 2, then hit Save.</p>';
    return;
  }
  dailyTodoSavedListEl.innerHTML = allDailyTodoSaves
    .map((save) => {
      const mmddyyyy = standupDateToMMDDYYYY(save.date);
      const count = Array.isArray(save.entries) ? save.entries.length : 0;
      const savedAt = save.savedAt?.toDate ? save.savedAt.toDate().toLocaleString() : "";
      const meta = [`${count} item${count === 1 ? "" : "s"}`];
      if (savedAt) meta.push(`saved ${savedAt}`);
      if (save.savedBy) meta.push(`by ${save.savedBy}`);
      return `<div class="daily-todo-save-row" data-id="${save.id}" style="padding:10px 12px; border:1px solid var(--border); border-radius:8px; margin-bottom:8px; background:var(--surface);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <div style="font-weight:600; font-size:14px; color:var(--text);">${escapeHtml(mmddyyyy)}</div>
            <div style="font-size:12px; color:var(--text);">${escapeHtml(meta.join(" — "))}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="daily-todo-save-view secondary" style="font-size:12px; padding:5px 10px;">View report</button>
            <button type="button" class="daily-todo-save-load secondary" style="font-size:12px; padding:5px 10px;">Load into Log</button>
            <button type="button" class="daily-todo-save-export secondary" style="font-size:12px; padding:5px 10px;">Export to Excel</button>
            <button type="button" class="daily-todo-save-delete secondary" style="font-size:12px; padding:5px 10px; color:var(--danger-light); border-color:var(--danger-border);">Delete</button>
          </div>
        </div>
        <div class="daily-todo-save-preview" style="display:none; margin-top:10px;"></div>
      </div>`;
    })
    .join("");
}

dailyTodoSavedListEl?.addEventListener("click", async (e) => {
  const row = e.target.closest(".daily-todo-save-row");
  if (!row) return;
  const save = allDailyTodoSaves.find((s) => s.id === row.dataset.id);
  if (!save) return;

  if (e.target.closest(".daily-todo-save-view")) {
    const previewEl = row.querySelector(".daily-todo-save-preview");
    if (!previewEl) return;
    const isOpen = previewEl.style.display !== "none";
    if (isOpen) {
      previewEl.style.display = "none";
      previewEl.innerHTML = "";
      return;
    }
    previewEl.style.display = "block";
    if (!save.reportHtml) {
      previewEl.innerHTML = '<p style="font-size:13px; color:var(--text);">No report snapshot was saved for this day.</p>';
      return;
    }
    previewEl.innerHTML =
      '<iframe style="width:100%; height:500px; border:1px solid var(--border); border-radius:8px; background:var(--surface-2);"></iframe>';
    previewEl.querySelector("iframe").srcdoc = save.reportHtml;
    return;
  }

  if (e.target.closest(".daily-todo-save-load")) {
    dailyTodoEntries = (save.entries || []).map((i, idx) => ({
      id: `saved-${save.id}-${idx}`,
      text: i.text,
      time: i.time || "",
      included: i.included !== false,
      locationOverride: i.locationOverride || null,
      tag: i.tag || null,
    }));
    dailyTodoTargetDateValue = save.date;
    dailyTodoWorkflowNavEl?.querySelector('[data-step="log"]')?.click();
    return;
  }

  if (e.target.closest(".daily-todo-save-export")) {
    // Historical snapshot, not live state - export straight from
    // save.entries (the same { text, time, included, locationOverride }
    // shape saveDailyTodo sanitized into) rather than dailyTodoEntries,
    // since Load-into-Log isn't a prerequisite for exporting a past day.
    try {
      await exportDailyTodoToExcel(save.date, save.entries || []);
    } catch (err) {
      console.error(err);
      alert("Could not export to Excel: " + (err?.message || "Something went wrong."));
    }
    return;
  }

  if (e.target.closest(".daily-todo-save-delete")) {
    if (!confirm(`Delete the saved Daily To-Do for ${standupDateToMMDDYYYY(save.date)}? This can't be undone.`)) return;
    const deleteBtn = e.target.closest(".daily-todo-save-delete");
    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting…";
    deleteDailyTodoSaveFn({ date: save.date }).catch((err) => {
      console.error(err);
      alert("Could not delete: " + (err?.message || "Something went wrong."));
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete";
    });
  }
});

searchInput.addEventListener("input", render);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUserRole = null;
    subscribeToKeycardHistory(null, null);
    document.body.classList.remove("no-animations");
    signInScreen.style.display = "flex";
    appScreen.style.display = "none";
    // Reset the OTP panel back to its initial state on every sign-out (own
    // "Sign out" click, an expired/revoked 30-day OTP session, a role that
    // got pulled) - a shared device shouldn't show the previous person's
    // typed-in email or a stale "code sent" state to whoever's next.
    clearInterval(otpResendCooldownTimer);
    if (otpPanel) otpPanel.style.display = "none";
    if (otpToggleBtn) otpToggleBtn.textContent = "Create/Login with Email Code";
    if (otpCodeRow) otpCodeRow.style.display = "none";
    if (otpEmailInput) { otpEmailInput.value = ""; otpEmailInput.disabled = false; }
    if (otpCodeInput) otpCodeInput.value = "";
    setOtpStatus("", false);
    return;
  }

  // Access is decided server-side (see getMyRole in functions/index.js)
  // against the accessControl collection, not by domain or a hardcoded
  // list here - ask again on every sign-in so a role change takes effect
  // without needing a fresh login.
  let role = null;
  let tabs = null;
  let eraPermissions = null;
  let disableAnimations = false;
  try {
    const result = await getMyRoleFn();
    role = result.data?.role || null;
    tabs = Array.isArray(result.data?.tabs) ? result.data.tabs : null;
    eraPermissions = Array.isArray(result.data?.eraPermissions) ? result.data.eraPermissions : null;
    disableAnimations = result.data?.disableAnimations === true;
  } catch (err) {
    console.error(err);
  }
  // Per-user "no animation" preference set in Manage Access - a plain CSS
  // class toggle (see the .no-animations rule in index.html) rather than
  // hunting down every individual transition/animation in app.js.
  // Standard staff get it unconditionally (2026-09-22, per Huy's request:
  // "remove all animations for standard employee/staff users") - anyone
  // below the "full" (admin) role. Admins keep their own Manage Access
  // preference as before.
  document.body.classList.toggle("no-animations", disableAnimations || role !== "full");

  if (!role) {
    alert("You don't have access to this dashboard yet. Ask someone with full access to add your email.");
    currentUserRole = null;
    await signOut(auth);
    return;
  }

  currentUserRole = role;
  currentUserEmail = user.email || null;
  subscribeToKeycardHistory(currentUserEmail, currentUserRole);
  currentUserTabs = tabs;
  currentUserEraPermissions = eraPermissions;
  signInScreen.style.display = "none";
  appScreen.style.display = "block";
  signedInAs.textContent = user.email + " (" + (ROLE_LABELS[role] || role) + ")";
  // Access tab is owner-only (see isOwner above), not just "full" role -
  // matches the server-side requireOwner check in functions/index.js.
  if (accessTabBtn) accessTabBtn.style.display = isOwner() ? "" : "none";
  // Per-user tab restriction (see MANAGEABLE_TABS/canSeeTab above) - hide
  // any tab button this person isn't allowed to see. This is only UI
  // polish; the actual enforcement is tabAllowed() in firestore.rules.
  appSwitcherEl?.querySelectorAll(".tab[data-app]").forEach((btn) => {
    const key = btn.dataset.app;
    if (key === ACCESS_APP_KEY) return; // handled separately, just above
    // Email Request / Email (Attachments) are globally hidden (2026-08-10,
    // superseded by "CW Email Request") regardless of any user's
    // Access-tab grants - leave index.html's static display:none alone
    // instead of letting canSeeTab() re-show them for unrestricted users.
    if (key === EMAIL_REQUEST_APP_KEY || key === EMAIL_REQUEST_ATTACHMENTS_APP_KEY) return;
    btn.style.display = canSeeTab(key) ? "" : "none";
  });
  if (helpBtnEl) helpBtnEl.style.display = canSeeTab(EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY) ? "" : "none";
  if (currentApp === ACCESS_APP_KEY && !isOwner()) {
    // Role/identity was downgraded since this tab was last open (e.g.
    // re-signing in as someone else) - don't strand the UI on a tab it can
    // no longer see.
    currentApp = ROADMAP_APP_KEY;
  }
  if (currentApp !== ACCESS_APP_KEY && !canSeeTab(currentApp)) {
    // Same idea, for the tabs-list restriction: land on the first tab this
    // person is actually allowed to see instead of a blank/inaccessible one.
    // Email Request (Attachments) is excluded from the candidates - it's a
    // window.open() link, not a real currentApp value (see
    // EMAIL_REQUEST_ATTACHMENTS_APP_KEY above), so landing on it here would
    // show a blank screen instead of navigating anywhere. Email Request is
    // also excluded (2026-08-10) since its own tab button is now globally
    // hidden - landing there would show content with no active button.
    // Falls back to NO_ACCESS_APP_KEY (not ROADMAP_APP_KEY) when nothing
    // matches - a user whose tabs have been narrowed down to none at all
    // (e.g. every Visible Tabs checkbox unchecked in Manage Access) still
    // can't see Roadmap either, and forcing currentApp to it anyway used to
    // make updateAppChrome() render Roadmap's full toolbar/add-row/etc. UI
    // shell despite its own tab button being correctly hidden just above -
    // an unintended/broken-looking page for someone with zero access
    // (observed on chuey.wind@cubework.com, but the bug was in this landing
    // logic, not anything specific to that account).
    currentApp =
      MANAGEABLE_TABS.find(
        (t) => t.key !== EMAIL_REQUEST_ATTACHMENTS_APP_KEY && t.key !== EMAIL_REQUEST_APP_KEY && canSeeTab(t.key),
      )?.key || NO_ACCESS_APP_KEY;
  }
  // .tab-sub excluded (2026-09-22) - see the appSwitcher click handler's own
  // comment above; their highlight is owned by eraActivateMode's
  // sidebar-sync (index.html), not this generic data-app match.
  appSwitcherEl?.querySelectorAll(".tab:not(.tab-sub)").forEach((t) => t.classList.toggle("active", t.dataset.app === currentApp));
  syncHeaderForCurrentApp();
  updateAppChrome();
  if (currentApp !== ACCESS_APP_KEY && currentApp !== EMAIL_REQUEST_APP_KEY && currentApp !== EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY && currentApp !== STANDUP_APP_KEY && currentApp !== DAILY_TODO_APP_KEY && currentApp !== ISSUE_APP_KEY) renderActionTabs();
  subscribeToCurrentApp();
  subscribeToThreadStatus();
  subscribeToCustomLineItemCatalog();
  // Both gated by canSeeTab() to match firestore.rules' own tabAllowed()
  // checks (standupLocationCatalog needs "standup"; sharedTagCatalog needs
  // any of standup/dailyTodo/issue) - otherwise a user without those tabs
  // granted gets an unconditional permission-denied error on every sign-in.
  if (canSeeTab(STANDUP_APP_KEY)) subscribeToStandupLocationCatalog();
  if (canSeeTab(STANDUP_APP_KEY) || canSeeTab(DAILY_TODO_APP_KEY) || canSeeTab(ISSUE_APP_KEY)) subscribeToSharedTagCatalog();
});

// How much history the browser pulls down per listener - Firestore itself
// keeps every doc forever, this just bounds what the client fetches.
const FETCH_LIMIT = 2000;

let allRoadmapItems = [];
let unsubscribeRoadmapItems = null;

let allAccessUsers = [];
let unsubscribeAccessList = null;

// Standup's step 3 ("Saved") - the one part of the Standup tab that's a real
// Firestore listener rather than in-memory client state (see standupSaves in
// firestore.rules/functions/index.js).
let allStandupSaves = [];
let unsubscribeStandupSaves = null;

// Daily To-Do's own "Saved" step - same real-Firestore-listener shape as
// unsubscribeStandupSaves above, just a separate collection/listener.
let allDailyTodoSaves = [];
let unsubscribeDailyTodoSaves = null;

// Issue tab - a real, always-live Firestore listener (like Roadmap's own
// allRoadmapItems/unsubscribeRoadmapItems), not an in-memory-until-Save
// model like Standup/Daily To-Do's steps 1-2.
let allIssueItems = [];
let unsubscribeIssueItems = null;

// Single entry point for "the current app's data just became active" -
// routes to the Roadmap listener, the Access user-list listener, the
// Standup Saves listener, or the Daily To-Do Saves listener, and makes sure
// only one of the four is ever attached at a time.
function subscribeToCurrentApp() {
  if (currentApp === ROADMAP_APP_KEY) {
    subscribeToRoadmapItems();
  } else if (currentApp === ACCESS_APP_KEY) {
    subscribeToAccessList();
  } else if (currentApp === STANDUP_APP_KEY) {
    subscribeToStandupSaves();
  } else if (currentApp === DAILY_TODO_APP_KEY) {
    subscribeToDailyTodoSaves();
  } else if (currentApp === ISSUE_APP_KEY) {
    subscribeToIssueItems();
  } else {
    // Email Request / Email Request (Attachments): just static embedded
    // tools - no Firestore data of their own, but still detach whatever
    // listener was previously active so it doesn't keep running in the
    // background.
    if (unsubscribeRoadmapItems) {
      unsubscribeRoadmapItems();
      unsubscribeRoadmapItems = null;
    }
    if (unsubscribeAccessList) {
      unsubscribeAccessList();
      unsubscribeAccessList = null;
    }
    if (unsubscribeStandupSaves) {
      unsubscribeStandupSaves();
      unsubscribeStandupSaves = null;
    }
    if (unsubscribeDailyTodoSaves) {
      unsubscribeDailyTodoSaves();
      unsubscribeDailyTodoSaves = null;
    }
    if (unsubscribeIssueItems) {
      unsubscribeIssueItems();
      unsubscribeIssueItems = null;
    }
  }
}

function subscribeToAccessList() {
  if (unsubscribeRoadmapItems) {
    unsubscribeRoadmapItems();
    unsubscribeRoadmapItems = null;
  }
  if (unsubscribeAccessList) {
    unsubscribeAccessList();
    unsubscribeAccessList = null;
  }
  if (unsubscribeStandupSaves) {
    unsubscribeStandupSaves();
    unsubscribeStandupSaves = null;
  }
  if (unsubscribeDailyTodoSaves) {
    unsubscribeDailyTodoSaves();
    unsubscribeDailyTodoSaves = null;
  }
  if (unsubscribeIssueItems) {
    unsubscribeIssueItems();
    unsubscribeIssueItems = null;
  }

  // The Access tab button is already hidden for anyone but the owner, but
  // Firestore rules would reject this query anyway if someone got here
  // some other way - fail quietly rather than throwing to the console.
  if (!isOwner()) {
    if (accessBulkPanelEl) accessBulkPanelEl.innerHTML = "";
    return;
  }

  allAccessUsers = [];
  if (accessBulkPanelEl) accessBulkPanelEl.innerHTML = '<div style="text-align:center; color:var(--text); padding:20px 0;">Loading…</div>';

  unsubscribeAccessList = onSnapshot(
    collection(db, "accessControl"),
    (snapshot) => {
      allAccessUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderAccessBulkPanel();
    },
    (err) => {
      console.error(err);
      if (accessBulkPanelEl) {
        accessBulkPanelEl.innerHTML =
          '<div style="text-align:center; color:var(--text); padding:20px 0;">Could not load the user list.</div>';
      }
    }
  );
}

// Standup tab, step 3 ("Saved") - the only Firestore-backed part of the
// Standup tab (see standupSaves in firestore.rules/functions/index.js).
// Ordered newest-day-first, same as every other list in this app.
function subscribeToStandupSaves() {
  if (unsubscribeRoadmapItems) {
    unsubscribeRoadmapItems();
    unsubscribeRoadmapItems = null;
  }
  if (unsubscribeAccessList) {
    unsubscribeAccessList();
    unsubscribeAccessList = null;
  }
  if (unsubscribeStandupSaves) {
    unsubscribeStandupSaves();
    unsubscribeStandupSaves = null;
  }
  if (unsubscribeDailyTodoSaves) {
    unsubscribeDailyTodoSaves();
    unsubscribeDailyTodoSaves = null;
  }
  if (unsubscribeIssueItems) {
    unsubscribeIssueItems();
    unsubscribeIssueItems = null;
  }

  allStandupSaves = [];
  if (standupSavedListEl) {
    standupSavedListEl.innerHTML = '<div style="text-align:center; color:var(--text); padding:20px 0;">Loading…</div>';
  }

  const q = query(collection(db, "standupSaves"), orderBy("date", "desc"));
  unsubscribeStandupSaves = onSnapshot(
    q,
    (snapshot) => {
      allStandupSaves = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderStandupSavedList();
      // 2026-09-14: summaryAttachments lives on this same collection - a
      // freshly uploaded/removed attachment lands here before anywhere else,
      // so refresh whichever attachment view is currently visible.
      if (currentStandupStep === "report") {
        renderStandupSummaryAttachmentsList();
        standupRefreshReportIfGenerated();
      }
    },
    (err) => {
      console.error(err);
      if (standupSavedListEl) {
        standupSavedListEl.innerHTML =
          '<div style="text-align:center; color:var(--text); padding:20px 0;">Could not load saved standups.</div>';
      }
    }
  );
}

// Daily To-Do tab, step 3 ("Saved") - the only Firestore-backed part of the
// Daily To-Do tab (see dailyTodoSaves in firestore.rules/functions/index.js).
// Same shape as subscribeToStandupSaves just above, separate collection.
function subscribeToDailyTodoSaves() {
  if (unsubscribeRoadmapItems) {
    unsubscribeRoadmapItems();
    unsubscribeRoadmapItems = null;
  }
  if (unsubscribeAccessList) {
    unsubscribeAccessList();
    unsubscribeAccessList = null;
  }
  if (unsubscribeStandupSaves) {
    unsubscribeStandupSaves();
    unsubscribeStandupSaves = null;
  }
  if (unsubscribeDailyTodoSaves) {
    unsubscribeDailyTodoSaves();
    unsubscribeDailyTodoSaves = null;
  }
  if (unsubscribeIssueItems) {
    unsubscribeIssueItems();
    unsubscribeIssueItems = null;
  }

  allDailyTodoSaves = [];
  if (dailyTodoSavedListEl) {
    dailyTodoSavedListEl.innerHTML = '<div style="text-align:center; color:var(--text); padding:20px 0;">Loading…</div>';
  }

  const q = query(collection(db, "dailyTodoSaves"), orderBy("date", "desc"));
  unsubscribeDailyTodoSaves = onSnapshot(
    q,
    (snapshot) => {
      allDailyTodoSaves = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderDailyTodoSavedList();
    },
    (err) => {
      console.error(err);
      if (dailyTodoSavedListEl) {
        dailyTodoSavedListEl.innerHTML =
          '<div style="text-align:center; color:var(--text); padding:20px 0;">Could not load saved Daily To-Do reports.</div>';
      }
    }
  );
}

// "Visible tabs:" multi-select dropdown (2026-08-30) - a single dropdown
// wrapping the tab/CW-Email-Request tree so it only takes up space while
// someone's actually editing it. Now only used by the "add new user" row
// (2026-09-02) - existing users' access is reviewed/edited in the Existing
// Users bulk panel instead, which renders the tree markup directly rather
// than wrapping it in this dropdown chrome. Keyed by email, plus the
// sentinel below for the "add new user" row (which has no email).
const ACCESS_NEW_USER_DROPDOWN_KEY = "__new__";
let openAccessTabsDropdowns = new Set();

// A dropdown's identity in openAccessTabsDropdowns: its own email if it has
// one (an existing user's row), else the "add new user" row's. The bulk
// "Visible tabs" panel (#accessBulkPanel) doesn't use this dropdown chrome
// at all - see renderAccessBulkPanel() below.
function accessTabsDropdownKey(dropdown) {
  if (dropdown.dataset.email) return dropdown.dataset.email;
  return ACCESS_NEW_USER_DROPDOWN_KEY;
}

// Recomputes both the toggle button's summary text and the "Select All"
// checkbox's checked/indeterminate state from a dropdown's own live
// checkbox states - called right after any optimistic checkbox mutation
// (so the UI updates instantly) and again after every new-row rebuild.
// Selector for everything a dropdown's "Select All"/summary treats as one
// of its top-level selectable options: the MANAGEABLE_TABS checkboxes plus
// (new-user row only) the folded-in "No animation" extra option - see its
// own comment in buildAccessTabsSectionsHtml. Doesn't touch the era tree's
// mode/action leaves underneath CW Email Request; those have their own
// per-section All/None buttons.
const ACCESS_TABS_DROPDOWN_OPTION_SELECTOR = ".access-tab-checkbox, .access-new-tab-checkbox, .access-tabs-extra-option-checkbox";

function syncAccessTabsDropdownUI(dropdown) {
  if (!dropdown) return;
  const boxes = Array.from(dropdown.querySelectorAll(ACCESS_TABS_DROPDOWN_OPTION_SELECTOR));
  const selectAll = dropdown.querySelector(".access-tabs-select-all-checkbox");
  const summaryEl = dropdown.querySelector(".access-tabs-dropdown-summary");
  if (!boxes.length) return;
  const checkedCount = boxes.filter((c) => c.checked).length;
  if (selectAll) {
    selectAll.checked = checkedCount === boxes.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
  }
  if (summaryEl) {
    const isNew = !dropdown.dataset.email;
    let text;
    if (!checkedCount) text = isNew ? "No tabs selected" : "No tabs";
    else if (checkedCount === boxes.length) text = "All tabs";
    else {
      text = boxes
        .filter((c) => c.checked)
        .map((c) => c.dataset.label || MANAGEABLE_TABS.find((t) => t.key === c.dataset.tab)?.label || c.dataset.tab)
        .join(", ");
    }
    summaryEl.textContent = text;
  }
}

// Checking/unchecking the dropdown's own "Select All" toggles every
// MANAGEABLE_TABS-level checkbox inside it (not the CW Email Request
// mode/action leaves underneath - those already have their own per-section
// All/None buttons, see handleAccessSelectAllClick). Cascades into the CW
// Email Request tree same as toggling its main checkbox directly would,
// since setting .checked in JS doesn't fire the "change" listener that
// normally does that cascade.
function handleAccessSelectAllToggle(selectAll) {
  const dropdown = selectAll.closest(".access-tabs-dropdown");
  if (!dropdown) return;
  const checked = selectAll.checked;
  dropdown.querySelectorAll(ACCESS_TABS_DROPDOWN_OPTION_SELECTOR).forEach((c) => {
    c.checked = checked;
    c.indeterminate = false;
  });
  dropdown.querySelectorAll(".access-era-tree").forEach((tree) => {
    tree.querySelectorAll(".access-era-node-checkbox").forEach((c) => {
      c.checked = checked;
    });
    recomputeEraTreeIndeterminate(tree);
  });
  syncAccessTabsDropdownUI(dropdown);
  // This dropdown chrome (buildAccessTabsDropdownHtml) is only used by the
  // "add new user" row now - existing users' editors in the Existing Users
  // bulk panel use the plain tree markup (buildAccessTabsSectionsHtml)
  // directly, not this dropdown wrapper - so there's never anything to
  // persist here; the new-user row's checkboxes aren't saved anywhere until
  // Submit is clicked (see submitAuthorizedUser).
}

// Toggles a dropdown's own open/closed panel, closing any other open one
// first (only one open at a time). Used by #accessNewTabsRow's own click
// listener below. Returns true if the click was on a toggle button
// (handled) so callers know to stop looking for other click targets.
function handleAccessTabsDropdownToggleClick(e) {
  const toggle = e.target.closest(".access-tabs-dropdown-toggle");
  if (!toggle) return false;
  const dropdown = toggle.closest(".access-tabs-dropdown");
  if (!dropdown) return true;
  const key = accessTabsDropdownKey(dropdown);
  const willOpen = !openAccessTabsDropdowns.has(key);
  document.querySelectorAll(".access-tabs-dropdown-panel").forEach((p) => (p.style.display = "none"));
  openAccessTabsDropdowns.clear();
  if (willOpen) {
    openAccessTabsDropdowns.add(key);
    const panel = dropdown.querySelector(".access-tabs-dropdown-panel");
    if (panel) panel.style.display = "flex";
  }
  return true;
}

// Click-outside-closes (requirement: closing any open dropdown when
// clicking elsewhere on the page). Module-level/one-time listener - the
// dropdown itself gets rebuilt on every "add new user" row refresh, but
// this listener doesn't need rebinding since it's on document itself.
document.addEventListener("click", (e) => {
  if (!openAccessTabsDropdowns.size) return;
  if (e.target.closest(".access-tabs-dropdown")) return;
  document.querySelectorAll(".access-tabs-dropdown-panel").forEach((p) => (p.style.display = "none"));
  openAccessTabsDropdowns.clear();
});

// Recursively renders one ERA_TREE node (and everything under it) as nested
// <label>+checkbox rows. Every row - branch or leaf - carries
// data-era-path="<dotted path>" so the single delegated "change" handler
// (see handleEraNodeToggle below) can cascade a click into every leaf under
// it, and recomputeEraTreeIndeterminate can walk the tree back up from its
// leaves. A branch's own checked/indeterminate state is derived from its
// leaves via eraNodeState - it is never itself a grantable unit.
function renderEraTreeNode(path, node, grantedLeavesSet, emailAttr, depth) {
  const isLeaf = typeof node === "string";
  const label = isLeaf ? node : node.label;
  const state = eraNodeState(path, grantedLeavesSet);
  const row = `<label style="display:flex; align-items:center; gap:5px; cursor:pointer; margin-left:${depth * 18}px;">
    <input type="checkbox" class="access-era-node-checkbox" data-era-path="${path}"${emailAttr} ${state === "checked" ? "checked" : ""} data-era-indeterminate="${state === "indeterminate" ? "1" : "0"}" /> ${label}
  </label>`;
  if (isLeaf) return row;
  const childrenHtml = Object.keys(node.children)
    .map((key) => renderEraTreeNode(`${path}.${key}`, node.children[key], grantedLeavesSet, emailAttr, depth + 1))
    .join("");
  return `<div style="margin-top:4px;">${row}<div style="display:flex; flex-direction:column; gap:2px; margin-top:2px;">${childrenHtml}</div></div>`;
}

// Renders the whole ERA_TREE (all 5 top-level branches) against a flat
// array of granted leaf paths (or "grant everything" when null/undefined -
// the isNew/owner-unrestricted case).
function renderEraPermissionsTree(grantedLeaves, emailAttr) {
  const grantedSet = new Set(grantedLeaves == null ? Array.from(ERA_ALL_LEAVES) : grantedLeaves);
  return Object.keys(ERA_TREE)
    .map((key) => renderEraTreeNode(key, ERA_TREE[key], grantedSet, emailAttr, 0))
    .join("");
}

// A checkbox's `indeterminate` DOM property can't be expressed as an HTML
// attribute (only reflected, not settable, from markup) - renderEraTreeNode
// stamps it as data-era-indeterminate="1" instead; call this once right
// after inserting fresh tree HTML into the DOM to turn that into the real
// property every browser actually reads for the tri-state checkbox render.
function applyEraTreeIndeterminateMarkers(root) {
  if (!root) return;
  root
    .querySelectorAll('.access-era-node-checkbox[data-era-indeterminate="1"], .access-era-main-checkbox[data-era-indeterminate="1"]')
    .forEach((c) => {
      c.indeterminate = true;
    });
}

// Builds the "Visible tabs:" row markup shared by the "add new user" row
// (pass email === null - everything starts unchecked, per the existing
// "all unchecked by default" convention) and each existing user's row (pass
// their email + current tabs/eraPermissions). One main checkbox per
// MANAGEABLE_TABS entry, each with its own tiny Select All/Remove All
// controls (2026-08-30, requested for UI consistency even where there's
// only one checkbox to toggle); CW Email Request additionally nests the
// full ERA_TREE (Keycard/Wi-Fi/Electrical/Software/Hardware and everything
// under them) under .access-era-tree - see handleEraNodeToggle/
// recomputeEraTreeIndeterminate below for the cascade/indeterminate wiring,
// and collectEraPermissions for how the checked leaves round-trip to
// eraPermissions.
function buildAccessTabsSectionsHtml(email, userTabs, userEraPermissions) {
  const isNew = email == null;
  const tabCheckboxClass = isNew ? "access-new-tab-checkbox" : "access-tab-checkbox";
  const emailAttr = isNew ? "" : ` data-email="${escapeHtml(email)}"`;
  const tabChecked = (key) => (isNew ? false : userTabs === null || userTabs.includes(key));
  const grantedEraLeaves = isNew ? [] : userEraPermissions;

  const tabsHtml = MANAGEABLE_TABS.map((t) => {
    const checked = tabChecked(t.key);
    const selectAllBtns = `<span style="display:inline-flex; gap:4px; margin-left:2px;">
      <button type="button" class="access-select-all-btn" data-tab="${t.key}"${emailAttr} data-mode="all" style="font-size:11px; padding:1px 6px;" title="Select all">All</button>
      <button type="button" class="access-select-all-btn" data-tab="${t.key}"${emailAttr} data-mode="none" style="font-size:11px; padding:1px 6px;" title="Remove all">None</button>
    </span>`;
    if (t.key !== EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY) {
      return `<span class="access-tab-section" style="display:inline-flex; align-items:center; gap:4px;">
        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
          <input type="checkbox" class="${tabCheckboxClass}" data-tab="${t.key}"${emailAttr} ${checked ? "checked" : ""} /> ${t.label}
        </label>
        ${selectAllBtns}
      </span>`;
    }
    const eraTreeHtml = renderEraPermissionsTree(grantedEraLeaves, emailAttr);
    // CW Email Request is the ERA_TREE's own root (2026-09-19 follow-up, per
    // Huy's request) - its main checkbox's checked/indeterminate state is
    // derived from the tree's actual granted leaves (eraOverallState), same
    // as any branch node reflects its children, NOT from the raw `tabs`
    // flag alone: a partial grant must still read `checked` (with the
    // indeterminate overlay) or this same checkbox - which doubles as the
    // literal "tabs" grant via its data-tab attribute - would silently drop
    // emailRequestAttachmentsEmbed out of the saved tabs array the next
    // time this editor is saved. See handleEraMainToggle/
    // recomputeEraTreeIndeterminate below for the write-side (clicking this
    // checkbox cascades into every leaf) and read-side (any other node
    // toggle recomputes this checkbox the same way) of the round-trip.
    const grantedEraSet = new Set(grantedEraLeaves == null ? Array.from(ERA_ALL_LEAVES) : grantedEraLeaves);
    const eraOverall = eraOverallState(grantedEraSet);
    // NOTE: the main row deliberately does NOT carry the .access-tab-section
    // class its flat siblings use - handleAccessSelectAllClick's closest()
    // stops at the nearest match, so if this row matched .access-tab-section
    // too, its Select All/Remove All buttons would only ever see the main
    // checkbox instead of the whole tree (.access-era-tree, one level up).
    return `<div class="access-era-tree" style="width:100%; margin-top:6px; padding-top:6px; border-top:1px dashed var(--border);">
      <span class="access-era-main-row" style="display:inline-flex; align-items:center; gap:4px;">
        <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
          <input type="checkbox" class="${tabCheckboxClass} access-era-main-checkbox" data-tab="${t.key}"${emailAttr} ${eraOverall !== "unchecked" ? "checked" : ""} data-era-indeterminate="${eraOverall === "indeterminate" ? "1" : "0"}" /> ${t.label}
        </label>
        ${selectAllBtns}
      </span>
      <div style="display:flex; flex-direction:column; gap:2px; margin-top:4px;">${eraTreeHtml}</div>
    </div>`;
  }).join("");

  // No Animation (2026-08-31) - folded into this dropdown as one more
  // selectable option, but only for the "add new user" row: it replaced
  // that row's old standalone checkbox (see index.html's own history), and
  // deliberately does NOT show up for existing users - those get their own
  // separate .access-bulk-user-no-animation-checkbox in the Existing Users
  // bulk panel's editor card instead (see renderAccessBulkPanel). Shares
  // the generic .access-tabs-extra-option-checkbox class (not
  // .access-new-tab-checkbox) so it's swept into a dropdown's "Select
  // All"/summary alongside the tabs above without being mistaken for one
  // when tabs are collected for persistence (those calls query
  // .access-tab-checkbox/.access-new-tab-checkbox specifically).
  if (!isNew) return tabsHtml;
  return (
    tabsHtml +
    `<span class="access-tab-section" style="display:inline-flex; align-items:center; gap:4px; margin-top:2px; padding-top:6px; border-top:1px dashed var(--border);">
      <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
        <input type="checkbox" class="access-tabs-extra-option-checkbox" data-tab="noAnimation" data-label="No animation" /> No animation
      </label>
    </span>`
  );
}

// Wraps buildAccessTabsSectionsHtml's per-tab checkbox markup in the actual
// dropdown chrome: a toggle button (summary text, filled in by
// syncAccessTabsDropdownUI right after this is inserted into the DOM) and a
// panel with a "Select All" row above the tab list. Closed by default on
// every fresh render unless this exact dropdown was left open across a
// re-render (see openAccessTabsDropdowns's own comment above).
function buildAccessTabsDropdownHtml(email, userTabs, userEraPermissions) {
  const isNew = email == null;
  const dropdownKey = isNew ? ACCESS_NEW_USER_DROPDOWN_KEY : email;
  const emailAttr = isNew ? "" : ` data-email="${escapeHtml(email)}"`;
  const isOpen = openAccessTabsDropdowns.has(dropdownKey);
  const tabRows = buildAccessTabsSectionsHtml(email, userTabs, userEraPermissions);
  return `
    <div class="access-tabs-dropdown"${emailAttr} style="position:relative;">
      <button type="button" class="access-tabs-dropdown-toggle" style="display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border); border-radius:8px; padding:6px 10px; font-size:13px; background:var(--input-bg); color:var(--text); cursor:pointer; max-width:280px;">
        <span class="access-tabs-dropdown-summary" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
        <span style="flex-shrink:0; color:var(--text);">&#9662;</span>
      </button>
      <div class="access-tabs-dropdown-panel" style="display:${isOpen ? "flex" : "none"}; flex-direction:column; gap:8px; position:absolute; top:calc(100% + 4px); left:0; z-index:30; min-width:240px; max-width:320px; max-height:320px; overflow-y:auto; background:var(--surface); border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:10px; box-shadow:0 8px 20px rgba(15,23,42,0.15); padding:10px;">
        <label style="display:flex; align-items:center; gap:6px; font-weight:600; font-size:12px; padding-bottom:6px; border-bottom:1px solid var(--hover-bg); cursor:pointer;">
          <input type="checkbox" class="access-tabs-select-all-checkbox"${emailAttr} /> Select All
        </label>
        <div style="display:flex; flex-direction:column; gap:8px;">${tabRows}</div>
      </div>
    </div>
  `;
}

// Bulk "Existing Users" access control (2026-08-31, reworked 2026-08-31 per
// the Access > VISIBLE TABS - Existing Users spec; reworked again 2026-09-02
// to be the *only* existing-user view - see index.html's own comment on
// #accessBulkPanel for why the old flat #accessList card list was removed).
// Lets an admin fuzzy-search/multi-select several EXISTING users on the
// left, review/edit each selected user's role, position, tab/era-mode/
// era-action access, and No Animation setting on the right, and save every
// pending permission edit together with one Apply click - Remove stays an
// immediate, separately-confirmed action instead of something Apply
// batches. Deliberately its own markup (access-bulk-* classes) and state -
// separate from the "add new user" row above - though the per-user editor
// reuses buildAccessTabsSectionsHtml (same tree markup/classes the add-new-
// user row uses, so Select All/None behave identically). A single checkbox
// click no longer cascades into its sub-items (checking CW Email Request
// only grants that tab; checking Keycard only grants that mode) - only the
// explicit Select All/None buttons set a whole section at once. Nothing
// here writes to Firestore until Apply is clicked (or Remove, which is
// immediate) - see bulkUserPending/bulkUserOriginal below.
let bulkAccessSelectedEmails = new Set();
let bulkAccessUserSearchTerm = "";

// Per-selected-user staged edits, both keyed by email. `bulkUserOriginal` is
// a snapshot of a user's real access, taken the moment they're selected (or
// refreshed the moment Apply successfully saves it) - comparing a user's
// `bulkUserPending` entry against their `bulkUserOriginal` entry is what
// "this user has a pending change" means (see bulkAccessHasPendingChanges),
// which is what the Apply button's disabled state and Apply's own save list
// are both driven from. `bulkUserPending` is the live, editable copy the
// per-user checkboxes read from and write to. Both are cleared for a user
// the instant they're deselected - review is scoped to whoever is currently
// selected, not accumulated silently in the background.
let bulkUserOriginal = new Map();
let bulkUserPending = new Map();

function bulkAccessStateFromUser(u) {
  return {
    role: u.role || "view",
    position: POSITION_LABELS[u.position] ? u.position : "",
    tabs: accessExpandOptionList(Array.isArray(u.tabs) ? u.tabs : null, MANAGEABLE_TABS.map((t) => t.key)),
    // A doc with no eraPermissions yet (not migrated - see
    // deriveEraPermissionsFromLegacy in functions/index.js) falls back to
    // "every leaf" here purely as a display convenience, same transitional
    // stance accessExpandOptionList's own comment describes for tabs - it is
    // never written back as-is; Apply always sends the live checked leaves.
    eraPermissions: accessExpandOptionList(Array.isArray(u.eraPermissions) ? u.eraPermissions : null, Array.from(ERA_ALL_LEAVES)),
    disableAnimations: u.disableAnimations === true,
  };
}

function bulkAccessCloneState(state) {
  return { ...state, tabs: state.tabs.slice(), eraPermissions: state.eraPermissions.slice() };
}

// Selects/deselects a user for review: selecting snapshots their current
// real access into both bulkUserOriginal (the "before") and bulkUserPending
// (the editable "working copy", starting out identical); deselecting drops
// both, discarding any unsaved edits for that user - reasonable since they
// were never applied, and the goal is reviewing whoever is currently picked,
// not silently carrying a stale edit into some later unrelated selection.
function bulkAccessSetUserSelected(email, selected) {
  if (selected) {
    bulkAccessSelectedEmails.add(email);
    const user = allAccessUsers.find((u) => (u.email || u.id) === email);
    if (!user) return;
    const snapshot = bulkAccessStateFromUser(user);
    bulkUserOriginal.set(email, snapshot);
    bulkUserPending.set(email, bulkAccessCloneState(snapshot));
  } else {
    bulkAccessSelectedEmails.delete(email);
    bulkUserOriginal.delete(email);
    bulkUserPending.delete(email);
  }
}

function bulkAccessStatesEqual(a, b) {
  if (!a || !b) return a === b;
  const sameList = (x, y) => x.slice().sort().join(" ") === y.slice().sort().join(" ");
  return (
    a.role === b.role &&
    a.position === b.position &&
    sameList(a.tabs, b.tabs) &&
    sameList(a.eraPermissions, b.eraPermissions) &&
    a.disableAnimations === b.disableAnimations
  );
}

// Whether Apply has anything to save - true the moment ANY currently-
// selected user's working copy (bulkUserPending) differs from their
// snapshot (bulkUserOriginal). Drives the Apply button's disabled state
// (item 3 of the spec: "Keep Apply disabled until the admin makes a
// change").
function bulkAccessHasPendingChanges() {
  for (const email of bulkAccessSelectedEmails) {
    const pending = bulkUserPending.get(email);
    const original = bulkUserOriginal.get(email);
    if (pending && original && !bulkAccessStatesEqual(pending, original)) return true;
  }
  return false;
}

function accessBulkMatchingUsers() {
  return allAccessUsers
    .map((u) => ({ u, score: fuzzyMatchScore(u.email || u.id, bulkAccessUserSearchTerm) }))
    .filter(({ score }) => score !== null)
    .sort((a, b) => a.score - b.score || (a.u.email || a.u.id).localeCompare(b.u.email || b.u.id))
    .map(({ u }) => u);
}

function accessBulkSelectedUsers() {
  return allAccessUsers
    .filter((u) => bulkAccessSelectedEmails.has(u.email || u.id))
    .sort((a, b) => (a.email || a.id).localeCompare(b.email || b.id));
}

// Re-reads a selected user's editor tree back into their bulkUserPending
// entry - called after any checkbox change inside that editor (a plain tab,
// an era mode/action leaf, or a Select All/None button), all of which mutate
// checkboxes in the DOM first and then need that mutation captured back into
// the working copy Apply eventually reads from.
function bulkAccessSyncPendingFromEditor(email, editor) {
  const pending = bulkUserPending.get(email);
  if (!pending || !editor) return;
  pending.tabs = Array.from(editor.querySelectorAll(".access-tab-checkbox:checked")).map((c) => c.dataset.tab);
  pending.eraPermissions = collectEraPermissions(editor.querySelector(".access-era-tree"));
}

// Saves every selected user's pending edits (vs. their own snapshot) in one
// pass, per item 3/4 of the spec ("Clicking Apply saves all changes made by
// the admin" / "Apply should save all pending changes together"). A user
// whose working copy still matches their snapshot is skipped - nothing to
// save for them. On success, that user's snapshot is refreshed to match
// what was just saved (item 3: "After applying, clear the pending-change
// state"), which is what flips bulkAccessHasPendingChanges back to false and
// disables Apply again; a user whose save fails keeps its stale snapshot so
// it still reads as pending and can be retried.
function applyBulkAccessChanges() {
  const dirtyEmails = Array.from(bulkAccessSelectedEmails).filter((email) => {
    const pending = bulkUserPending.get(email);
    const original = bulkUserOriginal.get(email);
    return pending && original && !bulkAccessStatesEqual(pending, original);
  });
  if (!dirtyEmails.length) return;
  const applyBtn = accessBulkPanelEl?.querySelector(".access-bulk-apply-btn");
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.textContent = "Applying…";
  }
  Promise.allSettled(
    dirtyEmails.map((email) => {
      const pending = bulkUserPending.get(email);
      return updateAuthorizedUserRoleFn({
        email,
        role: pending.role,
        position: pending.position,
        tabs: pending.tabs,
        eraPermissions: pending.eraPermissions,
        disableAnimations: pending.disableAnimations,
      })
        .then(() => {
          bulkUserOriginal.set(email, bulkAccessCloneState(pending));
        })
        .catch((err) => {
          console.error(err);
          return Promise.reject({ email, err });
        });
    }),
  ).then((results) => {
    const failed = results.filter((r) => r.status === "rejected").map((r) => r.reason?.email).filter(Boolean);
    if (failed.length) alert(`Could not save changes for: ${failed.join(", ")}`);
    renderAccessBulkPanel();
  });
}

// Scroll-position preservation (2026-08-30 - "VISIBLE TABS must accurately
// reflect the updated access of each existing user" without the page or any
// open dropdown jumping back to the top). Every checkbox toggle here
// round-trips through updateAuthorizedUserRoleFn -> Firestore -> the
// allAccessUsers onSnapshot listener, which rebuilds #accessBulkPanel's
// innerHTML from scratch - that innerHTML replacement
// silently resets to 0 both the page's own scroll position (if the rebuild
// changes overall document height even briefly) and, more noticeably, the
// scrollTop of any open dropdown panel (.access-tabs-dropdown-panel has its
// own max-height/overflow-y:auto, as does the bulk panel's inner matching-
// users list) - since those are fresh DOM nodes with no memory of where the
// old ones were scrolled to. Save just before an innerHTML rebuild, restore
// right after, keyed by dropdown identity (accessTabsDropdownKey) so it
// still lines up post-rebuild even though the DOM nodes themselves changed.
function captureAccessScrollState(root) {
  const state = { windowY: window.scrollY, panels: {} };
  root?.querySelectorAll(".access-tabs-dropdown").forEach((dropdown) => {
    const panel = dropdown.querySelector(".access-tabs-dropdown-panel");
    if (panel) state.panels[accessTabsDropdownKey(dropdown)] = panel.scrollTop;
  });
  const userList = root?.querySelector(".access-bulk-user-list");
  if (userList) state.bulkUserListScrollTop = userList.scrollTop;
  // The per-user access editors column (accessColumnHtml's own
  // max-height/overflow-y:auto) also needs its own scrollTop preserved -
  // without this, checking a box for a user scrolled further down (e.g.
  // with several users selected) re-renders the whole panel and snaps this
  // column back to its top, which reads as the checkbox click "jumping to
  // the top" even though window.scrollY itself never moved.
  const editorsList = root?.querySelector(".access-bulk-editors-list");
  if (editorsList) state.bulkEditorsListScrollTop = editorsList.scrollTop;
  return state;
}

function restoreAccessScrollState(root, state) {
  root?.querySelectorAll(".access-tabs-dropdown").forEach((dropdown) => {
    const key = accessTabsDropdownKey(dropdown);
    if (!(key in state.panels)) return;
    const panel = dropdown.querySelector(".access-tabs-dropdown-panel");
    if (panel) panel.scrollTop = state.panels[key];
  });
  if (state.bulkUserListScrollTop != null) {
    const userList = root?.querySelector(".access-bulk-user-list");
    if (userList) userList.scrollTop = state.bulkUserListScrollTop;
  }
  if (state.bulkEditorsListScrollTop != null) {
    const editorsList = root?.querySelector(".access-bulk-editors-list");
    if (editorsList) editorsList.scrollTop = state.bulkEditorsListScrollTop;
  }
  window.scrollTo(0, state.windowY);
}

// Expands a tabs/eraModes/eraKeycardActions field to an explicit array so a
// single option can be toggled on/off within it. sanitizeTabs/
// sanitizeEraModes/sanitizeEraKeycardActions (functions/index.js) always
// persist an explicit array now (2026-09-02) - null/undefined here only
// happens for a legacy doc saved before that change and not yet caught by
// migrateAccessControlPermissions's backfill, where it used to mean "every
// option". Expanding to fullList is purely a display fallback for that
// transitional case - it does NOT get written back as null (this function's
// output only ever feeds bulkUserPending/checkbox state, and every save path
// sends the live checked/unchecked list, never null).
function accessExpandOptionList(list, fullList) {
  return list === null || list === undefined ? fullList.slice() : list.slice();
}

// Bulk grant/revoke editor (2026-09-02) - shown in renderAccessBulkPanel
// whenever 2+ existing users are selected (including via "Select All
// Users"). Deliberately NOT a synced checkbox tree that mirrors one shared
// on/off state into every selected user - that would silently overwrite
// whatever each user already had for every permission the admin didn't mean
// to touch, which fails item 5 ("bulk changes must not modify permissions
// for anyone not selected... or touch anything not explicitly changed").
// Instead each permission gets its own "Grant to all"/"Revoke from all"
// button pair: clicking one only adds/removes that one permission in every
// currently-selected user's bulkUserPending entry (see
// bulkAccessSetPermissionForAllSelected below), leaving every other
// permission on every selected user exactly as it was. Nothing is sent to
// Firestore until the shared Apply button (rendered by the caller, below
// this and the per-user editors) is clicked - same staged-edit flow as the
// single-user editor.
function buildAccessSharedBulkEditorHtml(selectedUsers) {
  // grantLabel/revokeLabel default to "Grant to all"/"Revoke from all",
  // which reads fine for an actual permission (grant/revoke access to the
  // Roadmap tab, the Keycard mode, etc.) but is ambiguous for a plain on/off
  // preference like "No animation" - "Revoke from all" there means "turn
  // animations back ON", which isn't obvious from the button text alone and
  // was reported (2026-09-02) as looking like it "didn't work" when it had
  // actually done exactly that. disableAnimations's own call below overrides
  // both labels to name the resulting state directly instead.
  const permRow = (label, field, key, indent, grantLabel, revokeLabel) => `
    <span style="display:inline-flex; align-items:center; gap:8px; margin-left:${indent || 0}px;">
      <span style="min-width:150px; font-size:13px;">${label}</span>
      <button type="button" class="access-bulk-grant-btn" data-bulk-field="${field}" data-bulk-key="${key}" style="font-size:11px; padding:2px 8px;">${grantLabel || "Grant to all"}</button>
      <button type="button" class="access-bulk-revoke-btn" data-bulk-field="${field}" data-bulk-key="${key}" style="font-size:11px; padding:2px 8px;">${revokeLabel || "Revoke from all"}</button>
    </span>
  `;
  // Recursively builds one "Grant to all"/"Revoke from all" row per
  // ERA_TREE node (branch or leaf) - the bulk-key is that node's own dotted
  // path, which bulkAccessSetPermissionForAllSelected expands to every leaf
  // under it via eraLeavesUnder.
  const buildEraPermRows = (path, node, indent) => {
    const isLeaf = typeof node === "string";
    const label = isLeaf ? node : node.label;
    const row = `<div style="margin-top:4px;">${permRow(label, "eraPermissions", path, indent)}</div>`;
    if (isLeaf) return row;
    const childRows = Object.keys(node.children)
      .map((key) => buildEraPermRows(`${path}.${key}`, node.children[key], indent + 18))
      .join("");
    return `${row}<div style="display:flex; flex-direction:column; gap:2px; margin-top:2px;">${childRows}</div>`;
  };
  const tabsHtml = MANAGEABLE_TABS.map((t) => {
    if (t.key !== EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY) {
      return `<div style="margin-top:4px;">${permRow(t.label, "tabs", t.key)}</div>`;
    }
    const eraRowsHtml = Object.keys(ERA_TREE)
      .map((key) => buildEraPermRows(key, ERA_TREE[key], 18))
      .join("");
    return `<div style="width:100%; margin-top:6px; padding-top:6px; border-top:1px dashed var(--border);">
      ${permRow(t.label, "tabs", t.key)}
      <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">${eraRowsHtml}</div>
    </div>`;
  }).join("");

  return `
    <div class="access-bulk-shared-editor" style="display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid var(--info-text); background:var(--info-bg); border-radius:8px;">
      <div style="font-size:12px; color:var(--info-text);">Bulk edit - applies only to the <strong>${selectedUsers.length}</strong> selected users below; every other user is untouched, and any permission you don't click here is left exactly as each selected user already has it.</div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="font-size:12px; color:var(--info-text);">Role:</span>
        <select class="access-bulk-shared-role-select" style="border-radius:8px; border:1px solid var(--info-text); padding:4px 6px; font-size:12px; background:var(--input-bg); color:var(--text);">
          <option value="view">View</option>
          <option value="edit">Edit</option>
          <option value="full">Full access</option>
        </select>
        <button type="button" class="access-bulk-shared-role-apply-btn secondary" style="font-size:11px; padding:3px 8px;">Set for all</button>
        <span style="font-size:12px; color:var(--info-text); margin-left:10px;">Position:</span>
        <select class="access-bulk-shared-position-select" style="border-radius:8px; border:1px solid var(--info-text); padding:4px 6px; font-size:12px; background:var(--input-bg); color:var(--text);">
          <option value="">No position</option>
          ${Object.entries(POSITION_LABELS)
            .map(([value, label]) => `<option value="${value}">${label}</option>`)
            .join("")}
        </select>
        <button type="button" class="access-bulk-shared-position-apply-btn secondary" style="font-size:11px; padding:3px 8px;">Set for all</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:2px;">${tabsHtml}</div>
      ${permRow("No animation", "disableAnimations", "true", 0, "Disable animations for all", "Enable animations for all")}
    </div>
  `;
}

// Mutates every currently-selected user's bulkUserPending entry via
// `mutator`, then re-renders - the shared primitive both the grant/revoke
// buttons and the role/position "Set for all" buttons build on. Scoped
// strictly to bulkAccessSelectedEmails (item 5: never touches anyone not
// selected).
function bulkAccessApplyToAllSelected(mutator) {
  for (const email of bulkAccessSelectedEmails) {
    const pending = bulkUserPending.get(email);
    if (pending) mutator(pending);
  }
  renderAccessBulkPanel();
}

// Grants (adds) or revokes (removes) one permission across every selected
// user's own array field, or sets disableAnimations directly (it's a
// boolean, not a list) - never touches any other field on those users, and
// never touches a user who isn't currently selected.
function bulkAccessSetPermissionForAllSelected(field, key, grant) {
  if (field === "disableAnimations") {
    bulkAccessApplyToAllSelected((pending) => {
      pending.disableAnimations = grant;
    });
    return;
  }
  // eraPermissions' "key" is a tree path (leaf or branch) - grant/revoke
  // every leaf under it (eraLeavesUnder returns just [key] for an
  // already-leaf path), matching how a single click on that node cascades
  // in the per-user editor above.
  if (field === "eraPermissions") {
    const leaves = eraLeavesUnder(key);
    bulkAccessApplyToAllSelected((pending) => {
      const set = new Set(pending.eraPermissions);
      leaves.forEach((leaf) => (grant ? set.add(leaf) : set.delete(leaf)));
      pending.eraPermissions = Array.from(set);
    });
    return;
  }
  // CW Email Request's own "tabs" row is this bulk editor's tree root too
  // (2026-09-19 follow-up, matching handleEraMainToggle in the per-user
  // editor above) - granting/revoking the tab itself now cascades into
  // every eraPermissions leaf instead of leaving them untouched.
  if (field === "tabs" && key === EMAIL_REQUEST_ATTACHMENTS_EMBED_APP_KEY) {
    bulkAccessApplyToAllSelected((pending) => {
      const arr = pending.tabs;
      if (Array.isArray(arr)) {
        const idx = arr.indexOf(key);
        if (grant && idx === -1) arr.push(key);
        if (!grant && idx !== -1) arr.splice(idx, 1);
      }
      pending.eraPermissions = grant ? Array.from(ERA_ALL_LEAVES) : [];
    });
    return;
  }
  bulkAccessApplyToAllSelected((pending) => {
    const arr = pending[field];
    if (!Array.isArray(arr)) return;
    const idx = arr.indexOf(key);
    if (grant && idx === -1) arr.push(key);
    if (!grant && idx !== -1) arr.splice(idx, 1);
  });
}

// Existing Users shown first, Accesses second (item 1 of the Access >
// VISIBLE TABS - Existing Users spec) - a persistent two-column section
// rather than a dropdown popover, since reviewing several users' access
// trees side by side doesn't fit a small collapsed panel. Left column is
// always the fuzzy-search + multi-select user list; the right column stays
// a placeholder message until 1+ users are selected (item 2), then shows
// one editable access tree per selected user (item 4: "review/edit each
// selected user's accesses") plus one Apply button governing all of them
// (item 3).
function renderAccessBulkPanel() {
  if (!accessBulkPanelEl) return;
  const scrollState = captureAccessScrollState(accessBulkPanelEl);
  const shown = accessBulkMatchingUsers().slice(0, 8);
  const selectedUsers = accessBulkSelectedUsers();

  const userRows = shown
    .map((u) => {
      const email = u.email || u.id;
      const checked = bulkAccessSelectedEmails.has(email);
      return `<label style="display:flex; align-items:center; gap:6px; padding:3px 0; cursor:pointer; font-size:13px;">
        <input type="checkbox" class="access-bulk-user-checkbox" data-email="${escapeHtml(email)}" ${checked ? "checked" : ""} />
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(email)}</span>
      </label>`;
    })
    .join("");
  const userListHtml = `
    <div style="display:flex; flex-direction:column; min-width:220px; flex-shrink:0;">
      <input type="search" class="access-bulk-user-search-input" placeholder="Search users…" value="${escapeHtml(bulkAccessUserSearchTerm)}" style="width:100%; box-sizing:border-box; padding:6px 8px; border-radius:6px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:12px; margin-bottom:6px;" />
      <div class="access-bulk-user-list" style="display:flex; flex-direction:column; max-height:220px; overflow-y:auto;">
        ${userRows || '<div style="color:var(--text); font-size:12px; padding:4px 0;">No matching users.</div>'}
      </div>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <button type="button" class="access-bulk-select-all-users-btn secondary" style="font-size:11px; padding:3px 8px;">Select All Users</button>
        <button type="button" class="access-bulk-select-none-users-btn secondary" style="font-size:11px; padding:3px 8px;">Select None</button>
      </div>
    </div>
  `;

  // Bulk grant/revoke editor (2026-09-02, item 4/5 of the "no automatic
  // access assignment" spec) - shown ABOVE the per-user editors below
  // whenever 2+ users are selected (including via "Select All Users"),
  // alongside them rather than replacing them, so an admin can still review
  // each selected user's individual state while also having a one-shot way
  // to grant/revoke a permission across the whole group. See
  // buildAccessSharedBulkEditorHtml's own comment for why this is
  // grant/revoke buttons rather than a synced checkbox tree.
  const sharedBulkEditorHtml = selectedUsers.length > 1 ? buildAccessSharedBulkEditorHtml(selectedUsers) : "";

  const accessEditorsHtml = selectedUsers.length
    ? selectedUsers
        .map((u) => {
          const email = u.email || u.id;
          const pending = bulkUserPending.get(email);
          if (!pending) return "";
          const tabsHtml = buildAccessTabsSectionsHtml(email, pending.tabs, pending.eraPermissions);
          return `
            <div class="access-bulk-user-editor" data-email="${escapeHtml(email)}" style="display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid var(--border); border-radius:8px;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                <div style="font-size:13px; font-weight:600;">${escapeHtml(email)}</div>
                <div style="display:flex; gap:8px; align-items:center;">
                  <select class="access-bulk-role-select" data-email="${escapeHtml(email)}" style="border-radius:8px; border:1px solid var(--border); padding:4px 6px; font-size:12px; background:var(--input-bg); color:var(--text);">
                    <option value="view" ${pending.role === "view" ? "selected" : ""}>View</option>
                    <option value="edit" ${pending.role === "edit" ? "selected" : ""}>Edit</option>
                    <option value="full" ${pending.role === "full" ? "selected" : ""}>Full access</option>
                  </select>
                  <select class="access-bulk-position-select" data-email="${escapeHtml(email)}" style="border-radius:8px; border:1px solid var(--border); padding:4px 6px; font-size:12px; background:var(--input-bg); color:var(--text);">
                    <option value="" ${pending.position === "" ? "selected" : ""}>No position</option>
                    ${Object.entries(POSITION_LABELS)
                      .map(([value, label]) => `<option value="${value}" ${pending.position === value ? "selected" : ""}>${label}</option>`)
                      .join("")}
                  </select>
                  <button type="button" class="secondary access-bulk-remove-btn" data-email="${escapeHtml(email)}" style="font-size:12px; padding:4px 8px;">Remove</button>
                </div>
              </div>
              <div style="display:flex; flex-direction:column; gap:8px;">${tabsHtml}</div>
              <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:13px; padding-top:6px; border-top:1px dashed var(--border);">
                <input type="checkbox" class="access-bulk-user-no-animation-checkbox" data-email="${escapeHtml(email)}" ${pending.disableAnimations ? "checked" : ""} /> No animation
              </label>
            </div>
          `;
        })
        .join("")
    : `<div style="color:var(--text); font-size:13px; padding:8px 0;">Select one or more existing users on the left to review and edit their access.</div>`;

  const hasPending = bulkAccessHasPendingChanges();
  const accessColumnHtml = `
    <div style="display:flex; flex-direction:column; gap:10px; flex:1; min-width:260px; padding-left:14px; margin-left:14px; border-left:1px solid var(--hover-bg);">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.03em; color:var(--text);">Accesses${selectedUsers.length ? ` (${selectedUsers.length} user${selectedUsers.length === 1 ? "" : "s"} selected)` : ""}</div>
      ${sharedBulkEditorHtml}
      <div class="access-bulk-editors-list" style="display:flex; flex-direction:column; gap:10px; max-height:420px; overflow-y:auto;">${accessEditorsHtml}</div>
      <button type="button" class="access-bulk-apply-btn" ${hasPending ? "" : "disabled"} style="align-self:flex-start; margin-top:4px;">Apply</button>
    </div>
  `;

  accessBulkPanelEl.innerHTML = `
    <div class="card" style="display:flex; flex-direction:column; gap:8px;">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.03em; color:var(--text);">Existing Users</div>
      <div style="display:flex; flex-direction:row; align-items:flex-start; flex-wrap:wrap;">
        ${userListHtml}
        ${accessColumnHtml}
      </div>
    </div>
  `;
  accessBulkPanelEl.querySelectorAll(".access-era-tree").forEach(applyEraTreeIndeterminateMarkers);
  restoreAccessScrollState(accessBulkPanelEl, scrollState);
}

accessBulkPanelEl?.addEventListener("click", (e) => {
  if (e.target.closest(".access-bulk-select-all-users-btn")) {
    accessBulkMatchingUsers().forEach((u) => bulkAccessSetUserSelected(u.email || u.id, true));
    renderAccessBulkPanel();
    return;
  }
  if (e.target.closest(".access-bulk-select-none-users-btn")) {
    bulkAccessSelectedEmails.clear();
    bulkUserOriginal.clear();
    bulkUserPending.clear();
    renderAccessBulkPanel();
    return;
  }
  // Shared bulk editor (2026-09-02, only rendered when 2+ users are
  // selected - see buildAccessSharedBulkEditorHtml). Each button here only
  // mutates bulkUserPending for the currently-selected users; Apply (same
  // button as the single-user editor uses) is what actually saves it.
  const bulkPermBtn = e.target.closest(".access-bulk-grant-btn, .access-bulk-revoke-btn");
  if (bulkPermBtn) {
    bulkAccessSetPermissionForAllSelected(bulkPermBtn.dataset.bulkField, bulkPermBtn.dataset.bulkKey, bulkPermBtn.classList.contains("access-bulk-grant-btn"));
    return;
  }
  const bulkRoleApplyBtn = e.target.closest(".access-bulk-shared-role-apply-btn");
  if (bulkRoleApplyBtn) {
    const select = bulkRoleApplyBtn.closest(".access-bulk-shared-editor")?.querySelector(".access-bulk-shared-role-select");
    const value = select?.value || "view";
    bulkAccessApplyToAllSelected((pending) => {
      pending.role = value;
    });
    return;
  }
  const bulkPositionApplyBtn = e.target.closest(".access-bulk-shared-position-apply-btn");
  if (bulkPositionApplyBtn) {
    const select = bulkPositionApplyBtn.closest(".access-bulk-shared-editor")?.querySelector(".access-bulk-shared-position-select");
    const value = select?.value || "";
    bulkAccessApplyToAllSelected((pending) => {
      pending.position = value;
    });
    return;
  }
  const selectAllBtn = e.target.closest(".access-select-all-btn");
  if (selectAllBtn) {
    const editor = selectAllBtn.closest(".access-bulk-user-editor");
    const email = editor?.dataset.email;
    const section = selectAllBtn.closest(".access-tab-section, .access-era-tree");
    if (!editor || !email || !section) return;
    const setChecked = selectAllBtn.dataset.mode === "all";
    section.querySelectorAll('input[type="checkbox"]').forEach((c) => {
      c.checked = setChecked;
      c.indeterminate = false;
    });
    if (section.classList.contains("access-era-tree")) recomputeEraTreeIndeterminate(section);
    bulkAccessSyncPendingFromEditor(email, editor);
    renderAccessBulkPanel();
    return;
  }
  const applyBtn = e.target.closest(".access-bulk-apply-btn");
  if (applyBtn) applyBulkAccessChanges();
  const removeBtn = e.target.closest(".access-bulk-remove-btn");
  if (removeBtn) {
    // Removal is immediate (with confirmation), not batched with Apply -
    // deleting the account entirely isn't a "permission change" to stage
    // and review alongside the others.
    const email = removeBtn.dataset.email;
    if (email && confirm(`Remove access for ${email}?`)) {
      removeAuthorizedUserFn({ email }).catch((err) => {
        console.error(err);
        alert("Could not remove user: " + err.message);
      });
    }
  }
});

accessBulkPanelEl?.addEventListener("input", (e) => {
  const searchInput = e.target.closest(".access-bulk-user-search-input");
  if (!searchInput) return;
  bulkAccessUserSearchTerm = searchInput.value;
  renderAccessBulkPanel();
  // Re-rendering just replaced the search input itself - refocus the fresh
  // one and put the caret back at the end so typing isn't interrupted.
  const freshInput = accessBulkPanelEl.querySelector(".access-bulk-user-search-input");
  if (freshInput) {
    freshInput.focus();
    const pos = freshInput.value.length;
    freshInput.setSelectionRange(pos, pos);
  }
});

accessBulkPanelEl?.addEventListener("change", (e) => {
  const userCheckbox = e.target.closest(".access-bulk-user-checkbox");
  if (userCheckbox) {
    bulkAccessSetUserSelected(userCheckbox.dataset.email, userCheckbox.checked);
    renderAccessBulkPanel();
    return;
  }

  const noAnimCheckbox = e.target.closest(".access-bulk-user-no-animation-checkbox");
  if (noAnimCheckbox) {
    const pending = bulkUserPending.get(noAnimCheckbox.dataset.email);
    if (!pending) return;
    pending.disableAnimations = noAnimCheckbox.checked;
    renderAccessBulkPanel();
    return;
  }

  const roleSelect = e.target.closest(".access-bulk-role-select");
  if (roleSelect) {
    const pending = bulkUserPending.get(roleSelect.dataset.email);
    if (!pending) return;
    pending.role = roleSelect.value;
    renderAccessBulkPanel();
    return;
  }

  const positionSelect = e.target.closest(".access-bulk-position-select");
  if (positionSelect) {
    const pending = bulkUserPending.get(positionSelect.dataset.email);
    if (!pending) return;
    pending.position = positionSelect.value;
    renderAccessBulkPanel();
    return;
  }

  // Everything below lives inside one selected user's editor tree
  // (buildAccessTabsSectionsHtml's markup) - update that user's
  // bulkUserPending entry from the tree instead of persisting immediately.
  // A single checkbox click on an individual ERA_TREE node cascades into
  // its own sub-items (handleEraNodeToggle), and so does the "CW Email
  // Request" row's own main checkbox (handleEraMainToggle, 2026-09-19
  // follow-up - it's the tree's root now, not a separate flat "just this
  // tab" toggle) - the explicit Select All/None buttons above still exist
  // for setting a whole section at once without touching its neighbors.
  const editor = e.target.closest(".access-bulk-user-editor");
  if (!editor) return;
  const email = editor.dataset.email;

  const eraMainCheckbox = e.target.closest(".access-era-main-checkbox");
  if (eraMainCheckbox) {
    handleEraMainToggle(eraMainCheckbox);
    bulkAccessSyncPendingFromEditor(email, editor);
    renderAccessBulkPanel();
    return;
  }

  const tabCheckbox = e.target.closest(".access-tab-checkbox");
  if (tabCheckbox) {
    bulkAccessSyncPendingFromEditor(email, editor);
    renderAccessBulkPanel();
    return;
  }

  const eraNodeCheckbox = e.target.closest(".access-era-node-checkbox");
  if (eraNodeCheckbox) {
    handleEraNodeToggle(eraNodeCheckbox);
    bulkAccessSyncPendingFromEditor(email, editor);
    renderAccessBulkPanel();
  }
});

// A click on any ERA_TREE node checkbox (branch or leaf) cascades: every
// leaf under it (eraLeavesUnder) is set to the new checked value, then
// every ancestor up to the tree's root is recomputed from its own children
// (recomputeEraTreeIndeterminate) - this is the actual cascading behavior
// this rebuild adds (the old flat eraModes/eraKeycardActions/
// eraHardwareCategories tree deliberately did NOT cascade).
function handleEraNodeToggle(checkboxEl) {
  const tree = checkboxEl.closest(".access-era-tree");
  if (!tree) return;
  const path = checkboxEl.dataset.eraPath;
  const checked = checkboxEl.checked;
  const prefix = path + ".";
  tree.querySelectorAll(".access-era-node-checkbox[data-era-path]").forEach((c) => {
    const p = c.dataset.eraPath;
    if (p === path || p.startsWith(prefix)) {
      c.checked = checked;
      c.indeterminate = false;
    }
  });
  recomputeEraTreeIndeterminate(tree);
}

// Toggling the "CW Email Request" row's own main checkbox now cascades the
// same way an individual ERA_TREE node does (2026-09-19 follow-up, per
// Huy's request: "CW Email Request must be the parent access permission" -
// checking it grants every leaf underneath, unchecking clears them all).
// It isn't itself an .access-era-node-checkbox (it doubles as this one
// tab's "tabs" grant, data-tab="emailRequestAttachmentsEmbed", and sits one
// level above the tree's own 5 top-level branches), so it gets its own
// toggle handler instead of reusing handleEraNodeToggle directly - the
// effect is the same: set every leaf, then let
// recomputeEraTreeIndeterminate re-derive every branch (including this
// checkbox itself) from the result.
function handleEraMainToggle(checkboxEl) {
  const tree = checkboxEl.closest(".access-era-tree");
  if (!tree) return;
  const checked = checkboxEl.checked;
  tree.querySelectorAll(".access-era-node-checkbox[data-era-path]").forEach((c) => {
    c.checked = checked;
    c.indeterminate = false;
  });
  recomputeEraTreeIndeterminate(tree);
}

// Recomputes every branch checkbox's checked/indeterminate state, bottom-up,
// from its own children's live checkbox state - generic over the whole
// ERA_TREE shape (unlike the old two-level Keycard/Hardware-only version),
// so it works unchanged at every depth (Electrical's 2 levels, Software's
// and Hardware>Printer's 3-4). A leaf's own checkbox is authoritative (set
// directly by handleEraNodeToggle or a Select All/None button) and is never
// recomputed here.
function recomputeEraTreeIndeterminate(tree) {
  if (!tree) return;
  const checkboxesByPath = new Map();
  tree.querySelectorAll(".access-era-node-checkbox[data-era-path]").forEach((c) => checkboxesByPath.set(c.dataset.eraPath, c));
  function recomputeNode(path, node) {
    if (typeof node === "string") return; // leaf - nothing to derive
    const childKeys = Object.keys(node.children);
    childKeys.forEach((key) => recomputeNode(`${path}.${key}`, node.children[key]));
    const cb = checkboxesByPath.get(path);
    const childCheckboxes = childKeys.map((key) => checkboxesByPath.get(`${path}.${key}`)).filter(Boolean);
    if (!cb || !childCheckboxes.length) return;
    const fullyChecked = childCheckboxes.filter((c) => c.checked && !c.indeterminate).length;
    const anyChecked = childCheckboxes.some((c) => c.checked || c.indeterminate);
    cb.checked = fullyChecked === childCheckboxes.length;
    cb.indeterminate = !cb.checked && anyChecked;
  }
  Object.keys(ERA_TREE).forEach((key) => recomputeNode(key, ERA_TREE[key]));
  // The tab-level main checkbox (CW Email Request itself) reflects the 5
  // top-level ERA_TREE branches the same way any other branch reflects its
  // children - except it must read `checked` whenever ANY of them is
  // granted, not only when ALL of them are: this same checkbox doubles as
  // the real "tabs" grant (see its own data-tab attribute), and a partial
  // grant (e.g. only Keycard) still needs the CW Email Request tab itself
  // to stay in the saved tabs array, or the tab would vanish the next time
  // this editor is saved despite the user still having real permissions
  // underneath it.
  const main = tree.querySelector(".access-era-main-checkbox");
  if (main) {
    const topCheckboxes = Object.keys(ERA_TREE).map((key) => checkboxesByPath.get(key)).filter(Boolean);
    if (topCheckboxes.length) {
      const fullyChecked = topCheckboxes.filter((c) => c.checked && !c.indeterminate).length;
      const anyChecked = topCheckboxes.some((c) => c.checked || c.indeterminate);
      main.checked = anyChecked;
      main.indeterminate = anyChecked && fullyChecked !== topCheckboxes.length;
    }
  }
}

// Reads the live checked state of a CW Email Request tree back out as a flat
// eraPermissions array of granted LEAF paths only (a checked branch
// checkbox is derived, not itself a grantable unit - see
// recomputeEraTreeIndeterminate - so it's filtered out here via
// ERA_ALL_LEAVES; sanitizeEraPermissions in functions/index.js re-validates
// this same set server-side).
function collectEraPermissions(tree) {
  if (!tree) return [];
  return Array.from(tree.querySelectorAll(".access-era-node-checkbox:checked"))
    .map((c) => c.dataset.eraPath)
    .filter((path) => ERA_ALL_LEAVES.has(path));
}

// The "add new user" row's tabs tree is static data (always starts fully
// unchecked, see buildAccessTabsSectionsHtml's isNew branch) - rendered
// once here rather than re-rendered every renderAccessBulkPanel() refresh,
// so an admin's in-progress picks for a not-yet-added user survive the
// bulk panel re-rendering out from under them (e.g. another admin adding
// someone else concurrently).
if (accessNewTabsRowEl) {
  accessNewTabsRowEl.innerHTML = `<span style="font-size:11px; text-transform:uppercase; letter-spacing:0.03em; color:var(--text);">Visible tabs:</span>${buildAccessTabsDropdownHtml(null, null, null)}`;
  accessNewTabsRowEl.querySelectorAll(".access-era-tree").forEach((tree) => {
    applyEraTreeIndeterminateMarkers(tree);
    recomputeEraTreeIndeterminate(tree);
  });
  accessNewTabsRowEl.querySelectorAll(".access-tabs-dropdown").forEach(syncAccessTabsDropdownUI);
}

async function submitAuthorizedUser() {
  const email = accessEmailInput.value.trim().toLowerCase();
  const role = accessRoleSelect.value;
  const position = accessPositionSelect?.value || "";
  if (!email || !email.includes("@")) {
    accessEmailInput.focus();
    accessEmailInput.style.borderColor = "var(--danger-light)";
    setTimeout(() => {
      accessEmailInput.style.borderColor = "var(--border)";
    }, 1200);
    return;
  }
  const tabs = Array.from(document.querySelectorAll(".access-new-tab-checkbox:checked")).map((c) => c.dataset.tab);
  // eraPermissions (2026-08-30, rebuilt 2026-09-19 onto ERA_TREE) - same
  // new-row checkboxes as tabs above, scoped to accessNewTabsRowEl's own
  // tree (per-user rows use the same .access-era-node-checkbox class, just
  // in a different tree instance).
  const eraPermissions = collectEraPermissions(accessNewTabsRowEl?.querySelector(".access-era-tree"));
  // No Animation (2026-08-31) - now one of the new-user VISIBLE TABS:
  // dropdown's own checkboxes (see buildAccessTabsSectionsHtml) rather than
  // a standalone checkbox next to Add.
  const disableAnimations = !!accessNewTabsRowEl?.querySelector('.access-tabs-extra-option-checkbox[data-tab="noAnimation"]')?.checked;
  accessAddBtn.disabled = true;
  try {
    await addAuthorizedUserFn({ email, role, position, tabs, eraPermissions, disableAnimations });
    accessEmailInput.value = "";
    if (accessPositionSelect) accessPositionSelect.value = "";
    // All unchecked by default (see access-new-tab-checkbox's own comment in
    // index.html) - reset back to that same starting state after each add,
    // rather than re-checking everything. Includes the era tree's leaves and
    // the folded-in No Animation checkbox; recomputeEraTreeIndeterminate
    // then clears the main/Keycard checkboxes' indeterminate flag back to a
    // plain unchecked state.
    accessNewTabsRowEl?.querySelectorAll(".access-new-tab-checkbox, .access-era-node-checkbox, .access-tabs-extra-option-checkbox").forEach((c) => {
      c.checked = false;
      c.indeterminate = false;
    });
    recomputeEraTreeIndeterminate(accessNewTabsRowEl?.querySelector(".access-era-tree"));
    // Close the dropdown and reset it back to "No tabs selected" too, same
    // as the checkboxes it wraps just got reset above.
    openAccessTabsDropdowns.delete(ACCESS_NEW_USER_DROPDOWN_KEY);
    const newDropdown = accessNewTabsRowEl?.querySelector(".access-tabs-dropdown");
    if (newDropdown) {
      const panel = newDropdown.querySelector(".access-tabs-dropdown-panel");
      if (panel) panel.style.display = "none";
      syncAccessTabsDropdownUI(newDropdown);
    }
  } catch (err) {
    console.error(err);
    alert("Could not add user: " + err.message);
  } finally {
    accessAddBtn.disabled = false;
  }
}

accessAddBtn?.addEventListener("click", submitAuthorizedUser);
accessEmailInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitAuthorizedUser();
});

// One-time tag-catalog migration (2026-08-10) - see #tagMigrationWrap's own
// comment in index.html and migrateTagCatalogsToShared in functions/index.js.
// Preview and Run both call the same callable, differing only in dryRun -
// Preview writes nothing, Run actually performs the merge/rewrite. The
// result (counts + label->newId mapping) is dumped into a <pre> rather than
// summarized, since this is a one-off admin tool, not something that needs
// a polished rendering.
function runTagMigration(dryRun) {
  if (!tagMigrationResultEl) return;
  if (!dryRun && !confirm("Run the tag migration for real? This merges the old tag catalogs into the shared one and rewrites tagged items to match. Preview first if you haven't already. This can't be undone (though it's safe to run again).")) {
    return;
  }
  const btn = dryRun ? tagMigrationPreviewBtn : tagMigrationRunBtn;
  if (btn) {
    btn.disabled = true;
    btn.textContent = dryRun ? "Previewing…" : "Running…";
  }
  tagMigrationResultEl.style.display = "block";
  tagMigrationResultEl.textContent = dryRun ? "Running preview…" : "Running migration…";
  migrateTagCatalogsToSharedFn({ dryRun })
    .then((res) => {
      tagMigrationResultEl.textContent = JSON.stringify(res.data, null, 2);
    })
    .catch((err) => {
      console.error(err);
      tagMigrationResultEl.textContent = "Error: " + (err?.message || "Something went wrong.");
    })
    .finally(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = dryRun ? "Preview (dry run)" : "Run migration";
      }
    });
}
tagMigrationPreviewBtn?.addEventListener("click", () => runTagMigration(true));
tagMigrationRunBtn?.addEventListener("click", () => runTagMigration(false));

// One-time accessControl backfill (2026-09-02) - same Preview/Run pattern as
// runTagMigration above, see #accessMigrationWrap in index.html and
// migrateAccessControlPermissions in functions/index.js for why this exists.
function runAccessMigration(dryRun) {
  if (!accessMigrationResultEl) return;
  if (!dryRun && !confirm("Run the access-control backfill for real? This snapshots explicit tab/mode/action/category permissions for any account still on the old null-means-everything convention, and strips Hardware access from every existing user. Preview first if you haven't already. This can't be undone (though it's safe to run again).")) {
    return;
  }
  const btn = dryRun ? accessMigrationPreviewBtn : accessMigrationRunBtn;
  if (btn) {
    btn.disabled = true;
    btn.textContent = dryRun ? "Previewing…" : "Running…";
  }
  accessMigrationResultEl.style.display = "block";
  accessMigrationResultEl.textContent = dryRun ? "Running preview…" : "Running migration…";
  migrateAccessControlPermissionsFn({ dryRun })
    .then((res) => {
      accessMigrationResultEl.textContent = JSON.stringify(res.data, null, 2);
    })
    .catch((err) => {
      console.error(err);
      accessMigrationResultEl.textContent = "Error: " + (err?.message || "Something went wrong.");
    })
    .finally(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = dryRun ? "Preview (dry run)" : "Run migration";
      }
    });
}
accessMigrationPreviewBtn?.addEventListener("click", () => runAccessMigration(true));
accessMigrationRunBtn?.addEventListener("click", () => runAccessMigration(false));

// Select All/Remove All (2026-08-30) - one tiny pair of buttons per
// MANAGEABLE_TABS section on the "add new user" row (existing users' own
// Select All/None, inside the Existing Users bulk panel, are handled by
// accessBulkPanelEl's own click listener below instead - see
// bulkAccessSyncPendingFromEditor). For a flat section that's just
// checking/unchecking its one checkbox; for the CW Email Request tree it's
// every checkbox in the tree at once (main + all 6 modes + Keycard's 6
// actions) - explicit bulk actions, unlike a single checkbox click, which no
// longer cascades (see the "change" listener below).
function handleAccessSelectAllClick(btn) {
  const section = btn.closest(".access-tab-section, .access-era-tree");
  if (!section) return;
  const setChecked = btn.dataset.mode === "all";
  section.querySelectorAll('input[type="checkbox"]').forEach((c) => {
    c.checked = setChecked;
    c.indeterminate = false;
  });
  const tree = section.classList.contains("access-era-tree") ? section : null;
  if (tree) recomputeEraTreeIndeterminate(tree);
  syncAccessTabsDropdownUI(btn.closest(".access-tabs-dropdown"));
  // Nothing to persist here - the "add new user" row's checkboxes aren't
  // saved anywhere until Submit is clicked (see submitAuthorizedUser).
}
accessNewTabsRowEl?.addEventListener("click", (e) => {
  if (handleAccessTabsDropdownToggleClick(e)) return;
  const btn = e.target.closest(".access-select-all-btn");
  if (btn) handleAccessSelectAllClick(btn);
});

// The "add new user" row's tab/era checkboxes aren't persisted anywhere
// until Submit is clicked (see submitAuthorizedUser, which reads them
// fresh) - so this only needs to keep the dropdown's own Select All/summary
// in sync. A single ERA_TREE node checkbox click cascades into its
// sub-items (handleEraNodeToggle) - this rebuild's whole point, unlike the
// old flat eraModes/etc. tree, which deliberately didn't - and so does the
// "CW Email Request" row's own main checkbox (handleEraMainToggle,
// 2026-09-19 follow-up: it's the tree's root now, checking it grants every
// leaf underneath).
accessNewTabsRowEl?.addEventListener("change", (e) => {
  const eraMainCheckbox = e.target.closest(".access-era-main-checkbox");
  if (eraMainCheckbox) handleEraMainToggle(eraMainCheckbox);
  const eraNodeCheckbox = e.target.closest(".access-era-node-checkbox");
  if (eraNodeCheckbox) handleEraNodeToggle(eraNodeCheckbox);
  const dropdown = e.target.closest(".access-tabs-dropdown");
  if (!dropdown) return;
  const selectAllCheckbox = e.target.closest(".access-tabs-select-all-checkbox");
  if (selectAllCheckbox) {
    handleAccessSelectAllToggle(selectAllCheckbox);
    return;
  }
  syncAccessTabsDropdownUI(dropdown);
});

function subscribeToRoadmapItems() {
  if (unsubscribeRoadmapItems) {
    unsubscribeRoadmapItems();
    unsubscribeRoadmapItems = null;
  }
  if (unsubscribeAccessList) {
    unsubscribeAccessList();
    unsubscribeAccessList = null;
  }
  if (unsubscribeStandupSaves) {
    unsubscribeStandupSaves();
    unsubscribeStandupSaves = null;
  }
  if (unsubscribeDailyTodoSaves) {
    unsubscribeDailyTodoSaves();
    unsubscribeDailyTodoSaves = null;
  }
  if (unsubscribeIssueItems) {
    unsubscribeIssueItems();
    unsubscribeIssueItems = null;
  }

  allRoadmapItems = [];
  loadingEl.style.display = "block";
  emptyEl.style.display = "none";
  listEl.innerHTML = "";

  const q = query(collection(db, "roadmapItems"), orderBy("createdAt", "desc"), limit(FETCH_LIMIT));
  unsubscribeRoadmapItems = onSnapshot(q, (snapshot) => {
    allRoadmapItems = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    loadingEl.style.display = "none";
    populateRoadmapStateFilterOptions();
    render();
  });
}

// Issue tab - same shape as subscribeToRoadmapItems above (a real, always-
// live listener over a hand-entered collection), just no state-filter
// dropdown to repopulate.
function subscribeToIssueItems() {
  if (unsubscribeRoadmapItems) {
    unsubscribeRoadmapItems();
    unsubscribeRoadmapItems = null;
  }
  if (unsubscribeAccessList) {
    unsubscribeAccessList();
    unsubscribeAccessList = null;
  }
  if (unsubscribeStandupSaves) {
    unsubscribeStandupSaves();
    unsubscribeStandupSaves = null;
  }
  if (unsubscribeDailyTodoSaves) {
    unsubscribeDailyTodoSaves();
    unsubscribeDailyTodoSaves = null;
  }
  if (unsubscribeIssueItems) {
    unsubscribeIssueItems();
    unsubscribeIssueItems = null;
  }

  allIssueItems = [];
  if (issueListEl) issueListEl.innerHTML = "";

  const q = query(collection(db, "issueItems"), orderBy("createdAt", "desc"), limit(FETCH_LIMIT));
  unsubscribeIssueItems = onSnapshot(q, (snapshot) => {
    allIssueItems = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderIssueView();
  });
}

// Small collection (one doc per thread that's ever been marked complete),
// so a plain unfiltered subscription is fine - no query/index needed. This
// stays subscribed for the whole session regardless of which tab is
// active. Currently has no on-screen consumer (see threadStatusMap above),
// but kept subscribed to match the server-side collection/callable it
// mirrors.
function subscribeToThreadStatus() {
  onSnapshot(collection(db, "threadStatus"), (snapshot) => {
    threadStatusMap = {};
    snapshot.docs.forEach((d) => {
      threadStatusMap[d.id] = d.data();
    });
    render();
  });
}

// Everyone's saved Cost Breakdown rows, folded into one growing shared
// catalog server-side by updateRoadmapItem (see functions/index.js) - a
// single small doc, so like threadStatus above this just stays subscribed
// for the whole session rather than being tied to the Roadmap tab's own
// lifecycle. No render() needed on change: it only feeds the autocomplete
// dropdown, which is built fresh at the moment someone types.
let roadmapCustomLineItemCatalog = [];
function subscribeToCustomLineItemCatalog() {
  onSnapshot(doc(db, "roadmapSettings", "customLineItems"), (snap) => {
    const items = snap.data()?.items || {};
    roadmapCustomLineItemCatalog = Object.values(items)
      .filter((it) => it && typeof it.desc === "string" && typeof it.amount === "number")
      .map((it) => ({ n: it.desc, amount: it.amount, vendor: ROADMAP_VENDORS.some((v) => v.key === it.vendor) ? it.vendor : "unifi" }));
  });
}

// Standup's location auto-detection (see standupDetectLocationState above) -
// same "stays subscribed for the whole session" treatment as
// subscribeToCustomLineItemCatalog just above, since this is small reference
// data, not something tied to the Standup tab's own lifecycle. Every entry
// Huy confirms via the Report step's "ask before adding" prompt (see
// addStandupLocationFn) lands here and gets folded into
// STANDUP_LOCATION_INDEX, so it's recognized on every future report, not
// just for the rest of this session.
let allStandupCustomLocations = [];
function subscribeToStandupLocationCatalog() {
  onSnapshot(
    collection(db, "standupLocationCatalog"),
    (snapshot) => {
      // Keeps the doc id alongside its data (2026-08-05) - needed so the
      // cleanup list below (renderStandupLocationCatalogList) can delete a
      // specific bad entry via deleteStandupLocationFn.
      allStandupCustomLocations = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      standupRebuildLocationIndex();
      renderStandupLocationCatalogList();
    },
    (err) => console.error(err)
  );
}

// Shared tag catalog (2026-08-10 unification) - one onSnapshot listener,
// covering all three tabs, replacing the three separate
// subscribeTo{Standup,DailyTodo,Issue}TagCatalog listeners this used to be
// (each on its own now-retired collection). A tag created from any tab
// lands here and is folded into sharedAllTags() (see the Standup tab
// section above), so it's available - and re-renders live - on every tab at
// once, not just the one it was created from.
function subscribeToSharedTagCatalog() {
  onSnapshot(
    collection(db, "sharedTagCatalog"),
    (snapshot) => {
      allSharedCustomTags = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // All three tabs' "Manage custom tags" lists show the same shared
      // catalog now, so all three re-render together.
      renderStandupTagCatalogList();
      renderDailyTodoTagCatalogList();
      renderIssueTagCatalogList();
      populateIssueTagSelect();
      // Re-render whichever tab's live list/checklist/board is currently
      // showing - a tag added from another device/session should show up in
      // every dropdown/card without needing a manual refresh.
      if (currentStandupStep === "pull") renderStandupChecklist();
      if (currentDailyTodoStep === "log") renderDailyTodoList();
      if (currentApp === ISSUE_APP_KEY) renderIssueView();
    },
    (err) => console.error(err)
  );
}

// Collapsed cleanup list (see the "Manage custom tags" <details> in
// index.html) for allSharedCustomTags - lets Huy delete a tag he created by
// mistake or no longer wants. Because the catalog is shared, deleting it
// here removes it from Daily To-Do's and Issue's own "Manage custom tags"
// lists too (see renderDailyTodoTagCatalogList/renderIssueTagCatalogList
// below - all three render the exact same underlying list into their own
// tab's panel). The fixed 8 STANDUP_TAGS aren't shown here since they're not
// part of this runtime catalog and can't be deleted this way.
function renderDailyTodoTagCatalogList() {
  if (!dailyTodoTagCatalogListEl) return;
  if (!allSharedCustomTags.length) {
    dailyTodoTagCatalogListEl.innerHTML = '<p style="font-size:12px; color:var(--text);">No custom tags yet.</p>';
    return;
  }
  dailyTodoTagCatalogListEl.innerHTML = allSharedCustomTags
    .slice()
    .sort((a, b) => (a.label || "").localeCompare(b.label || ""))
    .map(
      (tag) => `<div class="daily-todo-tag-catalog-row" data-id="${tag.id || ""}" style="display:flex; gap:8px; align-items:center; padding:4px 6px; border-bottom:1px solid var(--hover-bg);">
        <span style="width:10px; height:10px; border-radius:50%; background:${tag.color || "#6b7280"}; flex-shrink:0;"></span>
        <span style="font-size:12px; color:var(--text); flex:1;">${escapeHtml(tag.label || "")}</span>
        <button type="button" class="daily-todo-tag-catalog-delete secondary" style="font-size:11px; padding:3px 8px; color:var(--danger-light); border-color:var(--danger-border);" ${tag.id ? "" : "disabled"}>Delete</button>
      </div>`
    )
    .join("");
}

dailyTodoTagCatalogListEl?.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest(".daily-todo-tag-catalog-delete");
  if (!deleteBtn) return;
  const row = deleteBtn.closest(".daily-todo-tag-catalog-row");
  const id = row?.dataset.id;
  if (!id) return;
  if (!confirm("Remove this tag everywhere (Standup, Daily To-Do, and Issue)? Entries already using it will show as untagged. This can't be undone.")) return;
  deleteBtn.disabled = true;
  deleteBtn.textContent = "Deleting…";
  deleteSharedTagFn({ id })
    .then(() => {
      // subscribeToSharedTagCatalog's onSnapshot listener re-renders this
      // list (and every tab's dropdowns) the moment the delete lands -
      // nothing else to do on success here.
    })
    .catch((err) => {
      console.error(err);
      alert("Could not delete: " + (err?.message || "Something went wrong."));
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete";
    });
});

// Collapsed cleanup list (see the "Manage custom tags" <details> in
// index.html) for allSharedCustomTags - same shape as
// renderDailyTodoTagCatalogList above (and same "shared across all three
// tabs" behavior - see that comment). The fixed 8 STANDUP_TAGS aren't shown
// here since they're not part of this runtime catalog and can't be deleted
// this way.
function renderIssueTagCatalogList() {
  if (!issueTagCatalogListEl) return;
  if (!allSharedCustomTags.length) {
    issueTagCatalogListEl.innerHTML = '<p style="font-size:12px; color:var(--text);">No custom tags yet.</p>';
    return;
  }
  issueTagCatalogListEl.innerHTML = allSharedCustomTags
    .slice()
    .sort((a, b) => (a.label || "").localeCompare(b.label || ""))
    .map(
      (tag) => `<div class="issue-tag-catalog-row" data-id="${tag.id || ""}" style="display:flex; gap:8px; align-items:center; padding:4px 6px; border-bottom:1px solid var(--hover-bg);">
        <span style="width:10px; height:10px; border-radius:50%; background:${tag.color || "#6b7280"}; flex-shrink:0;"></span>
        <span style="font-size:12px; color:var(--text); flex:1;">${escapeHtml(tag.label || "")}</span>
        <button type="button" class="issue-tag-catalog-delete secondary" style="font-size:11px; padding:3px 8px; color:var(--danger-light); border-color:var(--danger-border);" ${tag.id ? "" : "disabled"}>Delete</button>
      </div>`
    )
    .join("");
}

issueTagCatalogListEl?.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest(".issue-tag-catalog-delete");
  if (!deleteBtn) return;
  const row = deleteBtn.closest(".issue-tag-catalog-row");
  const id = row?.dataset.id;
  if (!id) return;
  if (!confirm("Remove this tag everywhere (Standup, Daily To-Do, and Issue)? Issues already using it will show as untagged. This can't be undone.")) return;
  deleteBtn.disabled = true;
  deleteBtn.textContent = "Deleting…";
  deleteSharedTagFn({ id })
    .then(() => {
      // subscribeToSharedTagCatalog's onSnapshot listener re-renders this
      // list (and the "New issue" form's tag select) the moment the delete
      // lands - nothing else to do on success here.
    })
    .catch((err) => {
      console.error(err);
      alert("Could not delete: " + (err?.message || "Something went wrong."));
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete";
    });
});

// Collapsed cleanup list (see the "Manage custom tags" <details> in
// index.html) for allSharedCustomTags - lets Huy delete a tag he created by
// mistake or no longer wants. Same "shared across all three tabs" behavior
// as renderDailyTodoTagCatalogList/renderIssueTagCatalogList above. The
// fixed 8 STANDUP_TAGS aren't shown here since they're not part of this
// runtime catalog and can't be deleted this way.
function renderStandupTagCatalogList() {
  if (!standupTagCatalogListEl) return;
  if (!allSharedCustomTags.length) {
    standupTagCatalogListEl.innerHTML = '<p style="font-size:12px; color:var(--text);">No custom tags yet.</p>';
    return;
  }
  standupTagCatalogListEl.innerHTML = allSharedCustomTags
    .slice()
    .sort((a, b) => (a.label || "").localeCompare(b.label || ""))
    .map(
      (tag) => `<div class="standup-tag-catalog-row" data-id="${tag.id || ""}" style="display:flex; gap:8px; align-items:center; padding:4px 6px; border-bottom:1px solid var(--hover-bg);">
        <span style="width:10px; height:10px; border-radius:50%; background:${tag.color || "#6b7280"}; flex-shrink:0;"></span>
        <span style="font-size:12px; color:var(--text); flex:1;">${escapeHtml(tag.label || "")}</span>
        <button type="button" class="standup-tag-catalog-delete secondary" style="font-size:11px; padding:3px 8px; color:var(--danger-light); border-color:var(--danger-border);" ${tag.id ? "" : "disabled"}>Delete</button>
      </div>`
    )
    .join("");
}

standupTagCatalogListEl?.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest(".standup-tag-catalog-delete");
  if (!deleteBtn) return;
  const row = deleteBtn.closest(".standup-tag-catalog-row");
  const id = row?.dataset.id;
  if (!id) return;
  if (!confirm("Remove this tag everywhere (Standup, Daily To-Do, and Issue)? Tasks already using it will fall back to Other next time they're saved. This can't be undone.")) return;
  deleteBtn.disabled = true;
  deleteBtn.textContent = "Deleting…";
  deleteSharedTagFn({ id })
    .then(() => {
      // subscribeToSharedTagCatalog's onSnapshot listener re-renders this
      // list (and the checklist's dropdowns) the moment the delete lands -
      // nothing else to do on success here.
    })
    .catch((err) => {
      console.error(err);
      alert("Could not delete: " + (err?.message || "Something went wrong."));
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete";
    });
});

// Shared render() dispatcher - Roadmap is the only tab left that renders
// through here; every other tab (Access, Email Request, Standup, Daily
// To-Do) either renders itself directly from its own onSnapshot listener/
// workflow-step renderer, or has no list of its own at all, so there's
// nothing for this to do for them.
function render() {
  if (currentApp === ROADMAP_APP_KEY) {
    renderRoadmapView();
  }
}

// Grabs whatever's currently typed into a card's edit form (title, state,
// notes, every Cost Breakdown row) straight from the DOM - not from
// allRoadmapItems, which only has the last *saved* values.
function captureRoadmapEditDraft(id) {
  const card = listEl.querySelector(`.roadmap-save-edit-btn[data-id="${CSS.escape(id)}"]`)?.closest(".card");
  if (!card) return null;
  return {
    title: card.querySelector(".roadmap-edit-title")?.value ?? "",
    state: card.querySelector(".roadmap-edit-state")?.value ?? "",
    notes: card.querySelector(".roadmap-edit-notes")?.value ?? "",
    deployStart: card.querySelector(".roadmap-edit-deploy-start")?.value ?? "",
    deployDuration: card.querySelector(".roadmap-edit-deploy-duration")?.value ?? "",
    lineItems: Array.from(card.querySelectorAll(".roadmap-lineitem-row")).map((row) => ({
      desc: row.querySelector(".roadmap-lineitem-desc")?.value ?? "",
      qty: row.querySelector(".roadmap-lineitem-qty")?.value ?? "",
      amount: row.querySelector(".roadmap-lineitem-amount")?.value ?? "",
      vendor: row.dataset.vendor || "unifi",
    })),
  };
}

function restoreRoadmapEditDraft(id, draft) {
  if (!draft) return;
  const card = listEl.querySelector(`.roadmap-save-edit-btn[data-id="${CSS.escape(id)}"]`)?.closest(".card");
  if (!card) return;
  const titleInput = card.querySelector(".roadmap-edit-title");
  if (titleInput) titleInput.value = draft.title;
  const stateInput = card.querySelector(".roadmap-edit-state");
  if (stateInput) stateInput.value = draft.state;
  const notesInput = card.querySelector(".roadmap-edit-notes");
  if (notesInput) notesInput.value = draft.notes;
  const deployStartInput = card.querySelector(".roadmap-edit-deploy-start");
  if (deployStartInput) deployStartInput.value = draft.deployStart;
  const deployDurationInput = card.querySelector(".roadmap-edit-deploy-duration");
  if (deployDurationInput) deployDurationInput.value = draft.deployDuration;
  updateRoadmapDeployEndLabel(card);
  if (draft.lineItems.length) {
    ROADMAP_VENDORS.forEach(({ key }) => {
      const rowsContainer = card.querySelector(`.roadmap-vendor-section[data-vendor="${key}"] .roadmap-lineitems-rows`);
      if (!rowsContainer) return;
      const vendorItems = draft.lineItems.filter((li) => (li.vendor || "unifi") === key);
      if (!vendorItems.length) return;
      rowsContainer.innerHTML = vendorItems.map((li) => roadmapLineItemRowHtml(li, key)).join("");
      refreshRoadmapLineItemMoveButtons(rowsContainer);
    });
  }
  const wrap = card.querySelector(".roadmap-lineitems-wrap");
  if (wrap) recomputeRoadmapLineItemsTotal(wrap);
}

// Roadmap items are flat (no threading, no merge-across-messages), so this
// mirrors the shape of render() above but is much simpler: filter by the
// Active/Complete tab and the search box, sort by createdAt, done.
function renderRoadmapView() {
  // A card being edited rebuilds its form from allRoadmapItems on every
  // render() - fine normally, but render() also fires on every unrelated
  // Firestore change (someone else's edit, a status toggle, anything),
  // which would otherwise silently wipe an in-progress, not-yet-saved Qty/
  // Amount/description edit out from under whoever's mid-edit. Snapshot
  // the live DOM values first and reapply them after the rebuild below.
  const editDrafts = {};
  editingRoadmapItemIds.forEach((id) => {
    const draft = captureRoadmapEditDraft(id);
    if (draft) editDrafts[id] = draft;
  });

  const term = searchInput.value.trim().toLowerCase();
  const wantStatus = currentActionFilter || "planning";
  const wantsEveryStatus = term || wantStatus === "all";

  const items = allRoadmapItems
    // A search term (or the "All" tab) searches/shows every item regardless
    // of Planning/Active/Pending/Complete - only fall back to the selected
    // tab when neither of those applies.
    .filter((item) => (wantsEveryStatus ? true : effectiveRoadmapStatus(item) === wantStatus))
    .filter((item) => {
      if (!term) return true;
      return [item.title, item.notes].filter(Boolean).join(" ").toLowerCase().includes(term);
    })
    // The state dropdown (List view only) narrows down to a single state
    // across whichever tab/search is active - "" means no filter applied.
    .filter((item) => !currentRoadmapStateFilter || roadmapStateCode(item) === currentRoadmapStateFilter)
    .sort((a, b) => {
      if (currentSortOrder === "deployment") {
        // Soonest deploy date first; items with no Deploy start date set
        // sort to the bottom instead of the top.
        const da = roadmapDeploymentRange(a)?.start?.getTime() ?? Infinity;
        const db = roadmapDeploymentRange(b)?.start?.getTime() ?? Infinity;
        return da - db;
      }
      const cmp = (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0);
      return currentSortOrder === "asc" ? cmp : -cmp;
    });

  // Exposed so the Export button can grab exactly what's currently on
  // screen (same tab/search/state filter, same sort) without recomputing
  // the whole chain above again.
  lastRenderedRoadmapItems = items;

  emptyEl.textContent = "No roadmap items yet — add one above.";
  emptyEl.style.display = items.length === 0 ? "block" : "none";

  const showTimeline = currentRoadmapView === "timeline" && items.length > 0;
  listEl.style.display = showTimeline ? "none" : "";
  roadmapTimelineEl.style.display = showTimeline ? "block" : "none";
  listEl.classList.toggle("roadmap-grid", !showTimeline);

  if (showTimeline) {
    renderRoadmapTimeline(items);
  } else {
    listEl.innerHTML = items.map((item, i) => renderRoadmapItemCard(item, i)).join("");
    hydrateRoadmapAttachments(items);
    Object.entries(editDrafts).forEach(([id, draft]) => restoreRoadmapEditDraft(id, draft));
    // Freshly-rendered edit forms don't know which row is first/last until
    // now - grey out the ▲ on row 1 and ▼ on the last row for every card
    // currently open for editing.
    editingRoadmapItemIds.forEach((id) => {
      const card = listEl.querySelector(`.roadmap-save-edit-btn[data-id="${CSS.escape(id)}"]`)?.closest(".card");
      card?.querySelectorAll(".roadmap-lineitems-rows").forEach((rowsContainer) => refreshRoadmapLineItemMoveButtons(rowsContainer));
    });
  }

  updateRoadmapGrandTotalBar();
}

const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Looks for a "Deployment: <Mon> <day> - <Mon> <day>, <year>" line in an
// item's notes (the format the app itself suggests via the notes
// placeholder) and turns it into real Date objects for the timeline. Items
// without that line just don't get plotted - see the "not shown" note
// renderRoadmapTimeline adds instead of failing loudly.
function parseDeploymentRange(notes) {
  if (!notes) return null;
  const m = notes.match(
    /Deployment:\s*([A-Za-z]{3,9})\s+(\d{1,2})\s*[–—-]\s*(?:([A-Za-z]{3,9})\s+)?(\d{1,2}),\s*(\d{4})/
  );
  if (!m) return null;
  const [, startMonStr, startDayStr, endMonStr, endDayStr, yearStr] = m;
  const startMon = MONTH_INDEX[startMonStr.slice(0, 3).toLowerCase()];
  const endMon = MONTH_INDEX[(endMonStr || startMonStr).slice(0, 3).toLowerCase()];
  if (startMon === undefined || endMon === undefined) return null;
  const year = Number(yearStr);
  const start = new Date(year, startMon, Number(startDayStr));
  const end = new Date(year, endMon, Number(endDayStr));
  if (isNaN(start) || isNaN(end)) return null;
  return { start, end };
}

// Converts to/from the plain "YYYY-MM-DD" string an <input type="date">
// wants - built from local date parts (not toISOString(), which converts
// through UTC and can silently shift the day depending on the browser's
// timezone) so a picked date always round-trips to the same calendar day.
function dateToInputValue(date) {
  if (!(date instanceof Date) || isNaN(date)) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function inputValueToDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date) ? null : date;
}

// Prefers the structured Deploy start/end date fields (set via the ▤ date
// pickers in the edit form) - only items that predate this feature and
// have never been re-saved since fall back to regex-guessing a
// "Deployment: ..." line out of the free-text notes.
function roadmapDeploymentRange(item) {
  const start = inputValueToDate(item?.deploymentStart);
  if (start) return { start, end: inputValueToDate(item?.deploymentEnd) || start };
  return parseDeploymentRange(item?.notes);
}

// One-time migration, same pattern as extractLineItemsFromNotes: the first
// time an item with no structured deploy dates is opened for editing, pull
// the old "Deployment: Mon d – Mon d, yyyy" line's dates into the date
// pickers and strip that line out of notes so it isn't shown twice.
function extractDeploymentFromNotes(notes) {
  const range = parseDeploymentRange(notes);
  if (!range) return null;
  return {
    start: dateToInputValue(range.start),
    end: dateToInputValue(range.end),
    notes: (notes || "").replace(DEPLOYMENT_LINE_RE, "").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

// Duration-based Deploy date entry (start date + a number of days, the end
// date is derived - same idea as picking a rental length instead of two
// separate calendar taps for start/end). Duration is inclusive of both
// ends: a 1-day deployment has start === end, a 7-day one spans 6 days
// past the start date.
function roadmapDeployDurationDays(startValue, endValue) {
  const start = inputValueToDate(startValue);
  const end = inputValueToDate(endValue);
  if (!start || !end) return 1;
  const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

function roadmapDeployEndFromDuration(startValue, durationDays) {
  const start = inputValueToDate(startValue);
  if (!start) return "";
  const duration = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : 1;
  const end = new Date(start);
  end.setDate(end.getDate() + duration - 1);
  return dateToInputValue(end);
}

// Shared "Aug 9 – Aug 15, 2026" formatting for the card's own Deploy line
// and the Timeline row labels, so both read identically.
function formatDeployRangeLabel(range) {
  if (!range) return "";
  const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const sameYear = range.start.getFullYear() === range.end.getFullYear();
  const endLabel = range.end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return sameYear && range.start.getTime() !== range.end.getTime()
    ? `${fmt(range.start)} – ${endLabel}`
    : range.start.getTime() === range.end.getTime()
      ? range.start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : `${range.start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} – ${endLabel}`;
}

const TIMELINE_PALETTE = ["#f59e0b", "#4a9eed", "#ec4899", "#8b5cf6", "#22c55e", "#0ca678", "#ef4444", "#ff6b6b"];

function renderRoadmapTimeline(items) {
  const parsed = items
    .map((item) => ({ item, range: roadmapDeploymentRange(item) }))
    .filter((x) => x.range)
    .sort((a, b) => a.range.start - b.range.start);

  if (!parsed.length) {
    roadmapTimelineEl.innerHTML =
      '<div style="text-align:center; color:var(--text); padding:30px 0;">None of these items have a Deploy start date set yet, so there\'s nothing to plot.</div>';
    return;
  }

  const minDate = parsed.reduce((min, x) => (x.range.start < min ? x.range.start : min), parsed[0].range.start);
  const maxDate = parsed.reduce((max, x) => (x.range.end > max ? x.range.end : max), parsed[0].range.end);
  const totalMs = Math.max(maxDate - minDate, 1);

  const ticks = [];
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cursor <= maxDate) {
    if (cursor >= minDate) {
      const label = cursor.toLocaleDateString(undefined, {
        month: "short",
        year: cursor.getFullYear() !== minDate.getFullYear() ? "2-digit" : undefined,
      });
      ticks.push({ label, pct: ((cursor - minDate) / totalMs) * 100 });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const fmtDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const rowsHtml = parsed
    .map(({ item, range }, i) => {
      const color = TIMELINE_PALETTE[i % TIMELINE_PALETTE.length];
      const left = ((range.start - minDate) / totalMs) * 100;
      const width = Math.max(((range.end - range.start) / totalMs) * 100, 1);
      const dateLabel = `${fmtDate(range.start)} – ${fmtDate(range.end)}`;
      const hasAttachments = item.attachments?.length > 0;
      const totalAmount = roadmapItemTotal(item);
      return `
        <div style="display:flex; align-items:center; gap:10px; padding:6px 0;">
          <div class="roadmap-timeline-address" data-id="${escapeHtml(item.id)}" style="width:190px; flex-shrink:0;">
            <div style="font-size:13px; font-weight:700; color:${color}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(item.title || "")}">${escapeHtml(item.title || "(untitled)")}${hasAttachments ? ' <span style="font-size:11px;">📎</span>' : ""}</div>
            ${totalAmount ? `<div style="font-size:11px; color:var(--text);">💰 ${formatCurrency(totalAmount)}</div>` : ""}
            ${hasAttachments ? `<div class="roadmap-timeline-attach-popup" data-key="${escapeHtml(item.id)}"><span style="font-size:11px; color:var(--text);">Loading…</span></div>` : ""}
          </div>
          <div style="position:relative; flex:1; height:16px; background:var(--surface-2); border-radius:8px;">
            <div style="position:absolute; top:0; left:${left}%; width:${width}%; height:100%; border-radius:8px; background:${color};" title="${escapeHtml(dateLabel)}"></div>
          </div>
          <div style="width:130px; flex-shrink:0; font-size:12px; font-weight:700; color:${color}; text-align:right;">${dateLabel}</div>
        </div>`;
    })
    .join("");

  const skipped = items.length - parsed.length;

  // Sums every location currently in the Timeline (including any without a
  // Deploy start date, which still cost money even though they aren't
  // plotted below) - same roadmapItemTotal used by the List view's own
  // Grand Total bar, so this figure never drifts from that one.
  const grandTotal = items.reduce((sum, it) => {
    const t = roadmapItemTotal(it);
    return sum + (typeof t === "number" ? t : 0);
  }, 0);

  roadmapTimelineEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:baseline; margin:0 0 14px; padding-bottom:10px; border-bottom:1px solid var(--border);">
      <div style="font-size:13px; color:var(--text);">${items.length} location${items.length === 1 ? "" : "s"} shown</div>
      <div style="font-size:15px; font-weight:800; color:var(--text);">Total: ${formatCurrency(grandTotal)}</div>
    </div>
    <div style="position:relative; height:16px; margin:0 0 6px 200px; border-bottom:1px solid var(--border); font-size:11px; color:var(--text);">
      ${ticks.map((t) => `<span style="position:absolute; left:${t.pct}%; transform:translateX(-4px);">${t.label}</span>`).join("")}
    </div>
    ${rowsHtml}
    ${skipped > 0 ? `<div style="text-align:center; color:var(--text); font-size:12px; padding-top:12px;">${skipped} item(s) without a Deploy start date aren't shown here.</div>` : ""}
  `;

  hydrateRoadmapTimelineAttachments(parsed.map((x) => x.item));
}

// Roadmap attachments only ever store {path, name} (see addRoadmapAttachment
// in functions/index.js) - no contentType - so whether something gets a
// thumbnail vs. a plain file link is decided off the file extension instead.
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|heic|bmp|svg)$/i;

function isImageFileName(name) {
  return IMAGE_EXT_RE.test(name || "");
}

// Fills in each address label's hover popup with its attachments once their
// download URLs resolve - image files become clickable thumbnails (opened
// full-size in the #imageLightbox overlay), everything else is a plain
// file link, same as the List view's attachment tags.
const PDF_EXT_RE = /\.pdf$/i;

function isPdfFileName(name) {
  return PDF_EXT_RE.test(name || "");
}

// Renders a PDF's first page to an actual image (same server-side fetch as
// the markup editor, so this isn't subject to Storage's CORS behavior)
// instead of showing a generic document icon - so hovering an address in
// Timeline shows what's really on the layout, not just "there's a PDF here."
async function renderPdfPreviewDataUrl(itemId, path) {
  await ensurePdfJs();
  const { data } = await getRoadmapAttachmentDataFn({ itemId, path });
  if (!data?.base64Data) throw new Error("No data returned");
  const pdfBytes = base64ToUint8Array(data.base64Data);
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const page = await pdf.getPage(1);
  const unscaled = page.getViewport({ scale: 1 });
  const scale = Math.min(700 / unscaled.width, 3);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/png");
}

async function hydrateRoadmapTimelineAttachments(items) {
  if (!storage) return;
  for (const item of items) {
    const atts = item.attachments;
    if (!atts || !atts.length) continue;
    const popup = roadmapTimelineEl.querySelector(`.roadmap-timeline-attach-popup[data-key="${CSS.escape(item.id)}"]`);
    if (!popup) continue;
    const entries = await Promise.all(
      atts.map(async (a) => {
        const url = await resolveAttachmentUrl(a.path);
        const isImage = isImageFileName(a.name);
        const isPdf = isPdfFileName(a.name);
        let previewUrl = isImage ? url : null;
        if (isPdf && url) {
          try {
            previewUrl = await renderPdfPreviewDataUrl(item.id, a.path);
          } catch (err) {
            console.error(err);
            previewUrl = null; // falls back to the plain document-icon link below
          }
        }
        return { url, previewUrl, name: a.name, path: a.path, isImage, isPdf };
      })
    );
    const resolved = entries.filter((e) => e.url);
    if (!resolved.length) {
      popup.innerHTML = `<span style="font-size:11px; color:var(--text);">Couldn't load attachments</span>`;
      continue;
    }
    popup.innerHTML = resolved
      .map((e) => {
        // The markup editor only knows how to load an image or a PDF's
        // first page as its base layer - anything else (docx, etc.) just
        // stays a plain file link, no thumbnail/edit affordance.
        if (!e.isImage && !e.isPdf) {
          return `<a href="${e.url}" target="_blank" class="tag" style="font-size:11px;">📎 ${escapeHtml(e.name)}</a>`;
        }
        const kind = e.isImage ? "image" : "pdf";
        const editBtn = canEdit()
          ? `<button class="roadmap-attach-edit-btn" data-item-id="${escapeHtml(item.id)}" data-path="${escapeHtml(e.path)}" data-name="${escapeHtml(e.name)}" data-kind="${kind}" title="Edit">✏️</button>`
          : "";
        const thumb = e.previewUrl
          ? `<img class="roadmap-timeline-thumb" src="${e.previewUrl}" data-full="${e.previewUrl}" alt="${escapeHtml(e.name)}" />`
          : `<a href="${e.url}" target="_blank" class="roadmap-timeline-thumb roadmap-timeline-thumb-pdf" title="${escapeHtml(e.name)}">📄</a>`;
        return `<div class="roadmap-attach-tile">${thumb}${editBtn}</div>`;
      })
      .join("");
  }
}

// Clicking a timeline attachment thumbnail opens it full-size in the
// lightbox overlay; clicking anywhere on the overlay (including the image
// itself) closes it again. The small pencil button opens the markup editor
// instead - handled separately below.
roadmapTimelineEl?.addEventListener("click", (e) => {
  const editBtn = e.target.closest(".roadmap-attach-edit-btn");
  if (editBtn) {
    openMarkupEditor({
      itemId: editBtn.dataset.itemId,
      path: editBtn.dataset.path,
      name: editBtn.dataset.name,
      kind: editBtn.dataset.kind,
    });
    return;
  }

  const thumb = e.target.closest(".roadmap-timeline-thumb:not(a)");
  if (!thumb || !imageLightboxEl || !imageLightboxImgEl) return;
  imageLightboxImgEl.src = thumb.dataset.full || thumb.src;
  imageLightboxImgEl.alt = thumb.alt || "";
  imageLightboxEl.style.display = "flex";
});

imageLightboxEl?.addEventListener("click", () => {
  imageLightboxEl.style.display = "none";
  imageLightboxImgEl.src = "";
});

// --- Timeline attachment markup editor ------------------------------------
// Loads an attachment (image, or a PDF's first page via pdf.js) onto an
// offscreen base canvas, then lets the user stamp colored dots/labels/
// lines/shapes/highlights/equipment icons on top. Edits are kept as a list
// of ops rather than baked into the base canvas so Undo/Clear are trivial -
// "redraw" just means "base image, then replay every op in order." Saving
// flattens base+ops into one PNG. Dots/text/icons can also be dragged to a
// new position with the Move tool - lines/shapes/highlights can't (not
// asked for, and hit-testing a stroke precisely is a lot more code for
// little benefit here).
const markupBaseCanvas = document.createElement("canvas");
// size/color are the "current pen settings" - captured into each op at the
// moment it's drawn (like a real drawing app), so changing the slider or
// palette only affects marks made afterward, never ones already placed.
let markupState = null; // { itemId, path, name, kind, ops: [], tool: null, size: 14, color: "#0f172a", zoom: 1, fitScale: 1, renderScale: 1, drawStart: null, dragOp: null, dragLast: null, erasing: false, selectedOp: null, panning: null }

const MARKUP_DOT_COLORS = { "dot-green": "#22c55e", "dot-red": "#ef4444", "dot-yellow": "#eab308" };
const MARKUP_DEFAULT_COLOR = "#0f172a";
const MARKUP_DEFAULT_SIZE = 14;

// Derives each tool's actual drawing dimensions from the single 8-40 Size
// slider so one control scales every tool consistently, roughly preserving
// the original hardcoded defaults at size 14 (radius 9->14 close enough,
// font 20 exactly, icon box 44->42 close enough).
function markupSizeDerived(size) {
  return {
    dotRadius: size,
    lineWidth: Math.max(2, Math.round(size / 3)),
    fontSize: size + 6,
    highlightWidth: Math.round(size * 1.5),
    iconBox: Math.round(size * 3),
  };
}

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function drawMarkupOp(ctx, op) {
  if (op.type === "note") {
    // Persisted-description-only marker (see setRoadmapAttachmentNotes) -
    // every other mark type gets permanently baked into the saved PNG's
    // pixels, so this small pin is the one thing that's re-created fresh
    // from Firestore data on every open, which is what lets its
    // description survive closing the editor or reloading the page.
    const radius = op.radius || 6;
    ctx.beginPath();
    ctx.arc(op.x, op.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = op.color || "#7c3aed";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  } else if (op.type === "dot") {
    const radius = op.radius || 9;
    ctx.beginPath();
    ctx.arc(op.x, op.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = op.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  } else if (op.type === "text") {
    const fontSize = op.fontSize || 20;
    ctx.font = `bold ${fontSize}px sans-serif`;
    const padding = 3;
    const metrics = ctx.measureText(op.text);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(op.x - padding, op.y - fontSize - padding, metrics.width + padding * 2, fontSize + 4 + padding);
    ctx.fillStyle = op.color;
    ctx.fillText(op.text, op.x, op.y);
  } else if (op.type === "line") {
    ctx.beginPath();
    ctx.moveTo(op.x1, op.y1);
    ctx.lineTo(op.x2, op.y2);
    ctx.lineWidth = op.lineWidth || 3;
    ctx.strokeStyle = op.color;
    ctx.stroke();
  } else if (op.type === "highlight") {
    if (!op.points?.length) return;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = op.color;
    ctx.lineWidth = op.lineWidth || 18;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    op.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
  } else if (op.type === "shape") {
    const minX = Math.min(op.x1, op.x2);
    const maxX = Math.max(op.x1, op.x2);
    const minY = Math.min(op.y1, op.y2);
    const maxY = Math.max(op.y1, op.y2);
    ctx.lineWidth = op.lineWidth || 3;
    ctx.strokeStyle = op.color;
    ctx.beginPath();
    if (op.shape === "rect") {
      ctx.rect(minX, minY, maxX - minX, maxY - minY);
    } else if (op.shape === "circle") {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      ctx.ellipse(cx, cy, Math.max((maxX - minX) / 2, 1), Math.max((maxY - minY) / 2, 1), 0, 0, Math.PI * 2);
    } else if (op.shape === "triangle") {
      const cx = (minX + maxX) / 2;
      ctx.moveTo(cx, minY);
      ctx.lineTo(minX, maxY);
      ctx.lineTo(maxX, maxY);
      ctx.closePath();
    }
    ctx.stroke();
  } else if (op.type === "icon") {
    const box = op.box || 44;
    const half = box / 2;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.fillRect(op.x - half, op.y - half, box, box);
    ctx.strokeRect(op.x - half, op.y - half, box, box);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(box * 0.5)}px sans-serif`;
    ctx.fillStyle = "#0f172a";
    ctx.fillText(op.icon, op.x, op.y - box * 0.14);
    ctx.font = `${Math.max(8, Math.round(box * 0.2))}px sans-serif`;
    ctx.fillText(op.label || "", op.x, op.y + box * 0.34);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

// The canvas's actual pixel buffer (width/height) is kept sized to match
// the current zoom level (see updateMarkupCanvasDisplaySize) rather than
// staying fixed at the base image's native size and letting CSS stretch a
// low-res bitmap - that stretching is what used to make marks and text go
// blurry when zoomed in. Because of that, every redraw has to happen
// through a ctx.scale(renderScale, ...) transform: ops are stored in
// unscaled "base image" coordinates, and the transform is what blows them
// up to the current zoomed resolution as *actual* pixels rather than a
// stretched image, so text/lines/shapes stay crisp at any zoom.
// `extraOp`, if given, is drawn on top after the committed ops - used for
// the live in-progress preview of the current line/shape/highlight stroke.
function redrawMarkupCanvas(extraOp) {
  if (!markupState) return;
  const ctx = markupCanvasEl.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, markupCanvasEl.width, markupCanvasEl.height);
  const scale = markupState.renderScale || 1;
  ctx.scale(scale, scale);
  ctx.drawImage(markupBaseCanvas, 0, 0);
  markupState.ops.forEach((op) => {
    drawMarkupOp(ctx, op);
    if (op.description) drawDescriptionBadge(ctx, op);
  });
  if (extraOp) drawMarkupOp(ctx, extraOp);
  if (markupState.selectedOp && markupState.ops.includes(markupState.selectedOp)) {
    drawSelectionHighlight(ctx, markupState.selectedOp);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function pushMarkupOp(op) {
  markupState.ops.push(op);
  // Whatever was just placed becomes the selection, so its color/size can
  // be tweaked right away from the style row without switching to Move
  // and re-clicking it.
  markupState.selectedOp = op;
  redrawMarkupCanvas();
}

// Bounding box per op type, used only to draw the dashed "selected" outline
// (deliberately a bit looser/simpler than hitTestMarkupOp's precise hit
// shape - this is just a visual indicator).
function markupOpBounds(op, ctx) {
  if (op.type === "dot" || op.type === "note") {
    const r = (op.radius || 9) + 4;
    return { minX: op.x - r, minY: op.y - r, maxX: op.x + r, maxY: op.y + r };
  }
  if (op.type === "text") {
    const fontSize = op.fontSize || 20;
    ctx.font = `bold ${fontSize}px sans-serif`;
    const w = ctx.measureText(op.text).width;
    return { minX: op.x - 4, minY: op.y - fontSize - 4, maxX: op.x + w + 4, maxY: op.y + 4 };
  }
  if (op.type === "icon") {
    const half = (op.box || 44) / 2;
    return { minX: op.x - half, minY: op.y - half, maxX: op.x + half, maxY: op.y + half };
  }
  if (op.type === "line") {
    return {
      minX: Math.min(op.x1, op.x2) - 6, maxX: Math.max(op.x1, op.x2) + 6,
      minY: Math.min(op.y1, op.y2) - 6, maxY: Math.max(op.y1, op.y2) + 6,
    };
  }
  if (op.type === "shape") {
    const pad = 6;
    return {
      minX: Math.min(op.x1, op.x2) - pad, maxX: Math.max(op.x1, op.x2) + pad,
      minY: Math.min(op.y1, op.y2) - pad, maxY: Math.max(op.y1, op.y2) + pad,
    };
  }
  if (op.type === "highlight" && op.points?.length) {
    const xs = op.points.map((p) => p.x);
    const ys = op.points.map((p) => p.y);
    const pad = (op.lineWidth || 18) / 2 + 4;
    return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad };
  }
  return null;
}

// Small blue "i" badge drawn at the corner of any mark that has a
// description, so there's a visible hint of which marks are clickable for
// more info (otherwise nothing on the canvas suggests a description exists).
function drawDescriptionBadge(ctx, op) {
  const b = markupOpBounds(op, ctx);
  if (!b) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.maxX, b.minY, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#2563eb";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("i", b.maxX, b.minY + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function markupOpAtPoint(x, y) {
  if (!markupState) return null;
  const ctx = markupCanvasEl.getContext("2d");
  for (let i = markupState.ops.length - 1; i >= 0; i--) {
    if (hitTestMarkupOp(markupState.ops[i], x, y, ctx)) return markupState.ops[i];
  }
  return null;
}

function showMarkupTooltip(text, clientX, clientY) {
  if (!markupHoverTooltipEl) return;
  markupHoverTooltipEl.textContent = text;
  markupHoverTooltipEl.style.left = `${clientX + 14}px`;
  markupHoverTooltipEl.style.top = `${clientY + 14}px`;
  markupHoverTooltipEl.style.display = "block";
}

function hideMarkupTooltip() {
  if (markupHoverTooltipEl) markupHoverTooltipEl.style.display = "none";
}

// Every other mark type (dot/icon/line/shape/highlight/label) gets
// permanently flattened into the saved PNG's pixels on Save Over/As - none
// of that survives as a re-selectable object once the editor is reopened.
// A "note" is the one mark type that only ever exists as a description
// carrier (drawMarkupOp draws just a small pin, nothing else), so it's the
// one persisted separately via setRoadmapAttachmentNotes and re-created
// fresh from Firestore on every open - see openMarkupEditor.
function currentMarkupNotesPayload() {
  if (!markupState) return [];
  const ctx = markupCanvasEl.getContext("2d");
  return markupState.ops
    .filter((op) => op.description)
    .map((op) => {
      const b = markupOpBounds(op, ctx) || { minX: op.x ?? 0, minY: op.y ?? 0, maxX: op.x ?? 0, maxY: op.y ?? 0 };
      return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, text: op.description, color: op.color || "#7c3aed" };
    });
}

async function persistMarkupNotesFor(path) {
  if (!markupState) return;
  try {
    await setRoadmapAttachmentNotesFn({ itemId: markupState.itemId, path, notes: currentMarkupNotesPayload() });
  } catch (err) {
    console.error("Could not save mark descriptions:", err);
  }
}

// A real modal (textarea + Cancel/Remove mark/Save) instead of a browser
// prompt() - Remove mark operates on this exact op instance (no
// re-hit-testing), so it's a reliable way to delete a mark even in cases
// where the separate Erase tool's own hit-test might land on a different
// overlapping mark instead of the one that's visibly selected. Every save
// is persisted immediately (not just held in memory) so it survives
// closing the editor - see persistMarkupNotesFor/currentMarkupNotesPayload.
let markupNoteModalOp = null;
let markupNoteModalIsNew = false;

function openMarkupNoteModal(op, isNew) {
  markupNoteModalOp = op;
  markupNoteModalIsNew = isNew;
  if (markupNoteTextareaEl) markupNoteTextareaEl.value = op.description || "";
  if (markupNoteModalEl) markupNoteModalEl.style.display = "flex";
  markupNoteTextareaEl?.focus();
}

function closeMarkupNoteModal() {
  if (markupNoteModalEl) markupNoteModalEl.style.display = "none";
  markupNoteModalOp = null;
}

// Cancelling (or removing) a brand-new, not-yet-confirmed mark shouldn't
// leave an empty placeholder behind on the canvas.
function discardMarkupNoteModalOpIfEmpty() {
  if (!markupNoteModalIsNew || !markupNoteModalOp || markupNoteModalOp.description || !markupState) return;
  const idx = markupState.ops.indexOf(markupNoteModalOp);
  if (idx !== -1) {
    markupState.ops.splice(idx, 1);
    redrawMarkupCanvas();
  }
}

markupNoteSaveBtn?.addEventListener("click", () => {
  if (!markupNoteModalOp || !markupState) return;
  const op = markupNoteModalOp;
  const text = (markupNoteTextareaEl?.value || "").trim();
  if (text) {
    op.description = text;
  } else if (op.type === "note") {
    // A note-only pin with no description left has no reason to exist -
    // unlike a dot/icon/etc., which still mean something visually even
    // without a description attached.
    const idx = markupState.ops.indexOf(op);
    if (idx !== -1) markupState.ops.splice(idx, 1);
    if (markupState.selectedOp === op) markupState.selectedOp = null;
  } else {
    delete op.description;
  }
  redrawMarkupCanvas();
  persistMarkupNotesFor(markupState.path);
  closeMarkupNoteModal();
});

markupNoteRemoveBtn?.addEventListener("click", () => {
  if (!markupNoteModalOp || !markupState) return;
  const idx = markupState.ops.indexOf(markupNoteModalOp);
  if (idx !== -1) markupState.ops.splice(idx, 1);
  if (markupState.selectedOp === markupNoteModalOp) markupState.selectedOp = null;
  redrawMarkupCanvas();
  persistMarkupNotesFor(markupState.path);
  closeMarkupNoteModal();
});

markupNoteCancelBtn?.addEventListener("click", () => {
  discardMarkupNoteModalOpIfEmpty();
  closeMarkupNoteModal();
});

function drawSelectionHighlight(ctx, op) {
  const b = markupOpBounds(op, ctx);
  if (!b) return;
  ctx.save();
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  ctx.restore();
}

// Re-derives an already-placed op's size fields from a new Size value -
// mirrors markupSizeDerived's per-type mapping so an existing mark can be
// resized after the fact, the same way its color can be recolored.
function applyMarkupSizeToOp(op, size) {
  const derived = markupSizeDerived(size);
  if (op.type === "dot") op.radius = derived.dotRadius;
  else if (op.type === "text") op.fontSize = derived.fontSize;
  else if (op.type === "line" || op.type === "shape") op.lineWidth = derived.lineWidth;
  else if (op.type === "highlight") op.lineWidth = derived.highlightWidth;
  else if (op.type === "icon") op.box = derived.iconBox;
}

function getMarkupCanvasCoords(e) {
  const rect = markupCanvasEl.getBoundingClientRect();
  const scaleX = markupCanvasEl.width / rect.width;
  const scaleY = markupCanvasEl.height / rect.height;
  // The canvas's own pixel buffer is now sized to the zoomed resolution
  // (renderScale), while ops are always stored in unscaled "base image"
  // coordinates - divide that back out so hit-testing/drawing keeps
  // working in the same coordinate space regardless of current zoom.
  const renderScale = markupState?.renderScale || 1;
  return {
    x: ((e.clientX - rect.left) * scaleX) / renderScale,
    y: ((e.clientY - rect.top) * scaleY) / renderScale,
  };
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Every mark type is movable with the Move tool - hit-testing just differs
// by shape: a radius for dots, a measured text box for labels/icons, a
// distance-to-segment check for lines, a padded bounding box for shapes
// (forgiving on purpose - clicking anywhere inside an unfilled rectangle
// still grabs it, not just the exact outline), and "near any point on the
// path" for a freehand highlight stroke.
function hitTestMarkupOp(op, x, y, ctx) {
  if (op.type === "dot" || op.type === "note") {
    return Math.hypot(x - op.x, y - op.y) <= (op.radius || 9) + 6;
  }
  if (op.type === "text") {
    const fontSize = op.fontSize || 20;
    ctx.font = `bold ${fontSize}px sans-serif`;
    const w = ctx.measureText(op.text).width;
    return x >= op.x - 4 && x <= op.x + w + 4 && y >= op.y - fontSize - 4 && y <= op.y + 4;
  }
  if (op.type === "icon") {
    const half = (op.box || 44) / 2;
    return x >= op.x - half && x <= op.x + half && y >= op.y - half && y <= op.y + half;
  }
  if (op.type === "line") {
    return distanceToSegment(x, y, op.x1, op.y1, op.x2, op.y2) <= (op.lineWidth || 3) / 2 + 8;
  }
  if (op.type === "shape") {
    const pad = 8;
    const minX = Math.min(op.x1, op.x2) - pad;
    const maxX = Math.max(op.x1, op.x2) + pad;
    const minY = Math.min(op.y1, op.y2) - pad;
    const maxY = Math.max(op.y1, op.y2) + pad;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }
  if (op.type === "highlight") {
    const pad = (op.lineWidth || 18) / 2 + 4;
    return (op.points || []).some((p) => Math.hypot(x - p.x, y - p.y) <= pad);
  }
  return false;
}

// Shifts an op by (dx,dy) regardless of its shape - dot/text/icon have a
// single x,y anchor; line/shape have two endpoints; highlight has a whole
// path of points.
function translateMarkupOp(op, dx, dy) {
  if (op.type === "dot" || op.type === "text" || op.type === "icon" || op.type === "note") {
    op.x += dx;
    op.y += dy;
  } else if (op.type === "line" || op.type === "shape") {
    op.x1 += dx;
    op.y1 += dy;
    op.x2 += dx;
    op.y2 += dy;
  } else if (op.type === "highlight") {
    op.points = (op.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
}

// Label/Line/Highlight/Square/Circle/Triangle live in the #markupShapeToolSelect
// dropdown now instead of separate buttons - this keeps the dropdown's
// displayed value in sync whenever the tool changes, however it changed
// (a toolbar button, the dropdown itself, or code resetting the tool on open).
const MARKUP_DROPDOWN_TOOLS = ["text", "line", "highlight", "shape-rect", "shape-circle", "shape-triangle"];

function setMarkupTool(tool) {
  markupState.tool = tool;
  markupToolbarEl?.querySelectorAll(".markup-tool-btn").forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
  if (markupShapeToolSelect) markupShapeToolSelect.value = MARKUP_DROPDOWN_TOOLS.includes(tool) ? tool : "";
  // No tool selected = pan mode (drag to scroll around when zoomed in), so
  // the cursor hints at that rather than showing a plain default arrow.
  markupCanvasEl.style.cursor = tool === "move" ? "grab" : tool === "erase" ? "cell" : tool ? "crosshair" : "grab";
}

markupShapeToolSelect?.addEventListener("change", () => {
  if (!markupState) return;
  setMarkupTool(markupShapeToolSelect.value || null);
});

// "Fit scale" is whatever shrinks/grows the image to exactly fill
// #markupCanvasWrap (recomputed whenever the wrap's own size can change -
// window resize, maximize toggle, rotate) - this is what makes the whole
// image visible with nothing to scroll, which matters most on phones.
// "Zoom" is a separate multiplier on top of that baseline, controlled by
// the mouse wheel, so users can go bigger than "fits the window" when they
// need to place something precisely. The canvas's actual pixel resolution
// is resized to match fitScale*zoom (see updateMarkupCanvasDisplaySize) so
// marks and text render crisp rather than getting stretched-blurry at high
// zoom - getMarkupCanvasCoords divides that same scale back out, so
// drawing precision is unaffected at any zoom level.
function computeMarkupFitScale() {
  if (!markupBaseCanvas.width || !markupCanvasWrapEl) return 1;
  const availW = markupCanvasWrapEl.clientWidth || window.innerWidth * 0.9;
  const availH = markupCanvasWrapEl.clientHeight || window.innerHeight * 0.5;
  return Math.min(availW / markupBaseCanvas.width, availH / markupBaseCanvas.height, 2);
}

// Resizes the canvas's *actual* pixel buffer to the current zoomed
// resolution (not just its CSS display size) and repaints - this is what
// keeps marks/text crisp at any zoom instead of the browser stretching a
// fixed-resolution bitmap. `renderScale` is capped so a big photo at max
// zoom doesn't allocate an absurdly large canvas (perf/memory) - display
// size (CSS) always matches the buffer 1:1, so there's never any stretch.
const MARKUP_MAX_CANVAS_DIMENSION = 4000;

function updateMarkupCanvasDisplaySize() {
  if (!markupState || !markupBaseCanvas.width) return;
  markupState.fitScale = computeMarkupFitScale();
  const targetScale = markupState.fitScale * markupState.zoom;
  const maxScale = Math.min(
    MARKUP_MAX_CANVAS_DIMENSION / markupBaseCanvas.width,
    MARKUP_MAX_CANVAS_DIMENSION / markupBaseCanvas.height
  );
  const renderScale = Math.min(targetScale, maxScale);
  markupState.renderScale = renderScale;
  const w = Math.max(1, Math.round(markupBaseCanvas.width * renderScale));
  const h = Math.max(1, Math.round(markupBaseCanvas.height * renderScale));
  markupCanvasEl.width = w;
  markupCanvasEl.height = h;
  markupCanvasEl.style.width = `${w}px`;
  markupCanvasEl.style.height = `${h}px`;
  redrawMarkupCanvas();
  // "100%" means "fits the window" (zoom === 1), not "actual pixels" - the
  // +/- buttons and the mouse wheel both just adjust markupState.zoom, so
  // this single spot keeps the label in sync with either input method.
  if (markupZoomValueEl) markupZoomValueEl.textContent = `${Math.round(markupState.zoom * 100)}%`;
}

window.addEventListener("resize", () => {
  if (markupState && markupEditorEl?.style.display !== "none") updateMarkupCanvasDisplaySize();
});

// Wheel always zooms rather than scrolling the wrap - the wrap's overflow
// still has scrollbars for panning around once zoomed past the window.
markupCanvasWrapEl?.addEventListener(
  "wheel",
  (e) => {
    if (!markupState) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    markupState.zoom = Math.min(6, Math.max(0.3, markupState.zoom * factor));
    updateMarkupCanvasDisplaySize();
  },
  { passive: false }
);

// +/- buttons are the touch/mobile equivalent of the wheel zoom above (no
// wheel event exists on a phone) - same zoom multiplier, same
// updateMarkupCanvasDisplaySize() resize-the-actual-canvas-resolution path,
// so the photo never gets stretched/blurry at any zoom level either way.
const MARKUP_ZOOM_BUTTON_STEP = 1.25;

markupZoomInBtn?.addEventListener("click", () => {
  if (!markupState) return;
  markupState.zoom = Math.min(6, markupState.zoom * MARKUP_ZOOM_BUTTON_STEP);
  updateMarkupCanvasDisplaySize();
});

markupZoomOutBtn?.addEventListener("click", () => {
  if (!markupState) return;
  markupState.zoom = Math.max(0.3, markupState.zoom / MARKUP_ZOOM_BUTTON_STEP);
  updateMarkupCanvasDisplaySize();
});

async function openMarkupEditor({ itemId, path, name, kind }) {
  if (!markupEditorEl) return;
  markupState = {
    itemId, path, name, kind, ops: [], tool: null,
    size: MARKUP_DEFAULT_SIZE, color: MARKUP_DEFAULT_COLOR,
    zoom: 1, fitScale: 1, renderScale: 1,
    drawStart: null, dragOp: null, dragLast: null, erasing: false, selectedOp: null, panning: null,
  };
  markupToolbarEl?.querySelectorAll(".markup-tool-btn").forEach((b) => b.classList.remove("active"));
  if (markupShapeToolSelect) markupShapeToolSelect.value = "";
  markupPanelEl?.classList.remove("markup-maximized");
  if (markupMaximizeBtn) markupMaximizeBtn.textContent = "⛶ Maximize";
  if (markupSizeInput) markupSizeInput.value = String(MARKUP_DEFAULT_SIZE);
  if (markupSizeValueEl) markupSizeValueEl.textContent = String(MARKUP_DEFAULT_SIZE);
  markupColorPaletteEl?.querySelectorAll(".markup-color-swatch").forEach((b) => b.classList.toggle("active", b.dataset.color === MARKUP_DEFAULT_COLOR));
  if (markupColorCustomInput) markupColorCustomInput.value = MARKUP_DEFAULT_COLOR;
  markupCanvasEl.style.cursor = "grab";
  markupEditorEl.style.display = "flex";
  markupStatusEl.textContent = "Loading…";

  try {
    // Fetched server-side (Admin SDK, not a browser cross-origin request) so
    // this never depends on the Storage bucket's CORS configuration - see
    // getRoadmapAttachmentData in functions/index.js for why.
    const { data } = await getRoadmapAttachmentDataFn({ itemId, path });
    if (!data?.base64Data) throw new Error("No data returned");

    if (kind === "pdf") {
      await ensurePdfJs();
      const pdfBytes = base64ToUint8Array(data.base64Data);
      const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
      const page = await pdf.getPage(1);
      const unscaled = page.getViewport({ scale: 1 });
      const scale = Math.min(1800 / unscaled.width, 3);
      const viewport = page.getViewport({ scale });
      markupBaseCanvas.width = viewport.width;
      markupBaseCanvas.height = viewport.height;
      await page.render({ canvasContext: markupBaseCanvas.getContext("2d"), viewport }).promise;
    } else {
      const dataUrl = `data:${data.contentType || "image/png"};base64,${data.base64Data}`;
      const img = await loadImageEl(dataUrl);
      markupBaseCanvas.width = img.naturalWidth;
      markupBaseCanvas.height = img.naturalHeight;
      markupBaseCanvas.getContext("2d").drawImage(img, 0, 0);
    }

    // Re-create any notes saved from a previous session as "note" ops -
    // this is what makes a description survive closing the editor (every
    // other mark type is just baked pixels by the time you reopen).
    const item = allRoadmapItems.find((it) => it.id === itemId);
    const savedNotes = item?.attachmentNotes?.[path] || [];
    markupState.ops = savedNotes.map((n) => ({ type: "note", x: n.x, y: n.y, radius: 6, description: n.text, color: n.color || "#7c3aed" }));

    markupState.zoom = 1;
    updateMarkupCanvasDisplaySize();
    markupStatusEl.textContent = "";
  } catch (err) {
    console.error(err);
    markupStatusEl.textContent = "Could not load this file for editing: " + err.message;
  }
}

function closeMarkupEditor() {
  if (markupEditorEl) markupEditorEl.style.display = "none";
  markupState = null;
  hideMarkupTooltip();
}

markupCanvasEl?.addEventListener("pointerleave", hideMarkupTooltip);

markupToolbarEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".markup-tool-btn");
  if (!btn || !markupState) return;
  setMarkupTool(btn.dataset.tool === markupState.tool ? null : btn.dataset.tool);
});

// Removes whatever mark is under (x, y), topmost first - used by the Erase
// tool for both a single click and a drag (eraseAtPoint gets called again
// on every pointermove while erasing, so dragging wipes anything the
// cursor passes over one mark per pass rather than the whole stack at once).
function eraseAtPoint(x, y) {
  if (!markupState) return;
  const ctx = markupCanvasEl.getContext("2d");
  for (let i = markupState.ops.length - 1; i >= 0; i--) {
    if (hitTestMarkupOp(markupState.ops[i], x, y, ctx)) {
      const [removed] = markupState.ops.splice(i, 1);
      if (markupState.selectedOp === removed) markupState.selectedOp = null;
      redrawMarkupCanvas();
      break;
    }
  }
}

markupCanvasEl?.addEventListener("pointerdown", (e) => {
  if (!markupState) return;

  // With no tool selected, dragging pans the zoomed image around instead
  // of doing nothing - previously the only way to get around a zoomed-in
  // photo was the wrap's own (easy-to-miss) scrollbars. Double-clicking a
  // mark (see the dblclick listener below) opens its description.
  if (!markupState.tool) {
    markupState.panning = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: markupCanvasWrapEl.scrollLeft,
      scrollTop: markupCanvasWrapEl.scrollTop,
    };
    markupCanvasEl.style.cursor = "grabbing";
    return;
  }

  const { x, y } = getMarkupCanvasCoords(e);
  const tool = markupState.tool;

  if (tool === "move") {
    let hit = null;
    for (let i = markupState.ops.length - 1; i >= 0; i--) {
      const op = markupState.ops[i];
      if (hitTestMarkupOp(op, x, y, markupCanvasEl.getContext("2d"))) {
        hit = op;
        break;
      }
    }
    markupState.selectedOp = hit;
    redrawMarkupCanvas();
    if (hit) {
      markupState.dragOp = hit;
      markupState.dragLast = { x, y };
      markupCanvasEl.style.cursor = "grabbing";
    }
    return;
  }

  if (tool === "erase") {
    markupState.erasing = true;
    eraseAtPoint(x, y);
    return;
  }

  const derived = markupSizeDerived(markupState.size);
  if (tool === "line" || tool.startsWith("shape-")) {
    markupState.drawStart = { x, y };
  } else if (tool === "highlight") {
    markupState.drawStart = { points: [{ x, y }] };
  } else if (tool.startsWith("dot-")) {
    pushMarkupOp({ type: "dot", x, y, color: MARKUP_DOT_COLORS[tool], radius: derived.dotRadius });
  } else if (tool === "text") {
    const text = prompt("Label text:");
    if (text) pushMarkupOp({ type: "text", x, y, text, color: markupState.color, fontSize: derived.fontSize });
  }
});

markupCanvasEl?.addEventListener("pointermove", (e) => {
  if (!markupState) return;

  // Only ever shown while genuinely idle-hovering (see the bottom of this
  // handler) - hidden up front here so it never lingers on screen during an
  // active pan/erase/drag/draw.
  hideMarkupTooltip();

  if (markupState.panning) {
    const dx = e.clientX - markupState.panning.startX;
    const dy = e.clientY - markupState.panning.startY;
    markupCanvasWrapEl.scrollLeft = markupState.panning.scrollLeft - dx;
    markupCanvasWrapEl.scrollTop = markupState.panning.scrollTop - dy;
    return;
  }

  const { x, y } = getMarkupCanvasCoords(e);

  if (markupState.erasing) {
    eraseAtPoint(x, y);
    return;
  }

  if (markupState.dragOp) {
    translateMarkupOp(markupState.dragOp, x - markupState.dragLast.x, y - markupState.dragLast.y);
    markupState.dragLast = { x, y };
    redrawMarkupCanvas();
    return;
  }

  if (!markupState.drawStart) {
    // Idle-hovering (not currently panning/erasing/dragging/drawing) - if
    // the cursor is over a mark that has a description, preview it as a
    // tooltip. Double-click is still what actually opens the add/edit/
    // remove dialog (see the dblclick listener below) - this is just a
    // lighter-weight peek without needing to double-click first.
    const hoveredOp = markupOpAtPoint(x, y);
    if (hoveredOp?.description) showMarkupTooltip(hoveredOp.description, e.clientX, e.clientY);
    return;
  }
  const tool = markupState.tool;
  const derived = markupSizeDerived(markupState.size);
  if (tool === "highlight") {
    markupState.drawStart.points.push({ x, y });
    redrawMarkupCanvas({ type: "highlight", points: markupState.drawStart.points, color: markupState.color, lineWidth: derived.highlightWidth });
    return;
  }
  if (tool === "line") {
    redrawMarkupCanvas({ type: "line", x1: markupState.drawStart.x, y1: markupState.drawStart.y, x2: x, y2: y, color: markupState.color, lineWidth: derived.lineWidth });
  } else if (tool.startsWith("shape-")) {
    redrawMarkupCanvas({ type: "shape", shape: tool.replace("shape-", ""), x1: markupState.drawStart.x, y1: markupState.drawStart.y, x2: x, y2: y, color: markupState.color, lineWidth: derived.lineWidth });
  }
});

markupCanvasEl?.addEventListener("pointerup", (e) => {
  if (!markupState) return;

  if (markupState.panning) {
    markupState.panning = null;
    markupCanvasEl.style.cursor = "grab";
    return;
  }

  if (markupState.erasing) {
    markupState.erasing = false;
    return;
  }

  if (markupState.dragOp) {
    markupState.dragOp = null;
    markupState.dragLast = null;
    markupCanvasEl.style.cursor = "grab";
    return;
  }

  if (!markupState.drawStart) return;
  const { x, y } = getMarkupCanvasCoords(e);
  const tool = markupState.tool;
  const derived = markupSizeDerived(markupState.size);
  if (tool === "highlight") {
    pushMarkupOp({ type: "highlight", points: markupState.drawStart.points, color: markupState.color, lineWidth: derived.highlightWidth });
  } else if (tool === "line") {
    pushMarkupOp({ type: "line", x1: markupState.drawStart.x, y1: markupState.drawStart.y, x2: x, y2: y, color: markupState.color, lineWidth: derived.lineWidth });
  } else if (tool.startsWith("shape-")) {
    pushMarkupOp({ type: "shape", shape: tool.replace("shape-", ""), x1: markupState.drawStart.x, y1: markupState.drawStart.y, x2: x, y2: y, color: markupState.color, lineWidth: derived.lineWidth });
  }
  markupState.drawStart = null;
});

// Double-clicking any placed mark - regardless of which tool is currently
// active - opens its description modal (view/add/edit/remove in one
// dialog, see openMarkupNoteModal). Deliberately not tied to a single tap:
// a plain click already means something different depending on the active
// tool (place a mark, start a drag, erase, pan...), so a second, more
// deliberate gesture is what triggers "show me info about this."
markupCanvasEl?.addEventListener("dblclick", (e) => {
  if (!markupState) return;
  const { x, y } = getMarkupCanvasCoords(e);
  let op = markupOpAtPoint(x, y);
  // Double-clicking empty space starts a brand-new standalone note pin
  // (a comment that isn't attached to any dot/icon) rather than doing
  // nothing - the modal's Cancel/empty-Save handling removes it again if
  // the user backs out, so nothing gets left behind for a no-op.
  const isNew = !op;
  if (isNew) op = { type: "note", x, y, radius: 6, color: markupState.color };
  if (isNew) markupState.ops.push(op);
  markupState.selectedOp = op;
  redrawMarkupCanvas();
  openMarkupNoteModal(op, isNew);
});

markupUndoBtn?.addEventListener("click", () => {
  if (!markupState?.ops.length) return;
  markupState.ops.pop();
  redrawMarkupCanvas();
});

markupClearBtn?.addEventListener("click", () => {
  if (!markupState) return;
  markupState.ops = [];
  redrawMarkupCanvas();
});

// Rotates the base image 90° clockwise and re-maps every existing op's
// coordinates through the same transform, so anything already placed stays
// lined up with the same physical spot on the (now rotated) image. Labels/
// icons move to the right spot but keep their own upright orientation
// rather than visually rotating too - rotating text glyphs isn't worth the
// added complexity here.
markupRotateBtn?.addEventListener("click", () => {
  if (!markupState) return;
  const oldW = markupBaseCanvas.width;
  const oldH = markupBaseCanvas.height;

  const rotated = document.createElement("canvas");
  rotated.width = oldH;
  rotated.height = oldW;
  const rctx = rotated.getContext("2d");
  rctx.translate(oldH, 0);
  rctx.rotate(Math.PI / 2);
  rctx.drawImage(markupBaseCanvas, 0, 0);

  markupBaseCanvas.width = rotated.width;
  markupBaseCanvas.height = rotated.height;
  markupBaseCanvas.getContext("2d").drawImage(rotated, 0, 0);

  const rotatePoint = (x, y) => ({ x: oldH - y, y: x });
  markupState.ops.forEach((op) => {
    if (op.type === "dot" || op.type === "text" || op.type === "icon" || op.type === "note") {
      const p = rotatePoint(op.x, op.y);
      op.x = p.x;
      op.y = p.y;
    } else if (op.type === "line" || op.type === "shape") {
      const p1 = rotatePoint(op.x1, op.y1);
      const p2 = rotatePoint(op.x2, op.y2);
      op.x1 = p1.x;
      op.y1 = p1.y;
      op.x2 = p2.x;
      op.y2 = p2.y;
    } else if (op.type === "highlight") {
      op.points = op.points.map((p) => rotatePoint(p.x, p.y));
    }
  });

  updateMarkupCanvasDisplaySize();
});

markupMaximizeBtn?.addEventListener("click", () => {
  const isMax = markupPanelEl?.classList.toggle("markup-maximized");
  markupMaximizeBtn.textContent = isMax ? "⤢ Restore" : "⛶ Maximize";
  // Wait a tick for the CSS size change to actually apply before measuring
  // #markupCanvasWrap's new dimensions.
  requestAnimationFrame(updateMarkupCanvasDisplaySize);
});

// Drag-and-drop for the equipment icon palette - drop position is read the
// same way pointer events are (getMarkupCanvasCoords works off clientX/Y,
// which DragEvent has too, regardless of which element the drop landed on).
markupIconPaletteEl?.querySelectorAll(".markup-icon-btn").forEach((btn) => {
  btn.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ icon: btn.dataset.icon, label: btn.dataset.label }));
  });
});

markupCanvasWrapEl?.addEventListener("dragover", (e) => {
  e.preventDefault();
  markupCanvasWrapEl.classList.add("markup-drag-over");
});

markupCanvasWrapEl?.addEventListener("dragleave", () => {
  markupCanvasWrapEl.classList.remove("markup-drag-over");
});

markupCanvasWrapEl?.addEventListener("drop", (e) => {
  e.preventDefault();
  markupCanvasWrapEl.classList.remove("markup-drag-over");
  if (!markupState) return;
  let payload;
  try {
    payload = JSON.parse(e.dataTransfer.getData("text/plain"));
  } catch {
    return;
  }
  if (!payload?.icon) return;
  const { x, y } = getMarkupCanvasCoords(e);
  pushMarkupOp({ type: "icon", x, y, icon: payload.icon, label: payload.label || "", box: markupSizeDerived(markupState.size).iconBox });
});

// Size and color are captured into ops at creation time (see
// markupSizeDerived and the pointerdown/pointerup handlers above), so
// these controls only ever affect what gets drawn *next* - moving the
// slider or clicking a swatch never touches marks already on the canvas.
markupSizeInput?.addEventListener("input", () => {
  if (!markupState) return;
  markupState.size = Number(markupSizeInput.value);
  if (markupSizeValueEl) markupSizeValueEl.textContent = markupSizeInput.value;
  // Also resizes whatever's currently selected, so a just-placed (or
  // just-clicked-with-Move) mark can be tweaked immediately instead of
  // only affecting marks placed from here on.
  if (markupState.selectedOp) {
    applyMarkupSizeToOp(markupState.selectedOp, markupState.size);
    redrawMarkupCanvas();
  }
});

markupColorPaletteEl?.addEventListener("click", (e) => {
  const swatch = e.target.closest(".markup-color-swatch");
  if (!swatch || !markupState) return;
  markupState.color = swatch.dataset.color;
  markupColorPaletteEl.querySelectorAll(".markup-color-swatch").forEach((b) => b.classList.toggle("active", b === swatch));
  if (markupColorCustomInput) markupColorCustomInput.value = swatch.dataset.color;
  if (markupState.selectedOp) {
    markupState.selectedOp.color = swatch.dataset.color;
    redrawMarkupCanvas();
  }
});

markupColorCustomInput?.addEventListener("input", () => {
  if (!markupState) return;
  markupState.color = markupColorCustomInput.value;
  if (markupState.selectedOp) {
    markupState.selectedOp.color = markupColorCustomInput.value;
    redrawMarkupCanvas();
  }
  markupColorPaletteEl?.querySelectorAll(".markup-color-swatch").forEach((b) => b.classList.remove("active"));
});

markupCancelBtn?.addEventListener("click", closeMarkupEditor);

function withPngName(name) {
  return (name || "attachment").replace(/\.[^.]+$/, "") + ".png";
}

markupSaveAsBtn?.addEventListener("click", async () => {
  if (!markupState) return;
  const base64Data = markupCanvasEl.toDataURL("image/png").split(",")[1];
  const fileName = withPngName(markupState.name).replace(/\.png$/, `-annotated-${Date.now()}.png`);
  markupSaveAsBtn.disabled = true;
  markupStatusEl.textContent = "Saving…";
  try {
    const result = await addRoadmapAttachmentFn({ itemId: markupState.itemId, fileName, contentType: "image/png", base64Data });
    // The new attachment lives at a brand-new path - carry the current
    // notes forward to it so they aren't silently orphaned under the path
    // this session started from.
    if (result?.data?.path) await persistMarkupNotesFor(result.data.path);
    markupStatusEl.textContent = "Saved as a new attachment.";
    setTimeout(closeMarkupEditor, 900);
  } catch (err) {
    console.error(err);
    markupStatusEl.textContent = "Could not save: " + err.message;
  } finally {
    markupSaveAsBtn.disabled = false;
  }
});

markupSaveOverBtn?.addEventListener("click", async () => {
  if (!markupState) return;
  if (!confirm(`Replace "${markupState.name}" with this annotated version? The original file will be removed.`)) return;
  const base64Data = markupCanvasEl.toDataURL("image/png").split(",")[1];
  const fileName = withPngName(markupState.name);
  markupSaveOverBtn.disabled = true;
  markupStatusEl.textContent = "Saving…";
  try {
    const result = await replaceRoadmapAttachmentFn({ itemId: markupState.itemId, originalPath: markupState.path, fileName, base64Data });
    // Save Over always uploads to a fresh path too (see replaceRoadmapAttachment),
    // so the notes need to move over to it the same way Save As does above.
    if (result?.data?.path) await persistMarkupNotesFor(result.data.path);
    markupStatusEl.textContent = "Saved.";
    setTimeout(closeMarkupEditor, 900);
  } catch (err) {
    console.error(err);
    markupStatusEl.textContent = "Could not save: " + err.message;
  } finally {
    markupSaveOverBtn.disabled = false;
  }
});

// Tracks which roadmap cards are currently showing their inline edit form
// instead of the normal read view - client-side only, cleared on save/cancel.
const editingRoadmapItemIds = new Set();

// Checked cards for Export - deliberately persists across tab/search/state
// filter changes and re-renders (like a shopping cart), so someone can tick
// a couple items in Planning, switch to Active, tick a few more, then
// export just that combined set. Resolved against allRoadmapItems (not
// whatever's currently filtered) at export time - see exportRoadmapListToExcel.
const selectedRoadmapItemIds = new Set();

// Snapshot of which items Compare mode is currently showing (taken when the
// modal opens, from whatever's ticked at that moment) - kept separate from
// selectedRoadmapItemIds so ticking/unticking cards elsewhere never shifts
// the columns out from under an already-open comparison.
let roadmapCompareItemIds = [];

function updateRoadmapSelectionUI() {
  const n = selectedRoadmapItemIds.size;
  if (roadmapSelectionInfoEl) roadmapSelectionInfoEl.textContent = n > 0 ? `${n} selected` : "";
  if (roadmapClearSelectionBtn) roadmapClearSelectionBtn.style.display = n > 0 ? "" : "none";
  // Compare needs at least two locations side by side to mean anything.
  if (roadmapCompareBtn) roadmapCompareBtn.style.display = n >= 2 ? "" : "none";
  updateRoadmapGrandTotalBar();
}

// Sticky bottom bar summing roadmapItemTotal() across whichever cards are
// ticked (the same selectedRoadmapItemIds "shopping cart" the Export
// button already uses - persists across tab/search/state filter changes),
// or across every currently-shown card when nothing's ticked, so the bar
// is useful immediately without requiring a selection first. Ticking
// "Select all shown" only ever adds/removes cards that are currently
// visible under the active tab/search/filter - it never reaches into
// cards hidden by those filters.
// Groups every Cost Breakdown row across the given cards by description
// (case-insensitive, vendor-agnostic - "G6 Bullet" from two different cards
// is one line here, not two), summing Qty and cost per item. Sorted most
// expensive first so the breakdown panel leads with what actually matters.
// Keyed by vendor+description together (not description alone) so "Camera"
// bought via UniFi and "Camera" bought via Amazon stay as two separate
// rows instead of getting summed into one misleading line.
function roadmapEquipmentBreakdown(items) {
  const map = new Map();
  items.forEach((it) => {
    (it.lineItems || []).forEach((li) => {
      const vendor = ROADMAP_VENDORS.some((v) => v.key === li.vendor) ? li.vendor : "unifi";
      const desc = (li.desc || "").trim() || "Unnamed item";
      const key = `${vendor}::${desc.toLowerCase()}`;
      const qty = Number.isFinite(li.qty) ? li.qty : 1;
      const cost = roadmapLineItemLineTotal(li);
      const existing = map.get(key);
      if (existing) {
        existing.qty += qty;
        existing.cost += cost;
      } else {
        map.set(key, { vendor, desc, qty, cost });
      }
    });
  });
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}

function renderRoadmapGrandTotalBreakdown(items) {
  if (!roadmapGrandTotalBreakdownEl) return [];
  const breakdown = roadmapEquipmentBreakdown(items);
  if (!breakdown.length) {
    roadmapGrandTotalBreakdownEl.innerHTML = `<div style="padding:14px; color:var(--text); text-align:center;">No equipment on these cards yet.</div>`;
    return breakdown;
  }
  // One mini-table per vendor (UniFi/Amazon/Home Depot), same grouping as
  // the Cost Breakdown edit form itself - a vendor with nothing on these
  // cards is skipped rather than shown as an empty section.
  roadmapGrandTotalBreakdownEl.innerHTML = ROADMAP_VENDORS.map(({ key, label }) => {
    const rows = breakdown.filter((row) => row.vendor === key);
    if (!rows.length) return "";
    const vendorTotal = rows.reduce((sum, row) => sum + row.cost, 0);
    return `
      <div class="roadmap-breakdown-vendor-label">
        <span>${escapeHtml(label)}</span>
        <span>${formatCurrency(vendorTotal)}</span>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Cost</th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr><td>${escapeHtml(row.desc)}</td><td>${row.qty}</td><td>${formatCurrency(row.cost)}</td></tr>`).join("")}
        </tbody>
      </table>`;
  }).join("");
  return breakdown;
}

function updateRoadmapGrandTotalBar() {
  if (!roadmapGrandTotalBarEl) return;
  const isRoadmap = currentApp === ROADMAP_APP_KEY;
  roadmapGrandTotalBarEl.classList.toggle("visible", isRoadmap);
  document.body.classList.toggle("has-roadmap-total-bar", isRoadmap);
  if (!isRoadmap) {
    roadmapGrandTotalBreakdownEl?.classList.remove("visible");
    return;
  }

  const visibleItems = lastRenderedRoadmapItems || [];
  const selectedCount = selectedRoadmapItemIds.size;
  // Selection is resolved against the full dataset (not just what's
  // currently filtered into view) the same way Export does, so a total
  // built while flipping between tabs stays correct the whole time.
  const items = selectedCount > 0 ? allRoadmapItems.filter((it) => selectedRoadmapItemIds.has(it.id)) : visibleItems;

  const total = items.reduce((sum, it) => {
    const t = roadmapItemTotal(it);
    return sum + (typeof t === "number" ? t : 0);
  }, 0);

  // Kept in sync with the same grouped breakdown shown in the panel below,
  // rather than recomputed separately, so the two numbers can never drift.
  const breakdown = renderRoadmapGrandTotalBreakdown(items);
  const equipmentCount = breakdown.reduce((sum, row) => sum + row.qty, 0);

  if (roadmapGrandTotalLabelEl) {
    const scopeLabel = selectedCount > 0 ? `${items.length} selected` : `all ${items.length} shown`;
    roadmapGrandTotalLabelEl.textContent = `Grand total — ${scopeLabel}: ${equipmentCount} equipment · ${formatCurrency(total)}`;
  }

  if (roadmapGrandTotalSelectAllEl) {
    roadmapGrandTotalSelectAllEl.checked =
      visibleItems.length > 0 && visibleItems.every((it) => selectedRoadmapItemIds.has(it.id));
  }
}

roadmapGrandTotalBreakdownToggleEl?.addEventListener("click", () => {
  const nowVisible = roadmapGrandTotalBreakdownEl?.classList.toggle("visible");
  roadmapGrandTotalBreakdownToggleEl.textContent = nowVisible ? "Hide breakdown ▴" : "View breakdown ▾";
});

roadmapGrandTotalSelectAllEl?.addEventListener("change", () => {
  const visibleItems = lastRenderedRoadmapItems || [];
  if (roadmapGrandTotalSelectAllEl.checked) {
    visibleItems.forEach((it) => selectedRoadmapItemIds.add(it.id));
  } else {
    visibleItems.forEach((it) => selectedRoadmapItemIds.delete(it.id));
  }
  updateRoadmapSelectionUI();
  render();
});

// Static catalog backing the Cost Breakdown "pull the price from the UniFi
// store" autocomplete - name/SKU/page for products across Physical
// Security, Door Access, Switching, Cloud Gateways, and WiFi, compiled from
// store.ui.com's own category listings. Matching happens locally against
// this list as someone types (instant, no network round-trip); only
// clicking a suggestion triggers a live price fetch (see fetchUnifiPriceFn),
// so keystrokes never hit the network and the live price is only as stale
// as the moment it was picked. `u` is the path under store.ui.com/us/en/category/.
// The storefronts a Cost Breakdown row can be priced from. UniFi has a
// curated static catalog (below) so it gets full type-ahead-to-live-price
// autocomplete; Amazon, Home Depot, and LTS (ltsecurityinc.com) don't have
// anything like that list, so their sections instead offer a "paste a
// product link" fetch plus autocomplete against whatever the team has
// already typed/priced before (self-learning only, starts empty, grows
// with use).
const ROADMAP_VENDORS = [
  { key: "unifi", label: "UniFi" },
  { key: "amazon", label: "Amazon" },
  { key: "homedepot", label: "Home Depot" },
  { key: "lts", label: "LTS" },
];
// Shared by the Cost Breakdown edit form and the Compare view - buckets a
// flat lineItems array into one array per vendor, defaulting anything
// untagged (or tagged with an unrecognized vendor) to UniFi.
function groupRoadmapLineItemsByVendor(lineItems) {
  const byVendor = Object.fromEntries(ROADMAP_VENDORS.map((v) => [v.key, []]));
  (lineItems || []).forEach((li) => {
    const vendor = byVendor[li.vendor] ? li.vendor : "unifi";
    byVendor[vendor].push(li);
  });
  return byVendor;
}

const UNIFI_STORE_BASE = "https://store.ui.com/us/en/category/";
const UNIFI_PRODUCT_CATALOG = [
  // Physical Security - Dome/Turret/PTZ/NVR/Sensors
  { n: "G6 Pro Turret", s: "UVC-G6-Pro-Turret", u: "physical-security-dome-turret/products/uvc-g6-pro-turret" },
  { n: "G6 Pro Dome", s: "UVC-G6-Pro-Dome", u: "physical-security-dome-turret/products/uvc-g6-pro-dome" },
  { n: "G6 Turret", s: "UVC-G6-Turret", u: "physical-security-dome-turret/products/uvc-g6-turret" },
  { n: "G6 Dome", s: "UVC-G6-Dome", u: "physical-security-dome-turret/products/uvc-g6-dome" },
  { n: "G6 Pro 360", s: "UVC-G6-Pro-360", u: "physical-security-dome-turret/products/uvc-g6-pro-360" },
  { n: "G6 180", s: "UVC-G6-180", u: "physical-security-dome-turret/products/uvc-g6-180" },
  { n: "AI Multi Sensor 4", s: "UVC-AI-MS-4", u: "physical-security-dome-turret/products/uvc-ai-ms-4" },
  { n: "G5 Turret Ultra", s: "UVC-G5-Turret-Ultra", u: "physical-security-dome-turret/products/uvc-g5-turret-ultra" },
  { n: "G6 Mini Dome", s: "UVC-G6-Mini-Dome", u: "physical-security-dome-turret/products/uvc-g6-mini-dome" },
  { n: "AI Multi Sensor 2", s: "UVC-AI-MS-2", u: "physical-security-dome-turret/products/uvc-ai-ms-2" },
  { n: "AI Turret", s: "UVC-AI-Turret", u: "physical-security-dome-turret/products/uvc-ai-turret" },
  { n: "AI Dome", s: "UVC-AI-Dome", u: "physical-security-dome-turret/products/uvc-ai-dome" },
  { n: "AI 360", s: "UVC-AI-360", u: "physical-security-dome-turret/products/uvc-ai-360" },
  { n: "G5 Dome Ultra", s: "UVC-G5-Dome-Ultra", u: "physical-security-dome-turret/products/uvc-g5-dome-ultra" },
  { n: "G6 Pro Bullet", s: "UVC-G6-Pro-Bullet", u: "physical-security-bullet/products/uvc-g6-pro-bullet" },
  { n: "G6 Bullet", s: "UVC-G6-Bullet", u: "physical-security-bullet/products/uvc-g6-bullet" },
  { n: "AI LPR", s: "UVC-AI-LPR", u: "physical-security-bullet/products/uvc-ai-lpr" },
  { n: "AI Pro", s: "UVC-AI-Pro", u: "physical-security-bullet/products/uvc-ai-pro" },
  { n: "G5 Pro", s: "UVC-G5-Pro", u: "physical-security-bullet/products/uvc-g5-pro" },
  { n: "G5 Bullet", s: "UVC-G5-Bullet", u: "physical-security-bullet/products/uvc-g5-bullet" },
  { n: "G6 Instant", s: "UVC-G6-INS", u: "physical-security-compact/products/uvc-g6-ins" },
  { n: "G5 Flex", s: "UVC-G5-Flex", u: "physical-security-compact/products/uvc-g5-flex" },
  { n: "G4 Instant", s: "UVC-G4-INS", u: "physical-security-compact/products/uvc-g4-ins" },
  { n: "G6 PTZ", s: "UVC-G6-PTZ", u: "physical-security-ptz/products/uvc-g6-ptz" },
  { n: "AI PTZ Industrial", s: "UVC-AI-PTZ", u: "physical-security-ptz/products/uvc-ai-ptz" },
  { n: "AI PTZ Precision", s: "UVC-AI-PTZ-Precision", u: "physical-security-ptz/products/uvc-ai-ptz-precision" },
  { n: "G5 PTZ", s: "UVC-G5-PTZ", u: "physical-security-ptz/products/uvc-g5-ptz" },
  { n: "Enterprise NVR Core", s: "ENVR-Core", u: "physical-security-nvr/products/envr-core" },
  { n: "Enterprise NVR", s: "ENVR", u: "physical-security-nvr/products/envr" },
  { n: "Network Video Recorder G2 Pro", s: "UNVR-G2-Pro", u: "physical-security-nvr/products/unvr-g2-pro" },
  { n: "Network Video Recorder G2", s: "UNVR-G2", u: "physical-security-nvr/products/unvr-g2" },
  { n: "Network Video Recorder Pro", s: "UNVR-Pro", u: "physical-security-nvr/products/unvr-pro" },
  { n: "Network Video Recorder", s: "UNVR", u: "physical-security-nvr/products/unvr" },
  { n: "AI Key", s: "AI-Key", u: "physical-security-nvr/products/ai-key" },
  { n: "AI Port", s: "UP-AI-Port", u: "physical-security-nvr/products/up-ai-port" },
  { n: "Protect Viewport", s: "UP-Viewport", u: "physical-security-nvr/products/ufp-viewport" },
  { n: "CloudKey+ SSD", s: "UCK-G2-SSD", u: "physical-security-nvr/products/uck-g2-ssd" },
  { n: "Entry Sensor", s: "USL-Entry", u: "physical-security-sensors-alarms/products/usl-entry" },
  { n: "Motion Sensor", s: "USL-Motion", u: "physical-security-sensors-alarms/products/usl-motion" },
  { n: "Glass Break Sensor", s: "USL-GlassBreak", u: "physical-security-sensors-alarms/products/usl-glassbreak" },
  { n: "Environmental Sensor", s: "USL-Environmental", u: "physical-security-sensors-alarms/products/usl-environmental" },
  { n: "Vape Detection & Air Quality Sensor", s: "UP-AirQuality", u: "physical-security-sensors-alarms/products/up-airquality" },
  { n: "Protect Relay", s: "USL-Relay", u: "physical-security-sensors-alarms/products/usl-relay" },
  { n: "Remote Control KeyFob", s: "USL-FOB", u: "physical-security-sensors-alarms/products/usl-fob" },
  { n: "Protect Alarm Hub Kit", s: "UP-AlarmHub-Kit", u: "physical-security-sensors-alarms/products/up-alarmhub-kit" },
  { n: "Siren PoE", s: "UP-Siren-PoE", u: "physical-security-sensors-alarms/collections/special-devices-sirens/products/up-siren-poe" },
  { n: "Siren", s: "USL-Siren", u: "physical-security-sensors-alarms/collections/special-devices-sirens/products/usl-siren" },
  { n: "AI Speaker", s: "UP-AI-Speaker", u: "physical-security-sensors-alarms/products/up-ai-speaker" },
  { n: "AI Horn Speaker", s: "UP-AI-Horn-Speaker", u: "physical-security-sensors-alarms/products/up-ai-horn-speaker" },
  { n: "Protect All-In-One Sensor", s: "UP-Sense", u: "physical-security-sensors-alarms/products/up-sense" },
  { n: "Protect Floodlight", s: "UP-FloodLight", u: "physical-security-accessories/products/up-floodlight" },
  { n: "PoE to USB-C Adapter", s: "UACC-Adapter-PoE-USBC", u: "physical-security-accessories/products/uacc-adapter-poe-usbc" },
  { n: "Bullet Camera Adjustable Angled Base", s: "UACC-Bullet-AB", u: "physical-security-accessories/products/uacc-bullet-ab" },
  { n: "Camera Dual Mount", s: "UACC-Camera-DM", u: "physical-security-accessories/products/uacc-camera-dm" },
  { n: "Gang Box Mounting Plate", s: "UACC-GB-Plate", u: "physical-security-accessories/products/uacc-gb-plate" },
  { n: "G6 180 Camera Flush Mount", s: "UACC-G6-180-FM", u: "physical-security-accessories/products/uacc-g6-180-fm" },
  { n: "G6 180 Camera Pendant Mount", s: "UACC-G6-180-PM", u: "physical-security-accessories/products/uacc-g6-180-pm" },
  { n: "AI Multi Sensor 4 Camera Arm Mount", s: "UACC-AI-MS-4-AM", u: "physical-security-accessories/products/uacc-ai-ms-4-am" },
  { n: "AI Multi Sensor 4 Camera Pendant Mount", s: "UACC-AI-MS-4-PM", u: "physical-security-accessories/products/uacc-ai-ms-4-pm" },
  { n: "AI Multi Sensor 2 Camera Pendant Mount", s: "UACC-AI-MS-2-PM", u: "physical-security-accessories/collections/ai-multi-sensor-2-mount/products/uacc-ai-ms-2-pm" },
  { n: "AI Multi Sensor 2 Camera Weather Shield", s: "UACC-AI-MS-2-WS", u: "physical-security-accessories/collections/ai-multi-sensor-2-mount/products/uacc-ai-ms-2-ws" },
  { n: "AI PTZ Precision Corner Mount", s: "UACC-AI-PTZ-Precision-CM", u: "physical-security-accessories/products/uacc-ai-ptz-precision-cm" },
  { n: "AI PTZ Precision Pendant Mount", s: "UACC-AI-PTZ-Precision-PM", u: "physical-security-accessories/products/uacc-ai-ptz-precision-pm" },
  { n: "SuperLink High-Gain Antenna", s: "UACC-USL-ANT-HG", u: "physical-security-sensors-alarms/products/uacc-usl-ant-hg" },
  { n: "Smoke and CO Alarm", s: "USL-Smoke", u: "physical-security-sensors-alarms/products/usl-smoke" },

  // Door Access
  { n: "Enterprise Access Hub", s: "EAH-8", u: "door-access-hub/products/eah-8" },
  { n: "Access Retrofit Hub", s: "UA-Retrofit-Hub-2", u: "door-access-hub/products/ua-retrofit-hub-2" },
  { n: "Access Door Hub", s: "UA-Hub-Door", u: "door-access-hub/products/ua-hub-door" },
  { n: "Access Door Hub Mini", s: "UA-Hub-Door-Mini", u: "door-access-hub/products/ua-hub-door-mini" },
  { n: "Access Gate Hub", s: "UA-Hub-Gate", u: "door-access-hub/products/ua-hub-gate" },
  { n: "Access Ultra", s: "UA-Ultra", u: "door-access-hub/products/ua-ultra" },
  { n: "Touch Pass Access G3 Reader Flex", s: "UA-G3-Flex", u: "door-access-readers/products/ua-g3-flex" },
  { n: "G3 Elevator Starter Kit", s: "UA-G3-SK-Elevator", u: "door-access-starter-kit/products/ua-g3-sk-elevator" },
  { n: "Access Card", s: "UA-Card", u: "door-access-accessories/products/ua-card" },
  { n: "PoE Over 2-Wire Retrofit Extender", s: "UACC-Retrofit-PoE-2Wire", u: "door-access-accessories/products/uacc-retrofit-poe-2wire" },
  { n: "Access Reader Junction Box", s: "UACC-Reader-JB", u: "door-access-accessories/products/uacc-reader-jb" },
  { n: "Access Reader Pro Junction Box", s: "UACC-Reader-Pro-JB", u: "door-access-accessories/products/uacc-reader-pro-jb" },
  { n: "Access Reader Pro Angle Mount", s: "UACC-Reader-Pro-AM", u: "door-access-accessories/products/uacc-reader-pro-am" },
  { n: "Access Intercom Surface Angle Mount", s: "UACC-Intercom-SAM", u: "door-access-accessories/products/uacc-intercom-sam" },
  { n: "Access Intercom Flush Mount", s: "UACC-Intercom-FM", u: "door-access-accessories/products/uacc-intercom-fm" },
  { n: "Access Intercom Sunshield", s: "UACC-Intercom-Sunshield", u: "door-access-accessories/products/uacc-intercom-sunshield" },
  { n: "Intercom Wedge Mount", s: "UACC-Intercom-WM", u: "door-access-accessories/products/uacc-intercom-wm" },
  { n: "Intercom Viewer Table Stand", s: "UACC-Intercom-Viewer-TS", u: "door-access-accessories/products/uacc-intercom-viewer-ts" },
  { n: "Access Junction Utility", s: "UACC-Junction-Utility", u: "door-access-accessories/products/uacc-junction-utility" },
  { n: "Retrofit PSU 12V", s: "UACC-Retrofit-PSU-12V", u: "door-access-accessories/products/uacc-retrofit-psu-12v" },
  { n: "Access Button", s: "UA-Button", u: "door-access-accessories/products/ua-button" },
  { n: "Door Closer", s: "UACC-DoorCloser", u: "door-access-accessories/products/uacc-doorcloser-us" },
  { n: "Panic Bar", s: "UACC-PanicBar", u: "door-access-accessories/products/uacc-panicbar" },
  { n: "Access Magnetic Lock", s: "UA-Lock-Magnetic", u: "door-access-accessories/products/ua-lock-magnetic" },
  { n: "Door Lock Relay Cable", s: "UACC-Cable-DoorLockRelay", u: "door-access-accessories/products/uacc-cable-doorlockrelay" },
  { n: "Access Pocket Keyfob (10-Pack)", s: "UA-Pocket", u: "door-access-accessories/products/ua-pocket" },
  { n: "Access Rescue KeySwitch", s: "UA-Rescue", u: "door-access-accessories/products/ua-rescue" },

  // Switching
  { n: "Switch Pro Max 48 PoE", s: "USW-Pro-Max-48-PoE", u: "switching-professional-max-xg/products/usw-pro-max-48-poe" },
  { n: "Switch Pro Max 24 PoE", s: "USW-Pro-Max-24-PoE", u: "switching-professional-max-xg/products/usw-pro-max-24-poe" },
  { n: "Switch Pro XG 48 PoE", s: "USW-Pro-XG-48-PoE", u: "switching-professional-max-xg/products/usw-pro-xg-48-poe" },
  { n: "Switch Pro XG 24 PoE", s: "USW-Pro-XG-24-PoE", u: "switching-professional-max-xg/products/usw-pro-xg-24-poe" },
  { n: "Switch Pro HD 24 PoE", s: "USW-Pro-HD-24-PoE", u: "switching-professional-max-xg/products/usw-pro-hd-24-poe" },
  { n: "Switch Pro 48 PoE", s: "USW-Pro-48-POE", u: "switching-professional/products/usw-pro-48-poe" },
  { n: "Switch Pro 24 PoE", s: "USW-Pro-24-POE", u: "switching-professional/products/usw-pro-24-poe" },
  { n: "Switch Enterprise Campus 48 PoE", s: "ECS-48-PoE", u: "switching-enterprise/collections/enterprise-campus/products/ecs-48-poe" },
  { n: "Switch Enterprise Campus 24 PoE", s: "ECS-24-PoE", u: "switching-enterprise/collections/enterprise-campus/products/ecs-24-poe" },
  { n: "Switch Enterprise Audio/Video XG 24 PoE", s: "EAV-XG-24-PoE", u: "switching-enterprise/collections/enterprise-audiovideo/products/eav-xg-24-poe" },
  { n: "Switch Enterprise Audio/Video Fiber", s: "EAV-Fiber", u: "switching-enterprise/collections/enterprise-audiovideo/products/eav-fiber" },
  { n: "Switch 48 PoE", s: "USW-48-POE", u: "switching-standard/products/usw-48-poe" },
  { n: "Switch 24 PoE", s: "USW-24-POE", u: "switching-standard/products/usw-24-poe" },
  { n: "Switch 16 PoE", s: "USW-16-POE", u: "switching-standard/products/usw-16-poe" },
  { n: "Switch Pro XG 48", s: "USW-Pro-XG-48", u: "switching-professional-max-xg/products/usw-pro-xg-48" },
  { n: "Switch Pro XG 24", s: "USW-Pro-XG-24", u: "switching-professional-max-xg/products/usw-pro-xg-24" },
  { n: "Switch Enterprise Campus Aggregation", s: "ECS-Aggregation", u: "switching-enterprise/collections/enterprise-campus-aggregation/products/ecs-aggregation" },
  { n: "Switch Pro XG Aggregation", s: "USW-Pro-XG-Aggregation", u: "switching-aggregation/products/usw-pro-xg-aggregation" },
  { n: "Switch Aggregation", s: "USW-Aggregation", u: "switching-aggregation/products/usw-aggregation" },
  { n: "UniFi WAN Switch", s: "USW-WAN", u: "switching-wan/products/usw-wan" },
  { n: "UniFi WAN Switch RJ45", s: "USW-WAN-RJ45", u: "switching-wan/products/usw-wan-rj45" },
  { n: "Switch Pro XG 10 PoE", s: "USW-Pro-XG-10-PoE", u: "switching-professional-max-xg/products/usw-pro-xg-10-poe" },
  { n: "Switch Lite 16 PoE", s: "USW-Lite-16-PoE", u: "switching-utility/products/usw-lite-16-poe" },
  { n: "Switch Lite 8 PoE", s: "USW-Lite-8-PoE", u: "switching-utility/products/usw-lite-8-poe" },
  { n: "Switch Pro Max 16 PoE", s: "USW-Pro-Max-16-PoE", u: "switching-professional-max-xg/products/usw-pro-max-16-poe" },
  { n: "Switch Pro XG 8 PoE", s: "USW-Pro-XG-8-PoE", u: "switching-utility/products/usw-pro-xg-8-poe" },
  { n: "Switch Enterprise 8 PoE (Vintage)", s: "USW-Enterprise-8-PoE", u: "switching-utility/products/usw-enterprise-8-poe" },
  { n: "Switch Pro 8 PoE", s: "USW-Pro-8-PoE", u: "switching-utility/products/usw-pro-8-poe" },
  { n: "Switch Flex 2.5G PoE", s: "USW-Flex-2.5G-8-PoE", u: "switching-utility/products/usw-flex-2-5g-8-poe" },
  { n: "Switch Flex 2.5G", s: "USW-Flex-2.5G-8", u: "switching-utility/products/usw-flex-2-5g-8" },
  { n: "Switch Flex Mini 2.5G", s: "USW-Flex-2.5G-5", u: "switching-utility/products/usw-flex-2-5g-5" },
  { n: "Switch Flex Utility", s: "USW-FlexUtility", u: "switching-utility/products/usw-flexutility" },
  { n: "Flex Utility Pro", s: "UACC-Flex-Utility-Pro", u: "switching-utility/products/uacc-flex-utility-pro" },
  { n: "Switch Flex XG", s: "USW-Flex-XG", u: "switching-utility/products/usw-flex-xg" },
  { n: "Switch Pro HD 24", s: "USW-Pro-HD-24", u: "switching-professional-max-xg/products/usw-pro-hd-24" },
  { n: "Switch Pro Max 48", s: "USW-Pro-Max-48", u: "switching-professional-max-xg/products/usw-pro-max-48" },
  { n: "Switch Pro Max 24", s: "USW-Pro-Max-24", u: "switching-professional-max-xg/products/usw-pro-max-24" },
  { n: "Switch Pro Max 16", s: "USW-Pro-Max-16", u: "switching-professional-max-xg/products/usw-pro-max-16" },
  { n: "Switch Pro 48", s: "USW-Pro-48", u: "switching-professional/products/usw-pro-48" },
  { n: "Switch Pro 24", s: "USW-Pro-24", u: "switching-professional/products/usw-pro-24" },
  { n: "Switch 48", s: "USW-48", u: "switching-standard/products/usw-48" },
  { n: "Switch 24", s: "USW-24", u: "switching-standard/products/usw-24" },
  { n: "UPS PoE Switch Mission Critical", s: "USW-Mission-Critical", u: "switching-professional/products/usw-mission-critical" },
  { n: "Switch Hi-Capacity Aggregation", s: "USW-Pro-Aggregation", u: "switching-aggregation/products/usw-pro-aggregation" },
  { n: "Switch Enterprise Campus 48S PoE", s: "ECS-48S-PoE", u: "switching-enterprise/collections/enterprise-campus-stackable/products/ecs-48s-poe" },
  { n: "Switch Enterprise Campus 24S PoE", s: "ECS-24S-PoE", u: "switching-enterprise/collections/enterprise-campus-stackable/products/ecs-24s-poe" },

  // Cloud Gateways
  { n: "Enterprise Firewall Core", s: "EF-Core", u: "cloud-gateways-enterprise-scale/products/ef-core" },
  { n: "Enterprise Fortress Gateway", s: "EFG", u: "cloud-gateways-enterprise-scale/products/efg" },
  { n: "Dream Machine Beast", s: "UDM-Beast", u: "cloud-gateways-large-scale/products/udm-beast" },
  { n: "Dream Machine Pro Max", s: "UDM-Pro-Max", u: "cloud-gateways-large-scale/products/udm-pro-max" },
  { n: "Dream Machine Pro", s: "UDM-Pro", u: "cloud-gateways-large-scale/products/udm-pro" },
  { n: "Dream Machine Special Edition", s: "UDM-SE", u: "cloud-gateways-large-scale/products/udm-se" },
  { n: "Cloud Gateway Fiber", s: "UCG-Fiber", u: "cloud-gateways-compact/collections/cloud-gateway-fiber/products/ucg-fiber" },
  { n: "Cloud Gateway Max", s: "UCG-Max", u: "cloud-gateways-compact/collections/cloud-gateway-max" },
  { n: "Cloud Gateway Ultra", s: "UCG-Ultra", u: "cloud-gateways-compact/products/ucg-ultra" },
  { n: "Cloud Gateway Industrial", s: "UCG-Industrial", u: "cloud-gateways-wifi-integrated/products/ucg-industrial" },
  { n: "Dream Router 5G Max", s: "UDR-5G-Max", u: "cloud-gateways-wifi-integrated/products/udr-5g-max" },
  { n: "Dream Router 7", s: "UDR7", u: "cloud-gateways-wifi-integrated/products/udr7" },
  { n: "UniFi Express 7", s: "UX7", u: "cloud-gateways-wifi-integrated/products/ux7" },
  { n: "Dream Wall", s: "UDW", u: "cloud-gateways-wifi-integrated/products/udw" },

  // WiFi
  { n: "E7", s: "E7", u: "wifi-enterprise/products/e7" },
  { n: "U7 Pro XGS", s: "U7-Pro-XGS", u: "wifi-flagship/products/u7-pro-xgs" },
  { n: "U7 Pro XG", s: "U7-Pro-XG", u: "wifi-flagship/products/u7-pro-xg" },
  { n: "U7 Pro Max", s: "U7-Pro-Max", u: "wifi-flagship/products/u7-pro-max" },
  { n: "U7 Pro", s: "U7-Pro", u: "wifi-flagship/products/u7-pro" },
  { n: "U7 Long-Range", s: "U7-LR", u: "wifi-flagship/products/u7-lr" },
  { n: "U7 Lite", s: "U7-Lite", u: "wifi-flagship/products/u7-lite" },
  { n: "U7 Pro XG Wall", s: "U7-Pro-XG-Wall", u: "wifi-wall/products/u7-pro-xg-wall" },
  { n: "U7 Pro Wall", s: "U7-Pro-Wall", u: "wifi-wall/products/u7-pro-wall" },
  { n: "U7 In-Wall", s: "U7-IW", u: "wifi-wall/products/u7-iw" },
  { n: "U7 Pro Outdoor", s: "U7-Pro-Outdoor-US", u: "wifi-outdoor/products/u7-pro-outdoor-us" },
  { n: "U7 Outdoor", s: "U7-Outdoor", u: "wifi-outdoor/products/u7-outdoor" },
  { n: "U7 Mesh", s: "U7-Mesh", u: "wifi-outdoor/products/u7-mesh" },
  { n: "U6 Enterprise", s: "U6-Enterprise", u: "wifi-flagship/products/u6-enterprise" },
  { n: "U6 Enterprise In-Wall", s: "U6-Enterprise-IW", u: "wifi-wall/products/u6-enterprise-iw" },
  { n: "U6 Pro", s: "U6-Pro", u: "wifi-flagship/products/u6-pro" },
  { n: "U6 Plus", s: "U6+", u: "wifi-flagship/products/u6-plus" },
  { n: "U6 Mesh", s: "U6-Mesh", u: "wifi-outdoor/products/u6-mesh" },
  { n: "U6 Mesh Pro", s: "U6-Mesh-Pro", u: "wifi-outdoor/products/u6-mesh-pro" },
  { n: "U6 In-Wall", s: "U6-IW", u: "wifi-wall/products/u6-iw" },
  { n: "AC Mesh", s: "UAP-AC-M", u: "wifi-outdoor/products/uap-ac-mesh" },
  { n: "Swiss Army Knife", s: "UK-Ultra", u: "wifi-outdoor/products/uk-ultra" },
  { n: "WiFi BaseStation XG", s: "UWB-XG", u: "wifi-mega-capacity/products/uwb-xg" },
  { n: "AC Pro", s: "UAP-AC-PRO", u: "wifi-flagship/products/uap-ac-pro" },
  { n: "Device Bridge Pro Sector", s: "UDB-Pro-Sector", u: "wifi-bridging/products/udb-pro-sector" },
  { n: "Device Bridge Pro", s: "UDB-Pro", u: "wifi-bridging/products/udb-pro" },
  { n: "UniFi Device Bridge", s: "UDB", u: "wifi-bridging/products/udb" },
  { n: "Device Bridge IoT", s: "UDB-IoT", u: "wifi-bridging/products/udb-iot" },
  { n: "Device Bridge Switch", s: "UDB-Switch", u: "wifi-bridging/products/udb-switch" },
  { n: "Building-to-Building Bridge XG", s: "UBB-XG", u: "wifi-bridging/products/ubb-xg" },
  { n: "Building-to-Building Bridge", s: "UBB", u: "wifi-bridging/products/ubb" },
  { n: "AirWire", s: "U-AirWire", u: "wifi-special-devices/products/u-airwire" },
  { n: "UniFi Travel Router", s: "UTR", u: "wifi-special-devices/products/utr" },
];

// Merges two sources: the curated UniFi store catalog above (has a `u`
// page path - clicking it triggers a live price fetch) and whatever the
// team has actually typed and saved before (has a remembered `amount`
// instead - clicking it just fills that amount directly, no network call).
// Custom entries are shown first since they're what this exact team uses,
// and are deduped against the static catalog by name so typing an exact
// UniFi product name manually doesn't produce two near-identical rows.
function productMatches(query, vendor) {
  const q = (query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const custom = roadmapCustomLineItemCatalog
    .filter((p) => p.vendor === vendor && p.n.toLowerCase().includes(q))
    .slice(0, 5);
  // Amazon/Home Depot have no curated catalog to fall back on - matches
  // are only ever what's already been learned for that vendor.
  if (vendor !== "unifi") return custom;
  const customNames = new Set(custom.map((p) => p.n.toLowerCase()));
  const catalog = UNIFI_PRODUCT_CATALOG.filter(
    (p) => !customNames.has(p.n.toLowerCase()) && (p.n.toLowerCase().includes(q) || p.s.toLowerCase().includes(q))
  ).slice(0, Math.max(8 - custom.length, 3));
  return [...custom, ...catalog];
}

// One row of the structured "Cost breakdown" table in the card edit form.
// Amount is treated as a per-item/unit price; Qty defaults to 1 so old
// rows saved before this field existed keep summing exactly as before.
// Amount is a plain number input (not text-with-$-parsing) so negative
// values just work via the native minus key - no regex guessing needed.
function roadmapLineItemRowHtml(li, vendor = "unifi") {
  const amount = li.amount === "" || li.amount === undefined || li.amount === null || Number.isNaN(li.amount) ? "" : li.amount;
  const qty = li.qty === "" || li.qty === undefined || li.qty === null || Number.isNaN(li.qty) ? 1 : li.qty;
  // UniFi gets live prices from the type-ahead catalog alone, so it has no
  // need for the link control. Amazon/Home Depot have no such catalog, so
  // every row there gets a 🔗 to paste a product link and fetch its price.
  const showLink = vendor !== "unifi";
  return `
    <div class="roadmap-lineitem-row" data-vendor="${escapeHtml(vendor)}" style="margin-bottom:4px;">
      <div style="display:flex; gap:6px; align-items:center;">
        <div class="roadmap-lineitem-reorder">
          <button type="button" class="roadmap-lineitem-move-up" title="Move up">▲</button>
          <button type="button" class="roadmap-lineitem-move-down" title="Move down">▼</button>
        </div>
        <input type="text" class="roadmap-lineitem-desc" placeholder="e.g. Camera" value="${escapeHtml(li.desc || "")}" style="flex:1; padding:6px 8px; border-radius:6px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:13px; font-family:inherit;" />
        <input type="number" class="roadmap-lineitem-qty" placeholder="Qty" step="1" value="${qty}" title="Quantity" style="width:38px; padding:5px 4px; border-radius:6px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:12px; font-family:inherit; text-align:center;" />
        <input type="number" class="roadmap-lineitem-amount" placeholder="0.00" step="0.01" value="${amount}" title="Unit price" style="width:calc(7ch + 14px); padding:5px 7px; border-radius:6px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:12px; font-family:inherit;" />
        ${showLink ? `<button type="button" class="roadmap-lineitem-link-btn" title="Paste a product link to fetch its price" style="border:none; background:transparent; color:var(--text); cursor:pointer; font-size:13px; padding:0 2px; flex-shrink:0;">🔗</button>` : ""}
        <button type="button" class="roadmap-lineitem-remove-btn" title="Remove line" style="border:none; background:transparent; color:var(--text); cursor:pointer; font-size:13px; padding:0 4px; flex-shrink:0;">✕</button>
      </div>
      ${
        showLink
          ? `<div class="roadmap-lineitem-link-row" style="display:none; gap:6px; margin-top:3px; padding-left:22px;">
        <input type="url" class="roadmap-lineitem-link-input" placeholder="Paste product link…" style="flex:1; min-width:0; box-sizing:border-box; padding:4px 7px; border-radius:6px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:11px; font-family:inherit;" />
        <button type="button" class="secondary roadmap-lineitem-link-fetch-btn" style="font-size:10px; padding:2px 8px; flex-shrink:0;">Fetch price</button>
      </div>`
          : ""
      }
    </div>
  `;
}

function roadmapLineItemLineTotal(li) {
  const amt = typeof li.amount === "number" ? li.amount : parseFloat(li.amount);
  if (!Number.isFinite(amt)) return 0;
  const qtyRaw = li.qty === undefined || li.qty === null || li.qty === "" ? 1 : typeof li.qty === "number" ? li.qty : parseFloat(li.qty);
  const qty = Number.isFinite(qtyRaw) ? qtyRaw : 1;
  return amt * qty;
}

// No separate "line total" column shown in the table itself - each row's
// qty*amount just feeds straight into the one card-level Estimated total,
// which is the number people actually look at.
function roadmapLineItemsSum(rows) {
  return (rows || []).reduce((sum, li) => sum + roadmapLineItemLineTotal(li), 0);
}

// Shared money formatting so a negative net total (more discounts/refunds
// than costs) reads as "-$50" everywhere instead of the awkward "$-50"
// toLocaleString() alone would produce.
function formatCurrency(n) {
  const num = Number(n) || 0;
  return num < 0 ? "-$" + Math.abs(num).toLocaleString() : "$" + num.toLocaleString();
}

function roadmapLineItemsTotalLabel(rows) {
  return `Total: ${formatCurrency(roadmapLineItemsSum(rows))}`;
}

function roadmapRowsToLineItems(rowEls) {
  return Array.from(rowEls).map((row) => ({
    qty: row.querySelector(".roadmap-lineitem-qty")?.value,
    amount: row.querySelector(".roadmap-lineitem-amount")?.value,
  }));
}

// Live recompute as the user types, before anything is saved - this is
// the "auto add or subtract as I add new items" behavior, driven by real
// number inputs instead of re-parsing notes text after the fact. Updates
// both the per-vendor subtotal (UniFi/Amazon/Home Depot each shown inside
// their own section) and the one combined total for the whole card.
function recomputeRoadmapLineItemsTotal(wrapEl) {
  const totalEl = wrapEl.querySelector(".roadmap-lineitem-total");
  if (totalEl) {
    totalEl.textContent = roadmapLineItemsTotalLabel(roadmapRowsToLineItems(wrapEl.querySelectorAll(".roadmap-lineitem-row")));
  }
  wrapEl.querySelectorAll(".roadmap-vendor-section").forEach((section) => {
    const subtotalEl = section.querySelector(".roadmap-lineitem-subtotal");
    if (!subtotalEl) return;
    subtotalEl.textContent = roadmapLineItemsTotalLabel(roadmapRowsToLineItems(section.querySelectorAll(".roadmap-lineitem-row")));
  });
}

// Matches a free-text cost line like "- G6 Bullet – $11940" or
// "Camera: $500" (bullet/dash prefix optional, separator is a dash/en
// dash/colon, amount can be negative). Deliberately requires a leading
// "$" amount so it never matches the "Deployment: Aug 9 – Aug 15" line,
// which has no dollar sign.
const ROADMAP_COST_LINE_RE = /^[-•*]?\s*(.+?)\s*[-–—:]\s*(-?\$[\d,]+(?:\.\d{1,2})?)\s*$/;

// One-time migration run the first time an item without any saved
// lineItems is opened for editing: pulls itemized "$" bullet lines out of
// the free-text notes into structured rows, and strips those same lines
// out of the notes so the two don't show the same cost twice. Lines
// mentioning "total" are left in notes untouched (that's the authoritative
// total line, not a line item to migrate). Idempotent after the first
// save, since the item will have lineItems from then on.
function extractLineItemsFromNotes(notes) {
  const lines = (notes || "").split("\n");
  const items = [];
  const remaining = [];
  for (const line of lines) {
    if (/total/i.test(line)) {
      remaining.push(line);
      continue;
    }
    const m = line.match(ROADMAP_COST_LINE_RE);
    const desc = m?.[1]?.trim();
    const amount = m ? parseFloat(m[2].replace(/[$,]/g, "")) : NaN;
    if (desc && Number.isFinite(amount)) {
      items.push({ desc, amount });
    } else {
      remaining.push(line);
    }
  }
  return { items, notes: remaining.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}

// Prefers the structured lineItems sum (real column/row data - always
// correct, add or subtract per-row) whenever an item has any rows saved.
// Falls back to the old regex-over-notes guess only for items that predate
// this feature and have never had a cost breakdown filled in.
function roadmapItemTotal(item) {
  if (item?.lineItems && item.lineItems.length) return roadmapLineItemsSum(item.lineItems);
  return totalAmountFromNotes(item?.notes);
}

// One "- Camera ×2 – $1,000 (Amazon)" style line per Cost Breakdown row -
// shared by the card's own read-view preview and the Excel export's
// dedicated Cost Breakdown column, so the two never drift out of sync.
// The vendor tag is only appended for non-UniFi rows, same as the card.
function roadmapLineItemBullets(item) {
  return (item?.lineItems || []).map((li) => {
    const qty = Number.isFinite(li.qty) ? li.qty : 1;
    const qtyLabel = qty !== 1 ? ` ×${qty}` : "";
    const vendorInfo = ROADMAP_VENDORS.find((v) => v.key === li.vendor);
    const vendorLabel = vendorInfo && vendorInfo.key !== "unifi" ? ` (${vendorInfo.label})` : "";
    return `- ${li.desc || "Item"}${qtyLabel} – ${formatCurrency(roadmapLineItemLineTotal(li))}${vendorLabel}`;
  });
}

function renderRoadmapItemCard(item, index) {
  const color = TIMELINE_PALETTE[index % TIMELINE_PALETTE.length];
  const status = effectiveRoadmapStatus(item);
  const totalAmount = roadmapItemTotal(item);
  const deployRange = roadmapDeploymentRange(item);

  if (editingRoadmapItemIds.has(item.id)) {
    // First time this item is edited after the Cost Breakdown feature
    // shipped, pull any "- Item – $Amount" lines out of notes into rows
    // automatically, so nothing has to be retyped and the two don't drift
    // out of sync. Once it has real lineItems, use those as-is.
    const lineItemsMigrated = item.lineItems?.length ? null : extractLineItemsFromNotes(item.notes);
    const allLineItemRows = item.lineItems?.length ? item.lineItems : lineItemsMigrated.items.length ? lineItemsMigrated.items : [];
    let notesForEdit = lineItemsMigrated ? lineItemsMigrated.notes : item.notes || "";

    // Split the flat lineItems array into its vendor sections for the edit
    // form below. Anything migrated out of old free-text notes (or saved
    // before the vendor field existed) has no vendor tag yet, so it
    // defaults to UniFi - that's the only storefront that existed back then.
    const lineItemsByVendor = groupRoadmapLineItemsByVendor(allLineItemRows);

    // Same idea for the old free-text "Deployment: Mon d – Mon d, yyyy"
    // line - the first time this item is edited after the date pickers
    // shipped, pull it into deployStartValue/deployEndValue below and
    // strip it out of the notes textarea.
    const deployMigrated = item.deploymentStart ? null : extractDeploymentFromNotes(notesForEdit);
    if (deployMigrated) notesForEdit = deployMigrated.notes;
    const deployStartValue = item.deploymentStart || deployMigrated?.start || "";
    const deployEndValue = item.deploymentEnd || deployMigrated?.end || "";
    // The end date is still what's actually stored (see the Save handler,
    // which derives it from start+duration) - duration is just a friendlier
    // way to enter it, one field instead of two calendar taps.
    const deployDurationValue = deployStartValue ? roadmapDeployDurationDays(deployStartValue, deployEndValue) : 1;
    const deployEndDate = deployStartValue ? inputValueToDate(roadmapDeployEndFromDuration(deployStartValue, deployDurationValue)) : null;
    const deployEndLabel = deployEndDate
      ? `Ends ${deployEndDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      : "";

    return `
      <div class="card roadmap-card-editing" style="border-top:4px solid ${color};">
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input type="text" class="roadmap-edit-title" value="${escapeHtml(item.title || "")}" style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:15px; font-weight:700; color:${color}; font-family:inherit;" />
          <input type="text" class="roadmap-edit-state" value="${escapeHtml(item.state || "")}" maxlength="2" placeholder="State" style="width:70px; padding:8px 10px; border-radius:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:15px; font-family:inherit; text-transform:uppercase;" />
        </div>
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
          <label style="font-size:11px; color:var(--text); display:flex; align-items:center; gap:5px;">
            Deploy start
            <input type="date" class="roadmap-edit-deploy-start" value="${escapeHtml(deployStartValue)}" style="padding:6px 7px; border-radius:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:12px; font-family:inherit;" />
          </label>
          <label style="font-size:11px; color:var(--text); display:flex; align-items:center; gap:5px;">
            Duration (days)
            <input type="number" class="roadmap-edit-deploy-duration" min="1" step="1" value="${deployDurationValue}" style="width:56px; padding:6px 7px; border-radius:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:12px; font-family:inherit;" />
          </label>
          <span class="roadmap-edit-deploy-end-label" style="font-size:11px; color:var(--info-text); font-weight:600;">${escapeHtml(deployEndLabel)}</span>
        </div>
        <textarea class="roadmap-edit-notes" placeholder="General notes... (deploy dates are set above, itemized costs go in Cost breakdown below)" style="width:100%; min-height:80px; padding:8px 10px; border-radius:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:14px; font-family:inherit; resize:vertical;">${escapeHtml(notesForEdit)}</textarea>
        <div class="roadmap-lineitems-wrap" data-id="${escapeHtml(item.id)}" style="margin-top:10px;">
          <div style="font-size:12px; font-weight:700; color:var(--text); margin-bottom:6px;">Cost breakdown</div>
          ${ROADMAP_VENDORS.map(({ key, label }) => {
            const vendorRows = lineItemsByVendor[key].length ? lineItemsByVendor[key] : [{ desc: "", amount: "" }];
            return `
            <div class="roadmap-vendor-section" data-vendor="${key}" style="margin-bottom:8px; padding:7px 8px; border:1px solid var(--border); border-radius:8px; background:var(--surface-2);">
              <div style="font-size:11px; font-weight:700; color:var(--text); margin-bottom:4px;">${escapeHtml(label)}</div>
              <div style="display:flex; gap:6px; margin-bottom:2px;">
                <div style="width:16px; flex-shrink:0;"></div>
                <div style="flex:1; font-size:11px; color:var(--text);">Description</div>
                <div style="width:38px; font-size:10px; color:var(--text); text-align:center;">Qty</div>
                <div style="width:calc(7ch + 14px); font-size:10px; color:var(--text);">($)</div>
                ${key !== "unifi" ? `<div style="width:16px;"></div>` : ""}
                <div style="width:18px;"></div>
              </div>
              <div class="roadmap-lineitems-rows" data-vendor="${key}">
                ${vendorRows.map((li) => roadmapLineItemRowHtml(li, key)).join("")}
              </div>
              <button type="button" class="secondary roadmap-lineitem-add-btn" data-vendor="${key}" style="font-size:11px; padding:3px 8px; margin-top:4px;">+ Add ${escapeHtml(label)} line</button>
              <div class="roadmap-lineitem-subtotal" style="font-size:11px; font-weight:700; margin-top:5px; color:var(--success-text);">${roadmapLineItemsTotalLabel(vendorRows)}</div>
            </div>`;
          }).join("")}
          <div class="roadmap-lineitem-total" style="font-size:12px; font-weight:700; margin-top:4px; color:var(--success-text);">${roadmapLineItemsTotalLabel(allLineItemRows)}</div>
          <div style="font-size:10px; color:var(--text); margin-top:2px;">Amount is per-item price; qty × amount feeds the total. Negative amounts (e.g. -50) subtract as discounts/refunds. For Amazon/Home Depot/LTS, paste a product link (🔗) to fetch its current price.</div>
        </div>
        <div class="toggles-row" style="justify-content:flex-end; gap:8px; margin-top:10px;">
          <button class="secondary roadmap-cancel-edit-btn" data-id="${escapeHtml(item.id)}">Cancel</button>
          <button class="roadmap-save-edit-btn" data-id="${escapeHtml(item.id)}">Save</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="card" style="border-top:4px solid ${color};">
      <div class="top-row" style="justify-content:flex-start;">
        <input type="checkbox" class="roadmap-select-checkbox" data-id="${escapeHtml(item.id)}" title="Select for export" style="margin-right:4px; flex-shrink:0; cursor:pointer;" ${selectedRoadmapItemIds.has(item.id) ? "checked" : ""} />
        <div class="subject" style="color:${color}; font-weight:700; font-size:10px;">${escapeHtml(item.title || "(untitled)")}</div>
        ${roadmapStateCode(item) ? `<span class="tag" style="flex-shrink:0; font-size:8px; padding:2px 6px;">📍 ${escapeHtml(roadmapStateCode(item))}</span>` : ""}
      </div>
      <div class="roadmap-card-body">
        ${
          deployRange
            ? `<div style="font-size:11px; font-weight:700; color:var(--info-text);">📅 Deploy: ${escapeHtml(formatDeployRangeLabel(deployRange))}</div>`
            : ""
        }
        ${
          totalAmount
            ? `<div style="font-size:11px; font-weight:700; color:var(--success-text); margin-top:4px;">💰 Estimated total: ${formatCurrency(totalAmount)}</div>`
            : ""
        }
        ${
          (() => {
            // The itemized "$" bullets used to live inside notes itself;
            // now they're generated from the structured lineItems table so
            // editing a row (add/remove/edit) actually shows up here too,
            // instead of the description being frozen text that Cost
            // Breakdown edits never touched.
            const lineItemBullets = roadmapLineItemBullets(item);
            // Already shown as its own "📅 Deploy: ..." line above whenever
            // deployRange resolved (structured or notes-parsed) - strip the
            // old free-text line here too so it isn't duplicated for items
            // that haven't been re-saved since the date pickers shipped.
            const baseNotes = deployRange ? (item.notes || "").replace(DEPLOYMENT_LINE_RE, "").replace(/\n{3,}/g, "\n\n").trim() : item.notes || "";
            const previewText = [baseNotes, ...lineItemBullets].filter(Boolean).join("\n");
            return previewText ? `<div class="preview">${escapeHtml(previewText)}</div>` : "";
          })()
        }
        ${item.attachments?.length ? `<div class="attachment-docs fields roadmap-attachments" data-key="${escapeHtml(item.id)}"></div>` : ""}
        ${
          status === "complete"
            ? `<div class="roadmap-resolution-box">
          <div class="roadmap-resolution-label">✅ Resolution</div>
          <textarea class="roadmap-resolution-input" data-id="${escapeHtml(item.id)}" placeholder="Describe how this was resolved..." ${canEdit() ? "" : "disabled"}>${escapeHtml(item.resolution || "")}</textarea>
          ${canEdit() ? `<button class="secondary roadmap-resolution-save-btn" data-id="${escapeHtml(item.id)}">Save resolution</button>` : ""}
        </div>`
            : ""
        }
        ${
          status === "pending"
            ? `<div class="roadmap-pending-box">
          <div class="roadmap-pending-label">⏳ Why pending</div>
          <textarea class="roadmap-pending-input" data-id="${escapeHtml(item.id)}" placeholder="Explain what's blocking this..." ${canEdit() ? "" : "disabled"}>${escapeHtml(item.pendingReason || "")}</textarea>
          ${canEdit() ? `<button class="secondary roadmap-pending-save-btn" data-id="${escapeHtml(item.id)}">Save reason</button>` : ""}
        </div>`
            : ""
        }
      </div>
      <div class="toggles-row" style="justify-content:center; flex-wrap:nowrap; overflow-x:auto; margin:auto -16px -14px; padding:4px 16px 6px; gap:6px; border-bottom-left-radius:10px; border-bottom-right-radius:10px;">
        ${
          canEdit()
            ? `<select class="roadmap-status-select" data-id="${escapeHtml(item.id)}" style="flex-shrink:0; border-radius:6px; border:1px solid var(--border); padding:2px 3px; font-size:10px; background:var(--input-bg); color:var(--text);">
          <option value="planning" ${status === "planning" ? "selected" : ""}>Planning</option>
          <option value="active" ${status === "active" ? "selected" : ""}>Active</option>
          <option value="pending" ${status === "pending" ? "selected" : ""}>Pending</option>
          <option value="complete" ${status === "complete" ? "selected" : ""}>Complete</option>
        </select>
        <span style="flex-shrink:0; width:1px; height:16px; background:var(--border);"></span>
        <div style="display:flex; gap:3px; flex-shrink:0;">
          <label class="secondary" style="cursor:pointer; font-size:10px; padding:2px 5px; border-radius:6px; background:var(--hover-bg); color:var(--text); white-space:nowrap;">
            📎 Attach
            <input type="file" class="roadmap-file-input" data-id="${escapeHtml(item.id)}" style="display:none;" />
          </label>
          <button class="secondary roadmap-edit-btn" data-id="${escapeHtml(item.id)}" style="font-size:10px; padding:2px 5px; white-space:nowrap;">Edit</button>
          <button class="secondary roadmap-duplicate-btn" data-id="${escapeHtml(item.id)}" style="font-size:10px; padding:2px 5px; white-space:nowrap;" title="Duplicate to another location">⧉ Duplicate</button>
          <button class="secondary roadmap-delete-btn" data-id="${escapeHtml(item.id)}" style="font-size:10px; padding:2px 5px; white-space:nowrap;">Delete</button>
        </div>`
            : `<span class="tag">${escapeHtml(ROADMAP_STATUS_LABELS[status] || status)}</span>`
        }
      </div>
    </div>
  `;
}

// Mirrors hydrateAttachmentDocs above, just pointed at each roadmap item's
// own `attachments` array instead of a ticket's `allDocAttachments`.
async function hydrateRoadmapAttachments(items) {
  if (!storage) return;
  for (const item of items) {
    const atts = item.attachments;
    if (!atts || !atts.length) continue;
    const container = listEl.querySelector(`.roadmap-attachments[data-key="${CSS.escape(item.id)}"]`);
    if (!container) continue;
    const entries = await Promise.all(
      atts.map(async (a) => ({ url: await resolveAttachmentUrl(a.path), name: a.name, path: a.path }))
    );
    container.innerHTML = entries
      .filter((e) => e.url)
      .map((e) => {
        // The markup editor only knows how to load an image or a PDF's
        // first page - anything else (docx, etc.) gets no edit button,
        // matching the Timeline tiles. This was the only entry point
        // missing an edit affordance at all: Timeline needs a parseable
        // "Deployment: ..." line to show an item, so a photo attached to
        // an item without one had no way back into the editor before.
        const isImage = isImageFileName(e.name);
        const isPdf = isPdfFileName(e.name);
        // Deliberately a different class from the Timeline tiles' pencil
        // button (.roadmap-attach-edit-btn), which is absolutely positioned
        // to sit on a thumbnail's corner - reusing it here would pull in
        // that positioning and misplace the button inside a plain text tag.
        const editBtn =
          canEdit() && (isImage || isPdf)
            ? `<button class="roadmap-list-attach-edit-btn" data-item-id="${escapeHtml(item.id)}" data-path="${escapeHtml(e.path)}" data-name="${escapeHtml(e.name)}" data-kind="${isImage ? "image" : "pdf"}" title="Edit" style="border:none; background:transparent; color:var(--accent-blue); cursor:pointer; font-size:9px; line-height:1; padding:0;">✏️</button>`
            : "";
        const removeBtn = canEdit()
          ? `<button class="roadmap-remove-attachment-btn" data-item-id="${escapeHtml(item.id)}" data-path="${escapeHtml(e.path)}" title="Remove attachment" style="border:none; background:transparent; color:var(--text); cursor:pointer; font-size:9px; line-height:1; padding:0;">✕</button>`
          : "";
        return `<span class="roadmap-attachment-tag">
          <a href="${e.url}" target="_blank" style="color:inherit; text-decoration:none;">📎 ${escapeHtml(e.name)}</a>
          ${editBtn}
          ${removeBtn}
        </span>`;
      })
      .join("");
  }
}

const MAX_ROADMAP_UPLOAD_BYTES = 6 * 1024 * 1024;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function uploadRoadmapFile(itemId, file) {
  if (file.size > MAX_ROADMAP_UPLOAD_BYTES) {
    alert("That file is too large (max 6 MB).");
    return;
  }
  try {
    const base64Data = await readFileAsBase64(file);
    await addRoadmapAttachmentFn({
      itemId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      base64Data,
    });
  } catch (err) {
    console.error(err);
    alert("Could not upload file: " + err.message);
  }
}

// Populates the "New roadmap item" field's location suggestions from the
// same shared Cubework address catalog as the Email Request tool and the
// Duplicate flow (see locations.js) - mirrors the Email Request Location
// field's pattern (email-request.html's populateLocationOptions): the
// datalist starts empty, so nothing pops up just from focusing/clicking the
// field, and only fills in a handful of filtered matches once the user
// actually starts typing. It's cleared again once the value exactly matches
// a location, which is what makes the popup close right after a pick
// instead of continuing to show a now-irrelevant single suggestion. The
// field still accepts freely typed, non-address titles same as before - a
// datalist only adds suggestions, it never forces a choice from the list.
const ROADMAP_TITLE_MAX_LOCATION_SUGGESTIONS = 8;
function populateRoadmapTitleLocationOptions(query) {
  if (!roadmapTitleLocationOptionsEl) return;
  roadmapTitleLocationOptionsEl.innerHTML = "";
  if (!query) return; // stay empty until the user types something

  const locations = Array.isArray(window.CUBEWORK_LOCATIONS) ? window.CUBEWORK_LOCATIONS : [];
  const isExactMatch = locations.some((loc) => loc.label.toLowerCase() === query.toLowerCase());
  if (isExactMatch) return;

  const q = query.toLowerCase();
  locations
    .filter((loc) => loc.label.toLowerCase().includes(q))
    .slice(0, ROADMAP_TITLE_MAX_LOCATION_SUGGESTIONS)
    .forEach((loc) => {
      const o = document.createElement("option");
      o.value = loc.label;
      roadmapTitleLocationOptionsEl.appendChild(o);
    });
}
// Once the typed/selected text exactly matches a known location, prefill the
// separate State field from that address's state code (reusing
// roadmapStateFromLocationLabel() below - the same parse the Duplicate flow
// already relies on), the same way picking a location there also prefills
// State. Tracks the last value *this* function set (roadmapStateAutoFilledValue)
// so switching between locations keeps updating State to match, right up
// until the moment someone types something into State that doesn't match
// what was auto-filled - at that point it's a manual edit and gets left
// alone, even if the title changes again afterward.
let roadmapStateAutoFilledValue = null;
function autofillRoadmapStateFromTitle(query) {
  if (!roadmapStateInput) return;
  const current = roadmapStateInput.value.trim();
  if (current && current !== roadmapStateAutoFilledValue) return; // manually edited - leave it alone

  const locations = Array.isArray(window.CUBEWORK_LOCATIONS) ? window.CUBEWORK_LOCATIONS : [];
  const matched = locations.find((loc) => loc.label.toLowerCase() === query.toLowerCase());
  const state = matched ? roadmapStateFromLocationLabel(matched.label) : "";
  if (!state) return; // nothing to derive - don't blank out a manual value just because the title no longer matches

  roadmapStateInput.value = state;
  roadmapStateAutoFilledValue = state;
}

roadmapTitleInput?.addEventListener("input", () => {
  const query = roadmapTitleInput.value.trim();
  populateRoadmapTitleLocationOptions(query);
  autofillRoadmapStateFromTitle(query);
});

// If "New roadmap item" was picked from that location list above (an exact
// match against window.CUBEWORK_LOCATIONS, not just freely typed text),
// only the street number/name + city portion becomes the item's title -
// e.g. "218 Machlin Ct, Walnut, CA 91789" -> "218 Machlin Ct, Walnut". The
// state/zip aren't dropped from the app, just not duplicated into the
// title - the separate State field, Notes, and everything else about
// adding an item are untouched by this.
const ROADMAP_TITLE_STATE_ZIP_RE = /,\s*[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/;
function roadmapTitleFromLocationLabel(label) {
  return String(label || "").trim().replace(ROADMAP_TITLE_STATE_ZIP_RE, "").trim();
}

async function submitRoadmapItem() {
  let title = roadmapTitleInput.value.trim();
  if (!title) {
    // Silently doing nothing here was confusing - a click on Add with an
    // empty title field should visibly tell you why nothing happened
    // instead of just sitting there.
    roadmapTitleInput.focus();
    roadmapTitleInput.style.borderColor = "var(--danger-light)";
    setTimeout(() => {
      roadmapTitleInput.style.borderColor = "var(--border)";
    }, 1200);
    return;
  }
  const roadmapLocations = Array.isArray(window.CUBEWORK_LOCATIONS) ? window.CUBEWORK_LOCATIONS : [];
  const matchedLocation = roadmapLocations.find((loc) => loc.label.toLowerCase() === title.toLowerCase());
  if (matchedLocation) title = roadmapTitleFromLocationLabel(matchedLocation.label);
  const notes = roadmapNotesInput?.value.trim() || "";
  const state = roadmapStateInput?.value.trim() || "";
  roadmapAddBtn.disabled = true;
  try {
    await addRoadmapItemFn({ title, notes, state });
    roadmapTitleInput.value = "";
    if (roadmapNotesInput) roadmapNotesInput.value = "";
    if (roadmapStateInput) roadmapStateInput.value = "";
    roadmapStateAutoFilledValue = null;
  } catch (err) {
    console.error(err);
    alert("Could not add item: " + err.message);
  } finally {
    roadmapAddBtn.disabled = false;
  }
}

roadmapAddBtn?.addEventListener("click", submitRoadmapItem);
roadmapTitleInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitRoadmapItem();
});

// --- Roadmap export --------------------------------------------------
// List view exports whatever's currently on screen (respecting the active
// tab/search/state filter) as an Excel workbook via SheetJS. Timeline view
// instead snapshots the rendered Gantt chart with html2canvas and lets the
// user pick PDF (via jsPDF) or a plain PNG. All three libraries are loaded
// from cdnjs in index.html - each export bails out with a clear message
// instead of throwing if a library failed to load (e.g. offline).
// Matches the same "Deployment: Mon d – Mon d, yyyy" line parseDeploymentRange
// looks for, so it can be pulled out of the free-text Notes column into its
// own Deployment Start/End columns for export instead of being buried in a
// paragraph of notes.
const DEPLOYMENT_LINE_RE = /^.*Deployment:\s*[A-Za-z]{3,9}\s+\d{1,2}\s*[–—-]\s*(?:[A-Za-z]{3,9}\s+)?\d{1,2},\s*\d{4}.*$/m;

function notesForExport(notes) {
  if (!notes) return "";
  return notes
    .replace(DEPLOYMENT_LINE_RE, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Prefers the dollar figure straight off whichever line already says
// "Total" (e.g. "- Total – $13,749") - if someone typed a total, that's
// authoritative and nothing gets computed. Only when there's no such line
// does this fall back to adding up every other dollar figure in the notes
// (e.g. itemized costs like "Camera: $500" / "Labor: $200"), so a total
// shows up automatically without anyone having to type one - a "-"
// immediately in front of the dollar sign (e.g. "Discount: -$50",
// "Refund: -$25") subtracts instead of adding, so credits/discounts bring
// the total down rather than inflating it. A bullet dash followed by a
// space ("- Camera: $500") doesn't count as a minus sign here - only one
// stuck directly to the "$" does. Returned as a number (not a string) so
// Excel treats the column as numeric.
const MARKUP_AMOUNT_RE = /-?\$[\d,]+(?:\.\d{1,2})?/;
const MARKUP_AMOUNT_RE_G = /-?\$[\d,]+(?:\.\d{1,2})?/g;

function totalAmountFromNotes(notes) {
  if (!notes) return "";
  const lines = notes.split("\n") || [];
  const totalLine = lines.find((l) => /total/i.test(l));
  if (totalLine) {
    const m = totalLine.match(MARKUP_AMOUNT_RE);
    if (m) return parseFloat(m[0].replace(/[$,]/g, ""));
  }
  const amounts = lines
    .filter((l) => !/total/i.test(l))
    .flatMap((l) => l.match(MARKUP_AMOUNT_RE_G) || [])
    .map((s) => parseFloat(s.replace(/[$,]/g, "")));
  if (!amounts.length) return "";
  return amounts.reduce((sum, n) => sum + n, 0);
}

// Column catalog for the List-view Excel export - the column-picker modal
// renders one checkbox per entry here (in this order), and the export
// itself always emits columns in this same canonical order regardless of
// checkbox click order, so the sheet layout stays predictable.
// Cost Breakdown and Notes are deliberately not columns here - they each get
// their own dedicated worksheet (see buildRoadmapBreakdownSheet /
// buildRoadmapNotesSheet below), so repeating them on the main Roadmap sheet
// too would just be duplicate, cramped reading.
const ROADMAP_EXPORT_COLUMNS = [
  { key: "title", label: "Title", wch: 28 },
  { key: "state", label: "State", wch: 6 },
  { key: "status", label: "Status", wch: 10 },
  { key: "deploymentStart", label: "Deploy Start", wch: 14 },
  { key: "deploymentEnd", label: "Deploy End", wch: 14 },
  { key: "totalAmount", label: "Total Amount", wch: 14 },
  { key: "resolution", label: "Resolution", wch: 30 },
  { key: "pendingReason", label: "Pending Reason", wch: 30 },
  { key: "created", label: "Created", wch: 12 },
];
const ROADMAP_EXPORT_FIELD_VALUES = {
  title: (item) => item.title || "",
  state: (item) => roadmapStateCode(item) || "",
  status: (item) => ROADMAP_STATUS_LABELS[effectiveRoadmapStatus(item)] || effectiveRoadmapStatus(item),
  deploymentStart: (item, deployment) => (deployment ? deployment.start.toLocaleDateString() : ""),
  deploymentEnd: (item, deployment) => (deployment ? deployment.end.toLocaleDateString() : ""),
  totalAmount: (item) => roadmapItemTotal(item),
  resolution: (item) => item.resolution || "",
  pendingReason: (item) => item.pendingReason || "",
  created: (item) => (item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : ""),
};
// Remembered across exports within the session so re-opening the picker
// keeps whatever the user chose last time instead of resetting to "all".
let roadmapExportColumnSelection = new Set(ROADMAP_EXPORT_COLUMNS.map((c) => c.key));
let pendingRoadmapExportItems = [];

// Builds the second worksheet in the export: the same vendor-grouped
// equipment rollup as the in-app "View breakdown" panel (reuses
// roadmapEquipmentBreakdown so the two can never disagree), laid out as
// UNIFI / AMAZON / HOME DEPOT / LTS sections each with their own item
// list. The "Relative cost" column is a plain bar made of repeated block
// characters scaled to the most expensive item on the sheet - not a real
// embedded Excel chart, since the free build of SheetJS this app uses
// can't write chart objects (or even cell styles - see the row-height
// comment on the main sheet below), so this is the closest "chart-like"
// visual achievable within that limit. Section headers and column widths
// (via !merges/!cols, both plain worksheet properties, not styles) still
// go a long way toward making a plain-number sheet easier to scan.
function buildRoadmapBreakdownSheet(items) {
  const breakdown = roadmapEquipmentBreakdown(items);
  const maxCost = breakdown.reduce((m, row) => Math.max(m, row.cost), 0);
  const barFor = (cost) => {
    if (!maxCost || cost <= 0) return "";
    return "█".repeat(Math.max(1, Math.round((cost / maxCost) * 24)));
  };

  const aoa = [["Cost Breakdown by Vendor"], []];
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  let grandTotal = 0;

  ROADMAP_VENDORS.forEach(({ key, label }) => {
    const rows = breakdown.filter((row) => row.vendor === key);
    if (!rows.length) return;
    const vendorTotal = rows.reduce((sum, row) => sum + row.cost, 0);
    merges.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: 3 } });
    aoa.push([`${label.toUpperCase()}  ·  ${formatCurrency(vendorTotal)}`]);
    aoa.push(["Item", "Qty", "Cost", "Relative cost"]);
    rows.forEach((row) => {
      aoa.push([row.desc, row.qty, row.cost, barFor(row.cost)]);
      grandTotal += row.cost;
    });
    aoa.push([`${label} subtotal`, "", vendorTotal, ""]);
    aoa.push([]);
  });

  if (!breakdown.length) {
    aoa.push(["No Cost Breakdown items on these locations yet."]);
  } else {
    aoa.push(["GRAND TOTAL", "", grandTotal, ""]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 28 }];
  ws["!merges"] = merges;
  return ws;
}

// Third worksheet in the export: one section per location that actually has
// Notes (empty ones are skipped so the sheet stays a quick read instead of a
// wall of blank headers), in the same soonest-Deploy-start-first order as the
// main sheet. Each section gets a merged "location header" row (title + state,
// prefixed with a plain-unicode emoji since this build can't bold/color a
// cell - an emoji is just a character, so it's the one bit of visual "pop"
// available without real cell styles), a Deploy-range line under it, the
// notes text itself, and a dotted divider. Row heights are set explicitly
// (same !rows technique as the Cost Breakdown/Roadmap sheets) so multi-line
// notes aren't clipped to one visible line.
function buildRoadmapNotesSheet(items) {
  const sections = items
    .map((item) => ({ item, deployment: roadmapDeploymentRange(item), notes: notesForExport(item.notes) }))
    .filter((s) => s.notes)
    .sort((a, b) => (a.deployment?.start?.getTime() ?? Infinity) - (b.deployment?.start?.getTime() ?? Infinity));

  const WIDE = 78;
  const THICK = "▬".repeat(WIDE);
  const THIN = "─".repeat(WIDE);
  const aoa = [];
  const merges = [];
  const rowHeights = [];

  // Merged (full-width, banner-style) row.
  const pushWide = (text, hpt) => {
    merges.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: 1 } });
    aoa.push([text, ""]);
    rowHeights.push({ hpt });
  };
  // Two-cell (label | value) row - left unmerged from the right so Excel's
  // own gridlines draw a plain key/value table, since this build can't add
  // real cell borders/fills to fake one.
  const pushKV = (label, value, hpt) => {
    aoa.push([label, value]);
    rowHeights.push({ hpt });
  };
  const pushBlank = (hpt = 8) => {
    aoa.push([]);
    rowHeights.push({ hpt });
  };

  pushWide("📓  NOTES BY LOCATION", 24);
  pushWide(THICK, 8);
  pushBlank();

  sections.forEach(({ item, deployment, notes }, i) => {
    const num = String(i + 1).padStart(2, "0");
    const stateCode = roadmapStateCode(item);
    pushWide(`📍  ${num} · ${item.title || "(untitled)"}${stateCode ? `  ·  ${stateCode}` : ""}`, 20);
    pushKV("Deploy", deployment ? `📅  ${formatDeployRangeLabel(deployment)}` : "—", 15);

    const lines = notes.split("\n");
    pushKV("Notes", lines[0], 15);
    lines.slice(1).forEach((line) => pushKV("", line, 15));

    pushBlank(6);
    pushWide(THIN, 8);
    pushBlank();
  });

  if (!sections.length) {
    pushWide("No notes on these locations yet.", 15);
  } else {
    pushWide(`${sections.length} location${sections.length === 1 ? "" : "s"} with notes`, 14);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 14 }, { wch: 70 }];
  ws["!merges"] = merges;
  ws["!rows"] = rowHeights;
  return ws;
}

// Every List export gets today's date plus a "V1.0" version suffix that
// bumps (V1.1, V1.2, ...) each additional time someone exports on the same
// calendar day, so re-running an export minutes later never silently
// overwrites the previous file - the counter itself lives in localStorage
// keyed by date, so it naturally resets back to V1.0 the next day.
function nextRoadmapExportFileTag() {
  // dateToInputValue (not toISOString, which converts through UTC and can
  // land on the wrong calendar day depending on timezone/time-of-day) so
  // the version counter resets on the exporter's own local midnight.
  const dateStr = dateToInputValue(new Date());
  const storageKey = "roadmapExportCount_" + dateStr;
  const count = parseInt(localStorage.getItem(storageKey) || "0", 10) + 1;
  localStorage.setItem(storageKey, String(count));
  return { dateStr, version: `V1.${count - 1}` };
}

async function exportRoadmapListToExcel(items, selectedKeys) {
  await ensureXLSX();
  const columns = ROADMAP_EXPORT_COLUMNS.filter((c) => !selectedKeys || selectedKeys.has(c.key));
  if (!columns.length) {
    alert("Pick at least one column to export.");
    return;
  }
  const rows = items
    .map((item) => ({ item, deployment: roadmapDeploymentRange(item) }))
    // Items without a Deploy start date set sort to the bottom instead of
    // the top, so the dated rows read top-to-bottom in order.
    .sort((a, b) => (a.deployment?.start?.getTime() ?? Infinity) - (b.deployment?.start?.getTime() ?? Infinity))
    .map(({ item, deployment }) => {
      const row = {};
      columns.forEach((c) => {
        row[c.label] = ROADMAP_EXPORT_FIELD_VALUES[c.key](item, deployment);
      });
      return row;
    });
  // Grand Total row at the bottom of the sheet, mirroring the same
  // equipment-count + cost figure shown on the in-app Grand Total bar (see
  // updateRoadmapGrandTotalBar) so the exported number always matches what's
  // on screen. Lands in the Total Amount column when that column is part of
  // the export; otherwise the whole figure (count + $) is folded into a
  // single label cell so it's never silently dropped.
  if (rows.length) {
    const grandAmount = items.reduce((sum, it) => {
      const t = roadmapItemTotal(it);
      return sum + (typeof t === "number" ? t : 0);
    }, 0);
    const equipmentCount = roadmapEquipmentBreakdown(items).reduce((sum, row) => sum + row.qty, 0);
    const totalAmountCol = columns.find((c) => c.key === "totalAmount");
    const labelCol = columns.find((c) => c.key !== "totalAmount") || columns[0];
    const labelText = `GRAND TOTAL  ·  ${equipmentCount} equipment`;
    const totalsRow = {};
    columns.forEach((c) => {
      totalsRow[c.label] = "";
    });
    if (totalAmountCol && labelCol !== totalAmountCol) {
      totalsRow[labelCol.label] = labelText;
      totalsRow[totalAmountCol.label] = grandAmount;
    } else if (totalAmountCol) {
      totalsRow[totalAmountCol.label] = `${labelText}  ·  ${formatCurrency(grandAmount)}`;
    } else {
      totalsRow[labelCol.label] = `${labelText}  ·  ${formatCurrency(grandAmount)}`;
    }
    rows.push(totalsRow);
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = columns.map((c) => ({ wch: c.wch }));
  // The free build of SheetJS can't write cell styles, so "Wrap Text"
  // can't be turned on programmatically - and without it, Excel leaves
  // every row at single-line height by default, which visually clips any
  // cell whose value contains real line breaks (Notes, Resolution, Pending
  // Reason) down to just the first line even though the rest of the text is
  // still there in the underlying cell. Setting an explicit row height
  // instead is a plain worksheet property (not a style), so it survives
  // this build - size each row tall enough for its tallest multi-line
  // value so every line is actually visible without the user having to
  // manually resize rows or enable wrap text themselves.
  const headerRow = { hpt: 18 };
  const dataRows = rows.map((row) => {
    const maxLines = Math.max(1, ...Object.values(row).map((v) => (typeof v === "string" ? v.split("\n").length : 1)));
    return { hpt: maxLines * 15 };
  });
  ws["!rows"] = [headerRow, ...dataRows];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Roadmap");
  XLSX.utils.book_append_sheet(wb, buildRoadmapBreakdownSheet(items), "Cost Breakdown");
  XLSX.utils.book_append_sheet(wb, buildRoadmapNotesSheet(items), "Notes");
  const { dateStr, version } = nextRoadmapExportFileTag();
  XLSX.writeFile(wb, `CW_Roadmap_${dateStr}_Huy_Nguyen_${version}.xlsx`);
}

function renderExportColumnList() {
  if (!exportColumnListEl) return;
  exportColumnListEl.innerHTML = ROADMAP_EXPORT_COLUMNS.map(
    (c) => `
    <label>
      <input type="checkbox" class="export-column-checkbox" value="${c.key}" ${roadmapExportColumnSelection.has(c.key) ? "checked" : ""} />
      ${escapeHtml(c.label)}
    </label>`
  ).join("");
}

function openExportColumnModal(items) {
  pendingRoadmapExportItems = items;
  renderExportColumnList();
  if (exportColumnModalEl) exportColumnModalEl.style.display = "flex";
}

function closeExportColumnModal() {
  if (exportColumnModalEl) exportColumnModalEl.style.display = "none";
}

exportColumnCancelBtn?.addEventListener("click", closeExportColumnModal);

exportColumnConfirmBtn?.addEventListener("click", async () => {
  const checked = exportColumnListEl?.querySelectorAll(".export-column-checkbox:checked") || [];
  const chosen = new Set(Array.from(checked).map((cb) => cb.value));
  if (!chosen.size) {
    alert("Pick at least one column to export.");
    return;
  }
  roadmapExportColumnSelection = chosen;
  try {
    await exportRoadmapListToExcel(pendingRoadmapExportItems, roadmapExportColumnSelection);
    closeExportColumnModal();
  } catch (err) {
    console.error(err);
    alert("Could not export to Excel: " + err.message);
  }
});

// "Duplicate" on a Roadmap card - reuses the source item's Cost breakdown
// and notes, but always prompts for a location (from the same catalog as
// the Email Request tool - see locations.js) and a new Deploy start date,
// since duplicating almost always means "roll this same equipment out to
// another site on a different schedule," not literally cloning in place.
let duplicateRoadmapSourceItem = null;

// Best-effort state-code parse out of a full street address label like
// "218 Machlin Ct, Walnut, CA 91789" -> "CA". Only used to prefill the new
// item's State field so it shows up in the state filter dropdown right
// away; if a label doesn't end in ", ST[ zip]" (e.g. "PH Facility") this
// just comes back empty and the field is left blank rather than guessed.
function roadmapStateFromLocationLabel(label) {
  const m = String(label || "").trim().match(/,\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  return m ? m[1].toUpperCase() : "";
}

function populateDuplicateRoadmapLocationOptions() {
  if (!duplicateRoadmapLocationOptionsEl) return;
  const locations = Array.isArray(window.CUBEWORK_LOCATIONS) ? window.CUBEWORK_LOCATIONS : [];
  duplicateRoadmapLocationOptionsEl.innerHTML = locations
    .map((loc) => `<option value="${escapeHtml(loc.label)}"></option>`)
    .join("");
}

function openDuplicateRoadmapModal(item) {
  duplicateRoadmapSourceItem = item;
  populateDuplicateRoadmapLocationOptions();
  if (duplicateRoadmapLocationInput) duplicateRoadmapLocationInput.value = "";
  // Prefill with the source item's own Deploy start as a starting point -
  // rolling the same equipment out to a new site around the same time is
  // the common case, and it's easy to change if the new site's schedule
  // differs.
  if (duplicateRoadmapDateInput) duplicateRoadmapDateInput.value = item.deploymentStart || "";
  if (duplicateRoadmapModalEl) duplicateRoadmapModalEl.style.display = "flex";
  setTimeout(() => duplicateRoadmapLocationInput?.focus(), 0);
}

function closeDuplicateRoadmapModal() {
  if (duplicateRoadmapModalEl) duplicateRoadmapModalEl.style.display = "none";
  duplicateRoadmapSourceItem = null;
}

duplicateRoadmapCancelBtn?.addEventListener("click", closeDuplicateRoadmapModal);
duplicateRoadmapModalEl?.addEventListener("click", (e) => {
  if (e.target === duplicateRoadmapModalEl) closeDuplicateRoadmapModal();
});

duplicateRoadmapConfirmBtn?.addEventListener("click", async () => {
  const item = duplicateRoadmapSourceItem;
  if (!item) return;
  const location = duplicateRoadmapLocationInput?.value.trim() || "";
  if (!location) {
    duplicateRoadmapLocationInput?.focus();
    if (duplicateRoadmapLocationInput) duplicateRoadmapLocationInput.style.borderColor = "var(--danger-light)";
    setTimeout(() => {
      if (duplicateRoadmapLocationInput) duplicateRoadmapLocationInput.style.borderColor = "var(--border)";
    }, 1200);
    return;
  }
  const deployStartValue = duplicateRoadmapDateInput?.value || "";
  // Keep the same deployment *length* as the source item (e.g. a 5-day
  // rollout stays a 5-day rollout at the new site) instead of collapsing
  // to a single day just because only a start date was re-entered here.
  const durationDays = item.deploymentStart
    ? roadmapDeployDurationDays(item.deploymentStart, item.deploymentEnd || item.deploymentStart)
    : 1;
  const deploymentStart = deployStartValue;
  const deploymentEnd = deployStartValue ? roadmapDeployEndFromDuration(deployStartValue, durationDays) : "";
  const state = roadmapStateFromLocationLabel(location);

  duplicateRoadmapConfirmBtn.disabled = true;
  duplicateRoadmapConfirmBtn.textContent = "Duplicating…";
  try {
    const result = await addRoadmapItemFn({ title: location, notes: item.notes || "", state });
    const newId = result?.data?.id;
    // addRoadmapItem only takes title/notes/state - Cost breakdown rows and
    // structured Deploy dates are set via the same updateRoadmapItem call
    // the Edit form itself uses, right after the new doc exists.
    if (newId) {
      await updateRoadmapItemFn({
        itemId: newId,
        title: location,
        notes: item.notes || "",
        state,
        lineItems: item.lineItems || [],
        deploymentStart,
        deploymentEnd,
      });
    }
    closeDuplicateRoadmapModal();
  } catch (err) {
    console.error(err);
    alert("Could not duplicate: " + err.message);
  } finally {
    duplicateRoadmapConfirmBtn.disabled = false;
    duplicateRoadmapConfirmBtn.textContent = "Duplicate";
  }
});

async function exportRoadmapTimelineToFile(format) {
  await ensureHtml2Canvas();
  const canvas = await html2canvas(roadmapTimelineEl, { backgroundColor: "#ffffff", scale: 2 });
  const fileBase = `CW_Roadmap_${new Date().getFullYear()}_Huy_Nguyen`;

  if (format === "pdf") {
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [canvas.width, canvas.height],
    });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`${fileBase}.pdf`);
    return;
  }

  // PNG only: the raw Gantt capture has title text on the left and date
  // labels on the right sitting flush against the image edge (no margin in
  // the on-screen layout itself), so it reads as clipped even though nothing
  // is actually cut off. Re-drawing onto a slightly larger canvas with a
  // solid margin and a border frame fixes that without touching the live
  // on-screen Timeline layout - PDF is left as-is since only PNG was flagged.
  await new Promise((resolve) => {
    const PAD = 48;
    const BORDER = 6;
    const framed = document.createElement("canvas");
    framed.width = canvas.width + (PAD + BORDER) * 2;
    framed.height = canvas.height + (PAD + BORDER) * 2;
    const ctx = framed.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, framed.width, framed.height);
    ctx.strokeStyle = "#4c1d95";
    ctx.lineWidth = BORDER;
    ctx.strokeRect(BORDER / 2, BORDER / 2, framed.width - BORDER, framed.height - BORDER);
    ctx.drawImage(canvas, BORDER + PAD, BORDER + PAD);
    framed.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBase}.png`;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}

roadmapExportBtn?.addEventListener("click", async () => {
  if (currentRoadmapView !== "timeline") {
    // Checked cards (from any tab, see selectedRoadmapItemIds) win over the
    // current view when present; otherwise export whatever's on screen now.
    const itemsToExport =
      selectedRoadmapItemIds.size > 0
        ? allRoadmapItems.filter((it) => selectedRoadmapItemIds.has(it.id))
        : lastRenderedRoadmapItems;
    if (!itemsToExport.length) {
      alert("Nothing to export yet.");
      return;
    }
    openExportColumnModal(itemsToExport);
    return;
  }

  if (!lastRenderedRoadmapItems.length) {
    alert("Nothing to export yet.");
    return;
  }
  if (exportFormatModalEl) exportFormatModalEl.style.display = "flex";
});

async function runTimelineExport(format) {
  if (exportFormatModalEl) exportFormatModalEl.style.display = "none";
  roadmapExportBtn.disabled = true;
  const originalLabel = roadmapExportBtn.textContent;
  roadmapExportBtn.textContent = "Exporting…";
  try {
    await exportRoadmapTimelineToFile(format);
  } catch (err) {
    console.error(err);
    alert("Could not export timeline: " + err.message);
  } finally {
    roadmapExportBtn.disabled = false;
    roadmapExportBtn.textContent = originalLabel;
  }
}

// Three explicit choices instead of overloading a confirm() dialog's
// OK/Cancel (which used to mean "PDF"/"PNG" - so there was no way to
// actually back out of the export once you'd clicked the button).
exportFormatPdfBtn?.addEventListener("click", () => runTimelineExport("pdf"));
exportFormatPngBtn?.addEventListener("click", () => runTimelineExport("png"));
exportFormatCancelBtn?.addEventListener("click", () => {
  if (exportFormatModalEl) exportFormatModalEl.style.display = "none";
});

roadmapClearSelectionBtn?.addEventListener("click", () => {
  selectedRoadmapItemIds.clear();
  updateRoadmapSelectionUI();
  render();
});

// --- Compare mode ----------------------------------------------------------
// Reuses the same checkbox selection Export/Grand Total already use - tick
// 2+ cards, hit Compare, get one column per location showing everything on
// the card (title/state/deploy dates/notes/full Cost Breakdown). Each Cost
// Breakdown row gets a copy icon so equipment can be pulled from one
// location straight into another instead of retyping it in that location's
// own edit form.

function roadmapCompareColumnHtml(item, color) {
  const range = roadmapDeploymentRange(item);
  const withIndex = (item.lineItems || []).map((li, i) => ({ ...li, _idx: i }));
  const byVendor = groupRoadmapLineItemsByVendor(withIndex);
  const total = roadmapItemTotal(item);
  const stateCode = roadmapStateCode(item);
  return `
    <div class="roadmap-compare-column" data-item-id="${escapeHtml(item.id)}" style="border-top:4px solid ${color};">
      <div style="font-weight:700; font-size:14px; color:${color};">${escapeHtml(item.title || "(untitled)")}</div>
      ${stateCode ? `<span class="tag" style="align-self:flex-start; font-size:9px;">📍 ${escapeHtml(stateCode)}</span>` : ""}
      ${
        range
          ? `<div style="font-size:11px; font-weight:600; color:var(--info-text);">📅 ${escapeHtml(formatDeployRangeLabel(range))}</div>`
          : `<div style="font-size:11px; color:var(--text);">No deploy dates set</div>`
      }
      ${
        item.notes
          ? `<div style="font-size:12px; color:var(--text); white-space:pre-wrap; max-height:80px; overflow-y:auto; background:var(--surface-2); border-radius:6px; padding:6px 8px;">${escapeHtml(item.notes)}</div>`
          : ""
      }
      <div style="font-weight:700; font-size:12px; color:var(--success-text);">💰 Total: ${formatCurrency(total)}</div>
      ${ROADMAP_VENDORS.map(({ key, label }) => {
        const rows = byVendor[key];
        if (!rows.length) return "";
        return `
          <div class="roadmap-compare-vendor-label">${escapeHtml(label)}</div>
          ${rows
            .map((li) => {
              const qty = Number.isFinite(li.qty) ? li.qty : 1;
              const unitAmount = Number.isFinite(li.amount) ? li.amount : 0;
              const desc = li.desc || "Item";
              return `
                <div class="roadmap-compare-item-row" data-item-id="${escapeHtml(item.id)}" data-li-index="${li._idx}" data-unit-amount="${unitAmount}">
                  <span class="rci-desc" title="${escapeHtml(desc)}">${escapeHtml(desc)}</span>
                  ${
                    canEdit()
                      ? `<input type="number" class="roadmap-compare-qty-input" min="0" step="1" value="${qty}" title="Quantity" />`
                      : `<span class="rci-qty">×${qty}</span>`
                  }
                  <span class="rci-amt">${formatCurrency(roadmapLineItemLineTotal(li))}</span>
                  ${
                    canEdit()
                      ? `<button type="button" class="roadmap-compare-copy-btn" title="Copy to another location">⧉</button>
                         <button type="button" class="roadmap-compare-remove-btn" title="Remove this item">✕</button>`
                      : ""
                  }
                </div>`;
            })
            .join("")}
        `;
      }).join("")}
      ${!withIndex.length ? `<div style="font-size:12px; color:var(--text);">No Cost Breakdown items yet.</div>` : ""}
    </div>
  `;
}

function renderRoadmapCompareColumns() {
  if (!roadmapCompareColumnsEl) return;
  // Rebuilding replaces every column's markup wholesale, which would
  // otherwise snap the horizontal scroll (across locations) and each
  // column's own vertical scroll back to their start - most noticeable
  // right after clicking a copy icon partway down a column, since that's
  // exactly when this re-render fires. Capture and restore both.
  const scrollLeft = roadmapCompareColumnsEl.scrollLeft;
  const columnScrollTops = {};
  roadmapCompareColumnsEl.querySelectorAll(".roadmap-compare-column").forEach((col) => {
    columnScrollTops[col.dataset.itemId] = col.scrollTop;
  });

  const items = roadmapCompareItemIds.map((id) => allRoadmapItems.find((it) => it.id === id)).filter(Boolean);
  roadmapCompareColumnsEl.innerHTML = items
    .map((item, i) => roadmapCompareColumnHtml(item, TIMELINE_PALETTE[i % TIMELINE_PALETTE.length]))
    .join("");

  roadmapCompareColumnsEl.scrollLeft = scrollLeft;
  roadmapCompareColumnsEl.querySelectorAll(".roadmap-compare-column").forEach((col) => {
    const saved = columnScrollTops[col.dataset.itemId];
    if (saved) col.scrollTop = saved;
  });
}

function openRoadmapCompare() {
  roadmapCompareItemIds = Array.from(selectedRoadmapItemIds);
  if (roadmapCompareItemIds.length < 2) return;
  renderRoadmapCompareColumns();
  roadmapCompareModalEl?.classList.add("visible");
}

function closeRoadmapCompare() {
  roadmapCompareModalEl?.classList.remove("visible");
}

roadmapCompareBtn?.addEventListener("click", openRoadmapCompare);
roadmapCompareCloseBtn?.addEventListener("click", closeRoadmapCompare);
roadmapCompareModalEl?.addEventListener("click", (e) => {
  if (e.target === roadmapCompareModalEl) closeRoadmapCompare();
});

// Shared by copy/remove/qty-edit below - all three just compute a new
// lineItems array for one item and need the same save/patch/re-render
// dance. feedbackEl can be a button (its label gets swapped to "…" and
// back) or a qty <input> (left showing whatever the user typed, just
// disabled mid-save and reverted to revertText only if the save fails).
function saveRoadmapCompareLineItems(targetItemId, targetLineItems, feedbackEl, revertText, actionLabel) {
  const target = allRoadmapItems.find((it) => it.id === targetItemId);
  if (!target) return;

  const isInput = feedbackEl?.tagName === "INPUT";
  if (feedbackEl) {
    feedbackEl.disabled = true;
    if (!isInput) feedbackEl.textContent = "…";
  }

  updateRoadmapItemFn({
    itemId: targetItemId,
    title: target.title || "",
    notes: target.notes || "",
    state: target.state || "",
    lineItems: targetLineItems,
    deploymentStart: target.deploymentStart || "",
    deploymentEnd: target.deploymentEnd || "",
  })
    .then(() => {
      const idx = allRoadmapItems.findIndex((it) => it.id === targetItemId);
      if (idx !== -1) allRoadmapItems[idx] = { ...allRoadmapItems[idx], lineItems: targetLineItems };
      // Rebuilding the compare columns (and the main list behind the modal)
      // destroys whichever icon was just clicked - losing focus like that
      // makes the browser jump the whole page back to the top. Pin the
      // scroll position across both re-renders so Compare stays put.
      const scrollY = window.scrollY;
      renderRoadmapCompareColumns();
      render();
      window.scrollTo(0, scrollY);
    })
    .catch((err) => {
      console.error(err);
      alert(`Could not ${actionLabel}: ` + err.message);
      if (feedbackEl?.isConnected) {
        feedbackEl.disabled = false;
        if (isInput) feedbackEl.value = revertText;
        else feedbackEl.textContent = revertText;
      }
    });
}

// Copies one Cost Breakdown row from sourceItemId's lineItems[liIndex] into
// targetItemId. Merges into an existing row with the same description+
// vendor in the target (adding the quantities) rather than creating a
// duplicate-looking line, since "copy this item over" almost always means
// "this location needs it too", not "list it twice."
function copyRoadmapLineItemAcross(sourceItemId, liIndex, targetItemId, feedbackEl) {
  const source = allRoadmapItems.find((it) => it.id === sourceItemId);
  const target = allRoadmapItems.find((it) => it.id === targetItemId);
  const li = source?.lineItems?.[liIndex];
  if (!li || !target) return;

  const vendor = ROADMAP_VENDORS.some((v) => v.key === li.vendor) ? li.vendor : "unifi";
  const normalizedDesc = (li.desc || "").trim().toLowerCase();
  const targetLineItems = (target.lineItems || []).map((x) => ({ ...x }));
  const existing = targetLineItems.find((x) => {
    const xVendor = ROADMAP_VENDORS.some((v) => v.key === x.vendor) ? x.vendor : "unifi";
    return xVendor === vendor && (x.desc || "").trim().toLowerCase() === normalizedDesc;
  });
  const copiedQty = Number.isFinite(li.qty) ? li.qty : 1;
  if (existing) {
    existing.qty = (Number.isFinite(existing.qty) ? existing.qty : 1) + copiedQty;
  } else {
    targetLineItems.push({ desc: li.desc || "", qty: copiedQty, amount: Number.isFinite(li.amount) ? li.amount : 0, vendor });
  }

  saveRoadmapCompareLineItems(targetItemId, targetLineItems, feedbackEl, "⧉", "copy that item");
}

// Removes one Cost Breakdown row right from Compare mode - works the same
// whether that row was there all along or was only just copied in from
// another location a moment ago, since there's nothing distinguishing the
// two once the copy has landed.
function removeRoadmapCompareLineItem(itemId, liIndex, feedbackEl) {
  const item = allRoadmapItems.find((it) => it.id === itemId);
  if (!item?.lineItems?.[liIndex]) return;
  const newLineItems = item.lineItems.filter((_, i) => i !== liIndex);
  saveRoadmapCompareLineItems(itemId, newLineItems, feedbackEl, "✕", "remove that item");
}

// Commits a new Qty typed into a Compare row's qty input (fires on
// change - blur or Enter - not on every keystroke, so it isn't saving
// mid-type). A blank/zero/negative entry falls back to 1 rather than
// silently dropping the row.
function updateRoadmapCompareQty(itemId, liIndex, newQtyRaw, feedbackEl) {
  const item = allRoadmapItems.find((it) => it.id === itemId);
  const li = item?.lineItems?.[liIndex];
  if (!li) return;
  const newQty = Number.isFinite(newQtyRaw) && newQtyRaw > 0 ? newQtyRaw : 1;
  const previousQty = Number.isFinite(li.qty) ? li.qty : 1;
  if (newQty === previousQty) return; // nothing actually changed - skip a no-op save
  const newLineItems = item.lineItems.map((x, i) => (i === liIndex ? { ...x, qty: newQty } : x));
  saveRoadmapCompareLineItems(itemId, newLineItems, feedbackEl, String(previousQty), "update that item's quantity");
}

// Recomputes just the displayed line total as someone types a new Qty,
// ahead of the actual save on change/blur - same instant-feedback feel as
// the Cost Breakdown editor's own live total.
roadmapCompareColumnsEl?.addEventListener("input", (e) => {
  const qtyInput = e.target.closest(".roadmap-compare-qty-input");
  if (!qtyInput) return;
  const row = qtyInput.closest(".roadmap-compare-item-row");
  const amtEl = row?.querySelector(".rci-amt");
  if (!amtEl) return;
  const unitAmount = parseFloat(row.dataset.unitAmount) || 0;
  const qty = parseFloat(qtyInput.value);
  amtEl.textContent = formatCurrency((Number.isFinite(qty) ? qty : 0) * unitAmount);
});

roadmapCompareColumnsEl?.addEventListener("change", (e) => {
  const qtyInput = e.target.closest(".roadmap-compare-qty-input");
  if (!qtyInput) return;
  const row = qtyInput.closest(".roadmap-compare-item-row");
  const itemId = row?.dataset.itemId;
  const liIndex = Number(row?.dataset.liIndex);
  if (itemId && Number.isFinite(liIndex)) {
    updateRoadmapCompareQty(itemId, liIndex, parseFloat(qtyInput.value), qtyInput);
  }
});

roadmapCompareColumnsEl?.addEventListener("click", (e) => {
  const menuBtn = e.target.closest(".roadmap-compare-copy-menu button");
  if (menuBtn) {
    const menu = menuBtn.closest(".roadmap-compare-copy-menu");
    const sourceItemId = menu?.dataset.sourceItemId;
    const liIndex = Number(menu?.dataset.liIndex);
    const targetItemId = menuBtn.dataset.targetId;
    menu?.remove();
    if (sourceItemId && targetItemId && Number.isFinite(liIndex)) {
      copyRoadmapLineItemAcross(sourceItemId, liIndex, targetItemId);
    }
    return;
  }

  const removeBtn = e.target.closest(".roadmap-compare-remove-btn");
  if (removeBtn) {
    const row = removeBtn.closest(".roadmap-compare-item-row");
    const itemId = row?.dataset.itemId;
    const liIndex = Number(row?.dataset.liIndex);
    if (itemId && Number.isFinite(liIndex)) {
      removeRoadmapCompareLineItem(itemId, liIndex, removeBtn);
    }
    return;
  }

  const copyBtn = e.target.closest(".roadmap-compare-copy-btn");
  if (copyBtn) {
    roadmapCompareColumnsEl.querySelectorAll(".roadmap-compare-copy-menu").forEach((m) => m.remove());
    const row = copyBtn.closest(".roadmap-compare-item-row");
    const sourceItemId = row?.dataset.itemId;
    const liIndex = Number(row?.dataset.liIndex);
    const others = roadmapCompareItemIds.filter((id) => id !== sourceItemId);
    if (!sourceItemId || !Number.isFinite(liIndex) || !others.length) return;
    if (others.length === 1) {
      copyRoadmapLineItemAcross(sourceItemId, liIndex, others[0], copyBtn);
      return;
    }
    // 3+ locations compared at once - ambiguous which one to copy into, so
    // show a small target picker under the clicked icon instead of guessing.
    const menu = document.createElement("div");
    menu.className = "roadmap-compare-copy-menu";
    menu.dataset.sourceItemId = sourceItemId;
    menu.dataset.liIndex = String(liIndex);
    menu.innerHTML = others
      .map((id) => {
        const target = allRoadmapItems.find((it) => it.id === id);
        return `<button type="button" data-target-id="${escapeHtml(id)}">${escapeHtml(target?.title || "(untitled)")}</button>`;
      })
      .join("");
    copyBtn.appendChild(menu);
    return;
  }
});

// Closes an open target-picker menu when clicking anywhere else, not just
// when another copy icon is clicked.
document.addEventListener("click", (e) => {
  if (e.target.closest(".roadmap-compare-copy-btn")) return;
  roadmapCompareColumnsEl?.querySelectorAll(".roadmap-compare-copy-menu").forEach((m) => m.remove());
});

listEl.addEventListener("click", (e) => {
  const editBtn = e.target.closest(".roadmap-edit-btn");
  if (editBtn) {
    editingRoadmapItemIds.add(editBtn.dataset.id);
    render();
    return;
  }

  const duplicateBtn = e.target.closest(".roadmap-duplicate-btn");
  if (duplicateBtn) {
    const item = allRoadmapItems.find((it) => it.id === duplicateBtn.dataset.id);
    if (item) openDuplicateRoadmapModal(item);
    return;
  }

  const cancelEditBtn = e.target.closest(".roadmap-cancel-edit-btn");
  if (cancelEditBtn) {
    editingRoadmapItemIds.delete(cancelEditBtn.dataset.id);
    render();
    return;
  }

  const saveEditBtn = e.target.closest(".roadmap-save-edit-btn");
  if (saveEditBtn) {
    const id = saveEditBtn.dataset.id;
    const card = saveEditBtn.closest(".card");
    const title = card?.querySelector(".roadmap-edit-title")?.value.trim();
    const notes = card?.querySelector(".roadmap-edit-notes")?.value.trim() || "";
    const state = card?.querySelector(".roadmap-edit-state")?.value.trim() || "";
    const deploymentStart = card?.querySelector(".roadmap-edit-deploy-start")?.value || "";
    // Stored the same way as before (a plain end date), just derived from
    // the Duration field instead of a second calendar picker.
    const deploymentEnd = deploymentStart
      ? roadmapDeployEndFromDuration(deploymentStart, parseInt(card?.querySelector(".roadmap-edit-deploy-duration")?.value, 10))
      : "";
    if (!title) {
      alert("Title can't be empty.");
      return;
    }
    const lineItems = Array.from(card?.querySelectorAll(".roadmap-lineitem-row") || [])
      .map((row) => ({
        desc: row.querySelector(".roadmap-lineitem-desc")?.value.trim() || "",
        qty: parseFloat(row.querySelector(".roadmap-lineitem-qty")?.value),
        amount: parseFloat(row.querySelector(".roadmap-lineitem-amount")?.value),
        vendor: row.dataset.vendor || "unifi",
      }))
      .filter((li) => li.desc || Number.isFinite(li.amount))
      .map((li) => ({
        desc: li.desc,
        qty: Number.isFinite(li.qty) ? li.qty : 1,
        amount: Number.isFinite(li.amount) ? li.amount : 0,
        vendor: li.vendor,
      }));
    updateRoadmapItemFn({ itemId: id, title, notes, state, lineItems, deploymentStart, deploymentEnd })
      .then(() => {
        editingRoadmapItemIds.delete(id);
        // Patch the local copy immediately instead of waiting on the next
        // Firestore snapshot to come back down - the callable resolving
        // only means the write landed server-side, the onSnapshot listener
        // picking it back up is a separate round trip that can lag behind
        // by a beat. Without this, the card could flash back to its
        // pre-save Qty/Amount/Total right after clicking Save, making it
        // look like the edit "didn't take" even though it did.
        const idx = allRoadmapItems.findIndex((it) => it.id === id);
        if (idx !== -1) {
          const normalizedState = state.trim() ? state.trim().toUpperCase().slice(0, 2) : null;
          allRoadmapItems[idx] = {
            ...allRoadmapItems[idx],
            title,
            notes: notes || null,
            state: normalizedState,
            lineItems,
            deploymentStart: deploymentStart || null,
            deploymentEnd: deploymentEnd || null,
          };
        }
        render();
      })
      .catch((err) => {
        console.error(err);
        alert("Could not save: " + err.message);
      });
    return;
  }

  const saveResolutionBtn = e.target.closest(".roadmap-resolution-save-btn");
  if (saveResolutionBtn) {
    const id = saveResolutionBtn.dataset.id;
    const card = saveResolutionBtn.closest(".card");
    const resolution = card?.querySelector(".roadmap-resolution-input")?.value.trim() || "";
    saveResolutionBtn.disabled = true;
    saveResolutionBtn.textContent = "Saving…";
    setRoadmapItemResolutionFn({ itemId: id, resolution })
      .then(() => {
        saveResolutionBtn.textContent = "Saved ✓";
        setTimeout(() => {
          saveResolutionBtn.textContent = "Save resolution";
          saveResolutionBtn.disabled = false;
        }, 1200);
      })
      .catch((err) => {
        console.error(err);
        alert("Could not save resolution: " + err.message);
        saveResolutionBtn.textContent = "Save resolution";
        saveResolutionBtn.disabled = false;
      });
    return;
  }

  const savePendingReasonBtn = e.target.closest(".roadmap-pending-save-btn");
  if (savePendingReasonBtn) {
    const id = savePendingReasonBtn.dataset.id;
    const card = savePendingReasonBtn.closest(".card");
    const pendingReason = card?.querySelector(".roadmap-pending-input")?.value.trim() || "";
    savePendingReasonBtn.disabled = true;
    savePendingReasonBtn.textContent = "Saving…";
    setRoadmapItemPendingReasonFn({ itemId: id, pendingReason })
      .then(() => {
        savePendingReasonBtn.textContent = "Saved ✓";
        setTimeout(() => {
          savePendingReasonBtn.textContent = "Save reason";
          savePendingReasonBtn.disabled = false;
        }, 1200);
      })
      .catch((err) => {
        console.error(err);
        alert("Could not save pending reason: " + err.message);
        savePendingReasonBtn.textContent = "Save reason";
        savePendingReasonBtn.disabled = false;
      });
    return;
  }

  const deleteBtn = e.target.closest(".roadmap-delete-btn");
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    if (confirm("Delete this roadmap item?")) {
      editingRoadmapItemIds.delete(id);
      deleteRoadmapItemFn({ itemId: id }).catch((err) => {
        console.error(err);
        alert("Could not delete: " + err.message);
      });
    }
    return;
  }

  const addLineItemBtn = e.target.closest(".roadmap-lineitem-add-btn");
  if (addLineItemBtn) {
    const vendor = addLineItemBtn.dataset.vendor || "unifi";
    const wrap = addLineItemBtn.closest(".roadmap-lineitems-wrap");
    const rowsContainer = addLineItemBtn.closest(".roadmap-vendor-section")?.querySelector(".roadmap-lineitems-rows");
    if (rowsContainer) {
      rowsContainer.insertAdjacentHTML("beforeend", roadmapLineItemRowHtml({ desc: "", amount: "" }, vendor));
      rowsContainer.lastElementChild?.querySelector(".roadmap-lineitem-desc")?.focus();
      refreshRoadmapLineItemMoveButtons(rowsContainer);
    }
    if (wrap) recomputeRoadmapLineItemsTotal(wrap);
    return;
  }

  const removeLineItemBtn = e.target.closest(".roadmap-lineitem-remove-btn");
  if (removeLineItemBtn) {
    const wrap = removeLineItemBtn.closest(".roadmap-lineitems-wrap");
    const row = removeLineItemBtn.closest(".roadmap-lineitem-row");
    const rowsContainer = removeLineItemBtn.closest(".roadmap-vendor-section")?.querySelector(".roadmap-lineitems-rows");
    // Keep at least one (blank) row visible per vendor section rather than
    // collapsing it to nothing - saving with all rows blank just clears
    // that vendor's lineItems.
    if (rowsContainer && rowsContainer.children.length <= 1) {
      row?.querySelectorAll("input").forEach((inp) => (inp.value = ""));
    } else {
      row?.remove();
    }
    if (wrap) recomputeRoadmapLineItemsTotal(wrap);
    if (rowsContainer) refreshRoadmapLineItemMoveButtons(rowsContainer);
    return;
  }

  const linkBtn = e.target.closest(".roadmap-lineitem-link-btn");
  if (linkBtn) {
    const linkRow = linkBtn.closest(".roadmap-lineitem-row")?.querySelector(".roadmap-lineitem-link-row");
    if (linkRow) {
      const showing = linkRow.style.display !== "none";
      linkRow.style.display = showing ? "none" : "flex";
      if (!showing) linkRow.querySelector(".roadmap-lineitem-link-input")?.focus();
    }
    return;
  }

  const linkFetchBtn = e.target.closest(".roadmap-lineitem-link-fetch-btn");
  if (linkFetchBtn) {
    fetchRoadmapLineItemLinkPrice(linkFetchBtn.closest(".roadmap-lineitem-row"));
    return;
  }

  const suggestItem = e.target.closest(".roadmap-lineitem-suggest-item");
  if (suggestItem) {
    const box = suggestItem.closest(".roadmap-lineitem-suggest");
    const product = box?._matches?.[Number(suggestItem.dataset.index)];
    const row = box?.closest(".roadmap-lineitem-row");
    closeRoadmapLineItemSuggestions();
    if (!product || !row) return;
    const descInput = row.querySelector(".roadmap-lineitem-desc");
    const qtyInput = row.querySelector(".roadmap-lineitem-qty");
    const amountInput = row.querySelector(".roadmap-lineitem-amount");
    if (descInput) descInput.value = product.n;
    if (qtyInput && !qtyInput.value) qtyInput.value = "1";
    const wrap = row.closest(".roadmap-lineitems-wrap");

    // Custom (team-typed) entries have no store.ui.com page to fetch - just
    // fill in whatever amount was last saved for that description.
    if (!product.u) {
      if (amountInput) amountInput.value = product.amount;
      if (wrap) recomputeRoadmapLineItemsTotal(wrap);
      return;
    }

    if (amountInput) {
      amountInput.value = "";
      amountInput.placeholder = "Fetching…";
      amountInput.disabled = true;
    }
    fetchUnifiPriceFn({ url: UNIFI_STORE_BASE + product.u, sku: product.s })
      .then((res) => {
        const price = res?.data?.price;
        if (amountInput && typeof price === "number") amountInput.value = price;
      })
      .catch((err) => {
        console.error(err);
        alert("Could not fetch the live price from the UniFi store: " + err.message);
      })
      .finally(() => {
        if (amountInput) {
          amountInput.disabled = false;
          amountInput.placeholder = "0.00";
        }
        if (wrap) recomputeRoadmapLineItemsTotal(wrap);
      });
    return;
  }

  const attachEditBtn = e.target.closest(".roadmap-list-attach-edit-btn");
  if (attachEditBtn) {
    openMarkupEditor({
      itemId: attachEditBtn.dataset.itemId,
      path: attachEditBtn.dataset.path,
      name: attachEditBtn.dataset.name,
      kind: attachEditBtn.dataset.kind,
    });
    return;
  }

  const removeAttachmentBtn = e.target.closest(".roadmap-remove-attachment-btn");
  if (removeAttachmentBtn) {
    const itemId = removeAttachmentBtn.dataset.itemId;
    const path = removeAttachmentBtn.dataset.path;
    if (confirm("Remove this attachment?")) {
      removeAttachmentBtn.disabled = true;
      removeRoadmapAttachmentFn({ itemId, path }).catch((err) => {
        console.error(err);
        alert("Could not remove attachment: " + err.message);
        removeAttachmentBtn.disabled = false;
      });
    }
    return;
  }

});

// Tracks the single currently-open UniFi product suggestion dropdown so a
// new one (or a blur) always cleans up the last one instead of stacking.
let roadmapLineItemSuggestBox = null;

function closeRoadmapLineItemSuggestions() {
  roadmapLineItemSuggestBox?.remove();
  roadmapLineItemSuggestBox = null;
}

function renderRoadmapLineItemSuggestions(descInput, matches) {
  closeRoadmapLineItemSuggestions();
  if (!matches.length) return;
  const row = descInput.closest(".roadmap-lineitem-row");
  if (!row) return;
  const box = document.createElement("div");
  box.className = "roadmap-lineitem-suggest";
  box.innerHTML = matches
    .map(
      (p, i) => `
      <div class="roadmap-lineitem-suggest-item" data-index="${i}" style="padding:5px 8px; font-size:12px; cursor:pointer; display:flex; justify-content:space-between; gap:8px; white-space:nowrap;">
        <span style="overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.n)}</span>
        <span style="color:var(--text); font-size:10px; flex-shrink:0;">${p.u ? escapeHtml(p.s) : formatCurrency(p.amount) + " saved"}</span>
      </div>`
    )
    .join("");
  // Positioned relative to the row (set position:relative in CSS) so it
  // drops down right under the description field the user is typing in.
  box.style.cssText =
    "position:absolute; top:100%; left:0; z-index:20; width:min(260px, 90vw); max-height:180px; overflow-y:auto; background:var(--surface); border:1px solid var(--border);background:var(--input-bg);color:var(--text); border-radius:8px; box-shadow:0 4px 10px rgba(15,23,42,0.15); margin-top:2px;";
  row.appendChild(box);
  box._matches = matches;
  roadmapLineItemSuggestBox = box;
}

// Live total recompute as someone types an amount - fires on every
// keystroke (not just blur/change) so the "auto add or subtract" total
// updates immediately while editing, before Save is ever clicked. Also
// drives the UniFi product autocomplete dropdown as someone types a
// description - matching happens instantly against the local catalog, no
// network call until a suggestion is actually clicked.
// Recomputes the "Ends ..." label live as either field changes - the same
// instant-feedback feel as a Turo/flight date picker, just built on plain
// date+number inputs instead of a custom calendar widget.
function updateRoadmapDeployEndLabel(card) {
  if (!card) return;
  const startInput = card.querySelector(".roadmap-edit-deploy-start");
  const durationInput = card.querySelector(".roadmap-edit-deploy-duration");
  const labelEl = card.querySelector(".roadmap-edit-deploy-end-label");
  if (!startInput || !durationInput || !labelEl) return;
  const startValue = startInput.value;
  if (!startValue) {
    labelEl.textContent = "";
    return;
  }
  const duration = parseInt(durationInput.value, 10);
  const endDate = inputValueToDate(roadmapDeployEndFromDuration(startValue, duration));
  labelEl.textContent = endDate ? `Ends ${endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "";
}

listEl.addEventListener("input", (e) => {
  const deployInput = e.target.closest(".roadmap-edit-deploy-start, .roadmap-edit-deploy-duration");
  if (deployInput) {
    updateRoadmapDeployEndLabel(deployInput.closest(".card"));
    return;
  }
  const descInput = e.target.closest(".roadmap-lineitem-desc");
  if (descInput) {
    const vendor = descInput.closest(".roadmap-lineitem-row")?.dataset.vendor || "unifi";
    renderRoadmapLineItemSuggestions(descInput, productMatches(descInput.value, vendor));
    return;
  }
  const changedInput = e.target.closest(".roadmap-lineitem-amount, .roadmap-lineitem-qty");
  if (!changedInput) return;
  const wrap = changedInput.closest(".roadmap-lineitems-wrap");
  if (wrap) recomputeRoadmapLineItemsTotal(wrap);
});

// Enter inside the "paste a link" field fetches the price the same as
// clicking the Fetch button, without needing to reach for the mouse.
listEl.addEventListener("keydown", (e) => {
  if (!e.target.closest(".roadmap-lineitem-link-input") || e.key !== "Enter") return;
  e.preventDefault();
  fetchRoadmapLineItemLinkPrice(e.target.closest(".roadmap-lineitem-row"));
});

// Backs the Amazon/Home Depot "paste a product link" flow: no curated
// catalog to click a suggestion from, so instead this takes whatever URL
// was pasted into the row's link field and asks fetchProductPrice (see
// functions/index.js) to scrape the current price off that exact page.
function fetchRoadmapLineItemLinkPrice(row) {
  if (!row) return;
  const vendor = row.dataset.vendor || "unifi";
  const linkInput = row.querySelector(".roadmap-lineitem-link-input");
  const url = linkInput?.value.trim();
  if (!url) {
    linkInput?.focus();
    return;
  }
  const amountInput = row.querySelector(".roadmap-lineitem-amount");
  const fetchBtn = row.querySelector(".roadmap-lineitem-link-fetch-btn");
  const wrap = row.closest(".roadmap-lineitems-wrap");
  if (fetchBtn) {
    fetchBtn.disabled = true;
    fetchBtn.textContent = "Fetching…";
  }
  fetchProductPriceFn({ url, vendor })
    .then((res) => {
      const price = res?.data?.price;
      if (typeof price !== "number") return;
      if (amountInput) amountInput.value = price;
      const linkRow = row.querySelector(".roadmap-lineitem-link-row");
      if (linkRow) linkRow.style.display = "none";
      if (wrap) recomputeRoadmapLineItemsTotal(wrap);
    })
    .catch((err) => {
      console.error(err);
      alert(
        "Could not fetch a price from that link: " +
          err.message +
          " (some sites block automated requests - you can always type the price in manually instead)."
      );
    })
    .finally(() => {
      if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.textContent = "Fetch price";
      }
    });
}

// Delayed so a click on a suggestion (which blurs the description input
// first) still has time to register before the dropdown disappears out
// from under it.
listEl.addEventListener(
  "focusout",
  (e) => {
    if (!e.target.closest(".roadmap-lineitem-desc")) return;
    setTimeout(closeRoadmapLineItemSuggestions, 150);
  },
  true
);

// Reordering Cost Breakdown rows: tried free dragging twice (pointer-move
// swap, then a detached-row + FLIP-animated version) and it still read as
// flickery with real-world pointer movement/speed. Trading that for
// something guaranteed-smooth instead: plain ▲/▼ buttons that move a row
// exactly one slot per click - no continuous tracking, so there's nothing
// left to jitter.
function refreshRoadmapLineItemMoveButtons(rowsContainer) {
  const rows = rowsContainer.querySelectorAll(".roadmap-lineitem-row");
  rows.forEach((row, i) => {
    const upBtn = row.querySelector(".roadmap-lineitem-move-up");
    const downBtn = row.querySelector(".roadmap-lineitem-move-down");
    if (upBtn) upBtn.disabled = i === 0;
    if (downBtn) downBtn.disabled = i === rows.length - 1;
  });
}

listEl.addEventListener("click", (e) => {
  const moveUpBtn = e.target.closest(".roadmap-lineitem-move-up");
  if (moveUpBtn) {
    const row = moveUpBtn.closest(".roadmap-lineitem-row");
    const prev = row?.previousElementSibling;
    if (row && prev) {
      row.parentNode.insertBefore(row, prev);
      refreshRoadmapLineItemMoveButtons(row.parentNode);
    }
    return;
  }
  const moveDownBtn = e.target.closest(".roadmap-lineitem-move-down");
  if (moveDownBtn) {
    const row = moveDownBtn.closest(".roadmap-lineitem-row");
    const next = row?.nextElementSibling;
    if (row && next) {
      row.parentNode.insertBefore(row, next.nextSibling);
      refreshRoadmapLineItemMoveButtons(row.parentNode);
    }
    return;
  }
});

listEl.addEventListener("change", (e) => {
  const selectCheckbox = e.target.closest(".roadmap-select-checkbox");
  if (selectCheckbox) {
    if (selectCheckbox.checked) selectedRoadmapItemIds.add(selectCheckbox.dataset.id);
    else selectedRoadmapItemIds.delete(selectCheckbox.dataset.id);
    updateRoadmapSelectionUI();
    return;
  }

  const statusSelect = e.target.closest(".roadmap-status-select");
  if (statusSelect) {
    const id = statusSelect.dataset.id;
    const status = statusSelect.value;
    const previous = allRoadmapItems.find((it) => it.id === id);
    setRoadmapItemStatusFn({ itemId: id, status }).catch((err) => {
      console.error(err);
      alert("Could not update status: " + err.message);
      if (previous) statusSelect.value = effectiveRoadmapStatus(previous);
    });
    return;
  }

  const fileInput = e.target.closest(".roadmap-file-input");
  if (fileInput) {
    const file = fileInput.files[0];
    const id = fileInput.dataset.id;
    fileInput.value = "";
    if (file) uploadRoadmapFile(id, file);
    return;
  }

});

// ============================================================================
// Issue tab (2026-08-05)
// ============================================================================
// Manually-logged facilities/IT issues, entered by hand from the dashboard -
// same "own Firestore collection, live per-item edits" shape as Project
// Roadmap (not Standup/Daily To-Do's in-memory-until-Save model), minus
// Roadmap's lineItems/cost/deployment-date/attachment tracking. Split into
// two region tabs (Cali / Outside Cali, set once at creation from whichever
// tab is active) with an Active/Pending/Complete status filter mirroring
// Roadmap's own Planning/Active/Pending/Complete tabs, including the same
// Resolution/"Why pending" box pattern. Inherits: Roadmap's
// selection-checkbox-for-export mechanic (.issue-select-checkbox, same
// "shopping cart" persistence across tab/search changes as
// selectedRoadmapItemIds), the shared Location field (locationInputHtml/
// populateLocationDatalist above - same address catalog as Standup/Daily
// To-Do/Roadmap), and Standup's tag set (issueAllTags() above, STANDUP_TAGS
// + the shared tag catalog also used by Standup/Daily To-Do). Export mirrors
// Roadmap's richest option (Excel + PDF + PNG), not Standup/Daily To-Do's
// Excel-only export.

// Defaults to "new" (2026-08-05 follow-up) so the Issue tab lands on the
// create-issue form first, matching the "active" class moved onto the New
// button in index.html's #issueRegionTabs markup.
let currentIssueRegion = "new";
let currentIssueStatusFilter = "active";
let lastRenderedIssueItems = [];
const selectedIssueItemIds = new Set();
const editingIssueItemIds = new Set();

// Which cards are showing their full details (Ticket/Description/
// attachments/Resolution-or-Pending box) rather than just the collapsed
// summary row - persists across re-renders the same way
// editingIssueItemIds/selectedIssueItemIds do (2026-08-09 row-list rework,
// see docs/issue-tab.md).
const expandedIssueItemIds = new Set();

// Items saved before this field existed (there shouldn't be any, since
// addIssueItem always writes "active", but mirrors effectiveRoadmapStatus's
// same defensive fallback) read as Active rather than crashing.
function effectiveIssueStatus(item) {
  return item.status || "active";
}

// ---- Issue tab data, read by Standup's Report step (2026-08-15, sixth pass) ----
// Standup's "2. Report" tab used to build its "Cali Issues"/"Outside Cali
// Issues" headings from today's own pulled checklist (standupBuildLocationBreakdown
// above, address-detection matched) - Huy asked for the *live* Report step to
// instead reflect the Issue tab's own Active issues per region, verbatim
// ("as is"), completely independent of the day's Standup pull. That old
// checklist-based breakdown, its "ask before adding to catalog" location-
// candidate prompts, and the Excel "Cali"/"Outside Cali" sheets are all left
// exactly as they were (still used by the Saved step's own past-day view) -
// this only changes what feeds those two specific headings on the *current*
// Report step and the emailed report (see standupGenerateReportBtn's and
// standupEmailOpenBtn's click handlers below).
//
// allIssueItems (above) is only kept live via a Firestore listener while the
// Issue tab itself is the open app (see subscribeToCurrentApp) - so a one-time
// fetch here is what makes this work even if Huy never visited the Issue tab
// this session. Falls back to whatever's already cached in allIssueItems
// (stale, but better than nothing) if the fetch itself fails.
async function fetchActiveIssueItemsFresh() {
  try {
    const snap = await getDocs(query(collection(db, "issueItems"), orderBy("createdAt", "desc"), limit(FETCH_LIMIT)));
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("Could not refresh Issue tab data for the Standup report:", err);
    return allIssueItems.slice();
  }
}

function activeIssueItemsForRegion(items, region) {
  return items.filter((it) => (it.region || "cali") === region && effectiveIssueStatus(it) === "active");
}

// "As is" per Huy's request - the issue's own Title + full Notes, unmodified
// (no AI summary, no requester-name prefix - those are standupItemDisplayText's
// own Standup-checklist-specific behavior, not appropriate for Issue tab items).
function issueItemAsIsText(item) {
  const title = item.title || "(untitled)";
  const notes = (item.notes || "").trim();
  return notes ? `${title} — ${notes}` : title;
}

// Groups a region's active issues by tag/topic (issueAllTags() - the same
// shared, already-alphabetical-by-label tag catalog Standup/Daily To-Do/Issue
// all draw from - see sharedAllTags()'s own comment), same grouping shape as
// buildStandupSummaryDetailSectionsHtml's per-tag breakdown above. Untagged
// items (or a tag key that's since been deleted from the catalog) land in a
// trailing "Other" bucket rather than being silently dropped.
function issueTagGroupsFor(items) {
  const allTags = issueAllTags();
  const groups = allTags
    .map((tag) => ({ label: tag.label, color: tag.color, items: items.filter((it) => it.tag === tag.key) }))
    .filter((g) => g.items.length);
  const taggedKeys = new Set(allTags.map((t) => t.key));
  const untagged = items.filter((it) => !taggedKeys.has(it.tag));
  if (untagged.length) groups.push({ label: "Other", color: "#6b7280", items: untagged });
  return groups;
}

// Plain-text version - what's shown in (and stays hand-editable in)
// #standupSummaryInput on the live Report step, same "Cali Issues"/"Outside
// Cali Issues" heading style standupBuildLocationBreakdown already used.
function buildIssueCaliIssuesIntroText(caliItems, outsideItems) {
  const renderRegion = (items) =>
    issueTagGroupsFor(items)
      .map((g) => `  ${g.label}:\n${g.items.map((it) => `  - ${issueItemAsIsText(it)}`).join("\n")}`)
      .join("\n");
  const section = (label, items) => (items.length ? `${label}:\n${renderRegion(items)}` : "");
  return [section("Cali Issues", caliItems), section("Outside Cali Issues", outsideItems)].filter(Boolean).join("\n\n");
}

// Colored HTML version - sent as the actual email body via Graph
// (sendStandupCaliIssuesEmailFn below), since a plain Outlook Web deeplink's
// body param can only carry plain text, no real color. Same per-tag color
// styling as buildStandupSummaryDetailSectionsHtml's cards above. Returns ""
// when there's nothing active in either region, so the caller can skip
// sending entirely instead of emailing a blank report.
//
// (2026-08-15, eighth pass) Typography pass per Huy's feedback on the
// preview: "Cali Issues"/"Outside Cali Issues" are now visibly the biggest/
// boldest text in the tree (18px/700), clearly a size step above the topic
// headers (14px/600) below them, which in turn sit above the entries
// themselves. Each entry's Title is now bolded (<strong>, still 13px, not
// bigger) so it reads as this bullet's own heading and stands apart from its
// Notes and from the next entry - previously issueItemAsIsText's plain
// "Title — Notes" string was dropped in as one unstyled run, so consecutive
// entries visually ran together. margin-bottom on each <li> went from 2px to
// 10px so there's real breathing room between the 1st/2nd/etc. entry, not
// just the old near-zero gap.
function buildCaliIssuesSectionsHtml(caliItems, outsideItems) {
  const entryHtml = (item) => {
    const title = escapeHtml(item.title || "(untitled)");
    const notes = (item.notes || "").trim();
    return notes ? `<strong>${title}</strong> — ${escapeHtml(notes)}` : `<strong>${title}</strong>`;
  };
  const renderRegionHtml = (label, items) => {
    if (!items.length) return "";
    const groupsHtml = issueTagGroupsFor(items)
      .map(
        (g) => `<div style="margin-top:14px;">
          <div style="font-weight:600; font-size:14px; color:${g.color};">${escapeHtml(g.label)}</div>
          <ul style="margin:6px 0 0; padding-left:18px; font-size:13px; color:var(--text);">
            ${g.items.map((it) => `<li style="margin-bottom:10px;">${entryHtml(it)}</li>`).join("")}
          </ul>
        </div>`
      )
      .join("");
    return `<div style="margin-top:20px;">
      <div style="font-weight:700; font-size:18px; color:var(--text);">${escapeHtml(label)}:</div>
      ${groupsHtml}
    </div>`;
  };
  return [renderRegionHtml("Cali Issues", caliItems), renderRegionHtml("Outside Cali Issues", outsideItems)]
    .filter(Boolean)
    .join("");
}

// (2026-08-15, ninth pass) "Today's Standup" email section - Huy asked to
// "add the dailies entries" to the Cali/Outside Cali email, then clarified
// (via the follow-up question) that this means reusing Kuan's existing
// colored per-tag breakdown - buildStandupSummaryDetailSectionsHtml, the same
// HTML already shown on screen in the "Summary for Kuan Goh" box - as its own
// section in the actual sent email, not a second copy of the daily Pull
// entries (Section 2 stays out of both the report and the email, per Huy's
// original instruction). Wrapped with the same 18px/700 heading style
// buildCaliIssuesSectionsHtml uses for "Cali Issues"/"Outside Cali Issues" so
// all three sections read as equal siblings in the email. Returns "" (and
// contributes nothing) when there's nothing included in today's checklist,
// same empty-means-omit convention as the Cali/Outside Cali sections.
function buildTodaysStandupSectionHtml(items = standupChecklistItems) {
  const detailHtml = buildStandupSummaryDetailSectionsHtml(items);
  if (!detailHtml) return "";
  return `<div style="margin-top:20px;">
    <div style="font-weight:700; font-size:18px; color:var(--text);">Today's Standup:</div>
    ${detailHtml}
  </div>`;
}

// (2026-08-15, ninth pass) Combines the Cali/Outside Cali Issues sections
// with the new Today's Standup section into the single HTML string that's
// both shown in the preview modal (innerHTML, verbatim) and POSTed as the
// email body - so what Huy reviews is guaranteed to match what's sent. Either
// half can independently be empty (no Active issues right now, or nothing
// included in today's checklist); the whole thing is "" only when BOTH are
// empty, which the caller uses as its "nothing to send" signal.
function buildStandupReportEmailHtml(caliItems, outsideItems, standupItems = standupChecklistItems) {
  const html = [buildCaliIssuesSectionsHtml(caliItems, outsideItems), buildTodaysStandupSectionHtml(standupItems)]
    .filter(Boolean)
    .join("");
  if (!html) return "";
  return `<div style="font-family:-apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color:var(--text); font-size:13px;">${html}</div>`;
}

issueRegionTabsEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  currentIssueRegion = btn.dataset.region;
  issueRegionTabsEl.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  renderIssueView();
});

issueStatusTabsEl?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  currentIssueStatusFilter = btn.dataset.status;
  issueStatusTabsEl.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  renderIssueView();
});

issueSearchInput?.addEventListener("input", () => renderIssueView());

// Tracks the last value populateIssueStateSelect()/autofillIssueStateFromLocation
// below set on issueStateSelect *themselves* (as opposed to a manual pick) -
// declared up front, before either of those first reads/writes it, since a
// `let` binding throws (not just reads undefined) if touched before its own
// declaration has run. This one bit the New tab's very first render: the
// crash inside populateIssueStateSelect() aborted the rest of this script's
// top-level setup, which included updateAppChrome()'s later listEl-hiding
// step for every subsequent tab switch - see CLAUDE.md's session log,
// 2026-08-05, for the full symptom (Roadmap's cards staying visible after
// switching to Issue).
let issueStateAutoFilledValue = null;

// Fills the "New" tab's State dropdown from US_STATES - run once at load,
// unlike populateIssueTagSelect below there's no runtime-growable catalog
// behind this, so it never needs to re-run. Defaults to California since
// that's this tab's more common region - issueStateAutoFilledValue is set to
// match so autofillIssueStateFromLocation below still treats this default as
// "nothing manually picked yet" (see that function's own comment).
function populateIssueStateSelect() {
  if (!issueStateSelect) return;
  // Option text is just the 2-letter code (2026-08-05 follow-up, "abbreviate
  // the state so the box can be smaller") - a <select> with no explicit width
  // sizes itself off its longest option's text, so swapping full names like
  // "Massachusetts" for codes shrinks the box on its own. Full name still
  // available as a hover tooltip via title="".
  issueStateSelect.innerHTML = US_STATES.map((s) => `<option value="${s.code}" title="${escapeHtml(s.name)}">${s.code}</option>`).join("");
  issueStateSelect.value = "CA";
  issueStateAutoFilledValue = "CA";
}
populateIssueStateSelect();

// Once the typed/selected Location text exactly matches a known location -
// built-in (window.CUBEWORK_LOCATIONS) or the runtime-growable
// standupLocationCatalog on top of it, the same combined
// STANDUP_LOCATION_INDEX every other location-aware tab already reads from
// (see docs/location-catalog.md) - prefill the State select from that
// address's own parsed state. Tracks the last value *this* function set
// (issueStateAutoFilledValue) so re-picking a different location keeps
// updating State to match, right up until State itself is changed by hand
// (a real user "change" event moves its value away from
// issueStateAutoFilledValue) - at that point it's a manual choice and gets
// left alone even if Location changes again afterward. Same
// "auto-fill-until-manually-overridden" reasoning as Roadmap's own
// autofillRoadmapStateFromTitle, just reading a select's .value instead of a
// free-text input's, and against the shared location index instead of
// re-parsing the label with its own regex.
function autofillIssueStateFromLocation(query) {
  if (!issueStateSelect) return;
  const current = issueStateSelect.value;
  if (current && current !== issueStateAutoFilledValue) return; // manually picked - leave it alone

  const match = STANDUP_LOCATION_INDEX.find((e) => e.label.toLowerCase() === query.toLowerCase());
  const state = match?.state && US_STATES.some((s) => s.code === match.state) ? match.state : "";
  if (!state) return; // nothing to derive - don't blank out a manual pick just because Location no longer matches

  issueStateSelect.value = state;
  issueStateAutoFilledValue = state;
}

// Fills the "New issue" form's tag select from issueAllTags() - same
// blank/"+ New tag..." shape as issueTagOptionsHtml/dailyTodoTagOptionsHtml.
// Re-run whenever the tag catalog changes (see subscribeToIssueTagCatalog)
// so a tag added from another device/session shows up here too.
function populateIssueTagSelect() {
  if (!issueTagSelect) return;
  const previous = issueTagSelect.value;
  issueTagSelect.innerHTML = issueTagOptionsHtml("");
  if (previous && previous !== "__new__" && Array.from(issueTagSelect.options).some((o) => o.value === previous)) {
    issueTagSelect.value = previous;
  }
}
populateIssueTagSelect();

issueTagSelect?.addEventListener("change", () => {
  if (issueTagSelect.value !== "__new__") return;
  const label = (prompt("New tag name:") || "").trim();
  if (!label) {
    populateIssueTagSelect(); // revert the select back to blank
    return;
  }
  // Reuse an existing *custom* tag whose label matches case-insensitively
  // instead of creating a duplicate - checked against issueSelectableTags()
  // (custom tags only), not issueAllTags(), since the fixed 8 aren't
  // pickable here anymore (see issueSelectableTags() above) - typing a new
  // tag name that happens to match one of those 8 labels (e.g. "Critical/
  // Urgent") creates a genuine new custom tag rather than silently trying to
  // resurrect the retired fixed one. addSharedTag enforces the dedupe
  // against the real custom catalog server-side too.
  const normalizedLabel = label.toLowerCase();
  const existingTag = issueSelectableTags().find((t) => t.label.trim().toLowerCase() === normalizedLabel);
  if (existingTag) {
    populateIssueTagSelect();
    issueTagSelect.value = existingTag.key;
    return;
  }
  const color = issueNextTagColor();
  addSharedTagFn({ label, color })
    .then((res) => {
      // Reflected locally right away, same as Daily To-Do's own "+ New
      // tag..." handler does, rather than waiting on the sharedTagCatalog
      // onSnapshot round-trip.
      if (!allSharedCustomTags.some((t) => t.id === res.data.id)) {
        allSharedCustomTags.push({ id: res.data.id, label, color });
      }
      populateIssueTagSelect();
      issueTagSelect.value = `custom:${res.data.id}`;
    })
    .catch((err) => {
      console.error(err);
      alert("Could not add tag: " + (err?.message || "Something went wrong."));
      populateIssueTagSelect();
    });
});

// Location suggestions for the "New issue" form's Location field - same
// shared catalog, same "empty until you type" pattern, as every other
// consumer (see populateLocationDatalist/locationInputHtml above). Also
// keeps the State select in sync with whatever Location currently resolves
// to (see autofillIssueStateFromLocation above) - runs on every keystroke,
// same as Roadmap's own title-driven autofill, since the function itself
// only actually changes anything once the text exactly matches a catalog
// entry.
issueLocationInput?.addEventListener("input", () => {
  const query = issueLocationInput.value.trim();
  populateLocationDatalist(issueLocationOptionsEl, query);
  autofillIssueStateFromLocation(query);
});

// ---- "New" tab voice capture via the browser's own Web Speech API --------
// Entirely client-side - transcription happens in the browser, nothing
// audio-related is ever sent anywhere. Chrome/Edge only (Firefox/Safari
// don't implement SpeechRecognition) - updateIssueMicAvailability disables
// the button and explains the manual-typing fallback for unsupported
// browsers instead of failing silently. Same "each SpeechRecognition
// instance is single-use and onend immediately starts a fresh one, so a
// stretch of silence doesn't look like recording silently stopped" shape as
// Daily To-Do's own mic (startDailyTodoRecognitionSession) - simpler here
// since there's just the one Description textarea to dictate into, not a
// growing list of timestamped entries.
const IssueSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let issueRecognition = null;
let issueRecording = false;
let issueStopRequested = false;

function updateIssueMicAvailability() {
  if (!issueMicBtn) return;
  if (!IssueSpeechRecognition) {
    issueMicBtn.disabled = true;
    issueMicBtn.textContent = "🎙️ Voice not supported in this browser";
    if (issueMicStatusEl) {
      issueMicStatusEl.textContent = "Try Chrome or Edge for voice logging, or type the description instead.";
    }
  }
}
updateIssueMicAvailability();

function resetIssueRecordingUi() {
  issueRecording = false;
  issueStopRequested = false;
  if (issueMicBtn) issueMicBtn.textContent = "🎙️ Start recording";
  if (issueMicStatusEl) issueMicStatusEl.textContent = "";
}

function stopIssueRecording() {
  issueStopRequested = true;
  if (issueRecognition) {
    try {
      issueRecognition.stop();
    } catch (err) {
      console.error(err);
      resetIssueRecordingUi();
    }
  } else {
    resetIssueRecordingUi();
  }
}

function startIssueRecognitionSession() {
  issueRecognition = new IssueSpeechRecognition();
  issueRecognition.continuous = true;
  issueRecognition.interimResults = false;
  issueRecognition.lang = "en-US";

  issueRecognition.onresult = (event) => {
    // Only the newly-finalized results in this event - each finalized phrase
    // is appended straight onto the Description textarea's existing value,
    // since (unlike Daily To-Do) there's only the one field to dictate into.
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        const text = result[0]?.transcript?.trim();
        if (text && issueNotesInput) {
          issueNotesInput.value = issueNotesInput.value ? `${issueNotesInput.value} ${text}` : text;
        }
      }
    }
  };

  issueRecognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    // Permission/hardware errors are unrecoverable - stop for real instead of
    // looping restart attempts forever. Everything else is left to onend
    // just below to auto-restart, since those fire immediately before onend
    // anyway.
    if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
      issueStopRequested = true;
      if (issueMicStatusEl) issueMicStatusEl.textContent = `Mic error: ${event.error}`;
    }
  };

  issueRecognition.onend = () => {
    if (issueStopRequested || !issueRecording) {
      resetIssueRecordingUi();
      return;
    }
    try {
      startIssueRecognitionSession();
    } catch (err) {
      console.error(err);
      resetIssueRecordingUi();
    }
  };

  issueRecognition.start();
}

issueMicBtn?.addEventListener("click", () => {
  if (!IssueSpeechRecognition) return;

  if (issueRecording) {
    stopIssueRecording();
    return;
  }

  issueRecording = true;
  issueStopRequested = false;
  try {
    startIssueRecognitionSession();
    if (issueMicBtn) issueMicBtn.textContent = "⏹️ Stop recording";
    if (issueMicStatusEl) issueMicStatusEl.textContent = "Listening…";
  } catch (err) {
    console.error(err);
    if (issueMicStatusEl) issueMicStatusEl.textContent = "Could not start the mic — check browser permissions.";
    resetIssueRecordingUi();
  }
});

// Just a "here's what you picked" text list under the file field - no
// thumbnails, since (unlike Roadmap's markup editor) nothing here reads the
// files back client-side before upload.
function renderIssueAttachmentsPreview() {
  if (!issueAttachmentsPreviewEl) return;
  const files = Array.from(issueAttachmentsInput?.files || []);
  issueAttachmentsPreviewEl.textContent = files.length
    ? `${files.length} file${files.length > 1 ? "s" : ""} selected: ${files.map((f) => f.name).join(", ")}`
    : "";
}
issueAttachmentsInput?.addEventListener("change", renderIssueAttachmentsPreview);

const MAX_ISSUE_UPLOAD_BYTES = 8 * 1024 * 1024;

// Mirrors uploadRoadmapFile above - reuses the same readFileAsBase64 helper
// (defined up near the Roadmap attachment code). Called once per selected
// file, after addIssueItem has already returned an itemId, since the
// Storage path (issueAttachments/{itemId}/...) can't exist before the item
// does - see addIssueAttachment in functions/index.js.
async function uploadIssueFile(itemId, file) {
  if (file.size > MAX_ISSUE_UPLOAD_BYTES) {
    alert(`"${file.name}" is too large (max 8 MB) - skipped.`);
    return;
  }
  try {
    const base64Data = await readFileAsBase64(file);
    await addIssueAttachmentFn({
      itemId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      base64Data,
    });
  } catch (err) {
    console.error(err);
    alert(`Could not upload "${file.name}": ` + err.message);
  }
}

async function submitIssueItem() {
  const title = issueTitleInput.value.trim();
  if (!title) {
    // Same "visibly flag the empty field instead of silently doing nothing"
    // treatment as Roadmap's own submitRoadmapItem.
    issueTitleInput.focus();
    issueTitleInput.style.borderColor = "var(--danger-light)";
    setTimeout(() => {
      issueTitleInput.style.borderColor = "var(--border)";
    }, 1200);
    return;
  }
  const ticket = issueTicketInput?.value.trim() || "";
  const location = issueLocationInput?.value.trim() || "";
  const notes = issueNotesInput?.value.trim() || "";
  const tagValue = issueTagSelect?.value || "";
  const tag = tagValue && tagValue !== "__new__" ? tagValue : null;
  // The state select (not a region tab) is what decides Cali vs Outside
  // Cali on the New tab - see issueRegionForState above.
  const state = issueStateSelect?.value || "CA";
  const region = issueRegionForState(state);
  const files = Array.from(issueAttachmentsInput?.files || []);
  issueAddBtn.disabled = true;
  issueAddBtn.textContent = "Adding…";
  try {
    const res = await addIssueItemFn({ title, ticket, location, region, state, tag, notes });
    const itemId = res?.data?.id;
    // Uploaded one at a time, only after the item itself exists - see
    // uploadIssueFile above for why.
    if (itemId && files.length) {
      for (const file of files) {
        await uploadIssueFile(itemId, file);
      }
    }
    issueTitleInput.value = "";
    if (issueTicketInput) issueTicketInput.value = "";
    if (issueLocationInput) issueLocationInput.value = "";
    if (issueNotesInput) issueNotesInput.value = "";
    if (issueAttachmentsInput) issueAttachmentsInput.value = "";
    renderIssueAttachmentsPreview();
    populateIssueTagSelect();
    // Reset State back to its own default so the next issue starts from a
    // clean "nothing manually picked yet" slate - same reasoning
    // populateIssueStateSelect's own initial call already has.
    if (issueStateSelect) issueStateSelect.value = "CA";
    issueStateAutoFilledValue = "CA";
    // Jump over to whichever region tab the new card actually landed in, so
    // "Add issue" visibly does something instead of leaving the person
    // staring at the same New form with no sign anything happened.
    currentIssueRegion = region;
    currentIssueStatusFilter = "active";
    issueRegionTabsEl?.querySelectorAll(".tab[data-region]").forEach((t) => t.classList.toggle("active", t.dataset.region === region));
    issueStatusTabsEl?.querySelectorAll(".tab[data-status]").forEach((t) => t.classList.toggle("active", t.dataset.status === "active"));
    renderIssueView();
  } catch (err) {
    console.error(err);
    alert("Could not add issue: " + err.message);
  } finally {
    issueAddBtn.disabled = false;
    issueAddBtn.textContent = "Add issue";
  }
}

issueAddBtn?.addEventListener("click", submitIssueItem);
issueTitleInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitIssueItem();
});

// Same "don't let an unrelated Firestore change silently wipe an
// in-progress edit" reasoning as Roadmap's captureRoadmapEditDraft/
// restoreRoadmapEditDraft, just for Issue's much simpler edit form (Title/
// Ticket/Location/Tag/Notes only - no lineItems/dates).
function captureIssueEditDraft(id) {
  const card = issueListEl?.querySelector(`.issue-edit-title[data-id="${CSS.escape(id)}"]`)?.closest(".card");
  if (!card) return null;
  return {
    title: card.querySelector(".issue-edit-title")?.value ?? "",
    ticket: card.querySelector(".issue-edit-ticket")?.value ?? "",
    location: card.querySelector(".issue-edit-location")?.value ?? "",
    tag: card.querySelector(".issue-edit-tag")?.value ?? "",
    notes: card.querySelector(".issue-edit-notes")?.value ?? "",
  };
}

function restoreIssueEditDraft(id, draft) {
  if (!draft) return;
  const card = issueListEl?.querySelector(`.issue-edit-title[data-id="${CSS.escape(id)}"]`)?.closest(".card");
  if (!card) return;
  const titleEl = card.querySelector(".issue-edit-title");
  const ticketEl = card.querySelector(".issue-edit-ticket");
  const locationEl = card.querySelector(".issue-edit-location");
  const tagEl = card.querySelector(".issue-edit-tag");
  const notesEl = card.querySelector(".issue-edit-notes");
  if (titleEl) titleEl.value = draft.title;
  if (ticketEl) ticketEl.value = draft.ticket;
  if (locationEl) locationEl.value = draft.location;
  if (tagEl && Array.from(tagEl.options).some((o) => o.value === draft.tag)) tagEl.value = draft.tag;
  if (notesEl) notesEl.value = draft.notes;
}

function renderIssueItemCard(item) {
  const status = effectiveIssueStatus(item);
  const tagInfo = issueAllTags().find((t) => t.key === item.tag);

  if (editingIssueItemIds.has(item.id)) {
    return `
      <div class="card issue-card-editing">
        <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
          <input type="text" class="issue-edit-title" data-id="${escapeHtml(item.id)}" value="${escapeHtml(item.title || "")}" style="flex:1; min-width:160px; padding:8px 10px; border-radius:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:15px; font-weight:700; font-family:inherit;" />
          <select class="issue-edit-tag" data-prev="${escapeHtml(item.tag || "")}" style="padding:8px 10px; border-radius:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:13px; font-family:inherit;">${issueTagOptionsHtml(item.tag)}</select>
        </div>
        <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px;">
          <span style="font-size:13px; color:var(--text);">🎫</span>
          <input type="text" class="issue-edit-ticket" data-id="${escapeHtml(item.id)}" value="${escapeHtml(item.ticket || "")}" placeholder="Helpdesk Ticket..." style="flex:1; padding:7px 9px; border-radius:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:13px; font-family:inherit;" />
        </div>
        <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px;">
          <span style="font-size:13px; color:var(--text);">📍</span>
          <input type="text" class="issue-edit-location" list="issue-edit-loc-opts-${escapeHtml(item.id)}" value="${escapeHtml(item.location || "")}" placeholder="Location (optional)" autocomplete="off" style="flex:1; padding:7px 9px; border-radius:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:13px; font-family:inherit;" />
          <datalist id="issue-edit-loc-opts-${escapeHtml(item.id)}"></datalist>
        </div>
        <textarea class="issue-edit-notes" placeholder="Notes (optional)..." style="width:100%; min-height:70px; padding:8px 10px; border-radius:8px; border:1px solid var(--border);background:var(--input-bg);color:var(--text); font-size:14px; font-family:inherit; resize:vertical;">${escapeHtml(item.notes || "")}</textarea>
        <div class="toggles-row" style="justify-content:flex-end; gap:8px; margin-top:10px;">
          <button class="secondary issue-cancel-edit-btn" data-id="${escapeHtml(item.id)}">Cancel</button>
          <button class="issue-save-edit-btn" data-id="${escapeHtml(item.id)}">Save</button>
        </div>
      </div>
    `;
  }

  // One row per issue, expand-to-see-more (2026-08-09 rework, replacing the
  // fixed-height 2-up card grid - see docs/issue-tab.md). Location isn't
  // repeated here since renderIssueLocationGroupHtml() already prints it
  // once as this row's group header. The summary row (checkbox/toggle/
  // title/tag/status/Edit/Delete) is always visible - those are the pieces
  // people reach for while scanning or triaging; Ticket/Description/
  // attachments/Resolution-or-Pending live in .issue-row-details, hidden
  // until expanded, so one long description can't push every other row on
  // the page down. hasDetails gates whether there's anything to expand at
  // all - a plain Active issue with no ticket/description/attachments has
  // nothing behind the toggle, so the arrow is replaced with a blank
  // spacer instead of a dead button.
  const isExpanded = expandedIssueItemIds.has(item.id);
  const detailsId = `issue-details-${escapeHtml(item.id)}`;
  const hasDetails = Boolean(item.ticket || item.notes || item.attachments?.length || status === "complete" || status === "pending");
  return `
    <div class="card issue-row-card">
      <div class="issue-row-summary">
        <input type="checkbox" class="issue-select-checkbox" data-id="${escapeHtml(item.id)}" title="Select for export" ${selectedIssueItemIds.has(item.id) ? "checked" : ""} />
        ${
          hasDetails
            ? `<button type="button" class="issue-row-toggle-btn" data-id="${escapeHtml(item.id)}" aria-expanded="${isExpanded}" aria-controls="${detailsId}" title="${isExpanded ? "Collapse" : "Expand"} details">${isExpanded ? "▾" : "▸"}</button>`
            : `<span class="issue-row-toggle-spacer" aria-hidden="true"></span>`
        }
        <div class="subject issue-row-title${hasDetails ? " issue-row-title-toggle" : ""}" ${hasDetails ? `data-id="${escapeHtml(item.id)}"` : ""}>${escapeHtml(item.title || "(untitled)")}</div>
        ${
          canEdit()
            ? `<select class="issue-row-tag-select${tagInfo ? "" : " issue-row-tag-select-empty"}" data-id="${escapeHtml(item.id)}" data-prev="${escapeHtml(item.tag || "")}" style="${tagInfo ? `border-color:${tagInfo.color}; color:${tagInfo.color};` : ""}" title="${tagInfo ? "Change tag" : "Add a tag"}">${issueTagOptionsHtml(item.tag)}</select>`
            : tagInfo
            ? `<span class="tag" style="flex-shrink:0; border-color:${tagInfo.color}; color:${tagInfo.color};">${escapeHtml(tagInfo.label)}</span>`
            : ""
        }
        ${
          canEdit()
            ? `<select class="issue-status-select" data-id="${escapeHtml(item.id)}">
          <option value="active" ${status === "active" ? "selected" : ""}>Active</option>
          <option value="pending" ${status === "pending" ? "selected" : ""}>Pending</option>
          <option value="complete" ${status === "complete" ? "selected" : ""}>Complete</option>
        </select>
        <div class="issue-row-actions">
          <button class="secondary issue-edit-btn" data-id="${escapeHtml(item.id)}">Edit</button>
          <button class="secondary issue-delete-btn" data-id="${escapeHtml(item.id)}">Delete</button>
        </div>`
            : `<span class="tag">${escapeHtml(ISSUE_STATUS_LABELS[status] || status)}</span>`
        }
      </div>
      ${
        hasDetails
          ? `<div class="issue-row-details" id="${detailsId}" style="display:${isExpanded ? "block" : "none"};">
        ${item.ticket ? `<div style="font-size:12px; color:#a78bfa; font-weight:600;">🎫 ${escapeHtml(item.ticket)}</div>` : ""}
        ${item.notes ? `<div class="preview">${escapeHtml(item.notes)}</div>` : ""}
        ${item.attachments?.length ? `<div class="attachment-docs fields issue-attachments" data-key="${escapeHtml(item.id)}"></div>` : ""}
        ${
          status === "complete"
            ? `<div class="issue-resolution-box">
          <div class="issue-resolution-label">✅ Resolution</div>
          <textarea class="issue-resolution-input" data-id="${escapeHtml(item.id)}" placeholder="Describe how this was resolved..." ${canEdit() ? "" : "disabled"}>${escapeHtml(item.resolution || "")}</textarea>
          ${canEdit() ? `<button class="secondary issue-resolution-save-btn" data-id="${escapeHtml(item.id)}">Save resolution</button>` : ""}
        </div>`
            : ""
        }
        ${
          status === "pending"
            ? `<div class="issue-pending-box">
          <div class="issue-pending-label">⏳ Why pending</div>
          <textarea class="issue-pending-input" data-id="${escapeHtml(item.id)}" placeholder="Explain what's blocking this..." ${canEdit() ? "" : "disabled"}>${escapeHtml(item.pendingReason || "")}</textarea>
          ${canEdit() ? `<button class="secondary issue-pending-save-btn" data-id="${escapeHtml(item.id)}">Save reason</button>` : ""}
        </div>`
            : ""
        }
      </div>`
          : ""
      }
    </div>
  `;
}

function issueStatusCounts(items) {
  const counts = { active: 0, pending: 0, complete: 0 };
  items.forEach((it) => {
    const s = effectiveIssueStatus(it);
    if (counts[s] !== undefined) counts[s]++;
  });
  return counts;
}

// Groups the visible items by their (trimmed) Location text, sorted
// alphabetically (2026-08-09 row-list rework - see docs/issue-tab.md).
// Locations recur across issues often enough - same building, several open
// tickets - that a sticky sub-header per address reads far better than
// repeating the address on every row. Items with no Location fall into
// their own group, sorted last regardless of alphabet rather than sorting
// first as an empty string would. Within a group, newest-first - the same
// order the whole (ungrouped) list used before this rework - so the latest
// issue at a site still surfaces near the top of its own group.
function buildIssueLocationGroups(items) {
  const byLocation = new Map();
  items.forEach((item) => {
    const key = (item.location || "").trim();
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key).push(item);
  });
  return Array.from(byLocation.entries())
    .map(([location, groupItems]) => ({
      location,
      items: groupItems.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)),
    }))
    .sort((a, b) => {
      if (!a.location) return 1;
      if (!b.location) return -1;
      return a.location.localeCompare(b.location, undefined, { sensitivity: "base" });
    });
}

// One sticky-header-plus-rows section per buildIssueLocationGroups() entry.
// "No location" is the fallback label for the blank-location group (always
// last, per that function's own sort).
function renderIssueLocationGroupHtml(group) {
  const label = group.location || "No location";
  return `
    <div class="issue-location-group">
      <div class="issue-location-header">📍 ${escapeHtml(label)} <span class="issue-location-count">${group.items.length}</span></div>
      ${group.items.map((item) => renderIssueItemCard(item)).join("")}
    </div>
  `;
}

function renderIssueView() {
  if (!issueListEl) return;

  // The "New" tab (2026-08-05, data-region="new") isn't a real region - it
  // swaps this whole panel over to the create-issue form (#issueAddRow)
  // instead of filtering allIssueItems the way Cali/Outside Cali do.
  // Everything below this block assumes currentIssueRegion is a real region
  // key ("cali"/"outsideCali"), so bail out before any of that runs.
  const isNewIssueTab = currentIssueRegion === "new";
  if (issueStatusTabsEl) issueStatusTabsEl.style.display = isNewIssueTab ? "none" : "flex";
  if (issueToolbarEl) issueToolbarEl.style.display = isNewIssueTab ? "none" : "flex";
  if (issueListEl) issueListEl.style.display = isNewIssueTab ? "none" : "";
  if (issueEmptyEl && isNewIssueTab) issueEmptyEl.style.display = "none";
  // Same canEdit()-gated visibility updateAppChrome() also sets before this
  // runs - this is the version that actually sticks, since it also knows
  // whether the New tab specifically is the active one (updateAppChrome()
  // only knows whether Issue is the active app at all).
  if (issueAddRowEl) issueAddRowEl.style.display = isNewIssueTab && canEdit() ? "flex" : "none";
  if (isNewIssueTab) return;

  const editDrafts = {};
  editingIssueItemIds.forEach((id) => {
    const draft = captureIssueEditDraft(id);
    if (draft) editDrafts[id] = draft;
  });

  const regionItems = allIssueItems.filter((it) => (it.region || "cali") === currentIssueRegion);

  // Counts (for the status tabs' badge numbers) are always against the full
  // region list, regardless of the search term or which status tab is
  // active - same "stable choices while filtering" reasoning as Roadmap's
  // own state filter dropdown.
  const counts = issueStatusCounts(regionItems);
  issueStatusTabsEl?.querySelectorAll(".tab[data-status]").forEach((btn) => {
    const key = btn.dataset.status;
    btn.textContent = key === "all" ? "All" : `${ISSUE_STATUS_LABELS[key]} (${counts[key] || 0})`;
  });

  const term = issueSearchInput?.value.trim().toLowerCase() || "";
  const wantStatus = currentIssueStatusFilter || "active";
  const wantsEveryStatus = term || wantStatus === "all";

  const items = regionItems
    .filter((item) => (wantsEveryStatus ? true : effectiveIssueStatus(item) === wantStatus))
    .filter((item) => {
      if (!term) return true;
      return [item.title, item.ticket, item.location, item.notes].filter(Boolean).join(" ").toLowerCase().includes(term);
    });

  // Grouped-by-location, alphabetical (2026-08-09) - see
  // buildIssueLocationGroups() above. `items` gets flattened back out of the
  // groups (rather than sorted separately) so lastRenderedIssueItems - what
  // Excel export rows read from - lines up with the on-screen location
  // order, the same way PDF/PNG export already always matches the screen.
  const locationGroups = buildIssueLocationGroups(items);
  const sortedItems = locationGroups.flatMap((g) => g.items);

  // Exposed so the Export button can grab exactly what's currently on
  // screen (same region/status/search filter) without recomputing the whole
  // chain above again - same reasoning as Roadmap's lastRenderedRoadmapItems.
  lastRenderedIssueItems = sortedItems;

  if (issueEmptyEl) {
    issueEmptyEl.textContent = "No issues here yet — add one from the New tab.";
    issueEmptyEl.style.display = sortedItems.length === 0 ? "block" : "none";
  }

  issueListEl.innerHTML = locationGroups.map((g) => renderIssueLocationGroupHtml(g)).join("");
  hydrateIssueAttachments(sortedItems);
  Object.entries(editDrafts).forEach(([id, draft]) => restoreIssueEditDraft(id, draft));

  updateIssueSelectionUI();
}

// Mirrors hydrateRoadmapAttachments above, just pointed at each issue item's
// own `attachments` array (populated via the "New" tab's file field /
// addIssueAttachment). No markup-editor edit button here - Issue has no
// Timeline/markup feature the way Roadmap does - just a download link and,
// for editors, a remove button.
async function hydrateIssueAttachments(items) {
  if (!storage) return;
  for (const item of items) {
    const atts = item.attachments;
    if (!atts || !atts.length) continue;
    const container = issueListEl.querySelector(`.issue-attachments[data-key="${CSS.escape(item.id)}"]`);
    if (!container) continue;
    const entries = await Promise.all(
      atts.map(async (a) => ({ url: await resolveAttachmentUrl(a.path), name: a.name, path: a.path }))
    );
    container.innerHTML = entries
      .filter((e) => e.url)
      .map((e) => {
        const removeBtn = canEdit()
          ? `<button class="issue-remove-attachment-btn" data-item-id="${escapeHtml(item.id)}" data-path="${escapeHtml(e.path)}" title="Remove attachment" style="border:none; background:transparent; color:var(--text); cursor:pointer; font-size:11px; line-height:1; padding:0;">✕</button>`
          : "";
        return `<span class="issue-attachment-tag">
          <a href="${e.url}" target="_blank" style="color:inherit; text-decoration:none;">📎 ${escapeHtml(e.name)}</a>
          ${removeBtn}
        </span>`;
      })
      .join("");
  }
}

// Checked cards for Export - persists across region/status/search filter
// changes and re-renders (like a shopping cart), same reasoning as
// Roadmap's own selectedRoadmapItemIds. Resolved against allIssueItems (not
// whatever's currently filtered) at export time.
function updateIssueSelectionUI() {
  const n = selectedIssueItemIds.size;
  if (issueSelectionInfoEl) issueSelectionInfoEl.textContent = n > 0 ? `${n} selected` : "";
  if (issueClearSelectionBtn) issueClearSelectionBtn.style.display = n > 0 ? "" : "none";
  // Reflects whether every currently-shown row (lastRenderedIssueItems -
  // same region/status/search scope Export itself resolves against) is
  // ticked - same "checked iff everything visible is selected" rule as
  // Roadmap's own roadmapGrandTotalSelectAllEl.
  if (issueSelectAllEl) {
    issueSelectAllEl.checked =
      lastRenderedIssueItems.length > 0 && lastRenderedIssueItems.every((it) => selectedIssueItemIds.has(it.id));
  }
}

// "Select all shown" (2026-08-09) - ticks/unticks every row currently
// visible under the active region/status tab and search term, the same
// "shopping cart" selectedIssueItemIds every individual .issue-select-
// checkbox already writes to. Mirrors Roadmap's own
// roadmapGrandTotalSelectAllEl/lastRenderedRoadmapItems mechanic, just
// living in #issueToolbar instead of a grand-total bar Issue doesn't have.
issueSelectAllEl?.addEventListener("change", () => {
  if (issueSelectAllEl.checked) {
    lastRenderedIssueItems.forEach((it) => selectedIssueItemIds.add(it.id));
  } else {
    lastRenderedIssueItems.forEach((it) => selectedIssueItemIds.delete(it.id));
  }
  updateIssueSelectionUI();
  renderIssueView();
});

issueClearSelectionBtn?.addEventListener("click", () => {
  selectedIssueItemIds.clear();
  updateIssueSelectionUI();
  renderIssueView();
});

issueListEl?.addEventListener("input", (e) => {
  const locationInputEl = e.target.closest(".issue-edit-location");
  if (locationInputEl) {
    const card = locationInputEl.closest(".card");
    populateLocationDatalist(card?.querySelector("datalist"), locationInputEl.value.trim());
  }
});

issueListEl?.addEventListener("change", (e) => {
  const selectCheckbox = e.target.closest(".issue-select-checkbox");
  if (selectCheckbox) {
    if (selectCheckbox.checked) selectedIssueItemIds.add(selectCheckbox.dataset.id);
    else selectedIssueItemIds.delete(selectCheckbox.dataset.id);
    updateIssueSelectionUI();
    return;
  }

  const statusSelect = e.target.closest(".issue-status-select");
  if (statusSelect) {
    const id = statusSelect.dataset.id;
    const status = statusSelect.value;
    const previous = allIssueItems.find((it) => it.id === id);
    setIssueItemStatusFn({ itemId: id, status }).catch((err) => {
      console.error(err);
      alert("Could not update status: " + err.message);
      if (previous) statusSelect.value = effectiveIssueStatus(previous);
    });
    return;
  }

  // "+ New tag…" from an existing card's own edit-mode tag select (2026-08-10
  // follow-up) - before this, picking "+ New tag…" here did nothing until
  // Save, at which point the raw "__new__" value was caught and silently
  // turned into no tag at all (see the .issue-save-edit-btn handler below) -
  // tag creation only actually worked from the "New issue" form's own select.
  // Same prompt/dedupe/create flow as that form's issueTagSelect handler and
  // the Standup Saved-editor's own tag select, adapted for a plain DOM
  // element with no backing data model (this card reads its fields straight
  // off the DOM at Save time) - `data-prev` (set on render, kept in sync on
  // every non-"__new__" change) is what a cancelled "New tag name:" prompt
  // reverts to, since a native <select> has already changed its own value by
  // the time "change" fires.
  const tagSelect = e.target.closest(".issue-edit-tag");
  if (tagSelect) {
    if (tagSelect.value !== "__new__") {
      tagSelect.dataset.prev = tagSelect.value;
      return;
    }
    const revertTo = tagSelect.dataset.prev || "";
    const label = (prompt("New tag name:") || "").trim();
    if (!label) {
      tagSelect.value = revertTo;
      return;
    }
    const applyTag = (key, text) => {
      let opt = Array.from(tagSelect.options).find((o) => o.value === key);
      if (!opt) {
        opt = document.createElement("option");
        opt.value = key;
        opt.textContent = text;
        tagSelect.insertBefore(opt, tagSelect.lastElementChild); // before "+ New tag…"
      }
      tagSelect.value = key;
      tagSelect.dataset.prev = key;
    };
    // Checked against issueSelectableTags() (custom only), not
    // issueAllTags() - see the New-tab form's own tag handler above for why:
    // the fixed 8 aren't pickable here anymore, so a label match against one
    // of them shouldn't resurrect it, it should just create a genuine new
    // custom tag.
    const normalizedLabel = label.toLowerCase();
    const existingTag = issueSelectableTags().find((t) => t.label.trim().toLowerCase() === normalizedLabel);
    if (existingTag) {
      applyTag(existingTag.key, existingTag.label);
      return;
    }
    const color = issueNextTagColor();
    tagSelect.disabled = true;
    addSharedTagFn({ label, color })
      .then((res) => {
        if (!allSharedCustomTags.some((t) => t.id === res.data.id)) {
          allSharedCustomTags.push({ id: res.data.id, label, color });
        }
        applyTag(`custom:${res.data.id}`, label);
        tagSelect.disabled = false;
      })
      .catch((err) => {
        console.error(err);
        alert("Could not add tag: " + (err?.message || "Something went wrong."));
        tagSelect.value = revertTo;
        tagSelect.disabled = false;
      });
    return;
  }

  // The row's own inline tag pill (2026-08-10 follow-up) - lets a tag be
  // changed, created, or assigned for the first time directly from the
  // collapsed summary row, without opening full Edit. Persists immediately
  // via setIssueItemTagFn (see functions/index.js) rather than waiting for
  // a Save button, since this row has no surrounding edit form; the live
  // onSnapshot listener re-renders the row afterward, which refreshes the
  // select's colored border to match the new tag.
  const rowTagSelect = e.target.closest(".issue-row-tag-select");
  if (rowTagSelect) {
    const id = rowTagSelect.dataset.id;
    const revertTo = rowTagSelect.dataset.prev || "";
    const persistTag = (tagValue) => {
      setIssueItemTagFn({ itemId: id, tag: tagValue || null })
        .then(() => {
          rowTagSelect.dataset.prev = tagValue;
        })
        .catch((err) => {
          console.error(err);
          alert("Could not update tag: " + (err?.message || "Something went wrong."));
          rowTagSelect.value = revertTo;
        });
    };
    if (rowTagSelect.value !== "__new__") {
      persistTag(rowTagSelect.value);
      return;
    }
    // "+ New tag…" picked straight from the row - same prompt/dedupe/create
    // flow as .issue-edit-tag's handler above, adapted to persist right away
    // instead of waiting for Save.
    const label = (prompt("New tag name:") || "").trim();
    if (!label) {
      rowTagSelect.value = revertTo;
      return;
    }
    const applyTagOption = (key, text) => {
      let opt = Array.from(rowTagSelect.options).find((o) => o.value === key);
      if (!opt) {
        opt = document.createElement("option");
        opt.value = key;
        opt.textContent = text;
        rowTagSelect.insertBefore(opt, rowTagSelect.lastElementChild); // before "+ New tag…"
      }
      rowTagSelect.value = key;
    };
    const normalizedLabel = label.toLowerCase();
    const existingTag = issueSelectableTags().find((t) => t.label.trim().toLowerCase() === normalizedLabel);
    if (existingTag) {
      applyTagOption(existingTag.key, existingTag.label);
      persistTag(existingTag.key);
      return;
    }
    const color = issueNextTagColor();
    rowTagSelect.disabled = true;
    addSharedTagFn({ label, color })
      .then((res) => {
        if (!allSharedCustomTags.some((t) => t.id === res.data.id)) {
          allSharedCustomTags.push({ id: res.data.id, label, color });
        }
        applyTagOption(`custom:${res.data.id}`, label);
        rowTagSelect.disabled = false;
        persistTag(`custom:${res.data.id}`);
      })
      .catch((err) => {
        console.error(err);
        alert("Could not add tag: " + (err?.message || "Something went wrong."));
        rowTagSelect.value = revertTo;
        rowTagSelect.disabled = false;
      });
    return;
  }
});

issueListEl?.addEventListener("click", (e) => {
  // Row expand/collapse (2026-08-09) - the chevron button and the title
  // text both toggle the same way (title only carries the
  // .issue-row-title-toggle class/data-id when renderIssueItemCard() found
  // something to show, same hasDetails gate as the toggle button itself).
  const rowToggle = e.target.closest(".issue-row-toggle-btn, .issue-row-title-toggle");
  if (rowToggle) {
    const id = rowToggle.dataset.id;
    if (expandedIssueItemIds.has(id)) expandedIssueItemIds.delete(id);
    else expandedIssueItemIds.add(id);
    renderIssueView();
    return;
  }

  const editBtn = e.target.closest(".issue-edit-btn");
  if (editBtn) {
    editingIssueItemIds.add(editBtn.dataset.id);
    renderIssueView();
    return;
  }

  const cancelBtn = e.target.closest(".issue-cancel-edit-btn");
  if (cancelBtn) {
    editingIssueItemIds.delete(cancelBtn.dataset.id);
    renderIssueView();
    return;
  }

  const saveBtn = e.target.closest(".issue-save-edit-btn");
  if (saveBtn) {
    const id = saveBtn.dataset.id;
    const card = saveBtn.closest(".card");
    const title = card.querySelector(".issue-edit-title")?.value.trim() || "";
    if (!title) {
      alert("Title can't be empty.");
      return;
    }
    const ticket = card.querySelector(".issue-edit-ticket")?.value.trim() || "";
    const location = card.querySelector(".issue-edit-location")?.value.trim() || "";
    const notes = card.querySelector(".issue-edit-notes")?.value.trim() || "";
    const tagValue = card.querySelector(".issue-edit-tag")?.value || "";
    const tag = tagValue && tagValue !== "__new__" ? tagValue : null;
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    updateIssueItemFn({ itemId: id, title, ticket, location, notes, tag })
      .then(() => {
        editingIssueItemIds.delete(id);
        renderIssueView();
      })
      .catch((err) => {
        console.error(err);
        alert("Could not save: " + err.message);
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      });
    return;
  }

  const deleteBtn = e.target.closest(".issue-delete-btn");
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    if (!confirm("Delete this issue? This can't be undone.")) return;
    deleteIssueItemFn({ itemId: id }).catch((err) => {
      console.error(err);
      alert("Could not delete: " + err.message);
    });
    return;
  }

  const resolutionSaveBtn = e.target.closest(".issue-resolution-save-btn");
  if (resolutionSaveBtn) {
    const id = resolutionSaveBtn.dataset.id;
    const card = resolutionSaveBtn.closest(".card");
    const resolution = card.querySelector(".issue-resolution-input")?.value.trim() || "";
    resolutionSaveBtn.disabled = true;
    resolutionSaveBtn.textContent = "Saving…";
    setIssueItemResolutionFn({ itemId: id, resolution })
      .catch((err) => {
        console.error(err);
        alert("Could not save resolution: " + err.message);
      })
      .finally(() => {
        resolutionSaveBtn.disabled = false;
        resolutionSaveBtn.textContent = "Save resolution";
      });
    return;
  }

  const pendingSaveBtn = e.target.closest(".issue-pending-save-btn");
  if (pendingSaveBtn) {
    const id = pendingSaveBtn.dataset.id;
    const card = pendingSaveBtn.closest(".card");
    const pendingReason = card.querySelector(".issue-pending-input")?.value.trim() || "";
    pendingSaveBtn.disabled = true;
    pendingSaveBtn.textContent = "Saving…";
    setIssueItemPendingReasonFn({ itemId: id, pendingReason })
      .catch((err) => {
        console.error(err);
        alert("Could not save reason: " + err.message);
      })
      .finally(() => {
        pendingSaveBtn.disabled = false;
        pendingSaveBtn.textContent = "Save reason";
      });
    return;
  }

  const removeAttachmentBtn = e.target.closest(".issue-remove-attachment-btn");
  if (removeAttachmentBtn) {
    const itemId = removeAttachmentBtn.dataset.itemId;
    const path = removeAttachmentBtn.dataset.path;
    if (confirm("Remove this attachment?")) {
      removeAttachmentBtn.disabled = true;
      removeIssueAttachmentFn({ itemId, path }).catch((err) => {
        console.error(err);
        alert("Could not remove attachment: " + err.message);
        removeAttachmentBtn.disabled = false;
      });
    }
    return;
  }
});

// --- Issue export ------------------------------------------------------
// Excel (via SheetJS) always reflects the resolved item set (ticked cards
// win over whatever's currently on screen, same "shopping cart" precedence
// as Roadmap's own export). PDF/PNG (via html2canvas + jsPDF) instead
// snapshot the #issueList grid exactly as currently rendered on screen -
// same "Timeline export always captures what's on screen, never the
// checkbox selection" behavior Roadmap's own exportRoadmapTimelineToFile
// has, so a PDF/PNG export can't show cards from a status tab you're not
// currently looking at.
function nextIssueExportFileTag() {
  const dateStr = dateToInputValue(new Date());
  const storageKey = "issueExportCount_" + dateStr;
  const count = parseInt(localStorage.getItem(storageKey) || "0", 10) + 1;
  localStorage.setItem(storageKey, String(count));
  return { dateStr, version: `V1.${count - 1}` };
}

async function exportIssueListToExcel(items) {
  await ensureXLSX();
  const regionLabel = ISSUE_REGIONS.find((r) => r.key === currentIssueRegion)?.label || currentIssueRegion;
  const rows = items.map((item) => {
    const tagInfo = issueAllTags().find((t) => t.key === item.tag);
    return {
      Title: item.title || "",
      Ticket: item.ticket || "",
      Location: item.location || "",
      Region: ISSUE_REGIONS.find((r) => r.key === item.region)?.label || item.region || "",
      State: item.state || "",
      Status: ISSUE_STATUS_LABELS[effectiveIssueStatus(item)] || effectiveIssueStatus(item),
      Tag: tagInfo ? tagInfo.label : "",
      Notes: item.notes || "",
      Resolution: item.resolution || "",
      "Pending Reason": item.pendingReason || "",
      Created: item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : "",
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 12 }];
  // Same "explicit row height so multi-line Notes/Resolution/Pending Reason
  // cells aren't visually clipped" technique as Roadmap's own
  // exportRoadmapListToExcel - this SheetJS build can't turn on Wrap Text.
  const headerRow = { hpt: 18 };
  const dataRows = rows.map((row) => {
    const maxLines = Math.max(1, ...Object.values(row).map((v) => (typeof v === "string" ? v.split("\n").length : 1)));
    return { hpt: maxLines * 15 };
  });
  ws["!rows"] = [headerRow, ...dataRows];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Issues");
  const { dateStr, version } = nextIssueExportFileTag();
  XLSX.writeFile(wb, `CW_Issues_${regionLabel.replace(/[^a-z0-9]+/gi, "")}_${dateStr}_Huy_Nguyen_${version}.xlsx`);
}

async function exportIssueListToFile(format, items) {
  if (format === "excel") {
    await exportIssueListToExcel(items);
    return;
  }
  await ensureHtml2Canvas();
  const canvas = await html2canvas(issueListEl, { backgroundColor: "#ffffff", scale: 2 });
  const fileBase = `CW_Issues_${new Date().getFullYear()}_Huy_Nguyen`;

  if (format === "pdf") {
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [canvas.width, canvas.height],
    });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`${fileBase}.pdf`);
    return;
  }

  // PNG - same "frame it with padding + a border so nothing reads as
  // clipped" treatment as exportRoadmapTimelineToFile's own PNG path.
  await new Promise((resolve) => {
    const PAD = 32;
    const BORDER = 6;
    const framed = document.createElement("canvas");
    framed.width = canvas.width + (PAD + BORDER) * 2;
    framed.height = canvas.height + (PAD + BORDER) * 2;
    const ctx = framed.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, framed.width, framed.height);
    ctx.strokeStyle = "#2fb457";
    ctx.lineWidth = BORDER;
    ctx.strokeRect(BORDER / 2, BORDER / 2, framed.width - BORDER, framed.height - BORDER);
    ctx.drawImage(canvas, BORDER + PAD, BORDER + PAD);
    framed.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBase}.png`;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}

let pendingIssueExportItems = [];

issueExportBtn?.addEventListener("click", () => {
  const itemsToExport =
    selectedIssueItemIds.size > 0 ? allIssueItems.filter((it) => selectedIssueItemIds.has(it.id)) : lastRenderedIssueItems;
  if (!itemsToExport.length) {
    alert("Nothing to export yet.");
    return;
  }
  pendingIssueExportItems = itemsToExport;
  if (issueExportFormatModalEl) issueExportFormatModalEl.style.display = "flex";
});

async function runIssueExport(format) {
  if (issueExportFormatModalEl) issueExportFormatModalEl.style.display = "none";
  issueExportBtn.disabled = true;
  const originalLabel = issueExportBtn.textContent;
  issueExportBtn.textContent = "Exporting…";
  try {
    await exportIssueListToFile(format, pendingIssueExportItems);
  } catch (err) {
    console.error(err);
    alert("Could not export: " + err.message);
  } finally {
    issueExportBtn.disabled = false;
    issueExportBtn.textContent = originalLabel;
  }
}

issueExportFormatExcelBtn?.addEventListener("click", () => runIssueExport("excel"));
issueExportFormatPdfBtn?.addEventListener("click", () => runIssueExport("pdf"));
issueExportFormatPngBtn?.addEventListener("click", () => runIssueExport("png"));
issueExportFormatCancelBtn?.addEventListener("click", () => {
  if (issueExportFormatModalEl) issueExportFormatModalEl.style.display = "none";
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
