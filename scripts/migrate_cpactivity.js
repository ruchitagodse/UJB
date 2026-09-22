#!/usr/bin/env node

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    args[key] = value;
  }
  return args;
}

function readJson(filePath) {
  const absPath = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

async function copyDocRecursive(sourceDocRef, targetDocRef, stats) {
  const snap = await sourceDocRef.get();
  if (!snap.exists) {
    return;
  }

  await targetDocRef.set(snap.data(), { merge: false });
  stats.docsCopied += 1;

  const subcollections = await sourceDocRef.listCollections();
  for (const subcol of subcollections) {
    const targetSubcolRef = targetDocRef.collection(subcol.id);
    const subDocs = await subcol.get();
    for (const subDoc of subDocs.docs) {
      await copyDocRecursive(subDoc.ref, targetSubcolRef.doc(subDoc.id), stats);
    }
  }
}

async function copyCollection(sourceDb, targetDb, collectionName, stats) {
  const sourceSnap = await sourceDb.collection(collectionName).get();
  for (const doc of sourceSnap.docs) {
    await copyDocRecursive(doc.ref, targetDb.collection(collectionName).doc(doc.id), stats);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const sourceKeyPath = args.sourceKey;
  const targetKeyPath = args.targetKey;
  const mode = args.mode || "doc";
  const sourceDocPath = args.sourceDocPath || "cpactivity/043";
  const sourceCollection = args.sourceCollection || "cpactivity";

  if (!sourceKeyPath || !targetKeyPath) {
    throw new Error(
      "Missing required args. Example: node scripts/migrate_cpactivity.js --sourceKey source.json --targetKey target.json --mode doc --sourceDocPath cpactivity/043"
    );
  }

  const sourceCred = admin.credential.cert(readJson(sourceKeyPath));
  const targetCred = admin.credential.cert(readJson(targetKeyPath));

  const sourceApp = admin.initializeApp({ credential: sourceCred }, "source-app");
  const targetApp = admin.initializeApp({ credential: targetCred }, "target-app");
  const sourceDb = sourceApp.firestore();
  const targetDb = targetApp.firestore();

  const stats = { docsCopied: 0 };

  if (mode === "collection") {
    await copyCollection(sourceDb, targetDb, sourceCollection, stats);
    console.log(`Copied collection '${sourceCollection}' with ${stats.docsCopied} docs.`);
  } else if (mode === "doc") {
    const sourceDocRef = sourceDb.doc(sourceDocPath);
    const targetDocRef = targetDb.doc(sourceDocPath);
    await copyDocRecursive(sourceDocRef, targetDocRef, stats);
    console.log(`Copied document '${sourceDocPath}' with ${stats.docsCopied} docs (including nested docs).`);
  } else {
    throw new Error("Invalid --mode. Use 'doc' or 'collection'.");
  }

  await sourceApp.delete();
  await targetApp.delete();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
