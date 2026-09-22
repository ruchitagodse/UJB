import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import admin from "firebase-admin";

const args = process.argv.slice(2);
const environment = args.includes("--environment") ? args[args.indexOf("--environment") + 1] : "development";
const apply = args.includes("--apply");

if (!new Set(["development", "staging", "production"]).has(environment)) {
  throw new Error("Use --environment development, staging, or production.");
}

const envPath = path.resolve(`.env.${environment}`);
if (!fs.existsSync(envPath)) throw new Error(`Environment file not found: ${envPath}`);

const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n")];
    })
);

const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY;
if (!projectId || !clientEmail || !privateKey) throw new Error(`Missing Firebase Admin credentials in ${envPath}`);

const app = admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) }, `festival-6am-${environment}`);
const db = app.firestore();
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toSixAmIst(value) {
  const millis = Date.parse(String(value || ""));
  if (Number.isNaN(millis)) return null;
  const date = new Date(millis + IST_OFFSET_MS).toISOString().slice(0, 10);
  return new Date(`${date}T06:00:00+05:30`).toISOString();
}

try {
  const snapshot = await db.collection("festivalCampaigns").get();
  const updates = snapshot.docs
    .map((doc) => ({ ref: doc.ref, id: doc.id, name: doc.data()?.eventName || doc.id, current: doc.data()?.scheduledAt, scheduledAt: toSixAmIst(doc.data()?.scheduledAt) }))
    .filter((campaign) => campaign.scheduledAt && campaign.scheduledAt !== campaign.current);

  console.log(`${apply ? "Applying" : "Dry run:"} ${updates.length} of ${snapshot.size} campaign(s) will be set to 6:00 AM IST in ${environment}.`);
  for (const campaign of updates) console.log(`${campaign.id} (${campaign.name}): ${campaign.current} -> ${campaign.scheduledAt}`);

  if (apply && updates.length) {
    for (let index = 0; index < updates.length; index += 500) {
      const batch = db.batch();
      for (const campaign of updates.slice(index, index + 500)) {
        batch.update(campaign.ref, { scheduledAt: campaign.scheduledAt, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      await batch.commit();
    }
    console.log(`Updated ${updates.length} campaign(s).`);
  }
} finally {
  await app.delete();
}
