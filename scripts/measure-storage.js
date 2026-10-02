// Read-only: totals the bytes in the live Firebase Storage bucket by top-level
// prefix (keycardPhotoIds/, signatureRequests/, issueAttachments/, ...), and
// shows how much of each is older than N days (what a 5-day purge would free)
// plus an estimated monthly cost. Never writes or deletes anything.
//
//   node scripts/measure-storage.js                 # Storage only
//   node scripts/measure-storage.js --days 5        # age cutoff (default 5)
//   node scripts/measure-storage.js --bucket my-bucket-name
//   node scripts/measure-storage.js --firestore     # also estimate Firestore doc sizes
//
// Auth (this uses real credentials, unlike seed-emulator.js). Either:
//   - set GOOGLE_APPLICATION_CREDENTIALS to a service-account key JSON
//     (Console > Project settings > Service accounts > Generate new private key;
//     keep the file OUTSIDE the repo and delete it afterward), or
//   - `gcloud auth application-default login` if gcloud is installed.
//
// --firestore reads every doc in a few collections (one read each), so it
// costs reads against the free 50K/day quota; Storage listing is free of reads.
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));

const PROJECT_ID = "keycard-helpdesk";
const STORAGE_PRICE_PER_GB = 0.026; // legacy appspot.com bucket; US regions on *.firebasestorage.app use Cloud Storage pricing
const FREE_GB = 5;
const FIRESTORE_PRICE_PER_GB = 0.18;
const FIRESTORE_FREE_GB = 1;
const FIRESTORE_COLLECTIONS = [
  "signatureRequests",
  "keycardRequestHistory",
  "keycardFormSignatureAudit",
  "wifiRequestHistory",
  "employeeRequestHistory",
  "softwareRequestHistory",
  "hardwareRequestHistory",
  "standupSaves",
  "issueItems",
  "roadmapItems",
];

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const cutoffDays = Number(argVal("--days", "5")) || 5;
const wantFirestore = args.includes("--firestore");
const GB = 1024 ** 3;
const fmtBytes = (n) => {
  if (n >= GB) return (n / GB).toFixed(2) + " GB";
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
  return n + " B";
};
const money = (n) => "$" + n.toFixed(n < 0.1 ? 4 : 2);
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

admin.initializeApp({ projectId: PROJECT_ID });

async function findBucket() {
  const explicit = argVal("--bucket", null);
  const candidates = explicit
    ? [explicit]
    : [`${PROJECT_ID}.firebasestorage.app`, `${PROJECT_ID}.appspot.com`];
  for (const name of candidates) {
    const bucket = admin.storage().bucket(name);
    try {
      const [exists] = await bucket.exists();
      if (exists) return bucket;
    } catch (e) {
      console.error(`  (could not check ${name}: ${e.message})`);
    }
  }
  throw new Error("No bucket found. Pass --bucket <name> (see Console > Storage).");
}

