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

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function readJsonFile(filePath) {
  const abs = path.resolve(filePath);

  if (!fs.existsSync(abs)) {
    throw new Error(`Key file not found: ${abs}`);
  }

  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function getServiceAccount(args) {
  const keyFile = normalizeText(args["key-file"] || args["service-account"]);

  if (keyFile) {
    const raw = readJsonFile(keyFile);
    return {
      projectId: normalizeText(raw.project_id),
      clientEmail: normalizeText(raw.client_email),
      privateKey: normalizeText(raw.private_key).replace(/\\n/g, "\n"),
    };
  }

  return {
    projectId: normalizeText(args["project-id"] || process.env.FIREBASE_PROJECT_ID),
    clientEmail: normalizeText(args["client-email"] || process.env.FIREBASE_CLIENT_EMAIL),
    privateKey: normalizeText(args["private-key"] || process.env.FIREBASE_PRIVATE_KEY).replace(
      /\\n/g,
      "\n"
    ),
  };
}

function createAppConfig(serviceAccount) {
  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Provide --key-file or set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
    );
  }

  return {
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.projectId,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const dryRun = parseBoolean(args["dry-run"], false);
  const quiet = parseBoolean(args["quiet"], false);
  const collectionName =
    normalizeText(
      args.collection || process.env.NEXT_PUBLIC_COLLECTION_USER_DETAIL || "usersdetail"
    ) || "usersdetail";

  const serviceAccount = getServiceAccount(args);
  const app = admin.initializeApp(createAppConfig(serviceAccount), "login-status-backfill");
  const db = app.firestore();

  const snapshot = await db.collection(collectionName).get();
  const summary = {
    collection: collectionName,
    totalDocs: snapshot.size,
    updatedDocs: 0,
    dryRun,
  };

  console.log(
    `[START] loginStatus backfill | collection=${collectionName} docs=${snapshot.size} dryRun=${dryRun}`
  );

  if (snapshot.empty) {
    console.log("[DONE] No user records found.");
    await app.delete();
    return;
  }

  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snapshot.docs) {
    batch.set(
      docSnap.ref,
      {
        loginStatus: "Active",
        updatedAt: new Date(),
      },
      { merge: true }
    );
    batchCount += 1;
    summary.updatedDocs += 1;

    if (!dryRun && batchCount >= 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }

    if (!quiet && summary.updatedDocs % 100 === 0) {
      console.log(`[PROGRESS] updated ${summary.updatedDocs}/${snapshot.size}`);
    }
  }

  if (!dryRun && batchCount > 0) {
    await batch.commit();
  }

  console.log("[DONE] loginStatus backfill summary:");
  console.log(JSON.stringify(summary, null, 2));

  await app.delete();
}

main().catch((error) => {
  console.error("[FATAL]", error?.message || error);
  process.exit(1);
});
