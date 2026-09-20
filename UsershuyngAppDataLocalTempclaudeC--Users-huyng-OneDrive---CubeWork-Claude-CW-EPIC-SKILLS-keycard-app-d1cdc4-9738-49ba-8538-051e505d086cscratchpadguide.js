
(function () {
  "use strict";
  function byId(id) { return document.getElementById(id); }

  // ---- Overlay chrome (built once, reused across tours) ----
  var scrim = document.createElement("div"); scrim.id = "eraGuideScrim";
  var spotlight = document.createElement("div"); spotlight.id = "eraGuideSpotlight";
  var arrow = document.createElement("div"); arrow.id = "eraGuideArrow";
  arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><path d="M12 4v13M12 17l-5-5M12 17l5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var tooltip = document.createElement("div"); tooltip.id = "eraGuideTooltip";
  tooltip.innerHTML = '<div class="era-guide-title"><span class="era-guide-title-text"></span><button type="button" class="era-guide-close" title="Exit guide">✕</button></div><div class="era-guide-body"></div><div class="era-guide-hint" style="display:none;"></div><div class="era-guide-progress"></div>';
  document.body.appendChild(scrim);
  document.body.appendChild(spotlight);
  document.body.appendChild(arrow);
  document.body.appendChild(tooltip);
  scrim.style.display = "none"; spotlight.style.display = "none"; arrow.style.display = "none"; tooltip.style.display = "none";
  tooltip.querySelector(".era-guide-close").addEventListener("click", function () { eraGuideEnd(); });

  var chooser = document.createElement("div"); chooser.id = "eraGuideChooser";
  chooser.innerHTML =
    '<div class="era-guide-chooser-box">' +
      '<h3>Activate a keycard</h3>' +
      '<p>Would you like a step-by-step walkthrough of this form, or do you know it well enough to fill it in yourself?</p>' +
      '<button type="button" class="era-guide-primary" data-choice="guide">With Step by Step Instruction</button>' +
      '<button type="button" data-choice="manual">Manually (I am a professional)</button>' +
    '</div>';
  document.body.appendChild(chooser);
  chooser.addEventListener("click", function (ev) {
    if (ev.target === chooser) { chooser.classList.remove("era-guide-on"); return; } // backdrop click = dismiss, same as Manually
    var choice = ev.target.getAttribute && ev.target.getAttribute("data-choice");
    if (!choice) return;
    chooser.classList.remove("era-guide-on");
    if (choice === "guide") eraGuideStart(chooserEntryEl);
    // "manual" (or backdrop dismiss): do nothing else - existing workflow unchanged.
  });

  // ---- Trigger: any keycard entry's Action select transitioning INTO "activate" ----
  var chooserEntryEl = null;
  document.addEventListener("change", function (ev) {
    var sel = ev.target;
    if (!sel || !sel.classList || !sel.classList.contains("era-k-action-select")) return;
    var prev = sel.dataset.eraGuidePrevAction || "";
    sel.dataset.eraGuidePrevAction = sel.value;
    if (sel.value === "activate" && prev !== "activate" && !eraGuideActive) {
      chooserEntryEl = sel.closest(".era-entry-block");
      if (chooserEntryEl) chooser.classList.add("era-guide-on");
    }
  }, true);

  // ---- Step definitions ----
  // Each step targets a real, already-existing Keycard element - nothing
  // here duplicates a field, a validation rule, or a submit/save action;
  // it only highlights and (for "required" steps) polls that element's own
  // state to know when to move on.
  function entryQ(ctx, sel) { return ctx.entryEl ? ctx.entryEl.querySelector(sel) : null; }
  function anyChecked(container) { return !!(container && container.querySelector("input:checked")); }
  function hasInk(statusEl) { return !!(statusEl && statusEl.textContent.indexOf("✅") !== -1); }

  var STEPS = [
    { key: "location", target: function () { return byId("era_location"); }, title: "Location", body: "Select or type a location for this request.",
      required: true, satisfied: function (el) { return !!(el && el.value.trim()); } },
    { key: "addLocation", target: function () { return byId("era_addLocationBtn"); }, title: "+ Add location", body: "Click here for another location. If not, click outside to go to the next step.",
      required: false },
    { key: "yourEmail", target: function () { return byId("era_requesterEmailLocal"); }, title: "Your Email", body: "Enter your CW's email.",
      required: true, satisfied: function (el) { return !!(el && el.value.trim()); } },
    { key: "dealLicensee", target: function () { return byId("era_k_dealLicenseeCard"); }, title: "Deal & LICENSEE", body: "Fill in Licensee Company Name, Yardi Deal#/Account#, Floor #, and Unit # as applicable. Click outside when done to continue to Serves.",
      required: false },
    { key: "servesSystem", target: function () { return byId("era_k_servesCard") && byId("era_k_servesCard").querySelector(":scope > .era-checks"); }, title: "Serves", body: "Select Cubework and/or Unis.",
      required: true, satisfied: function (el) { return anyChecked(el); } },
    { key: "servesAccess", target: function () { return byId("era_k_body") && byId("era_k_body").querySelector(":scope > .era-checks"); }, title: "Access system", body: "Select HikCentral and/or Unifi.",
      required: true, satisfied: function (el) { return anyChecked(el); } },
    { key: "tenantName", target: function (ctx) { return entryQ(ctx, ".era-k-tenantName"); }, title: "Cardholder", body: "Enter the Tenant's First and Last Name.",
      required: true, satisfied: function (el) { return !!(el && el.value.trim()); } },
    { key: "keycardNumber", target: function (ctx) { return entryQ(ctx, ".era-k-keycard"); }, title: "Keycard Number", body: "Enter the keycard number if you have it, or click outside to continue.",
      required: false },
    { key: "accessLevel", target: function (ctx) { return entryQ(ctx, ".era-k-accessLevel-wrap"); }, title: "Access Level", body: "Defaults to Standard. Change it if needed, or click outside to continue.",
      required: false },
    { key: "tenantEmail", target: function (ctx) { return entryQ(ctx, ".era-k-email"); }, title: "Tenant Email", body: "Enter the tenant's email, or click outside to continue.",
      required: false },
    { key: "tenantPhone", target: function (ctx) { return entryQ(ctx, ".era-k-phone"); }, title: "Tenant Phone", body: "Enter the tenant's phone number, or click outside to continue.",
      required: false },
    { key: "fee", target: function (ctx) { return entryQ(ctx, ".era-k-fee-row"); }, title: "Fee", body: "Check this if a fee applies (extra key beyond the first 2 free — $30). This can be skipped when not applicable — click outside to continue.",
      required: false },
    { key: "issuedDate", target: function (ctx) { return entryQ(ctx, ".era-k-dateIssued"); }, title: "Issued Date", body: "Select the date this card is issued.",
      required: true, satisfied: function (el) { return !!(el && el.value.trim()); } },
    { key: "esignature", target: function (ctx) { var cb = entryQ(ctx, ".era-k-signid-esign"); return cb && cb.closest("label"); }, title: "E-Signature", body: "Check E-Signature. If a tenant email isn't already filled in above, enter one and click “Send for E-Signature.”",
      required: true, satisfied: function (el, ctx) { var d = entryQ(ctx, ".era-k-signid-decision"); return !!(d && !d.classList.contains("era-field-hidden")); } },
    { key: "saveOrWait", target: function (ctx) { return entryQ(ctx, ".era-k-signid-decisionButtons"); }, title: "Save or Wait", body: "“Save & Leave” — if the customer is not here, save this entry and wait for the tenant signature. “Wait for Signature Now” — if the customer is present, have them check their Email/Junk, sign, upload their Photo ID, and submit from their phone/laptop.",
      required: true, clickAdvanceSelectors: [".era-k-signid-saveLeaveBtn", ".era-k-signid-waitBtn"] },
    { key: "addKeycard", target: function () { return byId("era_k_addEntryBtn"); }, title: "+ Add another keycard", body: "Click here for another keycard Activate or other options. Click outside to continue.",
      required: false },
    { key: "staffName", target: function () { return byId("era_k_issuedBy_name"); }, title: "Staff Name", body: "Enter the Facility Lead/Manager/Sales staff name.",
      required: true, satisfied: function (el) { return !!(el && el.value.trim()); } },
    { key: "staffDate", target: function () { return byId("era_k_issuedBy_date"); }, title: "Staff Date", body: "Select today's date.",
      required: true, satisfied: function (el) { return !!(el && el.value.trim()); } },
    { key: "staffSignature", target: function () { return byId("era_k_issuedBy_canvas"); }, title: "Staff Signature", body: "Sign using your mouse or touch screen.",
      required: true, satisfied: function () { return hasInk(byId("era_k_issuedBy_inkStatus")); } },
    { key: "attachments", target: function () { return byId("era_k_attachCard"); }, title: "Attachments", body: "This is what will be attached to the request. Click outside to continue.",
      required: false },
    { key: "preview", target: function () { return byId("era_submitBtn"); }, title: "Preview", body: "Click here and wait for the next step.",
      required: true, satisfied: function () { var m = byId("era_previewModal"); return !!(m && m.style.display && m.style.display !== "none"); } },
    { key: "verifyPreview", target: function () { return byId("era_previewModal") && byId("era_previewModal").querySelector(":scope > div"); }, title: "Verify Preview", body: "Verify recipient emails, review the attachments (view/edit/delete if needed), and review the email body. Click outside to continue.",
      required: false },
    { key: "finalEditSend", target: function () { var b = byId("era_previewSendBtn"); return b && b.parentElement; }, title: "Final Edit / Send", body: "Edit — hand-edit the formatted text if anything needs to change. Cancel — go back/close without sending. Save — save the current data and changes. Send — send the email once everything above is verified.",
      required: true, clickAdvanceSelectors: ["#era_previewFormatBtn", "#era_previewEditBtn", "#era_previewSaveBtn", "#era_previewSendBtn"], terminal: true },
  ];

  // ---- Engine ----
  var eraGuideActive = false, stepIndex = 0, ctx = {}, rafId = null;
  var outsideClickHandler = null, advanceClickTargets = [];

  function clearOutsideClick() {
    if (outsideClickHandler) document.removeEventListener("click", outsideClickHandler, true);
    outsideClickHandler = null;
  }
  function clearAdvanceClicks() {
    advanceClickTargets.forEach(function (t) { t.el.removeEventListener("click", t.fn); });
    advanceClickTargets = [];
  }

  function eraGuideStart(entryEl) {
    if (!entryEl || !entryEl.isConnected) return;
    ctx = { entryEl: entryEl };
    eraGuideActive = true;
    stepIndex = 0;
    renderStep();
  }

  function eraGuideEnd() {
    eraGuideActive = false;
    clearOutsideClick(); clearAdvanceClicks();
    if (rafId) cancelAnimationFrame(rafId), rafId = null;
    scrim.classList.remove("era-guide-on");
    scrim.style.display = "none"; spotlight.style.display = "none";
    arrow.style.display = "none"; tooltip.style.display = "none";
    spotlight.classList.remove("era-guide-bounce");
  }

  function goNext() {
    clearOutsideClick(); clearAdvanceClicks();
    stepIndex++;
    if (stepIndex >= STEPS.length) { eraGuideEnd(); return; }
    renderStep();
  }

  function renderStep() {
    var step = STEPS[stepIndex];
    scrim.style.display = "block"; spotlight.style.display = "block";
    arrow.style.display = "block"; tooltip.style.display = "block";
    requestAnimationFrame(function () { scrim.classList.add("era-guide-on"); });

    tooltip.querySelector(".era-guide-title-text").textContent = step.title;
    tooltip.querySelector(".era-guide-body").innerHTML = step.body;
    var hintEl = tooltip.querySelector(".era-guide-hint");
    if (!step.required) { hintEl.style.display = "block"; hintEl.textContent = "Click outside this step to continue."; }
    else hintEl.style.display = "none";
    tooltip.querySelector(".era-guide-progress").textContent = "Step " + (stepIndex + 1) + " of " + STEPS.length;

    if (step.required && step.clickAdvanceSelectors) {
      step.clickAdvanceSelectors.forEach(function (sel) {
        var el = sel.charAt(0) === "." ? entryQ(ctx, sel) : (sel.charAt(0) === "#" ? byId(sel.slice(1)) : null);
        if (!el) return;
        var fn = function () { if (step.terminal) eraGuideEnd(); else goNext(); };
        el.addEventListener("click", fn);
        advanceClickTargets.push({ el: el, fn: fn });
      });
    }

    if (!step.required) {
      outsideClickHandler = function (ev) {
        var target = step.target(ctx);
        if (target && (target === ev.target || target.contains(ev.target))) return;
        if (tooltip.contains(ev.target) || spotlight.contains(ev.target) || arrow.contains(ev.target)) return;
        goNext();
      };
      document.addEventListener("click", outsideClickHandler, true);
    }

    tick();
  }

  function tick() {
    if (!eraGuideActive) return;
    var step = STEPS[stepIndex];
    var target = step.target(ctx);
    if (!target || !target.isConnected) {
      // Tracked element vanished (e.g. the entry was removed mid-tour) -
      // end gracefully rather than highlight nothing forever.
      eraGuideEnd();
      return;
    }
    var rect = target.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      target.scrollIntoView && (rect.top < 0 || rect.bottom > window.innerHeight) && target.scrollIntoView({ block: "center", behavior: "smooth" });
      var pad = 6;
      spotlight.style.top = Math.max(0, rect.top - pad) + "px";
      spotlight.style.left = Math.max(0, rect.left - pad) + "px";
      spotlight.style.width = (rect.width + pad * 2) + "px";
      spotlight.style.height = (rect.height + pad * 2) + "px";

      var tw = tooltip.offsetWidth || 300, th = tooltip.offsetHeight || 100;
      var margin = 16;
      var spaceBelow = window.innerHeight - (rect.bottom + pad);
      var placeBelow = spaceBelow >= th + margin || spaceBelow >= (rect.top - pad);
      var top = placeBelow ? (rect.bottom + pad + margin) : (rect.top - pad - th - margin);
      top = Math.max(8, Math.min(top, window.innerHeight - th - 8));
      var left = rect.left + rect.width / 2 - tw / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
      tooltip.style.top = top + "px"; tooltip.style.left = left + "px";

      var arrowTop = placeBelow ? (rect.bottom + pad + 2) : (rect.top - pad - 24);
      arrow.style.top = arrowTop + "px";
      arrow.style.left = (rect.left + rect.width / 2 - 11) + "px";
      arrow.className = placeBelow ? "era-guide-arrow-down" : "era-guide-arrow-up";
    }

    if (step.required && typeof step.satisfied === "function") {
      var ok = step.satisfied(target, ctx);
      spotlight.classList.toggle("era-guide-bounce", !ok);
      if (ok && !step.clickAdvanceSelectors) { goNext(); return; }
    } else {
      spotlight.classList.remove("era-guide-bounce");
    }

    rafId = requestAnimationFrame(tick);
  }

  // Exposed only for manual debugging from the console; nothing in this
  // file calls these directly except the chooser modal above.
  window.eraGuideStart = eraGuideStart;
  window.eraGuideEnd = eraGuideEnd;
})();
