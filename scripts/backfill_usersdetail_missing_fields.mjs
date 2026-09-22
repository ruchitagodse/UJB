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
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isPlaceholder(value) {
  const text = normalizeText(value).toLowerCase();
  return text === "" || text === "-" || text === "—" || text === "na" || text === "n/a" || text === "null" || text === "undefined";
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return !isPlaceholder(value);
  if (Array.isArray(value)) return value.some((item) => !isPlaceholder(item));
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
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

function sourceUjbCode(docId, source = {}) {
  const code = normalizeText(source.UJBCode || source.ujbCode || source["UJB Code"] || docId);
  return code.toUpperCase();
}

const BACKFILL_FIELDS = [
  "IDType",
  "IDNumber",
  "MaritalStatus",
  "LanguagesKnown",
  "ImmediateDesire",
  "CurrentHealthCondition",
  "HealthParameters",
  "FamilyHistorySummary",
  "InterestArea",
  "ExclusiveKnowledge",
  "AreaOfServices",
  "Mastery",
  "Aspirations",
  "Website",
  "USP",
  "ProfilePhotoURL",
  "Skills",
  "City",
  "Category2",
  "TagLine",
  "Locality",
  "Category1",
  "Hobbies",
  "BusinessSocialMediaPages",
  "BusinessEmailID",
  "services",
  "products",
  "BusinessHistory",
  "BusinessName",
  "BusinessDetails",
  "MentorPhone",
  "MentorName",
  "State",
  "panNumber",
  "aadhaarNumber",
  "personalKYC",
  "businessKYC",
  "BusinessLogo",
  "CurrentProfession",
  "ProfessionalHistory",
  "ContributionAreainUJustBe",
  "Address",
  "payment",
  "agreementType",
  "agreementAcceptedAt",
  "keyCategory",
  "residentStatus",
  "taxSlab",
  "Pincode",
  "oneTimeEnrollmentFee",
  "connects",
  "EducationalBackground",
  "ClienteleBase",
  "NoteworthyAchievements",
];

async function main() {
  const args = parseArgs(process.argv);
  const sourceKeyPath = normalizeText(
    args["source-key"] || "C:/Ruchita/Next/Universe_CC_tool/UJB_Karma_CC/json/old-project-key.json"
  );
  const targetKeyPath = normalizeText(
    args["target-key"] || "C:/Ruchita/Next/Universe_CC_tool/UJB_Karma_CC/json/prod-project-key.json"
  );
  const dryRun = parseBoolean(args["dry-run"], false);
  const quiet = parseBoolean(args["quiet"], false);

  const sourceConfig = readKeyFile(sourceKeyPath);
  const targetConfig = readKeyFile(targetKeyPath);

  const sourceApp = admin.initializeApp(
    { credential: admin.credential.cert(sourceConfig) },
    "source-usersdetail-backfill"
  );
  const targetApp = admin.initializeApp(
    { credential: admin.credential.cert(targetConfig) },
    "target-usersdetail-backfill"
  );

  const sourceDb = sourceApp.firestore();
  const targetDb = targetApp.firestore();

  const sourceSnap = await sourceDb.collection("usersdetail").get();
  const targetSnap = await targetDb.collection("usersdetail").get();
  const targetMap = new Map();
  for (const targetDoc of targetSnap.docs) {
    targetMap.set(targetDoc.id.toUpperCase(), targetDoc.data() || {});
  }

  const summary = {
    sourceCount: sourceSnap.size,
    targetCount: targetSnap.size,
    createdDocs: 0,
    updatedDocs: 0,
    untouchedDocs: 0,
    failedDocs: 0,
    fieldBackfills: {},
  };

  for (const field of BACKFILL_FIELDS) {
    summary.fieldBackfills[field] = 0;
  }

  console.log(
    `[START] usersdetail backfill | source=${sourceConfig.projectId} target=${targetConfig.projectId} dryRun=${dryRun}`
  );

  for (const sourceDoc of sourceSnap.docs) {
    const sourceData = sourceDoc.data() || {};
    const ujbCode = sourceUjbCode(sourceDoc.id, sourceData);
    if (!ujbCode) {
      summary.failedDocs += 1;
      if (!quiet) console.log(`[FAIL] sourceDoc=${sourceDoc.id} missing UJBCode`);
      continue;
    }

    const targetData = targetMap.get(ujbCode);
    const payload = {};
    let changed = false;

    if (!targetData) {
      for (const field of BACKFILL_FIELDS) {
        const sourceValue = sourceData[field];
        if (hasValue(sourceValue)) {
          payload[field] = sourceValue;
          summary.fieldBackfills[field] += 1;
          changed = true;
        }
      }
      payload.UJBCode = ujbCode;
      payload.id = ujbCode;
      payload.updatedAt = new Date();
      changed = true;

      if (!dryRun) {
        await targetDb.collection("usersdetail").doc(ujbCode).set(payload, { merge: true });
      }
      summary.createdDocs += 1;
      if (!quiet) console.log(`[CREATE] ${ujbCode}${dryRun ? " | dry-run" : ""}`);
      continue;
    }

    for (const field of BACKFILL_FIELDS) {
      const sourceValue = sourceData[field];
      const targetValue = targetData[field];
      if (hasValue(sourceValue) && !hasValue(targetValue)) {
        payload[field] = sourceValue;
        summary.fieldBackfills[field] += 1;
        changed = true;
      }
    }

    if (!changed) {
      summary.untouchedDocs += 1;
      continue;
    }

    payload.updatedAt = new Date();
    if (!dryRun) {
      await targetDb.collection("usersdetail").doc(ujbCode).set(payload, { merge: true });
    }
    summary.updatedDocs += 1;
    if (!quiet) {
      console.log(`[UPDATE] ${ujbCode} fields=${Object.keys(payload).length - 1}${dryRun ? " | dry-run" : ""}`);
    }
  }

  console.log("[DONE] usersdetail backfill summary:");
  console.log(JSON.stringify(summary, null, 2));

  await sourceApp.delete();
  await targetApp.delete();
}

main().catch((error) => {
  console.error("[FATAL]", error?.message || error);
  process.exit(1);
});
