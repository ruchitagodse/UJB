#!/usr/bin/env node

import fs from "fs";
import path from "path";
import admin from "firebase-admin";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith("--") ? argv[++i] : "true";
    args[key] = value;
  }
  return args;
}

function normalizeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  const normalized = normalizeText(value).toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`JSON file not found: ${absPath}`);
  }
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

function getAdminConfigFromKeyFile(filePath) {
  const raw = readJson(filePath);
  return {
    projectId: normalizeText(raw.project_id),
    clientEmail: normalizeText(raw.client_email),
    privateKey: normalizeText(raw.private_key).replace(/\\n/g, "\n"),
  };
}

function validateAdminConfig(config = {}, label = "firebase") {
  if (!config.projectId || !config.clientEmail || !config.privateKey) {
    throw new Error(
      `Missing admin credentials for ${label}. Need project_id, client_email, and private_key in the service-account JSON file.`
    );
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function formatTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

async function deleteDocTree(docRef, writer, stats) {
  const subcollections = await docRef.listCollections();
  for (const subcol of subcollections) {
    const subSnap = await subcol.get();
    for (const subDoc of subSnap.docs) {
      await deleteDocTree(subDoc.ref, writer, stats);
    }
  }

  writer.delete(docRef);
  stats.docsDeleted += 1;
}

async function clearCollectionTree(collectionRef, writer, stats) {
  const snap = await collectionRef.get();
  for (const doc of snap.docs) {
    await deleteDocTree(doc.ref, writer, stats);
  }
}

async function copyDocTree({
  sourceDocRef,
  targetDocRef,
  writer,
  stats,
  mode,
  depth = 0,
}) {
  const snap = await sourceDocRef.get();
  if (!snap.exists) {
    stats.missingSourceDocs += 1;
    return;
  }

  const data = snap.data() || {};
  stats.docsSeen += 1;
  stats.maxDepth = Math.max(stats.maxDepth, depth);

  if (mode === "apply") {
    writer.set(targetDocRef, data);
    stats.docsQueued += 1;
  }

  const subcollections = await sourceDocRef.listCollections();
  stats.subcollectionsSeen += subcollections.length;
  for (const subcol of subcollections) {
    stats.collectionsVisited += 1;
    const subSnap = await subcol.get();
    stats.docsInCollectionsSeen += subSnap.size;
    for (const subDoc of subSnap.docs) {
      await copyDocTree({
        sourceDocRef: subDoc.ref,
        targetDocRef: targetDocRef.collection(subcol.id).doc(subDoc.id),
        writer,
        stats,
        mode,
        depth: depth + 1,
      });
    }
  }
}

async function mirrorCollection({
  sourceCollectionRef,
  targetCollectionRef,
  writer,
  stats,
  mode,
  clearTargetFirst,
}) {
  const sourceSnap = await sourceCollectionRef.get();
  stats.rootCollectionsSeen += 1;
  stats.rootDocsSeen += sourceSnap.size;

  if (clearTargetFirst && mode === "apply") {
    const deleteWriter = targetCollectionRef.firestore.bulkWriter();
    deleteWriter.onWriteError((error) => {
      if (error.failedAttempts < 5) return true;
      console.error(
        `[DELETE-RETRY-FAIL] ${error.documentRef.path} attempts=${error.failedAttempts} message=${error.message}`
      );
      return false;
    });
    await clearCollectionTree(targetCollectionRef, deleteWriter, stats);
    await deleteWriter.close();
  }

  for (const doc of sourceSnap.docs) {
    await copyDocTree({
      sourceDocRef: doc.ref,
      targetDocRef: targetCollectionRef.doc(doc.id),
      writer,
      stats,
      mode,
      depth: 0,
    });
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const defaultSourceKey = "C:/Ruchita/Next/Universe_CC_tool/UJB_Karma_CC/json/prod-project-key.json";
  const defaultTargetKey = "C:/Ruchita/Next/Universe_CC_tool/UJB_Karma_CC/json/stagging.json";

  const sourceKeyPath = normalizeText(args["source-key"] || defaultSourceKey);
  const targetKeyPath = normalizeText(args["target-key"] || defaultTargetKey);
  const mode = normalizeText(args.mode || "dry-run").toLowerCase();
  const clearTargetFirst = parseBoolean(args["replace-target"], false);
  const reportRoot = path.resolve(normalizeText(args["report-dir"] || "migration-reports"));
  const collectionsFilter = uniqueStrings(
    normalizeText(args.collections)
      ? normalizeText(args.collections).split(",")
      : []
  );

  if (!["dry-run", "apply"].includes(mode)) {
    throw new Error(`Invalid --mode '${mode}'. Use dry-run or apply.`);
  }

  const sourceConfig = getAdminConfigFromKeyFile(sourceKeyPath);
  const targetConfig = getAdminConfigFromKeyFile(targetKeyPath);
  validateAdminConfig(sourceConfig, `source key (${sourceKeyPath})`);
  validateAdminConfig(targetConfig, `target key (${targetKeyPath})`);

  const reportDir = path.join(reportRoot, formatTimestamp());
  ensureDir(reportDir);

  const sourceApp = admin.initializeApp(
    { credential: admin.credential.cert(sourceConfig) },
    `source-prod-${Date.now()}`
  );
  const targetApp = admin.initializeApp(
    { credential: admin.credential.cert(targetConfig) },
    `target-staging-${Date.now()}`
  );

  const sourceDb = sourceApp.firestore();
  const targetDb = targetApp.firestore();
  const sourceCollections = await sourceDb.listCollections();
  const selectedCollections = collectionsFilter.length
    ? sourceCollections.filter((collectionRef) => collectionsFilter.includes(collectionRef.id))
    : sourceCollections;
  const missingCollections = collectionsFilter.filter(
    (collectionName) => !sourceCollections.some((collectionRef) => collectionRef.id === collectionName)
  );

  const stats = {
    mode,
    sourceProjectId: sourceConfig.projectId,
    targetProjectId: targetConfig.projectId,
    rootCollectionsSeen: 0,
    rootDocsSeen: 0,
    collectionsVisited: 0,
    docsSeen: 0,
    docsQueued: 0,
    docsDeleted: 0,
    docsInCollectionsSeen: 0,
    subcollectionsSeen: 0,
    missingSourceDocs: 0,
    maxDepth: 0,
    selectedCollections: selectedCollections.map((collectionRef) => collectionRef.id),
    requestedCollections: collectionsFilter,
    missingCollections,
    clearTargetFirst,
    startedAt: new Date().toISOString(),
  };

  const writer = mode === "apply" ? targetDb.bulkWriter() : null;
  if (writer) {
    writer.onWriteError((error) => {
      if (error.failedAttempts < 5) return true;
      console.error(
        `[WRITE-FAIL] ${error.documentRef.path} attempts=${error.failedAttempts} message=${error.message}`
      );
      return false;
    });
  }

  console.log(
    `[START] mode=${mode} source=${sourceConfig.projectId} target=${targetConfig.projectId} collections=${selectedCollections.length} replaceTarget=${clearTargetFirst}`
  );
  if (missingCollections.length) {
    console.warn(`[WARN] missing source collections: ${missingCollections.join(", ")}`);
  }

  try {
    for (const collectionRef of selectedCollections) {
      const targetCollectionRef = targetDb.collection(collectionRef.id);
      console.log(`[COLLECTION] ${collectionRef.id}`);
      await mirrorCollection({
        sourceCollectionRef: collectionRef,
        targetCollectionRef,
        writer,
        stats,
        mode,
        clearTargetFirst,
      });
    }

    if (writer) {
      await writer.close();
    }

    stats.finishedAt = new Date().toISOString();
    stats.durationMs = new Date(stats.finishedAt).getTime() - new Date(stats.startedAt).getTime();

    const manifest = {
      sourceKeyPath,
      targetKeyPath,
      reportDir,
      mode,
      clearTargetFirst,
      collections: stats.selectedCollections,
      sourceProjectId: stats.sourceProjectId,
      targetProjectId: stats.targetProjectId,
    };

    writeJson(path.join(reportDir, "manifest.json"), manifest);
    writeJson(path.join(reportDir, "summary.json"), stats);

    console.log(`[DONE] reportDir=${reportDir}`);
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await sourceApp.delete();
    await targetApp.delete();
  }
}

main().catch((error) => {
  console.error("[FATAL]", error?.message || error);
  process.exitCode = 1;
});