async function measureStorage() {
  const bucket = await findBucket();
  console.log(`Bucket: ${bucket.name}   age cutoff: ${cutoffDays} days\n`);
  const cutoffMs = Date.now() - cutoffDays * 24 * 3600 * 1000;
  const groups = new Map(); // key -> { files, bytes, oldFiles, oldBytes, biggest }
  let totalBytes = 0;
  let totalFiles = 0;

  // autoPaginate pulls every page; metadata (size, updated) is included in the listing.
  const [files] = await bucket.getFiles({ autoPaginate: true });
  for (const f of files) {
    if (f.name.endsWith("/")) continue; // folder placeholder
    const size = Number(f.metadata.size || 0);
    const updated = Date.parse(f.metadata.updated || f.metadata.timeCreated || 0) || 0;
    const key = f.name.includes("/") ? f.name.split("/")[0] + "/" : "(root)";
    const g = groups.get(key) || { files: 0, bytes: 0, oldFiles: 0, oldBytes: 0, biggest: { name: "", size: 0 } };
    g.files++;
    g.bytes += size;
    if (updated && updated < cutoffMs) {
      g.oldFiles++;
      g.oldBytes += size;
    }
    if (size > g.biggest.size) g.biggest = { name: f.name, size };
    groups.set(key, g);
    totalBytes += size;
    totalFiles++;
  }

  const rows = [...groups.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
  console.log(pad("Prefix", 24) + padL("Files", 8) + padL("Size", 11) + padL("% of total", 12) + padL(`> ${cutoffDays}d old`, 12) + padL("$/month", 10));
  console.log("-".repeat(77));
  for (const [key, g] of rows) {
    const pct = totalBytes ? ((g.bytes / totalBytes) * 100).toFixed(1) + "%" : "0%";
    console.log(
      pad(key, 24) + padL(g.files, 8) + padL(fmtBytes(g.bytes), 11) + padL(pct, 12) + padL(fmtBytes(g.oldBytes), 12) + padL(money((g.bytes / GB) * STORAGE_PRICE_PER_GB), 10)
    );
  }
  console.log("-".repeat(77));
  const oldTotal = rows.reduce((s, [, g]) => s + g.oldBytes, 0);
  console.log(pad("TOTAL", 24) + padL(totalFiles, 8) + padL(fmtBytes(totalBytes), 11) + padL("", 12) + padL(fmtBytes(oldTotal), 12));

  const billable = Math.max(0, totalBytes / GB - FREE_GB);
  const billableAfter = Math.max(0, (totalBytes - oldTotal) / GB - FREE_GB);
  console.log(`\nEstimated Storage cost now: ${money(billable * STORAGE_PRICE_PER_GB)}/month (first ${FREE_GB} GB free, $${STORAGE_PRICE_PER_GB}/GB after)`);
  console.log(`If everything older than ${cutoffDays} days were deleted: ${money(billableAfter * STORAGE_PRICE_PER_GB)}/month (frees ${fmtBytes(oldTotal)})`);

  console.log("\nLargest file per prefix:");
  for (const [key, g] of rows) console.log(`  ${pad(key, 22)} ${padL(fmtBytes(g.biggest.size), 9)}  ${g.biggest.name}`);
}

async function measureFirestore() {
  console.log("\n\nFirestore (estimated from JSON length; real stored size is slightly larger):\n");
  const db = admin.firestore();
  let grand = 0;
  console.log(pad("Collection", 28) + padL("Docs", 8) + padL("~Size", 11) + padL("Largest doc", 13));
  console.log("-".repeat(60));
  for (const name of FIRESTORE_COLLECTIONS) {
    let docs = 0, bytes = 0, biggest = 0;
    const snap = await db.collection(name).get();
    snap.forEach((d) => {
      const n = Buffer.byteLength(JSON.stringify(d.data()), "utf8") + d.id.length;
      docs++;
      bytes += n;
      if (n > biggest) biggest = n;
    });
    grand += bytes;
    console.log(pad(name, 28) + padL(docs, 8) + padL(fmtBytes(bytes), 11) + padL(fmtBytes(biggest), 13));
  }
  console.log("-".repeat(60));
  const billable = Math.max(0, grand / GB - FIRESTORE_FREE_GB);
  console.log(pad("TOTAL", 28) + padL("", 8) + padL(fmtBytes(grand), 11));
  console.log(`\nEstimated Firestore storage cost: ${money(billable * FIRESTORE_PRICE_PER_GB)}/month (first ${FIRESTORE_FREE_GB} GiB free, ~$${FIRESTORE_PRICE_PER_GB}/GiB after)`);
}

(async () => {
  await measureStorage();
  if (wantFirestore) await measureFirestore();
})().catch((e) => {
  console.error("\nFailed:", e.message);
  if (/credential|Could not load the default credentials/i.test(e.message)) {
    console.error("Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key JSON (see header of this script).");
  }
  process.exit(1);
});
