#!/usr/bin/env node

import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import { syncMentorConnectsInProvider } from "../lib/data/mentorConnects.mjs";

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
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function readKeyFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Key file not found: ${abs}`);
  }

  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  return {
    projectId: normalizeText(raw.project_id),
    clientEmail: normalizeText(raw.client_email),
    privateKey: normalizeText(raw.private_key).replace(/\\n/g, "\n"),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const keyFile = normalizeText(
    args["key-file"] || "C:/Ruchita/Next/Universe_CC_tool/UJB_Karma_CC/json/prod-project-key.json"
  );
  const dryRun = parseBoolean(args["dry-run"], false);
  const batchSize = Math.max(1, Number.parseInt(args["batch-size"] || "100", 10) || 100);

  const key = readKeyFile(keyFile);
  const app = admin.initializeApp(
    { credential: admin.credential.cert(key) },
    "sync-mentor-connects"
  );

  try {
    const db = app.firestore();
    const collection = () => db.collection("usersdetail");

    const resolveUserRef = async (ujbCode) => {
      const normalized = normalizeText(ujbCode);
      if (!normalized) return null;

      const directRef = collection().doc(normalized);
      const directSnap = await directRef.get();
      if (directSnap.exists) {
        return directRef;
      }

      for (const fieldName of ["UJBCode", "ujbCode", "UjbCode"]) {
        const snapshot = await collection()
          .where(fieldName, "==", normalized)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          return snapshot.docs[0].ref;
        }
      }

      return null;
    };

    const provider = {
      users: {
        async listAll() {
          const users = [];
          let lastDoc = null;
          let page = 0;

          while (true) {
            let query = collection().orderBy("__name__").limit(batchSize);
            if (lastDoc) {
              query = query.startAfter(lastDoc);
            }

            const snapshot = await query.get();
            if (snapshot.empty) {
              break;
            }

            page += 1;
            console.log(`[PAGE] fetched ${snapshot.size} users (page=${page})`);

            snapshot.docs.forEach((docSnap) => {
              users.push({
                id: docSnap.id,
                ...docSnap.data(),
              });
            });

            lastDoc = snapshot.docs[snapshot.docs.length - 1];
            if (snapshot.size < batchSize) {
              break;
            }
          }

          return users;
        },
        async updateByUjbCode(ujbCode, update) {
          const ref = await resolveUserRef(ujbCode);
          if (!ref) {
            throw new Error(`Unable to resolve user document for ${ujbCode}`);
          }

          await ref.set(
            {
              ...(update || {}),
              updatedAt: new Date(),
            },
            { merge: true }
          );

          const snap = await ref.get();
          return {
            id: snap.id,
            ...snap.data(),
          };
        },
      },
    };

    console.log(
      `[START] mentor connects sync | project=${key.projectId} dryRun=${dryRun} batchSize=${batchSize}`
    );

    const summary = await syncMentorConnectsInProvider(provider, {
      dryRun,
      logger: console,
    });

    console.log("[DONE] mentor connects sync summary:");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await app.delete();
  }
}

main().catch((error) => {
  console.error("[FATAL]", error?.message || error);
  process.exit(1);
});
