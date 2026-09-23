const fs=require("fs"),path=require("path"),TO_EMAIL="helpdesk@unisco.com",TO_NAME="IT Helpdesk",CC_EMAIL_KEYCARD="keycard@cubework.com",CC_EMAILS_GENERAL=["huy.nguyen@cubework.com","jose.ortiz@cubework.com"],CC_NAMES_GENERAL=["Huy Nguyen","Jose Ortiz"],CC_EMAILS_PHONE_UNISCO=["miguel.ochoabello@unisco.com","david.rodriguez@unisco.com"],
// Phone recipients (2026-09-10, per Huy's request, Hardware Submission >
// Preview Email > To/Cc) - Phone got its own recipient lists instead of
// reusing the shared CC_EMAILS_GENERAL/CC_EMAILS_PHONE_UNISCO pairs, since
// those two are shared with every other mode's build*() function
// (Keycard/Wi-Fi/Printer/App/Laptop/Electrical all still Cc Huy+Jose via
// CC_EMAILS_GENERAL unchanged) - changing the shared arrays to satisfy this
// Phone-only request would have silently dropped Jose Ortiz from every one
// of those other modes' emails too. CC_EMAILS_PHONE_UNISCO itself is left
// in place (still exported/read the same way) in case anything else ever
// needs the old Cc-shaped pair; buildPhone() below reads
// TO_EMAILS_PHONE_UNISCO instead, now that Miguel/David moved from Cc to To.
CC_EMAILS_PHONE=["huy.nguyen@cubework.com","josiel.villahermosa@cubework.com"],
CC_NAMES_PHONE=["Huy Nguyen","Josiel Villahermosa"],
TO_EMAILS_PHONE_UNISCO=["miguel.ochoabello@unisco.com","david.rodriguez@unisco.com"],
// Laptop recipients (2026-09-10, per Huy's request) - same reasoning as
// Phone's own dedicated pair above: Laptop needs its Cc to exclude Jose
// Ortiz, and changing the shared CC_EMAILS_GENERAL itself would have
// silently dropped him from Wi-Fi/Printer/App/Electrical too. Miguel/David
// were never wired into any Laptop build path in the first place
// (CC_EMAILS_PHONE_UNISCO above is dead code - Phone reads
// TO_EMAILS_PHONE_UNISCO instead - and neither buildLaptopCubework() nor
// buildGeneric()'s "laptop" entry ever referenced it), so this only needs
// to cover Jose.
CC_EMAILS_LAPTOP=["huy.nguyen@cubework.com"],CC_NAMES_LAPTOP=["Huy Nguyen"],
FEE_TO_EMAILS=["ar@cubework365.onmicrosoft.com","novie.boston@cubework.com"],FEE_PER_KEYCARD=30,EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/,INLINE_ATTACHMENT_THRESHOLD_BYTES=3*1024*1024,SIMPLE_ATTACHMENT_MAX_BYTES=3*1024*1024,UPLOAD_CHUNK_BYTES=4*320*1024;function fmtAddr(t,e){return t?`${t} <${e}>`:e}function displayAddr(t){return t.map(e=>fmtAddr(e.name,e.email)).join(", ")}function graphRecipients(t){return t.map(e=>({emailAddress:{address:e.email,name:e.name||void 0}}))}function dedupeRecipientsAcrossFields(t,e,n){const s=new Set;function a(i){return(Array.isArray(i)?i:[]).filter(l=>{const d=String(l&&l.email||"").trim();if(!d)return!1;const h=d.toLowerCase();return s.has(h)?!1:(s.add(h),!0)})}return{toRecipients:a(t),ccRecipients:a(e),bccRecipients:a(n)}}function collectDistinctEmails(t,e){const n=new Set,s=[];return(Array.isArray(t)?t:[]).forEach(a=>{const i=String(a&&a[e]||"").trim();if(!i||!EMAIL_RE.test(i))return;const l=i.toLowerCase();n.has(l)||(n.add(l),s.push({name:null,email:i}))}),s}function distinctSubjectLabel(t,e,n){const s=String(t||"").trim();return!s||s.toLowerCase()===String(e||"").trim().toLowerCase()?n:s}function esc(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
// Multiple locations, every mode (2026-08-19 fix - was Keycard-only): given
// the request's own Location #1 body line plus whatever extra location rows
// the "+ Add location" button collected for the CURRENT mode
// (eraExtraLocationsByMode/eraCollectExtraLocationBodyLines in index.html,
// already fully per-mode isolated client-side), returns both a plain
// "Location #1: .../Location #2: ..." text block for textBody and the same
// block wrapped in %%CW_LOC_START%%/%%CW_LOC_END%% sentinels per line for
// callers to swap for a bold/red <span> in htmlBody - same technique
// buildKeycard() already used for its own (pre-existing) multi-location
// support, just factored out so every other build*() function below can
// reuse it instead of only Keycard understanding extraLocationBodyLines.
function buildLocationLines(t,e){const S="%%CW_LOC_START%%",E="%%CW_LOC_END%%",X=(Array.isArray(e)?e:[]).map(x=>String(x||"").trim()).filter(Boolean),L=X.length?[`Location #1: ${t}`].concat(X.map((x,idx)=>`Location #${idx+2}: ${x}`)):null;return{plain:L?L.join("\n"):t,marked:L?L.map(line=>`${S}${line}${E}`).join("\n"):t,START:S,END:E}}
const SIGNATURE_LABELS={keycard:"Keycard Request",wifi:"Wi-Fi Request",printer:"Printer Request",phone:"Phone Request",app:"Application / Software Request",laptop:"Laptop Request",electrical:"Electrical Request"},SIGNATURE_NOTICE="NOTICE: This message, and any attachments, contain(s) information that may be confidential or protected by privilege from disclosure and is intended only for the individual or entity named above. No one else may disclose copy, distribute, or use the contents of this message for any purpose. Its unauthorized use, dissemination, or duplication is strictly prohibited and may be unlawful. If you receive this message in error or are not an authorized recipient, please immediately delete the message and any attachments and notify the sender.";function signatureContentId(t){return`cw-signature-${t}`}const signatureBase64Cache={};function getSignatureBase64(t){if(!SIGNATURE_LABELS[t])return null;if(signatureBase64Cache[t])return signatureBase64Cache[t];try{const e=path.join(__dirname,"assets","signatures",`${t}.png`),n=fs.readFileSync(e).toString("base64");return signatureBase64Cache[t]=n,n}catch(e){return console.error(`Signature image missing/unreadable for mode "${t}":`,e.message),null}}function appendSignature(t,e,n){const s=SIGNATURE_LABELS[t];if(!s)return{body:e,htmlBody:n};const a=`

--
Best Regards,
${s}
www.Cubework.com | LinkedIn

CUBEWORK
${SIGNATURE_NOTICE}`,i=getSignatureBase64(t)?`<br><br><img src="cid:${signatureContentId(t)}" alt="${s} signature" style="max-width:100%;display:block;border:0;">`:"";return{body:e+a,htmlBody:n+i}}function companyDisplay(t){const e=String(t&&t.companyName||"").trim(),n=String(t&&t.tenantName||"").trim();return n&&n.toLowerCase()!==e.toLowerCase()?`${e} / ${n}`:e}function formatPhoneForDisplay(t){const e=String(t||"").replace(/\D/g,"");return e.length!==10?String(t||"").trim():`${e.slice(0,3)}-${e.slice(3,6)}-${e.slice(6,10)}`}function entryKeycardAction(t){return t.requestcard?"requestcard":t.troubleshoot?"troubleshoot":t.replacement?"replacement":t.transfer?"transfer":t.deactivate?"deactivate":"activate"}function isKeycardCubeworkHikTroubleshootEntry(t,e){return t.serves==="Cubework"&&!!t.hikcentral&&entryKeycardAction(e)==="troubleshoot"}
// Preview Email > current date/time under the greeting (2026-09-23, per
// Huy's request) - Pacific time, "September 23, 2026 at 8:04 AM" shaped.
// Intl.DateTimeFormat alone doesn't insert "at", so this pulls the parts and
// joins them by hand. isoString comes from the client's ONE
// submissionTimestampIso (see Se()/eraBuildKeycardPreview()/
// eraSendKeycardBatch() in public/index.html), threaded through so every
// per-card email in a multi-keycard batch - and its Preview - shows the same
// time rather than each server call's own new Date() jitter; falls back to
// "now" only for an old cached client that never sent one.
function formatSubmissionTimestamp(isoString){
  const d=isoString?new Date(isoString):new Date();
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",hour12:!0}).formatToParts(d).reduce((acc,p)=>(acc[p.type]=p.value,acc),{});
  return `${parts.month} ${parts.day}, ${parts.year} at ${parts.hour}:${parts.minute} ${(parts.dayPeriod||"").toUpperCase()}`;
}
function buildKeycard(t){const e=t.fields||{},n=[];const s=Array.isArray(e.entries)?e.entries:[];s.length||n.push("Add at least one keycard entry.");
// "Attach the signed keycard authorization form" check removed (2026-09-22,
// per Huy's request): the Keycard workflow no longer collects a signature,
// Photo ID or any attachment (the client hides that whole section and sends
// attachments:[]), so this would block every Activate request. The client
// now also sends one request per keycard (entries.length===1) - see
// eraKeycardPerCardFields() in public/index.html - but multi-entry payloads
// are still accepted here unchanged.
// "Answer whether you have the physical keycard form" check removed
// (2026-08-2x, per Huy's request) - the client-side "Do you have the
// physical keycard form?" card was permanently hidden back on 2026-08-21
// (its two client-side blocking checks were removed the same day, see
// docs/log/2026-08-21-tenantname-keycard-sameline-haveform-unblock.md) but
// this equivalent SERVER-side check in buildKeycard() was missed - since
// the radios can never be answered client-side, eraKeycardHaveFormValue()
// always sends fields.haveForm==="" for every Preview/Send, which is
// neither "yes" nor "no", so this was silently blocking every Preview and
// every real Send for any Activate/Replacement entry. Removed outright,
// same reasoning as the client-side removal.
const i=["companyName","tenantName"];if(s.forEach((o,P)=>{const E=`Entry ${P+1}: `,W=entryKeycardAction(o);if(W==="requestcard"||W==="replacement"||isKeycardCubeworkHikTroubleshootEntry(e,o)||i.forEach(_=>{String(o[_]||"").trim()||n.push(`${E}fill in every field (missing: ${_}).`)}),W==="troubleshoot"&&!String(o.issue||"").trim()&&n.push(`${E}describe the issue, or switch off Troubleshoot.`),W==="transfer"&&(String(o.transferFrom||"").trim()||n.push(`${E}enter the Transfer From location.`),String(o.transferTo||"").trim()||n.push(`${E}enter the Transfer To location.`),(Array.isArray(o.transferExtraLocations)?o.transferExtraLocations:[]).forEach((lp,idx)=>{const hf=String(lp&&lp.from||"").trim(),ht=String(lp&&lp.to||"").trim();(hf||ht)&&!(hf&&ht)&&n.push(`${E}fill in both Transfer From and Transfer To for location ${idx+2}.`)}),(Array.isArray(o.transferExtraKeycards)?o.transferExtraKeycards:[]).forEach((kc,idx)=>{if(!kc)return;const has=kc.companyName||kc.tenantName||kc.keycard;has&&(String(kc.companyName||"").trim()||n.push(`${E}enter Company Name ${idx+2}.`),String(kc.tenantName||"").trim()||n.push(`${E}enter Tenant First and Last Name ${idx+2}.`),kc.keycard&&!/^\d{10}$/.test(String(kc.keycard).trim())&&n.push(`${E}Keycard Number ${idx+2} must be exactly 10 digits.`))})),W==="replacement"&&((o.replServesCubework||o.replServesUnis)&&(o.replServesHikcentral||o.replServesUnifi)&&(String(o.replCompanyName||"").trim()||n.push(`${E}enter the company name.`),String(o.replTenantName||"").trim()||n.push(`${E}enter the tenant name.`),(Array.isArray(o.replPairs)?o.replPairs:[]).filter(p=>String(p&&p.oldKeycard||"").trim()||String(p&&p.newKeycard||"").trim()).length||n.push(`${E}add at least one Old Keycard -> New Keycard pair.`),(Array.isArray(o.replPairs)?o.replPairs:[]).forEach(p=>{(String(p&&p.oldKeycard||"").trim()&&String(p&&p.newKeycard||"").trim())||n.push(`${E}fill in both the old and new keycard number for each Old Keycard -> New Keycard pair.`)}))),W==="requestcard"){String(o.location||"").trim()||n.push(`${E}enter a location.`);const _=String(o.quantity||"").trim(),H=Number(_);(!_||!Number.isInteger(H)||H<1||H>50)&&n.push(`${E}enter a keycard quantity between 1 and 50.`),String(o.managerEmail||"").trim()?EMAIL_RE.test(o.managerEmail)||n.push(`${E}enter a valid manager email.`):n.push(`${E}enter the manager's email.`)}o.keycard&&!/^\d{10}$/.test(String(o.keycard).trim())&&n.push(`${E}keycard number must be exactly 10 digits.`),o.phone&&!/^\d{10}$/.test(String(o.phone).replace(/\D/g,""))&&n.push(`${E}tenant phone must be exactly 10 digits.`),o.email&&!EMAIL_RE.test(o.email)&&n.push(`${E}enter a valid tenant email.`),o.replPhone&&!/^\d{10}$/.test(String(o.replPhone).replace(/\D/g,""))&&n.push(`${E}tenant phone must be exactly 10 digits.`),o.replEmail&&!EMAIL_RE.test(o.replEmail)&&n.push(`${E}enter a valid tenant email.`)}),n.length)return{ok:!1,problems:n};const l=t.locationBodyLine||t.locationText,d=t.locationSubjectName||t.locationText,h=entryKeycardAction(s[0]),firstNameOf=nm=>String(nm||"").trim().split(/\s+/)[0]||"",subjCompany=h==="replacement"?(s[0].replCompanyName||""):(e.licenseeCompanyName||""),subjFirst=h==="replacement"?firstNameOf(s[0].replTenantName):firstNameOf(s[0].tenantName),u=[subjCompany,subjFirst].filter(Boolean).join(" - ")||(isKeycardCubeworkHikTroubleshootEntry(e,s[0])?"HikCentral":""),
// Transfer's own Preview Email subject (2026-09-20, per Huy's request):
// "[Start Location] - Keycard Transfer - [Tenant Company Name] - [Tenant
// First and Last Name]" - Start Location is THIS entry's own Transfer From
// field (transferLocLine() below, the same street+city helper the Transfer
// body already uses for its "Location" block), never the shared/hidden
// top-of-form Location field `d` (which stays whatever it last held, or
// blank, since that field is hidden for an all-Transfer request - see
// eraKeycardAllTransfer() in index.html) and never transferTo. Company/
// Tenant reuse the same mode-level Company Name (e.licenseeCompanyName) and
// full (not first-name-only) tenant name as the "Cubework - Company -
// Tenant - Number" line below, instead of subjCompany/subjFirst above
// (which truncate the tenant to a first name for every other action).
transferSubjName=[String(e.licenseeCompanyName||"").trim(),String(s[0].tenantName||"").trim()].filter(Boolean).join(" - "),
A=h==="requestcard"?`${d} - Request Blank Keycard (${s[0].quantity})`:h==="replacement"?`${d} - Keycard Replacement${u?` - ${u}`:""}`:h==="transfer"?`${transferLocLine(s[0].transferFrom)} - Keycard Transfer${transferSubjName?` - ${transferSubjName}`:""}`:`${d} - Keycard ${h==="deactivate"?"De-Activate":h==="troubleshoot"?"Troubleshoot":"Activate"} - ${u}`,j=[e.hikcentral?"HikCentral":null,e.unifi?"Unifi":null].filter(Boolean).join(", "),L="%%CW_LINE_START%%",S="%%CW_LINE_END%%",w="%%CW_FROMTO_START%%",b="%%CW_FROMTO_END%%",
// Troubleshoot-only bold+red wrap (2026-09-05, per Huy's request): the
// Serves/Company/Tenant/Keycard line, the "Access: >" line and the "Issue:"
// line all render bold+red in the HTML body regardless of Serves (so it
// does NOT reuse the Cubework-only green L/S pair above) - see v() below.
TRBS="%%CW_TR_START%%",TRBE="%%CW_TR_END%%",
// Transfer's own "(Existing) > (New)" location line (2026-09-06, per Huy's
// request): only the New Address half is wrapped bold+blue (same blue as
// CW_NOTES_START further down) - the Existing Address half stays in
// whatever default formatting the surrounding line already has. See
// transferPairLine()/buildTransferFlat() below and this sentinel's color
// mapping alongside CW_NOTES_START in the F transform chain further down.
TRNEWS="%%CW_TR_NEW_START%%",TRNEWE="%%CW_TR_NEW_END%%",
// Plain bold (no color) sentinel pair (2026-09-05, per Huy's request) -
// Replacement's own "Hello AR, Novie,"/"Location(s):"/"New Location(s):"/
// "Card Serves:" labels get wrapped in these (marked/html body only, never
// the plain-text body) and swapped for a plain font-weight:700 <span>
// further down, same technique as every other %%CW_*%% sentinel pair here.
BS="%%CW_BOLD_START%%",BE="%%CW_BOLD_END%%";function v(o,P){const E=entryKeycardAction(o);if(E==="requestcard"){const U=`${e.serves} - Request Blank Keycard - ${o.quantity}`;let RC=`${P?`${L}${U}${S}`:U}

Manager Email: ${o.managerEmail}`;return o.notes&&(RC+=`

Notes: ${o.notes}`),RC}if(E==="replacement"){const topServes=[o.replServesCubework?"Cubework":null,o.replServesUnis?"Unis":null].filter(Boolean),subServes=[o.replServesHikcentral?"HikCentral":null,o.replServesUnifi?"Unifi":null].filter(Boolean),servesParts=topServes.concat(subServes).join(" > "),showExtra=(o.replServesCubework||o.replServesUnis)&&(o.replServesHikcentral||o.replServesUnifi);let RP=`${P?BS:""}New Location(s):${P?BE:""}
${o.replLocation||""}`;if(showExtra){RP+=`

Company: ${o.replCompanyName||""}
Tenant: ${o.replTenantName||""}`,(o.replEmail||o.replPhone)&&(RP+=`
Email: ${o.replEmail||"(not provided)"}
Phone: ${o.replPhone?formatPhoneForDisplay(o.replPhone):"(not provided)"}`)}RP+=`

${P?BS:""}Card Serves:${P?BE:""}
${servesParts||"(none selected)"}`;if(showExtra){const pairs=(Array.isArray(o.replPairs)?o.replPairs:[]).filter(pr=>pr&&(pr.oldKeycard||pr.newKeycard));pairs.length&&(RP+=`

`+pairs.map(pr=>`Old Keycard: ${pr.oldKeycard||"?"} → New Keycard: ${pr.newKeycard||"?"}`).join(`
`))}return RP}const W=E==="deactivate"?"De-activate":E==="troubleshoot"?"Troubleshoot":E==="transfer"?"Transfer":"Activate",K=o.keycard?` - ${o.keycard}`:"",
// Per-entry "Cubework - {Licensee Company} - {Tenant Name} - ..." line
// (2026-08-21 follow-up): entry-level companyName is now just a mirror of
// tenantName (see j()'s entry template in index.html - the standalone
// Company field was hidden the same day), so companyDisplay(o) alone
// always collapsed to one name and the Licensee Company Name half of this
// line silently disappeared. Source that half from the mode-level
// "Licensee Company Name" field (e.licenseeCompanyName, era_k_licenseeCompanyName
// - already correct for the SUBJECT line via subjCompany above) instead.
licenseeCo=String(e.licenseeCompanyName||"").trim(),tenantNm=String(o.tenantName||"").trim(),
// De-activate entries collect a real per-entry Company Name (index.html's
// j() - shown on the same row as Tenant Name/Keycard Number, 2026-08-22 per
// Huy's request) rather than relying on the mode-level Licensee Company
// Name field (which stays hidden for De-activate) - prefer that per-entry
// value over licenseeCo whenever this entry is a deactivate.
companyCo=(E==="deactivate"||E==="troubleshoot")?String(o.companyName||"").trim():licenseeCo,
// Troubleshoot (2026-09-05, per Huy's request): its own per-entry Company
// Name field is visible again (index.html's j()), so - unlike the
// mirror-from-Tenant-Name fallback other actions still rely on - always
// show Company Name AND Tenant Name on this line, never collapse them into
// one just because they happen to match (falls back to the existing
// Cubework+HikCentral "HikCentral" placeholder when both are blank).
namePart=E==="troubleshoot"?([companyCo,tenantNm].filter(Boolean).join(" - ")||(isKeycardCubeworkHikTroubleshootEntry(e,o)?"HikCentral":"")):(tenantNm?(companyCo&&companyCo.toLowerCase()!==tenantNm.toLowerCase()?`${companyCo} - ${tenantNm}`:tenantNm):(isKeycardCubeworkHikTroubleshootEntry(e,o)?"HikCentral":"")),
H=namePart?` - ${namePart}`:"";let G=`${e.serves}${H}${K}`;
// De-Activate's location/details line drops the trailing " - De-activate"
// suffix (2026-09-05, per Huy's request) - Transfer still gets its
// action-name suffix appended here; De-Activate's line was already bare
// "Location - Company Name - First Last Name - Keycard Number ...", and
// Troubleshoot's line drops its own " - Troubleshoot" suffix the same way
// as of the same date (per Huy's request - see the bold+red Troubleshoot
// line format below).
E!=="activate"&&E!=="deactivate"&&E!=="troubleshoot"&&(G+=` - ${W}`);(E!=="activate"&&o.fee)&&(G+=` (extra key, $${FEE_PER_KEYCARD})`);
// Troubleshoot's Serves/Company/Tenant/Keycard line is bold+red regardless
// of Serves (2026-09-05, per Huy's request), so it skips the Cubework-only
// green L/S wrap that every other action's line gets here - the whole
// line+Access+Issue block is wrapped in TRBS/TRBE together, below.
let D=P&&E!=="troubleshoot"?`${L}${G}${S}`:G;const te=o.accessValue&&String(o.accessValue).trim()?String(o.accessValue).trim():"Standard";if(
// Access Level checkboxes are hidden client-side for De-activate entries
// (index.html's j()/i() - Access Level only makes sense for a card being
// issued/kept active, not one being turned off), but the underlying
// checkboxes still default "Standard" checked and get collected regardless
// - so the "Access:" line is skipped entirely for a deactivate entry here,
// rather than printing that unseen/unchosen default (2026-08-22, per Huy's
// request, paired with the client-side checkbox hide).
E!=="deactivate"&&E!=="troubleshoot"&&(D+=`
Access: ${te}`),
// Troubleshoot's Access line uses "Access: > ..." (2026-09-05, per Huy's
// request) - every other action keeps the plain "Access: ..." above.
E==="troubleshoot"&&(D+=`
Access: > ${te}`),E==="activate"&&(o.email||o.phone)&&(D+=`

Email: ${o.email||"(not provided)"}
Phone: ${o.phone?formatPhoneForDisplay(o.phone):"(not provided)"}`),
// Per-card Deal & Licensee + E-Signature (2026-09-22, Choose an Entry +
// multi-keycard pass): each Activate card now carries its own Yardi Deal# /
// Unit # / Floor # (index.html's .era-k-deal-wrap) and optional tenant
// E-Signature, and every card goes out as its own email - so print them on
// the card's own block. Only when present, so older/other callers that never
// send these fields get exactly the body they always did.
E==="activate"&&(o.dealYardi||o.dealUnit||o.dealFloor)&&(D+=`
Yardi Deal# / Account#: ${o.dealYardi||"(not provided)"}
Unit #: ${o.dealUnit||"(not provided)"}${o.dealFloor?`
Floor #: ${o.dealFloor}`:""}`),
E==="activate"&&o.esign===!0&&(D+=`
E-Signature: ${o.esignStatus==="signed"?"Signed by tenant":"Requested - awaiting tenant signature"}`),
// Troubleshoot's Issue line gets a blank line before it (2026-09-05, per
// Huy's request), unlike the tight single-newline every other per-entry
// line above uses.
E==="troubleshoot"&&o.issue&&(D+=`

Issue: ${o.issue}`),E==="transfer"){const locPairs=[{from:o.transferFrom,to:o.transferTo}].concat(Array.isArray(o.transferExtraLocations)?o.transferExtraLocations:[]),U=locPairs.map((lp,idx)=>`From${locPairs.length>1?` ${idx+1}`:""}: ${lp.from||""}
To${locPairs.length>1?` ${idx+1}`:""}: ${lp.to||""}`).join(`

`),extraKc=(Array.isArray(o.transferExtraKeycards)?o.transferExtraKeycards:[]).filter(k=>k&&(k.companyName||k.tenantName||k.keycard)),KC=extraKc.length?`

`+extraKc.map((k,idx)=>`Company Name ${idx+2}: ${k.companyName||""}
Tenant First and Last Name ${idx+2}: ${k.tenantName||""}
Keycard Number ${idx+2}: ${k.keycard||""}${k.fee?` (extra key, $${FEE_PER_KEYCARD})`:""}`).join(`

`):"";D+=P?`

${w}${U}${b}${KC}`:`

${U}${KC}`}
// Wrap the whole Troubleshoot line+Access+Issue block in the bold+red
// TRBS/TRBE sentinel for the HTML body only (2026-09-05, per Huy's
// request) - see TRBS/TRBE's own comment above and their color mapping in
// the F transform chain below.
E==="troubleshoot"&&P&&(D=TRBS+D+TRBE);return o.notes&&(D+=E==="deactivate"?(P?`

%%CW_NOTES_LABEL_START%%Notes:%%CW_NOTES_LABEL_END%% ${o.notes}`:`

Notes: ${o.notes}`):P&&E==="activate"?`
%%CW_NOTES_START%%Notes: ${o.notes}%%CW_NOTES_END%%`:`
Notes: ${o.notes}`),D}// Transfer-only Preview Email body (2026-09-06, per Huy's request): when
// EVERY submitted keycard entry is Transfer, the body drops the generic
// shared Location(s) block (see the gTransfer check further below) and
// instead lists every Transfer From/To location pair across every entry
// (main pair + transferExtraLocations) FIRST, then every keycard line
// (main keycard + transferExtraKeycards) after - flattened across entries
// rather than interleaved per-entry the way v() renders every other
// action, since a mixed-action batch still goes through v() as before
// (this only replaces B/C when gTransfer is true). Each keycard line is
// "Serves - Company - Tenant - Keycard" with no per-line fee annotation
// and no Access line - the Fee($30/box) charge is already summarized in
// its own line above (see feeCcTrigger/T/I/IM below, unchanged).
const gTransfer=s.length>0&&s.every(o=>entryKeycardAction(o)==="transfer");
// Flattens a free-text location string (from the "Search city, street or
// ZIP" autocomplete, public/locations.js - e.g. "218 Machlin Ct, Walnut, CA
// 91789") down to just its street address + city, dropping state/zip
// (2026-09-06, per Huy's request, Keycard > Transfer's own "Location"
// block below). Splits on comma and keeps only the first two parts; falls
// back to the whole string when there's no comma to split on.
function transferLocLine(addr){const parts=String(addr||"").split(",").map(x=>x.trim()).filter(Boolean);return parts.length>1?`${parts[0]}, ${parts[1]}`:(parts[0]||"")}
// One Transfer location pair as "(Existing Address) > (New Address)"
// (2026-09-06, per Huy's request, replacing the two separate From/To lines
// this used to print) - New Address only gets wrapped bold+blue (HTML body
// only, via TRNEWS/TRNEWE) while Existing Address is left in the line's
// existing/default formatting. Falls back to whichever single side is
// present (no " > ") when only one of the two was filled in.
function transferPairLine(from,to,wrap){const F=transferLocLine(from),T=transferLocLine(to),Tw=T&&wrap?`${TRNEWS}${T}${TRNEWE}`:T;return F&&T?`${F} > ${Tw}`:F||Tw}
// Always show Company Name AND Tenant Name (2026-09-20, per Huy's request) -
// this used to collapse to just one when they matched case-insensitively
// (same shortcut every other action's namePart still uses, since their
// entry-level companyName is only ever a mirror of tenantName - see the
// "Per-entry ... line" comment above), which is exactly backwards for
// Transfer: unlike Activate/Replacement/RequestCard, Transfer's Company
// Name field (era-k-companyName-wrap) is NOT hidden/mirrored - it's shown
// as its own genuinely distinct, directly-typed input (see the
// era-k-companyName-wrap toggle in public/index.html, shown for
// Deactivate/Troubleshoot/Transfer), so collapsing it with tenantNm
// dropped the company whenever a tester (or a real request) happened to
// enter the same text in both, e.g. "Cubework - def - 1234567890" instead
// of "Cubework - Company - Tenant - 1234567890". Mirrors Troubleshoot's own
// always-both namePart a few lines up.
function transferKcLine(serves,companyCo,tenantNm,keycard,wrap){const namePart=[companyCo,tenantNm].filter(Boolean).join(" - "),H=namePart?` - ${namePart}`:"",K=keycard?` - ${keycard}`:"",line=`${serves}${H}${K}`;return wrap?`${L}${line}${S}`:line}
// Rebuilt (2026-09-06, per Huy's request) to add a "Location" label above
// every Transfer From/To location entered (flattened across every entry,
// each pulled down to street+city via transferLocLine() above - no more
// "From > To" pairing/full addresses) and a standalone Notes block
// (o.transferNotes, the new "+Add Notes" box under Access Level) after
// EVERY keycard line, separated by one blank line and - HTML body only
// (P) - bold+red via the existing TRBS/TRBE sentinel. Neither section
// prints at all when there's nothing to show (no locations entered / no
// entry's note filled in). Fee checkbox handling is untouched - see
// feeCcTrigger/transferFeeCount above, unaffected by this function.
function buildTransferFlat(P){
  const locLines=[],kcLines=[],notesLines=[];
  s.forEach(o=>{
    [{from:o.transferFrom,to:o.transferTo}].concat(Array.isArray(o.transferExtraLocations)?o.transferExtraLocations:[]).forEach(lp=>{
      if(!lp)return;
      const line=transferPairLine(lp.from,lp.to,P);
      line&&locLines.push(line);
    });
    // Line 1's own Company Name field (o.companyName, era-k-companyName)
    // was being ignored here in favor of the unrelated mode-level "Deal &
    // Licensee" card's Company Name (e.licenseeCompanyName, era_k_
    // licenseeCompanyName - only meant to pre-fill the Keycard Form PDF) -
    // 2026-09-21 bug report: a real Transfer submission with Company Name
    // filled in showed just "Cubework - <tenant> - <keycard>" with no
    // company, because that PDF field was (correctly) left blank. Extra
    // keycard groups never had this bug - they already read their own
    // k.companyName at the forEach below.
    kcLines.push(transferKcLine(e.serves,String(o.companyName||"").trim(),String(o.tenantName||"").trim(),o.keycard,P));
    (Array.isArray(o.transferExtraKeycards)?o.transferExtraKeycards:[]).forEach(k=>{
      k&&(k.companyName||k.tenantName||k.keycard)&&kcLines.push(transferKcLine(e.serves,k.companyName,k.tenantName,k.keycard,P));
    });
    o.transferNotes&&notesLines.push(String(o.transferNotes));
  });
  const locBlock=locLines.length?"Location\n"+locLines.join("\n"):"",kcBlock=kcLines.join("\n"),notesText=notesLines.join("\n"),notesBlock=notesText?`\n\n${P?TRBS:""}${notesText}${P?TRBE:""}`:"";
  return locBlock+(locBlock&&kcBlock?"\n\n":"")+kcBlock+notesBlock;
}
const B=gTransfer?buildTransferFlat(!1):s.map(o=>v(o,!1)).join(`

`),C=gTransfer?buildTransferFlat(!0):s.map(o=>v(o,!0)).join(`

`),k=`Systems: ${j}`,R=s.map(entryKeycardAction),c=R.every(o=>o==="deactivate"),f=R.every(o=>o==="activate"),r=R.every(o=>o==="troubleshoot"),g=R.every(o=>o==="transfer"),p=R.every(o=>o==="requestcard"),rp=R.every(o=>o==="replacement"),q=f?"Please activate the keycard(s).":c?"Please De-activate the keycard(s).":r?"Please help troubleshoot the keycard(s) below.":g?"Please transfer the keycard(s) below.":p?"Please process the keycard request(s) below.":rp?"Please process the keycard replacement(s) below.":"Please see each entry below for the requested action (activate/de-activate/replacement/troubleshoot/transfer/request card).",qM=f?`%%CW_GREET_START%%${q}%%CW_GREET_END%%`:c?`%%CW_GREET_RED_START%%${q}%%CW_GREET_RED_END%%`:gTransfer?`%%CW_GREET_RED_START%%${q}%%CW_GREET_RED_END%%`:rp?`%%CW_GREET_RED_START%%${q}%%CW_GREET_RED_END%%`:
// Troubleshoot's own greeting line is bold+red too (2026-09-05, per Huy's
// request), same GREET_RED sentinel De-Activate/Replacement already use -
// only applies when every entry is Troubleshoot, same "all-one-action"
// gating the other greeting variants above already use.
r?`%%CW_GREET_RED_START%%${q}%%CW_GREET_RED_END%%`:q,m=[],$={};let feeCcTrigger=!1;s.forEach(o=>{const isRepl=entryKeycardAction(o)==="replacement",pairsArr=Array.isArray(o.replPairs)?o.replPairs:[],replPairFee=isRepl&&pairsArr.some(pr=>pr&&pr.fee),
// Transfer's own per-keycard-line Fee (2026-09-06, per Huy's request:
// "every keycard line must include a Fee checkbox") - mirrors Replacement's
// per-pair fee just above: line 1's fee is still the plain o.fee boolean
// (unchanged), each additional keycard line (transferExtraKeycards[].fee)
// counts as its own extra $30, both summed into one per-entry total so the
// AR/Novie CC-billing note below charges $30 per checked Fee box instead of
// one flat $30 for the whole Transfer entry.
isTransfer=entryKeycardAction(o)==="transfer",transferExtraFeeCount=isTransfer?(Array.isArray(o.transferExtraKeycards)?o.transferExtraKeycards:[]).filter(k=>k&&k.fee&&(k.companyName||k.tenantName||k.keycard)).length:0,transferFeeCount=isTransfer?(o.fee?1:0)+transferExtraFeeCount:0;
// Replacement is no longer auto-fee'd as a whole entry (2026-08-22, per
// Huy's request) - the CC to AR/Novie now triggers per-pair (any pair's
// own Fee checkbox).
// 2026-08-22 follow-up (per Huy's request, "Fee checkbox determines if AR
// and Novie is attached"): the $30-per-pair billing-note line below used to
// still count EVERY complete pair regardless of that pair's own Fee
// checkbox, so a Replacement entry with no Fee checked at all still printed
// "@Novie and @AR - Please charge..." in the Preview even though neither
// address was actually CC'd. Now both the CC trigger and the billing-note
// line key off the same fee/replPairFee condition, and the note only counts
// the pairs whose own Fee checkbox is checked.
(o.fee||replPairFee||transferFeeCount>0)&&(feeCcTrigger=!0);if(!(o.fee||replPairFee||transferFeeCount>0))return;const P=o.companyName||o.replCompanyName||o.replLocation||"(company not given)",cnt=isRepl?pairsArr.filter(pr=>pr&&pr.fee&&(pr.oldKeycard||pr.newKeycard)).length:(isTransfer?transferFeeCount:1);if(!cnt)return;P in $||($[P]=0,m.push(P)),$[P]+=cnt});const T=m.map(o=>`@Novie and @AR - Please charge ($${$[o]*FEE_PER_KEYCARD} per Fee boxes checked) to ${o} account.`),replFeeCount=rp?s.reduce((sum,o)=>sum+(Array.isArray(o.replPairs)?o.replPairs:[]).filter(pr=>pr&&pr.fee&&(pr.oldKeycard||pr.newKeycard)).length,0):0,I=rp?(replFeeCount>0?`

Hello AR, Novie,
Please charge the extra Fee(s) ($${FEE_PER_KEYCARD} per checked Fee box). Total: $${replFeeCount*FEE_PER_KEYCARD}`:""):(T.length?`

${T.join(`
`)}`:""),
// Bold-only variant of I for the HTML body (2026-09-05, per Huy's request)
// - wraps just the "Hello AR, Novie," greeting line of the Replacement fee
// note in the BS/BE sentinel pair (swapped for a plain bold <span> in F
// below); the non-replacement "@Novie and @AR - ..." fee note (T) is
// untouched, and the plain-text body (J, which still uses I) is untouched.
IM=rp&&replFeeCount>0?`

${BS}Hello AR, Novie,${BE}
Please charge the extra Fee(s) ($${FEE_PER_KEYCARD} per checked Fee box). Total: $${replFeeCount*FEE_PER_KEYCARD}`:I,x="https://cubework365.sharepoint.com/:v:/s/Cubework_PropertyManagement/IQCvNT-3osupSoNyJUtJpUj6AW7GFpHOtwQl5cYh3fscmWg?e=6J2tU1",O=`How to add Tenant to Unifi: ${x}
Or you can call/msg Huy.`,z=`<a href="${x}">How to add Tenant to Unifi</a> or you can call/msg Huy.`,LOC_START="%%CW_LOC_START%%",LOC_END="%%CW_LOC_END%%",EXTRA_LOCS=(Array.isArray(t.extraLocationBodyLines)?t.extraLocationBodyLines:[]).map(x=>String(x||"").trim()).filter(Boolean),LOC_LINES=EXTRA_LOCS.length?[`Location #1: ${l}`].concat(EXTRA_LOCS.map((loc,idx)=>`Location #${idx+2}: ${loc}`)):null,LOC_PLAIN=`Location(s):
`+(LOC_LINES?LOC_LINES.join("\n"):l),LOC_MARKED=`${BS}Location(s):${BE}
`+(LOC_LINES?LOC_LINES.map(line=>`${LOC_START}${line}${LOC_END}`).join("\n"):l),
// Current date/time, own line directly under the greeting, before the
// AR/Novie fee note (I/IM) - same submission timestamp for every card of a
// multi-keycard batch, see formatSubmissionTimestamp() above.
TS=`
${formatSubmissionTimestamp(t.submissionTimestampIso)}`,
J=`Hello Team,

`+q+TS+I+`

`+(gTransfer?"":LOC_PLAIN+`

`)+(rp?"":k+`

`)+B+(e.unifi?`

${O}`:""),M=`Hello Team,

`+qM+TS+IM+`

`+(gTransfer?"":LOC_MARKED+`

`)+(rp?"":k+`

`)+C+(e.unifi?`

${O}`:""),V=e.unifi?M.slice(0,M.length-O.length):M;let F=esc(V).replace(/\n/g,"<br>");F=e.serves==="Cubework"?F.split(L).join('<span style="color:#1a7f37;font-weight:700;">').split(S).join("</span>"):F.split(L).join("").split(S).join(""),F=F.split(w).join('<span style="color:#dc2626;font-weight:700;">').split(b).join("</span>"),F=F.split(LOC_START).join('<span style="color:#dc2626;font-weight:700;">').split(LOC_END).join("</span>"),F=F.split("%%CW_GREET_START%%").join('<span style="color:#1a7f37;font-weight:700;">').split("%%CW_GREET_END%%").join("</span>"),F=F.split("%%CW_NOTES_START%%").join('<span style="color:#1d4ed8;font-weight:700;">').split("%%CW_NOTES_END%%").join("</span>"),
// Transfer's New Address half only (2026-09-06, per Huy's request) - see
// TRNEWS/TRNEWE's declaration comment above and transferPairLine().
F=F.split(TRNEWS).join('<span style="color:#1d4ed8;font-weight:700;">').split(TRNEWE).join("</span>"),
// Plain bold (no color) labels for Replacement (2026-09-05, per Huy's
// request): "Hello AR, Novie,"/"Location(s):"/"New Location(s):"/
// "Card Serves:" - see BS/BE above.
F=F.split(BS).join('<span style="font-weight:700;">').split(BE).join("</span>"),
// De-Activate-only red/bold markers (2026-09-05, per Huy's request): the
// greeting sentence uses the same red as the FROM/TO and Location red-bold
// spans above (#dc2626); the Notes: label gets its own marker pair so only
// the word "Notes:" turns red/bold, not the note text after it.
F=F.split("%%CW_GREET_RED_START%%").join('<span style="color:#dc2626;font-weight:700;">').split("%%CW_GREET_RED_END%%").join("</span>"),F=F.split("%%CW_NOTES_LABEL_START%%").join('<span style="color:#dc2626;font-weight:700;">').split("%%CW_NOTES_LABEL_END%%").join("</span>"),
// Troubleshoot's own bold+red block (2026-09-05, per Huy's request) - see
// TRBS/TRBE's declaration comment above and where v() wraps them around
// the Serves/Company/Tenant/Keycard+Access+Issue block.
F=F.split(TRBS).join('<span style="color:#dc2626;font-weight:700;">').split(TRBE).join("</span>"),F+=e.unifi?z:"";const Q=[{name:TO_NAME,email:TO_EMAIL}],X=[{name:null,email:CC_EMAIL_KEYCARD},{name:null,email:t.requesterEmail}],Z=collectDistinctEmails(s.filter(o=>entryKeycardAction(o)==="requestcard"),"managerEmail"),FEE_CC=feeCcTrigger?FEE_TO_EMAILS.map(o=>({name:null,email:o})):[],ee=X.concat(Z).concat(FEE_CC),Y=appendSignature(t.mode,J,F);return{ok:!0,subject:A,textBody:Y.body,htmlBody:Y.htmlBody,toRecipients:Q,ccRecipients:ee,mode:t.mode}}function buildWifi(t){const e=t.fields||{},n=[];e.serves?e.serves==="Unis"&&n.push("Send an email to helpdesk and request Network Team to Create/Troubleshoot/De-activate for the request."):n.push("Select who this Wi-Fi request serves (Cubework or Unis).");const s=Array.isArray(e.entries)?e.entries:[];s.length||n.push("Add at least one Wi-Fi entry.");const a=p=>!!e.create&&p.type==="Office"&&!!p.freeWifi&&!p.paidWifi,i=!!e.create&&s.length>0&&s.every(a);if(s.forEach((p,q)=>{const m=`Entry ${q+1}: `;(e.troubleshoot||a(p)?[]:["companyName","unit"]).forEach(I=>{String(p[I]||"").trim()||n.push(`${m}fill in every field (missing: ${I}).`)}),!e.troubleshoot&&!e.deactivate&&!p.type&&n.push(`${m}select Office or Warehouse.`),p.email&&!EMAIL_RE.test(p.email)&&n.push(`${m}enter a valid email.`)}),n.length)return{ok:!1,problems:n};const l=t.locationBodyLine||t.locationText,LOC=buildLocationLines(l,t.extraLocationBodyLines),d=t.locationSubjectName||t.locationText,h=s[0].companyName||(a(s[0])?"Free Wi-Fi SSID":""),u=e.create?"Create":e.deactivate?"De-activate":e.troubleshoot?"Troubleshoot":"Create",y=`${d} - WiFi ${u}${h?` - ${h}`:""}`,A=[e.create?"Create Wi-Fi":null,e.troubleshoot?"Troubleshoot":null,e.deactivate?"De-activate Wi-Fi":null].filter(Boolean).join(", "),L=s.map(p=>{const q=[companyDisplay(p),p.unit].filter(Boolean).join(" - ")||(a(p)?"Free Wi-Fi SSID handoff (no ticket needed - tenant given the SSID directly)":"(no company/unit given)");let m;if(e.deactivate)m=q;else{const $=[];p.type&&$.push(p.type),p.freeWifi&&$.push("Free Wi-Fi: Yes"),p.paidWifi&&$.push("Paid Wi-Fi: Yes"),p.email&&$.push(`Email: ${p.email}`),p.phone&&$.push(`Phone: ${formatPhoneForDisplay(p.phone)}`),m=q+($.length?`
${$.join(`
`)}`:"")}return p.notes&&(m+=`
Notes: ${p.notes}`),m}).join(`

`);let S="";e.serves&&(S+=`Serves: ${e.serves}
`),A&&(S+=`Request: ${A}
`);const w=!!e.create,b=!!e.deactivate,v=!!e.troubleshoot,N=w?"Please activate Wi-Fi:":b?"Please de-activate Wi-Fi:":v?"Please help troubleshoot Wi-Fi:":"Please activate Wi-Fi:",B=`SSID - Cubework is free for the office. (Even in the WH as long as Cubework build the office there.)
Everywhere else need the signed Contract or Addendum showing WiFi +$ on there monthly.`;let C=`Hello Team,

`+(w&&!i?`REQUEST WILL BE IGNORED WITHOUT MANDATORY SIGNED DOCUMENT CONTRACT OR ADDENDUM

`:"")+N+`

`+LOC.plain+`
`+S+`
`+L;w&&!i&&(C+=`

${B}`);let Cm=`Hello Team,

`+(w&&!i?`REQUEST WILL BE IGNORED WITHOUT MANDATORY SIGNED DOCUMENT CONTRACT OR ADDENDUM

`:"")+N+`

`+LOC.marked+`
`+S+`
`+L;w&&!i&&(Cm+=`

${B}`);const k="REQUEST WILL BE IGNORED WITHOUT MANDATORY SIGNED DOCUMENT ",R="CONTRACT OR ADDENDUM";let c=esc(Cm).replace(k+R,`<span style="color:#dc2626;font-weight:600;font-size:14px;">${k}</span><span style="color:#dc2626;font-weight:bold;font-size:20px;">${R}</span>`).replace(/Notes: ([^\n]*)/g,'<span style="color:#dc2626;font-weight:bold;">Notes: $1</span>').replace(/\n/g,"<br>");c=c.split(LOC.START).join('<span style="color:#dc2626;font-weight:700;">').split(LOC.END).join("</span>");const f=CC_EMAILS_GENERAL.map((p,q)=>({name:CC_NAMES_GENERAL[q],email:p})).concat([{name:null,email:t.requesterEmail}]),r=[{name:TO_NAME,email:TO_EMAIL}],g=appendSignature(t.mode,C,c);return{ok:!0,subject:y,textBody:g.body,htmlBody:g.htmlBody,toRecipients:r,ccRecipients:f,mode:t.mode}}const GENERIC_CONFIG={printer:{fieldLabel:"Printer Model",subjectSuffix:"Printer Request",subjectModeLabel:"Printer",createLabel:"Setup New Printer",greetingSetup:"Please set up printer:",greetingTroubleshoot:"Please help troubleshoot printer:",hasServes:!0,relaxTroubleshoot:!0,managerEmailField:"managerEmail"},app:{fieldLabel:"Application Name",subjectSuffix:"Application/Software Request",subjectModeLabel:"App/Soft/Hardware",createLabel:"New Install / Access",greetingSetup:"Please set up application/software:",greetingTroubleshoot:"Please help troubleshoot application/software:",hasServes:!1,relaxTroubleshoot:!1,emailOptional:!0,emailLabel:"Manager's Email",managerEmailField:"email"},laptop:{fieldLabel:"Laptop Model / Asset Tag",subjectSuffix:"Laptop Request",subjectModeLabel:"Laptop",createLabel:"New Laptop",greetingSetup:"Please set up laptop:",greetingTroubleshoot:"Please help troubleshoot laptop:",hasServes:!1,relaxTroubleshoot:!1,
// Laptop-only Cc override (2026-09-10, per Huy's request) - this is the
// Unis-serves branch of Laptop (buildLaptop() routes Unis through this
// shared buildGeneric() path, Cubework through buildLaptopCubework() below,
// which gets the same fix directly); every other GENERIC_CONFIG mode leaves
// ccEmails/ccNames undefined and falls back to CC_EMAILS_GENERAL, unchanged.
ccEmails:CC_EMAILS_LAPTOP,ccNames:CC_NAMES_LAPTOP},
// Electrical (2026-09-08/09, per Huy's request, task 2) - mirrors Printer's
// shape (relaxTroubleshoot:true, same as Printer, not false like App/
// Laptop): zero required entry fields once Troubleshoot is ticked (Create/
// De-activate keep their own requirements). No hasServes here - the
// client's era_el_serves_cubework/unis pair is a plain reflected readout
// like Wi-Fi's, not a Cubework/Tenant split gate the way Printer's own
// hasServes flag drives - Electrical's fields object never carries
// cubework/tenant/newreplace, so hasServes stays false/undefined here, same
// as Wi-Fi (which is bespoke and never routes through this table at all,
// but shares the same "no cubework/tenant split" shape as Electrical).
electrical:{fieldLabel:"Equipment/Location",subjectSuffix:"Electrical Request",subjectModeLabel:"Electrical",createLabel:"Create",greetingSetup:"Please set up electrical:",greetingTroubleshoot:"Please help troubleshoot electrical:",hasServes:!1,relaxTroubleshoot:!0,
// hasPlainServes/hasDeactivateToggle (2026-09-09, Electrical only): unlike
// Printer's boolean Cubework/Tenant split (n.hasServes/s.cubework/s.tenant)
// or App/Laptop's total absence of a De-activate flow, Electrical's Serves
// is a plain "Cubework"/"Unis" string (mirrors Wi-Fi's own e.serves shape)
// and it also has a De-activate checkbox alongside Create/Troubleshoot
// (also mirrors Wi-Fi). Both flags are additive-only in buildGeneric()
// below - false/undefined for every other mode, so printer/app/laptop are
// byte-identical to before this change.
hasPlainServes:!0,hasDeactivateToggle:!0,
// contactOptional (2026-09-09, Electrical bugfix): the client's own R
// config for electrical sets contactRequired:false (same as Wi-Fi's own
// bespoke shape - see docs/email-request-attachments-embed-tab.md, "Email/
// Phone unconditionally optional"), so the entry form never marks Email or
// Phone as required and nothing stops Submit with them blank. buildGeneric's
// required-field ternary below had no branch for "email AND phone both
// optional" - only emailOptional ("phone still required") existed, so an
// Electrical entry with everything the UI actually asked for filled in
// (Company/Unit/Equipment-Location/Office-or-Warehouse) still failed
// server-side validation with "missing: email"/"missing: phone", which is
// the bug reported ("Electrical Submission has an error"). This flag adds
// the missing branch; every other GENERIC_CONFIG mode leaves it undefined/
// falsy, so printer/app/laptop validation is unchanged.
contactOptional:!0}};function buildGeneric(t,e){const n=GENERIC_CONFIG[t],s=e.fields||{},a=[],i=Array.isArray(s.entries)?s.entries:[];i.length||a.push(`Add at least one ${n.subjectSuffix.replace(" Request","").toLowerCase()} entry.`);
// Electrical only (n.hasPlainServes) - plain "Cubework"/"Unis" Serves
// string (mirrors Wi-Fi's own e.serves), validated the same way buildWifi()
// validates it, before anything else below runs.
n.hasPlainServes&&!s.serves&&a.push(`Select who this ${n.subjectSuffix.replace(" Request","")} request serves (Cubework or Unis).`);
const l=n.hasServes&&!!s.cubework&&!!s.newreplace,d=n.hasServes&&!!s.cubework&&!!s.create&&!l,h=n.hasServes&&!!s.tenant&&!s.cubework&&!!s.troubleshoot,
// Electrical only (n.hasDeactivateToggle) - De-activate relaxes required
// entry fields the same way Troubleshoot already does via relaxTroubleshoot
// (u below); every other mode's hasDeactivateToggle is undefined so this
// term is always false for them, unchanged.
isDeactivate=!!(n.hasDeactivateToggle&&s.deactivate),
u=((n.relaxTroubleshoot&&s.troubleshoot)||isDeactivate)&&!h;if(i.forEach((m,$)=>{const T=`Entry ${$+1}: `;u||((l?["extra"]:d?["companyName","extra"]:h?["companyName","unit","extra","phone"]:n.contactOptional?["companyName","unit","extra"]:n.emailOptional?["companyName","unit","extra","phone"]:["companyName","unit","extra","email","phone"]).forEach(x=>{if(!String(m[x]||"").trim()){const O=x==="extra"?n.fieldLabel:x;a.push(`${T}fill in every field (missing: ${O}).`)}}),m.type||a.push(`${T}select Office or Warehouse.`),l&&(String(m.managerEmail||"").trim()?EMAIL_RE.test(m.managerEmail)||a.push(`${T}enter a valid manager email.`):a.push(`${T}enter the reporting manager's email.`))),m.email&&!EMAIL_RE.test(m.email)&&a.push(`${T}enter a valid email.`)}),s.troubleshoot&&!h&&!String(s.issue||"").trim()&&a.push("Describe the issue, or untick Troubleshoot."),h&&(!Array.isArray(e.attachments)||e.attachments.length===0)&&a.push("Attach a photo or document for this Printer Troubleshoot request before submitting."),(t==="printer"||t==="laptop"?!1:a.length))return{ok:!1,problems:a};const y=e.locationBodyLine||e.locationText,LOC=buildLocationLines(y,e.extraLocationBodyLines),A=e.locationSubjectName||e.locationText,j=i[0].companyName||i[0].extra||n.fieldLabel,L=n.hasServes&&s.newreplace?"New/Replace Printer Request":s.create?n.createLabel:s.troubleshoot?"Troubleshoot":isDeactivate?"De-activate":n.createLabel,S=`${A} - ${n.subjectModeLabel} ${L} - ${j}`,w=[s.create?n.createLabel:null,s.troubleshoot?"Troubleshoot":null,s.newreplace?"New/Replace Printer Request":null,isDeactivate?"De-activate":null].filter(Boolean).join(", "),b=n.hasPlainServes?(s.serves||""):n.hasServes?[s.cubework?"Cubework":null,s.tenant?"Tenant":null].filter(Boolean).join(", "):"",N=i.map(m=>{const $=[companyDisplay(m),m.unit,m.extra].filter(Boolean),T=[];m.type&&T.push(m.type),m.email&&T.push(`${n.emailLabel||"Email"}: ${m.email}`),m.phone&&T.push(`Phone: ${formatPhoneForDisplay(m.phone)}`),m.sbn&&T.push(`Laptop SBN#: ${m.sbn}`),m.managerEmail&&T.push(`Report to Manager: ${m.managerEmail}`),m.paidWifi&&T.push("Paid Wi-Fi: Yes");let I=($.join(" - ")||"(no company/unit given)")+(T.length?`
${T.join(`
`)}`:"");return m.notes&&(I+=`
Notes: ${m.notes}`),I}).join(`

`);let B="";b&&(B+=`Serves: ${b}
`),w&&(B+=`Request: ${w}
`),s.troubleshoot&&s.issue&&(B+=`Issue: ${s.issue}
`);const C=!!s.create,k=!!s.troubleshoot,c=`Hello Team,

${C||!k?n.greetingSetup:n.greetingTroubleshoot}

${LOC.plain}
${B}
${N}`,cm=`Hello Team,

${C||!k?n.greetingSetup:n.greetingTroubleshoot}

${LOC.marked}
${B}
${N}`;let f=esc(cm).replace(/\n/g,"<br>");f=f.split(LOC.START).join('<span style="color:#dc2626;font-weight:700;">').split(LOC.END).join("</span>");const r=n.managerEmailField?collectDistinctEmails(i,n.managerEmailField):[],
// ccEmails/ccNames override (2026-09-10, per Huy's request) - see
// GENERIC_CONFIG.laptop's own comment; every other mode leaves these
// undefined and falls back to CC_EMAILS_GENERAL, byte-identical to before.
ccE=n.ccEmails||CC_EMAILS_GENERAL,ccN=n.ccNames||CC_NAMES_GENERAL,
g=ccE.map((m,$)=>({name:ccN[$],email:m})).concat([{name:null,email:e.requesterEmail}]).concat(r),p=[{name:TO_NAME,email:TO_EMAIL}],q=appendSignature(t,c,f);return{ok:!0,subject:S,textBody:q.body,htmlBody:q.htmlBody,toRecipients:p,ccRecipients:g,mode:t}}function buildApp(t){const e=t.fields||{};return!e.create&&!e.troubleshoot&&!e.hardware?{ok:!1,problems:["Select New Install / Access, Troubleshoot, or Hardware Request."]}:e.hardware?buildAppHardware(t):buildGeneric("app",t)}function buildAppHardware(t){const e=t.fields||{},n=[];e.serves||n.push("Select who this Hardware Request serves (Cubework or Unis).");const s=Array.isArray(e.entries)?e.entries:[];if(s.length||n.push("Add at least one hardware request entry."),s.forEach((b,v)=>{const N=`Entry ${v+1}: `;String(b.location||"").trim()||n.push(`${N}enter a location.`),String(b.description||"").trim()||n.push(`${N}describe the hardware request.`),String(b.managerEmail||"").trim()?EMAIL_RE.test(b.managerEmail)||n.push(`${N}enter a valid manager email.`):n.push(`${N}enter the manager's email.`)}),n.length)return{ok:!1,problems:n};const a=t.locationBodyLine||t.locationText,LOC=buildLocationLines(a,t.extraLocationBodyLines),i=t.locationSubjectName||t.locationText,l=distinctSubjectLabel(s[0].location,i,""),d=`${i} - App/Soft/Hardware Hardware Request${l?` - ${l}`:""}`,u=s.map(b=>`${b.location}
${b.description}
Manager Email: ${b.managerEmail}`).join(`

`),y=`Serves: ${e.serves}
Request: Hardware Request
`,A=`Hello Team,

Please see the hardware request(s) below.

${LOC.plain}
${y}
${u}`,Am=`Hello Team,

Please see the hardware request(s) below.

${LOC.marked}
${y}
${u}`;let j=esc(Am).replace(/\n/g,"<br>");j=j.split(LOC.START).join('<span style="color:#dc2626;font-weight:700;">').split(LOC.END).join("</span>");const L=CC_EMAILS_GENERAL.map((b,v)=>({name:CC_NAMES_GENERAL[v],email:b})).concat([{name:null,email:t.requesterEmail}]).concat(collectDistinctEmails(s,"managerEmail")),S=[{name:TO_NAME,email:TO_EMAIL}],w=appendSignature("app",A,j);return{ok:!0,subject:d,textBody:w.body,htmlBody:w.htmlBody,toRecipients:S,ccRecipients:L,mode:"app"}}// Per-entry Action (2026-08-21) - each phone line entry now carries its own
// action (era-ph-action-select on the client) instead of one submission-wide
// New Phone/Troubleshoot/Replacement/Activate choice - see
// docs/email-request-attachments-embed-tab.md. Replacement/Activate still
// have no field group of their own (no spec given), so those entries print
// just Location/Type/Notes, same as before this change when neither New
// Phone nor Troubleshoot was ticked.
// remove (2026-09-09, per Huy's request): the new Software tab dropdown's
// Phone > Remove pick needs somewhere real to land, same as Laptop's own
// era_lt_remove addition below - no field group of its own (falls through
// to the same "no dedicated fields" default every other unlisted action
// already gets, same as Replacement/Activate), just its own label/greeting.
const PHONE_ACTION_LABELS={create:"New Phone Line",troubleshoot:"Troubleshoot",replacement:"Replacement",activate:"Activate",remove:"Remove",accesshikcentral:"Access HikCentral",accessunifi:"Access Unifi",accessappcw:"Access App.CW.Com"};
// Phone subject line (2026-09-10, per Huy's request) - the Preview/sent
// subject needs just the street + city, no state/zip/extra text. Whatever
// address string it's fed (the shared top-of-card locationSubjectName,
// already zip-stripped e.g. "218 Machlin Ct, Walnut, CA", OR a New Phone
// Line entry's own raw Location field, which still carries the zip e.g.
// "218 Machlin Ct, Walnut, CA 91789") gets its trailing comma-separated
// segment(s) collapsed down to just street+city: split on comma, drop the
// last segment (the state, or "state zip" when zip wasn't pre-stripped),
// rejoin the rest with a plain space (not a comma) - matches the requested
// "218 Machlin Ct Walnut" shape exactly either way. A location with no
// comma at all (custom-typed text, or a one-segment catalog label like
// "PH Facility") has nothing to strip and passes through unchanged.
//
// Subject source precedence (buildPhone, below): the New Phone Line
// group's own per-entry Location field wins when filled in - it's the
// address that actually matters for that specific phone line, and is
// often the only location entered at all now that both the shared
// top-of-card field and this per-entry one are optional (2026-09-09). The
// shared field is only a fallback for when the entry itself has none.
function locationWithoutState(s){const str=String(s||"").trim();if(!str)return str;const parts=str.split(",").map(p=>p.trim()).filter(Boolean);return parts.length>1?parts.slice(0,-1).join(" "):parts.join(" ")}
function buildPhone(t){const e=t.fields||{},n=[];const s=Array.isArray(e.entries)?e.entries:[];s.length||n.push("Add at least one phone line entry.");s.forEach((c,f)=>{const r=`Entry ${f+1}: `,act=PHONE_ACTION_LABELS[c.action]?c.action:"create";c.action=act,act!=="create"&&(String(c.location||"").trim()||n.push(`${r}enter a location.`)),act==="create"&&String(c.managerEmail||"").trim()&&!EMAIL_RE.test(c.managerEmail)&&n.push(`${r}enter a valid manager email.`),act==="troubleshoot"&&(String(c.userFirstName||"").trim()||n.push(`${r}enter the user's first name.`),String(c.userLastName||"").trim()||n.push(`${r}enter the user's last name.`),String(c.issue||"").trim()||n.push(`${r}describe the issue.`),c.userPhone&&!/^\d{10}$/.test(String(c.userPhone).replace(/\D/g,""))&&n.push(`${r}user's phone must be exactly 10 digits.`))});if(!1)return{ok:!1,problems:n};const h=t.locationBodyLine||t.locationText,LOC=buildLocationLines(h,t.extraLocationBodyLines),u=t.locationSubjectName||t.locationText,first=s[0],y=first.action==="create"?String(first.personName||"").trim():first.action==="troubleshoot"?`${first.userFirstName} ${first.userLastName}`.trim():"",j=[locationWithoutState(String(first.location||"").trim()||u),PHONE_ACTION_LABELS[first.action],first.action==="create"?String(first.title||"").trim():"",y].filter(p=>p&&String(p).trim()).join(" - "),actionsPresent=[...new Set(s.map(c=>c.action))],L=actionsPresent.map(a=>PHONE_ACTION_LABELS[a]).join(", "),S=(e.serves?`Serves: ${e.serves}
`:"")+(L?`Request: ${L}
`:""),b=s.map(c=>{const f=[`Type: ${PHONE_ACTION_LABELS[c.action]}`];if(c.location&&f.push(`Location: ${c.location}`),c.action==="create"){const r=[c.tempAgent?"Temp Agent":null,c.directHire?"Direct Hire":null].filter(Boolean).join(", ");c.personName&&f.push(`Person: ${c.personName}`),c.title&&f.push(`Title: ${c.title}`),c.employeeId&&f.push(`Employee ID: ${c.employeeId}`),r&&f.push(`Employment: ${r}`),c.responsibilities&&f.push(`Responsibilities: ${c.responsibilities}`),c.managerEmail&&f.push(`Report to Manager: ${c.managerEmail}`)}return c.action==="troubleshoot"&&(c.phoneTag&&f.push(`Phone Tag: ${c.phoneTag}`),f.push(`User: ${c.userFirstName} ${c.userLastName}`.trim()),c.userPhone&&f.push(`User Phone: ${formatPhoneForDisplay(c.userPhone)}`),f.push(`Issue: ${c.issue}`)),c.notes&&f.push(`Notes: ${c.notes}`),f.join(`
`)}).join(`

`),greeting=actionsPresent.length>1?"Please process the phone request(s) below:":{create:"Please set up phone:",troubleshoot:"Please help troubleshoot phone:",replacement:"Please process the phone replacement(s) below:",activate:"Please activate the phone line(s) below:",remove:"Please remove the phone line(s) below:",accesshikcentral:"Please set up HikCentral access for the phone line(s) below:",accessunifi:"Please set up Unifi access for the phone line(s) below:",accessappcw:"Please set up App.CW.Com access for the phone line(s) below:"}[actionsPresent[0]]||"Please process the phone request below:",N=`Hello Team,

${greeting}

${LOC.plain}
${S}
${b}`,Nm=`Hello Team,

${actionsPresent.length===1&&actionsPresent[0]==="create"?`%%CW_PH_START%%${greeting}%%CW_PH_END%%`:greeting}

${LOC.marked}
${S}
${b}`;let B=esc(Nm).replace(/\n/g,"<br>");B=B.split(LOC.START).join('<span style="color:#dc2626;font-weight:700;">').split(LOC.END).join("</span>").split("%%CW_PH_START%%").join('<span style="color:#dc2626;font-weight:700;">').split("%%CW_PH_END%%").join("</span>");const C=CC_EMAILS_PHONE.map((c,f)=>({name:CC_NAMES_PHONE[f],email:c})).concat([{name:null,email:t.requesterEmail}]).concat(collectDistinctEmails(s,"managerEmail")),k=[{name:TO_NAME,email:TO_EMAIL}].concat(TO_EMAILS_PHONE_UNISCO.map(c=>({name:null,email:c}))),R=appendSignature("phone",N,B);return{ok:!0,subject:j,textBody:R.body,htmlBody:R.htmlBody,toRecipients:k,ccRecipients:C,mode:"phone"}}function buildLaptop(t){return(t.fields||{}).serves==="Unis"?buildGeneric("laptop",t):buildLaptopCubework(t)}function buildLaptopCubework(t){const e=t.fields||{},n=[];e.serves||n.push("Select who this Laptop request serves (Cubework or Unis).");const s=Array.isArray(e.entries)?e.entries:[];s.length||n.push("Add at least one laptop entry.");const a=!!e.create,i=!!e.troubleshoot,
// rem (2026-09-09, per Huy's request): Remove is a third mutually-exclusive
// pick alongside New Laptop/Troubleshoot (era_lt_remove on the client) -
// same "no extra required fields" minimal shape Phone's own Replacement/
// Activate/Remove actions already use, so no new validation branch is
// needed below - only the subject/Request line/greeting need a rem case.
rem=!!e.remove,
// ah/au/aa (2026-09-21, per Huy's request): Access HikCentral/Unifi/
// App.CW.Com are a 4th/5th/6th mutually-exclusive pick alongside New
// Laptop/Troubleshoot/Remove (era_lt_accessHikcentral/accessUnifi/accessAppcw
// on the client) - same "no extra required fields" minimal shape Remove
// already uses, so no new validation branch is needed below either - only
// the subject/Request line/greeting need a case for each.
ah=!!e.accessHikcentral,au=!!e.accessUnifi,aa=!!e.accessAppcw;if(s.forEach((r,g)=>{const p=`Entry ${g+1}: `;String(r.location||"").trim()||n.push(`${p}enter a location.`),String(r.employeeName||"").trim()||n.push(`${p}enter the employee name.`),a&&(String(r.jobTitle||"").trim()||n.push(`${p}select a job title.`),String(r.managerEmail||"").trim()?EMAIL_RE.test(r.managerEmail)||n.push(`${p}enter a valid manager email.`):n.push(`${p}enter the reporting manager's email.`)),r.email&&!EMAIL_RE.test(r.email)&&n.push(`${p}enter a valid email.`)}),i&&!String(e.issue||"").trim()&&n.push("Describe the issue, or untick Troubleshoot."),a&&(!Array.isArray(t.attachments)||t.attachments.length===0)&&n.push("Attach the IT Form for this Laptop request before submitting."),!1)return{ok:!1,problems:n};const l=t.locationBodyLine||t.locationText,LOC=buildLocationLines(l,t.extraLocationBodyLines),
// Laptop subject line (2026-09-10, per Huy's request) - same bug/fix as
// Phone's own subject (see locationWithoutState()/buildPhone() above):
// pull Location from the entry's own per-entry field first (falls back to
// the shared top-of-card location when the entry has none), strip it down
// to street+city only, and include the entry's Job Title (New Laptop only,
// mirrors Phone's Title-on-create-only rule) so the subject reads
// "<street+city> - <Request> - <Title> - <Employee Name>" - e.g.
// "218 Machlin Ct Walnut - New Laptop - Property Management - Baby Boo".
LAPTOP_ACTION_LABEL=a?"New Laptop":i?"Troubleshoot":rem?"Remove":ah?"Access HikCentral":au?"Access Unifi":aa?"Access App.CW.Com":"New Laptop",
u=[locationWithoutState(String(s[0].location||"").trim()||(t.locationSubjectName||t.locationText)),LAPTOP_ACTION_LABEL,a?String(s[0].jobTitle||"").trim():"",s[0].employeeName].filter(p=>p&&String(p).trim()).join(" - "),
y=[a?"New Laptop":null,i?"Troubleshoot":null,rem?"Remove":null,ah?"Access HikCentral":null,au?"Access Unifi":null,aa?"Access App.CW.Com":null].filter(Boolean).join(", ");let A=`Serves: Cubework
`;y&&(A+=`Request: ${y}
`),i&&e.issue&&(A+=`Issue: ${e.issue}
`);const j="%%CW_ISSUE_START%%",L="%%CW_ISSUE_END%%";let S=`Serves: Cubework
`;y&&(S+=`Request: ${y}
`),i&&e.issue&&(S+=`${j}Issue: ${e.issue}${L}
`);const w=i?" or CW":"",v=s.map(r=>{const g=[`Location: ${r.location}`];return a&&r.jobTitle&&g.push(`Job Title: ${r.jobTitle}`),i&&r.sbn&&g.push(`Laptop SBN#: ${r.sbn}`),g.push(`Employee Name: ${r.employeeName}`),r.employeeId&&g.push(`Employee ID: ${r.employeeId}`),a&&r.managerEmail&&g.push(`Report to Manager: ${r.managerEmail}`),r.email&&g.push(`Employee Personal Email${w}: ${r.email}`),r.phone&&g.push(`Employee Personal Phone${w}: ${formatPhoneForDisplay(r.phone)}`),g.join(`
`)}).join(`

`),N=a?"Please set up laptop:":i?"Please help troubleshoot laptop:":rem?"Please remove the laptop(s) below:":ah?"Please set up HikCentral access for the laptop(s) below:":au?"Please set up Unifi access for the laptop(s) below:":aa?"Please setup App.CW.Com access for the laptop(s) below:":"Please process the laptop request below:",
// Bold+red "Please set up laptop"/"Please help troubleshoot laptop" greeting
// (2026-09-10, per Huy's request; extended same day, second pass, to also
// cover Troubleshoot) - same %%...START/END%% sentinel-swap technique
// buildKeycard()'s Transfer From/To block and buildPhone()'s single-action-
// create greeting already use; fires for New Laptop and Troubleshoot,
// Remove/generic greetings are untouched. Own sentinel names (not j/L,
// already used above for the Issue block) so the two swaps don't collide.
// Bold+BLUE "Please setup App.CW.Com access" greeting (2026-09-21, per Huy's
// request, Software > Access App.CW.Com spec item 5): same sentinel-swap
// technique, own LTGB_* names/color so it doesn't collide with LTG's red -
// fires only for Access App.CW.Com (aa), same "descriptive text included in
// the Preview/Submission output" the form's own era_lt_appcwNote text
// mirrors (public/index.html).
LTG_START="%%CW_LTG_START%%",LTG_END="%%CW_LTG_END%%",LTGB_START="%%CW_LTGB_START%%",LTGB_END="%%CW_LTGB_END%%",
B=`Hello Team,

${N}

${LOC.plain}
${A}
${v}`,C=`Hello Team,

${a||i?`${LTG_START}${N}${LTG_END}`:aa?`${LTGB_START}${N}${LTGB_END}`:N}

${LOC.marked}
${S}
${v}`;let k=esc(C).replace(/\n/g,"<br>");k=k.split(j).join('<span style="color:#dc2626;font-weight:700;">').split(L).join("</span>");k=k.split(LOC.START).join('<span style="color:#dc2626;font-weight:700;">').split(LOC.END).join("</span>");k=k.split(LTG_START).join('<span style="color:#dc2626;font-weight:700;">').split(LTG_END).join("</span>");k=k.split(LTGB_START).join('<span style="color:#2563eb;font-weight:700;">').split(LTGB_END).join("</span>");const R=CC_EMAILS_LAPTOP.map((r,g)=>({name:CC_NAMES_LAPTOP[g],email:r})).concat([{name:null,email:t.requesterEmail}]).concat(a?collectDistinctEmails(s,"managerEmail"):[]),c=[{name:TO_NAME,email:TO_EMAIL}],f=appendSignature("laptop",B,k);return{ok:!0,subject:u,textBody:f.body,htmlBody:f.htmlBody,toRecipients:c,ccRecipients:R,mode:"laptop"}}function buildEmailRequest(t){const e=[],n=(t.requesterEmail||"").trim(),
// requesterEmail is only required where the client actually shows a "your
// email" field for it - Keycard's era_requesterEmailLocal, Phone's
// era_ph_yourEmail, Laptop's era_lt_yourEmail (eraSyncYourEmailGroupVisibility(),
// index.html). Wi-Fi/Electrical/App(Software) hide that field entirely, so
// requiring it here unconditionally left those three modes permanently
// unable to Submit after the client-side Le() gate was relaxed to match
// (the reported bug: "Enter a valid requester email." with no visible box
// to fill it in) - still format-check it if somehow present, just don't
// require it be non-empty for those three.
requesterEmailRequired=t.mode==="keycard"||t.mode==="phone"||t.mode==="laptop";
(requesterEmailRequired?!n||!EMAIL_RE.test(n):n&&!EMAIL_RE.test(n))&&e.push("Enter a valid requester email.");const s=(t.locationText||"").trim(),
// Location is not required when every submitted keycard entry is Transfer
// (2026-09-06, per Huy's request - "Clicking Preview still triggers 'Enter
// a location' validation" bug report). The client already skips its own
// Location-required check for this exact case (Le(), index.html) via
// eraKeycardAllTransfer() - this mirrors that same condition server-side,
// since buildEmailRequestPreview/submitEmailRequest both route through
// THIS shared function regardless of what the client already checked, so
// the server-side "Enter a location." push below still fired even after
// the client-side fix. Every other mode/action, and any mixed-action
// Keycard request with at least one non-Transfer entry, is unaffected.
keycardEntries=t.mode==="keycard"&&Array.isArray(t.fields&&t.fields.entries)?t.fields.entries:[],
locationRequired=!(t.mode==="keycard"&&keycardEntries.length>0&&keycardEntries.every(o=>entryKeycardAction(o)==="transfer"));
// Hardware (Printer/Phone/Laptop) has every server-side Submit-blocking
// gate removed too (2026-09-09, per Huy's request) - the client's own Le()
// gate (index.html) was fixed first, but buildEmailRequestPreview/
// submitEmailRequest both route through THIS shared function regardless of
// what the client already checked, so the "Enter a valid requester email."/
// "Enter a location." pushes above still surfaced as server-returned
// `problems` even with a clean client. isHw below also silences buildPhone's
// own final gate, buildLaptopCubework's own final gate, and buildGeneric's
// final gate for t==="printer"/"laptop" (see those functions) - Wi-Fi/App/
// Electrical/Keycard validation is untouched.
const isHw=t.mode==="printer"||t.mode==="phone"||t.mode==="laptop";if(s||!locationRequired||e.push("Enter a location."),!isHw&&e.length)return{ok:!1,problems:e};const a={...t,requesterEmail:n,locationText:s};let i;switch(a.mode){case"keycard":i=buildKeycard(a);break;case"wifi":i=buildWifi(a);break;case"printer":i=buildGeneric("printer",a);break;case"phone":i=buildPhone(a);break;case"app":i=buildApp(a);break;case"laptop":i=buildLaptop(a);break;case"electrical":i=buildGeneric("electrical",a);break;default:return{ok:!1,problems:["Unknown request type."]}}if(i.ok){const l=dedupeRecipientsAcrossFields(i.toRecipients,i.ccRecipients,i.bccRecipients);i.toRecipients=l.toRecipients,i.ccRecipients=l.ccRecipients,i.bccRecipients&&(i.bccRecipients=l.bccRecipients)}return i}function rawBase64(t){const e=t.indexOf(",");return e>=0?t.slice(e+1):t}function decodedByteLength(t){const e=t.replace(/=+$/,"");return Math.floor(e.length*3/4)}async function uploadLargeAttachment(t,e,n,s){const i=(await t.api(`/me/messages/${e}/attachments/createUploadSession`).post({AttachmentItem:{attachmentType:"file",name:n.filename||"attachment",size:s.length,contentType:n.mimeType||"application/octet-stream"}})).uploadUrl;let l=0;for(;l<s.length;){const d=Math.min(l+UPLOAD_CHUNK_BYTES,s.length),h=s.subarray(l,d),u=await fetch(i,{method:"PUT",headers:{"Content-Length":String(h.length),"Content-Range":`bytes ${l}-${d-1}/${s.length}`},body:h});if(!u.ok&&u.status!==200&&u.status!==201&&u.status!==202)throw new Error(`Attachment upload chunk failed (${u.status}): ${await u.text()}`);l=d}}async function sendViaGraph(t,e,n){const s=(n||[]).map(u=>{const y=rawBase64(u.base64||"");return{filename:u.filename||"attachment",mimeType:u.mimeType||"application/octet-stream",raw:y,buffer:null}}),a=s.reduce((u,y)=>u+decodedByteLength(y.raw),0),i=getSignatureBase64(e.mode),l=i?{"@odata.type":"#microsoft.graph.fileAttachment",name:`${e.mode}-signature.png`,contentType:"image/png",contentBytes:i,contentId:signatureContentId(e.mode),isInline:!0}:null,d={subject:e.subject,body:{contentType:"HTML",content:e.htmlBody},toRecipients:graphRecipients(e.toRecipients),ccRecipients:graphRecipients(e.ccRecipients)};Array.isArray(e.bccRecipients)&&e.bccRecipients.length&&(d.bccRecipients=graphRecipients(e.bccRecipients));if(a<=INLINE_ATTACHMENT_THRESHOLD_BYTES){d.attachments=s.map(u=>({"@odata.type":"#microsoft.graph.fileAttachment",name:u.filename,contentType:u.mimeType,contentBytes:u.raw})).concat(l?[l]:[]),await t.api("/me/sendMail").post({message:d,saveToSentItems:!0});return}const h=await t.api("/me/messages").post(d);for(const u of s)u.buffer=Buffer.from(u.raw,"base64"),u.buffer.length<=SIMPLE_ATTACHMENT_MAX_BYTES?await t.api(`/me/messages/${h.id}/attachments`).post({"@odata.type":"#microsoft.graph.fileAttachment",name:u.filename,contentType:u.mimeType,contentBytes:u.raw}):await uploadLargeAttachment(t,h.id,u,u.buffer);l&&await t.api(`/me/messages/${h.id}/attachments`).post(l),await t.api(`/me/messages/${h.id}/send`).post({})}function overrideRecipients(list){return(Array.isArray(list)?list:[]).map(x=>String(x||"").trim()).filter(x=>EMAIL_RE.test(x)).map(x=>({name:null,email:x}))}
async function submitEmailRequest(t,e){const n=buildEmailRequest(e);if(!n.ok)return n;typeof e.htmlBodyOverride=="string"&&e.htmlBodyOverride.trim()&&(n.htmlBody=e.htmlBodyOverride);
  // Preview-modal edited To/Cc/Bcc (2026-08-19) - the Preview modal lets
  // staff add/remove recipients by hand before Submit; those edits travel
  // as plain email-string arrays (not the {name,email} shape buildEmailRequest
  // produces) and, when present, replace what buildKeycard()/buildWifi()/etc.
  // computed server-side - same "override wins, empty means keep the
  // computed default" pattern as htmlBodyOverride above. To/Cc use the
  // override array whenever the client sent one at all (even empty, so
  // removing every Cc actually removes it); Bcc only overrides when
  // non-empty since there's no server-computed Bcc to fall back to.
  Array.isArray(e.toRecipientsOverride)&&(n.toRecipients=overrideRecipients(e.toRecipientsOverride)),
  Array.isArray(e.ccRecipientsOverride)&&(n.ccRecipients=overrideRecipients(e.ccRecipientsOverride)),
  Array.isArray(e.bccRecipientsOverride)&&e.bccRecipientsOverride.length&&(n.bccRecipients=overrideRecipients(e.bccRecipientsOverride));
  try{return await sendViaGraph(t,n,e.attachments),{ok:!0,to:displayAddr(n.toRecipients),cc:displayAddr(n.ccRecipients),subject:n.subject}}catch(s){return{ok:!1,problems:[`Send failed: ${s.message}`]}}}module.exports={submitEmailRequest,buildEmailRequest,entryKeycardAction};
