// Deletes old Firebase Hosting versions, keeping the live version plus the
// newest N finalized ones as rollback points. DRY RUN by default - nothing is
// deleted unless you pass --yes. Deleting a version is permanent and removes
// the ability to roll back to it.
//
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "...\keycard-app\Key\key.json"
//   node scripts/prune-hosting-versions.js              # show the plan only
//   node scripts/prune-hosting-versions.js --keep 3     # plan keeping 3 + live
//   node scripts/prune-hosting-versions.js --yes        # actually delete
//
// The currently live version is never deleted, regardless of age.
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));

const SITE = "keycard-helpdesk";
const BASE = "https://firebasehosting.googleapis.com/v1beta1";
const args = process.argv.slice(2);
const keepN = Number(args[args.indexOf("--keep") + 1]) || 5;
const doDelete = args.includes("--yes");
const GB = 1024 ** 3;
const MB = 1024 ** 2;

admin.initializeApp({ projectId: SITE });
const call = async (method, url) => {
  const token = (await admin.credential.applicationDefault().getAccessToken()).access_token;
  const res = await fetch(url, { method, headers: { Authorization: "Bearer " + token } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

(async () => {
  const ch = await call("GET", `${BASE}/sites/${SITE}/channels/live`);
  const live = ch.body.release && ch.body.release.version && ch.body.release.version.name;
  if (!live) throw new Error("Could not determine the live version (HTTP " + ch.status + ") - aborting.");

  const all = [];
  let pageToken = "";
  do {
    const r = await call("GET", `${BASE}/sites/${SITE}/versions?pageSize=200` + (pageToken ? "&pageToken=" + pageToken : ""));
    all.push(...(r.body.versions || []));
    pageToken = r.body.nextPageToken || "";
  } while (pageToken);

  const finalized = all.filter((v) => v.status === "FINALIZED").sort((a, b) => Date.parse(b.createTime) - Date.parse(a.createTime));
  const keep = new Set([live, ...finalized.slice(0, keepN).map((v) => v.name)]);
  const toDelete = finalized.filter((v) => !keep.has(v.name));

  console.log("Live version:", live);
  console.log("Keeping:");
  finalized.filter((v) => keep.has(v.name)).forEach((v) =>
    console.log("  ", v.name.split("/").pop(), v.createTime.slice(0, 16), (Number(v.versionBytes || 0) / MB).toFixed(1) + " MB", v.name === live ? "(live)" : "")
  );
  const bytes = toDelete.reduce((s, v) => s + Number(v.versionBytes || 0), 0);
  console.log(`Would delete ${toDelete.length} versions (~${(bytes / GB).toFixed(2)} GB).`);
  if (!doDelete) return console.log("Dry run - pass --yes to delete.");

  let ok = 0;
  let failed = 0;
  let firstError = "";
  for (let i = 0; i < toDelete.length; i += 8) {
    const results = await Promise.all(toDelete.slice(i, i + 8).map((v) => call("DELETE", `${BASE}/${v.name}`)));
    for (const r of results) {
      if (r.status === 200) ok++;
      else {
        failed++;
        firstError = firstError || JSON.stringify(r.body).slice(0, 300);
      }
    }
    if (failed > 5) break;
  }
  console.log("Deleted", ok, "failed", failed, firstError);
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
