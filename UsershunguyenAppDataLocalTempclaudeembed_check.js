(function(){const c=document.getElementById("emailRequestAttachmentsEmbedView");if(!c)return;function a(e){return document.getElementById(e)}
// ---- CW Email Request global loading overlay (2026-09-05) -----------------
// One reusable, full-screen overlay for every async operation in THIS tab
// (#emailRequestAttachmentsEmbedView) that would otherwise leave the UI
// looking blank/frozen during a wait - Cloud Function calls, PDF build/sign
// work, etc. Deliberately appended to document.body (not inside `c`) since
// #emailRequestAttachmentsEmbedView (or an ancestor) is display:none on
// every tab except this one - an overlay nested inside a display:none
// subtree would never paint even with the active class set. z-index is
// set above every other modal/overlay in this file (era_previewModal, the
// Keycard Form modal, the Activate guide's spotlight, etc). Toggled only
// via classList (never .style.display directly) per pitfall #14 - a bare
// `el.style.display=""` would just re-hide it under the stylesheet's own
// `display:none` default instead of showing it.
let eraGlobalLoadingCount = 0;
let eraGlobalLoadingEl = null;
function eraEnsureGlobalLoadingEl() {
  if (eraGlobalLoadingEl && eraGlobalLoadingEl.isConnected) return eraGlobalLoadingEl;
  if (!document.getElementById("era_globalLoadingOverlayStyle")) {
    const style = document.createElement("style");
    style.id = "era_globalLoadingOverlayStyle";
    style.textContent =
      "#era_globalLoadingOverlay{position:fixed;inset:0;z-index:2147483647;background:rgba(255,255,255,.75);" +
      "display:none;align-items:center;justify-content:center;flex-direction:column;pointer-events:auto;}" +
      "#era_globalLoadingOverlay.era-loading-active{display:flex;}" +
      "#era_globalLoadingOverlay .era-loading-hourglass{font-size:72px;line-height:1;animation:era-loading-spin 1.2s linear infinite;" +
      "filter:drop-shadow(0 2px 6px rgba(0,0,0,.25));}" +
      "#era_globalLoadingOverlay .era-loading-label{margin-top:14px;font:600 15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "color:#1f2937;letter-spacing:.02em;}" +
      "@keyframes era-loading-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
  }
  const el = document.createElement("div");
  el.id = "era_globalLoadingOverlay";
  el.innerHTML = '<div class="era-loading-hourglass" aria-hidden="true">⏳</div><div class="era-loading-label">Loading…</div>';
  document.body.appendChild(el);
  eraGlobalLoadingEl = el;
  return el;
}
window.eraShowGlobalLoading = function () {
  eraGlobalLoadingCount++;
  eraEnsureGlobalLoadingEl().classList.add("era-loading-active");
};
window.eraHideGlobalLoading = function () {
  eraGlobalLoadingCount = Math.max(0, eraGlobalLoadingCount - 1);
  if (eraGlobalLoadingCount === 0) {
    const el = eraGlobalLoadingEl || document.getElementById("era_globalLoadingOverlay");
    if (el) el.classList.remove("era-loading-active");
  }
};
window.eraForceHideGlobalLoading = function () {
  eraGlobalLoadingCount = 0;
  const el = eraGlobalLoadingEl || document.getElementById("era_globalLoadingOverlay");
  if (el) el.classList.remove("era-loading-active");
};
// ---- Granular CW Email Request access (2026-08-30) ------------------------
// This embed script is a separate classic <script> (can't import from
// src/app.js's ES module), so it consults window.eraCanSeeMode/
// eraCanDoKeycardAction - two small bridges app.js sets up post-sign-in
// (see canSeeEraMode/canDoKeycardAction there) - rather than reading
// currentUserEraModes/currentUserEraKeycardActions directly. Both default to
// "everything allowed" if the bridge isn't there yet (e.g. this script's own
// initial synchronous run, before sign-in has resolved) so nothing looks
// broken before access is known; app.js re-calls eraApplyAccessGating() from
// updateAppChrome() every time this tab becomes visible, once the real
// answer is known. UX-only - the real gate is requireEraAccess in
// functions/index.js.
// eraActivateMode (2026-09-04, per Huy's request, split out of the old
// eraSwitchToModeTab(tabEl) so both a real top-level ".era-tab" click and a
// Hardware-menu pick of Printer/Phone/Laptop - which no longer HAVE their own
// top-level tab to read data-mode off of - can share one implementation
// instead of duplicating it. `activeTabEl` is which of #era_tabs's own
// .era-tab elements should visually read as "active" - normally the same tab
// that was clicked, but for Printer/Phone/Laptop (now reachable only via the
// Hardware ▾ menu) it's the Hardware tab itself, since that's the only
// top-level tab left standing in for any of them.
function eraActivateMode(mode,activeTabEl){
  _=mode;
  c.querySelectorAll("#era_tabs .era-tab").forEach(function(t){t.classList.toggle("era-active",t===activeTabEl)});
  c.querySelectorAll(".era-mode-fields").forEach(function(t){t!==a("era_k_servesCard")&&(t.style.display=t.getAttribute("data-mode")===_?(t===a("era_k_guideToolbar")?"flex":"block"):"none")});
  a("era_err").style.display="none";
  a("era_ok").style.display="none";
  eraSyncLocationUiForMode();
  eraSyncKServesCardVisibility();
  eraSyncKLocationGroupVisibility();
  eraSyncYourEmailGroupVisibility();
  // era_w_card (2026-09-09, per Huy's request, Wi-Fi tab spec item 2): ke()
  // is normally only re-run on era_w_requestType's own "change" event (the
  // Wi-Fi ▾ tab dropdown items dispatch it), which never fires on a plain
  // mode switch - re-running it here too keeps era_w_card's hidden/shown
  // state correct the very first time Wi-Fi is switched into, before any
  // pick has been made. Harmless when Wi-Fi isn't the mode being switched
  // to: era_w_card is already hidden by the inline style this same function
  // sets above, on top of whatever ke() also does to it. ke is a hoisted
  // function declaration further down this same script, so it's callable
  // here despite being defined later in the file.
  if(typeof ke==="function")ke();
  // era_el_card (2026-09-09, per Huy's request) - same reasoning as ke()
  // just above: ELbody() is normally only re-run from the Create/
  // Troubleshoot/De-activate checkboxes' own "change" listeners (which the
  // Electrical ▾ tab dropdown now drives via p()), never on a plain mode
  // switch - re-running it here keeps era_el_card's hidden/shown state
  // correct the first time Electrical is switched into.
  if(typeof ELbody==="function")ELbody();
  // #era_submitBtn ("Preview") is Keycard-only now that Wi-Fi/Software/
  // Electrical/Hardware's Printer+Phone+Laptop each have their own
  // section-scoped Submission button (task 4, 2026-09-08, per Huy's
  // request) - kept present-but-hidden outside Keycard rather than removed,
  // so the guide-script functions that specifically reference #era_submitBtn
  // (applyPreviewHold/currentModeIsKeycard, syncSharedChromeGate - see their
  // own comments further down) keep working completely unchanged; they
  // already only ever act on this one id and already guard on
  // currentModeIsKeycard(), so this hide composes safely with their own
  // class-based (!important) hides.
  const submitBtn=a("era_submitBtn");
  submitBtn&&(submitBtn.style.display=_==="keycard"?"":"none");
  // Progressive reveal (task 3, 2026-09-08, per Huy's request) - re-applied
  // on every mode switch so the shared Location group and each applicable
  // mode's own Submission button reflect that mode's own revealed state.
  if(typeof eraApplyProgressiveVisibility==="function")eraApplyProgressiveVisibility();
}
function eraSwitchToModeTab(tabEl){
  eraActivateMode(tabEl.getAttribute("data-mode"),tabEl);
}
function eraFilterKeycardActionSelect(entryEl){
  const canDoAction=window.eraCanDoKeycardAction||function(){return true};
  const sel=entryEl&&entryEl.querySelector(".era-k-action-select");
  if(!sel)return;
  const current=sel.value;
  let firstAllowed=null;
  Array.prototype.forEach.call(sel.querySelectorAll("option"),function(opt){
    const allowed=canDoAction(opt.value);
    opt.hidden=!allowed;
    opt.disabled=!allowed;
    if(allowed&&firstAllowed===null)firstAllowed=opt.value;
  });
  if(!canDoAction(current)&&firstAllowed!==null&&firstAllowed!==current){
    sel.value=firstAllowed;
    sel.dispatchEvent(new Event("change",{bubbles:true}));
  }
}
function eraApplyAccessGating(){
  const canSeeMode=window.eraCanSeeMode||function(){return true};
  const canDoAction=window.eraCanDoKeycardAction||function(){return true};
  // Hide any of the 6 mode tabs (including Keycard's own dropdown wrapper,
  // which still carries data-mode="keycard") the signed-in user isn't
  // allowed to see.
  c.querySelectorAll("#era_tabs .era-tab[data-mode]").forEach(function(tabEl){
    tabEl.style.display=canSeeMode(tabEl.getAttribute("data-mode"))?"":"none";
  });
  // If the mode currently selected got hidden, fall back to the first
  // still-visible mode tab, or "keycard" if the computed allowed set is
  // somehow empty (shouldn't happen - emailRequestAttachmentsEmbed being a
  // granted tab implies at least one mode should be too).
  if(!canSeeMode(_)){
    const visibleTabs=Array.prototype.filter.call(c.querySelectorAll("#era_tabs .era-tab[data-mode]"),function(t){return t.style.display!=="none"});
    const fallbackTab=visibleTabs[0]||c.querySelector('#era_tabs .era-tab[data-mode="keycard"]');
    if(fallbackTab)eraSwitchToModeTab(fallbackTab);
  }
  // Keycard tab dropdown quick-picks (#era_k_tabDropdownMenu) - same allow
  // list as each entry's own Action <select> below.
  c.querySelectorAll("#era_k_tabDropdownMenu .era-tab-dropdown-item[data-k-action]").forEach(function(item){
    item.style.display=canDoAction(item.getAttribute("data-k-action"))?"":"none";
  });
  // Every existing keycard entry's own Action <select> - eraCreateKeycardEntry
  // (below) calls eraFilterKeycardActionSelect directly for entries created
  // after this point, so newly-added entries are filtered too.
  c.querySelectorAll("#era_k_entries .era-entry-block").forEach(eraFilterKeycardActionSelect);
  // Hardware tab's own sub-permission (2026-09-02, per Huy's request): each
  // top-level category in #era_hw_tabDropdownMenu (AP/Node/Camera/NVR/
  // Laptop-Phone/Printer, data-hw-category) is hidden outright - label AND
  // its entire submenu cascade, since hiding the parent div hides every
  // descendant - when the signed-in user isn't granted that specific
  // Hardware sub-permission. Unlike Keycard's action-level gating above,
  // there's no per-LEAF filtering within an allowed category - picking
  // "Hardware" grants nothing by itself (item 3 of the spec: sub-items are
  // never auto-granted), but picking a specific category grants that whole
  // category's own actions, not a further-filtered subset of them (item 5).
  //
  // 2026-09-04, per Huy's request (Printer/Phone/Laptop moved in from their
  // own top-level tabs): Printer is still gated by the "printer" Hardware
  // category above like any other category, but it ALSO keeps its
  // pre-existing "printer" era-mode gate (the one that used to govern its
  // standalone top-level tab) - hidden if EITHER denies it, so nobody who
  // could already reach Printer loses it and nobody gains it from only one
  // of the two being open.
  const canSeeHwCategory=window.eraCanSeeHardwareCategory||function(){return true};
  c.querySelectorAll("#era_hw_tabDropdownMenu > .era-hw-menu-item[data-hw-category]").forEach(function(item){
    let visible=canSeeHwCategory(item.getAttribute("data-hw-category"));
    if(item.getAttribute("data-hw-category")==="printer")visible=visible&&canSeeMode("printer");
    item.style.display=visible?"":"none";
  });
  // Laptop/Phone's own Phone/Laptop leaves (2026-09-04, per Huy's request,
  // moved in from their own top-level tabs) - same treatment as Printer just
  // above: gated by their OWN pre-existing era mode, layered UNDER (never
  // instead of) the "laptopphone" Hardware-category gate above, which still
  // governs the whole branch (including New Hire) unchanged.
  c.querySelectorAll("#era_hw_tabDropdownMenu .era-hw-realleaf[data-hw-realmode]").forEach(function(leaf){
    leaf.style.display=canSeeMode(leaf.getAttribute("data-hw-realmode"))?"":"none";
  });
  // Hardware tab itself (2026-09-04, per Huy's request): the generic
  // data-mode loop above already hid/showed it purely off canSeeMode(
  // "hardware") - but "hardware" was deliberately stripped from every
  // existing user on 2026-09-02 (see docs/log/2026-09-02-access-no-
  // automatic-assignment-and-bulk-grant.md) specifically so nobody gets it
  // without an explicit admin grant, while Printer/Phone/Laptop's own modes
  // stayed untouched. Since those three no longer have a top-level tab of
  // their own to fall back on, gating the Hardware tab SOLELY on
  // canSeeMode("hardware") would have silently locked every one of those
  // already-granted users out of Printer/Phone/Laptop too, with no admin
  // action able to reveal them again (the "hardware" checkbox would grant
  // AP/Node/Camera/NVR access nobody asked for, just to unhide a tab). So:
  // stay visible if the user can reach ANYTHING under it - "hardware" itself,
  // any of Printer/Phone/Laptop's own modes, or any Hardware sub-category -
  // overriding the generic loop's own narrower result for this one tab only.
  const hwTab=c.querySelector('#era_tabs .era-tab[data-mode="hardware"]');
  if(hwTab){
    const hwCategoryItems=c.querySelectorAll("#era_hw_tabDropdownMenu > .era-hw-menu-item[data-hw-category]");
    const anyHwCategory=Array.prototype.some.call(hwCategoryItems,function(item){return canSeeHwCategory(item.getAttribute("data-hw-category"))});
    const hwVisible=canSeeMode("hardware")||canSeeMode("printer")||canSeeMode("phone")||canSeeMode("laptop")||anyHwCategory;
    hwTab.style.display=hwVisible?"":"none";
  }
}
window.eraApplyAccessGating=eraApplyAccessGating;
// -----------------------------------------------------------------------
const We=8,V=a("era_location"),ne=a("era_locationList");function O(e,t){if(!e||(e.innerHTML="",!t))return;const r=Array.isArray(window.CUBEWORK_LOCATIONS)?window.CUBEWORK_LOCATIONS:[];if(r.some(function(l){return l.label.toLowerCase()===t.toLowerCase()}))return;const n=t.toLowerCase();r.filter(function(l){return l.label.toLowerCase().indexOf(n)!==-1}).slice(0,We).forEach(function(l){const o=document.createElement("option");o.value=l.label,e.appendChild(o)})}function He(e){O(ne,e)}V&&V.addEventListener("input",function(){He(V.value.trim())});const Ie=a("era_k_transferLocationList"),De=a("era_ph_locationList");
// ---- Location Features (reusable component) ----
// One generic "type to search, offer up to `We` matching Cubework
// locations" behavior (see O() above), shared by every location-shaped
// input across every mode via one small config table instead of an ad hoc
// listener per field - adding a new location field anywhere in this tab
// means adding one line here. era-k-replacementLocation (Replacement's own
// per-entry location) previously shared this datalist's `list` attribute
// but was never actually wired into the populate-on-input logic - fixed by
// including it in the group it already visually matches (Transfer/Request
// Card).
const EraLocationFeatures=[
  {selector:".era-k-transferFrom, .era-k-transferTo, .era-k-transfer-extraFrom, .era-k-transfer-extraTo, .era-k-requestcardLocation, .era-k-replacementLocation",datalist:Ie},
  {selector:".era-ph-location",datalist:De},
  {selector:".era-aphw-location, .era-lt-location, .era-extra-location",datalist:ne}
];
c.addEventListener("input",function(e){
  for(const cfg of EraLocationFeatures){
    if(e.target.matches(cfg.selector)){O(cfg.datalist,e.target.value.trim());return}
  }
});function ie(e){return(Array.isArray(window.CUBEWORK_LOCATIONS)?window.CUBEWORK_LOCATIONS:[]).find(function(r){return r.label.toLowerCase()===e.toLowerCase()})}function W(e){const t=String(e||"").replace(/\D/g,"").slice(0,10);let r="";return t.length>0&&(r+=t.slice(0,3)),t.length>=3&&(r+="-"),t.length>3&&(r+=t.slice(3,6)),t.length>=6&&(r+="-"),t.length>6&&(r+=t.slice(6,10)),r}let eraKeycardRequestId=null;
// Bumped on every window.eraEditKeycardHistoryEntry() call (see below) so
// that call's own async follow-up work (Photo ID/signature refetch, the
// "Wait for Signature" auto-check + auto-Save) can tell whether it's still
// the MOST RECENT Edit click before touching the DOM or calling Save - a
// slower/earlier Edit's leftover network response landing after a second
// Edit (same submission retried, or a different one picked instead) would
// otherwise silently apply itself to whatever is on-screen NOW, corrupting
// or clobbering the newer submission instead of quietly no-oping. Bumping
// (not just a boolean) also means an in-flight attempt can never mistake
// itself for "current" again once superseded, even if Edit is clicked on
// the exact same requestId a second time.
let eraKeycardEditToken=0;
function eraGetOrCreateKeycardRequestId(){return eraKeycardRequestId||(eraKeycardRequestId=Date.now().toString(36)+Math.random().toString(36).slice(2,10)),eraKeycardRequestId}window.getCwEmailRequestKeycardRequestId=eraGetOrCreateKeycardRequestId;
// Tracks in-flight fire-and-forget writes into keycardRequestHistory/{id} -
// specifically persistSignIdSignature() (per-card customer signature) and
// Issued By's own persist() below, both of which fire the instant ink is
// drawn with no caller ever awaiting them. eraMaybeBuildKeycardFormPdf()
// (right before Preview/Send) flushes this list first so it can't read the
// server-side doc before a just-drawn signature has actually landed -
// otherwise the merged PDF can silently ship missing that ink (2026-08-21
// "customer signature missing after Issued By" report; see
// docs/email-request-attachments-embed-tab.md).
let eraKeycardPendingSaves=[];
function eraTrackKeycardSave(p){eraKeycardPendingSaves.push(p);const done=function(){eraKeycardPendingSaves=eraKeycardPendingSaves.filter(function(x){return x!==p})};p.then(done,done);return p}
// Keycard Submission History "Edit" (see eraOpenKeycardFormForHistory() in
// the Keycard Form modal's own <script> block below) - re-points the
// requestId every subsequent Save/Insert/uploadKeycardPhotoId call keys off
// of at the EXISTING history doc being edited, instead of minting a fresh
// one, so re-saving an edited submission merges into the same
// keycardRequestHistory record rather than creating a duplicate.
window.setCwEmailRequestKeycardRequestId=function(id){eraKeycardRequestId=id};
let _="keycard";
// era_k_servesCard is deliberately EXCLUDED from the inline-style
// .era-mode-fields loop below (2026-08-22, per Huy's request: "remove this
// inline style for Serves"). It used to get a plain inline style.display
// like every other .era-mode-fields element, which - being an inline style -
// always won over its own .era-field-hidden CLASS (no !important) no matter
// what order the two ever raced in, so picking "Replacement" from the
// Keycard ▾ quick menu (a click that bubbles up through here right after
// that same click already hid this card via the class) kept resurrecting
// Serves as its own card. eraSyncKServesCardVisibility() below is now the
// ONLY thing that ever touches this element's visibility, and it only ever
// uses classList - no inline style involved at all anymore.
function eraSyncKServesCardVisibility(){
  const ksc=a("era_k_servesCard");
  if(!ksc)return;
  // Also hidden whenever any entry is set to Replacement (2026-09-05, per
  // Huy's request - "Remove the Serves card from the Replacement main
  // page"): Replacement already carries its own per-entry "Card Serves"
  // fields (era-k-replacement-row/updateReplExtra()), so the mode-level
  // Serves card is redundant/confusing once a Replacement card exists.
  // eraKeycardHasReplacement() is a function DECLARATION further down this
  // same script (hoisted), so it's safely callable here despite being
  // defined later in the file.
  const hide=_!=="keycard"||eraKeycardHasReplacement();
  ksc.classList.toggle("era-field-hidden",hide)
}
// era_k_locationGroup (2026-09-06, per Huy's request, Keycard > Transfer
// only) - hides the shared request-level Location + "+ Add location" when
// EVERY current keycard entry is set to Transfer (Transfer already collects
// its own per-entry Transfer From/To location(s)); "every", not "some", so a
// mixed-action request (e.g. one Transfer + one Activate entry) still shows
// Location for the non-Transfer entries. Every other mode is unaffected -
// this only ever hides the group while Keycard mode itself is active.
// Shared "every current keycard entry is Transfer" predicate (2026-09-06,
// per Huy's request) - factored out of eraSyncKLocationGroupVisibility()
// below so era_k_addEntryBtn's own hide (same function) and Le()'s
// Location-required check (further down) can reuse the exact same
// condition instead of each re-implementing it slightly differently.
function eraKeycardAllTransfer(){
  const list=Array.prototype.slice.call(c.querySelectorAll("#era_k_entries .era-entry-block"));
  return list.length>0&&list.every(function(r){return r.querySelector(".era-k-transfer").checked})
}
// Hardware family (2026-09-09, per Huy's request, Hardware tab spec item
// 1): Printer/Phone/Laptop's real content and the Hardware ▾ tab itself
// (which shows no field form of its own) all hide the shared Location card
// too - none of the three real Hardware-family modes uses the shared
// request-level Location field (Printer/Phone/Laptop each collect their own
// per-entry Location instead), so showing it there was dead weight.
function eraIsHardwareFamilyMode(){return _==="printer"||_==="phone"||_==="laptop"||_==="hardware"}
function eraSyncKLocationGroupVisibility(){
  const grp=a("era_k_locationGroup"),addBtn=a("era_k_addEntryBtn");
  if(_!=="keycard"){grp&&grp.classList.toggle("era-field-hidden",eraIsHardwareFamilyMode());addBtn&&addBtn.classList.remove("era-field-hidden");return}
  const allTransfer=eraKeycardAllTransfer();
  grp&&grp.classList.toggle("era-field-hidden",allTransfer);
  // era_k_addEntryBtn ("+ Add another keycard", adds a whole new Card/entry)
  // hides under the same condition (2026-09-06, per Huy's request) - a pure-
  // Transfer request already has its own in-entry "+Add Another Keycard"
  // (era-k-transfer-addKcBtn) for adding more keycards under the same
  // From/To location pair(s), so the top-level button is redundant/confusing
  // there; it reappears the moment any entry isn't Transfer.
  addBtn&&addBtn.classList.toggle("era-field-hidden",allTransfer)
}
// era_yourEmailGroup (2026-09-09, per Huy's request): "Your email" stays
// visible only on Keycard - every other mode (Wi-Fi/Electrical/Software/
// Hardware family) hides it per that request's own per-tab spec.
function eraSyncYourEmailGroupVisibility(){
  const grp=a("era_yourEmailGroup");
  grp&&grp.classList.toggle("era-field-hidden",_!=="keycard")
}
c.querySelectorAll("#era_tabs .era-tab").forEach(function(e){e.addEventListener("click",function(){
  // A tab with no data-mode at all (shouldn't exist among today's six, kept
  // as defensive code per the Hardware menu's own original note) must NOT
  // blank out whatever mode's fields are currently showing. Hardware itself
  // DOES carry data-mode="hardware" (since the 2026-09-02 access-control
  // pass) so a click on ITS OWN label (not one of its Printer/Phone/Laptop
  // leaves below, which stopPropagation() out of reaching here - see the
  // "Hardware tab dropdown" script block) still blanks the field area same
  // as picking any other mode with nothing registered for it - unchanged,
  // intentional (Hardware has no field form of its own).
  if(!e.getAttribute("data-mode"))return;
  eraActivateMode(e.getAttribute("data-mode"),e)})});

// ---- Keycard tab dropdown (2026-08-21) ----
// The Keycard tab's own click (mode switch) is already handled by the
// generic ".era-tab" listener just above, for both the tab's label and the
// menu's action items (a click on either bubbles up to that same listener
// on the outer ".era-tab-dropdown" div - not stopped here on purpose, so
// picking an action from, say, the Wi-Fi tab also jumps into Keycard mode,
// not just presets an action nobody can see yet). This block only layers
// the menu open/close chrome and the action-item -> per-entry Action
// <select> preset on top of that.
(function(){
  const ddTab=c.querySelector(".era-tab-dropdown");
  const ddMenu=a("era_k_tabDropdownMenu");
  if(!ddTab||!ddMenu)return;
  const ddLabel=ddTab.querySelector(".era-tab-dropdown-label");
  function closeDdMenu(){ddMenu.classList.remove("era-tab-dropdown-open")}
  // 2026-08-22 (per Huy's request): the tab's own box and the menu's box
  // (offset below it by margin-top:4px, see .era-tab-dropdown-menu above)
  // don't touch - there's a thin dead-zone gap between them. A plain
  // mouseleave-closes-immediately handler fires the instant the cursor
  // crosses into that gap on its way down to the menu, so the menu vanishes
  // before it can be reached. Debouncing the close (cancelable by either
  // element's mouseenter) instead of closing immediately survives that
  // brief gap crossing without having to fake a bigger hit-box or reflow
  // the visual layout.
  let ddCloseTimer=null;
  function scheduleDdClose(){clearTimeout(ddCloseTimer);ddCloseTimer=setTimeout(closeDdMenu,180)}
  function openDdMenu(){clearTimeout(ddCloseTimer);ddMenu.classList.add("era-tab-dropdown-open")}
  ddTab.addEventListener("mouseenter",openDdMenu);
  ddTab.addEventListener("mouseleave",scheduleDdClose);
  ddMenu.addEventListener("mouseenter",function(){clearTimeout(ddCloseTimer)});
  ddMenu.addEventListener("mouseleave",scheduleDdClose);
  document.addEventListener("click",function(ev){if(!ddTab.contains(ev.target))closeDdMenu()});
  // "Also have the swirl on the Keycard dropdown itself" (2026-08-23, per
  // Huy's request): the same Ki-particle swirl the menu's action items get
  // on hover (see spawnKiParticles() in the per-item loop below), now also
  // spawned on the "Keycard ▾" toggle (ddTab) while IT'S hovered - i.e.
  // before the menu even opens, not just once you're hovering an item
  // inside it. ddTab is already position:relative (see .era-tab-dropdown
  // CSS above) and its menu child is position:absolute/out-of-flow while
  // closed, so ddTab's own box is just the label's size - particles orbit
  // centered on "Keycard ▾" itself, not the whole dropdown footprint.
  // Deliberately a separate small block rather than folding ddTab into the
  // item loop below: ddTab isn't a ".era-tab-dropdown-item" and doesn't
  // want the glow/aura/jump-for-joy/beam-flash effects those items get on
  // click-to-pick - just the swirl.
  (function(){
    const KI_PARTICLE_COUNT=40;
    const KI_COLOR_CLASSES=["era-dd-ki-particle-y","era-dd-ki-particle-o","era-dd-ki-particle-r"];
    function spawnKiParticles(){
      for(let i=0;i<KI_PARTICLE_COUNT;i++){
        const p=document.createElement("span");
        p.className="era-dd-ki-particle "+KI_COLOR_CLASSES[Math.floor(Math.random()*KI_COLOR_CLASSES.length)];
        p.style.setProperty("--era-ki-angle",(Math.random()*360)+"deg");
        p.style.setProperty("--era-ki-radius",(20+Math.random()*30)+"px");
        p.style.setProperty("--era-ki-dur",(2.4+Math.random()*1.5)+"s");
        p.style.animationDelay=(Math.random()*1.2)+"s";
        ddTab.appendChild(p)
      }
    }
    function clearKiParticles(){
      ddTab.querySelectorAll(".era-dd-ki-particle").forEach(function(p){p.remove()})
    }
    ddTab.addEventListener("mouseenter",spawnKiParticles);
    ddTab.addEventListener("mouseleave",function(){
      clearKiParticles();
      ddTab.style.removeProperty("--era-ki-mx");
      ddTab.style.removeProperty("--era-ki-my")
    });
    // Same "swirl follows the cursor" behavior as the per-item version.
    ddTab.addEventListener("mousemove",function(ev){
      const rect=ddTab.getBoundingClientRect();
      ddTab.style.setProperty("--era-ki-mx",(ev.clientX-rect.left-rect.width/2)+"px");
      ddTab.style.setProperty("--era-ki-my",(ev.clientY-rect.top-rect.height/2)+"px")
    })
  })();
  // Hover glow (2026-08-22, per Huy's request): random color, no fixed
  // order, looping for as long as the item stays hovered - a fixed
  // @keyframes cycle can't do "random", so this picks a fresh color from
  // the palette on an interval instead and writes it into --era-dd-glow,
  // which the item's :hover rule (border-color/box-shadow) reads.
  const ddGlowColors=["#dc2626","#eab308","#16a34a","#9333ea"];
  ddMenu.querySelectorAll(".era-tab-dropdown-item").forEach(function(item){
    let glowTimer=null;
    function pickGlow(){
      let next;
      do{next=ddGlowColors[Math.floor(Math.random()*ddGlowColors.length)]}
      while(next===item.style.getPropertyValue("--era-dd-glow")&&ddGlowColors.length>1);
      item.style.setProperty("--era-dd-glow",next)
    }
    // "Super Saiyan power-up" Ki energy particles (2026-08-22, per Huy's
    // request: yellow/orange/red, busier + slower + random-pattern swirl,
    // then "100% more particles, reduce 50% swirling speed" later the same
    // day): forty dots spawned around the item (was 20), each with a
    // randomized (not evenly-spaced) start angle/orbit radius/speed/delay
    // so no two hovers ever swirl the same way, absorbing into the center
    // for as long as it's hovered (see .era-dd-ki-particle* / era-dd-ki-
    // absorb above) - same spawn-on-enter/clear-on-leave pattern as the
    // glow interval just above. The pulsing aura glow itself is pure CSS
    // (:hover::after) - no JS needed for that half.
    const KI_PARTICLE_COUNT=40;
    const KI_COLOR_CLASSES=["era-dd-ki-particle-y","era-dd-ki-particle-o","era-dd-ki-particle-r"];
    function spawnKiParticles(){
      for(let i=0;i<KI_PARTICLE_COUNT;i++){
        const p=document.createElement("span");
        p.className="era-dd-ki-particle "+KI_COLOR_CLASSES[Math.floor(Math.random()*KI_COLOR_CLASSES.length)];
        p.style.setProperty("--era-ki-angle",(Math.random()*360)+"deg");
        p.style.setProperty("--era-ki-radius",(20+Math.random()*30)+"px");
        // Another 50% slower on top of the earlier 1.2-1.95s range, i.e.
        // 2.4-3.9s now.
        p.style.setProperty("--era-ki-dur",(2.4+Math.random()*1.5)+"s");
        p.style.animationDelay=(Math.random()*1.2)+"s";
        item.appendChild(p)
      }
    }
    function clearKiParticles(){
      item.querySelectorAll(".era-dd-ki-particle").forEach(function(p){p.remove()})
    }
    // Fiery blue flame, ringed around the item's OUTSIDE edge (2026-08-22)
    // - built for De-activate per Huy's request, then reverted the same
    // day back to the shared Ki swirl (below) so every action looks the
    // same again. Left defined-but-unused here on purpose ("save the blue
    // flame") in case it's wanted again later: spawnFlames()/clearFlames()
    // just aren't wired into this item's mouseenter/mouseleave below
    // anymore. Each flame is a .era-dd-flame-holder>.era-dd-flame pair -
    // the holder is a static, unanimated rotate()-translateX()-rotate()
    // placement (same trick as the Ki swirl's orbit, just not moving) so
    // the flame stays upright at its ring position; the flame child alone
    // runs the flicker animation. Its CSS lives alongside era-dd-ki-*
    // above, also unused/dormant for the same reason.
    const FLAME_COUNT=10;
    function spawnFlames(){
      const radius=Math.max(item.offsetWidth,item.offsetHeight)/2+16;
      for(let i=0;i<FLAME_COUNT;i++){
        const angle=i*(360/FLAME_COUNT)+(Math.random()*10-5);
        const holder=document.createElement("span");
        holder.className="era-dd-flame-holder";
        holder.style.transform="rotate("+angle+"deg) translateX("+radius+"px) rotate("+(-angle)+"deg)";
        const f=document.createElement("span");
        f.className="era-dd-flame";
        f.style.setProperty("--era-flame-dur",(0.45+Math.random()*0.35)+"s");
        f.style.animationDelay=(Math.random()*0.4)+"s";
        holder.appendChild(f);
        item.appendChild(holder)
      }
    }
    function clearFlames(){
      item.querySelectorAll(".era-dd-flame-holder").forEach(function(h){h.remove()})
    }
    item.addEventListener("mouseenter",function(){
      pickGlow();
      glowTimer=setInterval(pickGlow,450);
      spawnKiParticles()
    });
    item.addEventListener("mouseleave",function(){
      clearInterval(glowTimer);
      glowTimer=null;
      clearKiParticles();
      item.style.removeProperty("--era-ki-mx");
      item.style.removeProperty("--era-ki-my")
    });
    // "The swirl should follow the cursor within the box" (2026-08-22) -
    // re-centers the whole Ki absorb swirl on the pointer's current
    // position instead of always converging on the item's dead center; see
    // the --era-ki-mx/--era-ki-my usage on .era-dd-ki-particle above.
    item.addEventListener("mousemove",function(ev){
      const rect=item.getBoundingClientRect();
      const mx=ev.clientX-rect.left-rect.width/2;
      const my=ev.clientY-rect.top-rect.height/2;
      item.style.setProperty("--era-ki-mx",mx+"px");
      item.style.setProperty("--era-ki-my",my+"px")
    });
    item.addEventListener("click",function(){
      const action=this.getAttribute("data-k-action");
      const firstEntry=c.querySelector("#era_k_entries .era-entry-block");
      const sel=firstEntry&&firstEntry.querySelector(".era-k-action-select");
      if(sel){sel.value=action,sel.dispatchEvent(new Event("change",{bubbles:!0}))}
      // Blue "light travels in from all four sides and confirms the pick"
      // flash (see the .era-dd-select-flash / .era-dd-beam-* rules above)
      // - re-add the item's flash class in case the same action gets
      // clicked twice in a row (a class already present won't restart its
      // animation), spawn the four beam spans fresh each time, and delay
      // the menu close just long enough (matches the .5s animation) for
      // the flash to actually be seen before the menu vanishes.
      item.classList.remove("era-dd-select-flash");
      item.querySelectorAll(".era-dd-beam").forEach(function(b){b.remove()});
      void item.offsetWidth;
      item.classList.add("era-dd-select-flash");
      ["l","r","t","b"].forEach(function(side){
        const beam=document.createElement("span");
        beam.className="era-dd-beam era-dd-beam-"+side;
        item.appendChild(beam)
      });
      setTimeout(function(){
        item.classList.remove("era-dd-select-flash");
        item.querySelectorAll(".era-dd-beam").forEach(function(b){b.remove()})
      },500);
      setTimeout(closeDdMenu,500)
    })
  })
})();

// ---- Wi-Fi tab dropdown (2026-08-22, later pass, per Huy's request) ----
// Same shape as the Keycard tab dropdown above (own open/close chrome,
// item click bubbles up to the outer ".era-tab-dropdown[data-mode=wifi]"
// for the mode switch - not stopped here, same reasoning as Keycard's).
// This is the actual "Dropdown Cubework and Unis" from the original ask -
// two earlier attempts put a dropdown INSIDE the Wi-Fi form instead
// (first collapsing Serves into one, then a redundant standalone "Request
// Type" <select>), both wrong; era_w_requestType is now a hidden backing
// field only (see its own comment in the markup above).
(function(){
  const ddTab=c.querySelector('.era-tab-dropdown[data-mode="wifi"]');
  const ddMenu=a("era_w_tabDropdownMenu");
  if(!ddTab||!ddMenu)return;
  let ddCloseTimer=null;
  function closeDdMenu(){ddMenu.classList.remove("era-tab-dropdown-open")}
  function scheduleDdClose(){clearTimeout(ddCloseTimer);ddCloseTimer=setTimeout(closeDdMenu,180)}
  function openDdMenu(){clearTimeout(ddCloseTimer);ddMenu.classList.add("era-tab-dropdown-open")}
  ddTab.addEventListener("mouseenter",openDdMenu);
  ddTab.addEventListener("mouseleave",scheduleDdClose);
  ddMenu.addEventListener("mouseenter",function(){clearTimeout(ddCloseTimer)});
  ddMenu.addEventListener("mouseleave",scheduleDdClose);
  document.addEventListener("click",function(ev){if(!ddTab.contains(ev.target))closeDdMenu()});
  ddMenu.querySelectorAll(".era-tab-dropdown-item").forEach(function(item){
    item.addEventListener("click",function(){
      it("era_w_requestType",this.getAttribute("data-w-serves"));
      closeDdMenu()
    })
  });
  // "Ice spikes explosion" hover effect - only possible here because this
  // is a real <div>-based dropdown, unlike the native <select> both
  // earlier attempts were stuck with (a browser draws a <select>'s open
  // popup itself, not the page, so it can never carry a custom hover
  // effect - see the doc's Wi-Fi changelog). eraWireIceSpikesHover() is
  // defined further down in this script (a plain function declaration,
  // hoisted, so it's callable here already) and works on any element id.
  // Covers the whole Wi-Fi tab dropdown (era_w_tabDropdown - label + open
  // menu, both items), so spikes track the cursor across the entire
  // dropdown, not just one menu item. Same-day attempts to rename this to
  // "Rain" and move it to the Printer tab were both reverted per Huy's
  // follow-up requests.
  eraWireIceSpikesHover("era_w_tabDropdown");
})();

// ---- Electrical tab dropdown (2026-09-09, per Huy's request) ----
// Same shape/chrome as the Wi-Fi tab dropdown just above - own open/close
// timing, item click bubbles up to the outer
// ".era-tab-dropdown[data-mode=electrical]" for the mode switch (not
// stopped here). Replaces the Electrical card's own plain Serves/Create/
// Troubleshoot/De-activate checkboxes (era_el_servesGroup/era_el_actionGroup
// in the markup, both permanently era-field-hidden now) as the sole way to
// pick them - each item sets both backing checkbox groups via p() (defined
// further down, hoisted - p() also dispatches "change", so ELex()/ELbody()/
// Q(elCfg) further down - the exact same functions the raw checkboxes
// already wired to before this change - run completely unchanged).
(function(){
  const ddTab=c.querySelector('.era-tab-dropdown[data-mode="electrical"]');
  const ddMenu=a("era_el_tabDropdownMenu");
  if(!ddTab||!ddMenu)return;
  let ddCloseTimer=null;
  function closeDdMenu(){ddMenu.classList.remove("era-tab-dropdown-open")}
  function scheduleDdClose(){clearTimeout(ddCloseTimer);ddCloseTimer=setTimeout(closeDdMenu,180)}
  function openDdMenu(){clearTimeout(ddCloseTimer);ddMenu.classList.add("era-tab-dropdown-open")}
  ddTab.addEventListener("mouseenter",openDdMenu);
  ddTab.addEventListener("mouseleave",scheduleDdClose);
  ddMenu.addEventListener("mouseenter",function(){clearTimeout(ddCloseTimer)});
  ddMenu.addEventListener("mouseleave",scheduleDdClose);
  document.addEventListener("click",function(ev){if(!ddTab.contains(ev.target))closeDdMenu()});
  ddMenu.querySelectorAll(".era-tab-dropdown-item").forEach(function(item){
    item.addEventListener("click",function(){
      const serves=this.getAttribute("data-el-serves"),action=this.getAttribute("data-el-action");
      p("era_el_serves_cubework",serves==="Cubework");
      p("era_el_serves_unis",serves==="Unis");
      p("era_el_create",action==="create");
      p("era_el_troubleshoot",action==="troubleshoot");
      p("era_el_deactivate",action==="deactivate");
      closeDdMenu()
    })
  });
})();

// ---- Software tab dropdown (2026-09-09, per Huy's request) ----
// Same top-level open/close chrome as the Hardware ▾ menu (own gap-crossing
// debounce), reusing its .era-hw-menu/.era-hw-leaf/.era-hw-realleaf CSS
// wholesale rather than duplicating it - the category/sub-cascade CSS is
// depth-agnostic (".era-hw-menu-item:hover > .era-hw-submenu") so a third
// nesting level (Cubework/Unis > Laptop/Phone > action) works with zero new
// rules. Every leaf is a real leaf (era-hw-realleaf) - none of the 12 picks
// is a placeholder - so each one both presets the target mode's own
// Serves/action state via p()/it() and switches straight into it via
// eraActivateMode(), same "preset then switch" shape the Printer picks in
// the Hardware ▾ menu already use.
(function(){
  const ddTab=a("era_ap_tabDropdown");
  const ddMenu=a("era_ap_tabDropdownMenu");
  if(!ddTab||!ddMenu)return;
  let ddCloseTimer=null;
  function closeDdMenu(){ddMenu.classList.remove("era-tab-dropdown-open")}
  function scheduleDdClose(){clearTimeout(ddCloseTimer);ddCloseTimer=setTimeout(closeDdMenu,180)}
  function openDdMenu(){clearTimeout(ddCloseTimer);ddMenu.classList.add("era-tab-dropdown-open")}
  ddTab.addEventListener("mouseenter",openDdMenu);
  ddTab.addEventListener("mouseleave",scheduleDdClose);
  ddMenu.addEventListener("mouseenter",function(){clearTimeout(ddCloseTimer)});
  ddMenu.addEventListener("mouseleave",scheduleDdClose);
  document.addEventListener("click",function(ev){if(!ddTab.contains(ev.target))closeDdMenu()});
  ddMenu.querySelectorAll(".era-hw-realleaf[data-ap-device]").forEach(function(leaf){
    leaf.addEventListener("click",function(ev){
      ev.stopPropagation();
      const serves=this.getAttribute("data-ap-serves"),device=this.getAttribute("data-ap-device"),action=this.getAttribute("data-ap-action");
      if(device==="laptop"){
        eraActivateMode("laptop",ddTab);
        p("era_lt_serves_cubework",serves==="Cubework");
        p("era_lt_serves_unis",serves==="Unis");
        p("era_lt_create",action==="create");
        p("era_lt_troubleshoot",action==="troubleshoot");
        p("era_lt_remove",action==="remove");
      }else{
        eraActivateMode("phone",ddTab);
        it("era_ph_serves",serves);
        const firstEntry=c.querySelector("#era_ph_entries .era-entry-block");
        const sel=firstEntry&&firstEntry.querySelector(".era-ph-action-select");
        if(sel){sel.value=action,sel.dispatchEvent(new Event("change",{bubbles:!0}))}
      }
      closeDdMenu();
    })
  });
})();

// ---- Hardware tab dropdown (2026-09-02, per Huy's request; Printer/Phone/
// Laptop folded in 2026-09-04, later pass) ----
// Top-level open/close chrome (hover the tab to open, debounced close so
// crossing the small gap between tab and menu doesn't snap it shut) - same
// pattern as the Keycard/Wi-Fi dropdowns above. A plain leaf click (data-
// hw-action, still AP/Node/Camera/NVR/New Hire's placeholder actions) does
// NOT bubble into any mode switch, same as always - it just records the pick
// on window.eraLastHardwareSelection and fires an "era:hardware-selected"
// CustomEvent for a future field form to wire into. The category -> submenu
// -> sub-submenu cascades themselves need no JS at all - see the
// .era-hw-submenu CSS rule's own comment for why.
//
// 2026-09-04 addition (per Huy's request): Printer/Phone/Laptop moved in
// here from their own top-level tabs, each a REAL leaf now (unlike the
// placeholder ones above) - picking any of them actually switches mode via
// eraActivateMode(), same as clicking those tabs used to.
// - .era-hw-realleaf (Phone/Laptop): flat leaves, no preset, straight mode
//   switch - mirrors the old plain-tab click exactly.
// - Printer (#era_pr_tabDropdown, moved here wholesale, same ids so its
//   thunderstorm hover effect keeps working untouched): its own
//   .era-hw-item-label is directly clickable (mode switch, no preset - the
//   "Printer is a direct selectable option" behavior, same as the old
//   standalone tab's label click), and its Cubework/Tenant items (still
//   .era-tab-dropdown-item, same data-pr-serves/data-pr-action attributes)
//   preset the same five checkboxes via p() (hoisted, defined further down)
//   exactly as before, THEN also switch mode - previously that switch
//   happened by letting the click bubble up to the tab's own data-mode; now
//   that Printer has no top-level tab of its own to bubble to, it's done
//   explicitly here instead, with stopPropagation() so it never reaches
//   Hardware's OWN data-mode="hardware" click handling above.
// Every one of these closes the WHOLE cascade on pick (closeDdMenu(), the
// same one top-level class toggle used everywhere else in this block) -
// there's no per-level state to unwind since every level below the top is
// pure CSS :hover.
(function(){
  const ddTab=a("era_hw_tabDropdown");
  const ddMenu=a("era_hw_tabDropdownMenu");
  if(!ddTab||!ddMenu)return;
  let ddCloseTimer=null;
  function closeDdMenu(){ddMenu.classList.remove("era-tab-dropdown-open")}
  function scheduleDdClose(){clearTimeout(ddCloseTimer);ddCloseTimer=setTimeout(closeDdMenu,180)}
  function openDdMenu(){clearTimeout(ddCloseTimer);ddMenu.classList.add("era-tab-dropdown-open")}
  ddTab.addEventListener("mouseenter",openDdMenu);
  ddTab.addEventListener("mouseleave",scheduleDdClose);
  ddMenu.addEventListener("mouseenter",function(){clearTimeout(ddCloseTimer)});
  ddMenu.addEventListener("mouseleave",scheduleDdClose);
  document.addEventListener("click",function(ev){if(!ddTab.contains(ev.target))closeDdMenu()});
  ddMenu.querySelectorAll(".era-hw-leaf:not(.era-hw-realleaf)").forEach(function(leaf){
    leaf.addEventListener("click",function(ev){
      ev.stopPropagation();
      const action=this.getAttribute("data-hw-action");
      window.eraLastHardwareSelection=action;
      leaf.dispatchEvent(new CustomEvent("era:hardware-selected",{bubbles:true,detail:action}));
      closeDdMenu();
    })
  });
  ddMenu.querySelectorAll(".era-hw-realleaf[data-hw-realmode]").forEach(function(leaf){
    leaf.addEventListener("click",function(ev){
      ev.stopPropagation();
      eraActivateMode(this.getAttribute("data-hw-realmode"),ddTab);
      closeDdMenu();
    })
  });
  const prTab=a("era_pr_tabDropdown");
  const prMenu=a("era_pr_tabDropdownMenu");
  if(prTab&&prMenu){
    const prLabel=prTab.querySelector(".era-hw-item-label");
    if(prLabel)prLabel.addEventListener("click",function(ev){
      ev.stopPropagation();
      eraActivateMode("printer",ddTab);
      closeDdMenu();
    });
    prMenu.querySelectorAll(".era-tab-dropdown-item").forEach(function(item){
      item.addEventListener("click",function(ev){
        ev.stopPropagation();
        const serves=this.getAttribute("data-pr-serves");
        const action=this.getAttribute("data-pr-action");
        p(serves==="Tenant"?"era_pr_tenant":"era_pr_cubework",true);
        p(action==="create"?"era_pr_create":action==="newreplace"?"era_pr_newreplace":"era_pr_troubleshoot",true);
        eraActivateMode("printer",ddTab);
        closeDdMenu();
      })
    });
    // Printer-only "thunder storm" hover effect (2026-08-23, per Huy's
    // request) - unaffected by the move, still scoped to this one id.
    eraWireThunderStormHover("era_pr_tabDropdown");
  }
})();

// ---- Phoenix background flight controller (2026-08-22, "random route and
// flying, more life like"; swapped to Huy's phoenix-fire-bg.png later that
// day) ----
// Drives #era_phoenix_bg's <img> position/heading/facing every frame via
// requestAnimationFrame instead of a fixed @keyframes loop: picks a random
// point somewhere in the viewport, steers toward it at a randomized speed,
// and picks a fresh random point (+ fresh speed) once it arrives - so the
// flight path never repeats the same loop twice. Heading is derived from
// the actual direction of travel each frame (a subtle bank tilt, plus a
// horizontal flip so the phoenix - facing right in the source photo - turns
// to face left when flying that way instead of sliding backwards). Since a
// flat photo has no separate wing layer to flap independently (unlike the
// old hand-built SVG), the "flap" is a small scaleY breathing motion
// synthesized right into this same per-frame transform, sped up or slowed
// down with current flight speed so faster flying reads as more effort.
//
// 2026-08-22, later still ("it work but it's just an image floating around
// LOL") - a lone image drifting in a straight line with a gentle squash
// reads as floating, not flying, so this adds: (1) banking INTO turns
// (tracks the heading's own rate of change and rolls proportionally to it,
// smoothed frame to frame, the way a bird/plane visibly leans into a
// course change instead of just tilting from vertical speed), (2) a small
// altitude bob synced to the wingbeat phase (real flapping flight bounces
// slightly with each beat, it's not a flat glide), and (3) a trailing fire
// - small ember spans spawned periodically behind its direction of travel
// that drift and fade out (.era-phoenix-ember below), selling both motion
// and "it's on fire" at once.
// 2026-08-22, later still ("how come the background is visible? i thought
// it was PNG background and supposed to be transparent") - turns out
// phoenix-fire-bg.png has NO alpha channel at all: it's an 8-bit palette
// PNG (color type 3) with no tRNS chunk, so that checkerboard visible in
// file previews was baked into the actual pixels, not a transparency
// indicator. Rather than needing a re-export from Huy, this strips it at
// runtime with a canvas chroma-key: sample the four corner pixels (the
// checker background), then make any pixel that's both grayscale AND close
// to one of those sampled colors fully transparent. Safe here specifically
// because the checker is neutral gray/white and every real phoenix pixel is
// warm (red/orange/gold - R and G channels well above B), so it can't
// false-positive onto the artwork itself.
function eraStripCheckerBackground(imgEl,onDone){
  const src=new Image();
  src.onload=function(){
    const cv=document.createElement("canvas");
    cv.width=src.naturalWidth;
    cv.height=src.naturalHeight;
    const ctx=cv.getContext("2d");
    ctx.drawImage(src,0,0);
    let data;
    try{data=ctx.getImageData(0,0,cv.width,cv.height)}catch(e){return}
    const px=data.data;
    function at(x,y){const i=(y*cv.width+x)*4;return[px[i],px[i+1],px[i+2]]}
    const bg=[at(0,0),at(cv.width-1,0),at(0,cv.height-1),at(cv.width-1,cv.height-1)];
    for(let i=0;i<px.length;i+=4){
      const r=px[i],g=px[i+1],b=px[i+2];
      const isGray=(Math.max(r,g,b)-Math.min(r,g,b))<14;
      if(isGray&&bg.some(function(c){return Math.abs(r-c[0])<26&&Math.abs(g-c[1])<26&&Math.abs(b-c[2])<26})){
        px[i+3]=0
      }
    }
    ctx.putImageData(data,0,0);
    onDone(cv.toDataURL("image/png"))
  };
  src.src=imgEl.src
}
(function(){
  const trailHost=c.querySelector("#era_phoenix_bg");
  const templateImg=trailHost&&trailHost.querySelector("img");
  const templateAshes=trailHost&&trailHost.querySelector(".era-phoenix-ashes");
  const templateEgg=trailHost&&trailHost.querySelector(".era-phoenix-egg");
  // 2026-08-27, 5-theme spawn rewrite: one more hidden clone template per
  // new theme (see the markup comment next to #era_phoenix_bg) - templatePortal
  // is missing on a page that hasn't picked up this markup change yet (e.g. a
  // stale cached HTML during a rolling deploy), in which case spawnPhoenix()
  // below falls back to the original ashes/egg-only sequence rather than
  // erroring on a null clone.
  const templatePortal=trailHost&&trailHost.querySelector(".era-phoenix-portal");
  const templateShadow=trailHost&&trailHost.querySelector(".era-phoenix-shadow-orb");
  const templateRock=trailHost&&trailHost.querySelector(".era-phoenix-rock");
  const templateCloud=trailHost&&trailHost.querySelector(".era-phoenix-cloud-mass");
  const templateIce=trailHost&&trailHost.querySelector(".era-phoenix-ice-block");
  if(!trailHost||!templateImg)return;
  function randRange(lo,hi){return lo+Math.random()*(hi-lo)}
  function noAnim(){return document.body.classList.contains("no-animations")}
  // 2026-08-27, later pass (per Huy's "up to 5 phoenixes flying
  // independently, spawn one more every 20s, never reset the whole
  // animation"): the static ashes/egg/img markup in the HTML only ever
  // served a single phoenix for the tab's whole lifetime. It now stays in
  // the DOM purely as a hidden clone template - every phoenix (including
  // the first) gets its own freshly-created ashes/egg/img trio via
  // spawnPhoenix() below, so N phoenixes can be independently mid-birth or
  // mid-flight at once without fighting each other over shared elements.
  templateImg.style.display="none";
  if(templateAshes)templateAshes.style.display="none";
  if(templateEgg)templateEgg.style.display="none";
  [templatePortal,templateShadow,templateRock,templateCloud,templateIce].forEach(function(el){
    if(el)el.style.display="none"
  });
  // phoenix-fire-bg.png has no alpha channel (see eraStripCheckerBackground
  // above) - stripped once and cached as a data URL so every phoenix's own
  // <img> reuses the same already-transparent source instead of re-running
  // the checker-removal canvas work per spawn.
  let strippedSrc=null,strippedWaiters=[];
  function withStrippedSrc(cb){
    if(strippedSrc){cb(strippedSrc);return}
    strippedWaiters.push(cb);
    if(strippedWaiters.length>1)return;
    eraStripCheckerBackground(templateImg,function(dataUrl){
      strippedSrc=dataUrl;
      strippedWaiters.forEach(function(fn){fn(dataUrl)});
      strippedWaiters=[]
    })
  }
  // 2026-08-27, later pass (per Huy's "keep the whole animation - including
  // ongoing flight, not just the hatch intro - confined to the left or right
  // side of the screen, vertically around the middle, never the center/
  // behind the header or the content card; restart the full sequence every
  // 30s, randomly picking a side each time"): pickTarget()/pickLeftSpawn()
  // (both left-only, and pickTarget let flight roam the full viewport width
  // once hatched) are replaced by this single side-aware picker, used for
  // BOTH the hatch intro's fixed spawn point and every in-flight waypoint -
  // so the phoenix never leaves its assigned side band for the rest of that
  // cycle. cardLeftEdge/cardRightEdge below are the era-wrap card's own
  // math (max-width:640px, margin:0 auto - confirmed against its live
  // getBoundingClientRect(), not just assumed), kept as a literal here
  // rather than reading the CSS custom property since this script never
  // otherwise touches it. The vertical band is the same yLo/yHi window
  // regardless of side - roughly the middle 20%-60% of the space below
  // whatever's pinned/stacked at the top of the page (see getChromeBottom()
  // below) - so "around the middle" holds however wide/tall the viewport is.
  //
  // Bugfix, two rounds (per Huy's screenshots: the egg's own glow visibly
  // overlapped the header bar, twice): round 1 fixed pos.y (the shape's
  // CENTER, via translate(-50%,-50%)) being clamped against a bare
  // header-height floor with no allowance for the shape's own half-height/
  // glow - a center at the floor still put the top edge well above it. Round
  // 2 found the floor itself was wrong: this tab actually stacks header
  // (~63px) + a promotional hero banner (#appHero, normal-flow, ~228px on a
  // typical viewport - NOT a fixed literal, its height depends on the
  // rotating copy it's showing) + the sticky app-switcher tab strip
  // (#appSwitcher, ~53px) before any real content starts, none of which the
  // original 150px guess accounted for. Rather than hardcode yet another
  // guessed number (which breaks again the next time any of those three
  // change height), getChromeBottom() below measures all three LIVE via
  // getBoundingClientRect() every time a spawn point is picked - since
  // #appHero is normal-flow, its contribution shrinks to 0 (and eventually
  // negative, clamped away) once the page scrolls past it, and since header/
  // switcher are sticky their bottoms stay pinned near the top post-scroll -
  // so this self-corrects both on load and after scrolling, not just at the
  // one viewport size this bug was caught at.
  function getChromeBottom(){
    let bottom=0;
    [document.querySelector("header"),document.getElementById("appHero"),document.getElementById("appSwitcher")].forEach(function(el){
      if(!el)return;
      if(getComputedStyle(el).display==="none")return;
      const b=el.getBoundingClientRect().bottom;
      if(b>bottom)bottom=b
    });
    return bottom
  }
  function pickSideSpawn(side,dispW,dispH){
    const maxX=Math.max(0,window.innerWidth-dispW);
    const maxY=Math.max(0,Math.min(window.innerHeight-dispH,window.innerHeight*0.68));
    const cardLeftEdge=Math.max(0,window.innerWidth/2-320);
    const cardRightEdge=Math.min(window.innerWidth,window.innerWidth/2+320);
    // Buffer wider than either shape's own half-width/height (ashes 130px/
    // egg 108px tall, so 65/54 at most, and the flight image itself) so
    // nothing can visually touch the card's edge, not just avoid its exact
    // center point.
    const shapeHalf=90;
    // pos.y is the shape's CENTER (translate(-50%,-50%)), so the floor needs
    // the live chrome bottom PLUS shapeHalf to keep the shape's actual top
    // edge/glow - not just its center point - clear of the header/hero/
    // switcher stack.
    const topSafeY=getChromeBottom()+shapeHalf;
    const yLo=Math.min(maxY,Math.max(topSafeY,maxY*0.2));
    const yHi=Math.max(yLo,Math.min(maxY,maxY*0.6));
    let xLo,xHi;
    if(side==="right"){
      const leftSafeX=Math.min(maxX,Math.max(0,cardRightEdge+shapeHalf));
      // On a narrow viewport the card can leave no right-side gutter at all
      // (leftSafeX collapses to maxX) - fall back to a small fixed band
      // hugging the right edge rather than refusing to spawn, since staying
      // on-screen and on the right still both matter more than a gutter
      // that doesn't exist at that width.
      const rightSpan=Math.max(30,Math.min((maxX-leftSafeX)||30,window.innerWidth*0.16));
      xHi=maxX;
      xLo=Math.max(leftSafeX,maxX-rightSpan);
    } else {
      const rightSafeX=Math.max(0,cardLeftEdge-shapeHalf);
      const leftSpan=Math.max(30,Math.min(rightSafeX||30,window.innerWidth*0.16));
      xLo=0;
      xHi=Math.min(leftSpan,maxX);
    }
    if(xHi<xLo)xHi=xLo;
    return { x: randRange(xLo,xHi), y: randRange(yLo,yHi) }
  }
  // 2026-08-27, later pass (per Huy's "after hatching, phoenix flight has no
  // left/right restriction - can fly freely across the center, including
  // flying off and back on screen"): used for every in-flight waypoint once
  // a phoenix has hatched, unlike pickSideSpawn above which stays confined
  // to the birth stage only. Only a light header buffer is kept (not the
  // hard chrome/card exclusion pickSideSpawn uses) since #era_phoenix_bg is
  // z-index:-1 - already rendered behind all real content, so brushing under
  // the header/hero or the content card is harmless, unlike during birth
  // when the shapes need to stay clearly visible/unobstructed. A fraction of
  // targets deliberately land just past the viewport edge so a phoenix can
  // naturally exit and re-enter mid-flight rather than always staying fully
  // on-screen.
  function pickFreeTarget(dispW,dispH){
    const maxX=Math.max(0,window.innerWidth-dispW);
    const maxY=Math.max(0,window.innerHeight-dispH);
    const topSafeY=Math.min(maxY,getChromeBottom()*0.4);
    if(Math.random()<0.22){
      const exitLeft=Math.random()<0.5;
      return { x: exitLeft?-dispW*randRange(0.6,1.2):window.innerWidth+dispW*randRange(0.6,1.2), y: randRange(topSafeY,maxY) }
    }
    return { x: randRange(0,maxX), y: randRange(topSafeY,maxY) }
  }
  // A guaranteed off-screen point, used only to send an end-of-life phoenix
  // out of view before it's actually removed (see despawn() below) - "wait
  // until one finishes/disappears" implies phoenixes leave the way they
  // arrived (by flying off), not just vanishing mid-air.
  function pickExitTarget(dispW,dispH){
    const exitLeft=Math.random()<0.5;
    return { x: exitLeft?-dispW*1.4:window.innerWidth+dispW*1.4, y: randRange(0,Math.max(0,window.innerHeight-dispH)) }
  }
  // 2026-08-28 (per Huy's "let phoenixes randomly land and park along the
  // bottom edge while flying"): unlike pickFreeTarget, this is never allowed
  // to land off-screen or past an edge - a parked phoenix needs to actually
  // read as "resting on the bottom of the screen", not just briefly passing
  // through it - so both axes are clamped strictly inside
  // [0, innerWidth-dispW]/[0, innerHeight-dispH] with no exit-style overshoot
  // and no free-flight-style edge bias. `bottomMargin` keeps the shape's true
  // bottom edge (translate3d's reference point is the image's own top-left,
  // same as the rest of this controller) a few px clear of the actual
  // viewport bottom so glow/feathers don't get visually clipped by the
  // browser chrome or a mobile safe-area inset.
  function pickLandingSpot(dispW,dispH){
    const maxX=Math.max(0,window.innerWidth-dispW);
    const bottomMargin=10;
    const y=Math.max(0,window.innerHeight-dispH-bottomMargin);
    return { x: randRange(0,maxX), y: y }
  }
  // 2026-08-27, later same day (per Huy's "before the ashes animation
  // starts, have a couple of lightning strikes hit the spot") - reuses the
  // Printer-tab thunderstorm effect's own CSS wholesale (era-thunder-bolt/
  // -flash/-spark/-crack, see their definitions/comments further up this
  // file) instead of building a new lightning look: same bolt+flash+spark-
  // burst+ground-crack quartet, just anchored at an arbitrary point via the
  // same --era-thunder-mx/-my offset-from-center trick eraWireThunderStorm-
  // Hover() already uses (mx/my are the strike point's offset from
  // trailHost's own center - trailHost/#era_phoenix_bg is position:fixed;
  // inset:0, so that's the same as an offset from the viewport's center).
  // Deliberately keeps its own local color palette instead of reaching for
  // that other function's module-scope THUNDER_COLORS/THUNDER_SPARK_COUNT
  // consts (declared later in this same script, so referencing them here
  // would work too - see the setTimeout note below - but a small self-
  // contained literal keeps this helper readable on its own).
  // 2026-08-27, later still (per Huy's "make lightning strike 10 times,
  // using different lightning colors"): grew from 3 to 7 colors (added
  // gold/green/red/cyan alongside white/blue/purple - see their CSS further
  // up this file) and spawnLightningStrike now takes an optional forceColor
  // so the caller can hand each of the 10 strikes a color from a shuffled,
  // no-immediate-repeat sequence (pickLightningColorSequence below) instead
  // of leaving it to chance - purely random picks over 10 draws from 7
  // colors regularly repeat the same color back-to-back, which reads as
  // "not actually varied" even though it technically is.
  const ERA_LIGHTNING_COLORS=["white","blue","purple","gold","green","red","cyan"];
  // 2026-08-27, later still (per Huy's "make each phoenix that hatches a
  // different color"): phoenix-fire-bg.png is a single baked-in-orange
  // source image, so per-phoenix recoloring is done with a CSS filter
  // (hue-rotate) applied to that phoenix's own <img> rather than swapping
  // image assets - cheap, and the existing drop-shadow glow (see the CSS
  // rule for #era_phoenix_bg img) is recolored to match via the paired
  // "glow" entry so the ambient glow doesn't stay fixed orange while the
  // bird itself shifts color. Each spawnPhoenix() picks one entry at
  // random (see spawnPhoenix below) - independent phoenixes can and do
  // repeat a color, same as the lightning sequence allows repeats across
  // different phoenixes' strikes.
  const ERA_PHOENIX_HATCH_COLORS=[
    {hue:"0deg",glow:"rgba(249,115,22,.45)"},   // original fire orange
    {hue:"340deg",glow:"rgba(239,68,68,.45)"},  // red
    {hue:"270deg",glow:"rgba(168,85,247,.45)"}, // purple
    {hue:"200deg",glow:"rgba(59,130,246,.45)"}, // blue
    {hue:"150deg",glow:"rgba(34,197,94,.45)"},  // green
    {hue:"50deg",glow:"rgba(234,179,8,.45)"},   // gold
    {hue:"180deg",glow:"rgba(34,211,238,.45)"}, // cyan
    {hue:"320deg",glow:"rgba(236,72,153,.45)"}  // pink
  ];
  function pickLightningColorSequence(n){
    const seq=[];
    let last=null;
    for(let i=0;i<n;i++){
      let c;
      do{ c=ERA_LIGHTNING_COLORS[Math.floor(Math.random()*ERA_LIGHTNING_COLORS.length)] }
      while(c===last && ERA_LIGHTNING_COLORS.length>1);
      seq.push(c);
      last=c
    }
    return seq
  }
  // Bugfix (2026-08-27, per Huy's report "the lightning strikes at the
  // right but the egg spawn at the left"): this used to convert cx,cy into
  // a center-relative offset by measuring trailHost.getBoundingClientRect()
  // - correct IF trailHost is actually rendered at the moment a strike
  // fires, but #era_phoenix_bg lives inside the CW Email Request tab's own
  // view container, which can still be display:none this early (the
  // lightning prelude fires immediately/synchronously, before the async
  // sign-in -> role/tab-restore sequence has necessarily picked that tab to
  // show). getBoundingClientRect() on a display:none ancestor's descendant
  // comes back all-zero, so rect.width/height silently collapsed to 0,
  // turning "mx=cx-rect.left-rect.width/2" into just "mx=cx" - shoving
  // every strike right by ~half the screen width while the ashes/egg (whose
  // left/top are plain inline styles, unaffected by a hidden ancestor)
  // still landed at the correct spot. trailHost is always position:fixed;
  // inset:0, so its true center IS window.innerWidth/2,innerHeight/2
  // whether or not it's currently rendered - measuring the element was
  // never actually necessary.
  function spawnLightningStrike(cx,cy,forceColor){
    const mx=cx-window.innerWidth/2;
    const my=cy-window.innerHeight/2;
    const color=forceColor||ERA_LIGHTNING_COLORS[Math.floor(Math.random()*ERA_LIGHTNING_COLORS.length)];
    const dur=(0.5+Math.random()*0.35)+"s";
    const bolt=document.createElement("span");
    bolt.className="era-thunder-bolt era-thunder-bolt-"+color;
    bolt.style.setProperty("--era-thunder-mx",mx+"px");
    bolt.style.setProperty("--era-thunder-my",my+"px");
    bolt.style.setProperty("--era-thunder-tilt",(Math.random()*24-12)+"deg");
    bolt.style.setProperty("--era-thunder-len",(60+Math.random()*50)+"px");
    bolt.style.setProperty("--era-thunder-dur",dur);
    bolt.addEventListener("animationend",function(){bolt.remove()});
    trailHost.appendChild(bolt);
    const flash=document.createElement("span");
    flash.className="era-thunder-flash era-thunder-flash-"+color;
    flash.style.setProperty("--era-thunder-mx",mx+"px");
    flash.style.setProperty("--era-thunder-my",my+"px");
    flash.style.setProperty("--era-thunder-dur",dur);
    flash.addEventListener("animationend",function(){flash.remove()});
    trailHost.appendChild(flash);
    for(let i=0;i<6;i++){
      const spark=document.createElement("span");
      spark.className="era-thunder-spark era-thunder-spark-"+color;
      spark.style.setProperty("--era-thunder-mx",mx+"px");
      spark.style.setProperty("--era-thunder-my",my+"px");
      spark.style.setProperty("--era-spark-angle",(Math.random()*360)+"deg");
      spark.style.setProperty("--era-spark-dist",(20+Math.random()*34)+"px");
      spark.style.setProperty("--era-thunder-dur",(0.35+Math.random()*0.3)+"s");
      spark.addEventListener("animationend",function(){spark.remove()});
      trailHost.appendChild(spark)
    }
    const crack=document.createElement("span");
    crack.className="era-thunder-crack era-thunder-crack-"+color;
    crack.style.setProperty("--era-thunder-mx",mx+"px");
    crack.style.setProperty("--era-thunder-my",my+"px");
    crack.style.setProperty("--era-crack-rot",(Math.random()*360)+"deg");
    crack.style.setProperty("--era-thunder-crack-dur",(1.0+Math.random()*0.4)+"s");
    crack.addEventListener("animationend",function(){crack.remove()});
    trailHost.appendChild(crack)
  }
  // colors (optional, 2026-08-27 5-theme rewrite): {c1,c2,c3,glow} overrides
  // for the ember's --era-ember-* custom properties, letting Shadow/Ice/etc.
  // reuse this exact spawner with their own palette instead of the default
  // fire-orange one every existing caller (the flight trail below) keeps
  // getting via the CSS fallback values.
  function spawnEmber(x,y,dx,colors){
    const ember=document.createElement("span");
    ember.className="era-phoenix-ember";
    ember.style.left=x+"px";
    ember.style.top=y+"px";
    ember.style.setProperty("--era-ember-dx",dx+"px");
    if(colors){
      if(colors.c1)ember.style.setProperty("--era-ember-c1",colors.c1);
      if(colors.c2)ember.style.setProperty("--era-ember-c2",colors.c2);
      if(colors.c3)ember.style.setProperty("--era-ember-c3",colors.c3);
      if(colors.glow)ember.style.setProperty("--era-ember-glow",colors.glow)
    }
    trailHost.appendChild(ember);
    setTimeout(function(){ember.remove()},700)
  }
  function spawnEmberBurst(cx,cy,count,colors){
    for(let i=0;i<count;i++){
      const ang=Math.random()*Math.PI*2,r=randRange(4,26);
      spawnEmber(cx+Math.cos(ang)*r,cy+Math.sin(ang)*r,randRange(-22,22),colors)
    }
  }
  // Generic radial "particles fly outward" burst (2026-08-27 5-theme
  // rewrite) - used by the Portal theme's electrified stage and the Shadow
  // theme's "energy concentrates" flash. See .era-phoenix-particle-out above
  // for why this is a separate shape from spawnEmber (radial, not a fixed
  // upward drift).
  function spawnParticlesOut(cx,cy,count,opts){
    opts=opts||{};
    for(let i=0;i<count;i++){
      const p=document.createElement("span");
      p.className="era-phoenix-particle-out";
      p.style.left=cx+"px";
      p.style.top=cy+"px";
      p.style.setProperty("--era-p-angle",(Math.random()*360)+"deg");
      p.style.setProperty("--era-p-dist",randRange(opts.distLo||30,opts.distHi||70)+"px");
      p.style.setProperty("--era-p-dur",randRange(opts.durLo||.45,opts.durHi||.75)+"s");
      if(opts.c1)p.style.setProperty("--era-p-c1",opts.c1);
      if(opts.c2)p.style.setProperty("--era-p-c2",opts.c2);
      if(opts.glow)p.style.setProperty("--era-p-glow",opts.glow);
      trailHost.appendChild(p);
      setTimeout(function(){p.remove()},900)
    }
  }
  // Generic inward-converging puff (2026-08-27 5-theme rewrite) - used by the
  // Shadow theme's gathering smoke and the Cloud theme's condensing mist.
  // Reuses era-sand-grain-swirl's own angle/radius/spin/duration custom
  // properties (see spawnSandSwirl below), just on a differently-styled
  // shape (.era-phoenix-swirl-puff instead of .era-phoenix-sand-grain).
  function spawnSwirlPuffs(cx,cy,count,totalMs,opts){
    opts=opts||{};
    for(let i=0;i<count;i++){
      const g=document.createElement("span");
      g.className="era-phoenix-swirl-puff";
      g.style.left=cx+"px";
      g.style.top=cy+"px";
      const dur=randRange(opts.durLo||.6,opts.durHi||1.0);
      const delay=randRange(0,(totalMs/1000)*.55);
      g.style.setProperty("--era-sand-angle",(Math.random()*360)+"deg");
      g.style.setProperty("--era-sand-radius",randRange(opts.radiusLo||50,opts.radiusHi||130)+"px");
      g.style.setProperty("--era-sand-spin",(randRange(200,520)*(Math.random()<0.5?-1:1))+"deg");
      g.style.setProperty("--era-sand-dur",dur+"s");
      g.style.setProperty("--era-puff-size",randRange(opts.sizeLo||6,opts.sizeHi||16)+"px");
      if(opts.bg)g.style.setProperty("--era-puff-bg",opts.bg);
      if(opts.blur!=null)g.style.setProperty("--era-puff-blur",opts.blur+"px");
      g.style.animationDelay=delay+"s";
      trailHost.appendChild(g);
      setTimeout(function(){g.remove()},(delay+dur+0.1)*1000)
    }
  }
  // Rising vapor wisps (2026-08-27, Ice theme's thaw stage) - same spawned-
  // span convention as spawnEmber, just drifting upward and fading slower to
  // read as vapor rather than fire.
  function spawnVapor(cx,cy,count){
    for(let i=0;i<count;i++){
      const v=document.createElement("span");
      v.className="era-phoenix-vapor";
      v.style.left=(cx+randRange(-30,30))+"px";
      v.style.top=(cy+randRange(-20,20))+"px";
      v.style.setProperty("--era-vapor-dx",randRange(-18,18)+"px");
      v.style.animationDelay=randRange(0,.4)+"s";
      trailHost.appendChild(v);
      setTimeout(function(){v.remove()},1600)
    }
  }
  // 2026-08-27, later pass (per Huy's "ashes should form from swirling
  // sand, swirling sand -> ashes -> egg") - spawns a batch of grains
  // (era-phoenix-sand-grain, defined next to the ashes/egg CSS above) at the
  // hatch spot, each on its own randomized angle/radius/spin/duration and a
  // staggered animation-delay so they trickle in and converge over
  // roughly `totalMs`, rather than all snapping to the center in lockstep.
  // Same rotate()+translateX()-from-center trick the thunder sparks use,
  // just animating radius down to 0 (inward) instead of up (outward), with
  // an extra --era-sand-spin turn baked in so it reads as swirling rather
  // than just falling straight to the point.
  function spawnSandSwirl(cx,cy,count,totalMs){
    for(let i=0;i<count;i++){
      const grain=document.createElement("span");
      grain.className="era-phoenix-sand-grain";
      grain.style.left=cx+"px";
      grain.style.top=cy+"px";
      const dur=randRange(0.6,0.95);
      const delay=randRange(0,(totalMs/1000)*0.55);
      grain.style.setProperty("--era-sand-angle",(Math.random()*360)+"deg");
      grain.style.setProperty("--era-sand-radius",randRange(50,120)+"px");
      grain.style.setProperty("--era-sand-spin",(randRange(360,720)*(Math.random()<0.5?-1:1))+"deg");
      grain.style.setProperty("--era-sand-dur",dur+"s");
      grain.style.animationDelay=delay+"s";
      trailHost.appendChild(grain);
      setTimeout(function(){grain.remove()},(delay+dur+0.1)*1000)
    }
  }
  // 2026-08-27, later pass (per Huy's "make the hatching fully animated
  // instead of the egg simply popping open") - small triangular shell
  // fragments (era-phoenix-shell-shard, defined next to the hatch CSS
  // above) flung outward the instant the hatch stage starts, same spawned-
  // span/self-removing convention as spawnEmber above.
  // colors (optional, 2026-08-27 5-theme rewrite): {c1,c2,c3} overrides for
  // the shard's --era-shard-c* custom properties, so Rock (gray/brown
  // rubble) and Ice (icy-white shards) can reuse this same spawner instead
  // of the original egg-hatch call site's shell-colored default.
  function spawnShellShards(cx,cy,count,colors){
    for(let i=0;i<count;i++){
      const shard=document.createElement("span");
      shard.className="era-phoenix-shell-shard";
      shard.style.left=cx+"px";
      shard.style.top=cy+"px";
      const ang=Math.random()*Math.PI*2,dist=randRange(30,70);
      shard.style.setProperty("--era-shard-dx",(Math.cos(ang)*dist)+"px");
      shard.style.setProperty("--era-shard-dy",(Math.sin(ang)*dist-randRange(10,30))+"px");
      shard.style.setProperty("--era-shard-spin",(randRange(120,320)*(Math.random()<0.5?-1:1))+"deg");
      if(colors){
        if(colors.c1)shard.style.setProperty("--era-shard-c1",colors.c1);
        if(colors.c2)shard.style.setProperty("--era-shard-c2",colors.c2);
        if(colors.c3)shard.style.setProperty("--era-shard-c3",colors.c3)
      }
      trailHost.appendChild(shard);
      setTimeout(function(){shard.remove()},650)
    }
  }
  // 2026-08-27, later pass (per Huy's "up to 5 independent phoenixes, spawn
  // one more every 20s, never reload/reset the whole animation, each new one
  // flies without interrupting the others"): replaces the old single-shared-
  // element runCycle()/gen system (which restarted the ENTIRE intro -
  // lightning through hatch - for the one shared img/ashesEl/eggEl every
  // 30s, necessarily killing whatever was already flying) with spawnPhoenix()
  // below - every call creates its OWN ashes/egg/img trio, runs the birth
  // sequence on those elements alone, then hands off to that phoenix's own
  // independent startFreeFlight() loop. No shared mutable state between
  // phoenixes means no generation counter is needed: each one simply runs
  // until its own despawn() removes its own elements.
  const MAX_PHOENIXES=5;
  const SPAWN_INTERVAL_MS=20000;
  // Each phoenix flies for a randomized stretch before heading off-screen
  // and being removed for good, freeing its slot - otherwise the population
  // would just grow to 5 once and sit there forever with the same 5
  // phoenixes never able to fly off ("finishes/disappears" implies a phoenix
  // does eventually leave).
  const MIN_LIFESPAN_MS=45000,MAX_LIFESPAN_MS=90000;
  // 2026-08-28 (per Huy's "let phoenixes randomly land and park along the
  // bottom edge, then keep flying"): on ~30% of waypoint arrivals (checked
  // fresh each time, so it's not a one-shot per phoenix) a phoenix instead
  // heads for a bottom-edge landing spot (pickLandingSpot above) and, once
  // there, holds still for MIN/MAX_PARK_MS before picking a new free-flight
  // target and taking off again - see the `state.landedUntil`/
  // `state.pendingLand` handling in startFreeFlight() below.
  const LAND_CHANCE=0.3;
  const MIN_PARK_MS=4000,MAX_PARK_MS=11000;
  let activeCount=0;

  function despawn(state){
    if(state.removed)return;
    state.removed=true;
    activeCount--;
    state.img.remove();
    if(state.ashesEl)state.ashesEl.remove();
    if(state.eggEl)state.eggEl.remove()
  }

  // 2026-08-28 (bugfix, per Huy's "bird stops mid-screen instead of at the
  // bottom" report on the new landing feature): state.dispW/dispH is only
  // ever captured ONCE, right as birth hands off to flight (see beginFlight()
  // and the no-anim branch in spawnPhoenix() below) - normally fine for
  // pickFreeTarget's clamp math, but pickLandingSpot anchors the image's
  // BOTTOM edge to near the viewport bottom using dispH, so a stale/wrong
  // height (e.g. captured before the per-phoenix 0.65-1.35x upscale in
  // withStrippedSrc's callback had actually landed, or before this tall
  // ~1.4x-aspect-ratio source image had finished decoding) reads as the
  // phoenix parking well above where it should - a small height error that
  // pickFreeTarget's free-roaming targets mostly hide gets very visible once
  // something is supposed to sit flush against a fixed edge. Re-measuring
  // right before a landing decision (cheap - getBoundingClientRect() only
  // runs on actual landing attempts, not every frame) means the landing spot
  // always uses the real, current rendered size instead of trusting a
  // several-seconds-stale snapshot.
  function refreshDispSize(state){
    const r=state.img.getBoundingClientRect();
    if(r.width>0&&r.height>0){state.dispW=r.width;state.dispH=r.height}
  }

  // ---- Free flight (2026-08-22 origin controller; see the long history in
  // the comment above this IIFE) - unchanged in shape aside from now being
  // scoped to one phoenix's own state object instead of module-level shared
  // variables (so up to MAX_PHOENIXES of these run concurrently without
  // touching each other), no longer confined to a side band post-hatch
  // (pickFreeTarget above, not pickSideSpawn), and no longer clamped to stay
  // strictly inside the viewport - pickFreeTarget occasionally aims just
  // past the edge so a phoenix can naturally fly off-screen and back, and an
  // end-of-lifespan phoenix is deliberately sent off-screen for good via
  // pickExitTarget before despawn() removes it. ----
  function startFreeFlight(state){
    let target=pickFreeTarget(state.dispW,state.dispH);
    let speed=randRange(90,190);
    let speedDrift=0;
    let facingLeft=false;
    let flapPhase=0;
    let bank=0;
    let prevAngle=null;
    let emberTimer=0;
    let lastTs=null;
    // `landedUntil`: 0 while flying, else a Date.now() deadline the phoenix
    // holds its current (parked) position until. `pendingLand`: true once a
    // landing spot has been picked as the current target, so the *next*
    // arrival (dist<14) parks instead of picking yet another flight target -
    // see the two checks below.
    let landedUntil=0;
    let pendingLand=false;
    const lifespan=randRange(MIN_LIFESPAN_MS,MAX_LIFESPAN_MS);
    const flightStart=Date.now();
    function step(ts){
      if(state.removed)return;
      if(lastTs===null)lastTs=ts;
      // Per-user "no animation" preference (Manage Access tab) - the phoenix
      // itself is hidden via the body.no-animations CSS rule above, but that
      // alone doesn't stop this rAF loop from still moving it and spawning
      // embers behind the scenes, so bail out early each frame while the flag
      // is set instead. Re-checked every frame (not just once) so flipping the
      // setting takes effect immediately without a page reload.
      if(noAnim()){
        lastTs=ts;
        requestAnimationFrame(step);
        return
      }
      const dt=Math.min((ts-lastTs)/1000,0.05);
      lastTs=ts;
      if(landedUntil){
        // Parked: hold position, keep a small idle flap/bob so it doesn't
        // read as a frozen frame, and skip the ember trail entirely (embers
        // are a flight-trail effect, not something a resting phoenix sheds).
        // A landed phoenix whose lifespan expires while parked still needs
        // to eventually leave, same as one that's still flying.
        if(Date.now()<landedUntil && Date.now()-flightStart<=lifespan){
          flapPhase+=dt*1.3*Math.PI*2;
          const idleFlap=Math.sin(flapPhase)*0.4;
          state.img.style.transform="translate3d("+state.pos.x+"px,"+state.pos.y+"px,0) rotate(0deg) scaleX("+(facingLeft?-1:1)+") scaleY("+(1+0.02*idleFlap)+")";
          requestAnimationFrame(step);
          return
        }
        landedUntil=0;
        if(Date.now()-flightStart>lifespan){
          state.exiting=true;
          target=pickExitTarget(state.dispW,state.dispH)
        } else {
          target=pickFreeTarget(state.dispW,state.dispH)
        }
        speed=randRange(90,190)
      }
      const dx=target.x-state.pos.x,dy=target.y-state.pos.y;
      const dist=Math.hypot(dx,dy);
      if(dist<14){
        if(state.exiting){despawn(state);return}
        if(pendingLand){
          pendingLand=false;
          landedUntil=Date.now()+randRange(MIN_PARK_MS,MAX_PARK_MS);
          requestAnimationFrame(step);
          return
        }
        if(Date.now()-flightStart>lifespan){
          state.exiting=true;
          target=pickExitTarget(state.dispW,state.dispH)
        } else if(Math.random()<LAND_CHANCE){
          refreshDispSize(state);
          target=pickLandingSpot(state.dispW,state.dispH);
          pendingLand=true
        } else {
          target=pickFreeTarget(state.dispW,state.dispH)
        }
        speed=randRange(90,190)
      } else {
        speedDrift+=randRange(-1,1)*dt*60;
        speedDrift=Math.max(-40,Math.min(40,speedDrift));
        const curSpeed=Math.max(55,Math.min(230,speed+speedDrift));
        state.pos.x+=(dx/dist)*curSpeed*dt;
        state.pos.y+=(dy/dist)*curSpeed*dt;
        if(Math.abs(dx)>4)facingLeft=dx<0;
        const angle=Math.atan2(dy,dx);
        if(prevAngle!==null){
          let dAngle=angle-prevAngle;
          while(dAngle>Math.PI)dAngle-=Math.PI*2;
          while(dAngle<-Math.PI)dAngle+=Math.PI*2;
          const targetBank=Math.max(-34,Math.min(34,(dAngle/dt)*4*(facingLeft?-1:1)));
          bank+=(targetBank-bank)*Math.min(1,dt*4)
        }
        prevAngle=angle;
        const flapRate=2.2+curSpeed/45;
        flapPhase+=dt*flapRate*Math.PI*2;
        const flapRaw=Math.sin(flapPhase)+0.35*Math.sin(flapPhase*2+1.1);
        const flapScaleY=1+0.065*flapRaw;
        const bobY=flapRaw*4.5;
        const renderY=state.pos.y+bobY;
        state.img.style.transform="translate3d("+state.pos.x+"px,"+renderY+"px,0) rotate("+bank+"deg) scaleX("+(facingLeft?-1:1)+") scaleY("+flapScaleY+")";
        // 2026-08-22 ("add 100% more fires"): halved the spawn interval
        // (0.05s -> 0.025s), doubling the ember rate.
        emberTimer+=dt;
        while(emberTimer>0.025){
          emberTimer-=0.025;
          spawnEmber(
            state.pos.x+state.dispW/2-(dx/dist)*(state.dispW/2)+randRange(-16,16),
            renderY+state.dispH-40+randRange(-16,16),
            randRange(-14,14)
          )
        }
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  // ---- Hatch intro (2026-08-27, per Huy's "start as ashes, form into a
  // glowing egg, hatch into the phoenix" request; re-timed same day per
  // "animate the ashes for ~3s until they form into the egg, then animate
  // the egg for another ~3s as it cracks and hatches"; a lightning prelude
  // added same day per "before the ashes animation starts, have a couple of
  // lightning strikes hit the spot"; grown same day, later pass, into a
  // fuller sequence per Huy's follow-up requests: 10 varied-color strikes
  // instead of 2, a swirling-sand stage between the lightning and the ash
  // pile, a real branching egg crack, and a fully-animated shell-splitting
  // hatch instead of a plain pop - giving the full sequence lightning(x10)
  // -> swirling sand -> ashes -> egg -> hatch -> flight; run independently
  // per phoenix by spawnPhoenix() below, on that phoenix's own cloned
  // elements) - a plain setTimeout stage chain (doesn't need rAF-level
  // precision the way the continuous flight loop does) that toggles the CSS
  // classes/keyframes defined next to #era_phoenix_bg, then hands off to
  // startFreeFlight(). Skipped straight to a fully-hatched, already-flying
  // phoenix when the no-animation preference is on or the intro markup is
  // missing for some reason, so this never blocks the flight behavior
  // everything above depends on.
  // Stage timing (all offsets below are from t=0, the first lightning
  // strike): STRIKE_COUNT strikes land STRIKE_INTERVAL_MS apart, the sand
  // swirl starts right after the last one lands (+ a short buffer for its
  // own flash/crack to read), holds for SAND_MS while trickling grains in,
  // the ash pile fades in partway through that (SAND_OVERLAP_MS before the
  // sand finishes, so it visually reads as "the sand became the ashes" not
  // two separate effects), then ashes hold for ASHES_MS, the egg gets
  // EGG_GLOW_MS of glow before it starts shaking/cracking, EGG_SHAKE_MS of
  // that shake/crack, and finally HATCH_MS of the shell-splitting hatch
  // itself before handing off to startFreeFlight().
  const STRIKE_COUNT=10,STRIKE_INTERVAL_MS=230,STRIKE_BUFFER_MS=300;
  const SAND_MS=900,SAND_OVERLAP_MS=420;
  const ASHES_MS=3000,EGG_GLOW_MS=2250,EGG_SHAKE_MS=750,HATCH_MS=600;
  const SAND_START_MS=STRIKE_COUNT*STRIKE_INTERVAL_MS+STRIKE_BUFFER_MS;
  const ASHES_START_MS=SAND_START_MS+Math.max(0,SAND_MS-SAND_OVERLAP_MS);
  const EGG_START_MS=ASHES_START_MS+ASHES_MS;
  const SHAKE_START_MS=EGG_START_MS+EGG_GLOW_MS;
  const HATCH_START_MS=SHAKE_START_MS+EGG_SHAKE_MS;

  // ---- Random spawn-animation themes (2026-08-27, per Huy's "randomize the
  // entire Phoenix spawn animation - Magic Portal, Shadow/Dark, Rock/Stone,
  // Cloud Mist, Ice/Cryogenic - one picked at random per spawn, don't repeat
  // the same theme twice in a row when practical") ----
  // Each theme owns its own visual container (cloned from one of the hidden
  // templates near #era_phoenix_bg's markup, same convention the original
  // ashes/egg intro used), runs its own setTimeout-driven stage timeline
  // below, and finishes by calling the shared popInPhoenix() + the caller's
  // beginFlight() - nothing about flight itself (startFreeFlight above)
  // changes per theme, and every theme spawns/holds via the same
  // pickSideSpawn() the original single-theme sequence always used, so the
  // "stay in the existing left/right middle-screen band" rule applies
  // identically regardless of which theme gets picked.
  const ERA_PHOENIX_THEMES=["portal","shadow","rock","cloud","ice"];
  let eraLastTheme=null;
  function pickTheme(){
    let t;
    do{ t=ERA_PHOENIX_THEMES[Math.floor(Math.random()*ERA_PHOENIX_THEMES.length)] }
    while(t===eraLastTheme && ERA_PHOENIX_THEMES.length>1);
    eraLastTheme=t;
    return t
  }
  // Per-theme Phoenix recolor (same hue-rotate+glow trick the original
  // single-theme ERA_PHOENIX_HATCH_COLORS list above already used) - Portal
  // keeps that full random palette (a magic portal can plausibly summon any
  // color of Phoenix); the other four themes each get one fixed,
  // theme-appropriate look per Huy's spec ("dark/evil", "glowing
  // yellow/golden", "baby-blue", and an icy cyan for the Ice theme, which
  // didn't get an exact color called out beyond "icy"). extraFilter appends
  // additional filter functions (brightness/saturate) beyond hue-rotate+
  // drop-shadow, used to push Shadow/Cloud/Ice past what a hue-rotate alone
  // can sell on a source image that's baked-in fire orange.
  function pickHatchColor(theme){
    if(theme==="portal")return ERA_PHOENIX_HATCH_COLORS[Math.floor(Math.random()*ERA_PHOENIX_HATCH_COLORS.length)];
    if(theme==="shadow")return {hue:"255deg",glow:"rgba(88,28,135,.6)",extra:"brightness(.6) saturate(1.4)"};
    if(theme==="rock")return {hue:"46deg",glow:"rgba(234,179,8,.55)",extra:"saturate(1.15)"};
    if(theme==="cloud")return {hue:"196deg",glow:"rgba(125,211,252,.55)",extra:"saturate(.8) brightness(1.05)"};
    return {hue:"189deg",glow:"rgba(103,232,249,.55)",extra:"saturate(.9) brightness(1.1)"} // ice
  }
  // Shared "energy gathers and forms the Phoenix" reveal - every theme ends
  // its own timeline by calling this once its formation visual is done, so
  // the actual pop-in motion (ease-out-back scale, same feel as the
  // original egg-hatch pop) only needs to be written once. Checks
  // state.removed/exiting-independent state.removed each frame so a
  // despawned-mid-birth phoenix (shouldn't normally happen this early, but
  // costs nothing to guard) doesn't keep animating a detached img.
  function popInPhoenix(state,img,pos,durMs,onDone){
    img.style.transition="opacity "+(durMs/1000)+"s ease";
    img.style.opacity=".22";
    const t0=Date.now();
    function easeOutBack(t){const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)}
    function step(){
      if(state.removed)return;
      const t=Math.min(1,(Date.now()-t0)/durMs);
      const s=Math.max(.3,.3+easeOutBack(t)*.85);
      img.style.transform="translate3d("+pos.x+"px,"+pos.y+"px,0) scale("+s+")";
      if(t<1)requestAnimationFrame(step);
      else onDone()
    }
    requestAnimationFrame(step)
  }
  // Per-theme total birth duration, used only as the watchdog's "should be
  // flying by now" margin (same role HATCH_START_MS+HATCH_MS played for the
  // original single sequence) - not relied on for any visual timing itself,
  // since each theme schedules its own stage offsets below.
  const ERA_THEME_TOTAL_MS={portal:4200,shadow:3300,rock:3000,cloud:2600,ice:3700};

  // ---- Theme 1: Magic Portal - portal appears, becomes increasingly
  // electrified (reuses the same lightning-strike effect the original
  // sequence used, now anchored around the ring's rim instead of a single
  // point), particles fly outward, energy gathers and forms the Phoenix,
  // Phoenix emerges, portal dissolves. ----
  function birthPortal(pos,img,state,el,onReveal){
    const APPEAR_MS=500,CHARGE_MS=1700,STRIKES=8,GATHER_MS=700,POP_MS=600,HIDE_MS=500;
    el.classList.add("era-phoenix-show");
    setTimeout(function(){
      if(state.removed)return;
      el.classList.add("era-phoenix-charge");
      for(let i=0;i<STRIKES;i++){
        setTimeout(function(){
          if(state.removed)return;
          const ang=Math.random()*Math.PI*2,r=randRange(55,85);
          spawnLightningStrike(pos.x+Math.cos(ang)*r,pos.y+Math.sin(ang)*r);
          spawnParticlesOut(pos.x,pos.y,5,{distLo:40,distHi:90,c1:"#fff",c2:"#a855f7",glow:"rgba(168,85,247,.65)"})
        },i*(CHARGE_MS/STRIKES))
      }
    },APPEAR_MS);
    setTimeout(function(){
      if(state.removed)return;
      spawnSwirlPuffs(pos.x,pos.y,20,GATHER_MS,{bg:"radial-gradient(circle,#fff7d6,#a855f7 60%,transparent 100%)",radiusLo:60,radiusHi:120,sizeLo:4,sizeHi:9,durLo:.5,durHi:.8});
      popInPhoenix(state,img,pos,POP_MS,function(){
        if(state.removed){onReveal();return}
        el.classList.remove("era-phoenix-charge");
        el.classList.add("era-phoenix-hide");
        setTimeout(function(){el.remove()},HIDE_MS);
        onReveal()
      })
    },APPEAR_MS+CHARGE_MS)
  }

  // ---- Theme 2: Shadow / Dark Phoenix - a dark shadow appears, darkness and
  // smoke gradually gather and swirl, energy concentrates in the center, the
  // darkness transforms into a dark Phoenix. ----
  function birthShadow(pos,img,state,el,onReveal){
    const ORB_GROW_MS=1100,CONCENTRATE_MS=700,POP_MS=500,HIDE_MS=500;
    el.classList.add("era-phoenix-show");
    spawnSwirlPuffs(pos.x,pos.y,22,ORB_GROW_MS+400,{bg:"radial-gradient(circle,#4c1d95,#0f0a14 70%,transparent 100%)",blur:2,radiusLo:70,radiusHi:150,sizeLo:8,sizeHi:18,durLo:.65,durHi:1.05});
    setTimeout(function(){
      if(state.removed)return;
      el.classList.add("era-phoenix-charge")
    },ORB_GROW_MS);
    setTimeout(function(){
      if(state.removed)return;
      spawnParticlesOut(pos.x,pos.y,10,{distLo:20,distHi:50,durLo:.35,durHi:.55,c1:"#c4b5fd",c2:"#4c1d95",glow:"rgba(88,28,135,.7)"});
      popInPhoenix(state,img,pos,POP_MS,function(){
        if(state.removed){onReveal();return}
        el.classList.remove("era-phoenix-charge");
        el.classList.add("era-phoenix-hide");
        setTimeout(function(){el.remove()},HIDE_MS);
        onReveal()
      })
    },ORB_GROW_MS+CONCENTRATE_MS)
  }

  // ---- Theme 3: Rock / Stone Phoenix - a rock formation appears, cracks
  // develop and gradually spread/deepen, the rock breaks apart, revealing a
  // glowing golden stone Phoenix as debris falls away. ----
  function birthRock(pos,img,state,el,onReveal){
    const APPEAR_MS=500,CRACK_MS=1300,POP_MS=550,HIDE_MS=350;
    el.classList.add("era-phoenix-show");
    setTimeout(function(){
      if(state.removed)return;
      el.classList.add("era-phoenix-shake")
    },APPEAR_MS);
    setTimeout(function(){
      if(state.removed)return;
      spawnShellShards(pos.x,pos.y,18,{c1:"#c9beae",c2:"#8a7f74",c3:"#362e27"});
      el.classList.remove("era-phoenix-shake");
      el.classList.add("era-phoenix-hide");
      setTimeout(function(){el.remove()},HIDE_MS);
      popInPhoenix(state,img,pos,POP_MS,onReveal)
    },APPEAR_MS+CRACK_MS)
  }

  // ---- Theme 4: Cloud Mist / Baby-Blue Phoenix - mist gradually condenses,
  // swirls and gathers into a defined shape, the shape gradually transforms
  // into a baby-blue Phoenix, remaining mist dissipates. ----
  function birthCloud(pos,img,state,el,onReveal){
    const GATHER_MS=1100,HOLD_MS=400,POP_MS=700,HIDE_MS=900;
    spawnSwirlPuffs(pos.x,pos.y,20,GATHER_MS,{bg:"radial-gradient(circle,#fff,#bfdbfe 65%,transparent 100%)",blur:3,radiusLo:70,radiusHi:150,sizeLo:10,sizeHi:22,durLo:.7,durHi:1.1});
    setTimeout(function(){
      if(state.removed)return;
      el.classList.add("era-phoenix-show")
    },150);
    setTimeout(function(){
      if(state.removed)return;
      popInPhoenix(state,img,pos,POP_MS,function(){
        if(state.removed){onReveal();return}
        onReveal()
      });
      el.classList.add("era-phoenix-hide");
      setTimeout(function(){el.remove()},HIDE_MS)
    },GATHER_MS+HOLD_MS)
  }

  // ---- Theme 5: Ice / Cryogenic Phoenix - a block of ice forms with the
  // Phoenix trapped/frozen inside, the ice thaws (cracks spreading, frost and
  // vapor rising), the ice breaks/dissolves away to reveal the Phoenix. ----
  function birthIce(pos,img,state,el,onReveal){
    const APPEAR_MS=600,FROZEN_MS=500,THAW_MS=1300,POP_MS=550,HIDE_MS=500;
    el.classList.add("era-phoenix-show");
    setTimeout(function(){
      if(state.removed)return;
      // Faintly visible, small, and heavily icy-filtered while "trapped" -
      // popInPhoenix (below) re-animates the scale-up from here once the ice
      // actually breaks, so this is just the frozen-in-place starting point.
      img.style.transition="";
      img.style.opacity=".18";
      img.style.transform="translate3d("+pos.x+"px,"+pos.y+"px,0) scale(.55)"
    },100);
    setTimeout(function(){
      if(state.removed)return;
      el.classList.add("era-phoenix-thaw");
      let vaporTicks=0;
      const vaporTimer=setInterval(function(){
        if(state.removed||vaporTicks++>=6){clearInterval(vaporTimer);return}
        spawnVapor(pos.x,pos.y,3)
      },THAW_MS/6);
      spawnParticlesOut(pos.x,pos.y,8,{distLo:20,distHi:45,durLo:.5,durHi:.8,c1:"#fff",c2:"#67e8f9",glow:"rgba(103,232,249,.6)"})
    },APPEAR_MS+FROZEN_MS);
    setTimeout(function(){
      if(state.removed)return;
      spawnShellShards(pos.x,pos.y,14,{c1:"#f0fbff",c2:"#a5f3fc",c3:"#0e7490"});
      el.classList.remove("era-phoenix-thaw");
      el.classList.add("era-phoenix-hide");
      setTimeout(function(){el.remove()},HIDE_MS);
      popInPhoenix(state,img,pos,POP_MS,onReveal)
    },APPEAR_MS+FROZEN_MS+THAW_MS)
  }
  const ERA_THEME_BIRTH={portal:birthPortal,shadow:birthShadow,rock:birthRock,cloud:birthCloud,ice:birthIce};
  const ERA_THEME_TEMPLATE={portal:function(){return templatePortal},shadow:function(){return templateShadow},rock:function(){return templateRock},cloud:function(){return templateCloud},ice:function(){return templateIce}};

  // Spawns exactly one new, fully independent phoenix (its own formation
  // elements/img and its own birth-then-flight state), picks one of the 5
  // birth themes above at random (never the same as the immediately
  // preceding spawn, per pickTheme()) and starts its birth sequence at a
  // freshly randomized side, without touching any already-flying phoenix.
  // Bails out silently if the population is already at MAX_PHOENIXES - the
  // SPAWN_INTERVAL_MS ticker below just tries again next interval, which is
  // what "wait until one finishes/disappears before spawning another" means
  // in practice.
  function spawnPhoenix(){
    if(activeCount>=MAX_PHOENIXES)return;
    activeCount++;
    const side=Math.random()<0.5?"left":"right";
    const theme=pickTheme();
    const themeTemplate=ERA_THEME_TEMPLATE[theme]();
    const state={pos:{x:0,y:0},dispW:520,dispH:520,removed:false,exiting:false};
    const formEl=themeTemplate?themeTemplate.cloneNode(true):null;
    const img=document.createElement("img");
    img.alt="";
    const hatchColor=pickHatchColor(theme);
    img.style.filter="hue-rotate("+hatchColor.hue+") drop-shadow(0 0 50px "+hatchColor.glow+")"+(hatchColor.extra?" "+hatchColor.extra:"");
    state.img=img;
    state.formEl=formEl;
    if(formEl){
      formEl.style.display="";
      formEl.className=formEl.className.replace(/\bera-phoenix-(show|hide|charge|shake|thaw)\b/g,"").trim();
      trailHost.appendChild(formEl)
    }
    img.style.opacity="0";
    trailHost.appendChild(img);
    withStrippedSrc(function(dataUrl){
      if(state.removed)return;
      img.src=dataUrl;
      // Random per-phoenix size (per Huy's "randomize each phoenix's size
      // within a reasonable range"): the shared CSS rule (`#era_phoenix_bg
      // img`) already gives every <img> a responsive clamped base width for
      // the current viewport; this scales that base up/down per instance
      // instead of replacing it, so the range stays sane on any screen size.
      const baseW=img.getBoundingClientRect().width||260;
      const scale=randRange(0.65,1.35);
      img.style.width=(baseW*scale)+"px"
    });

    if(!formEl||noAnim()){
      const pos=pickFreeTarget(state.dispW,state.dispH);
      state.pos=pos;
      img.style.transition="";
      img.style.opacity=".22";
      img.style.transform="translate3d("+pos.x+"px,"+pos.y+"px,0) scale(1)";
      const r=img.getBoundingClientRect();
      if(r.width>0&&r.height>0){state.dispW=r.width;state.dispH=r.height}
      startFreeFlight(state);
      return
    }

    const pos=pickSideSpawn(side,state.dispW,state.dispH);
    state.pos=pos;
    formEl.style.left=pos.x+"px";
    formEl.style.top=pos.y+"px";
    img.style.transition="";
    img.style.transform="translate3d("+pos.x+"px,"+pos.y+"px,0) scale(.4)";
    // Watchdog (2026-08-27, per Huy's "the egg gets stuck / animation looks
    // blocked" report, still load-bearing after the 5-theme rewrite): every
    // stage above is its own independently-scheduled setTimeout, offset from
    // this phoenix's own birth start. Real-world Chrome timer throttling
    // (background/inactive tab, another heavy tab stealing the main thread,
    // etc.) can delay or altogether drop any one of them without erroring -
    // there's nothing that notices "this phoenix should be flying by now" if
    // that happens, so it'd just sit there frozen forever. flightStarted
    // flags the one-time birth->flight handoff so both the real reveal
    // callback AND this watchdog can call beginFlight() and only the first
    // one actually does anything. The watchdog itself is driven by
    // requestAnimationFrame (confirmed to keep ticking even when this
    // phoenix's own setTimeout chain has stalled) comparing real elapsed
    // Date.now() time against ERA_THEME_TOTAL_MS[theme] (that theme's own
    // expected total, not any one intermediate stage timer) plus a generous
    // 3000ms margin - so it recovers regardless of which stage actually got
    // stuck, and should read as "last resort," never race the real
    // completion.
    let flightStarted=false;
    function beginFlight(){
      if(flightStarted||state.removed)return;
      flightStarted=true;
      img.style.transition="";
      img.style.opacity=".22";
      if(formEl)formEl.style.display="none";
      const r=img.getBoundingClientRect();
      if(r.width>0&&r.height>0){state.dispW=r.width;state.dispH=r.height}
      startFreeFlight(state)
    }
    const birthStart=Date.now();
    function watchdog(){
      if(state.removed||flightStarted)return;
      if(Date.now()-birthStart>ERA_THEME_TOTAL_MS[theme]+3000){
        beginFlight();
        return
      }
      requestAnimationFrame(watchdog)
    }
    requestAnimationFrame(watchdog);
    ERA_THEME_BIRTH[theme](pos,img,state,formEl,beginFlight)
  }
  // Bugfix (per Huy's screenshots, round 2 - still overlapping the header
  // even after getChromeBottom() above): this whole script runs at parse
  // time, well before the async sign-in -> role/tab-restore sequence (see
  // the lightning-strike bugfix comment further up) actually picks THIS tab
  // to display - #appHero exists in the DOM by then, but still showing its
  // page-load-default Project Roadmap blurb (one short line) instead of the
  // multi-line copy it swaps to once this tab is the one actually shown, so
  // an immediate getChromeBottom() call undershoots the real header+hero+
  // switcher height by a wide margin.
  // A first attempt at fixing this polled getChromeBottom() a few times 100ms
  // apart and started once two consecutive reads agreed - but that just
  // caught the DOM in an early, ALSO-stable-looking state (nothing had
  // changed *yet* between those two 100ms-apart reads, not because the real
  // async work was done) and still fired too early. This instead watches
  // #appHero/#appSwitcher themselves with a MutationObserver (their subtree
  // AND class/style attributes, since the swap is a class change plus new
  // text content, not just new child nodes) and only starts once 350ms have
  // passed with NO further mutation to either - i.e. once the tab-restore
  // sequence has actually finished touching them, not just once a fixed
  // clock has ticked. Hard-capped at 5s total so a page that never settles
  // (no tab access granted, sign-in failing, etc.) doesn't leave the phoenix
  // waiting forever - it just starts with whatever it last measured.
  // Bugfix (per Huy's screenshots, round 3 - traced with temporary debug
  // logging, since guessing from screenshots alone had already produced two
  // wrong fixes in a row): getChromeBottom() was returning a flat 0 the
  // whole time, for a reason neither round 1 nor round 2 above considered -
  // header/#appHero/#appSwitcher aren't hidden themselves, but their PARENT,
  // #app, is display:none at the moment this script runs (this tab's own
  // container, #emailRequestAttachmentsEmbedView, lives OUTSIDE #app, so it
  // was already visible while #app - and everything inside it - was still
  // hidden), which collapses getBoundingClientRect() to a flat 0-height box
  // for all three regardless of their own display value. #app flips visible
  // later, once the async sign-in -> role/tab-restore sequence finishes -
  // but the MutationObserver above only ever watched #appHero/#appSwitcher
  // for changes, never #app itself, so it could debounce-settle and fire
  // before that flip ever happened. Now watches #app too (for exactly this
  // attribute flip) and, more importantly, scheduleStart() refuses to arm
  // its timer at all while #app is still hidden - so quiet-for-350ms alone
  // can no longer fire prematurely; #app has to actually be visible first.
  (function waitForStableChromeThenStart(){
    let started=false,debounceTimer=null,capTimer=null;
    const appEl=document.getElementById("app");
    function appVisible(){return !appEl||getComputedStyle(appEl).display!=="none"}
    function start(){
      if(started)return;
      started=true;
      if(debounceTimer)clearTimeout(debounceTimer);
      if(capTimer)clearTimeout(capTimer);
      observer.disconnect();
      // The first phoenix spawns immediately once the chrome is stable;
      // every SPAWN_INTERVAL_MS after that, one more joins if there's room
      // (per Huy's "spawn 1 additional Phoenix every 20 seconds... max 5").
      // Existing phoenixes are never touched by this tick - each one is
      // already running its own independent startFreeFlight()/despawn()
      // loop from the moment it was spawned.
      spawnPhoenix();
      setInterval(function(){
        if(activeCount<MAX_PHOENIXES)spawnPhoenix()
      },SPAWN_INTERVAL_MS)
    }
    function scheduleStart(){
      if(!appVisible())return;
      if(debounceTimer)clearTimeout(debounceTimer);
      debounceTimer=setTimeout(start,350)
    }
    const observer=new MutationObserver(scheduleStart);
    [appEl,document.getElementById("appHero"),document.getElementById("appSwitcher")].forEach(function(el){
      if(el)observer.observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style"]})
    });
    // Also covers the case where both are already in their final state by
    // the time this script runs (fast sign-in, cached session) and neither
    // ever mutates again - without this, scheduleStart() would never fire
    // and start() would only ever happen via the 5s hard cap below.
    scheduleStart();
    capTimer=setTimeout(start,5000)
  })();
})();

// ---- "Additional locations", every mode (2026-08-18, extended to all six
// modes 2026-08-19) ----
// Location #1 (era_location, top of the shared card) stays the single
// field every mode already relies on. These extra rows are purely
// additive, work independently per mode (see eraExtraLocationsByMode
// below), and are read by eraCollectExtraLocationBodyLines() (used by
// ut()/pt() below) regardless of which mode is active - every build*()
// function in functions/emailRequest.js now understands
// extraLocationBodyLines via the shared buildLocationLines() helper there,
// not just buildKeycard(). Switching modes just re-renders the button/rows
// from that mode's own array via era-field-hidden so nothing typed is lost
// if the person switches back.
function eraSyncLocationUiForMode(){
  // Bugfix (2026-08-19, later pass): this used to also toggle era-field-hidden
  // onto #era_addLocationBtn/#era_extraLocations for every non-keycard mode.
  // The button was never actually hidden by that (its own .era-add-entry-btn
  // rule wins the cascade - see the long comment below), but #era_extraLocations
  // has no competing rule, so era-field-hidden's display:none DID take effect
  // on the wrap - meaning clicking "+ Add location" on Wi-Fi/Printer/Phone/App/
  // Laptop silently pushed a row into that mode's own array (eraRenderExtraLocationRows()
  // still ran) but the wrap stayed invisible, so nothing appeared to happen.
  // Every mode is meant to have its own independent, visible list (see
  // eraExtraLocationsByMode below), so both elements now just stay visible on
  // every tab; eraRenderExtraLocationRows() already re-renders from the active
  // mode's own array on every call, so no cross-tab bleed.
  eraRenderExtraLocationRows()
}
// Per-mode state (bugfix, 2026-08-19): #era_addLocationBtn/#era_extraLocations
// are one shared pair of DOM elements reused across all six mode tabs (the
// era-field-hidden toggle in eraSyncLocationUiForMode() below only ever
// hid #era_extraLocations' wrapper reliably - the button itself stayed
// visible on every tab because its OWN .era-add-entry-btn rule sets
// display:block later in the stylesheet, winning the cascade over
// .era-field-hidden's display:none at equal specificity). Whether or not
// that button is visually shown on a given tab, the underlying rows were
// a single shared list: typing a location while on, say, the Wi-Fi tab
// appended into the exact same array/DOM Keycard's own email body reads
// from, so it silently "leaked" into Keycard. Fixed by keeping one
// separate array PER MODE and re-rendering #era_extraLocations' rows from
// the active mode's own array on every tab switch
// (eraRenderExtraLocationRows(), called from eraSyncLocationUiForMode())
// instead of ever mutating a DOM list shared by all six tabs.
// eraCollectExtraLocationBodyLines() (below) reads whatever rows are
// CURRENTLY RENDERED, which eraRenderExtraLocationRows() always keeps in
// sync with the active mode's own array - so each mode's email only ever
// sees its own extra locations, never another tab's (2026-08-19: this
// function used to hard-return [] for every mode but Keycard; now every
// mode's build*() function on the server understands
// extraLocationBodyLines, so the restriction was removed).
const eraExtraLocationsByMode={keycard:[],wifi:[],printer:[],phone:[],app:[],laptop:[],electrical:[]};
function eraRenumberLocationRows(){
  c.querySelectorAll("#era_extraLocations .era-extra-location-row").forEach(function(row,idx){
    const numEl=row.querySelector(".era-loc-num");
    numEl&&(numEl.textContent=String(idx+2))
  })
}
function eraRenderExtraLocationRows(){
  const wrap=a("era_extraLocations");
  if(!wrap)return;
  const list=eraExtraLocationsByMode[_]||(eraExtraLocationsByMode[_]=[]);
  wrap.innerHTML="";
  list.forEach(function(value,idx){
    const row=document.createElement("div");
    row.className="era-extra-location-row";
    row.innerHTML='<div class="era-extra-location-field"><label>Location #<span class="era-loc-num"></span></label><input type="text" class="era-extra-location" list="era_locationList" placeholder="Search city, street or ZIP" autocomplete="off"></div><button type="button" class="era-remove-location-btn" title="Remove this location" aria-label="Remove this location">✕</button>';
    const input=row.querySelector(".era-extra-location");
    input.value=value;
    input.addEventListener("input",function(){list[idx]=this.value});
    row.querySelector(".era-remove-location-btn").addEventListener("click",function(){
      list.splice(idx,1),eraRenderExtraLocationRows()
    });
    wrap.appendChild(row)
  });
  eraRenumberLocationRows()
}
function eraAddLocationRow(){
  const list=eraExtraLocationsByMode[_]||(eraExtraLocationsByMode[_]=[]);
  list.push(""),
  eraRenderExtraLocationRows()
}
function eraCollectExtraLocationBodyLines(){
  return Array.prototype.slice.call(c.querySelectorAll("#era_extraLocations .era-extra-location")).map(function(input){
    const val=input.value.trim();
    if(!val)return"";
    const loc=ie(val);
    return loc?loc.bodyLine:val
  }).filter(Boolean)
}
a("era_addLocationBtn").addEventListener("click",eraAddLocationRow);
eraSyncLocationUiForMode();

// ---- Progressive reveal for Wi-Fi/Software/Electrical (task 3, 2026-09-08,
// per Huy's request) ----
// On first switching into Wi-Fi/Software/Electrical (or on page load if one
// is already active), the shared Location group (era_k_locationGroup - the
// field itself is shared by every mode, "Your email" stays outside it and
// always visible, same convention Keycard's own Transfer-only hide already
// uses, see that comment above) and that mode's own section-scoped
// Submission button (task 4) both start hidden, and reveal permanently
// (for the rest of this page session, this tab) on the first input/change/
// focusin anywhere inside that mode's own .era-mode-fields section.
// Keycard/Printer/Phone/Laptop/Hardware are unaffected - not in
// eraProgressiveModes, so eraApplyProgressiveVisibility() below leaves
// era_k_locationGroup alone (its own eraSyncKLocationGroupVisibility()
// logic, called separately, is untouched) and their Submission buttons are
// never hidden by this mechanism.
const eraProgressiveModes={wifi:!1,app:!1,electrical:!1};
const eraProgressiveSubmitBtns={wifi:a("era_w_submitBtn"),app:a("era_ap_submitBtn"),electrical:a("era_el_submitBtn")};
function eraApplyProgressiveVisibility(){
  const grp=a("era_k_locationGroup");
  if(grp){
    if(Object.prototype.hasOwnProperty.call(eraProgressiveModes,_))grp.classList.toggle("era-progressive-hidden",!eraProgressiveModes[_]);
    else grp.classList.remove("era-progressive-hidden");
  }
  Object.keys(eraProgressiveSubmitBtns).forEach(function(m){
    const btn=eraProgressiveSubmitBtns[m];
    btn&&btn.classList.toggle("era-progressive-hidden",!eraProgressiveModes[m]);
  });
}
function eraWireProgressiveReveal(mode){
  const section=c.querySelector('.era-mode-fields[data-mode="'+mode+'"]');
  if(!section)return;
  function reveal(){
    if(eraProgressiveModes[mode])return;
    eraProgressiveModes[mode]=!0;
    eraApplyProgressiveVisibility();
  }
  section.addEventListener("input",reveal,!0);
  section.addEventListener("change",reveal,!0);
  section.addEventListener("focusin",reveal,!0);
}
["wifi","app","electrical"].forEach(eraWireProgressiveReveal);
eraApplyProgressiveVisibility();

// ---- Shared "recently used emails" suggestions (2026-08-18) ----
// Applies to every real email input across all six modes (not just
// Keycard) - see docs/email-request-attachments-embed-tab.md. Storage is
// server-side (sharedEmailHistory Firestore collection, org-wide, capped
// at 5 per field key) - this embed can't import the Firestore SDK itself
// (see "What it is" at the top of the doc), so it goes through the same
// window-bridge pattern as window.submitCwEmailRequest: app.js keeps one
// onSnapshot-backed cache and exposes window.getSharedEmailHistory() plus
// the two mutating callables, window.addSharedEmailHistoryEntry /
// window.deleteSharedEmailHistoryEntry. Every accessor below is called
// lazily (inside an event handler), never at top-level script init, since
// app.js is a deferred module that may not have run yet when this classic
// script's top-level code executes.
const ERA_EMAIL_FIELDS=[
  {selector:"#era_requesterEmailLocal",key:"requesterEmail"},
  {selector:".era-k-email",key:"keycardTenantEmail"},
  {selector:".era-k-repl-email",key:"keycardTenantEmail"},
  {selector:".era-k-requestcardManagerEmail",key:"keycardManagerEmail"},
  {selector:".era-s-email",key:"simpleEmail"},
  {selector:".era-s-managerEmail",key:"simpleManagerEmail"},
  {selector:".era-ph-managerEmail",key:"phoneManagerEmail"},
  {selector:".era-aphw-managerEmail",key:"appHardwareManagerEmail"},
  {selector:".era-lt-managerEmail",key:"laptopManagerEmail"},
  {selector:".era-lt-email",key:"laptopPersonalEmail"}
];
const ERA_EMAIL_FORMAT_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function eraEmailFieldKeyFor(el){
  if(!el||el.tagName!=="INPUT"||el.type!=="email")return null;
  for(let i=0;i<ERA_EMAIL_FIELDS.length;i++){
    if(el.matches(ERA_EMAIL_FIELDS[i].selector))return ERA_EMAIL_FIELDS[i].key
  }
  return null
}
let eraEmailSuggestPanel=null,eraEmailSuggestInput=null,eraEmailSuggestKey=null;
function eraCloseEmailSuggestPanel(){
  eraEmailSuggestPanel&&eraEmailSuggestPanel.parentNode&&eraEmailSuggestPanel.parentNode.removeChild(eraEmailSuggestPanel),
  eraEmailSuggestPanel=null,eraEmailSuggestInput=null,eraEmailSuggestKey=null,
  window.removeEventListener("scroll",eraPositionEmailSuggestPanel,!0),
  window.removeEventListener("resize",eraPositionEmailSuggestPanel,!0)
}
function eraPositionEmailSuggestPanel(){
  if(!eraEmailSuggestPanel||!eraEmailSuggestInput)return;
  const r=eraEmailSuggestInput.getBoundingClientRect();
  eraEmailSuggestPanel.style.left=r.left+"px",
  eraEmailSuggestPanel.style.top=(r.bottom+2)+"px",
  eraEmailSuggestPanel.style.width=r.width+"px"
}
function eraRenderEmailSuggestPanel(){
  if(!eraEmailSuggestPanel||!eraEmailSuggestKey)return;
  const all=(window.getSharedEmailHistory?window.getSharedEmailHistory():{})[eraEmailSuggestKey]||[],
    typed=eraEmailSuggestInput.value.trim().toLowerCase(),
    matches=typed?all.filter(function(em){return em.toLowerCase().indexOf(typed)!==-1}):all.slice();
  eraEmailSuggestPanel.innerHTML="";
  if(!matches.length){
    const empty=document.createElement("div");
    empty.className="era-email-suggest-empty",
    empty.textContent=all.length?"No matches.":"No saved emails yet.",
    eraEmailSuggestPanel.appendChild(empty);
    return
  }
  matches.forEach(function(em){
    const row=document.createElement("div");
    row.className="era-email-suggest-row";
    const span=document.createElement("span");
    span.className="era-email-suggest-email",span.textContent=em,
    span.addEventListener("mousedown",function(ev){
      ev.preventDefault(),
      eraEmailSuggestInput.value=em,
      eraEmailSuggestInput.dispatchEvent(new Event("input",{bubbles:!0})),
      eraCloseEmailSuggestPanel()
    });
    const del=document.createElement("button");
    del.type="button",del.className="era-email-suggest-remove",del.textContent="✕",
    del.title="Remove "+em+" from saved emails",
    del.setAttribute("aria-label","Remove "+em+" from saved emails"),
    del.addEventListener("mousedown",function(ev){ev.preventDefault()}),
    del.addEventListener("click",function(ev){
      ev.preventDefault(),ev.stopPropagation();
      const key=eraEmailSuggestKey;
      window.deleteSharedEmailHistoryEntry&&window.deleteSharedEmailHistoryEntry({fieldKey:key,email:em}).catch(function(err){console.error(err)}),
      row.remove(),
      eraEmailSuggestPanel.querySelector(".era-email-suggest-row")||eraRenderEmailSuggestPanel()
    }),
    row.appendChild(span),row.appendChild(del),
    eraEmailSuggestPanel.appendChild(row)
  })
}
function eraOpenEmailSuggestPanel(input,fieldKey){
  eraEmailSuggestInput!==input&&eraCloseEmailSuggestPanel();
  if(!eraEmailSuggestPanel){
    eraEmailSuggestPanel=document.createElement("div"),
    eraEmailSuggestPanel.className="era-email-suggest-panel",
    c.appendChild(eraEmailSuggestPanel),
    window.addEventListener("scroll",eraPositionEmailSuggestPanel,!0),
    window.addEventListener("resize",eraPositionEmailSuggestPanel,!0)
  }
  eraEmailSuggestInput=input,eraEmailSuggestKey=fieldKey,
  eraPositionEmailSuggestPanel(),eraRenderEmailSuggestPanel()
}
c.addEventListener("focusin",function(ev){
  const key=eraEmailFieldKeyFor(ev.target);
  key&&eraOpenEmailSuggestPanel(ev.target,key)
});
c.addEventListener("input",function(ev){
  const key=eraEmailFieldKeyFor(ev.target);
  key&&eraEmailSuggestInput===ev.target&&eraRenderEmailSuggestPanel()
});
c.addEventListener("focusout",function(ev){
  const key=eraEmailFieldKeyFor(ev.target);
  if(!key)return;
  const target=ev.target,value=target.value.trim();
  setTimeout(function(){
    eraEmailSuggestInput===target&&eraCloseEmailSuggestPanel()
  },150),
  value&&ERA_EMAIL_FORMAT_RE.test(value)&&window.addSharedEmailHistoryEntry&&window.addSharedEmailHistoryEntry({fieldKey:key,email:value}).catch(function(err){console.error(err)})
});

// ---- Shared "recently used phone numbers" suggestions ----
// Mirrors the email history above (same click-to-pick / floating panel /
// org-wide Firestore-backed store shape), just for phone fields - see
// sharedPhoneHistory in functions/index.js and the window.getSharedPhoneHistory/
// addSharedPhoneHistoryEntry/deleteSharedPhoneHistoryEntry bridge in
// src/app.js. Reuses the email panel's CSS classes (era-email-suggest-*) -
// same look, no new stylesheet needed.
const ERA_PHONE_FIELDS=[
  {selector:".era-k-repl-phone",key:"keycardTenantPhone"}
];
const ERA_PHONE_FORMAT_RE=/^\d{10}$/;
function eraPhoneFieldKeyFor(el){
  if(!el||el.tagName!=="INPUT"||el.type!=="tel")return null;
  for(let i=0;i<ERA_PHONE_FIELDS.length;i++){
    if(el.matches(ERA_PHONE_FIELDS[i].selector))return ERA_PHONE_FIELDS[i].key
  }
  return null
}
let eraPhoneSuggestPanel=null,eraPhoneSuggestInput=null,eraPhoneSuggestKey=null;
function eraClosePhoneSuggestPanel(){
  eraPhoneSuggestPanel&&eraPhoneSuggestPanel.parentNode&&eraPhoneSuggestPanel.parentNode.removeChild(eraPhoneSuggestPanel),
  eraPhoneSuggestPanel=null,eraPhoneSuggestInput=null,eraPhoneSuggestKey=null,
  window.removeEventListener("scroll",eraPositionPhoneSuggestPanel,!0),
  window.removeEventListener("resize",eraPositionPhoneSuggestPanel,!0)
}
function eraPositionPhoneSuggestPanel(){
  if(!eraPhoneSuggestPanel||!eraPhoneSuggestInput)return;
  const r=eraPhoneSuggestInput.getBoundingClientRect();
  eraPhoneSuggestPanel.style.left=r.left+"px",
  eraPhoneSuggestPanel.style.top=(r.bottom+2)+"px",
  eraPhoneSuggestPanel.style.width=r.width+"px"
}
function eraRenderPhoneSuggestPanel(){
  if(!eraPhoneSuggestPanel||!eraPhoneSuggestKey)return;
  const all=(window.getSharedPhoneHistory?window.getSharedPhoneHistory():{})[eraPhoneSuggestKey]||[],
    typed=eraPhoneSuggestInput.value.replace(/\D/g,""),
    matches=typed?all.filter(function(ph){return ph.replace(/\D/g,"").indexOf(typed)!==-1}):all.slice();
  eraPhoneSuggestPanel.innerHTML="";
  if(!matches.length){
    const empty=document.createElement("div");
    empty.className="era-email-suggest-empty",
    empty.textContent=all.length?"No matches.":"No saved phone numbers yet.",
    eraPhoneSuggestPanel.appendChild(empty);
    return
  }
  matches.forEach(function(ph){
    const row=document.createElement("div");
    row.className="era-email-suggest-row";
    const span=document.createElement("span");
    span.className="era-email-suggest-email",span.textContent=ph,
    span.addEventListener("mousedown",function(ev){
      ev.preventDefault(),
      eraPhoneSuggestInput.value=W(ph),
      eraPhoneSuggestInput.dispatchEvent(new Event("input",{bubbles:!0})),
      eraClosePhoneSuggestPanel()
    });
    const del=document.createElement("button");
    del.type="button",del.className="era-email-suggest-remove",del.textContent="✕",
    del.title="Remove "+ph+" from saved phone numbers",
    del.setAttribute("aria-label","Remove "+ph+" from saved phone numbers"),
    del.addEventListener("mousedown",function(ev){ev.preventDefault()}),
    del.addEventListener("click",function(ev){
      ev.preventDefault(),ev.stopPropagation();
      const key=eraPhoneSuggestKey;
      window.deleteSharedPhoneHistoryEntry&&window.deleteSharedPhoneHistoryEntry({fieldKey:key,phone:ph}).catch(function(err){console.error(err)}),
      row.remove(),
      eraPhoneSuggestPanel.querySelector(".era-email-suggest-row")||eraRenderPhoneSuggestPanel()
    }),
    row.appendChild(span),row.appendChild(del),
    eraPhoneSuggestPanel.appendChild(row)
  })
}
function eraOpenPhoneSuggestPanel(input,fieldKey){
  eraPhoneSuggestInput!==input&&eraClosePhoneSuggestPanel();
  if(!eraPhoneSuggestPanel){
    eraPhoneSuggestPanel=document.createElement("div"),
    eraPhoneSuggestPanel.className="era-email-suggest-panel",
    c.appendChild(eraPhoneSuggestPanel),
    window.addEventListener("scroll",eraPositionPhoneSuggestPanel,!0),
    window.addEventListener("resize",eraPositionPhoneSuggestPanel,!0)
  }
  eraPhoneSuggestInput=input,eraPhoneSuggestKey=fieldKey,
  eraPositionPhoneSuggestPanel(),eraRenderPhoneSuggestPanel()
}
c.addEventListener("focusin",function(ev){
  const key=eraPhoneFieldKeyFor(ev.target);
  key&&eraOpenPhoneSuggestPanel(ev.target,key)
});
c.addEventListener("input",function(ev){
  const key=eraPhoneFieldKeyFor(ev.target);
  key&&eraPhoneSuggestInput===ev.target&&eraRenderPhoneSuggestPanel()
});
c.addEventListener("focusout",function(ev){
  const key=eraPhoneFieldKeyFor(ev.target);
  if(!key)return;
  const target=ev.target,digits=target.value.replace(/\D/g,"");
  setTimeout(function(){
    eraPhoneSuggestInput===target&&eraClosePhoneSuggestPanel()
  },150),
  digits&&ERA_PHONE_FORMAT_RE.test(digits)&&window.addSharedPhoneHistoryEntry&&window.addSharedPhoneHistoryEntry({fieldKey:key,phone:target.value.trim()}).catch(function(err){console.error(err)})
});
// "history supports click or typing + Enter" - clicking a suggestion row
// already commits it (mousedown handlers above); Enter lets someone who
// typed a full value commit/save it immediately without having to click
// away from the field first (which is what focusout above already saves
// on) - applies to every tracked email AND phone field.
c.addEventListener("keydown",function(ev){
  if(ev.key!=="Enter")return;
  const emailKey=eraEmailFieldKeyFor(ev.target),phoneKey=eraPhoneFieldKeyFor(ev.target);
  (emailKey||phoneKey)&&(ev.preventDefault(),ev.target.blur())
});

function se(e,t,r){const i=a(e),n=a(t);if(!i||!n)return;function l(){const o=r?i.checked:!i.checked;n.classList.toggle("era-field-hidden",!o)}i.addEventListener("change",l),l()}let Ue=0;function j(){const e=Ue++,t=document.createElement("div");t.className="era-entry-block",t.dataset.seq=e,t.innerHTML='<button type="button" class="era-remove-entry-btn">Remove this keycard</button><div class="era-k-action-wrap"><label>Card <span class="era-k-entry-num">1</span> <span class="era-required-mark">*</span></label><select class="era-k-action-select"><option value="activate">Activate</option><option value="deactivate">De-activate</option><option value="replacement">Replacement</option><option value="troubleshoot">Troubleshoot</option><option value="transfer">Transfer</option><option value="requestcard">Request Blank Keycard</option></select><button type="button" class="era-k-resume-guide-btn era-file-btn era-field-hidden" style="margin-top:8px;">Resume Step-by-Step Guide</button></div><div class="era-field-hidden"><input type="radio" name="era_k_action_'+e+'" class="era-k-activate" value="activate" checked><input type="radio" name="era_k_action_'+e+'" class="era-k-deactivate" value="deactivate"><input type="radio" name="era_k_action_'+e+'" class="era-k-replacement" value="replacement"><input type="radio" name="era_k_action_'+e+'" class="era-k-troubleshoot" value="troubleshoot"><input type="radio" name="era_k_action_'+e+'" class="era-k-transfer" value="transfer"><input type="radio" name="era_k_action_'+e+'" class="era-k-requestcard" value="requestcard"></div><div class="era-row2 era-k-requestcard-row era-field-hidden"><div class="era-k-requestcard-locWrap"><label>Location <span class="era-required-mark">*</span></label><input type="text" class="era-k-requestcardLocation" list="era_k_transferLocationList" placeholder="Search city, street or ZIP" autocomplete="off"></div><div class="era-k-requestcard-qtyWrap"><label>Keycard Quantity (1-50) <span class="era-required-mark">*</span></label><input type="number" class="era-k-requestcardQty" min="1" max="50" step="1" inputmode="numeric"></div></div><div class="era-k-requestcard-row era-k-requestcard-mgrRow era-field-hidden"><label>Manager Email <span class="era-required-mark">*</span></label><input type="email" class="era-k-requestcardManagerEmail"></div><div class="era-k-replacement-row era-field-hidden"><div><label>New Location</label><input type="text" class="era-k-replacementLocation" list="era_k_transferLocationList" placeholder="Search city, street or ZIP" autocomplete="off"></div><label>Card Serves</label><div class="era-checks"><label class="era-check"><input type="checkbox" class="era-k-repl-serves-cubework"> Cubework</label><label class="era-check"><input type="checkbox" class="era-k-repl-serves-unis"> Unis</label></div><div class="era-checks era-k-repl-hikunifi-row"><label class="era-check"><input type="checkbox" class="era-k-repl-serves-hikcentral"> HikCentral</label><label class="era-check"><input type="checkbox" class="era-k-repl-serves-unifi"> Unifi</label></div><div class="era-k-repl-extra era-field-hidden"><div class="era-row2"><div><label>Company Name <span class="era-required-mark">*</span></label><input type="text" class="era-k-repl-companyName"></div><div><label>Tenant First and Last Name <span class="era-required-mark">*</span></label><input type="text" class="era-k-repl-tenantName"></div></div><div class="era-row2"><div><label>Tenant Email</label><input type="email" class="era-k-repl-email"></div><div><label>Tenant Phone (10 digits)</label><input type="tel" class="era-k-repl-phone" placeholder="000-000-0000" maxlength="12" inputmode="tel"></div></div><label class="era-field-hidden">Old Keycard &rarr; New Keycard</label><div class="era-k-repl-pairs"></div><button type="button" class="era-add-entry-btn era-k-repl-addPairBtn">+ Add Another Keycard Replacement</button></div></div><div class="era-row3 era-k-standard-fields"><div class="era-k-companyName-wrap era-field-hidden"><label>Company Name <span class="era-required-mark">*</span></label><input type="text" class="era-k-companyName"></div><div><label>Tenant First and Last Name <span class="era-required-mark">*</span></label><input type="text" class="era-k-tenantName"></div><div><label>Keycard Number (10 digits)</label><input type="text" class="era-k-keycard" maxlength="10" inputmode="numeric" pattern="[0-9]*"></div></div><div class="era-k-transfer-row era-field-hidden"><div class="era-k-transfer-locPairs"><div class="era-row2 era-k-transfer-loc-pair"><div><label>Transfer From Location <span class="era-required-mark">*</span></label><input type="text" class="era-k-transferFrom" list="era_k_transferLocationList" placeholder="Search city, street or ZIP" autocomplete="off"></div><div><label>Transfer To Location <span class="era-required-mark">*</span></label><input type="text" class="era-k-transferTo" list="era_k_transferLocationList" placeholder="Search city, street or ZIP" autocomplete="off"></div></div></div><div class="era-k-transfer-kcAnchor"></div><div class="era-k-transfer-kcGroups"></div><div class="era-k-transfer-btnRow"><button type="button" class="era-add-entry-btn era-k-transfer-addLocBtn">+Add Another Location</button> <button type="button" class="era-add-entry-btn era-k-transfer-addKcBtn">+Add Another Keycard</button> <button type="button" class="era-add-entry-btn era-k-transfer-addNotesBtn">+Add Notes</button></div></div><div class="era-k-standard-fields"><div class="era-k-accessLevel-wrap"><label>Access Level (select all that apply)</label><div class="era-checks"><label class="era-check"><input type="checkbox" class="era-k-access-standard" checked> Standard</label><label class="era-check"><input type="checkbox" class="era-k-access-wh"> WH Only</label><label class="era-check"><input type="checkbox" class="era-k-access-office"> Office Only</label><label class="era-check"><input type="checkbox" class="era-k-access-other"> Other (specify)\u2026</label></div><input type="text" class="era-k-accessCustom era-field-hidden" placeholder="Custom access value"></div></div><div class="era-k-transfer-notes-wrap era-field-hidden"><label>Notes</label><textarea class="era-k-transfer-notes" placeholder="Enter notes for this transfer request"></textarea></div><button type="button" class="era-add-note-btn era-file-btn era-field-hidden">+ Add Note</button><textarea class="era-k-issue era-field-hidden" placeholder="Describe the issue"></textarea><div class="era-row2 era-k-contact-row"><div><label>Tenant Email</label><input type="email" class="era-k-email"></div><div><label>Tenant Phone (10 digits)</label><input type="tel" class="era-k-phone" placeholder="000-000-0000" maxlength="12" inputmode="tel"></div></div><div class="era-k-fee-anchor"></div><div class="era-checks era-k-fee-row"><label class="era-check"><input type="checkbox" class="era-k-fee"> Fee applies (extra key beyond the first 2 free \u2014 $30)</label><button type="button" class="era-remove-location-btn era-k-transfer-line1-removeBtn era-field-hidden" title="Remove this keycard line" aria-label="Remove this keycard line">\u2715</button></div><div class="era-k-signid-wrap" style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--era-border);"><div class="era-k-signid-activateFields"><div class="era-row2" style="margin-bottom:16px;"><div><label>Date Issued</label><input type="date" class="era-k-dateIssued"></div><div><label>Date Returned</label><input type="date" class="era-k-dateReturned"></div></div><label style="font-weight:700;">Signature / ID</label><div class="era-hint">This card\u2019s signature and photo ID \u2014 both are added to Attachments automatically once filled in.</div><label class="era-check" style="font-weight:600;"><input type="checkbox" class="era-k-signid-esign"> E-Signature</label><div class="era-k-signid-signNow"><label>Signature</label><div style="border:1px solid var(--era-border);border-radius:8px;overflow:hidden;margin-bottom:8px;"><canvas class="era-k-signid-canvas" style="display:block;width:100%;height:140px;touch-action:none;cursor:crosshair;background:#fff;"></canvas></div><button type="button" class="era-file-btn era-k-signid-clearBtn">Clear signature</button><div class="era-k-signid-inkStatus era-hint" style="font-weight:600;margin-top:4px;"></div></div><div class="era-k-signid-esignRow era-field-hidden"><label>Tenant E-Signature Email</label><input type="email" class="era-k-signid-email" placeholder="tenant@example.com"><button type="button" class="era-file-btn era-k-signid-sendBtn">Send for E-Signature</button><div class="era-file-list era-k-signid-sendStatus"></div></div><label style="margin-top:10px;">Photo ID</label><input type="file" class="era-k-signid-photoInput era-file-input-hidden" accept="image/*,.pdf"><button type="button" class="era-file-btn era-k-signid-photoBtn">Choose Photo ID</button><div class="era-file-list era-k-signid-photoStatus">No photo ID selected yet.</div></div><div class="era-k-notes-wrap"><textarea class="era-k-notes" placeholder="Notes / anything else to flag for this request"></textarea><button type="button" class="era-k-notes-removeBtn era-field-hidden" title="Remove this note" aria-label="Remove this note">✕</button></div><div class="era-k-signid-activateFields"><div class="era-k-signid-decision era-field-hidden" style="margin-top:10px;padding:10px;border:1px solid var(--era-border);border-radius:8px;background:#19191b;"><div class="era-k-signid-decisionButtons"><div style="font-weight:600;margin-bottom:6px;">Signature request sent \u2014 what next?</div><button type="button" class="era-file-btn era-k-signid-saveLeaveBtn">Save &amp; Leave</button> <button type="button" class="era-file-btn era-k-signid-waitBtn">Wait for Signature Now</button></div><div class="era-k-signid-waitStatus era-field-hidden"></div></div></div></div>';function r(){this.value=this.value.replace(/\D/g,"").slice(0,10)}t.querySelector(".era-k-keycard").addEventListener("input",r),t.querySelector(".era-k-phone").addEventListener("input",function(){this.value=W(this.value)}),t.querySelector(".era-k-repl-phone").addEventListener("input",function(){this.value=W(this.value)}),t.querySelector(".era-k-access-other").addEventListener("change",function(){t.querySelector(".era-k-accessCustom").classList.toggle("era-field-hidden",!this.checked)});
  // Tenant Company Name is hidden (2026-08-21, per Huy's request) - mirror
  // Tenant Name into it live so the required-field check and email
  // subject/company-display logic (both keyed off companyName server-side)
  // keep working without staff ever seeing or typing a separate value.
  t.querySelector(".era-k-tenantName").addEventListener("input",function(){t.querySelector(".era-k-companyName-wrap").classList.contains("era-field-hidden")&&(t.querySelector(".era-k-companyName").value=this.value)});function i(){const n=t.querySelector(".era-k-deactivate").checked,l=t.querySelector(".era-k-troubleshoot").checked,o=t.querySelector(".era-k-transfer").checked,u=t.querySelector(".era-k-requestcard").checked,rep=t.querySelector(".era-k-replacement").checked,d=n||l||u||rep,h=n||l||o||u||rep;
  // Standard fields (Tenant First and Last Name, Keycard Number - the
  // "era-row3 era-k-standard-fields" line - plus Access Level/Add Note in
  // the second era-k-standard-fields block) moved to the very FIRST
  // statement in this function (2026-08-22, per Huy's request: "remove both
  // Tenant First and Last Name, Keycard Number under Add Another Keycard
  // Replacement"). Previously this toggle sat near the END of one long
  // comma-chain - the exact failure mode already diagnosed for
  // era_k_servesCard (any exception earlier in the chain silently kills
  // every statement after it, leaving a hide/show stuck at whatever it was
  // before). Running it first means it always applies for Replacement
  // regardless of what else in this function does or doesn't run.
  t.querySelectorAll(".era-k-standard-fields").forEach(function(k){k.classList.toggle("era-field-hidden",u||rep)});
  t.querySelectorAll(".era-k-requestcard-row").forEach(function(k){k.classList.toggle("era-field-hidden",!u)});
  t.querySelector(".era-k-contact-row").classList.toggle("era-field-hidden",h),t.querySelector(".era-k-fee-row").classList.toggle("era-field-hidden",d),t.querySelector(".era-k-issue").classList.toggle("era-field-hidden",!l),
  // Company Name shown on its own (same row as Tenant Name/Keycard Number)
  // for De-activate (2026-08-22, per Huy's request) and, as of 2026-09-05
  // (per Huy's request, Troubleshoot-only), for Troubleshoot too (l joins n
  // here) - restored so the Preview email's Serves/Company/Tenant/Keycard
  // line can show a real, separately-entered Company Name for Troubleshoot
  // instead of the auto-mirrored Tenant Name every other action still uses
  // via the hidden-wrap behavior above. Access Level's checkbox group is
  // hidden for De-activate only (same 2026-08-22 request, unchanged) - the
  // underlying checkboxes/value are untouched (still default to
  // "Standard"), only the UI is hidden; buildKeycard() (functions/
  // emailRequest.js) was updated to stop printing the "Access:" line for a
  // deactivate entry so the hidden default doesn't leak into the sent
  // email/Preview.
  t.querySelector(".era-k-companyName-wrap").classList.toggle("era-field-hidden",!(n||l||o)),
  t.querySelector(".era-k-accessLevel-wrap").classList.toggle("era-field-hidden",n),
  // "Add Note" toggle under Access Level (2026-08-22, per Huy's request) -
  // De-activate's era-k-notes box now stays hidden until its own
  // era-add-note-btn is clicked once for this entry (dataset.eraNoteOpened,
  // set by the click listener above); every other action's notes
  // visibility (l||rep = Troubleshoot/Replacement hide it, everything else
  // shows it) is unchanged from before this pass. 2026-09-03, per Huy's
  // request: Request Blank Keycard's guide Step 8-2 gets the exact same
  // "+ Add Note" toggle-box behavior as De-activate - u joins n everywhere
  // below (era-add-note-btn itself was moved out of era-k-standard-fields,
  // which is hidden outright for u, so it can actually be seen - see the
  // button's own new position in the markup above).
  t.querySelector(".era-k-notes").classList.toggle("era-field-hidden",l||rep||(n||u)&&t.dataset.eraNoteOpened!=="1"),
  t.querySelector(".era-add-note-btn").classList.toggle("era-field-hidden",!((n||u)&&t.dataset.eraNoteOpened!=="1")),
  // Red X (2026-08-22, per Huy's request) next to De-activate's Note box,
  // sitting alongside the "+ Add Note" toggle above - only relevant once
  // that note has actually been opened for this entry; clicking it (see
  // the click listener added next to "+ Add Note"'s own below) clears the
  // text and flips era-add-note-btn back so the box can be re-opened.
  t.querySelector(".era-k-notes-removeBtn").classList.toggle("era-field-hidden",!((n||u)&&t.dataset.eraNoteOpened==="1")),
  // Notes lives inside era-k-signid-wrap's DOM subtree (added 2026-08-21),
  // whose own hidden toggle below normally swallows it for every non-
  // Activate action. Splitting the Activate-only sub-content (Date Issued/
  // Returned, Signature/ID, Photo ID, the remote-signing decision panel)
  // into its own era-k-signid-activateFields wrapper - always hidden
  // outside Activate, regardless of the note-opened state - lets the OUTER
  // era-k-signid-wrap itself be revealed just far enough to show the note
  // box once De-activate's Add Note has been clicked, without also
  // resurfacing any of that Activate-only content.
  t.querySelectorAll(".era-k-signid-activateFields").forEach(function(af){af.classList.toggle("era-field-hidden",h)}),
  t.querySelector(".era-k-transfer-row").classList.toggle("era-field-hidden",!o),t.querySelector(".era-k-replacement-row").classList.toggle("era-field-hidden",!rep),d&&(t.querySelector(".era-k-fee").checked=!1),eraSyncTransferLine1Position(o),
  // "+Add Notes" (2026-09-06, per Huy's request, Transfer-only) - same
  // "stays open once opened, via a dataset flag" pattern as De-activate's
  // "+ Add Note" (t.dataset.eraNoteOpened above), just gated on Transfer
  // (o) instead - see the era-k-transfer-addNotesBtn click listener below
  // for where the flag gets set.
  t.querySelector(".era-k-transfer-notes-wrap").classList.toggle("era-field-hidden",!(o&&t.dataset.eraTransferNotesOpened==="1")),
  // Date Issued/Returned + Signature/ID + Photo ID (2026-08-21, per Huy's
  // request) - this per-card block only makes sense for Activate (a new
  // card actually being issued); De-activate/Replacement/Troubleshoot/
  // Transfer/Request Card all hide it. Activate itself is unchanged: it's
  // simply whichever of the mutually-exclusive action radios above isn't
  // one of n/l/o/u/rep. 2026-09-03: the exception also covers u
  // (Request Blank Keycard) now, same reasoning as n - era-k-notes-wrap
  // (holding the actual .era-k-notes textarea) lives inside this wrap, so
  // it has to be revealed once that note is opened for a requestcard entry
  // too, same as it already was for De-activate.
  t.querySelector(".era-k-signid-wrap").classList.toggle("era-field-hidden",(n||l||o||u||rep)&&!((n||u)&&t.dataset.eraNoteOpened==="1")),
  K()}
  // ---- Action Tabs (reusable component) ----
  // Bridges one visible <select class="era-k-action-select"> to N
  // mutually-exclusive hidden radios (kept as a hidden, era-field-hidden
  // radio group so every existing selector in this file -
  // .era-k-activate/.era-k-replacement/etc, plus the separate Keycard Form
  // modal <script> below - keeps working unmodified; only the visible
  // control changed, not the state machine). Factored into its own
  // function so any future entry type that needs the same "one dropdown,
  // N hidden mutually-exclusive radios" behavior can reuse it instead of
  // re-wiring a change listener by hand.
  function eraActionTabs(entryEl,actions,onChange){
    entryEl.querySelector(".era-k-action-select").addEventListener("change",function(){
      const val=this.value;
      actions.forEach(function(v){
        const el=entryEl.querySelector(".era-k-"+v);
        el&&(el.checked=v===val)
      });
      onChange()
    })
  }
  eraActionTabs(t,["activate","deactivate","replacement","troubleshoot","transfer","requestcard"],i);
  // Transfer's own repeating "Location pairs" / "Keycard groups" (2026-09-06,
  // per Huy's request) - each +button appends one more row directly under
  // the previous row of its own kind (never removed, never reordered), so
  // typed values in earlier rows are never touched. The FIRST location pair
  // stays the pre-existing .era-k-transferFrom/.era-k-transferTo inputs
  // (unnumbered, required) for backward compatibility with every existing
  // collect/restore/validate call site that already reads those two exact
  // classes; rows 2+ use their own .era-k-transfer-extraFrom/-extraTo
  // classes instead, read separately (transferExtraLocations). Likewise the
  // FIRST keycard group stays the pre-existing .era-k-companyName/
  // .era-k-tenantName/.era-k-keycard row (unnumbered) above; groups 2+ use
  // .era-k-transfer-kc-company/-tenant/-number (transferExtraKeycards).
  function addTransferLocPair(){
    const wrap=t.querySelector(".era-k-transfer-locPairs");
    if(!wrap)return;
    const num=wrap.querySelectorAll(".era-k-transfer-loc-pair").length+1;
    const row=document.createElement("div");
    // era-k-repl-pair-inline (2026-09-06, per Huy's request: "also have an X
    // button to remove the newly added locations") - reuses the existing
    // flex-row CSS the Replacement pair rows already use (era-row2's fixed
    // 2-column grid has no room for a 3rd item) so the new ✕ can sit beside
    // the From/To fields instead of wrapping onto its own line. The FIRST
    // location pair (unnumbered .era-k-transferFrom/.era-k-transferTo,
    // still plain era-row2) is unaffected and stays non-removable, same
    // convention line 1's own keycard fields use.
    row.className="era-k-transfer-loc-pair era-k-repl-pair-inline";
    row.innerHTML='<div><label>Transfer From Location '+num+' <span class="era-required-mark">*</span></label><input type="text" class="era-k-transfer-extraFrom" list="era_k_transferLocationList" placeholder="Search city, street or ZIP" autocomplete="off"></div><div><label>Transfer To Location '+num+' <span class="era-required-mark">*</span></label><input type="text" class="era-k-transfer-extraTo" list="era_k_transferLocationList" placeholder="Search city, street or ZIP" autocomplete="off"></div><button type="button" class="era-remove-location-btn era-k-transfer-loc-removeBtn" title="Remove this location pair" aria-label="Remove this location pair">✕</button>';
    row.querySelector(".era-k-transfer-loc-removeBtn").addEventListener("click",function(){row.remove(),renumberTransferLocPairs()});
    wrap.appendChild(row)
  }
  // Relabels the remaining EXTRA location pairs (the first, unnumbered pair
  // is skipped - it's never removed) back to a contiguous "2, 3, ..."
  // sequence after one is removed from the middle, same pattern
  // renumberTransferKcGroups() below uses for keycard lines.
  function renumberTransferLocPairs(){
    Array.prototype.slice.call(t.querySelectorAll(".era-k-transfer-loc-pair")).slice(1).forEach(function(row,idx){
      const num=idx+2,labels=row.querySelectorAll("label");
      labels[0]&&(labels[0].innerHTML='Transfer From Location '+num+' <span class="era-required-mark">*</span>'),
      labels[1]&&(labels[1].innerHTML='Transfer To Location '+num+' <span class="era-required-mark">*</span>')
    })
  }
  function addTransferKcGroup(){
    const wrap=t.querySelector(".era-k-transfer-kcGroups");
    if(!wrap)return;
    const num=wrap.querySelectorAll(".era-k-transfer-kc-row").length+2;
    const row=document.createElement("div");
    row.className="era-k-transfer-kc-row";
    // Fee checkbox + X (2026-09-06, per Huy's request: "every keycard line
    // must include a Fee checkbox and an X removal button") - own class,
    // own boolean per group (transferExtraKeycards[].fee), NOT the shared
    // .era-k-fee checkbox (that one stays Card 1/line 1's own, see
    // eraSyncTransferLine1Position() above) - so each additional keycard
    // line can be fee'd independently. The 3 existing fields move into
    // their own inner .era-row3 wrapper so this new row can sit below them
    // without breaking the 3-column grid.
    row.innerHTML='<div class="era-row3"><div><label>Company Name '+num+' <span class="era-required-mark">*</span></label><input type="text" class="era-k-transfer-kc-company"></div><div><label>Tenant First and Last Name '+num+' <span class="era-required-mark">*</span></label><input type="text" class="era-k-transfer-kc-tenant"></div><div><label>Keycard Number '+num+' (10 digits)</label><input type="text" class="era-k-transfer-kc-number" maxlength="10" inputmode="numeric" pattern="[0-9]*"></div></div><div class="era-checks era-k-transfer-kc-feeRow"><label class="era-check"><input type="checkbox" class="era-k-transfer-kc-fee"> Fee applies (extra key beyond the first 2 free — $30)</label><button type="button" class="era-remove-location-btn era-k-transfer-kc-removeBtn" title="Remove this keycard line" aria-label="Remove this keycard line">✕</button></div>';
    row.querySelector(".era-k-transfer-kc-number").addEventListener("input",function(){this.value=this.value.replace(/\D/g,"").slice(0,10)});
    row.querySelector(".era-k-transfer-kc-removeBtn").addEventListener("click",function(){row.remove(),renumberTransferKcGroups(),updateTransferLine1RemoveVisibility()});
    wrap.appendChild(row);
    updateTransferLine1RemoveVisibility()
  }
  const eraTransferAddLocBtn=t.querySelector(".era-k-transfer-addLocBtn");
  eraTransferAddLocBtn&&eraTransferAddLocBtn.addEventListener("click",addTransferLocPair);
  const eraTransferAddKcBtn=t.querySelector(".era-k-transfer-addKcBtn");
  eraTransferAddKcBtn&&eraTransferAddKcBtn.addEventListener("click",addTransferKcGroup);
  // "+Add Notes" (2026-09-06, per Huy's request, Keycard > Transfer only) -
  // reveals the notes box placed under Access Level (era-k-transfer-notes-wrap,
  // toggled in i() above) and marks it "opened" so it survives every other
  // re-render of this entry (same dataset-flag pattern as De-activate's own
  // "+ Add Note", t.dataset.eraNoteOpened). Never auto-advances/submits -
  // just reveals the box and focuses it for typing.
  const eraTransferAddNotesBtn=t.querySelector(".era-k-transfer-addNotesBtn");
  eraTransferAddNotesBtn&&eraTransferAddNotesBtn.addEventListener("click",function(){
    t.dataset.eraTransferNotesOpened="1";
    t.querySelector(".era-k-transfer-notes-wrap").classList.remove("era-field-hidden");
    t.querySelector(".era-k-transfer-notes").focus();
  });
  // Line 1's own X (2026-09-06, per Huy's request) - Card 1's Company/Tenant/
  // Keycard fields (.era-row3.era-k-standard-fields) are the one keycard
  // line this entry can't structurally drop (every other action still reads
  // .era-k-companyName/.era-k-tenantName/.era-k-keycard unconditionally), so
  // "removing" line 1 shifts the first extra keycard group's values up into
  // those same fields/.era-k-fee and removes THAT group instead - from the
  // user's point of view line 1's old values are gone and whatever was line
  // 2 becomes the new line 1. Only shown once at least one extra group
  // exists (updateTransferLine1RemoveVisibility()) - with none, line 1 is
  // the only line and can't be removed, same convention the outer "Remove
  // this keycard" button already uses (hidden when only one entry exists).
  function updateTransferLine1RemoveVisibility(){
    const btn=t.querySelector(".era-k-transfer-line1-removeBtn");
    if(!btn)return;
    const isTransfer=t.querySelector(".era-k-transfer").checked,hasExtra=t.querySelectorAll(".era-k-transfer-kc-row").length>0;
    btn.classList.toggle("era-field-hidden",!(isTransfer&&hasExtra))
  }
  function renumberTransferKcGroups(){
    Array.prototype.slice.call(t.querySelectorAll(".era-k-transfer-kc-row")).forEach(function(row,idx){
      const num=idx+2,labels=row.querySelectorAll("label");
      labels[0]&&(labels[0].innerHTML='Company Name '+num+' <span class="era-required-mark">*</span>'),
      labels[1]&&(labels[1].innerHTML='Tenant First and Last Name '+num+' <span class="era-required-mark">*</span>'),
      labels[2]&&(labels[2].textContent='Keycard Number '+num+' (10 digits)')
    })
  }
  // Moves Card 1's Company/Tenant/Keycard fields (era-row3.era-k-standard-
  // fields, shared with every other action) plus the existing Fee checkbox
  // row (era-k-fee-row, same one Activate uses - "keep the exact existing
  // Fee checkbox functionality/behavior") into the Transfer row - ALL
  // Transfer From/To location pairs first, then line 1's keycard fields,
  // then any extra keycard groups (2026-09-06, per Huy's request: "Move ALL
  // Transfer From/To Location lines above ALL Company Name keycard lines").
  // Two fixed, never-moved anchor elements (era-k-transfer-kcAnchor inside
  // the transfer row, era-k-fee-anchor at the fee row's original spot)
  // make this reversible regardless of how many times Transfer is toggled
  // on/off for this entry.
  function eraSyncTransferLine1Position(o){
    const kcAnchor=t.querySelector(".era-k-transfer-kcAnchor"),feeAnchor=t.querySelector(".era-k-fee-anchor"),standardLine1=t.querySelector(".era-row3.era-k-standard-fields"),feeRowEl=t.querySelector(".era-k-fee-row"),transferRow=t.querySelector(".era-k-transfer-row");
    if(!kcAnchor||!feeAnchor||!standardLine1||!feeRowEl||!transferRow)return;
    o?(kcAnchor.parentNode.insertBefore(standardLine1,kcAnchor),kcAnchor.parentNode.insertBefore(feeRowEl,kcAnchor)):(feeAnchor.parentNode.insertBefore(feeRowEl,feeAnchor.nextSibling),transferRow.parentNode.insertBefore(standardLine1,transferRow));
    updateTransferLine1RemoveVisibility()
  }
  const eraTransferLine1RemoveBtn=t.querySelector(".era-k-transfer-line1-removeBtn");
  eraTransferLine1RemoveBtn&&eraTransferLine1RemoveBtn.addEventListener("click",function(){
    const kcRows=t.querySelectorAll(".era-k-transfer-kc-row");
    if(!kcRows.length)return;
    const first=kcRows[0];
    t.querySelector(".era-k-companyName").value=first.querySelector(".era-k-transfer-kc-company").value,
    t.querySelector(".era-k-tenantName").value=first.querySelector(".era-k-transfer-kc-tenant").value,
    t.querySelector(".era-k-keycard").value=first.querySelector(".era-k-transfer-kc-number").value,
    t.querySelector(".era-k-fee").checked=first.querySelector(".era-k-transfer-kc-fee").checked,
    first.remove(),
    renumberTransferKcGroups(),
    updateTransferLine1RemoveVisibility()
  });
  // Replacement's own "Card Serves" gate (2026-08-19): the Company/Tenant/
  // Old->New Keycard pairs block only shows once (Cubework or Unis) AND
  // (HikCentral or Unifi) are both picked - mirrors the mode-level Serves
  // gate above (era_k_serves_cubework/unis + era_k_hikcentral/era_k_unifi)
  // but scoped to this one entry, since Replacement can name a different
  // access system per keycard than the rest of the request.
  function updateReplExtra(){
    const cw=t.querySelector(".era-k-repl-serves-cubework").checked,un=t.querySelector(".era-k-repl-serves-unis").checked,cwOrUn=cw||un,hk=t.querySelector(".era-k-repl-serves-hikcentral").checked,uf=t.querySelector(".era-k-repl-serves-unifi").checked,show=cwOrUn&&(hk||uf);
    // Card Serves (Cubework/Unis/HikCentral/Unifi) is now always fully
    // visible and freely selectable, no dependency on any other field
    // (2026-08-24, per Huy's request) - the HikCentral/Unifi
    // stay-hidden-until-parent-ticked gate that used to sit here was
    // removed; the row is always shown. The Company/Tenant/pairs block
    // below is a separate, downstream field group (not Card Serves
    // itself), so it still only shows once (Cubework or Unis) AND
    // (HikCentral or Unifi) are picked - unchanged.
    t.querySelector(".era-k-repl-extra").classList.toggle("era-field-hidden",!show);
    show&&!t.querySelector(".era-k-repl-pair-row")&&addReplPairRow()
  }
  function addReplPairRow(){
    const wrap=t.querySelector(".era-k-repl-pairs"),row=document.createElement("div");
    row.className="era-k-repl-pair-row era-k-repl-pair-inline";
    row.innerHTML='<div><label>Old Keycard #</label><input type="text" class="era-k-repl-old" maxlength="10" inputmode="numeric" pattern="[0-9]*"></div><div><label>New Keycard #</label><input type="text" class="era-k-repl-new" maxlength="10" inputmode="numeric" pattern="[0-9]*"></div><label class="era-check era-k-repl-pair-feeLabel"><input type="checkbox" class="era-k-repl-pair-fee"> Fee</label><button type="button" class="era-remove-location-btn era-k-repl-removePairBtn" title="Remove this keycard pair" aria-label="Remove this keycard pair">✕</button>';
    row.querySelector(".era-k-repl-removePairBtn").addEventListener("click",function(){
      row.remove();
      t.querySelectorAll(".era-k-repl-pair-row").length||addReplPairRow()
    });
    wrap.appendChild(row)
  }
  t.querySelector(".era-k-repl-serves-cubework").addEventListener("change",updateReplExtra),
  t.querySelector(".era-k-repl-serves-unis").addEventListener("change",updateReplExtra),
  t.querySelector(".era-k-repl-serves-hikcentral").addEventListener("change",updateReplExtra),
  t.querySelector(".era-k-repl-serves-unifi").addEventListener("change",updateReplExtra),
  t.querySelector(".era-k-repl-addPairBtn").addEventListener("click",addReplPairRow);
  // "Add Note" toggle under Access Level (2026-08-22, per Huy's request) -
  // only relevant for De-activate: the note box for every other action's
  // visibility is untouched (see i() below). Clicking this once per entry
  // flips a dataset flag so i() (re-run on every action change) knows the
  // box was deliberately opened - re-running i() here also flips the
  // button's own visibility off immediately.
  t.querySelector(".era-add-note-btn").addEventListener("click",function(){t.dataset.eraNoteOpened="1",i()});
  t.querySelector(".era-k-notes-removeBtn").addEventListener("click",function(){t.querySelector(".era-k-notes").value="",t.dataset.eraNoteOpened="",i()});
  t.querySelector(".era-k-activate").addEventListener("change",i),t.querySelector(".era-k-deactivate").addEventListener("change",i),t.querySelector(".era-k-replacement").addEventListener("change",i),t.querySelector(".era-k-troubleshoot").addEventListener("change",i),t.querySelector(".era-k-transfer").addEventListener("change",i),t.querySelector(".era-k-requestcard").addEventListener("change",i),t.querySelector(".era-remove-entry-btn").addEventListener("click",function(){eraCleanupKeycardSignId(t),t.remove(),le(),K()}),a("era_k_entries").appendChild(t),eraWireKeycardSignId(t),eraFilterKeycardActionSelect(t),le(),K()}function le(){const e=c.querySelectorAll("#era_k_entries .era-entry-block");e.forEach(function(t,idx){t.querySelector(".era-remove-entry-btn").style.display=e.length>1?"":"none";const numEl=t.querySelector(".era-k-entry-num");if(numEl)numEl.textContent=String(idx+1)})}
// ---- Per-card Signature / ID (2026-08-21, per Huy's request) ----
// Lives inside every keycard entry (Card 1, Card 2, ... - both the first
// entry and every one added via "+ Add another keycard"), not as a
// separate standalone card. Deliberately rebuilt inline here rather than
// reusing the Keycard Form modal's own signature/Photo ID machinery
// (confirmed with Huy) - that machinery's payload helpers
// (fieldValuesSnapshot()/otherSignaturesSnapshot()) are private to that
// OTHER <script> block's IIFE and shaped around the PDF's own field
// names, not this tab's simpler per-entry fields. "Use the existing
// features" here means: call the SAME backend callables the modal uses
// (window.createKeycardSignatureRequest, window.getSignatureRequestsCache,
// window.getSignedKeycardFormPdf - all already bridged onto window by
// src/app.js, no functions/ or src/app.js change needed), with a payload
// built from THIS tab's own fields instead of the modal's PDF-field
// snapshot.
//
// Known accepted risk (same one already documented for the modal's own
// Card N / SIGN#N scheme, docs/Keycard.md §21 "Positional Card N
// indexing"): targetField ("card<n>_signature") is derived from this
// entry's LIVE position among #era_k_entries at the moment Send/Attach
// is clicked, not a persisted stable id - removing an earlier entry after
// a remote request has already been sent can shift this entry's own
// number and desync it from the request it already sent. Not solved here,
// consistent with the existing precedent.
const eraKeycardSignIdCleanups = new WeakMap();
// Deferred signature repaints (2026-08-29, "Edit doesn't restore the customer
// signature"). A restored signature decodes asynchronously, and if its card
// has no layout box at that instant there is nothing to draw onto yet - the
// card parks the decoded image and registers here, and this one shared sweep
// draws it the moment the card actually gets a box. Deliberately NOT a
// ResizeObserver: measured in Chrome, an RO armed on an element inside a
// display:none subtree does not fire when that subtree is revealed, which is
// exactly the transition that matters here (the Keycard reveal gate coming
// off, or the CW Email Request view being shown).
//
// Each registered callback returns true when it's done and should be dropped.
// The sweep only exists while something is parked, gives up after ~15s rather
// than running forever on a card that stays hidden, and is restarted by
// anything that could plausibly reveal one - a click (the gate is lifted by a
// dropdown pick, a tab click, or Submission > Edit), a window resize, or the
// tab becoming visible again.
//
// setTimeout, NOT requestAnimationFrame: rAF is tied to the page actually
// producing frames, so it can be starved indefinitely (measured: zero
// callbacks in a non-compositing/occluded window) - exactly the "the form was
// hidden when the signature came back" situation this exists to recover from.
// A ~80ms poll is a couple of getBoundingClientRect() calls on the handful of
// parked cards and always runs.
const eraSignIdPendingRepaints = new Set();
let eraSignIdRepaintTimer = null, eraSignIdRepaintTicks = 0;
function eraSignIdQueueRepaint(fn) {
  eraSignIdPendingRepaints.add(fn);
  eraSignIdStartRepaintSweep();
}
function eraSignIdStartRepaintSweep() {
  if (eraSignIdRepaintTimer !== null || !eraSignIdPendingRepaints.size) return;
  eraSignIdRepaintTicks = 0;
  const tick = function () {
    eraSignIdRepaintTimer = null;
    Array.from(eraSignIdPendingRepaints).forEach(function (fn) {
      let done = true;
      try { done = fn(); } catch (e) { console.error("eraSignIdQueueRepaint: repaint failed:", e); }
      if (done) eraSignIdPendingRepaints.delete(fn);
    });
    if (!eraSignIdPendingRepaints.size) return;
    if (++eraSignIdRepaintTicks > 190) return;
    eraSignIdRepaintTimer = setTimeout(tick, 80);
  };
  eraSignIdRepaintTimer = setTimeout(tick, 0);
}
document.addEventListener("click", eraSignIdStartRepaintSweep, true);
window.addEventListener("resize", eraSignIdStartRepaintSweep);
document.addEventListener("visibilitychange", eraSignIdStartRepaintSweep);
function eraWireKeycardSignId(entryEl) {
  const canvas = entryEl.querySelector(".era-k-signid-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let drawing = false, hasInk = false;
  let signFilename = null, photoIdFilename = null, remoteToken = null, remoteInterval = null, remoteFinished = false;

  function entryNumber() {
    return Array.prototype.indexOf.call(c.querySelectorAll("#era_k_entries .era-entry-block"), entryEl) + 1;
  }
  function removeFromKeycard(filename) {
    if (!filename) return;
    g.keycard = g.keycard.filter(function (f) { return f.name !== filename; });
  }

  // Green-check status line under the canvas (2026-08-21, Submission "Edit"
  // full restore pass) - "show a green check that it is successfully drawn
  // or attached," separate from the ink itself so it still reads correctly
  // even before the canvas has finished re-rendering a restored signature.
  const inkStatusEl = entryEl.querySelector(".era-k-signid-inkStatus");
  function updateInkStatus() {
    if (inkStatusEl) inkStatusEl.innerHTML = hasInk ? "✅ Signature captured" : "";
    // Nudge the Step-by-Step Guide (2026-08-30 fix, see window.eraGuideScheduleRefresh's
    // own comment) - this fires from paintSignature()'s async Image.onload during a
    // Submission > Edit restore, which is neither a click/input/change nor a guaranteed-
    // to-run rAF tick, so nothing else re-evaluates step 21's Preview-button hold the
    // moment this card's signature actually lands.
    if (typeof window.eraGuideScheduleRefresh === "function") window.eraGuideScheduleRefresh();
  }

  // Persists this card's ink server-side (keycardRequestHistory/{requestId}.
  // signIdSignatures[cardNumber]) so a later "Edit" - even after a page
  // refresh or in a different browser session - can redraw it (see
  // functions/index.js's saveKeycardSignIdSignature). Also marks the card
  // "signed" via the existing, generic updateKeycardHistoryStatus callable
  // (the same one the Keycard Form modal uses) so Pending/Complete rollup
  // recognizes cards signed through this newer per-entry UI too. Best-
  // effort/non-blocking, same pattern as the shared email/phone history
  // saves elsewhere in this file - a failure here shouldn't block drawing.
  function persistSignIdSignature(dataUrl) {
    if (!window.saveKeycardSignIdSignature) return;
    const requestId = eraGetOrCreateKeycardRequestId();
    const n = String(entryNumber());
    eraTrackKeycardSave(window.saveKeycardSignIdSignature({ requestId: requestId, cardNumber: n, dataUrl: dataUrl || null }).catch(function (e) {
      console.error("saveKeycardSignIdSignature failed:", e);
    }));
    if (dataUrl && window.updateKeycardHistoryStatus) {
      window.updateKeycardHistoryStatus({ requestId: requestId, cardNumber: n }).catch(function (e) {
        console.error("updateKeycardHistoryStatus failed:", e);
      });
    }
  }

  // Size the canvas's actual pixel buffer to match its CSS box so strokes
  // aren't blurry/misaligned on high-DPI screens. NOT done unconditionally
  // at init (bug found 2026-08-22, live testing) - every keycard entry is
  // created by j() the moment index.html's script runs, which is BEFORE
  // whichever top-level app tab (Tickets/Roadmap/CW Email Request/etc.) the
  // page actually lands on is chosen - if CW Email Request isn't the
  // initial view, #emailRequestAttachmentsEmbedView is display:none at that
  // instant, getBoundingClientRect() reports width 0, and the canvas's
  // real pixel buffer got permanently fixed at ~1x140px while its CSS box
  // was still stretched to 100% width - drawing then computed screen
  // coordinates against the big stretched box but painted them into a
  // backing store 1px wide, so every stroke landed off-canvas and nothing
  // ever visibly drew. Fixed by sizing LAZILY, right before the canvas is
  // actually used (first stroke, or a restored signature) - guarded by
  // `sized` so a second call (e.g. a later stroke, or a restore after a
  // stroke) can't re-stamp the backing store and silently wipe out ink
  // already drawn.
  //
  // 2026-08-29 follow-up ("Edit doesn't restore the customer signature"):
  // "by then the tab holding it is guaranteed visible" was NOT true for the
  // restore path. Submission > Edit repaints saved ink from an async
  // Image.onload, and if the card has no layout box at that instant - the
  // Keycard reveal gate still on, #emailRequestAttachmentsEmbedView not
  // displayed yet, the window hidden/zero-width, a card whose action block
  // is hidden - this function used to just `return`, leaving `sized` false
  // with NO retry. The restored PNG was then drawn into the browser's
  // default 300x140 backing store stretched across a ~570px CSS box, so the
  // signature came back as an unreadable smear or nothing at all (while
  // "Signature captured" still claimed it was fine), and nothing ever
  // repainted it. It now reports whether it actually sized, and a decoded
  // signature that couldn't be shown yet is PARKED and repainted the moment
  // the canvas gets a real box (see repaintPendingSignature() below and
  // eraSignIdQueueRepaint() further down). Returns true once the backing
  // store is usable.
  let sized = false;
  function ensureCanvasSized() {
    if (sized) return true;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2) return false;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(rect.width, 1) * ratio;
    canvas.height = 140 * ratio;
    ctx.scale(ratio, ratio);
    sized = true;
    return true;
  }
  // A decoded signature that belongs on this canvas but couldn't be drawn
  // yet, because there was no layout box at the time. Only ever set for ink
  // that came from somewhere else (a restored signIdSignatures entry, or a
  // completed remote e-signature) - ink drawn by hand here is painted at the
  // right size by definition and needs no repaint. Kept as the already-
  // decoded Image so the repaint costs nothing beyond a drawImage.
  let pendingSignatureImg = null;
  // 2026-08-30: this blit is in DEVICE pixels (canvas.width/height), but the
  // context carries ensureCanvasSized()'s ctx.scale(dpr, dpr) - which exists so
  // HAND-DRAWN strokes can use CSS-pixel coordinates from pos(). Drawing device
  // dimensions through that transform put the restored PNG on screen dpr times
  // too large and clipped: measured on a devicePixelRatio 2.5 display, ink
  // spanning x 45-439 / y 83-213 of a 1428x350 buffer came back at x 358-1059 /
  // y 208-349, i.e. blown up and running off the bottom edge. So reset the
  // transform for the blit itself and put it straight back. Affects every path
  // that paints ink from a PNG rather than from strokes - Submission > Edit's
  // restore, a completed remote e-signature, and the guide's same-tenant-email
  // signature reuse - and is a no-op at devicePixelRatio 1.
  function drawSignatureImage(img) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  // Returns true when there's nothing left to do for this card (painted,
  // nothing parked, or the entry is gone), false to be tried again - the
  // contract eraSignIdQueueRepaint()'s sweep expects.
  function repaintPendingSignature() {
    if (!pendingSignatureImg || !entryEl.isConnected) { pendingSignatureImg = null; return true; }
    if (!ensureCanvasSized()) return false;
    drawSignatureImage(pendingSignatureImg);
    pendingSignatureImg = null;
    return true;
  }
  // Draws one signature PNG onto this card's canvas. Single entry point for
  // both restore paths (Submission > Edit's eraSignIdRestore, and
  // finishRemoteSignature's pull of a tenant's completed e-signature) so
  // both get the same deferred-repaint and decode-failure handling. onDone
  // is called with true only when the PNG actually decoded - a card whose
  // stored data URL can't be read (e.g. one that was truncated on the way
  // into Firestore) now says so instead of silently restoring nothing.
  function paintSignature(dataUrl, onDone) {
    const img = new Image();
    img.onload = function () {
      // The ink is real as soon as it decodes, whether or not it can be
      // shown yet - eraSignIdIsSatisfied()/the guide read this, and a card
      // restored while its block is still hidden IS signed.
      hasInk = true;
      updateInkStatus();
      if (ensureCanvasSized()) { pendingSignatureImg = null; drawSignatureImage(img); }
      else { pendingSignatureImg = img; eraSignIdQueueRepaint(repaintPendingSignature); }
      if (onDone) onDone(true);
    };
    img.onerror = function () {
      console.error("paintSignature: couldn't decode the saved signature for card " + entryNumber());
      pendingSignatureImg = null;
      if (inkStatusEl) inkStatusEl.innerHTML = "⚠️ Saved signature couldn't be loaded — re-sign this card.";
      if (onDone) onDone(false);
    };
    img.src = dataUrl;
  }
  function pos(evt) {
    const r = canvas.getBoundingClientRect();
    const p = evt.touches && evt.touches.length ? evt.touches[0] : evt;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  function start(evt) { evt.preventDefault(); ensureCanvasSized(); drawing = true; const p = pos(evt); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(evt) { if (!drawing) return; evt.preventDefault(); const p = pos(evt); ctx.strokeStyle = "#111827"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk = true; }
  function end() { if (!drawing) return; drawing = false; syncSignature(); }
  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", end);
  canvas.addEventListener("mouseleave", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  function syncSignature() {
    if (signFilename) removeFromKeycard(signFilename);
    if (!hasInk) { signFilename = null; H("keycard"); updateInkStatus(); return; }
    // Composite onto an opaque white background before export - a
    // transparent PNG can silently lose its ink in some downstream
    // PDF/email renderers (the exact bug already found/fixed for the
    // Keycard Form modal's own signatures - see the "transparent PNG /
    // SMask" entry in docs/email-request-attachments-embed-tab.md).
    const out = document.createElement("canvas");
    out.width = canvas.width; out.height = canvas.height;
    const octx = out.getContext("2d");
    octx.fillStyle = "#fff"; octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    out.toBlob(function (blob) {
      if (!blob) return;
      const filename = "Signature_Card" + entryNumber() + ".png";
      removeFromKeycard(filename);
      signFilename = filename;
      g.keycard.push(new File([blob], filename, { type: "image/png" }));
      H("keycard");
      updateInkStatus();
      persistSignIdSignature(out.toDataURL("image/png"));
      eraMaybeAutoSaveSignId();
    }, "image/png");
  }
  entryEl.querySelector(".era-k-signid-clearBtn").addEventListener("click", function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Drop any parked (decoded but not-yet-drawable) signature too, or the
    // repaint sweep would helpfully redraw the one just cleared.
    pendingSignatureImg = null;
    hasInk = false;
    removeFromKeycard(signFilename);
    signFilename = null;
    updateInkStatus();
    persistSignIdSignature(null);
    H("keycard");
    eraMaybeAutoSaveSignId();
  });

  // Sign Now (local canvas, default) vs Email E-Signature (remote,
  // tokenized) - mutually exclusive, same UX pattern the Keycard Form
  // modal already uses for this choice.
  const esignCheckbox = entryEl.querySelector(".era-k-signid-esign");
  const signNowBlock = entryEl.querySelector(".era-k-signid-signNow");
  const esignRow = entryEl.querySelector(".era-k-signid-esignRow");
  esignCheckbox.addEventListener("change", function () {
    signNowBlock.classList.toggle("era-field-hidden", this.checked);
    esignRow.classList.toggle("era-field-hidden", !this.checked);
    // Per Huy's request (2026-08-21): if this entry's Tenant Email is
    // already filled in, reuse it as the e-signature address and fire the
    // send right away instead of making staff retype/re-click it.
    if (this.checked) {
      const tenantEmailEl = entryEl.querySelector(".era-k-email");
      const tenantEmail = tenantEmailEl ? tenantEmailEl.value.trim() : "";
      if (tenantEmail && !emailInput.value.trim()) emailInput.value = tenantEmail;
      if (emailInput.value.trim() && !sendBtn.disabled) sendBtn.click();
    }
  });

  const sendBtn = entryEl.querySelector(".era-k-signid-sendBtn");
  const emailInput = entryEl.querySelector(".era-k-signid-email");
  const sendStatus = entryEl.querySelector(".era-k-signid-sendStatus");
  const decisionEl = entryEl.querySelector(".era-k-signid-decision");
  const decisionButtonsEl = entryEl.querySelector(".era-k-signid-decisionButtons");
  const waitStatusEl = entryEl.querySelector(".era-k-signid-waitStatus");

  sendBtn.addEventListener("click", function () {
    const n = entryNumber();
    if (n > 7) { sendStatus.textContent = "Up to 7 cards per request — file a separate request for this one."; return; }
    const email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { sendStatus.textContent = "Enter a valid tenant email."; return; }
    if (!window.createKeycardSignatureRequest) { sendStatus.textContent = "Missing window.createKeycardSignatureRequest — check app.js."; return; }
    const tenantNameEl = entryEl.querySelector(".era-k-tenantName");
    const tenantName = tenantNameEl ? tenantNameEl.value.trim() : "";
    const keycardEl = entryEl.querySelector(".era-k-keycard");
    const emailEl = entryEl.querySelector(".era-k-email");
    const phoneEl = entryEl.querySelector(".era-k-phone");
    // fieldValues mirrors the modal's own snapshot shape (real PDF field
    // names) so a completed remote signature still fills the Keycard Form
    // PDF correctly - built from THIS tab's own fields since this card
    // has no access to the modal's fieldValuesSnapshot().
    const fieldValues = {
      licensee_company_name: w("era_k_licenseeCompanyName"),
      yardi_deal_account_number: w("era_k_yardiDealAccount"),
      property_access_location: w("era_location"),
      floor_number: w("era_k_floorNumber"),
      unit_number: w("era_k_unitNumber"),
    };
    fieldValues["card" + n + "_name"] = tenantName;
    // Real PDF field name is "card{n}_keycard_number" (confirmed against the
    // actual AcroForm field dump) - this used to say "_keycard#", which
    // silently dropped the keycard number from every remote-signed PDF since
    // buildSignedKeycardFormPdf() skips any field name it can't find. Kept
    // here only as the fallback snapshot (see buildSigningPdfInputsFromHistory,
    // functions/index.js, which now rebuilds this from live history at
    // signing time whenever historyRequestId resolves).
    fieldValues["card" + n + "_keycard_number"] = keycardEl ? keycardEl.value.trim() : "";
    fieldValues["card" + n + "_email"] = emailEl ? emailEl.value.trim() : "";
    fieldValues["card" + n + "_phone"] = phoneEl ? phoneEl.value.trim() : "";
    // Date Issued/Returned (2026-08-21, "Date Issued missing" investigation)
    // - this stale snapshot never carried these two fields at all, unlike
    // every other card field above. Normally moot, since
    // buildSigningPdfInputsFromHistory (functions/index.js) overrides this
    // whole snapshot with a fresh read of keycardRequestHistory at actual
    // signing time - but that fresh read only has today's Date Issued if
    // eraSaveKeycardSubmission() already ran by then (see the call added
    // right below), so this is a defense-in-depth fallback for whenever
    // historyRequestId can't be resolved at signing time.
    const dateIssuedEl = entryEl.querySelector(".era-k-dateIssued");
    const dateReturnedEl = entryEl.querySelector(".era-k-dateReturned");
    fieldValues["card" + n + "_date_issued"] = dateIssuedEl ? dateIssuedEl.value.trim() : "";
    fieldValues["card" + n + "_date_returned"] = dateReturnedEl ? dateReturnedEl.value.trim() : "";
    const payload = {
      targetField: "card" + n + "_signature",
      tenantEmail: email,
      tenantName: tenantName,
      locationText: w("era_location"),
      fieldValues: fieldValues,
      historyRequestId: eraGetOrCreateKeycardRequestId(),
    };
    sendBtn.disabled = true;
    const original = sendBtn.textContent;
    sendBtn.textContent = "Sending…";
    // Save the whole current submission (fullEntries - including this card's
    // Date Issued/Returned, just typed) into keycardRequestHistory BEFORE
    // minting the token - "Save & Leave"/"Wait for Signature Now" already do
    // this, but only once the decision buttons appear AFTER Send succeeds;
    // without a save here too, a tenant who signs unusually fast could hit
    // buildSigningPdfInputsFromHistory's "read fresh from history" before
    // today's edits ever landed in Firestore, silently falling back to the
    // narrower fieldValues snapshot above (2026-08-21, "Date Issued missing"
    // investigation). Fire-and-forget, same as those two buttons' own calls -
    // Send itself shouldn't block or fail on a save hiccup.
    eraTrackKeycardSave(eraSaveKeycardSubmission().catch(function (e) {
      console.error("eraSaveKeycardSubmission (on Send for E-Signature) failed:", e);
    }));
    window.createKeycardSignatureRequest(payload).then(function (res) {
      remoteToken = res.data.token;
      emailInput.disabled = true;
      sendBtn.textContent = "Sent";
      sendStatus.textContent = "Sent to " + email + " — waiting signature.";
      photoStatus.textContent = "Waiting for photo id.";
      decisionEl.classList.remove("era-field-hidden");
      decisionButtonsEl.classList.remove("era-field-hidden");
      waitStatusEl.classList.add("era-field-hidden");
    }).catch(function (e) {
      console.error("createKeycardSignatureRequest failed:", e);
      sendStatus.textContent = "Couldn't send: " + (e && e.message ? e.message : e);
      sendBtn.disabled = false;
      sendBtn.textContent = original;
    });
  });

  const photoBtn = entryEl.querySelector(".era-k-signid-photoBtn");
  const photoInput = entryEl.querySelector(".era-k-signid-photoInput");
  const photoStatus = entryEl.querySelector(".era-k-signid-photoStatus");
  function eraFileToRawBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const s = reader.result;
        const idx = typeof s === "string" ? s.indexOf(",") : -1;
        resolve(idx !== -1 ? s.slice(idx + 1) : s);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  photoBtn.addEventListener("click", function () { photoInput.click(); });
  photoInput.addEventListener("change", function () {
    const file = photoInput.files && photoInput.files[0];
    photoInput.value = "";
    if (!file) return;
    if (photoIdFilename) removeFromKeycard(photoIdFilename);
    photoIdFilename = file.name;
    g.keycard.push(file);
    photoStatus.textContent = "Uploading " + file.name + "…";
    H("keycard");
    // Persist to Storage too (2026-08-21+, full Edit-restore pass) - the
    // same generic uploadKeycardPhotoId callable the Keycard Form modal
    // uses, keyed by this entry's own card/position number, so "Edit" -
    // even after a refresh - can re-fetch and re-attach it, and so the
    // existing photoIds-based Pending/Complete status rollup recognizes a
    // photo ID collected through this newer per-entry UI too.
    if (!window.uploadKeycardPhotoId) { photoStatus.innerHTML = "✅ " + file.name + " (not saved to server - reload the page)"; return; }
    const requestId = eraGetOrCreateKeycardRequestId();
    const n = String(entryNumber());
    eraFileToRawBase64(file).then(function (base64Data) {
      return window.uploadKeycardPhotoId({
        requestId: requestId,
        cardNumber: n,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        base64Data: base64Data,
      });
    }).then(function () {
      if (photoIdFilename === file.name) { photoStatus.innerHTML = "✅ Attached"; eraMaybeAutoSaveSignId(); }
    }).catch(function (e) {
      console.error("uploadKeycardPhotoId failed:", e);
      if (photoIdFilename === file.name) photoStatus.textContent = "Attached here, but couldn't save to server: " + (e && e.message ? e.message : e);
    });
  });

  // Save & Leave / Wait for Signature Now - reuses the EXISTING Save path
  // (eraSaveKeycardSubmission(), writes a Pending record into
  // Submission/keycardRequestHistory, defined further down in this same
  // script - function declarations are hoisted, so calling it here before
  // its own textual definition is fine) and the EXISTING signature-
  // requests cache (window.getSignatureRequestsCache(), src/app.js) for
  // live polling - no new backend, no new Firestore collection.
  // Per Huy's request (2026-08-21): once the tenant signs and comes back
  // (with their photo ID attached from their own email/device), finish
  // this card automatically instead of leaving it on a manual "Download &
  // Attach" click - ink their actual signature onto the local canvas,
  // attach the signed PDF, and mark Photo ID satisfied with a green check.
  // Accepts an explicit token (2026-08-2x, "Wait for Signature" auto-check
  // on Edit — see eraAutoCheckSignaturesOnEdit() further down) so a
  // freshly Edit-restored entry (whose own remoteToken closure var starts
  // null, since Send was never clicked in THIS session) can still pull
  // down and sync a signature that completed while nobody was watching.
  // Falls back to the live remoteToken for the original in-session poll
  // path, unchanged. Returns the promise so a caller can wait for the
  // sync to actually land before deciding "this card is done."
  function finishRemoteSignature(token) {
    token = token || remoteToken;
    if (remoteFinished || !token || !window.getSignedKeycardFormPdf) return Promise.resolve();
    remoteFinished = true;
    remoteToken = token;
    if (waitStatusEl) waitStatusEl.textContent = "Signed — syncing…";
    return window.getSignedKeycardFormPdf({ token: token }).then(function (res) {
      const bin = atob(res.data.base64Data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const filename = "Signed_Card" + entryNumber() + ".pdf";
      removeFromKeycard(filename);
      g.keycard.push(new File([bytes], filename, { type: "application/pdf" }));

      // Ink the tenant's own signature onto this card's canvas so it reads
      // as signed here too, not just baked into the attached PDF. Wrapped
      // in its own promise (2026-08-2x fix) - image decode is genuinely
      // async, so the PDF alone used to attach immediately while the ink
      // painted a beat later; a caller chaining off this function's
      // returned promise (eraAutoCheckSignaturesOnEdit's auto-Save) could
      // move on before the canvas ever visibly updated. Now the returned
      // promise only resolves once the ink has actually been drawn.
      const inkPromise = res.data.signatureBase64 ? new Promise(function (resolve) {
        const signatureDataUrl = "data:image/png;base64," + res.data.signatureBase64;
        // Goes through paintSignature() (see eraWireKeycardSignId's own
        // comment on it) rather than driving an Image itself, so a card that
        // isn't laid out yet still ends up showing this ink once it is,
        // instead of losing it to an unsized backing store.
        paintSignature(signatureDataUrl, function (ok) {
          // Persist the tenant's remote signature into signIdSignatures too
          // (not just the signatureRequests/signedCards bookkeeping the
          // server already did above) so a later Edit can redraw it here
          // without another round trip. Only for a PNG that actually
          // decoded - storing one that didn't would just hand the same
          // unreadable image to the next Edit.
          if (ok) persistSignIdSignature(signatureDataUrl);
          resolve();
        });
      }) : Promise.resolve();

      // The photo ID they attached from their personal email/device.
      if (res.data.photoIdBase64) {
        const idBin = atob(res.data.photoIdBase64);
        const idBytes = new Uint8Array(idBin.length);
        for (let i = 0; i < idBin.length; i++) idBytes[i] = idBin.charCodeAt(i);
        const idFilename = res.data.photoIdFileName || ("PhotoID_Card" + entryNumber());
        if (photoIdFilename) removeFromKeycard(photoIdFilename);
        photoIdFilename = idFilename;
        g.keycard.push(new File([idBytes], idFilename, { type: res.data.photoIdContentType || "application/octet-stream" }));
        photoStatus.innerHTML = "✅ See the attachment below.";
        // NOT re-uploaded here via uploadKeycardPhotoId (checked, then
        // deliberately reverted, 2026-08-2x) - the server's own
        // submitSignatureRequest (functions/index.js) already writes
        // keycardRequestHistory/{requestId}.photoIds[cardNumber] itself,
        // server-side, the moment the tenant's signature completes -
        // independent of whether any staff browser is even open. Doing it
        // again here would just overwrite that correctly-`uploadedVia:
        // "remote"`-labeled entry with a redundant duplicate Storage copy
        // mislabeled "in-person".
      }

      return inkPromise.then(function () {
        H("keycard");
        waitStatusEl.textContent = "✅ Signed and attached.";
        sendStatus.textContent = "✅ Signed and attached.";
      });
    }).catch(function (e) {
      console.error("finishRemoteSignature failed:", e);
      remoteFinished = false;
      waitStatusEl.innerHTML = "✅ Signed. <button type=\"button\" class=\"era-file-btn era-k-signid-attachBtn\">Download &amp; Attach</button>";
      const attachBtn = waitStatusEl.querySelector(".era-k-signid-attachBtn");
      if (attachBtn) attachBtn.addEventListener("click", function () { attachBtn.disabled = true; finishRemoteSignature(); });
    });
  }
  function pollRemote() {
    if (!remoteToken || !window.getSignatureRequestsCache) return;
    const rec = window.getSignatureRequestsCache()[remoteToken];
    if (!rec) return;
    if (rec.status === "completed") {
      if (remoteInterval) { clearInterval(remoteInterval); remoteInterval = null; }
      finishRemoteSignature();
    } else if (rec.status === "pending" && rec.expiresAt && rec.expiresAt.toMillis && rec.expiresAt.toMillis() < Date.now()) {
      if (remoteInterval) { clearInterval(remoteInterval); remoteInterval = null; }
      waitStatusEl.textContent = "⚠️ Expired — send a new request if it is still needed.";
    }
  }
  entryEl.querySelector(".era-k-signid-saveLeaveBtn").addEventListener("click", function () {
    decisionEl.classList.add("era-field-hidden");
    if (remoteInterval) { clearInterval(remoteInterval); remoteInterval = null; }
    eraSaveKeycardSubmission();
  });
  entryEl.querySelector(".era-k-signid-waitBtn").addEventListener("click", function () {
    decisionButtonsEl.classList.add("era-field-hidden");
    waitStatusEl.classList.remove("era-field-hidden");
    waitStatusEl.textContent = "Pending on customer signature and photo ID…";
    // Save immediately, same as "Save & Leave" (2026-08-2x fix) - per
    // docs/Keycard.md §8, BOTH decision buttons are supposed to converge on
    // the same underlying Pending record; this one never actually called
    // Save, so a card sent for e-signature via "Wait for Signature Now"
    // had no keycardRequestHistory doc with real fullEntries/locationText
    // at all until/unless staff separately clicked the outer Save button.
    // If the signature then completed live in this same tab, only its bare
    // signIdSignatures/photoIds got written (persistSignIdSignature/
    // uploadKeycardPhotoId upsert the doc with just those fields) - a later
    // Edit on a fresh page load had no fullEntries to rebuild #era_k_entries
    // from, so the restored signature/photo ID landed on nothing (or the
    // wrong card, if more than one entry existed) and looked like it was
    // never attached at all.
    eraSaveKeycardSubmission();
    pollRemote();
    if (!remoteInterval) remoteInterval = setInterval(pollRemote, 3000);
  });

  // Submission "Edit" full restore (2026-08-21+) - lets
  // eraRestoreKeycardSignIdState() reinstate this ALREADY-SAVED entry's ink
  // and Photo ID after eraRestoreKeycardOuterState() has rebuilt
  // #era_k_entries from scratch (which wipes this closure's own hasInk/
  // signFilename/photoIdFilename back to blank along with the DOM). Kept
  // as a method on the entryEl itself (not exported globally) since it
  // needs to reach into this closure's private canvas/ctx/state - the same
  // reason eraKeycardSignIdCleanups above is a WeakMap keyed by entryEl
  // rather than plain module state.
  entryEl.eraSignIdRestore = function (opts) {
    opts = opts || {};
    if (opts.signatureDataUrl) {
      paintSignature(opts.signatureDataUrl, function (ok) {
        if (!ok) return;
        // Re-materialize the same PNG into g.keycard - the actual File
        // object from the original drawing session is long gone (DOM/JS
        // memory doesn't survive a refresh), only the persisted data URL
        // does, so Attachments/Send need this re-created from it too.
        signFilename = "Signature_Card" + entryNumber() + ".png";
        fetch(opts.signatureDataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
          removeFromKeycard(signFilename);
          g.keycard.push(new File([blob], signFilename, { type: "image/png" }));
          H("keycard");
        }).catch(function (e) { console.error("eraSignIdRestore: couldn't re-attach signature PNG:", e); });
        // persist: this card is being given ANOTHER card's signature under
        // the same-tenant-email reuse rule (see eraKeycardReuseDonors), so
        // write it into this card's own signIdSignatures slot - otherwise
        // the reuse would live only on screen and the saved record / the
        // generated Keycard Form PDF would still show this card unsigned.
        // Never set when restoring a card's OWN saved ink, which is already
        // exactly what's in Firestore.
        //
        // Guarded by the caller's edit token for the same reason the Photo ID
        // refetch is (see eraKeycardEditToken): this write happens after an
        // async image decode, and eraKeycardRequestId may by then belong to a
        // NEWER Edit on a different submission - persisting now would stamp
        // this signature onto that one.
        if (opts.persist && (opts.editToken === undefined || opts.editToken === eraKeycardEditToken)) {
          persistSignIdSignature(opts.signatureDataUrl);
        }
      });
    }
    if (opts.photoIdFile) {
      // Drop the PREVIOUSLY tracked photo ID first, then anything already
      // carrying the incoming name (2026-08-29 fix - this used to overwrite
      // photoIdFilename before calling removeFromKeycard(), so it only ever
      // removed the file it was about to add: a restore whose photo ID had
      // a different filename than the one already attached left BOTH in
      // g.keycard, and both went out on the email).
      if (photoIdFilename && photoIdFilename !== opts.photoIdFile.name) removeFromKeycard(photoIdFilename);
      removeFromKeycard(opts.photoIdFile.name);
      photoIdFilename = opts.photoIdFile.name;
      g.keycard.push(opts.photoIdFile);
      photoStatus.innerHTML = "✅ Attached";
      H("keycard");
      // Same guide nudge as updateInkStatus() above - this also lands from an
      // async restore (the Photo ID fetch in eraRestoreKeycardSignIdState),
      // and step 21's hold checks Photo ID coverage too.
      if (typeof window.eraGuideScheduleRefresh === "function") window.eraGuideScheduleRefresh();
    }
  };

  // "Wait for signature" auto-check on Edit (2026-08-2x, per Huy's request)
  // - eraAutoCheckSignaturesOnEdit() (further down, main embed script) needs
  // a way to pull down + attach a remote signature by an explicit token,
  // for a card whose Send happened in an earlier session (so this fresh
  // closure's own remoteToken starts null) - finishRemoteSignature (above)
  // was already reworked to accept one instead of only reading the live
  // poll's remoteToken, so just expose it.
  entryEl.eraFinishRemoteSignature = finishRemoteSignature;
  // Read by eraMaybeAutoSaveSignId() (per Huy's request: "once signature and
  // photo ID are both satisfied, click Save") - exposed the same way
  // eraFinishRemoteSignature/eraSignIdRestore are, since hasInk/
  // photoIdFilename are private to this closure.
  entryEl.eraSignIdIsSatisfied = function () { return hasInk && !!photoIdFilename; };
  // Read by eraCollectSignIdFileLabels() (Preview modal's Keycard Form
  // attachments section) to tell which g.keycard file is this card's own
  // Photo ID - photoIdFilename is otherwise private to this closure, same
  // reasoning as eraSignIdIsSatisfied above. Photo ID filenames are
  // arbitrary (whatever the original upload was named), unlike the
  // deterministic Signature_CardN.png/Signed_CardN.pdf names, so there's no
  // pattern to match on without this.
  entryEl.eraSignIdGetPhotoFilename = function () { return photoIdFilename; };
  // Read by the Step-by-Step Guide's same-tenant-email signature reuse
  // (2026-08-30): a card sharing an earlier card's tenant email skips step 14
  // and is handed that card's customer signature for real - see
  // stampReuseSignature() in the guide script at the end of this file.
  // Submission > Edit already does this (eraKeycardReuseDonors above), but it
  // reuses a data URL straight out of the SAVED signIdSignatures map; in a
  // live session no such copy exists yet - the only ink anywhere is inside
  // this closure - so hand it out the same way eraSignIdIsSatisfied() /
  // eraSignIdGetPhotoFilename() already hand out the rest of this closure's
  // private state.
  //
  // Exported composited onto opaque white exactly like syncSignature() does,
  // and for the same reason: a transparent PNG can silently lose its ink in
  // some downstream PDF/email renderers. Falls back to the PARKED,
  // decoded-but-not-yet-drawable image (see repaintPendingSignature) so a
  // donor card whose block has no layout box yet can still donate rather than
  // silently hand over a blank canvas. Returns "" when there is nothing to
  // give, which every caller treats as "don't stamp anything".
  entryEl.eraSignIdHasInk = function () { return hasInk; };
  entryEl.eraSignIdGetSignatureDataUrl = function () {
    if (!hasInk) return "";
    const src = pendingSignatureImg || (sized ? canvas : null);
    if (!src) return "";
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return "";
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    const octx = out.getContext("2d");
    octx.fillStyle = "#fff"; octx.fillRect(0, 0, w, h);
    octx.drawImage(src, 0, 0, w, h);
    try { return out.toDataURL("image/png"); } catch (e) {
      console.error("eraSignIdGetSignatureDataUrl: couldn't export card " + entryNumber() + "'s signature:", e);
      return "";
    }
  };

  eraKeycardSignIdCleanups.set(entryEl, function () {
    if (remoteInterval) { clearInterval(remoteInterval); remoteInterval = null; }
    pendingSignatureImg = null;
    eraSignIdPendingRepaints.delete(repaintPendingSignature);
    removeFromKeycard(signFilename);
    removeFromKeycard(photoIdFilename);
  });
}
// Runs when a "Remove this keycard" click deletes an entry mid-session
// (a full form reset already wipes g.keycard/#era_k_entries wholesale via
// st(), so this is only needed for the one-entry-at-a-time removal path) -
// without this, that entry's own signature/Photo ID files would silently
// stay orphaned in g.keycard forever, still riding along in Attachments
// for a card that no longer exists on the form.
function eraCleanupKeycardSignId(entryEl) {
  const fn = eraKeycardSignIdCleanups.get(entryEl);
  if (fn) { fn(); eraKeycardSignIdCleanups.delete(entryEl); H("keycard"); }
}
// Auto-Save once every relevant card's signature + photo ID are both
// satisfied (per Huy's request: "when both signature and photo id are
// satisfied, click Save"). Debounced ~1.2s, same reasoning as the retired
// Keycard Form modal's own maybeAutoSaveInsert() - a real cursive signature
// is drawn as several strokes with pen-lifts between them, and the FIRST
// stroke alone can already make hasInk true, so firing immediately would
// often Save mid-signature. Scoped to entries actually needing a card
// (Activate/Replacement, same eraKeycardHasActivateOrReplacement() gate the
// Attachments/Issued By sections use) - a Troubleshoot/Transfer/etc. entry
// has no Signature/ID block to satisfy. eraSignIdAutoSaveDone guards against
// re-Saving on every subsequent keystroke once the all-satisfied state has
// already been auto-saved once; reset back to false the moment that state
// stops holding (e.g. Clear signature, or adding a new not-yet-signed card)
// so a genuinely new "all satisfied" moment auto-saves again.
let eraSignIdAutoSaveTimer = null, eraSignIdAutoSaveDone = false;
function eraMaybeAutoSaveSignId() {
  if (typeof _ !== "undefined" && _ !== "keycard") return;
  if (eraSignIdAutoSaveTimer) clearTimeout(eraSignIdAutoSaveTimer);
  eraSignIdAutoSaveTimer = setTimeout(function () {
    const blocks = Array.prototype.slice.call(c.querySelectorAll("#era_k_entries .era-entry-block"));
    const relevant = blocks.filter(function (b) {
      const act = b.querySelector(".era-k-activate"), rep = b.querySelector(".era-k-replacement");
      return (act && act.checked) || (rep && rep.checked);
    });
    if (!relevant.length) { eraSignIdAutoSaveDone = false; return; }
    const allSatisfied = relevant.every(function (b) {
      return typeof b.eraSignIdIsSatisfied === "function" && b.eraSignIdIsSatisfied();
    });
    if (!allSatisfied) { eraSignIdAutoSaveDone = false; return; }
    if (eraSignIdAutoSaveDone) return;
    eraSignIdAutoSaveDone = true;
    eraSaveKeycardSubmission();
  }, 1200);
}
// "Issued By" staff sign-off (re-added per Huy's request) - a single
// submission-level counterpart to eraWireKeycardSignId() above: one name
// field + one signature canvas, wired ONCE (not per keycard entry) since
// there's exactly one Issued By block on the whole Keycard form. Mirrors
// that function's canvas handling (lazy ensureCanvasSized() for the same
// hidden-tab-at-init bug, opaque-PNG export, filename-based dedupe in
// g.keycard) but has no photo ID / e-signature / remote-signing concerns of
// its own.
let eraIssuedByHasInk = false, eraIssuedBySized = false, eraIssuedByAutoSaveTimer = null;
// Parked decoded signature for the pending-repaint sweep below - same
// "canvas had no layout box yet" recovery as eraWireKeycardSignId's
// pendingSignatureImg (2026-08-30 follow-up: eraRestoreIssuedByState never
// got that fix, so Submission > Edit could restore a customer signature but
// silently drop the staff one whenever the Keycard reveal gate/tab wasn't
// visible yet at the moment its Image.onload fired).
let eraIssuedByPendingSignatureImg = null;
// Dedicated auto-Save for the Issued By canvas specifically (per Huy's
// request: "once the staff signed, click Save") - deliberately separate
// from eraMaybeAutoSaveSignId() above, whose own "don't re-Save on every
// keystroke" guard is scoped to the per-card satisfied state and is
// typically already true by the time staff gets to Issued By, so it would
// silently no-op here. No "already done" guard needed here - each debounce
// firing is itself a real, fresh signing action worth Saving; re-signing
// later just Saves again.
function eraMaybeAutoSaveIssuedBy() {
  if (typeof _ !== "undefined" && _ !== "keycard") return;
  if (!eraIssuedByHasInk) return;
  if (eraIssuedByAutoSaveTimer) clearTimeout(eraIssuedByAutoSaveTimer);
  eraIssuedByAutoSaveTimer = setTimeout(function () { eraSaveKeycardSubmission(); }, 1200);
}
function eraWireKeycardIssuedBy() {
  const canvas = a("era_k_issuedBy_canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let drawing = false, filename = null;
  const nameInput = a("era_k_issuedBy_name");
  const inkStatusEl = a("era_k_issuedBy_inkStatus");
  let nameUserEdited = false;
  if (nameInput) nameInput.addEventListener("input", function () { nameUserEdited = true; });
  function updateInkStatus() {
    if (inkStatusEl) inkStatusEl.innerHTML = eraIssuedByHasInk ? "✅ Signature captured" : "";
  }
  function ensureCanvasSized() {
    if (eraIssuedBySized) return true;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2) return false;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(rect.width, 1) * ratio;
    canvas.height = 140 * ratio;
    ctx.scale(ratio, ratio);
    eraIssuedBySized = true;
    return true;
  }
  // Same dpr-transform-reset blit as eraWireKeycardSignId's drawSignatureImage
  // (2026-08-30 fix) - ensureCanvasSized() leaves ctx.scale(dpr, dpr) active
  // for hand-drawn strokes, so a device-pixel-sized restore blit through that
  // same context would land dpr times too large and clipped on any non-1
  // devicePixelRatio display.
  function drawIssuedBySignatureImage(img) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  // Returns true when there's nothing left to do (painted, nothing parked,
  // or the canvas is gone) - the contract eraSignIdQueueRepaint()'s sweep
  // expects.
  function repaintPendingIssuedBySignature() {
    if (!eraIssuedByPendingSignatureImg || !canvas.isConnected) { eraIssuedByPendingSignatureImg = null; return true; }
    if (!ensureCanvasSized()) return false;
    drawIssuedBySignatureImage(eraIssuedByPendingSignatureImg);
    eraIssuedByPendingSignatureImg = null;
    return true;
  }
  function pos(evt) {
    const r = canvas.getBoundingClientRect();
    const p = evt.touches && evt.touches.length ? evt.touches[0] : evt;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  function start(evt) { evt.preventDefault(); ensureCanvasSized(); drawing = true; const p = pos(evt); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(evt) { if (!drawing) return; evt.preventDefault(); const p = pos(evt); ctx.strokeStyle = "#111827"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineTo(p.x, p.y); ctx.stroke(); eraIssuedByHasInk = true; }
  function end() { if (!drawing) return; drawing = false; sync(); }
  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", end);
  canvas.addEventListener("mouseleave", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
  function persist(dataUrl) {
    if (!window.saveKeycardIssuedBySignature) return;
    eraTrackKeycardSave(window.saveKeycardIssuedBySignature({ requestId: eraGetOrCreateKeycardRequestId(), dataUrl: dataUrl || null }).catch(function (e) {
      console.error("saveKeycardIssuedBySignature failed:", e);
    }));
  }
  function sync() {
    if (filename) { g.keycard = g.keycard.filter(function (f) { return f.name !== filename; }); filename = null; }
    if (!eraIssuedByHasInk) { H("keycard"); updateInkStatus(); persist(null); return; }
    const out = document.createElement("canvas");
    out.width = canvas.width; out.height = canvas.height;
    const octx = out.getContext("2d");
    octx.fillStyle = "#fff"; octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    out.toBlob(function (blob) {
      if (!blob) return;
      filename = "IssuedBy_Signature.png";
      g.keycard = g.keycard.filter(function (f) { return f.name !== filename; });
      g.keycard.push(new File([blob], filename, { type: "image/png" }));
      H("keycard");
      updateInkStatus();
      persist(out.toDataURL("image/png"));
      // Per Huy's request: "once the staff signed, click Save" - a DEDICATED
      // trigger, not eraMaybeAutoSaveSignId() (that one's "already saved
      // once, don't re-Save on every later keystroke" guard is keyed off
      // the per-CARD satisfied state, which is typically already true by
      // the time staff gets to Issued By - so it would silently no-op here
      // instead of Saving). Debounced the same ~1.2s way, for the same
      // multi-stroke-signature reason.
      eraMaybeAutoSaveIssuedBy();
    }, "image/png");
  }
  const clearBtn = a("era_k_issuedBy_clearBtn");
  if (clearBtn) clearBtn.addEventListener("click", function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    eraIssuedByHasInk = false;
    sync();
  });
  // Restores a previously-saved name/signature on Submission > Edit - see
  // eraEditKeycardHistoryEntry() below.
  window.eraRestoreIssuedByState = function (rec) {
    if (!rec) return;
    if (nameInput && !nameUserEdited) nameInput.value = rec.issuedByName || "";
    if (rec.issuedBySignature) {
      const img = new Image();
      img.onload = function () {
        // The ink is real as soon as it decodes, whether or not it can be
        // shown yet - matches eraWireKeycardSignId's paintSignature() so a
        // staff signature restored while its block is still hidden (Keycard
        // reveal gate not lifted yet, tab not visible) still counts as signed
        // and gets repainted once the canvas actually has a layout box.
        eraIssuedByHasInk = true;
        updateInkStatus();
        if (ensureCanvasSized()) { eraIssuedByPendingSignatureImg = null; drawIssuedBySignatureImage(img); }
        else { eraIssuedByPendingSignatureImg = img; eraSignIdQueueRepaint(repaintPendingIssuedBySignature); }
        filename = "IssuedBy_Signature.png";
        fetch(rec.issuedBySignature).then(function (r) { return r.blob(); }).then(function (blob) {
          g.keycard = g.keycard.filter(function (f) { return f.name !== filename; });
          g.keycard.push(new File([blob], filename, { type: "image/png" }));
          H("keycard");
        }).catch(function (e) { console.error("eraRestoreIssuedByState: couldn't re-attach signature PNG:", e); });
      };
      img.onerror = function () {
        console.error("eraRestoreIssuedByState: couldn't decode the saved staff signature");
        eraIssuedByPendingSignatureImg = null;
        if (inkStatusEl) inkStatusEl.innerHTML = "⚠️ Saved signature couldn't be loaded — re-sign.";
      };
      img.src = rec.issuedBySignature;
    }
  };
  // Default the name from the signed-in staff member once (never overwrites
  // a value the person already typed or a restored one) - checked every
  // time K() runs (i.e. whenever the section could just be becoming
  // visible), same "prefill lazily, not at init" reasoning as the canvas
  // sizing above, since auth may not have resolved yet at page load.
  window.eraDefaultIssuedByName = function () {
    if (!nameInput || nameUserEdited || nameInput.value.trim()) return;
    if (typeof window.getCurrentUserDisplayName === "function") {
      const name = window.getCurrentUserDisplayName();
      if (name) nameInput.value = name;
    }
  };
}
// Replacement no longer triggers this (2026-08-22, per Huy's request:
// "Replacement doesn't use Keycard Form / doesn't attach to Attachments")
// - Activate only now, even though the name wasn't renamed (large blast
// radius across every call site below for a rename that adds no behavior).
function eraKeycardHasActivateOrReplacement(){const e=c.querySelectorAll("#era_k_entries .era-entry-block");return Array.prototype.slice.call(e).some(function(r){return r.querySelector(".era-k-activate").checked})}
// Stricter than eraKeycardHasActivateOrReplacement() above - Activate only,
// no Replacement (2026-08-21, per Huy's request: Deal & LICENSEE and
// Issued By should hide for Replacement too, unlike Attachments/Cardholders
// which still show for Activate-or-Replacement and are left unchanged).
function eraKeycardHasActivate(){const e=c.querySelectorAll("#era_k_entries .era-entry-block");return Array.prototype.slice.call(e).some(function(r){return r.querySelector(".era-k-activate").checked})}
// Any entry currently set to Replacement (2026-08-22, per Huy's request) -
// Replacement carries its own per-entry "Card Serves" fields
// (era-k-replacement-row), so the mode-level Serves card (era_k_servesCard,
// Cubework/Unis + HikCentral/Unifi above Card 1) is redundant and hidden
// whenever at least one entry is Replacement - see K() below.
function eraKeycardHasReplacement(){const e=c.querySelectorAll("#era_k_entries .era-entry-block");return Array.prototype.slice.call(e).some(function(r){return r.querySelector(".era-k-replacement").checked})}
function eraKeycardHaveFormValue(){return s("era_k_haveForm_yes")?"yes":s("era_k_haveForm_no")?"no":""}function eraKeycardEntryAction(en){return en.requestcard?"requestcard":en.troubleshoot?"troubleshoot":en.replacement?"replacement":en.transfer?"transfer":en.deactivate?"deactivate":"activate"}function eraRecordKeycardHistoryOnSend(u){const fn=window.recordKeycardSubmission;if(!fn)return;const entries=u.fields&&Array.isArray(u.fields.entries)?u.fields.entries:[],cardCount=entries.filter(function(en){return en.activate||en.replacement}).length,summary=entries.slice(0,7).map(function(en){return{companyName:en.companyName||en.replCompanyName||"",tenantName:en.tenantName||en.replTenantName||"",keycardNumber:en.keycard||"",email:en.email||en.replEmail||"",phone:en.phone||en.replPhone||"",action:eraKeycardEntryAction(en)}});
  // sent:true (repair - "don't mark Complete unless Preview > Send is
  // pressed") - the ONLY call site that sets this; every other
  // recordKeycardSubmission call (Save button, Keycard Form modal's own
  // Save/Save & Attach PDF) omits it, so the doc stays "pending" no matter
  // how fully signed/photo'd it is until an actual Send succeeds (see
  // computeKeycardHistoryStatus(), functions/keycardHistory.js). Also now
  // sends the same richer fullEntries/serves/hikcentral/unifi shape
  // eraSaveKeycardSubmission()/recordKeycardHistoryOnFormSave() do, so a
  // request that went straight to Send without ever being Saved first can
  // still be fully restored via History > Edit afterward.
  fn({requestId:eraGetOrCreateKeycardRequestId(),path:u.fields&&u.fields.haveForm||"yes",locationText:u.locationText,extraLocationBodyLines:u.extraLocationBodyLines||[],requesterEmail:u.requesterEmail,entriesSummary:summary,cardCount:cardCount,fullEntries:entries,serves:u.fields&&u.fields.serves||"",hikcentral:!!(u.fields&&u.fields.hikcentral),unifi:!!(u.fields&&u.fields.unifi),issuedByName:w("era_k_issuedBy_name"),issuedByDate:w("era_k_issuedBy_date"),sent:true}).catch(function(err){console.error("recordKeycardSubmission failed:",err)})}function eraUpdateKeycardFormVisibility(){
  // Permanently hidden/disabled (2026-08-21+, per Huy's request) - the
  // "Open Keycard Form" modal is superseded by the per-entry Signature/ID
  // block (era-k-signid-*) added the same day, and Submission > Edit used
  // to be able to resurface this button by restoring an older record's
  // path==="no" (which used to flip era_k_haveForm_no back to checked,
  // un-hiding era_k_formSection below). Now unconditional - no computed
  // predicate can ever show it again, regardless of entries/haveForm state.
  const e=a("era_k_formSection");
  if(e)e.classList.add("era-field-hidden");
  const openBtn=a("era_k_openFormBtn");
  if(openBtn)openBtn.disabled=true;
  eraUpdateCardholdersHint();
}function eraUpdateCardholdersHint(){const e=a("era_k_cardholdersHint"),lbl=a("era_k_cardholdersLabel");const t=eraKeycardHasActivateOrReplacement()&&eraKeycardHaveFormValue()==="no";if(e)e.classList.toggle("era-field-hidden",!t);if(lbl)lbl.classList.toggle("era-field-hidden",!t)}function K(){const t=eraKeycardHasActivateOrReplacement();c.querySelectorAll(".era-k-attach-fields").forEach(function(r){r.classList.toggle("era-field-hidden",!t)});
  // Deal & LICENSEE + Issued By (2026-08-21, per Huy's request): stricter
  // than the era-k-attach-fields toggle just above - Activate only, so
  // Replacement no longer keeps these two visible.
  const kAct=eraKeycardHasActivate(),kIssuedBy=a("era_k_issuedByCard"),kDealLic=a("era_k_dealLicenseeCard");
  if(kIssuedBy)kIssuedBy.classList.toggle("era-field-hidden",!kAct);
  if(kDealLic)kDealLic.classList.toggle("era-field-hidden",!kAct);
  eraSyncKServesCardVisibility();
  eraSyncKLocationGroupVisibility();
  eraUpdateKeycardFormVisibility(),eraUpdateCardholdersHint(),t&&typeof window.eraDefaultIssuedByName==="function"&&window.eraDefaultIssuedByName()}
  // Robust, order-independent guard (2026-08-22, per Huy's request - "both
  // locations should behave correctly and independently") - the mode-level
  // Serves card (era_k_servesCard) was only ever re-synced via K() at the
  // very end of i()'s long comma-chain, so any exception earlier in that
  // chain (any entry, any action) would silently kill every statement
  // after it, including the K() call itself, leaving the Serves card stuck
  // visible for Replacement. This is a second, fully independent "change"
  // listener on the same per-entry action <select>s - browsers run every
  // registered listener for an event on its own, so this always re-syncs
  // era_k_servesCard even if i()'s own chain broke somewhere else. Card 1's
  // own "Card Serves" section (era-k-replacement-row/updateReplExtra()) is
  // a completely separate code path and is untouched by this. Both this and
  // K() above now call the one shared eraSyncKServesCardVisibility() (see
  // the Keycard tab dropdown click listener, near the top of this script) -
  // classList only, no inline style, so nothing can stomp it out of band.
  c.addEventListener("change",function(ev){
    if(!ev.target||!ev.target.classList||!ev.target.classList.contains("era-k-action-select"))return;
    eraSyncKServesCardVisibility();
    eraSyncKLocationGroupVisibility()
  });
  a("era_k_addEntryBtn").addEventListener("click",j),j(),eraWireKeycardIssuedBy();
  // Keycard Submission History "Save" (2026-08-19 pass, splitting the old
  // single "Preview" button into Save + Preview for Keycard mode - see
  // era_k_saveBtn markup above). Mirrors one keycard entry's full raw shape
  // (the same object Se()'s "keycard" case produces) - kept as its own
  // function, rather than reusing Se() directly, so it can be read straight
  // off the live DOM regardless of which tab (_) is currently active, since
  // window.eraCollectKeycardOuterFieldsForHistory() below is also called
  // from the Keycard Form modal's OWN script (recordKeycardHistoryOnFormSave()),
  // which may run while a different tab is showing.
  function eraBuildKeycardEntryDataForHistory(n) {
    return {
      companyName: n.querySelector(".era-k-companyName").value.trim(),
      tenantName: n.querySelector(".era-k-tenantName").value.trim(),
      keycard: n.querySelector(".era-k-keycard").value.trim(),
      notes: n.querySelector(".era-k-notes").value.trim(),
      dateIssued: n.querySelector(".era-k-dateIssued").value.trim(),
      dateReturned: n.querySelector(".era-k-dateReturned").value.trim(),
      email: n.querySelector(".era-k-email").value.trim(),
      phone: n.querySelector(".era-k-phone").value.trim(),
      activate: n.querySelector(".era-k-activate").checked,
      deactivate: n.querySelector(".era-k-deactivate").checked,
      troubleshoot: n.querySelector(".era-k-troubleshoot").checked,
      transfer: n.querySelector(".era-k-transfer").checked,
      transferFrom: n.querySelector(".era-k-transferFrom").value.trim(),
      transferTo: n.querySelector(".era-k-transferTo").value.trim(),
      transferExtraLocations: Array.prototype.slice.call(n.querySelectorAll(".era-k-transfer-loc-pair")).slice(1).map(function (row) {
        return { from: (row.querySelector(".era-k-transfer-extraFrom") || { value: "" }).value.trim(), to: (row.querySelector(".era-k-transfer-extraTo") || { value: "" }).value.trim() };
      }),
      transferExtraKeycards: Array.prototype.slice.call(n.querySelectorAll(".era-k-transfer-kc-row")).map(function (row) {
        return { companyName: row.querySelector(".era-k-transfer-kc-company").value.trim(), tenantName: row.querySelector(".era-k-transfer-kc-tenant").value.trim(), keycard: row.querySelector(".era-k-transfer-kc-number").value.trim(), fee: row.querySelector(".era-k-transfer-kc-fee").checked };
      }),
      transferNotes: n.querySelector(".era-k-transfer-notes").value.trim(),
      requestcard: n.querySelector(".era-k-requestcard").checked,
      location: n.querySelector(".era-k-requestcardLocation").value.trim(),
      quantity: n.querySelector(".era-k-requestcardQty").value.trim(),
      managerEmail: n.querySelector(".era-k-requestcardManagerEmail").value.trim(),
      issue: n.querySelector(".era-k-issue").value.trim(),
      fee: n.querySelector(".era-k-fee").checked,
      accessValue: rt(n),
      replacement: n.querySelector(".era-k-replacement").checked,
      replLocation: n.querySelector(".era-k-replacementLocation").value.trim(),
      // Existing Location field removed from the Replacement main page
      // (2026-09-05, per Huy's request); replExistingLocation is kept as a
      // key (always empty) rather than dropped outright, so any older
      // Firestore history record that still has it doesn't error out
      // anywhere downstream that reads it.
      replExistingLocation: "",
      replServesCubework: n.querySelector(".era-k-repl-serves-cubework").checked,
      replServesUnis: n.querySelector(".era-k-repl-serves-unis").checked,
      replServesHikcentral: n.querySelector(".era-k-repl-serves-hikcentral").checked,
      replServesUnifi: n.querySelector(".era-k-repl-serves-unifi").checked,
      replCompanyName: n.querySelector(".era-k-repl-companyName").value.trim(),
      replTenantName: n.querySelector(".era-k-repl-tenantName").value.trim(),
      replEmail: n.querySelector(".era-k-repl-email").value.trim(),
      replPhone: n.querySelector(".era-k-repl-phone").value.trim(),
      replPairs: Array.prototype.slice.call(n.querySelectorAll(".era-k-repl-pair-row")).map(function (row) {
        return { oldKeycard: row.querySelector(".era-k-repl-old").value.trim(), newKeycard: row.querySelector(".era-k-repl-new").value.trim(), fee: row.querySelector(".era-k-repl-pair-fee").checked };
      }),
    };
  }
  window.eraCollectKeycardOuterFieldsForHistory = function () {
    return {
      serves: Ve(),
      hikcentral: s("era_k_hikcentral"),
      unifi: s("era_k_unifi"),
      haveForm: eraKeycardHaveFormValue(),
      locationText: w("era_location"),
      extraLocationBodyLines: eraCollectExtraLocationBodyLines(),
      requesterEmail: Y(),
      // Deal & LICENSEE (docs/Keycard.md §5.1, 2026-08-21) - new outer
      // fields, threaded through both Save paths same as everything else
      // here; see recordKeycardSubmission's matching optional fields.
      licenseeCompanyName: w("era_k_licenseeCompanyName"),
      yardiDealAccount: w("era_k_yardiDealAccount"),
      floorNumber: w("era_k_floorNumber"),
      unitNumber: w("era_k_unitNumber"),
      // "Issued By" staff sign-off (per Huy's request) - just the typed
      // name; the drawn signature persists itself via its own
      // saveKeycardIssuedBySignature callable (see eraWireKeycardIssuedBy()).
      issuedByName: w("era_k_issuedBy_name"),
      issuedByDate: w("era_k_issuedBy_date"),
      fullEntries: Array.prototype.slice.call(c.querySelectorAll("#era_k_entries .era-entry-block")).map(eraBuildKeycardEntryDataForHistory),
    };
  };
  // Restores one freshly-created (blank) keycard entry block from a stored
  // raw entry object (the shape eraBuildKeycardEntryDataForHistory()/Se()
  // produce) - the reverse of that mapping. Used by
  // window.eraRestoreKeycardOuterState() below, itself called from the
  // Keycard Form modal's own eraOpenKeycardFormForHistory() ("Edit" on a
  // Pending submission).
  function eraFillKeycardEntry(t, en) {
    if (!t || !en) return;
    function setVal(sel, v) { const el = t.querySelector(sel); if (el) el.value = v || ""; }
    function setChecked(sel, v) { const el = t.querySelector(sel); if (el) el.checked = !!v; }
    setVal(".era-k-companyName", en.companyName);
    setVal(".era-k-tenantName", en.tenantName);
    setVal(".era-k-keycard", en.keycard);
    setVal(".era-k-notes", en.notes);
    setVal(".era-k-dateIssued", en.dateIssued);
    setVal(".era-k-dateReturned", en.dateReturned);
    setVal(".era-k-email", en.email);
    setVal(".era-k-phone", en.phone);
    setVal(".era-k-transferFrom", en.transferFrom);
    setVal(".era-k-transferTo", en.transferTo);
    setVal(".era-k-transfer-notes", en.transferNotes);
    // Transfer's own repeating Location pairs / Keycard groups (2026-09-06) -
    // click each +button once per stored row (same "click to grow, then set
    // values" restore pattern era-k-repl-addPairBtn already uses below) so
    // the newly-created rows exist to receive setVal below.
    (function () {
      const extraLocs = Array.isArray(en.transferExtraLocations) ? en.transferExtraLocations.filter(function (lp) { return lp && (lp.from || lp.to); }) : [];
      const addLocBtn = t.querySelector(".era-k-transfer-addLocBtn");
      let guard = 0;
      while (addLocBtn && t.querySelectorAll(".era-k-transfer-loc-pair").length - 1 < extraLocs.length && guard++ < 50) addLocBtn.click();
      const locRows = Array.prototype.slice.call(t.querySelectorAll(".era-k-transfer-loc-pair")).slice(1);
      extraLocs.forEach(function (lp, idx) {
        const row = locRows[idx];
        if (!row) return;
        const fromEl = row.querySelector(".era-k-transfer-extraFrom"), toEl = row.querySelector(".era-k-transfer-extraTo");
        if (fromEl) fromEl.value = lp.from || "";
        if (toEl) toEl.value = lp.to || "";
      });
      const extraKcs = Array.isArray(en.transferExtraKeycards) ? en.transferExtraKeycards.filter(function (kc) { return kc && (kc.companyName || kc.tenantName || kc.keycard); }) : [];
      const addKcBtn = t.querySelector(".era-k-transfer-addKcBtn");
      guard = 0;
      while (addKcBtn && t.querySelectorAll(".era-k-transfer-kc-row").length < extraKcs.length && guard++ < 50) addKcBtn.click();
      const kcRows = Array.prototype.slice.call(t.querySelectorAll(".era-k-transfer-kc-row"));
      extraKcs.forEach(function (kc, idx) {
        const row = kcRows[idx];
        if (!row) return;
        const companyEl = row.querySelector(".era-k-transfer-kc-company"), tenantEl = row.querySelector(".era-k-transfer-kc-tenant"), numberEl = row.querySelector(".era-k-transfer-kc-number"), feeEl = row.querySelector(".era-k-transfer-kc-fee");
        if (companyEl) companyEl.value = kc.companyName || "";
        if (tenantEl) tenantEl.value = kc.tenantName || "";
        if (numberEl) numberEl.value = kc.keycard || "";
        if (feeEl) feeEl.checked = !!kc.fee;
      });
    })();
    setVal(".era-k-requestcardLocation", en.location);
    setVal(".era-k-requestcardQty", en.quantity);
    setVal(".era-k-requestcardManagerEmail", en.managerEmail);
    setVal(".era-k-issue", en.issue);
    setChecked(".era-k-fee", en.fee);
    setVal(".era-k-replacementLocation", en.replLocation);
    setVal(".era-k-repl-existingLocation", en.replExistingLocation);
    setChecked(".era-k-repl-serves-cubework", en.replServesCubework);
    setChecked(".era-k-repl-serves-unis", en.replServesUnis);
    setChecked(".era-k-repl-serves-hikcentral", en.replServesHikcentral);
    setChecked(".era-k-repl-serves-unifi", en.replServesUnifi);
    setVal(".era-k-repl-companyName", en.replCompanyName);
    setVal(".era-k-repl-tenantName", en.replTenantName);
    setVal(".era-k-repl-email", en.replEmail);
    setVal(".era-k-repl-phone", en.replPhone);
    const accessBits = String(en.accessValue || "").split(",").map(function (bit) { return bit.trim(); }).filter(Boolean);
    const knownAccess = { Standard: ".era-k-access-standard", "WH Only": ".era-k-access-wh", "Office Only": ".era-k-access-office" };
    // A freshly-created blank entry defaults "Standard" to checked (see j()'s
    // template above) - explicitly clear every access checkbox first so an
    // entry saved WITHOUT "Standard" in its accessValue doesn't inherit that
    // default instead of reflecting what was actually stored.
    setChecked(".era-k-access-standard", false);
    setChecked(".era-k-access-wh", false);
    setChecked(".era-k-access-office", false);
    setChecked(".era-k-access-other", false);
    let customAccessText = "";
    accessBits.forEach(function (bit) {
      if (knownAccess[bit]) { const el = t.querySelector(knownAccess[bit]); if (el) el.checked = true; }
      else { const other = t.querySelector(".era-k-access-other"); if (other) other.checked = true; customAccessText = bit; }
    });
    if (customAccessText) setVal(".era-k-accessCustom", customAccessText);
    const action = eraKeycardEntryAction(en);
    ["activate", "deactivate", "troubleshoot", "transfer", "replacement", "requestcard"].forEach(function (a2) {
      setChecked(".era-k-" + a2, a2 === action);
    });
    const selectEl = t.querySelector(".era-k-action-select");
    if (selectEl) selectEl.value = action;
    if (action === "replacement") {
      const pairs = Array.isArray(en.replPairs) ? en.replPairs.filter(function (pr) { return pr && (pr.oldKeycard || pr.newKeycard); }) : [];
      const addBtn = t.querySelector(".era-k-repl-addPairBtn");
      // Dispatching change on one repl-serves checkbox runs updateReplExtra(),
      // which reveals the Company/Tenant/pairs block and auto-creates the
      // first blank pair row once (Cubework or Unis) AND (HikCentral or
      // Unifi) are both checked - same trigger a live user click uses.
      const hikEl = t.querySelector(".era-k-repl-serves-hikcentral");
      if (hikEl) hikEl.dispatchEvent(new Event("change", { bubbles: true }));
      let guard = 0;
      while (addBtn && t.querySelectorAll(".era-k-repl-pair-row").length < Math.max(pairs.length, 1) && guard++ < 20) {
        addBtn.click();
      }
      const rows = t.querySelectorAll(".era-k-repl-pair-row");
      pairs.forEach(function (pr, idx) {
        const row = rows[idx];
        if (!row) return;
        const oldEl = row.querySelector(".era-k-repl-old"), newEl = row.querySelector(".era-k-repl-new"), feeEl = row.querySelector(".era-k-repl-pair-fee");
        if (oldEl) oldEl.value = pr.oldKeycard || "";
        if (newEl) newEl.value = pr.newKeycard || "";
        if (feeEl) feeEl.checked = !!pr.fee;
      });
    }
    // If a De-activate (or, 2026-09-03, Request Blank Keycard) entry
    // already has saved Notes text, treat the note box as already "opened"
    // on restore (2026-08-22) - otherwise a previously-typed note would
    // silently hide behind the Add Note button again every time this
    // record is Edited, looking like it went missing.
    if ((action === "deactivate" || action === "requestcard") && en.notes) t.dataset.eraNoteOpened = "1";
    // Same reasoning as above, Transfer's own "+Add Notes" (2026-09-06, per
    // Huy's request) - a previously-typed transfer note stays visible on
    // restore instead of hiding behind the button again.
    if (action === "transfer" && en.transferNotes) t.dataset.eraTransferNotesOpened = "1";
    const radioEl = t.querySelector(".era-k-" + action);
    if (radioEl) radioEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // Restores every OUTER Keycard-mode field (Location, extra locations,
  // requester email, Serves/Access system, have-physical-form answer, and
  // every keycard entry) from a Keycard Submission History record - the
  // counterpart to the Keycard Form modal's own applySavedFormState(),
  // which only restores the MODAL's fields. Called from
  // eraOpenKeycardFormForHistory() (Keycard Form modal's own script,
  // "Pending" tab's Edit button) so Edit restores the complete submission,
  // not just the Card blocks.
  window.eraRestoreKeycardOuterState = function (rec) {
    if (!rec) return;
    if (_ !== "keycard") {
      const tabEl = c.querySelector('#era_tabs .era-tab[data-mode="keycard"]');
      if (tabEl) tabEl.click();
    }
    it("era_location", rec.locationText || "");
    // Show the requester email AS STORED (2026-08-20 fix) - this previously
    // always stripped a trailing "@cubework.com" back off before restoring,
    // so even a fully-typed "huy.nguyen@cubework.com" round-tripped back to
    // a bare "huy.nguyen" on Edit, silently losing the domain the person
    // originally saw/typed. The submit/preview path's own Y() already
    // tolerates either shape (appends "@cubework.com" only when the value
    // has no "@" of its own), so there's no need to normalize on the way
    // back in - just show exactly what was saved.
    it("era_requesterEmailLocal", rec.requesterEmail || "");
    it("era_k_licenseeCompanyName", rec.licenseeCompanyName || "");
    it("era_k_yardiDealAccount", rec.yardiDealAccount || "");
    it("era_k_floorNumber", rec.floorNumber || "");
    it("era_k_unitNumber", rec.unitNumber || "");
    eraExtraLocationsByMode.keycard = Array.isArray(rec.extraLocationBodyLines) ? rec.extraLocationBodyLines.slice() : [];
    eraRenderExtraLocationRows();
    p("era_k_serves_cubework", rec.serves === "Cubework");
    p("era_k_serves_unis", rec.serves === "Unis");
    p("era_k_hikcentral", !!rec.hikcentral);
    p("era_k_unifi", !!rec.unifi);
    p("era_k_haveForm_yes", rec.path === "yes");
    p("era_k_haveForm_no", rec.path === "no");
    eraUpdateKeycardFormVisibility();
    it("era_k_issuedBy_name", rec.issuedByName || "");
    it("era_k_issuedBy_date", rec.issuedByDate || "");
    const entries = Array.isArray(rec.fullEntries) ? rec.fullEntries : null;
    if (entries && entries.length) {
      // Clean up every EXISTING entry's own signature/Photo ID files first
      // (2026-08-2x, duplicate-attachment fix) - innerHTML="" below discards
      // these DOM nodes without ever running eraCleanupKeycardSignId() on
      // them (that only fires from the "Remove this keycard" button), so
      // their signFilename/photoIdFilename entries were being silently
      // orphaned in g.keycard. Restoring signatures/photo IDs onto the
      // FRESH entries this same call creates then pushed second copies
      // under the same deterministic filenames ("Signature_CardN.png", the
      // photo's stored name) - showing as duplicate attachments - every
      // time Edit was clicked more than once on the same submission without
      // a full page reload in between.
      Array.prototype.slice.call(c.querySelectorAll("#era_k_entries .era-entry-block")).forEach(eraCleanupKeycardSignId);
      a("era_k_entries").innerHTML = "";
      // Per-entry try/catch (Edit recoverability fix, 2026-08-29): one
      // malformed saved entry throwing inside eraFillKeycardEntry() used to
      // abort this whole forEach, silently leaving every LATER entry never
      // created at all - the visible symptom was staff having to manually
      // recreate entries that were, in fact, still safely sitting in
      // Firestore the whole time (rec/entries here is only ever a read of
      // the already-saved record - nothing above this point writes
      // anything, so there is no saved data at risk, only what gets
      // rebuilt on screen). Skipping just the bad entry and continuing
      // means every OTHER saved entry still restores.
      entries.forEach(function (en, idx) {
        try {
          j();
          const blocks = c.querySelectorAll("#era_k_entries .era-entry-block");
          eraFillKeycardEntry(blocks[blocks.length - 1], en);
        } catch (e) {
          console.error("eraRestoreKeycardOuterState: couldn't restore entry #" + (idx + 1) + ", skipping it:", e);
        }
      });
      le();
      K();
    }
  };
  // Restores each entry's already-saved Signature/ID ink + Photo ID
  // (2026-08-21+, full Edit-restore pass) - the counterpart above only
  // restores plain field VALUES; the canvas ink and the "Attached" green
  // check need their own pass since j()/eraFillKeycardEntry() rebuild each
  // entry block from scratch (wiping eraWireKeycardSignId()'s own private
  // hasInk/signFilename/photoIdFilename state along with the DOM). Reads
  // signIdSignatures/photoIds positionally by entry number, same
  // "positional Card N indexing" convention the rest of this feature
  // already accepts (see eraWireKeycardSignId's own comment on it). Called
  // from eraEditKeycardHistoryEntry() below, AFTER eraRestoreKeycardOuterState()
  // has finished rebuilding #era_k_entries.
  // "One tenant, one signature" reuse, resolved positionally (2026-08-29 fix).
  // The Step-by-Step Guide has always TOLD staff that a card sharing an
  // earlier card's tenant email is covered by that card's signature and Photo
  // ID (reusedFrom()/signIdCovered(), guide script at the end of this file) -
  // but nothing ever put them there. signIdSignatures/photoIds are strictly
  // per-card-position, so the second card stayed blank on the form, in
  // Attachments and in the Keycard Form PDF (buildKeycardFormPdfInputsFromHistory
  // maps signIdSignatures[n] -> card{n}_signature), i.e. a request went out
  // with Card 2 unsigned while the guide said it was fine. Returns, per card
  // position, the index of the EARLIER card that covers it, or -1.
  // Conditions match the guide's own rule exactly: this card has nothing of
  // its own in `have`, it actually needs a card (Activate/Replacement - the
  // same gate the Signature/ID block itself uses), it has a tenant email, and
  // some earlier card has both that email and an entry in `have`.
  //
  // Run separately over signIdSignatures and over photoIds rather than once
  // over "signature" and reusing the answer for both: the signature IS copied
  // into the reusing card's own slot (so the record and the PDF agree), while
  // the Photo ID deliberately isn't - so on the NEXT Edit that card has its
  // own signature but still no photoIds entry, and a single shared answer
  // would quietly stop handing it the Photo ID it's still reusing.
  function eraKeycardReuseDonors(blocks, have) {
    have = have || {};
    function emailOf(b) { const el = b && b.querySelector(".era-k-email"); return el ? el.value.trim().toLowerCase() : ""; }
    function needsCard(b) {
      const act = b.querySelector(".era-k-activate"), repl = b.querySelector(".era-k-replacement");
      return !!((act && act.checked) || (repl && repl.checked));
    }
    return Array.prototype.map.call(blocks, function (block, idx) {
      if (have[String(idx + 1)]) return -1;
      if (!needsCard(block)) return -1;
      const mine = emailOf(block);
      if (!mine) return -1;
      for (let i = idx - 1; i >= 0; i--) {
        if (!have[String(i + 1)]) continue;
        if (emailOf(blocks[i]) !== mine) continue;
        return i;
      }
      return -1;
    });
  }
  function eraRestoreKeycardSignIdState(requestId, rec, editToken) {
    const blocks = c.querySelectorAll("#era_k_entries .era-entry-block");
    const sigs = (rec && rec.signIdSignatures) || {};
    const photos = (rec && rec.photoIds) || {};
    // Both computed once up front, off the SAVED record, so a signature handed
    // to a reusing card can't itself become a donor for a later card - the
    // rule is "an earlier card that was actually signed".
    const sigDonors = eraKeycardReuseDonors(blocks, sigs);
    const photoDonors = eraKeycardReuseDonors(blocks, photos);
    blocks.forEach(function (block, idx) {
      const n = String(idx + 1);
      const sig = sigs[n];
      if (sig && typeof block.eraSignIdRestore === "function") {
        block.eraSignIdRestore({ signatureDataUrl: sig });
      } else if (sigDonors[idx] >= 0 && typeof block.eraSignIdRestore === "function") {
        // Same tenant email as Card (sigDonors[idx] + 1) - give this card that
        // card's signature for real, and persist it into this card's own
        // slot so the saved record and the PDF agree with the form.
        block.eraSignIdRestore({ signatureDataUrl: sigs[String(sigDonors[idx] + 1)], persist: true, editToken: editToken });
      }
      const photoMeta = photos[n];
      if (photoMeta && photoMeta.path && window.getKeycardPhotoIdData) {
        const statusEl = block.querySelector(".era-k-signid-photoStatus");
        if (statusEl) statusEl.textContent = "Loading photo ID…";
        window.getKeycardPhotoIdData({ requestId: requestId, path: photoMeta.path }).then(function (res) {
          // Stale-response guard (Edit recoverability fix, 2026-08-29): if a
          // NEWER Edit click (same submission retried, or a different one)
          // has started since this fetch went out, `block` here is a
          // detached node from the earlier render and eraKeycardEditToken
          // has already moved on - applying this response now would either
          // silently no-op onto a node nobody sees, or (worse, if the token
          // ever gets reused for a genuinely different in-flight fetch)
          // write a stale photo onto whichever entry now occupies this
          // position. Bail instead; the newer Edit's own
          // eraRestoreKeycardSignIdState call already re-fetches this same
          // photo against the current blocks.
          if (editToken !== eraKeycardEditToken) return;
          const bin = atob(res.data.base64Data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const file = new File([bytes], photoMeta.name || ("PhotoID_Card" + n), { type: res.data.contentType || photoMeta.contentType || "application/octet-stream" });
          if (typeof block.eraSignIdRestore === "function") block.eraSignIdRestore({ photoIdFile: file });
          // Hand the SAME File to every card reusing this tenant's signature
          // (see eraKeycardReuseDonors) - one physical ID document covering
          // both cards, which is exactly what the guide's same-email rule
          // promises. The same File object (and therefore the same filename)
          // on purpose: eraSignIdRestore() removes anything already carrying
          // that name before pushing, so this ends up as ONE entry in
          // g.keycard that both cards point at, not a second copy of the same
          // ID riding along in the email (pitfall #15). Deliberately NOT
          // re-uploaded into photoIds[thatCard] - submitSignatureRequest and
          // uploadKeycardPhotoId own that map, and writing a duplicate
          // Storage object here is the exact mistake reverted on 2026-08-2x
          // (see docs/email-request-attachments-embed-tab.md).
          photoDonors.forEach(function (donorIdx, otherIdx) {
            if (donorIdx !== idx) return;
            const other = blocks[otherIdx];
            if (other && typeof other.eraSignIdRestore === "function") other.eraSignIdRestore({ photoIdFile: file });
          });
        }).catch(function (e) {
          console.error("eraRestoreKeycardSignIdState: couldn't reload photo ID for card " + n + ":", e);
          if (editToken === eraKeycardEditToken && statusEl) statusEl.textContent = "Couldn't reload photo ID: " + (e && e.message ? e.message : e);
        });
      }
    });
  }
  // Keycard Submission History "Edit" (2026-08-21+, full rework) - replaces
  // the old load path (window.eraOpenKeycardFormForHistory, Keycard Form
  // modal's own script), which restored the outer form AND auto-opened
  // that modal. Per Huy's request: Edit now loads straight into the MAIN
  // form only - outer fields/entries via eraRestoreKeycardOuterState()
  // above, then this entry's own ink/Photo ID via
  // eraRestoreKeycardSignIdState() above - and never touches the modal at
  // all (see eraUpdateKeycardFormVisibility() below, which now keeps
  // era_k_formSection permanently hidden regardless of rec.path, so the
  // "Open Keycard Form" button can't resurface from restored history data
  // either). Re-points eraKeycardRequestId at the EXISTING doc first so
  // every subsequent Save/Send/signature/photo-ID call merges into it
  // instead of minting a new record.
  //
  // 2026-08-29 gate fix: the "reveal-on-selection" gate added the same day
  // (see the self-contained <style>/<script> block at the end of this file)
  // hides every .era-mode-fields[data-mode="keycard"] element - including
  // #era_k_entries itself - until an action is picked from the Keycard tab's
  // own dropdown. Editing a Submission never touches that dropdown, so the
  // gate stayed on: eraRestoreKeycardOuterState() below was rebuilding the
  // entries correctly, they just had nowhere to be seen. window.eraSetKeycardGate
  // (exposed by that later script) is called first so restored content is
  // visible the moment it lands, same as an explicit dropdown pick would.
  // Recoverability rework (2026-08-29): every Edit click now gets its own
  // token (see eraKeycardEditToken's own comment) and the whole restore is
  // wrapped so a thrown error surfaces as a normal recoverable banner
  // (reusing y(), the same inline error box every other validation failure
  // in this form uses) instead of dying silently mid-function with no
  // feedback and no way to tell it happened. Returns true/false so the
  // button-click wiring (further down) can reset its own "Loading…" state
  // immediately either way - a failed attempt leaves nothing disabled or
  // hidden, so the very next click starts completely fresh. Nothing here
  // ever writes to Firestore or mutates `rec`/the history cache - only the
  // on-screen form - so a failed or superseded attempt can never lose or
  // corrupt the saved submission itself; at worst the form doesn't (yet)
  // reflect it, and Edit can simply be clicked again.
  window.eraEditKeycardHistoryEntry = function (requestId) {
    const myToken = ++eraKeycardEditToken;
    try {
      const cache = window.getKeycardHistoryCache ? window.getKeycardHistoryCache() : {};
      const rec = cache[requestId];
      if (!rec) { alert("Couldn't find that submission — it may have just been deleted."); return false; }
      // Lift the reveal gate BEFORE anything is restored, so the rebuilt
      // entries have a real layout box the moment they land (the per-card
      // signature canvases size themselves off it - see ensureCanvasSized()).
      // The class is also removed directly as a fallback: window.eraSetKeycardGate
      // is exposed by the last <script> in this file, and if that block ever
      // fails to run the `typeof` guard would silently skip the lift and Edit
      // would restore everything correctly into a form still hidden by
      // display:none - "Edit doesn't populate", with nothing on screen to say
      // why (2026-08-29).
      if (typeof window.eraSetKeycardGate === "function") window.eraSetKeycardGate(false);
      else document.body.classList.remove("era-k-gated");
      eraKeycardRequestId = requestId;
      eraRestoreKeycardOuterState(rec);
      eraRestoreKeycardSignIdState(requestId, rec, myToken);
      if (typeof window.eraRestoreIssuedByState === "function") window.eraRestoreIssuedByState(rec);
      eraAutoCheckSignaturesOnEdit(requestId, rec, myToken);
      const entriesEl = a("era_k_entries");
      if (entriesEl) entriesEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    } catch (e) {
      console.error("eraEditKeycardHistoryEntry failed:", e);
      y(["Couldn't load that submission for editing: " + (e && e.message ? e.message : e) + " — nothing was lost; click Edit again to retry."]);
      return false;
    }
  };
  // "Wait for Signature" auto-check on Edit (2026-08-2x, per Huy's request):
  // "once Edit from submission is pressed, auto check for signature and
  // photo ID; once everything checks out, Save and Preview." Scoped to
  // cards that were actually sent for remote e-signature (a card someone
  // signed locally with "Sign Now" was never waiting on anyone, so it's
  // never "outstanding" here).
  //
  // Uses window.getKeycardSignatureRequestsForHistory() - a fresh, targeted
  // `where(historyRequestId==requestId)` query (src/app.js) - NOT the
  // passive, always-subscribed window.getSignatureRequestsCache(). That
  // cache is an unfiltered onSnapshot over the WHOLE signatureRequests
  // collection and can still be genuinely empty for a moment right after a
  // page load/reload (its first snapshot hasn't landed yet) - clicking
  // Edit right after a refresh (an entirely normal thing to do) could hit
  // that window and this whole check would silently no-op, which is
  // exactly the bug reported: signed server-side, but nothing ever came
  // back into signIdSignatures because the check never actually ran.
  //
  // "Already checked out" for a card is read straight off rec.signIdSignatures
  // (the server-persisted sync marker written by finishRemoteSignature's own
  // persistSignIdSignature call, whether that happened live or via an
  // earlier Edit's auto-check) rather than the freshly-restored canvas's own
  // ink flag - eraRestoreKeycardSignIdState's own image-load restore is
  // async, so reading ink synchronously right after calling it would race
  // and could re-fetch a card that's actually already synced.
  function eraAutoCheckSignaturesOnEdit(requestId, rec, editToken) {
    if (!window.getKeycardSignatureRequestsForHistory) return;
    window.getKeycardSignatureRequestsForHistory(requestId).then(function (cache) {
      // Stale-attempt guard (2026-08-29): see eraKeycardEditToken's own
      // comment - if a newer Edit (or a Save) has started since this query
      // went out, applying it now would check/pull remote signatures
      // against whichever submission is CURRENTLY on screen, not the one
      // this query was actually for, and could go on to auto-Save that
      // mismatch. Bail; the newer attempt runs this same check itself.
      if (editToken !== eraKeycardEditToken) return;
      eraFinishAutoCheckSignaturesOnEdit(cache, rec, editToken);
    }).catch(function (e) {
      console.error("eraAutoCheckSignaturesOnEdit: query failed:", e);
    });
  }
  function eraFinishAutoCheckSignaturesOnEdit(cache, rec, editToken) {
    const tokens = Object.keys(cache);
    if (!tokens.length) return;
    const blocks = c.querySelectorAll("#era_k_entries .era-entry-block");
    const outstanding = [];
    tokens.forEach(function (token) {
      const doc = cache[token];
      const m = /^card(\d+)_signature$/.exec(doc.targetField || "");
      if (!m) return;
      const n = m[1];
      if (rec.signIdSignatures && rec.signIdSignatures[n]) return; // already synced from a prior live session or Edit
      const block = blocks[Number(n) - 1];
      if (!block) return;
      outstanding.push({ token: token, doc: doc, block: block });
    });
    if (!outstanding.length) return;
    const stillWaiting = outstanding.filter(function (o) { return o.doc.status !== "completed"; });
    if (stillWaiting.length) {
      // At least one card is genuinely still pending on the customer -
      // surface that under its own SIGN block instead of doing nothing;
      // no Save/Preview until every outstanding card is complete.
      stillWaiting.forEach(function (o) {
        const waitEl = o.block.querySelector(".era-k-signid-waitStatus");
        if (waitEl) { waitEl.classList.remove("era-field-hidden"); waitEl.textContent = "Pending on customer signature and photo ID…"; }
      });
      return;
    }
    // Every outstanding card is signed server-side - pull each one down
    // (same fetch the live "Wait for Signature Now" poll uses), and only
    // once ALL of them have actually landed, auto-Save (writes the now-
    // complete Pending record). Does NOT auto-open Preview (per Huy's
    // request, 2026-08-2x - "stop the auto Preview") - staff review the
    // restored ink/photo ID on the form itself and open Preview by hand
    // when ready.
    Promise.all(outstanding.map(function (o) {
      return typeof o.block.eraFinishRemoteSignature === "function" ? o.block.eraFinishRemoteSignature(o.token) : Promise.resolve();
    })).then(function () {
      // Re-check right before the auto-Save itself, not just at the top of
      // this function - the remote-signature pulls above can take a while,
      // long enough for yet another Edit (or a manual Save) to have started
      // in the meantime. Without this, a slow-to-resolve earlier attempt
      // could auto-Save into eraGetOrCreateKeycardRequestId()'s CURRENT
      // value, which by then belongs to a different submission than the
      // one this whole check was for.
      if (editToken !== eraKeycardEditToken) return;
      return eraSaveKeycardSubmission();
    }).catch(function (e) {
      console.error("eraAutoCheckSignaturesOnEdit failed:", e);
    });
  }
  // "Save" button (era_k_saveBtn, Keycard mode only) - writes the ENTIRE
  // current Keycard submission (outer fields + whatever's currently in the
  // Keycard Form modal, if it's been opened this session) into Keycard
  // Submission History as "pending", without sending anything.
  // Returns the underlying save promise (2026-08-2x - "Wait for Signature"
  // auto-check on Edit needs to know the Save actually landed before it
  // opens Preview automatically; every early-return below resolves to a
  // rejected promise instead of undefined for the same reason, so a caller
  // chaining off this always gets a real promise to .then()/.catch()).
  function eraSaveKeycardSubmission() {
    a("era_err").style.display = "none";
    a("era_ok").style.display = "none";
    const locationVal = w("era_location");
    if (!locationVal) { y(["Enter or select a location before saving."]); return Promise.reject(new Error("Enter or select a location before saving.")); }
    // The "Do you have the physical keycard form?" question/card is
    // permanently hidden (2026-08-21, per Huy's request) - its radios can
    // never be answered, so this used to block every Save/Save & Leave
    // outright. Removed per Huy's follow-up request rather than leaving an
    // unanswerable requirement in place.
    const fn = window.recordKeycardSubmission;
    if (!fn) { y(["Missing window.recordKeycardSubmission - check app.js."]); return Promise.reject(new Error("Missing window.recordKeycardSubmission")); }
    const outer = window.eraCollectKeycardOuterFieldsForHistory();
    const entries = outer.fullEntries || [];
    const summary = entries.slice(0, 7).map(function (en) {
      return {
        companyName: en.companyName || en.replCompanyName || "",
        tenantName: en.tenantName || en.replTenantName || "",
        keycardNumber: en.keycard || "",
        email: en.email || en.replEmail || "",
        phone: en.phone || en.replPhone || "",
        action: eraKeycardEntryAction(en),
      };
    });
    const cardCount = entries.filter(function (en) { return en.activate || en.replacement; }).length;
    const formSnapshot = typeof window.eraGetKeycardFormSnapshot === "function" ? window.eraGetKeycardFormSnapshot() : null;
    const btn = a("era_k_saveBtn");
    const original = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    window.eraShowGlobalLoading && window.eraShowGlobalLoading();
    return fn({
      requestId: eraGetOrCreateKeycardRequestId(),
      path: outer.haveForm || "no",
      locationText: locationVal,
      extraLocationBodyLines: outer.extraLocationBodyLines,
      requesterEmail: outer.requesterEmail,
      entriesSummary: summary,
      cardCount: cardCount,
      fullEntries: entries,
      serves: outer.serves || "",
      hikcentral: !!outer.hikcentral,
      unifi: !!outer.unifi,
      licenseeCompanyName: outer.licenseeCompanyName || "",
      yardiDealAccount: outer.yardiDealAccount || "",
      floorNumber: outer.floorNumber || "",
      unitNumber: outer.unitNumber || "",
      issuedByName: outer.issuedByName || "",
      issuedByDate: outer.issuedByDate || "",
      formSnapshot: formSnapshot,
    }).then(function () {
      if (btn) { btn.disabled = false; btn.textContent = original; }
      window.eraHideGlobalLoading && window.eraHideGlobalLoading();
      const ok = a("era_ok");
      ok.innerHTML = "Saved to Submission (Pending).";
      ok.style.display = "block";
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = original; }
      window.eraHideGlobalLoading && window.eraHideGlobalLoading();
      y(["Couldn't save: " + (e && e.message ? e.message : e)]);
      throw e; // re-thrown so a caller chaining off this promise (e.g. the auto-check below) knows the save didn't actually land, instead of proceeding as if it had.
    });
  }
  (function () { const btn = a("era_k_saveBtn"); btn && btn.addEventListener("click", eraSaveKeycardSubmission); })();(function(){const y=a("era_k_haveForm_yes"),n=a("era_k_haveForm_no");y&&y.addEventListener("change",eraUpdateKeycardFormVisibility),n&&n.addEventListener("change",eraUpdateKeycardFormVisibility)})();function Ve(){return s("era_k_serves_cubework")?"Cubework":s("era_k_serves_unis")?"Unis":""}function oe(){}se("era_ap_troubleshoot","era_ap_issue",!0),se("era_lt_troubleshoot","era_lt_issue",!0);function je(e,t,r){const n=a(r===e?t:e);n&&n.checked&&(n.checked=!1,n.dispatchEvent(new Event("change")))}[["era_lt_create","era_lt_troubleshoot"]].forEach(function(e){e.forEach(function(t){const r=a(t);r&&r.addEventListener("change",function(){this.checked&&je(e[0],e[1],t)})})});
// era_lt_remove (2026-09-09, per Huy's request) - a third mutually-exclusive
// pick alongside New Laptop/Troubleshoot; je() above only handles a pair, so
// this is its own small "uncheck every other id in the list" helper instead
// (same shape as Ye()/we further down for Software's own request-type
// checkboxes). G() already leaves every job-title/manager-email/sbn wrap
// hidden whenever neither create nor troubleshoot is checked, so Remove
// needs no new field-visibility branch there - it naturally shows just
// Location + Employee Name/ID/Email/Phone, same minimal shape Phone's own
// Replacement/Activate/Remove actions use.
const LT_MODE_IDS=["era_lt_create","era_lt_troubleshoot","era_lt_remove"];
function eraLtModeExclusive(except){LT_MODE_IDS.forEach(function(id){if(id!==except){const el=a(id);el&&el.checked&&(el.checked=!1)}})}
a("era_lt_remove").addEventListener("change",function(){this.checked&&eraLtModeExclusive("era_lt_remove"),G()});
a("era_lt_create").addEventListener("change",function(){this.checked&&eraLtModeExclusive("era_lt_create")});
a("era_lt_troubleshoot").addEventListener("change",function(){this.checked&&eraLtModeExclusive("era_lt_troubleshoot")});let Ke=0;function z(){const e=Ke++,t=document.createElement("div");t.className="era-entry-block",t.dataset.seq=e,t.innerHTML=`<button type="button" class="era-remove-entry-btn">Remove this phone line</button><div><label>Action <span class="era-required-mark">*</span></label><select class="era-ph-action-select"><option value="create">New Phone</option><option value="troubleshoot">Troubleshoot</option><option value="replacement">Replacement</option><option value="activate">Activate</option><option value="remove">Remove</option></select></div><div><label>Location <span class="era-required-mark">*</span></label><input type="text" class="era-ph-location" list="era_ph_locationList" placeholder="Search city, street or ZIP" autocomplete="off"></div><div class="era-ph-new-fields"><div class="era-checks"><label class="era-check"><input type="checkbox" class="era-ph-tempAgent"> Temp Agent</label><label class="era-check"><input type="checkbox" class="era-ph-directHire"> Direct Hire</label></div><div class="era-row2"><div><label>Person First Name <span class="era-required-mark">*</span></label><input type="text" class="era-ph-firstName"></div><div><label>Person Last Name <span class="era-required-mark">*</span></label><input type="text" class="era-ph-lastName"></div></div><label>Person Title <span class="era-required-mark">*</span></label><select class="era-ph-title"><option value="" disabled selected>Select…</option><option value="National Manager">National Manager</option><option value="Facility Manager">Facility Manager</option><option value="Facility Lead">Facility Lead</option><option value="Maintenance">Maintenance</option><option value="Janitor">Janitor</option></select><label>Employee ID</label><input type="text" class="era-ph-employeeId"><textarea class="era-ph-responsibilities" placeholder="Person responsibilities..."></textarea><label>Report to Manager (email) <span class="era-required-mark">*</span></label><input type="email" class="era-ph-managerEmail"></div><div class="era-ph-troubleshoot-fields era-field-hidden"><label>Phone Tag Number</label><input type="text" class="era-ph-phoneTag" placeholder="e.g. SGA13-143"><div class="era-row2"><div><label>User First Name <span class="era-required-mark">*</span></label><input type="text" class="era-ph-userFirstName"></div><div><label>User Last Name <span class="era-required-mark">*</span></label><input type="text" class="era-ph-userLastName"></div></div><label>User's Personal Phone Number</label><input type="tel" class="era-ph-userPhone" placeholder="000-000-0000" maxlength="12" inputmode="tel"><textarea class="era-ph-issue" placeholder="Describe the issue"></textarea></div><textarea class="era-ph-notes era-field-hidden" placeholder="Describe this request / anything else to flag"></textarea>`,t.querySelector(".era-ph-userPhone").addEventListener("input",function(){this.value=W(this.value)}),t.querySelector(".era-ph-action-select").addEventListener("change",de),t.querySelector(".era-remove-entry-btn").addEventListener("click",function(){t.remove(),ce()}),a("era_ph_entries").appendChild(t),de(),ce()}function ce(){const e=c.querySelectorAll("#era_ph_entries .era-entry-block");e.forEach(function(t){t.querySelector(".era-remove-entry-btn").style.display=e.length>1?"":"none"})}function de(){const e=w("era_ph_serves")==="Unis";let ph=!1,phNon=!1;c.querySelectorAll("#era_ph_entries .era-entry-block").forEach(function(t){const act=t.querySelector(".era-ph-action-select").value,isCreate=act==="create",isTs=act==="troubleshoot",isReplAct=act==="replacement"||act==="activate"||act==="remove";t.querySelector(".era-ph-new-fields").classList.toggle("era-field-hidden",!isCreate),t.querySelector(".era-ph-troubleshoot-fields").classList.toggle("era-field-hidden",!isTs),t.querySelector(".era-ph-notes").classList.toggle("era-field-hidden",!(isReplAct||e)),isTs?ph=!0:phNon=!0}),c.querySelectorAll("#era_ph_body > .era-ph-troubleshoot-fields").forEach(function(r){r.classList.toggle("era-field-hidden",!ph)}),c.querySelectorAll("#era_ph_body > .era-ph-itform-fields").forEach(function(r){r.classList.toggle("era-field-hidden",!phNon)})}function Ze(){const e=!!w("era_ph_serves");a("era_ph_body").classList.toggle("era-field-hidden",!e),de()}a("era_ph_addEntryBtn").addEventListener("click",z),z(),a("era_ph_serves").addEventListener("change",Ze);const Ge=["Janitor","Maintenance","Property Associate","Facility Lead","Facility Manager","Coordinator","National Manager","C-Level","Development","Sales"];let Je=0;function Z(){const e=Je++,t=document.createElement("div");t.className="era-entry-block",t.dataset.seq=e,t.innerHTML='<button type="button" class="era-remove-entry-btn">Remove this laptop</button><div><label>Location <span class="era-required-mark">*</span></label><input type="text" class="era-lt-location" list="era_locationList" placeholder="Search city, street or ZIP" autocomplete="off"></div><div class="era-lt-jobTitle-wrap era-field-hidden"><label>Job Title <span class="era-required-mark">*</span></label><select class="era-lt-jobTitle"><option value="" disabled selected>Select\u2026</option>'+Ge.map(function(r){return'<option value="'+r+'">'+r+"</option>"}).join("")+'</select></div><div class="era-lt-sbn-wrap era-field-hidden"><label>Laptop SBN#</label><input type="text" class="era-lt-sbn" placeholder="e.g. SBN1983"></div><div class="era-row2"><div><label>Employee Name <span class="era-required-mark">*</span></label><input type="text" class="era-lt-employeeName"></div><div><label>Employee ID</label><input type="text" class="era-lt-employeeId"></div></div><div class="era-lt-managerEmail-wrap era-field-hidden"><label>Report to Manager (email) <span class="era-required-mark">*</span></label><input type="email" class="era-lt-managerEmail"></div><div><label class="era-lt-email-label">Employee Personal Email</label><input type="email" class="era-lt-email"></div><div><label class="era-lt-phone-label">Employee Personal Phone</label><input type="tel" class="era-lt-phone" placeholder="000-000-0000" maxlength="12" inputmode="tel"></div>',t.querySelector(".era-lt-phone").addEventListener("input",function(){this.value=W(this.value)}),t.querySelector(".era-remove-entry-btn").addEventListener("click",function(){t.remove(),pe()}),a("era_lt_entries").appendChild(t),G(),pe()}function pe(){const e=c.querySelectorAll("#era_lt_entries .era-entry-block");e.forEach(function(t){t.querySelector(".era-remove-entry-btn").style.display=e.length>1?"":"none"})}function G(){const e=s("era_lt_create"),t=s("era_lt_troubleshoot");c.querySelectorAll("#era_lt_entries .era-lt-jobTitle-wrap").forEach(function(i){i.classList.toggle("era-field-hidden",!e)}),c.querySelectorAll("#era_lt_entries .era-lt-managerEmail-wrap").forEach(function(i){i.classList.toggle("era-field-hidden",!e)}),c.querySelectorAll("#era_lt_entries .era-lt-sbn-wrap").forEach(function(i){i.classList.toggle("era-field-hidden",!t)});const r=t?" or CW":"";c.querySelectorAll("#era_lt_entries .era-lt-email-label").forEach(function(i){i.textContent="Employee Personal Email"+r}),c.querySelectorAll("#era_lt_entries .era-lt-phone-label").forEach(function(i){i.textContent="Employee Personal Phone"+r}),fe()}function F(){return s("era_lt_serves_cubework")?"Cubework":s("era_lt_serves_unis")?"Unis":""}function he(){const e=F();a("era_lt_body").classList.toggle("era-field-hidden",!e),a("era_lt_cubework_wrap").classList.toggle("era-field-hidden",e!=="Cubework"),a("era_lt_unis_wrap").classList.toggle("era-field-hidden",e!=="Unis"),fe()}function fe(){const e=F()==="Cubework"&&s("era_lt_create"),t=a("era_lt_attachRequiredMark");t&&t.classList.toggle("era-field-hidden",!e);const r=a("era_lt_attachLabelText");r&&(r.textContent=F()==="Cubework"?"IT Form Attachment":"Attachments")}a("era_lt_addEntryBtn").addEventListener("click",Z),Z(),a("era_lt_serves_cubework").addEventListener("change",function(){this.checked&&(a("era_lt_serves_unis").checked=!1),he()}),a("era_lt_serves_unis").addEventListener("change",function(){this.checked&&(a("era_lt_serves_cubework").checked=!1),he()}),a("era_lt_create").addEventListener("change",G),a("era_lt_troubleshoot").addEventListener("change",G);const R=[{mode:"wifi",prefix:"era_w",fieldLabel:null,hasExtraField:!1,hasDeactivateToggle:!0,moveTypeAboveCompany:!0,hasNotesField:!0,notesPosition:"end",contactRequired:!1,separateEmailFromType:!0,typeAsCheckboxes:!0,hasWifiPlanField:!0},{mode:"printer",prefix:"era_pr",fieldLabel:"Printer Model",hasExtraField:!0,hasDeactivateToggle:!1,moveTypeAboveCompany:!0,hasNotesField:!0,notesPosition:"end",contactRequired:!0,hasCubeworkNewToggle:!0,hasManagerEmailField:!0,hasPaidWifiField:!0},{mode:"app",prefix:"era_ap",fieldLabel:"Application Name",hasExtraField:!0,hasDeactivateToggle:!1,moveTypeAboveCompany:!0,hasNotesField:!1,contactRequired:!0,separateEmailFromType:!0,hasDescriptionNote:!0,descriptionNoteText:"Please describe what needs to be set up.",hasSbnField:!0,emailLabelOverride:"Manager's Email",emailOptionalOverride:!0},{mode:"laptopUnis",prefix:"era_lt_unis",fieldLabel:"Laptop Model / Asset Tag",hasExtraField:!0,hasDeactivateToggle:!1,moveTypeAboveCompany:!1,hasNotesField:!1,contactRequired:!0},
// Electrical (2026-09-08, per Huy's request, task 2) - same
// once-per-submission Create/Troubleshoot/De-activate + Serves shape as
// Wi-Fi's own config entry above (hasDeactivateToggle:!0 hooks into the
// existing generic Q(e) function, which only needs prefix+"_deactivate"/
// "_note"/"_attachSection" ids - all already present on the era_el_*
// markup, so no new per-mode JS was needed for that gate), and a real
// type-specific field ("Equipment/Location", Printer's own analog) since
// - unlike Wi-Fi - that field wasn't asked to be removed here.
{mode:"electrical",prefix:"era_el",fieldLabel:"Equipment/Location",hasExtraField:!0,hasDeactivateToggle:!0,moveTypeAboveCompany:!0,hasNotesField:!0,notesPosition:"end",contactRequired:!1}
],ye=R.find(function(e){return e.mode==="wifi"}),_e={};function L(e){const t=_e[e.mode]=(_e[e.mode]||0)+1,r=document.createElement("div");r.className="era-entry-block",r.dataset.seq=t;const i=e.typeAsCheckboxes?'<div class="era-s-type-wrap"><label>Office or Warehouse <span class="era-required-mark">*</span></label><div class="era-checks"><label class="era-check"><input type="checkbox" class="era-s-type-office"> Office</label><label class="era-check"><input type="checkbox" class="era-s-type-warehouse"> Warehouse</label></div><input type="hidden" class="era-s-type">'+(e.hasWifiPlanField?'<div class="era-s-wifiPlan-wrap era-field-hidden"><div class="era-checks"><label class="era-check era-s-freeWifi-row"><input type="checkbox" class="era-s-freeWifi"> Free Wi-Fi</label><label class="era-check"><input type="checkbox" class="era-s-paidWifi"> Paid Wi-Fi</label></div><div class="era-s-ssidNote era-field-hidden">Please provide the Cubework SSID to Tenant.</div></div>':"")+"</div>":'<div class="era-s-type-wrap"><label>Office or Warehouse <span class="era-required-mark">*</span></label><select class="era-s-type"><option value="" disabled selected>Select\u2026</option><option value="Office">Office</option><option value="Warehouse">Warehouse</option></select></div>',n=e.contactRequired&&!e.emailOptionalOverride?' <span class="era-required-mark">*</span>':"",l=e.contactRequired?' <span class="era-required-mark">*</span>':"",o=e.emailLabelOverride||"Email",u='<div class="era-row2 era-s-company-row"><div><label class="era-s-companyName-label">Company Name <span class="era-required-mark">*</span></label><input type="text" class="era-s-companyName"></div><div class="era-s-tenantName-wrap"><label class="era-s-tenantName-label">Tenant Name</label><input type="text" class="era-s-tenantName"></div></div>',d=e.hasManagerEmailField?'<div class="era-s-managerEmail-wrap era-field-hidden"><label>Report to Manager (email) <span class="era-required-mark">*</span></label><input type="email" class="era-s-managerEmail"></div>':"",h=e.hasNotesField?'<textarea class="era-s-notes" placeholder="Anything else to flag for this request"></textarea>':"",k=e.hasExtraField?'<div class="era-row2 era-s-extra-row"><div class="era-s-unit-wrap"><label>Unit Number <span class="era-required-mark">*</span></label><input type="text" class="era-s-unit"></div><div><label>'+e.fieldLabel+' <span class="era-required-mark">*</span></label><input type="text" class="era-s-extra"></div></div>':'<div class="era-s-extra-row era-s-unit-wrap"><label>Unit Number <span class="era-required-mark">*</span></label><input type="text" class="era-s-unit"></div>',v='<div class="era-row2 era-s-contact-row">'+i+'<div class="era-s-email-wrap"><label>'+o+n+'</label><input type="email" class="era-s-email"></div></div>',N='<div class="era-s-contact-row">'+i+"</div>",E='<div class="era-s-contact-row era-s-email-wrap"><label>'+o+n+'</label><input type="email" class="era-s-email"></div>',P='<div class="era-s-contact-row era-s-phone-row"><label>Phone'+l+'</label><input type="tel" class="era-s-phone" placeholder="000-000-0000" maxlength="12" inputmode="tel"></div>',S=e.separateEmailFromType?N:v,M=e.hasDescriptionNote?'<div class="era-note era-s-description-note">'+e.descriptionNoteText+"</div>":"",B=e.hasSbnField?'<div class="era-s-sbn-wrap"><label>Laptop SBN#</label><input type="text" class="era-s-sbn" placeholder="e.g. SBN1990"></div>':"",m=e.hasPaidWifiField?'<div class="era-s-paidWifi-wrap era-field-hidden"><label class="era-check"><input type="checkbox" class="era-s-paidWifi"> Paid Wi-Fi</label></div>':"";let f='<button type="button" class="era-remove-entry-btn">Remove this entry</button>';if(e.moveTypeAboveCompany&&(f+=M,f+=S,f+=B),f+=u,e.hasNotesField&&e.notesPosition==="afterCompany"&&(f+=h),f+=k,f+=d,e.moveTypeAboveCompany||(f+=M,f+=S,f+=B),e.separateEmailFromType&&(f+=E),f+=P,f+=m,e.hasNotesField&&e.notesPosition==="end"&&(f+=h),r.innerHTML=f,r.querySelector(".era-s-phone").addEventListener("input",function(){this.value=W(this.value)}),r.querySelector(".era-remove-entry-btn").addEventListener("click",function(){r.remove(),me(e)}),e.hasCubeworkNewToggle){const b=r.querySelector(".era-s-type");b&&b.addEventListener("change",C)}if(e.typeAsCheckboxes){const b=r.querySelector(".era-s-type-office"),q=r.querySelector(".era-s-type-warehouse");b.addEventListener("change",function(){this.checked&&(q.checked=!1),J(r),x()}),q.addEventListener("change",function(){this.checked&&(b.checked=!1),J(r),x()}),J(r)}if(e.hasWifiPlanField){const b=r.querySelector(".era-s-freeWifi"),q=r.querySelector(".era-s-paidWifi");b&&b.addEventListener("change",x),q&&q.addEventListener("change",x)}a(e.prefix+"_entries").appendChild(r),e.hasDeactivateToggle&&Q(e),e.hasCubeworkNewToggle&&C(),e.mode==="wifi"&&x(),me(e)}function J(e){const t=e.querySelector(".era-s-type-office"),r=e.querySelector(".era-s-type-warehouse"),i=!!(t&&t.checked),n=!!(r&&r.checked),l=e.querySelector(".era-s-type");l&&(l.value=i?"Office":n?"Warehouse":"");const o=e.querySelector(".era-s-wifiPlan-wrap");o&&o.classList.toggle("era-field-hidden",!i&&!n);const u=e.querySelector(".era-s-freeWifi-row"),d=e.querySelector(".era-s-freeWifi");u&&u.classList.toggle("era-field-hidden",n),n&&d&&d.checked&&(d.checked=!1)}function x(){const e=s("era_w_create"),t=c.querySelectorAll("#era_w_entries .era-entry-block");let r=!1;if(t.forEach(function(i){const n=i.querySelector(".era-s-type-office"),l=i.querySelector(".era-s-freeWifi"),o=i.querySelector(".era-s-paidWifi"),u=!!(n&&n.checked),d=!!(l&&l.checked),h=!!(o&&o.checked),v=!e||!(e&&u&&d&&!h)&&(d||h),N=e&&u&&d;["era-s-company-row","era-s-extra-row","era-s-email-wrap","era-s-phone-row","era-s-notes"].forEach(function(P){i.querySelectorAll("."+P).forEach(function(S){S.classList.toggle("era-field-hidden",!v)})});const E=i.querySelector(".era-s-ssidNote");E&&E.classList.toggle("era-field-hidden",!N),v&&(r=!0)}),e){const i=t.length>0&&!r,n=a("era_w_note"),l=a("era_w_attachSection");n&&n.classList.toggle("era-field-hidden",i),l&&l.classList.toggle("era-field-hidden",i)}}function me(e){const t=c.querySelectorAll("#"+e.prefix+"_entries .era-entry-block");t.forEach(function(r){r.querySelector(".era-remove-entry-btn").style.display=t.length>1?"":"none"})}function Q(e){const t=s(e.prefix+"_deactivate");c.querySelectorAll("#"+e.prefix+"_entries .era-s-extra-row").forEach(function(n){n.classList.toggle("era-field-hidden",t)}),c.querySelectorAll("#"+e.prefix+"_entries .era-s-contact-row").forEach(function(n){n.classList.toggle("era-field-hidden",t)});const r=a(e.prefix+"_note"),i=a(e.prefix+"_attachSection");r&&r.classList.toggle("era-field-hidden",t),i&&i.classList.toggle("era-field-hidden",t)}function C(){const e=s("era_pr_cubework"),t=s("era_pr_tenant"),r=s("era_pr_troubleshoot"),i=a("era_pr_body");i&&i.classList.toggle("era-field-hidden",!(e||t));const n=a("era_pr_create"),l=a("era_pr_newreplace"),o=n?n.closest(".era-check"):null,u=l?l.closest(".era-check"):null;o&&o.classList.toggle("era-field-hidden",t),u&&u.classList.toggle("era-field-hidden",t),t&&(n&&n.checked&&(n.checked=!1),l&&l.checked&&(l.checked=!1));const d=e&&s("era_pr_newreplace"),h=e&&r&&!d,k=e&&s("era_pr_create")&&!d&&!h,v=t&&!e&&r,N=k||h,E=k||h||d,P=r&&!v||d,S=a("era_pr_issue");S&&S.classList.toggle("era-field-hidden",!P);const M=a("era_pr_attachRequiredMark"),B=a("era_pr_attachRequiredHint");M&&M.classList.toggle("era-field-hidden",!v),B&&B.classList.toggle("era-field-hidden",!v),c.querySelectorAll("#era_pr_entries .era-entry-block").forEach(function(m){const f=m.querySelector(".era-s-type"),b=m.querySelector(".era-s-email-wrap"),q=m.querySelector(".era-s-unit-wrap"),Ce=m.querySelector(".era-s-phone-row"),Ae=m.querySelector(".era-s-type-wrap"),Te=m.querySelector(".era-s-tenantName-wrap"),Ne=m.querySelector(".era-s-company-row"),Fe=m.querySelector(".era-s-notes"),Re=m.querySelector(".era-s-managerEmail-wrap"),Pe=m.querySelector(".era-s-paidWifi-wrap");if(b&&b.classList.toggle("era-field-hidden",E||v),q&&q.classList.toggle("era-field-hidden",E),Ce&&Ce.classList.toggle("era-field-hidden",E),Ae&&Ae.classList.toggle("era-field-hidden",h),Te&&Te.classList.toggle("era-field-hidden",h||d),Ne&&Ne.classList.toggle("era-field-hidden",d),Fe&&Fe.classList.toggle("era-field-hidden",h||d||v),Re&&Re.classList.toggle("era-field-hidden",!d),Pe){const yt=!!f&&f.value==="Warehouse";Pe.classList.toggle("era-field-hidden",!(v&&yt))}const Me=m.querySelector(".era-s-companyName-label"),Be=m.querySelector(".era-s-tenantName-label"),Oe=m.querySelector(".era-s-companyName");Me&&(Me.innerHTML=N?'Laptop SBN# <span class="era-required-mark">*</span>':'Company Name <span class="era-required-mark">*</span>'),Oe&&(Oe.placeholder=N?"e.g. SBN1895":""),Be&&(Be.textContent=k?"Printer IP":"Tenant Name")})}R.forEach(function(e){a(e.prefix+"_addEntryBtn").addEventListener("click",function(){L(e)}),L(e),e.hasDeactivateToggle&&a(e.prefix+"_deactivate").addEventListener("change",function(){Q(e)}),e.hasCubeworkNewToggle&&["_cubework","_tenant","_create","_troubleshoot","_newreplace"].forEach(function(t){const r=a(e.prefix+t);r&&r.addEventListener("change",C)})}),a("era_pr_cubework").addEventListener("change",function(){this.checked&&(a("era_pr_tenant").checked=!1),C()}),a("era_pr_tenant").addEventListener("change",function(){this.checked&&(a("era_pr_cubework").checked=!1),C()});const ve=["era_pr_create","era_pr_troubleshoot","era_pr_newreplace"];function Qe(e){ve.forEach(function(t){if(t!==e){const r=a(t);r&&(r.checked=!1)}})}ve.forEach(function(e){const t=a(e);t&&t.addEventListener("change",function(){this.checked&&Qe(e),C()})});function be(){return w("era_w_requestType")}function ke(){const v=be();a("era_w_body").classList.toggle("era-field-hidden",v!=="Cubework"),a("era_w_unisWarning").classList.toggle("era-field-hidden",v!=="Unis");
// era_w_card (2026-09-09, per Huy's request, Wi-Fi tab spec item 2): hide
// the whole outer card - not just its contents - until Cubework/Unis is
// picked in the Wi-Fi ▾ tab dropdown, so nothing renders as an empty
// "blank bubble" before a pick is made.
const card=a("era_w_card");card&&card.classList.toggle("era-field-hidden",!v)}a("era_w_requestType").addEventListener("change",ke);
// Serves checkbox pair (2026-08-22, later pass, per Huy's request) - plain
// mutual exclusivity, same convention as every other Cubework/Unis
// tick-box pair in this form, but no visibility side effects of its own
// anymore (era_w_requestType/ke() above does that job now). This pair is
// purely a reflected readout - see the $ group's change listener below.
a("era_w_serves_cubework").addEventListener("change",function(){this.checked&&(a("era_w_serves_unis").checked=!1)}),a("era_w_serves_unis").addEventListener("change",function(){this.checked&&(a("era_w_serves_cubework").checked=!1)});
const $=["era_w_create","era_w_troubleshoot","era_w_deactivate"];function $e(e){$.forEach(function(t){if(t!==e){const r=a(t);r&&(r.checked=!1)}})}function Xe(){const e=$.some(function(t){return s(t)});a("era_w_typeBody").classList.toggle("era-field-hidden",!e)}
// Checking Create Wi-Fi/Troubleshoot/De-activate reflects onto BOTH the
// Request Type dropdown (forces it to "Cubework") and the Serves checkbox
// below (auto-ticks era_w_serves_cubework) - 2026-08-22, per Huy's
// request: "per selection on the tab, reflect the tick box under Serves."
// None of the three actions has a Unis flow, so picking one always means
// "this is a Cubework request." it("era_w_requestType","Cubework") both
// sets the value and dispatches change (see it()'s definition further
// down - a plain function declaration, hoisted, so it's callable here
// even though it's defined later in this same script), which re-runs
// ke() to reveal era_w_body. Both calls are no-ops if already set.
$.forEach(function(e){a(e).addEventListener("change",function(){this.checked&&($e(e),it("era_w_requestType","Cubework"),p("era_w_serves_cubework",!0)),Xe(),Q(ye),x()})});
// Electrical (2026-09-08, per Huy's request, task 2) - own Serves pair
// (plain mutual exclusivity - no cross-reflection needed, since Electrical
// has no tab-dropdown-driven hidden requestType field the way Wi-Fi does)
// and its own Create/Troubleshoot/De-activate mutually-exclusive group
// revealing era_el_typeBody, same pattern as Wi-Fi's $/Xe() group just
// above minus the Wi-Fi-only requestType/Serves-reflection/paid-Wi-Fi
// bits that don't apply here.
function eraElServes(){return s("era_el_serves_cubework")?"Cubework":s("era_el_serves_unis")?"Unis":""}
a("era_el_serves_cubework").addEventListener("change",function(){this.checked&&(a("era_el_serves_unis").checked=!1)}),a("era_el_serves_unis").addEventListener("change",function(){this.checked&&(a("era_el_serves_cubework").checked=!1)});
const elCfg=R.find(function(e){return e.mode==="electrical"}),ELg=["era_el_create","era_el_troubleshoot","era_el_deactivate"];function ELex(e){ELg.forEach(function(t){if(t!==e){const r=a(t);r&&(r.checked=!1)}})}function ELbody(){const e=ELg.some(function(t){return s(t)});a("era_el_typeBody").classList.toggle("era-field-hidden",!e);
// era_el_card (2026-09-09, per Huy's request, Electrical tab spec item 2-3):
// with Serves and the Create/Troubleshoot/De-activate checks both hidden
// now (see era_el_servesGroup/era_el_actionGroup in the markup), the whole
// card would render as an empty "blank bubble" until the new Electrical ▾
// tab dropdown sets one of them - same fix as era_w_card above for Wi-Fi.
const card=a("era_el_card");card&&card.classList.toggle("era-field-hidden",!e)}
ELg.forEach(function(e){a(e).addEventListener("change",function(){this.checked&&ELex(e),ELbody(),Q(elCfg)})});
// "Ice spikes explosion" hover effect on the Wi-Fi tab dropdown
// (2026-08-22, per Huy's request; same-day attempts to rename this to
// "Rain" and move it to the Printer tab were both reverted per Huy's
// follow-up requests) - see era-icespikes-* CSS above for the visual
// half; this spawns/positions/removes the actual spike spans, same
// spawn-on-enter/track-on-move/clear-on-leave pattern the Keycard Action
// dropdown's Ki-particle swirl uses (see ddMenu's mouseenter/mousemove/
// mouseleave wiring above), just spawning continuously on an interval
// instead of once, since "continuously" was the ask here rather than a
// fixed-count swirl. Each spike removes itself after its own burst
// animation finishes (animationend) instead of being swept on an interval,
// so a burst mid-flight when the cursor leaves still finishes cleanly.
function eraWireIceSpikesHover(wrapId){
  const wrap=a(wrapId);
  if(!wrap)return;
  // era-icespikes-layer - spikes are appended into this child instead of
  // wrap directly, if one exists, so its z-index:-1 (see the CSS comment
  // on .era-icespikes-layer for the full stacking-order explanation) puts
  // every spike behind every .era-tab instead of on top of them. Falls
  // back to appending straight into wrap for any future reuse that
  // doesn't add this child.
  const spikeLayer=wrap.querySelector(".era-icespikes-layer")||wrap;
  let spawnTimer=null,lastX=0,lastY=0;
  function spikeAnchor(ev){
    const rect=wrap.getBoundingClientRect();
    lastX=ev.clientX-rect.left-rect.width/2;
    lastY=ev.clientY-rect.top-rect.height/2
  }
  function spawnSpike(){
    const p=document.createElement("span");
    p.className="era-icespikes-particle";
    p.style.setProperty("--era-ice-mx",lastX+"px");
    p.style.setProperty("--era-ice-my",lastY+"px");
    p.style.setProperty("--era-ice-angle",(Math.random()*360)+"deg");
    p.style.setProperty("--era-ice-dist",-(36+Math.random()*54)+"px");
    p.style.setProperty("--era-ice-dur",(1.4+Math.random()*1.0)+"s");
    p.addEventListener("animationend",function(){p.remove()});
    spikeLayer.appendChild(p)
  }
  function spawnBurst(){spawnSpike();spawnSpike();spawnSpike();spawnSpike()}
  wrap.addEventListener("mouseenter",function(ev){
    spikeAnchor(ev);
    spawnBurst();
    spawnTimer=setInterval(spawnBurst,60)
  });
  wrap.addEventListener("mousemove",spikeAnchor);
  wrap.addEventListener("mouseleave",function(){
    clearInterval(spawnTimer);
    spawnTimer=null
  })
}
// Thunderstorm, "strikes at cursor" hover effect on the Printer tab
// dropdown only (2026-08-23, per Huy's request, tuned same day in a
// follow-up pass) - same spawn-on-enter/track-on-move/clear-on-leave shape
// as eraWireIceSpikesHover() above (own separate function since the two
// effects render genuinely different elements - a jagged bolt + impact
// flash pair vs. an ice spike - not worth trying to parameterize one
// function into meaning both). Appends straight into wrap (no dedicated
// layer child, unlike the ice spikes' .era-icespikes-layer) since
// Printer's dropdown never asked for the "always behind the tab"
// containment Wi-Fi's did - see the CSS comment on .era-thunder-bolt above
// for why a plain z-index is enough here.
//
// Follow-up tuning pass (same day, per Huy's request: "slower strikes,
// quantity 5, randomize strike locations around the cursor, realistic
// thunderstorm feel, white/blue/purple"):
// - Quantity 5: spawnBurst() (was spawnStrike(), singular) now fires 5
//   bolt/flash pairs per storm tick instead of 1.
// - Randomized locations: jitterPoint() offsets each of the 5 from
//   lastX/lastY by a random angle/radius (0-46px) instead of every strike
//   landing exactly on the cursor - a believable "storm cell around the
//   cursor," not one repeating spot.
// - Slower: the recurring timer moved from a fixed 260ms setInterval to a
//   randomized 900-1600ms recursive setTimeout (scheduleNextBurst()) -
//   real thunderclaps don't land on a metronome, so irregular spacing
//   reads as more realistic than any fixed interval could. Per-bolt
//   animation duration also lengthened (0.5-0.85s, was 0.28-0.46s).
// - Realistic feel, two more ways: each of the 5 strikes in a burst fires
//   after its own small random delay (0-220ms, via boltDelay()) rather
//   than all 5 in the same instant, so a burst reads as several strikes
//   landing close together, not one synchronized flash; bolt length also
//   varies per strike (--era-thunder-len, 60-110px) instead of a fixed
//   80px, so the cluster doesn't look like identical stamped copies.
// - Colors: THUNDER_COLORS picks white/blue/purple at random per strike,
//   applied as a modifier class on both the bolt and its own flash (see
//   the era-thunder-bolt-*/era-thunder-flash-* CSS above) so each strike's
//   flash matches its bolt's own color.
//
// Second follow-up (same day, per Huy's request: "add explosion, broken
// ground as they strikes") - every strike now also spawns:
// - A small burst of era-thunder-spark debris dots (SPARK_COUNT of them),
//   each flying outward at its own random angle/distance/duration - the
//   "explosion" half, same rotate()+translateX()+scale() burst shape the
//   ice spikes above use, just as plain glowing dots.
// - One era-thunder-crack decal - the "broken ground" half, a jagged
//   multi-armed crack shape (pure CSS clip-path, see its own CSS comment)
//   that flashes in fast, lingers noticeably longer than the bolt/flash
//   (era-thunder-crack-dur, ~1.0-1.4s) so it reads as scorched ground left
//   behind after the light itself fades, then fades out itself.
// Both are color-matched to that strike (era-thunder-spark-<color>/
// era-thunder-crack-<color>) via the same `color` already picked for the
// bolt/flash, so one strike's whole effect - bolt, flash, sparks, crack -
// reads as one consistent-colored event.
//
// Each spawned element still removes itself after its own animation
// finishes (animationend, one listener per element - nothing here is
// swept on a shared interval); staggered per-strike setTimeouts and any
// already-scheduled bursts are deliberately left to finish even after the
// cursor leaves, same "let it finish" convention the ice spikes above
// already use - only scheduleNextBurst() stops queuing new ones.
const THUNDER_COLORS=["white","blue","purple"];
const THUNDER_SPARK_COUNT=6;
function eraWireThunderStormHover(wrapId){
  const wrap=a(wrapId);
  if(!wrap)return;
  let spawnTimer=null,lastX=0,lastY=0;
  function thunderAnchor(ev){
    const rect=wrap.getBoundingClientRect();
    lastX=ev.clientX-rect.left-rect.width/2;
    lastY=ev.clientY-rect.top-rect.height/2
  }
  function jitterPoint(){
    const angle=Math.random()*Math.PI*2,radius=Math.random()*46;
    return{x:lastX+Math.cos(angle)*radius,y:lastY+Math.sin(angle)*radius}
  }
  function spawnOneStrike(){
    const pt=jitterPoint(),color=THUNDER_COLORS[Math.floor(Math.random()*THUNDER_COLORS.length)],dur=(0.5+Math.random()*0.35)+"s";
    const bolt=document.createElement("span");
    bolt.className="era-thunder-bolt era-thunder-bolt-"+color;
    bolt.style.setProperty("--era-thunder-mx",pt.x+"px");
    bolt.style.setProperty("--era-thunder-my",pt.y+"px");
    bolt.style.setProperty("--era-thunder-tilt",(Math.random()*24-12)+"deg");
    bolt.style.setProperty("--era-thunder-len",(60+Math.random()*50)+"px");
    bolt.style.setProperty("--era-thunder-dur",dur);
    bolt.addEventListener("animationend",function(){bolt.remove()});
    wrap.appendChild(bolt);
    const flash=document.createElement("span");
    flash.className="era-thunder-flash era-thunder-flash-"+color;
    flash.style.setProperty("--era-thunder-mx",pt.x+"px");
    flash.style.setProperty("--era-thunder-my",pt.y+"px");
    flash.style.setProperty("--era-thunder-dur",dur);
    flash.addEventListener("animationend",function(){flash.remove()});
    wrap.appendChild(flash);
    // "Explosion" - a handful of glowing debris dots bursting outward from
    // this strike's own impact point, each with its own random angle/
    // distance/duration so the burst doesn't look like a uniform ring.
    for(let i=0;i<THUNDER_SPARK_COUNT;i++){
      const spark=document.createElement("span");
      spark.className="era-thunder-spark era-thunder-spark-"+color;
      spark.style.setProperty("--era-thunder-mx",pt.x+"px");
      spark.style.setProperty("--era-thunder-my",pt.y+"px");
      spark.style.setProperty("--era-spark-angle",(Math.random()*360)+"deg");
      spark.style.setProperty("--era-spark-dist",(20+Math.random()*34)+"px");
      spark.style.setProperty("--era-thunder-dur",(0.35+Math.random()*0.3)+"s");
      spark.addEventListener("animationend",function(){spark.remove()});
      wrap.appendChild(spark)
    }
    // "Broken ground" - one scorched crack decal at the same impact point,
    // random rotation per strike so no two cracks look identical, lingers
    // noticeably longer than the bolt/flash/sparks above it.
    const crack=document.createElement("span");
    crack.className="era-thunder-crack era-thunder-crack-"+color;
    crack.style.setProperty("--era-thunder-mx",pt.x+"px");
    crack.style.setProperty("--era-thunder-my",pt.y+"px");
    crack.style.setProperty("--era-crack-rot",(Math.random()*360)+"deg");
    crack.style.setProperty("--era-thunder-crack-dur",(1.0+Math.random()*0.4)+"s");
    crack.addEventListener("animationend",function(){crack.remove()});
    wrap.appendChild(crack)
  }
  function spawnBurst(){
    for(let i=0;i<5;i++){setTimeout(spawnOneStrike,Math.random()*220)}
  }
  function scheduleNextBurst(){
    spawnTimer=setTimeout(function(){spawnBurst();scheduleNextBurst()},900+Math.random()*700)
  }
  wrap.addEventListener("mouseenter",function(ev){
    thunderAnchor(ev);
    spawnBurst();
    scheduleNextBurst()
  });
  wrap.addEventListener("mousemove",thunderAnchor);
  wrap.addEventListener("mouseleave",function(){
    clearTimeout(spawnTimer);
    spawnTimer=null
  })
}
/* era_w_requestTypeWrap removed 2026-08-22, later pass - the ice-spikes
   hover effect lives on the Wi-Fi tab dropdown instead, see the "Wi-Fi
   tab dropdown" script block above; that call site owns
   eraWireIceSpikesHover() now, this function just stays
   available/reusable here for it via hoisting. */// 2026-09-09, per Huy's request (Software tab spec item 2): "Hardware
// Request" (era_ap_hardware/era_ap_hardwareBody/era_ap_hw_*) removed
// completely - ge()/X()/Ee() and the era_ap_hw_* listeners that used to live
// here are gone with it (superseded by the Software ▾ dropdown routing
// straight into the real Laptop/Phone tabs instead - see that dropdown's own
// script block comment). New Install/Access and Troubleshoot stay real and
// wired (era_ap_create/era_ap_troubleshoot are only hidden now, not removed)
// so we/Ye()/et() only need to drop the third id.
const we=["era_ap_create","era_ap_troubleshoot"];function Ye(e){we.forEach(function(t){if(t!==e){const r=a(t);r&&r.checked&&(r.checked=!1,r.dispatchEvent(new Event("change")))}})}function et(){const e=s("era_ap_create"),t=s("era_ap_troubleshoot"),i=e||t;a("era_ap_simpleBody").classList.toggle("era-field-hidden",!(e||t)),a("era_ap_attachReminder").classList.toggle("era-field-hidden",!i),a("era_ap_attachSection").classList.toggle("era-field-hidden",!i)}we.forEach(function(e){a(e).addEventListener("change",function(){this.checked&&Ye(e),et()})});const qe=["keycard","wifi","printer","phone","phoneItForm","app","laptop","electrical"],g={keycard:[],wifi:[],printer:[],phone:[],phoneItForm:[],app:[],laptop:[],electrical:[]};function tt(e,t){return e.name===t.name&&e.size===t.size&&e.lastModified===t.lastModified}function H(e){const t=g[e],r=a("era_fileList_"+e);if(r.innerHTML="",!t.length){const i=document.createElement("div");i.className="era-file-empty",i.textContent="No files selected yet.",r.appendChild(i);return}var order=t.map(function(i,n){return{file:i,idx:n}});if(e==="keycard"){var slots=window.eraGetKeycardPhotoIdSlots?window.eraGetKeycardPhotoIdSlots():{},photoIdNames=Object.keys(slots).map(function(k){return slots[k]});order=order.slice().sort(function(x,y){var xp=photoIdNames.indexOf(x.file.name)!==-1?1:0,yp=photoIdNames.indexOf(y.file.name)!==-1?1:0;return xp-yp||x.idx-y.idx})}order.forEach(function(entry){const i=entry.file,n=entry.idx;const l=document.createElement("div");l.className="era-file-row";const o=document.createElement("span");o.className="era-file-name",o.textContent=i.name+" ("+Math.round(i.size/1024)+" KB)";
  // View button (per Huy's request: "Photo ID and signature on the
  // Attachments are viewable with a View button") - any image/PDF, not
  // just Keycard-specific files, reusing the existing in-modal lightbox
  // (eraOpenPreviewKformLightbox, defined further down) since it's a
  // plain fixed-position overlay independent of whether Preview is open.
  const isViewable=/^image\//.test(i.type)||i.type==="application/pdf"||/\.(png|jpe?g|gif|webp|pdf)$/i.test(i.name);
  let v=null;
  if(isViewable){v=document.createElement("button"),v.type="button",v.className="secondary era-file-view",v.textContent="View",v.title="View "+i.name,v.addEventListener("click",function(){eraOpenPreviewKformLightbox(i,i.name)})}
  const u=document.createElement("button");u.type="button",u.className="era-file-remove",u.textContent="\u2715",u.title="Remove "+i.name,u.setAttribute("aria-label","Remove "+i.name),u.addEventListener("click",function(){t.splice(n,1),H(e)}),l.appendChild(o),v&&l.appendChild(v),l.appendChild(u),r.appendChild(l)})}qe.forEach(function(e){a("era_files_"+e).addEventListener("change",function(t){const r=g[e];Array.prototype.slice.call(t.target.files).forEach(function(i){r.some(function(n){return tt(n,i)})||r.push(i)}),t.target.value="",H(e)}),H(e)});function at(e){return new Promise(function(t,r){const i=new FileReader;i.onload=function(){t({filename:e.name,mimeType:e.type,base64:i.result})},i.onerror=r,i.readAsDataURL(e)})}function w(e){const t=a(e);return t?t.value.trim():""}function s(e){const t=a(e);return t?t.checked:!1}function rt(e){const t=[];return e.querySelector(".era-k-access-standard").checked&&t.push("Standard"),e.querySelector(".era-k-access-wh").checked&&t.push("WH Only"),e.querySelector(".era-k-access-office").checked&&t.push("Office Only"),e.querySelector(".era-k-access-other").checked&&t.push(e.querySelector(".era-k-accessCustom").value.trim()||"Other"),t.length?t.join(", "):"Standard"}function Y(){const e=w("era_requesterEmailLocal");return e?e.indexOf("@")!==-1?e:e+"@cubework.com":""}function I(e){const t=e.querySelector(".era-s-extra"),r=e.querySelector(".era-s-notes"),i=e.querySelector(".era-s-managerEmail"),n=e.querySelector(".era-s-paidWifi"),l=e.querySelector(".era-s-freeWifi"),o=e.querySelector(".era-s-sbn");return{companyName:e.querySelector(".era-s-companyName").value.trim(),tenantName:e.querySelector(".era-s-tenantName").value.trim(),unit:e.querySelector(".era-s-unit").value.trim(),extra:t?t.value.trim():"",type:e.querySelector(".era-s-type").value,email:e.querySelector(".era-s-email").value.trim(),phone:e.querySelector(".era-s-phone").value.trim(),notes:r?r.value.trim():"",managerEmail:i?i.value.trim():"",paidWifi:n?n.checked:!1,freeWifi:l?l.checked:!1,sbn:o?o.value.trim():""}}function Se(){switch(_){case"keycard":var e=Array.prototype.slice.call(c.querySelectorAll("#era_k_entries .era-entry-block")).map(function(n){return{companyName:n.querySelector(".era-k-companyName").value.trim(),tenantName:n.querySelector(".era-k-tenantName").value.trim(),keycard:n.querySelector(".era-k-keycard").value.trim(),notes:n.querySelector(".era-k-notes").value.trim(),email:n.querySelector(".era-k-email").value.trim(),phone:n.querySelector(".era-k-phone").value.trim(),activate:n.querySelector(".era-k-activate").checked,deactivate:n.querySelector(".era-k-deactivate").checked,troubleshoot:n.querySelector(".era-k-troubleshoot").checked,transfer:n.querySelector(".era-k-transfer").checked,transferFrom:n.querySelector(".era-k-transferFrom").value.trim(),transferTo:n.querySelector(".era-k-transferTo").value.trim(),transferExtraLocations:Array.prototype.slice.call(n.querySelectorAll(".era-k-transfer-loc-pair")).slice(1).map(function(row){return{from:(row.querySelector(".era-k-transfer-extraFrom")||{value:""}).value.trim(),to:(row.querySelector(".era-k-transfer-extraTo")||{value:""}).value.trim()}}),transferExtraKeycards:Array.prototype.slice.call(n.querySelectorAll(".era-k-transfer-kc-row")).map(function(row){return{companyName:row.querySelector(".era-k-transfer-kc-company").value.trim(),tenantName:row.querySelector(".era-k-transfer-kc-tenant").value.trim(),keycard:row.querySelector(".era-k-transfer-kc-number").value.trim(),fee:row.querySelector(".era-k-transfer-kc-fee").checked}}),transferNotes:n.querySelector(".era-k-transfer-notes").value.trim(),requestcard:n.querySelector(".era-k-requestcard").checked,location:n.querySelector(".era-k-requestcardLocation").value.trim(),quantity:n.querySelector(".era-k-requestcardQty").value.trim(),managerEmail:n.querySelector(".era-k-requestcardManagerEmail").value.trim(),issue:n.querySelector(".era-k-issue").value.trim(),fee:n.querySelector(".era-k-fee").checked,accessValue:rt(n),replacement:n.querySelector(".era-k-replacement").checked,replLocation:n.querySelector(".era-k-replacementLocation").value.trim(),replExistingLocation:"",replServesCubework:n.querySelector(".era-k-repl-serves-cubework").checked,replServesUnis:n.querySelector(".era-k-repl-serves-unis").checked,replServesHikcentral:n.querySelector(".era-k-repl-serves-hikcentral").checked,replServesUnifi:n.querySelector(".era-k-repl-serves-unifi").checked,replCompanyName:n.querySelector(".era-k-repl-companyName").value.trim(),replTenantName:n.querySelector(".era-k-repl-tenantName").value.trim(),replEmail:n.querySelector(".era-k-repl-email").value.trim(),replPhone:n.querySelector(".era-k-repl-phone").value.trim(),replPairs:Array.prototype.slice.call(n.querySelectorAll(".era-k-repl-pair-row")).map(function(row){return{oldKeycard:row.querySelector(".era-k-repl-old").value.trim(),newKeycard:row.querySelector(".era-k-repl-new").value.trim(),fee:row.querySelector(".era-k-repl-pair-fee").checked}})}});return{serves:Ve(),haveForm:eraKeycardHaveFormValue(),hikcentral:s("era_k_hikcentral"),unifi:s("era_k_unifi"),licenseeCompanyName:w("era_k_licenseeCompanyName"),entries:e};case"wifi":return{serves:be(),create:s("era_w_create"),troubleshoot:s("era_w_troubleshoot"),deactivate:s("era_w_deactivate"),entries:Array.prototype.slice.call(c.querySelectorAll("#era_w_entries .era-entry-block")).map(I)};case"electrical":return{serves:eraElServes(),create:s("era_el_create"),troubleshoot:s("era_el_troubleshoot"),deactivate:s("era_el_deactivate"),entries:Array.prototype.slice.call(c.querySelectorAll("#era_el_entries .era-entry-block")).map(I)};case"printer":return{cubework:s("era_pr_cubework"),tenant:s("era_pr_tenant"),create:s("era_pr_create"),troubleshoot:s("era_pr_troubleshoot"),newreplace:s("era_pr_newreplace"),issue:w("era_pr_issue"),entries:Array.prototype.slice.call(c.querySelectorAll("#era_pr_entries .era-entry-block")).map(I)};case"phone":var t=Array.prototype.slice.call(c.querySelectorAll("#era_ph_entries .era-entry-block")).map(function(n){return{action:n.querySelector(".era-ph-action-select").value,location:n.querySelector(".era-ph-location").value.trim(),tempAgent:n.querySelector(".era-ph-tempAgent").checked,directHire:n.querySelector(".era-ph-directHire").checked,firstName:n.querySelector(".era-ph-firstName").value.trim(),lastName:n.querySelector(".era-ph-lastName").value.trim(),title:n.querySelector(".era-ph-title").value,employeeId:n.querySelector(".era-ph-employeeId").value.trim(),responsibilities:n.querySelector(".era-ph-responsibilities").value.trim(),managerEmail:n.querySelector(".era-ph-managerEmail").value.trim(),phoneTag:n.querySelector(".era-ph-phoneTag").value.trim(),userFirstName:n.querySelector(".era-ph-userFirstName").value.trim(),userLastName:n.querySelector(".era-ph-userLastName").value.trim(),userPhone:n.querySelector(".era-ph-userPhone").value.trim(),issue:n.querySelector(".era-ph-issue").value.trim(),notes:n.querySelector(".era-ph-notes").value.trim()}});return{serves:w("era_ph_serves"),entries:t};case"app":return{create:s("era_ap_create"),troubleshoot:s("era_ap_troubleshoot"),issue:w("era_ap_issue"),entries:Array.prototype.slice.call(c.querySelectorAll("#era_ap_entries .era-entry-block")).map(I)};case"laptop":var i=F();return{serves:i,create:s("era_lt_create"),troubleshoot:s("era_lt_troubleshoot"),remove:s("era_lt_remove"),issue:w("era_lt_issue"),entries:i==="Unis"?Array.prototype.slice.call(c.querySelectorAll("#era_lt_unis_entries .era-entry-block")).map(I):Array.prototype.slice.call(c.querySelectorAll("#era_lt_entries .era-entry-block")).map(function(n){return{location:n.querySelector(".era-lt-location").value.trim(),jobTitle:n.querySelector(".era-lt-jobTitle").value,sbn:n.querySelector(".era-lt-sbn").value.trim(),employeeName:n.querySelector(".era-lt-employeeName").value.trim(),employeeId:n.querySelector(".era-lt-employeeId").value.trim(),managerEmail:n.querySelector(".era-lt-managerEmail").value.trim(),email:n.querySelector(".era-lt-email").value.trim(),phone:n.querySelector(".era-lt-phone").value.trim()}})}}}function y(e){const t=a("era_err");t.innerHTML=(Array.isArray(e)?e:[String(e)]).join("<br>"),t.style.display="block",a("era_ok").style.display="none",t.scrollIntoView({behavior:"smooth",block:"center"})}function nt(e){const t=a("era_ok");t.innerHTML="Sent!<br>To: "+e.to+"<br>Cc: "+e.cc+"<br>Subject: "+e.subject,t.style.display="block",a("era_err").style.display="none",t.scrollIntoView({behavior:"smooth",block:"center"})}
// Hard reload after a Keycard Preview>Send (2026-08-30, per Huy's request:
// reload the page - equivalent of Ctrl+Shift+R - once the "Sent!" alert
// (nt(), above) has been shown to the user and finished/closed, never
// before it's displayed. This SW's fetch handler (service-worker.js) is
// network-first with an offline-only cache fallback, so a plain
// location.reload() while online already refetches everything fresh - no
// separate Cache Storage purge needed to match Ctrl+Shift+R's effect here.
const ERA_SENT_ALERT_RELOAD_DELAY_MS=2500;
function eraReloadAfterSentAlert(){setTimeout(function(){const t=a("era_ok");t&&(t.style.display="none");window.location.reload()},ERA_SENT_ALERT_RELOAD_DELAY_MS)}function p(e,t){const r=a(e);r&&(r.checked=t,r.dispatchEvent(new Event("change",{bubbles:!0})))}function it(e,t){const r=a(e);r&&(r.value=t,r.dispatchEvent(new Event("change",{bubbles:!0})))}function st(){eraEditableRecipients={to:[],cc:[],bcc:[]},eraLastComputedRecipients={to:[],cc:[],bcc:[]},eraRecipientsInitialized=!1,a("era_location").value="",a("era_requesterEmailLocal").value="",a("era_k_licenseeCompanyName").value="",a("era_k_yardiDealAccount").value="",a("era_k_floorNumber").value="",a("era_k_unitNumber").value="",qe.forEach(function(e){g[e]=[],a("era_files_"+e).value="",H(e)}),p("era_k_serves_cubework",!1),p("era_k_serves_unis",!1),a("era_k_hikcentral").checked=!1,a("era_k_unifi").checked=!1,a("era_k_haveForm_yes").checked=!1,a("era_k_haveForm_no").checked=!1,eraKeycardRequestId=null,window.eraKeycardResetPhotoIdUploads&&window.eraKeycardResetPhotoIdUploads(),a("era_k_entries").innerHTML="",Object.keys(eraExtraLocationsByMode).forEach(function(mm){eraExtraLocationsByMode[mm]=[]}),j(),it("era_w_requestType",""),p("era_w_serves_cubework",!1),p("era_w_serves_unis",!1),p("era_w_create",!1),p("era_w_troubleshoot",!1),p("era_w_deactivate",!1),a("era_w_entries").innerHTML="",L(ye),p("era_pr_cubework",!1),p("era_pr_tenant",!1),p("era_pr_newreplace",!1),p("era_pr_troubleshoot",!1),p("era_pr_create",!0),a("era_pr_issue").value="",a("era_pr_entries").innerHTML="",L(R.find(function(e){return e.mode==="printer"})),it("era_ph_serves",""),a("era_ph_entries").innerHTML="",z(),p("era_ap_create",!1),p("era_ap_troubleshoot",!1),a("era_ap_issue").value="",a("era_ap_entries").innerHTML="",L(R.find(function(e){return e.mode==="app"})),p("era_lt_serves_cubework",!1),p("era_lt_serves_unis",!1),p("era_lt_troubleshoot",!1),p("era_lt_remove",!1),p("era_lt_create",!0),a("era_lt_entries").innerHTML="",Z(),a("era_lt_unis_entries").innerHTML="",L(R.find(function(e){return e.mode==="laptopUnis"})),
// Electrical reset (2026-09-09 bugfix) - st() reset every other mode's
// once-per-submission checkboxes/entries after a successful send but never
// had an era_el_* branch at all, so a sent Electrical request left its
// Create/Troubleshoot/De-activate checkboxes, Serves pick, and entry list
// exactly as the user left them - the next visit to the Electrical tab
// (even after the page-reload eraReloadAfterSentAlert() schedules) showed
// stale data instead of a blank form like every other mode. Mirrors the
// era_w_*/era_pr_* reset pattern just above: clear the mutually-exclusive
// checkboxes and Serves pair, wipe era_el_entries, then re-seed one blank
// entry via L(elCfg) the same way L(ye)/L(R.find(...printer/app)) do.
p("era_el_create",!1),p("era_el_troubleshoot",!1),p("era_el_deactivate",!1),p("era_el_serves_cubework",!1),p("era_el_serves_unis",!1),a("era_el_entries").innerHTML="",L(elCfg),
ae(),_="keycard",c.querySelectorAll("#era_tabs .era-tab").forEach(function(e){e.classList.toggle("era-active",e.getAttribute("data-mode")==="keycard")}),c.querySelectorAll(".era-mode-fields").forEach(function(e){e.style.display=e.getAttribute("data-mode")==="keycard"?"block":"none"}),eraSyncLocationUiForMode()}function lt(){const e=c.querySelectorAll("#era_k_entries .era-entry-block");return Array.prototype.some.call(e,function(t){return t.querySelector(".era-k-activate").checked})}function Le(){const e=w("era_location"),t=Y();
  // Location is no longer required for Preview when every current keycard
  // entry is Transfer (2026-09-06, per Huy's request) - mirrors
  // era_k_locationGroup's own "every entry is Transfer" hide condition
  // (eraKeycardAllTransfer(), same predicate) so this check can't block
  // Preview on a field the request-level Location card already hides for
  // that exact case. Every other mode/action keeps requiring it, unchanged.
  const locationRequired=!(_==="keycard"&&eraKeycardAllTransfer());
  if(locationRequired&&!e)return y(["Enter or select a location."]),!1;if(!t)return y(["Enter your email."]),!1;if(_==="keycard"&&lt()&&g.keycard.length===0)return y(["Attach the signed keycard authorization form (and photo ID, if this covers multiple keycards) before submitting."]),!1;if(_==="printer"&&s("era_pr_tenant")&&!s("era_pr_cubework")&&s("era_pr_troubleshoot")&&g.printer.length===0)return y(["Attach a photo or document for this Printer Troubleshoot request before submitting."]),!1;if(_==="wifi"){const r=be();if(r==="Unis")return y(["Send an email to helpdesk and request Network Team to Create/Troubleshoot/De-activate for the request."]),!1;if(!r)return y(["Pick Cubework or Unis from the Wi-Fi tab's dropdown."]),!1;if(!s("era_w_create")&&!s("era_w_troubleshoot")&&!s("era_w_deactivate"))return y(["Select Create Wi-Fi, Troubleshoot, or De-activate."]),!1}if(_==="app"&&!s("era_ap_create")&&!s("era_ap_troubleshoot")&&!s("era_ap_hardware"))return y(["Select New Install / Access, Troubleshoot, or Hardware Request."]),!1;if(_==="app"&&s("era_ap_hardware")&&!ge())return y(["Select who this Hardware Request serves (Cubework or Unis)."]),!1;if(_==="laptop"){const r=F();if(!r)return y(["Select who this Laptop request serves (Cubework or Unis)."]),!1;if(r==="Cubework"&&s("era_lt_create")&&g.laptop.length===0)return y(["Attach the IT Form for this Laptop request before submitting."]),!1}return!0}function ot(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML}let ee=null,D=!1,te=!1;function xe(){D=!1,te=!1;const e=a("era_previewBody");e.contentEditable="false",e.style.outline="",e.style.background="#19191b",a("era_previewToolbar").style.display="none",a("era_previewFormatBtn").textContent="Edit"}function ct(){D=!D;const e=a("era_previewBody"),t=a("era_previewToolbar"),r=a("era_previewFormatBtn");D?(te=!0,e.contentEditable="true",e.style.outline="2px solid #1a7f37",e.style.background="#141416",t.style.display="flex",r.textContent="Done Editing",e.focus()):(e.contentEditable="false",e.style.outline="",e.style.background="#19191b",t.style.display="none",r.textContent="Edit")}function A(e,t){a("era_previewBody").focus(),document.execCommand(e,!1,t||null)}function ae(){a("era_previewModal").style.display="none",ee=null,xe(),eraClosePreviewKformLightbox();const s=a("era_previewSaveStatus");s&&(s.style.display="none")}
// Keycard Form attachments inside Preview (2026-08-20) - breaks the signed
// form PDF and each card's Photo ID out of the flat Attachments file list
// (g.keycard, this script's own live file store - see H()/g above) so
// staff can View (in-modal lightbox over an object URL)/Edit/Save/Delete
// them right from the Preview modal. The PDF is identified by its fixed
// generated filename (ERA_PREVIEW_KFORM_PDF_RE, the plain-filename twin of
// KEYCARD_FORM_FILENAME_RE in the OTHER, Keycard-Form-modal <script> - that
// one matches the rendered "name (NN KB)" row text, this one matches
// File.name directly since it reads g.keycard itself). Photo IDs have
// arbitrary filenames, so they're identified via the
// eraGetKeycardPhotoIdSlots bridge into that other script's own
// attachedFilenameBySlot bookkeeping - this script doesn't otherwise know
// which attached file is which card's Photo ID.
let eraPreviewKformLightboxUrl = null;
function eraClosePreviewKformLightbox() {
  if (eraPreviewKformLightboxUrl) { URL.revokeObjectURL(eraPreviewKformLightboxUrl); eraPreviewKformLightboxUrl = null; }
  const el = a("era_previewKformLightbox");
  if (el) el.style.display = "none";
}
function eraOpenPreviewKformLightbox(file, title) {
  eraClosePreviewKformLightbox();
  // Bridged onto window (2026-08-29) - so the Activate guide's Step 22-2
  // View sub-flow (classic <script> block, end of this file) can read the
  // exact File just opened (to render it itself via pdf.js) without this
  // function's own display logic below changing at all.
  window.eraPreviewKformCurrentFile = file;
  eraPreviewKformLightboxUrl = URL.createObjectURL(file);
  a("era_previewKformLightboxTitle").textContent = title + " — " + file.name;
  const body = a("era_previewKformLightboxBody");
  body.innerHTML = "";
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const iframe = document.createElement("iframe");
    iframe.src = eraPreviewKformLightboxUrl;
    iframe.style.cssText = "width:100%; height:100%; border:0;";
    body.appendChild(iframe);
  } else {
    const img = document.createElement("img");
    img.src = eraPreviewKformLightboxUrl;
    img.style.cssText = "max-width:100%; max-height:100%; display:block; margin:0 auto;";
    body.appendChild(img);
  }
  a("era_previewKformLightbox").style.display = "flex";
}
(function () { const btn = a("era_previewKformLightboxCloseBtn"); btn && btn.addEventListener("click", eraClosePreviewKformLightbox); })();

const ERA_PREVIEW_KFORM_PDF_RE = /^Cubework_Keycard_Form_v2\.1_\d{4}-\d{2}-\d{2}\.pdf$/i;

// Builds the ONE complete, filled Cubework_Keycard_Form_v2.1 PDF for this
// whole submission (every card's data/checkboxes/signature, plus the staff
// Issued By signature/print name/date - see buildKeycardHistoryFormPdf,
// functions/index.js) and drops it into g.keycard as the actual Keycard
// Form attachment, replacing any earlier copy. Per Huy's request that
// "everything" (all entries, checked boxes, customer signature, photo id,
// staff signature/name/date) actually be transferred into the Keycard Form
// rather than riding along as separate fragments (Signature_CardN.png,
// Signed_CardN.pdf, individual photo files) with no single document tying
// them together. Called right before both Preview (ut()) and Send (pt())
// open/fire, so the attached form always reflects whatever's currently
// saved. Deliberately doesn't remove the raw per-card Signature_CardN.png/
// photo ID files it rides alongside - those stay as separate supporting
// evidence, same as before.
function eraMaybeBuildKeycardFormPdf() {
  if (_ !== "keycard" || !eraKeycardHasActivateOrReplacement() || !window.buildKeycardHistoryFormPdf) return Promise.resolve();
  const requestId = eraGetOrCreateKeycardRequestId();
  // Flush any signature saves still in flight (persistSignIdSignature()/
  // Issued By's own persist(), both fire-and-forget on every stroke) and
  // force one fresh, awaited eraSaveKeycardSubmission() - rather than
  // trusting the two 1.2s-debounced auto-Save timers to have already fired -
  // before letting the server read keycardRequestHistory/{requestId} to
  // assemble the merged PDF. Without this, a signature drawn moments before
  // clicking Preview/Send could still be mid-write when the server reads
  // the doc, silently shipping a PDF missing that ink.
  window.eraShowGlobalLoading && window.eraShowGlobalLoading();
  return Promise.all(eraKeycardPendingSaves.slice()).catch(function () {}).then(function () {
    return eraSaveKeycardSubmission().catch(function () {});
  }).then(function () {
    return window.buildKeycardHistoryFormPdf({ requestId: requestId });
  }).then(function (res) {
    const bin = atob(res.data.base64Data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const filename = "Cubework_Keycard_Form_v2.1_" + new Date().toISOString().slice(0, 10) + ".pdf";
    g.keycard = g.keycard.filter(function (f) { return !ERA_PREVIEW_KFORM_PDF_RE.test(f.name); });
    g.keycard.push(new File([bytes], filename, { type: "application/pdf" }));
    H("keycard");
  }).catch(function (e) {
    // Best-effort - a submission with nothing saved yet (buildKeycardHistoryFormPdf
    // 404s on an unknown requestId) or a transient failure shouldn't block
    // Preview/Send outright; existing validation (Le()) already requires SOME
    // keycard attachment for an Activate/Replacement entry, so a genuinely
    // empty submission still gets caught there.
    console.error("eraMaybeBuildKeycardFormPdf failed (falling back to whatever's already attached):", e);
  }).then(function () {
    window.eraHideGlobalLoading && window.eraHideGlobalLoading();
  });
}

// Recognizes the CURRENT per-card Signature/ID flow's deterministic
// filenames (Signature_CardN.png / Signed_CardN.pdf / IssuedBy_Signature.png)
// plus, per card, its Photo ID (arbitrary filename - read via each entry's
// own eraSignIdGetPhotoFilename() bridge, see eraWireKeycardSignId()).
// Separate from the OLDER eraGetKeycardPhotoIdSlots()/ERA_PREVIEW_KFORM_PDF_RE
// pair below, which only ever recognizes artifacts from the now-retired
// Keycard Form modal - kept alongside (not replaced) so a record saved
// before this flow existed still renders correctly in Preview.
function eraCollectSignIdFileLabels() {
  const labels = {};
  Array.prototype.slice.call(c.querySelectorAll("#era_k_entries .era-entry-block")).forEach(function (b, idx) {
    const n = idx + 1;
    labels["Signature_Card" + n + ".png"] = "Signature (Card " + n + ")";
    labels["Signed_Card" + n + ".pdf"] = "Signed Form (Card " + n + ")";
    if (typeof b.eraSignIdGetPhotoFilename === "function") {
      const pf = b.eraSignIdGetPhotoFilename();
      if (pf) labels[pf] = "Photo ID (Card " + n + ")";
    }
  });
  labels["IssuedBy_Signature.png"] = "Issued By Signature";
  return labels;
}

function eraRenderPreviewKformSection() {
  const section = a("era_previewKformSection"), list = a("era_previewKformList");
  if (!section || !list) return;
  if (_ !== "keycard") { section.style.display = "none"; return; }
  // Exactly what Send will put on the email, nothing else - this section is
  // the last thing anyone looks at before clicking Send, so listing files
  // that eraFilterKeycardEmailAttachments() is about to drop (the raw
  // signature PNGs, and any superseded Keycard Form) made it read as a
  // promise the email did not keep. The dropped files are untouched in
  // g.keycard and still listed, viewable and deletable on the form's own
  // Attachments card.
  const files = eraFilterKeycardEmailAttachments(g.keycard || []);
  const pdfFile = files.find(function (f) { return ERA_PREVIEW_KFORM_PDF_RE.test(f.name); });
  const photoSlots = window.eraGetKeycardPhotoIdSlots ? window.eraGetKeycardPhotoIdSlots() : {};
  const photoRows = Object.keys(photoSlots).map(function (slotKey) {
    const filename = photoSlots[slotKey];
    const file = files.find(function (f) { return f.name === filename; });
    if (!file) return null;
    const m = /^photoId_card(\d+)$/.exec(slotKey);
    return { slotKey: slotKey, file: file, label: "Photo ID" + (m ? " (Card " + m[1] + ")" : "") };
  }).filter(Boolean);
  const signIdLabels = eraCollectSignIdFileLabels();
  const takenNames = {};
  if (pdfFile) takenNames[pdfFile.name] = true;
  photoRows.forEach(function (r) { takenNames[r.file.name] = true; });
  const signIdRows = files.filter(function (f) { return signIdLabels[f.name] && !takenNames[f.name]; })
    .map(function (f) { return { file: f, label: signIdLabels[f.name] }; });
  if (!pdfFile && !photoRows.length && !signIdRows.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  list.innerHTML = "";
  if (pdfFile) list.appendChild(eraBuildPreviewKformRow("Signed Keycard Form", pdfFile, { editMode: "reopenForm" }));
  photoRows.forEach(function (row) {
    list.appendChild(eraBuildPreviewKformRow(row.label, row.file, { editMode: "replace", slotKey: row.slotKey }));
  });
  signIdRows.forEach(function (row) {
    list.appendChild(eraBuildPreviewKformRow(row.label, row.file, { editMode: "none" }));
  });
}

function eraBuildPreviewKformRow(label, file, opts) {
  const row = document.createElement("div");
  row.className = "era-preview-kform-row";
  row.style.cssText = "display:flex; align-items:center; gap:8px;";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  labelEl.style.cssText = "min-width:150px; color:#a6a6ad;";
  const nameEl = document.createElement("span");
  nameEl.textContent = file.name;
  nameEl.title = file.name;
  nameEl.style.cssText = "flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
  const viewBtn = document.createElement("button");
  viewBtn.type = "button"; viewBtn.className = "secondary"; viewBtn.textContent = "View";
  viewBtn.addEventListener("click", function () { eraOpenPreviewKformLightbox(file, label); });
  const editBtn = document.createElement("button");
  editBtn.type = "button"; editBtn.className = "secondary"; editBtn.textContent = "Edit";
  const delBtn = document.createElement("button");
  delBtn.type = "button"; delBtn.className = "secondary"; delBtn.textContent = "Delete";
  delBtn.addEventListener("click", function () {
    const idx = g.keycard.indexOf(file);
    if (idx !== -1) g.keycard.splice(idx, 1);
    if (opts.slotKey && window.eraDeleteKeycardPhotoIdFile) window.eraDeleteKeycardPhotoIdFile(opts.slotKey);
    H("keycard");
    eraRenderPreviewKformSection();
  });
  row.appendChild(labelEl);
  row.appendChild(nameEl);
  row.appendChild(viewBtn);
  // editMode "none" (the newer per-card Signature/ID flow's own files -
  // Signature_CardN.png, Signed_CardN.pdf, IssuedBy_Signature.png, Photo
  // ID) has no Edit button - there's no separate "staged, needs a Save to
  // commit" concept for these the way the old modal's reopenForm/replace
  // modes needed; re-drawing/re-uploading on the live form already
  // replaces the attachment directly (see eraWireKeycardSignId()'s own
  // dedupe-by-filename), so View + Delete is all this row needs.
  if (opts.editMode !== "none") row.appendChild(editBtn);
  row.appendChild(delBtn);

  if (opts.editMode === "reopenForm") {
    // The signed PDF is only ever produced by the Keycard Form modal itself
    // (fill -> flatten -> stamp, signatures, consent) - re-deriving that
    // here would duplicate a lot of fragile logic for no benefit, so Edit
    // just reopens that modal (its own Save/Save & Attach PDF already
    // replaces this exact attachment via the existing filename-pattern
    // dedupe). Reopen Preview afterward to see the updated PDF.
    editBtn.addEventListener("click", function () {
      ae();
      const openBtn = a("era_k_openFormBtn");
      if (openBtn) openBtn.click();
    });
  } else if (opts.editMode === "replace") {
    // Photo ID: Edit reveals a plain file picker; picking a file only
    // STAGES it (per "Save = commit an in-progress edit") - View/Edit/
    // Delete swap for Save/Cancel until committed via
    // window.eraReplaceKeycardPhotoIdFile (the Keycard Form modal script's
    // own bridge - it also ticks that card's "Photo ID collected?" radio
    // the same way an in-modal pick would).
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*,.pdf";
    fileInput.style.display = "none";
    let pendingFile = null;
    const saveBtn = document.createElement("button");
    saveBtn.type = "button"; saveBtn.textContent = "Save"; saveBtn.style.display = "none";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button"; cancelBtn.className = "secondary"; cancelBtn.textContent = "Cancel"; cancelBtn.style.display = "none";
    function enterPending(f) {
      pendingFile = f;
      nameEl.textContent = f.name + " (not yet saved)";
      [viewBtn, editBtn, delBtn].forEach(function (b) { b.style.display = "none"; });
      saveBtn.style.display = ""; cancelBtn.style.display = "";
    }
    function exitPending() {
      pendingFile = null;
      [viewBtn, editBtn, delBtn].forEach(function (b) { b.style.display = ""; });
      saveBtn.style.display = "none"; cancelBtn.style.display = "none";
    }
    editBtn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (f) enterPending(f);
    });
    saveBtn.addEventListener("click", function () {
      if (!pendingFile) return;
      if (window.eraReplaceKeycardPhotoIdFile) window.eraReplaceKeycardPhotoIdFile(opts.slotKey, pendingFile);
      exitPending();
      eraRenderPreviewKformSection();
    });
    cancelBtn.addEventListener("click", function () {
      nameEl.textContent = file.name;
      exitPending();
    });
    row.appendChild(fileInput);
    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);
  }
  return row;
}
// Editable To/Cc/Bcc (2026-08-19). eraEditableRecipients holds plain email
// strings (not the {name,email} shape the server preview returns) and is
// what actually reaches the submit payload (toRecipientsOverride/
// ccRecipientsOverride/bccRecipientsOverride) - see pt()/ft() below and
// submitEmailRequest() in functions/emailRequest.js. Only seeded from the
// server's computed To/Cc the FIRST time a preview is shown per submission
// cycle (eraRecipientsInitialized) so re-opening Preview (Edit -> Preview
// again) without resubmitting keeps whatever the person already edited,
// per the requirement that edits "survive re-opening Preview ... within
// the same session." Reset in st() after a successful send/reset.
let eraEditableRecipients={to:[],cc:[],bcc:[]},eraRecipientsInitialized=!1;
// Snapshot of the server's To/Cc as of the last preview build (2026-08-28
// bug fix, see eraMergeNewRecipients() below) - lets a later preview open
// tell "newly required" (e.g. Novie/AR appearing because Fee got checked
// after the first Preview) apart from "still on the server list but the
// person manually removed it from the editable pills," so only the former
// gets merged back in.
let eraLastComputedRecipients={to:[],cc:[],bcc:[]};
// Fee checkbox -> AR/Novie Cc reconciliation (2026-09-05, per Huy's
// request). eraMergeNewRecipients() above only ever ADDS newly-required
// server recipients into the (possibly stale, deliberately edit-preserving)
// eraEditableRecipients snapshot - it never removes anything, on purpose,
// so an unrelated manual removal (of, say, Huy's own Cc) stays removed on
// the next Preview open. That means unchecking a Replacement pair's Fee
// checkbox (or removing the pair) during Save/Edit never dropped
// ar@cubework365.onmicrosoft.com/novie.boston@cubework.com back out of Cc
// once they'd been added by an earlier, Fee-checked Preview - buildKeycard()
// (functions/emailRequest.js, FEE_TO_EMAILS) always recomputes correctly
// server-side, only the client-side editable snapshot was stale. Unlike the
// generic merge, this is scoped to exactly these two fixed addresses (never
// touches any other manually-added/removed Cc), and runs on every Preview
// open - both the first ("Save") and every Edit -> Preview-again re-open -
// so it stays in sync with the current Fee checkbox state each time.
const ERA_FEE_TO_EMAILS_CLIENT=["ar@cubework365.onmicrosoft.com","novie.boston@cubework.com"];
function eraReconcileFeeRecipients(ccRecipients){
  if(_!=="keycard")return;
  const serverLower=(Array.isArray(ccRecipients)?ccRecipients:[]).map(function(o){return String(o&&o.email||"").toLowerCase()});
  ERA_FEE_TO_EMAILS_CLIENT.forEach(function(feeEmail){
    if(serverLower.indexOf(feeEmail)!==-1)return;
    const idx=eraEditableRecipients.cc.findIndex(function(x){return String(x).toLowerCase()===feeEmail});
    idx!==-1&&eraEditableRecipients.cc.splice(idx,1)
  })
}
function eraRecipListEl(kind){return a("era_preview"+kind.charAt(0).toUpperCase()+kind.slice(1)+"List")}
function eraRenderRecipList(kind){
  const listEl=eraRecipListEl(kind);
  if(!listEl)return;
  const arr=eraEditableRecipients[kind];
  if(!arr.length){listEl.innerHTML='<span class="era-preview-recip-empty">(none)</span>';return}
  listEl.innerHTML="";
  arr.forEach(function(email,idx){
    const pill=document.createElement("span");
    pill.className="era-preview-recip-pill";
    const txt=document.createElement("span");
    txt.textContent=email;
    const rm=document.createElement("button");
    rm.type="button",rm.className="era-preview-recip-remove",rm.title="Remove "+email,rm.setAttribute("aria-label","Remove "+email),rm.textContent="✕";
    rm.addEventListener("click",function(){arr.splice(idx,1),eraRenderRecipList(kind)});
    pill.appendChild(txt),pill.appendChild(rm),listEl.appendChild(pill)
  })
}
// eraAddRecipient() is the single commit point for both the manual
// "type + Enter/+Add" path and the click-a-suggestion path below - an
// address can only ever live in ONE of To/Cc/Bcc at a time, so adding it
// to `kind` first drops it out of whichever other list it was already in
// ("move freely between To/Cc/Bcc" - 2026-08-20).
function eraAddRecipient(kind,value){
  const v=String(value||"").trim();
  if(!v||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))return!1;
  ["to","cc","bcc"].forEach(function(other){
    if(other===kind)return;
    const otherArr=eraEditableRecipients[other],idx=otherArr.findIndex(function(x){return x.toLowerCase()===v.toLowerCase()});
    idx!==-1&&(otherArr.splice(idx,1),eraRenderRecipList(other))
  });
  const arr=eraEditableRecipients[kind];
  arr.some(function(x){return x.toLowerCase()===v.toLowerCase()})||arr.push(v);
  return eraRenderRecipList(kind),!0
}
["to","cc","bcc"].forEach(function(kind){
  const capKind=kind.charAt(0).toUpperCase()+kind.slice(1),input=a("era_preview"+capKind+"Add"),btn=c.querySelector('.era-preview-recip-addBtn[data-kind="'+kind+'"]');
  function doAdd(){input&&eraAddRecipient(kind,input.value)&&(input.value="",eraCloseRecipSuggestPanel())}
  btn&&btn.addEventListener("click",doAdd),
  input&&input.addEventListener("keydown",function(e){e.key==="Enter"&&(e.preventDefault(),doAdd())}),
  input&&input.addEventListener("focusin",function(){eraOpenRecipSuggestPanel(input,kind)}),
  input&&input.addEventListener("input",function(){eraRecipSuggestInput===input&&eraRenderRecipSuggestPanel()}),
  input&&input.addEventListener("focusout",function(){setTimeout(function(){eraRecipSuggestInput===input&&eraCloseRecipSuggestPanel()},150)})
});
// Click-to-add suggestions on the add-address inputs, reusing the same
// org-wide "recently used emails" store every other email field in this
// tab already draws from (see docs/email-request-attachments-embed-tab.md,
// "Shared email-address history"), and the same floating-panel look as
// eraEmailSuggestPanel above (era-email-suggest-* CSS classes). A native
// <datalist> used to sit on these inputs, but picking an option there only
// filled the input's value - still needing a second click on +Add. This
// panel instead calls eraAddRecipient() directly on click, so an existing
// email is added/moved immediately, no second click required
// (2026-08-20).
let eraRecipSuggestPanel=null,eraRecipSuggestInput=null,eraRecipSuggestKind=null;
function eraCloseRecipSuggestPanel(){
  eraRecipSuggestPanel&&eraRecipSuggestPanel.parentNode&&eraRecipSuggestPanel.parentNode.removeChild(eraRecipSuggestPanel),
  eraRecipSuggestPanel=null,eraRecipSuggestInput=null,eraRecipSuggestKind=null,
  window.removeEventListener("scroll",eraPositionRecipSuggestPanel,!0),
  window.removeEventListener("resize",eraPositionRecipSuggestPanel,!0)
}
function eraPositionRecipSuggestPanel(){
  if(!eraRecipSuggestPanel||!eraRecipSuggestInput)return;
  const r=eraRecipSuggestInput.getBoundingClientRect();
  eraRecipSuggestPanel.style.left=r.left+"px",
  eraRecipSuggestPanel.style.top=(r.bottom+2)+"px",
  eraRecipSuggestPanel.style.width=Math.max(r.width,180)+"px"
}
function eraGetAllSharedEmails(){
  if(typeof window.getSharedEmailHistory!="function")return[];
  try{
    const hist=window.getSharedEmailHistory()||{},seen={},out=[];
    return Object.keys(hist).forEach(function(k){(hist[k]||[]).forEach(function(em){const lo=String(em||"").toLowerCase();lo&&!seen[lo]&&(seen[lo]=1,out.push(em))})}),out
  }catch(err){return console.error(err),[]}
}
function eraRenderRecipSuggestPanel(){
  if(!eraRecipSuggestPanel||!eraRecipSuggestKind)return;
  const all=eraGetAllSharedEmails(),typed=eraRecipSuggestInput.value.trim().toLowerCase(),
    matches=(typed?all.filter(function(em){return em.toLowerCase().indexOf(typed)!==-1}):all).slice(0,25);
  eraRecipSuggestPanel.innerHTML="";
  if(!matches.length){
    const empty=document.createElement("div");
    empty.className="era-email-suggest-empty",empty.textContent=all.length?"No matches.":"No saved emails yet.",
    eraRecipSuggestPanel.appendChild(empty);
    return
  }
  const kind=eraRecipSuggestKind,input=eraRecipSuggestInput;
  matches.forEach(function(em){
    const row=document.createElement("div");
    row.className="era-email-suggest-row";
    const span=document.createElement("span");
    span.className="era-email-suggest-email",span.textContent=em,
    span.addEventListener("mousedown",function(ev){
      ev.preventDefault(),
      eraAddRecipient(kind,em),
      input.value="",
      eraCloseRecipSuggestPanel()
    }),
    row.appendChild(span),eraRecipSuggestPanel.appendChild(row)
  })
}
function eraOpenRecipSuggestPanel(input,kind){
  eraRecipSuggestInput!==input&&eraCloseRecipSuggestPanel();
  if(!eraRecipSuggestPanel){
    eraRecipSuggestPanel=document.createElement("div"),
    eraRecipSuggestPanel.className="era-email-suggest-panel",
    c.appendChild(eraRecipSuggestPanel),
    window.addEventListener("scroll",eraPositionRecipSuggestPanel,!0),
    window.addEventListener("resize",eraPositionRecipSuggestPanel,!0)
  }
  eraRecipSuggestInput=input,eraRecipSuggestKind=kind,
  eraPositionRecipSuggestPanel(),eraRenderRecipSuggestPanel()
}
// Preview recipients going stale after a later field change (2026-08-28 bug
// fix) - eraEditableRecipients is only re-seeded from the server's To/Cc the
// FIRST time Preview opens per session (eraRecipientsInitialized, see the
// comment above eraEditableRecipients), by design, so manual recipient edits
// survive Edit -> Preview again. But that meant checking "Fee applies" AFTER
// the first Preview open (a common Preview -> Edit -> re-check -> Preview
// again flow) never got its newly-added Novie/AR ccRecipients (from
// buildKeycard()'s FEE_TO_EMAILS in functions/emailRequest.js) into an
// already-initialized eraEditableRecipients - the server recomputes them
// correctly every time, only the client-side snapshot was stale. Diff the
// server's list against eraLastComputedRecipients (what it computed LAST
// preview) and merge in only what's newly appeared - e.g. Novie/AR once Fee
// gets checked - rather than every still-present-but-manually-removed
// address, so an unrelated manual removal (of, say, Huy's own CC) still
// stays removed on the next open.
function eraMergeNewRecipients(kind,emails){
  const now=U(emails),prevLower=eraLastComputedRecipients[kind].map(function(x){return x.toLowerCase()}),
    newlyRequired=now.filter(function(em){return prevLower.indexOf(em.toLowerCase())===-1});
  if(newlyRequired.length){
    const present=eraEditableRecipients.to.concat(eraEditableRecipients.cc,eraEditableRecipients.bcc).map(function(x){return x.toLowerCase()});
    newlyRequired.forEach(function(em){
      present.indexOf(em.toLowerCase())===-1&&(eraEditableRecipients[kind].push(em),present.push(em.toLowerCase()))
    })
  }
  eraLastComputedRecipients[kind]=now
}
// Preview Email recipient invariants for Keycard (2026-08-29, per Huy):
// "Your email" - the requester address typed into era_requesterEmailLocal,
// whose own label already says "(Cc'd on the request)" - always sits in
// Cc:, never in To: and never in Bcc:, and Bcc: opens empty. buildKeycard()
// (functions/emailRequest.js) already computes the requester into
// ccRecipients and nothing has ever seeded Bcc, so this does not re-route
// anything on a first Preview; what it adds is that the state is re-asserted
// EVERY time Preview opens, including the Edit -> Preview-again path where
// eraEditableRecipients deliberately carries earlier manual edits forward
// (see eraRecipientsInitialized above) and could otherwise still be holding
// a hand-moved requester pill or a hand-added Bcc from before.
// Keycard mode only - the other five modes' Preview recipients are untouched.
function eraNormalizeKeycardPreviewRecipients(){
  if(_!=="keycard")return;
  eraEditableRecipients.bcc=[];
  const me=Y();
  if(!me||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(me))return;
  const lo=me.toLowerCase(),same=function(x){return String(x).toLowerCase()===lo},
    toIdx=eraEditableRecipients.to.findIndex(same);
  toIdx!==-1&&eraEditableRecipients.to.splice(toIdx,1);
  eraEditableRecipients.cc.some(same)||eraEditableRecipients.cc.push(me)
}
function dt(e){
  ee=e,xe();
  eraRecipientsInitialized?(eraMergeNewRecipients("to",e.toRecipients),eraMergeNewRecipients("cc",e.ccRecipients)):(eraEditableRecipients={to:U(e.toRecipients),cc:U(e.ccRecipients),bcc:[]},eraLastComputedRecipients={to:U(e.toRecipients),cc:U(e.ccRecipients),bcc:[]},eraRecipientsInitialized=!0),
  eraReconcileFeeRecipients(e.ccRecipients),
  eraNormalizeKeycardPreviewRecipients(),
  ["to","cc","bcc"].forEach(eraRenderRecipList),
  a("era_previewSubject").textContent=e.subject||"",a("era_previewBody").innerHTML=e.htmlBody||ot(e.textBody||"").replace(/\n/g,"<br>"),a("era_previewModal").style.display="flex",
  (function(){const s=a("era_previewSaveStatus");s&&(s.style.display="none")})(),
  eraRenderPreviewKformSection()
}function ut(){if(a("era_err").style.display="none",a("era_ok").style.display="none",T(""),!Le())return;const e=window.buildCwEmailRequestPreview;if(!e){y(["Missing window.buildCwEmailRequestPreview - check app.js."]);return}const t=w("era_location"),r=Y(),i=ie(t),n=a("era_submitBtn");n.disabled=!0;const l=n.textContent;n.textContent="Loading preview\u2026";window.eraShowGlobalLoading&&window.eraShowGlobalLoading();const o=(_==="phone"?g.phone.concat(g.phoneItForm):g[_]).map(function(d){return{filename:d.name}}),u={mode:_,locationText:t,locationSubjectName:i?i.subjectName:t,locationBodyLine:i?i.bodyLine:t,extraLocationBodyLines:eraCollectExtraLocationBodyLines(),requesterEmail:r,fields:Se(),attachments:o};e(u).then(function(d){n.disabled=!1,n.textContent=l;window.eraHideGlobalLoading&&window.eraHideGlobalLoading();const h=d.data;if(!h.ok){y(h.problems||["Something went wrong."]);return}dt(h)}).catch(function(d){n.disabled=!1,n.textContent=l,window.eraHideGlobalLoading&&window.eraHideGlobalLoading(),y(["Couldn't build the preview: "+(d&&d.message?d.message:d)])})}// Per Huy's request (2026-08-21, "duplicate files, same content under
// different names") - the signed Keycard Form PDF (Signed_CardN.pdf)
// already has each card's ink and the staff sign-off baked into it, so
// separately emailing the same signature image again as
// Signature_CardN.png/IssuedBy_Signature.png just duplicates that content
// under a different filename. Those two PNGs stay in g.keycard (Preview's
// View/Delete rows, History restore, etc. still use them) - only the
// actual email Send strips them, keeping just the signed PDF + Photo ID(s)
// + anything else staff attached by hand.
const ERA_KEYCARD_EMAIL_SKIP_RE = /^(Signature_Card\d+\.png|IssuedBy_Signature\.png)$/;
// The per-card PDF the remote e-signature round trip brings back
// (finishRemoteSignature()): the tenant's ink baked into the form AS IT
// STOOD WHEN THE REQUEST WENT OUT - so it predates the staff "Issued By"
// sign-off and any later edit. It is a real Keycard Form, and until this
// filter existed it rode along to the recipient NEXT TO the complete one,
// which is the "1 Photo ID + 2 Keycard Forms (one unsigned, one with both
// signatures)" bug reported 2026-08-29: ERA_KEYCARD_EMAIL_SKIP_RE was
// written back when Signed_CardN.pdf WAS the form, and was never revisited
// when eraMaybeBuildKeycardFormPdf() (2026-08-21) started producing the
// merged Cubework_Keycard_Form_v2.1_<date>.pdf alongside it.
const ERA_KEYCARD_SIGNED_CARD_PDF_RE = /^Signed_Card(\d+)\.pdf$/i;
function eraIsKeycardFormAttachment(name) {
  return ERA_PREVIEW_KFORM_PDF_RE.test(name) || ERA_KEYCARD_SIGNED_CARD_PDF_RE.test(name);
}
// The ONE current Keycard Form this email may carry, picked out of whatever
// has accumulated in g.keycard across saves, sessions and Edits.
//
//  - The merged Cubework_Keycard_Form_v2.1_<date>.pdf wins outright. It is
//    rebuilt from the LATEST SAVED submission immediately before both
//    Preview and Send (eraMaybeBuildKeycardFormPdf(), which awaits a fresh
//    eraSaveKeycardSubmission() first), covers every card, and carries both
//    the tenant and the staff signature - so it is by definition the
//    latest/current form, and every Signed_CardN.pdf is a stale fragment of
//    it. If several are somehow present, the most recently attached wins.
//  - Only if that build failed or never ran do the per-card
//    Signed_CardN.pdf files stand in, one per card (newest per card). They
//    are never mixed with the merged form - that mix is exactly the bug.
function eraCurrentKeycardFormFiles(files) {
  const merged = (files || []).filter(function (f) { return ERA_PREVIEW_KFORM_PDF_RE.test(f.name); });
  if (merged.length) return [merged[merged.length - 1]];
  const byCard = {};
  (files || []).forEach(function (f) {
    const m = ERA_KEYCARD_SIGNED_CARD_PDF_RE.exec(f.name);
    if (m) byCard[m[1]] = f;                       // last one attached wins
  });
  return Object.keys(byCard).map(function (n) { return byCard[n]; });
}
// What actually leaves the building. Exactly one Keycard Form (above), each
// card's Photo ID and anything staff attached by hand, with the raw
// signature PNGs stripped (their ink is already inside the form) and any
// repeated filename collapsed to its most recent copy. Original order is
// preserved; g.keycard itself is never modified - Preview's View/Delete
// rows, History restore and the form's own Attachments list all still see
// the full set.
function eraFilterKeycardEmailAttachments(files) {
  const list = (files || []).filter(function (f) { return !ERA_KEYCARD_EMAIL_SKIP_RE.test(f.name); });
  const keepForms = eraCurrentKeycardFormFiles(list);
  const out = [], seen = {};
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    if (eraIsKeycardFormAttachment(f.name) && keepForms.indexOf(f) === -1) continue;
    const key = String(f.name || "").toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.unshift(f);
  }
  return out;
}
function pt(e){if(a("era_err").style.display="none",a("era_ok").style.display="none",!Le())return;const t=w("era_location"),r=Y(),i=window.submitCwEmailRequest;if(!i){y(["Missing window.submitCwEmailRequest - check app.js."]);return}const n=ie(t),l=a("era_submitBtn");l.disabled=!0,l.textContent="Sending\u2026",window.eraShowGlobalLoading&&window.eraShowGlobalLoading(),Promise.all((_==="phone"?g.phone.concat(g.phoneItForm):_==="keycard"?eraFilterKeycardEmailAttachments(g[_]):g[_]).map(at)).then(function(o){const u={mode:_,locationText:t,locationSubjectName:n?n.subjectName:t,locationBodyLine:n?n.bodyLine:t,extraLocationBodyLines:eraCollectExtraLocationBodyLines(),requesterEmail:r,fields:Se(),attachments:o,toRecipientsOverride:eraEditableRecipients.to.slice(),ccRecipientsOverride:eraEditableRecipients.cc.slice(),bccRecipientsOverride:eraEditableRecipients.bcc.slice()};return e&&(u.htmlBodyOverride=e),i(u).then(function(d){const h=d.data;l.disabled=!1,l.textContent="Preview",window.eraHideGlobalLoading&&window.eraHideGlobalLoading(),h.ok?(_==="keycard"&&eraRecordKeycardHistoryOnSend(u),nt(h),st(),_==="keycard"&&eraReloadAfterSentAlert()):y(h.problems||["Something went wrong."])})}).catch(function(o){l.disabled=!1,l.textContent="Preview",window.eraHideGlobalLoading&&window.eraHideGlobalLoading(),y(["Couldn't send: "+(o&&o.message?o.message:o)])})}const ht=1500;function T(e){const t=a("era_outlookStatus");t&&(t.textContent=e,t.style.display=e?"block":"none")}function U(e){return(e||[]).map(function(t){return t.email}).filter(Boolean)}function ft(e){T("");const t=eraEditableRecipients.to.concat(eraEditableRecipients.cc),r=encodeURIComponent(t.join(",")),i=encodeURIComponent(e.subject),n=e.textBody||"";let l="https://outlook.office.com/mail/deeplink/compose?to="+r+"&subject="+i;eraEditableRecipients.bcc.length&&(l+="&bcc="+encodeURIComponent(eraEditableRecipients.bcc.join(",")));const o=l+"&body="+encodeURIComponent(n);if(o.length<=ht){window.open(o,"_blank","noopener,noreferrer"),T("Opened in Outlook \u2014 attach your file(s) there and hit Send.");return}T("This request is long \u2014 copying the body\u2026"),window.eraShowGlobalLoading&&window.eraShowGlobalLoading(),(navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(n):Promise.reject(new Error("Clipboard API not available in this browser."))).then(function(){window.eraHideGlobalLoading&&window.eraHideGlobalLoading(),window.open(l,"_blank","noopener,noreferrer"),T("Opened in Outlook \u2014 paste (Ctrl+V) the body, attach your file(s), then hit Send.")},function(d){window.eraHideGlobalLoading&&window.eraHideGlobalLoading(),console.error(d),window.open(l,"_blank","noopener,noreferrer"),window.prompt("Couldn't copy automatically. Copy this manually (Ctrl+C), then paste it into the compose window that opened:",n),T("Opened in Outlook \u2014 see the prompt to copy the body manually, then attach your file(s) and hit Send.")})}const re="graph";a("era_submitBtn").textContent="Preview",document.querySelectorAll(".era-attach-section").forEach(function(e){e.style.display=re==="graph"?"":"none"}),document.querySelectorAll(".era-attach-reminder").forEach(function(e){e.style.display=re==="graph"?"none":""});
// Extracted (2026-09-08, per Huy's request, task 4) from #era_submitBtn's
// own inline click closure so the exact same handler reference can also be
// attached to every section-scoped Submission button (Wi-Fi/Software/
// Electrical/Hardware's Printer+Phone+Laptop) without forking any of the
// real Preview/Send pipeline (eraSaveKeycardSubmission/eraMaybeBuildKeycardFormPdf/ut()
// are all untouched, called exactly as before). Reads the shared `_`
// current-mode variable, same as every other mode-aware helper in this
// script - correct regardless of which button was actually clicked, since
// a section-scoped button only ever exists/shows while its own mode is
// active. Byte-identical behavior to the original inline closure.
function eraHandleSubmitClick(){(_==="keycard"?eraSaveKeycardSubmission().catch(function(err){console.error("Auto-save before Preview failed:",err)}):Promise.resolve()).then(function(){return eraMaybeBuildKeycardFormPdf()}).then(ut)}
[
  "era_submitBtn","era_w_submitBtn","era_el_submitBtn","era_ap_submitBtn",
  "era_pr_submitBtn","era_ph_submitBtn","era_lt_submitBtn"
].forEach(function(id){const btn=a(id);btn&&btn.addEventListener("click",eraHandleSubmitClick)});
a("era_previewEditBtn").addEventListener("click",ae),a("era_previewSaveBtn").addEventListener("click",function(){const btn=a("era_previewSaveBtn"),statusEl=a("era_previewSaveStatus"),original=btn.textContent;btn.disabled=!0,btn.textContent="Saving…",eraSaveKeycardSubmission().then(function(){btn.disabled=!1,btn.textContent=original,statusEl&&(statusEl.textContent="Saved to Submission (Pending).",statusEl.style.display="block")}).catch(function(err){btn.disabled=!1,btn.textContent=original,statusEl&&(statusEl.textContent="Couldn't save: "+(err&&err.message?err.message:err),statusEl.style.display="block")})}),a("era_previewSendBtn").addEventListener("click",function(){const e=ee,t=te?a("era_previewBody").innerHTML:null;ae(),e&&(re==="graph"?eraMaybeBuildKeycardFormPdf().then(function(){pt(t)}):ft(e))}),a("era_previewFormatBtn").addEventListener("click",ct),a("era_fmt_bold").addEventListener("click",function(){A("bold")}),a("era_fmt_italic").addEventListener("click",function(){A("italic")}),a("era_fmt_underline").addEventListener("click",function(){A("underline")}),a("era_fmt_font").addEventListener("change",function(e){e.target.value&&A("fontName",e.target.value),e.target.selectedIndex=0}),a("era_fmt_size").addEventListener("change",function(e){e.target.value&&A("fontSize",e.target.value),e.target.selectedIndex=0}),a("era_fmt_color").addEventListener("input",function(e){A("foreColor",e.target.value)});
// Keycard Submission History (2026-08-19) - see the big comment on
// #era_k_historyCard above for what this reads/renders.
let eraKeycardHistoryStatusFilter="pending";
// Search + per-row collapse state (2026-08-21, per Huy's request) - kept
// module-scoped (not per-render) so a re-render (this list re-renders every
// 3s via the setInterval below) doesn't reset what staff typed or which
// rows they'd collapsed.
let eraKeycardHistorySearchQuery="";
const eraKeycardHistoryCollapsedIds=new Set();
function eraKeycardHistoryStatusColors(status){
  return status==="complete"
    ? {border:"#16a34a",bg:"#f0fdf4",chipBg:"#dcfce7",chipText:"#166534"}
    : {border:"#f59e0b",bg:"#fffbeb",chipBg:"#fef3c7",chipText:"#92400e"};
}
function eraKeycardEntrySummaryLine(en){const bits=[];if(en.companyName)bits.push(en.companyName);if(en.tenantName&&en.tenantName.toLowerCase()!==(en.companyName||"").toLowerCase())bits.push(en.tenantName);if(en.keycardNumber)bits.push("#"+en.keycardNumber);if(en.action)bits.push("("+en.action+")");return bits.join(" ")||"(no details)"}
// Tenant Name shown bold green in the Submission list (2026-08-28, per
// Huy's request) - a separate HTML-building twin of
// eraKeycardEntrySummaryLine() above (which stays plain-text, still used
// for the search haystack below) since escape-after-join can't single out
// one bit for its own inline style once everything's joined into one
// string.
function eraKeycardEntrySummaryLineHtml(en){const bits=[];if(en.companyName)bits.push(ot(en.companyName));if(en.tenantName&&en.tenantName.toLowerCase()!==(en.companyName||"").toLowerCase())bits.push('<b style="color:#15803d;">'+ot(en.tenantName)+"</b>");if(en.keycardNumber)bits.push("#"+ot(en.keycardNumber));if(en.action)bits.push("("+ot(en.action)+")");return bits.join(" ")||"(no details)"}
// Fuzzy search haystack (2026-08-28, per Huy's request: "fuzzy search
// across all submission fields") - covers every field a submission can
// carry, not just the three (location/company/tenant) the placeholder
// text used to promise: the top-level record (location, requester email,
// licensee company, Yardi account, floor/unit, issued-by name), every
// entry's summary (company/tenant/keycard#/email/phone/action), and
// whatever else survived onto fullEntries (notes, troubleshoot issue,
// transfer from/to, manager email, replacement company/tenant/location) -
// so "any other searchable text" per entry is actually covered, not just
// the three fields the old placeholder named.
function eraKeycardHistorySearchHaystack(r){const entries=Array.isArray(r.entriesSummary)?r.entriesSummary:[];const fullEntries=Array.isArray(r.fullEntries)?r.fullEntries:[];const parts=[r.locationText||"",r.requesterEmail||"",r.licenseeCompanyName||"",r.yardiDealAccount||"",r.floorNumber||"",r.unitNumber||"",r.issuedByName||""];entries.forEach(function(en){parts.push(en.companyName||"",en.tenantName||"",en.keycardNumber||"",en.email||"",en.phone||"",en.action||"")});fullEntries.forEach(function(en){parts.push(en.notes||"",en.issue||"",en.transferFrom||"",en.transferTo||"",en.managerEmail||"",en.replCompanyName||"",en.replTenantName||"",en.replLocation||"",en.replEmail||"",en.replPhone||"")});return parts.join(" ").toLowerCase()}
function eraRenderKeycardHistory(){const listEl=a("era_k_historyList");if(!listEl)return;const cache=window.getKeycardHistoryCache?window.getKeycardHistoryCache():{};const rows=Object.keys(cache).map(function(id){return Object.assign({id:id},cache[id])});const pendingCount=rows.filter(function(r){return(r.status||"pending")==="pending"}).length,completeCount=rows.filter(function(r){return r.status==="complete"}).length;const tabsEl=a("era_k_historyTabs");if(tabsEl){const pt2=tabsEl.querySelector('[data-status="pending"]'),ct2=tabsEl.querySelector('[data-status="complete"]');if(pt2)pt2.textContent="Pending ("+pendingCount+")";if(ct2)ct2.textContent="Complete ("+completeCount+")"}const searchQuery=eraKeycardHistorySearchQuery.trim().toLowerCase();
  // Search spans BOTH Pending and Complete (2026-08-28 follow-up, per Huy's
  // report: "search is still lock on Pending or Complete") - the Pending/
  // Complete tabs are a STATUS filter, not a search scope; while a search
  // query is active it's applied across every row regardless of status
  // (each result's own colored chip still shows which status it is), and
  // the status filter only kicks back in once the search box is cleared.
  // Before this fix, results sitting in the other tab were silently
  // excluded even when they matched the query.
  let filtered=searchQuery?rows.slice():rows.filter(function(r){return(r.status||"pending")===eraKeycardHistoryStatusFilter});
  if(searchQuery){
  // Fuzzy = every whitespace-separated token in the query must appear as a
  // substring SOMEWHERE in the haystack (not necessarily adjacent, not
  // necessarily in the same field) - "any matching word/partial word"
  // returns the submission, per Huy's request.
  const tokens=searchQuery.split(/\s+/).filter(Boolean);
  filtered=filtered.filter(function(r){const haystack=eraKeycardHistorySearchHaystack(r);return tokens.every(function(tok){return haystack.indexOf(tok)!==-1})})}
  // Replacement-only filter (2026-08-22, per Huy's request: "The Submission
  // for Replacement is only for 'Replacement'") - while any keycard entry is
  // currently set to Replacement, Submission shows only past submissions
  // that themselves contain a Replacement entry (entriesSummary[].action,
  // set by eraKeycardEntryAction() at save/send time), not every submission
  // regardless of action.
  if(typeof eraKeycardHasReplacement==="function"&&eraKeycardHasReplacement()){filtered=filtered.filter(function(r){const entries=Array.isArray(r.entriesSummary)?r.entriesSummary:[];return entries.some(function(en){return en.action==="replacement"})})}
  filtered.sort(function(x,y){const xt=x.createdAt&&x.createdAt.toMillis?x.createdAt.toMillis():0,yt=y.createdAt&&y.createdAt.toMillis?y.createdAt.toMillis():0;return yt-xt});
  // Cap search results to 5 (2026-08-28, per Huy's request) - only while a
  // search is active, spanning both tabs (see the fuzzy-search block above).
  // Cap browsing (no search) to 3 entries (2026-08-29, per Huy's request:
  // "Show only the 3 existing entries in Submission") - applies to the
  // plain Pending/Complete tab view; search itself is untouched and keeps
  // its own 5-result cap below.
  const totalMatches=filtered.length;
  const cap=searchQuery?5:3;
  if(filtered.length>cap){filtered=filtered.slice(0,cap)}
  if(!filtered.length){listEl.innerHTML='<div class="era-note">'+(searchQuery?"No submissions match that search.":"No "+eraKeycardHistoryStatusFilter+" submissions.")+'</div>';return}
  const capNote=(totalMatches>cap)?'<div class="era-note" style="margin-bottom:8px;">Showing top '+cap+' of '+totalMatches+' '+(searchQuery?"matches":"submissions")+' - '+(searchQuery?"refine your search to narrow further.":"use search to find others.")+'</div>':"";
  listEl.innerHTML=capNote+filtered.map(function(r){const entries=Array.isArray(r.entriesSummary)?r.entriesSummary:[];const entryLines=entries.map(eraKeycardEntrySummaryLineHtml).join("<br>")||"(no entries)";const photoIdKeys=r.photoIds?Object.keys(r.photoIds):[];const cardCount=r.cardCount||0;const photoIdLine=r.path==="no"?("Photo IDs: "+photoIdKeys.length+"/"+cardCount):"Physical form attached";const viewBtns=photoIdKeys.map(function(n){return '<button type="button" class="secondary era-kform-photoid-view-btn" data-history-id="'+ot(r.id)+'" data-history-card="'+ot(n)+'" style="margin:4px 6px 0 0;font-size:12px;padding:4px 8px;">View Card '+ot(n)+' ID</button>'}).join("");
  // Edit / Delete (2026-08-19 pass): Edit reopens Keycard Form pre-filled
  // from this record via window.eraOpenKeycardFormForHistory (defined in
  // the OTHER, Keycard-Form-modal <script> block below - see its own
  // comment for how it detects e-signature-still-pending vs
  // customer-already-signed on load). Delete is a REAL server-side delete
  // of this keycardRequestHistory doc (functions/index.js's
  // deleteKeycardHistory) - contrast with "Your Signature Requests"'
  // own Remove button (below, in the modal), which only hides a row from
  // that display list and never touches Firestore.
  // Manual Pending<->Complete toggle (added 2026-08-20) - lets staff flip a
  // submission's status by hand regardless of its actual photo-ID/signature
  // progress; the label always shows the OTHER status (what clicking it
  // will move the card to). Sticks server-side via setKeycardHistoryStatus's
  // manualOverride flag - see functions/index.js. status defaults to
  // "pending" same as every other read of r.status in this render function.
  const currentStatus=r.status||"pending",nextStatus=currentStatus==="complete"?"pending":"complete";
  const editDeleteBtns='<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">'+
    '<button type="button" class="secondary era-kform-history-edit-btn" data-history-id="'+ot(r.id)+'" style="font-size:12px;padding:4px 8px;">Edit</button>'+
    '<button type="button" class="secondary era-kform-history-status-btn" data-history-id="'+ot(r.id)+'" data-next-status="'+nextStatus+'" style="font-size:12px;padding:4px 8px;">Mark '+(nextStatus==="complete"?"Complete":"Pending")+'</button>'+
    '<button type="button" class="secondary era-kform-history-delete-btn" data-history-id="'+ot(r.id)+'" style="font-size:12px;padding:4px 8px;color:#dc2626;">Delete</button>'+
    "</div>";
  // Colorized, individually collapsible row (2026-08-21, per Huy's request)
  // - a plain <details> per submission (native disclosure, same free
  // show/hide the outer Submission card already uses) instead of an
  // always-expanded <div>, tinted by status so Pending/Complete read at a
  // glance without opening anything.
  const colors=eraKeycardHistoryStatusColors(currentStatus);
  const isOpen=!eraKeycardHistoryCollapsedIds.has(r.id);
  return '<details class="era-card era-k-history-row" data-history-id="'+ot(r.id)+'"'+(isOpen?" open":"")+' style="margin-bottom:10px;padding:0;border-left:4px solid '+colors.border+';background:'+colors.bg+';">'+
    '<summary style="cursor:pointer;padding:12px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+
      '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:'+colors.chipBg+';color:'+colors.chipText+';text-transform:uppercase;letter-spacing:.03em;">'+ot(currentStatus)+'</span>'+
      '<span style="font-weight:600;">'+ot(r.locationText||"(no location)")+'</span>'+
      '<span class="era-hint" style="margin-left:auto;">'+cardCount+' card'+(cardCount===1?"":"s")+'</span>'+
    '</summary>'+
    '<div style="padding:0 14px 12px 14px;">'+'<div class="era-hint">'+entryLines+"</div>"+'<div class="era-hint">'+ot(photoIdLine)+"</div>"+viewBtns+editDeleteBtns+"</div>"+
  "</details>"}).join("");listEl.querySelectorAll(".era-kform-photoid-view-btn").forEach(function(btn){btn.addEventListener("click",function(){eraViewKeycardPhotoId(btn.getAttribute("data-history-id"),btn.getAttribute("data-history-card"),btn)})});listEl.querySelectorAll(".era-kform-history-edit-btn").forEach(function(btn){btn.addEventListener("click",function(){
  // Recoverability fix (2026-08-29): same disable-during/reset-after
  // pattern the Delete/Mark Complete buttons already use just below,
  // extended to Edit - previously Edit had NO busy state at all, so a
  // double-click (or a click while a slow-to-load submission was still
  // being restored) could fire eraEditKeycardHistoryEntry() twice
  // overlapping, and a failure gave zero visible feedback (no disabled
  // state to reset, nothing to notice was stuck). The `finally` guarantees
  // this button is always clickable again the instant the call returns,
  // success or failure - eraEditKeycardHistoryEntry() itself now never
  // throws past this point (see its own try/catch) and reports success via
  // its return value, but the guard here is defensive in case that ever
  // changes. Note this whole list re-renders on Submission's own 3s
  // auto-refresh, which replaces this button outright - this reset is only
  // for the (common) case of the user clicking again before that happens.
  if(btn.disabled)return;
  if(typeof window.eraEditKeycardHistoryEntry!=="function"){alert("Edit isn't available on this page yet - try reloading.");return}
  var original=btn.textContent;
  btn.disabled=true;btn.textContent="Loading…";
  try{window.eraEditKeycardHistoryEntry(btn.getAttribute("data-history-id"))}
  finally{btn.disabled=false;btn.textContent=original}
})});listEl.querySelectorAll(".era-kform-history-delete-btn").forEach(function(btn){btn.addEventListener("click",function(){eraDeleteKeycardHistoryEntry(btn.getAttribute("data-history-id"),btn)})});listEl.querySelectorAll(".era-kform-history-status-btn").forEach(function(btn){btn.addEventListener("click",function(){eraSetKeycardHistoryStatus(btn.getAttribute("data-history-id"),btn.getAttribute("data-next-status"),btn)})});listEl.querySelectorAll(".era-k-history-row").forEach(function(d){d.addEventListener("toggle",function(){const id=d.getAttribute("data-history-id");if(d.open)eraKeycardHistoryCollapsedIds.delete(id);else eraKeycardHistoryCollapsedIds.add(id)})})}
async function eraDeleteKeycardHistoryEntry(requestId,btn){
  if(!window.deleteKeycardHistory){alert("Missing window.deleteKeycardHistory - check app.js.");return}
  if(!confirm("Delete this submission from Submission? This permanently removes the record from the server."))return;
  btn.disabled=true;const original=btn.textContent;btn.textContent="Deleting…";
  window.eraShowGlobalLoading&&window.eraShowGlobalLoading();
  try{await window.deleteKeycardHistory({requestId:requestId});eraRenderKeycardHistory()}
  catch(e){console.error("eraDeleteKeycardHistoryEntry failed:",e);alert("Couldn't delete: "+(e&&e.message?e.message:e));btn.disabled=false;btn.textContent=original}
  finally{window.eraHideGlobalLoading&&window.eraHideGlobalLoading()}
}
// Manual Pending<->Complete toggle (added 2026-08-20) - see the big comment
// above editDeleteBtns in eraRenderKeycardHistory for what this button does
// and functions/index.js's setKeycardHistoryStatus for the server side
// (sticks via manualOverride even through a later Save/Preview > Send).
async function eraSetKeycardHistoryStatus(requestId,nextStatus,btn){
  if(!window.setKeycardHistoryStatus){alert("Missing window.setKeycardHistoryStatus - check app.js.");return}
  btn.disabled=true;const original=btn.textContent;btn.textContent="Saving…";
  window.eraShowGlobalLoading&&window.eraShowGlobalLoading();
  try{await window.setKeycardHistoryStatus({requestId:requestId,status:nextStatus});eraRenderKeycardHistory()}
  catch(e){console.error("eraSetKeycardHistoryStatus failed:",e);alert("Couldn't update status: "+(e&&e.message?e.message:e));btn.disabled=false;btn.textContent=original}
  finally{window.eraHideGlobalLoading&&window.eraHideGlobalLoading()}
}
async function eraViewKeycardPhotoId(requestId,cardNumber,btn){if(!window.getKeycardPhotoIdData){return}const cache=window.getKeycardHistoryCache?window.getKeycardHistoryCache():{};const doc=cache[requestId];const meta=doc&&doc.photoIds?doc.photoIds[cardNumber]:null;if(!meta||!meta.path){return}const original=btn.textContent;btn.disabled=!0;btn.textContent="Loading…";window.eraShowGlobalLoading&&window.eraShowGlobalLoading();try{const res=await window.getKeycardPhotoIdData({requestId:requestId,path:meta.path});const d=res.data;const win=window.open("","_blank");if(win){win.document.write('<title>Photo ID</title><body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="data:'+d.contentType+";base64,"+d.base64Data+'" style="max-width:100%;max-height:100vh;"></body>')}}catch(e){console.error("eraViewKeycardPhotoId failed:",e)}finally{btn.disabled=!1,btn.textContent=original,window.eraHideGlobalLoading&&window.eraHideGlobalLoading()}}
(function(){const tabsEl=a("era_k_historyTabs");if(!tabsEl)return;tabsEl.querySelectorAll(".era-tab").forEach(function(tab){tab.addEventListener("click",function(){eraKeycardHistoryStatusFilter=tab.getAttribute("data-status");tabsEl.querySelectorAll(".era-tab").forEach(function(t){t.classList.toggle("era-active",t===tab)});eraRenderKeycardHistory()})})})();
// Search + Collapse all/Expand all (2026-08-21) - the search box and these
// two buttons live in the static markup around #era_k_historyList (not
// re-rendered every 3s like the rows themselves), so they're wired once
// here rather than inside eraRenderKeycardHistory.
(function(){const searchEl=a("era_k_historySearch");if(!searchEl)return;searchEl.addEventListener("input",function(){eraKeycardHistorySearchQuery=searchEl.value;eraRenderKeycardHistory()})})();
(function(){const collapseBtn=a("era_k_historyCollapseAllBtn"),expandBtn=a("era_k_historyExpandAllBtn");if(collapseBtn)collapseBtn.addEventListener("click",function(){document.querySelectorAll("#era_k_historyList .era-k-history-row").forEach(function(d){d.open=false})});if(expandBtn)expandBtn.addEventListener("click",function(){document.querySelectorAll("#era_k_historyList .era-k-history-row").forEach(function(d){d.open=true})})})();
eraRenderKeycardHistory();
setInterval(eraRenderKeycardHistory,3000);
})();
