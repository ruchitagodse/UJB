import fs from "node:fs";
import admin from "firebase-admin";

const workspace = process.cwd();
const sheetRowsPath = `${workspace}/json/adjustment/sheet_adjustment_rows.json`;
const outputPath = `${workspace}/json/adjustment/db_adjustment_snapshot.json`;

function parseEnvFile(path) {
  const out = {};
  const text = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value.replace(/\\n/g, "\n");
  }
  return out;
}

function round(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function text(value) {
  return String(value || "").trim();
}

function array(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function dateValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return text(value);
}

function getReferralDisplayId(referral) {
  return text(referral.referralId || referral.ReferralId || referral.id);
}

function getUserCode(user) {
  return text(user.UJBCode || user.ujbCode || user.id);
}

function getUserName(user) {
  return text(user.Name || user.name || user.BusinessName || user.businessName);
}

function extractDbAdjustments({ users, referrals }) {
  const rows = [];

  for (const user of users) {
    const payment = user?.payment?.orbiter || {};
    const logs = array(payment.adjustmentLogs);
    for (const log of logs) {
      const amount = round(log.amount ?? log.adjustedAmount ?? log.usedAmount ?? log.deductedAmount ?? log.deducted);
      if (amount <= 0) continue;
      rows.push({
        source: "user.payment.orbiter.adjustmentLogs",
        referralId: text(log.referralId || log.referralDocId || log.relatedReferralId),
        ujbCode: getUserCode(user),
        person: getUserName(user),
        role: text(log.role),
        adjustedAmount: amount,
        remainingAfter: round(log.newRemaining ?? log.newGlobalRemaining ?? payment.adjustmentRemaining),
        date: dateValue(log.date || log.createdAt || log.adjustedAt),
        referenceId: text(log.id || log.referenceId || log.paymentId),
      });
    }
  }

  for (const referral of referrals) {
    const referralId = getReferralDisplayId(referral);
    for (const log of array(referral.adjustmentLogs)) {
      const amount = round(log.amount ?? log.adjustedAmount ?? log.usedAmount ?? log.deductedAmount ?? log.deducted);
      if (amount <= 0) continue;
      rows.push({
        source: "referral.adjustmentLogs",
        referralId,
        referralDocId: referral.id,
        ujbCode: text(log.ujbCode || referral?.orbiter?.ujbCode || referral?.orbiter?.UJBCode),
        person: text(referral?.orbiter?.name || referral?.orbiter?.Name),
        role: text(log.role),
        adjustedAmount: amount,
        remainingAfter: round(log.newRemaining ?? log.newGlobalRemaining),
        date: dateValue(log.date || log.createdAt || log.adjustedAt),
        referenceId: text(log.id || log.referenceId || log.paymentId),
      });
    }

    for (const payment of array(referral.payments)) {
      const adjustment = payment?.meta?.adjustment || {};
      const log = adjustment.logEntry || adjustment;
      const amount = round(adjustment.deducted ?? log.deducted);
      if (amount <= 0) continue;
      rows.push({
        source: "referral.payments.meta.adjustment",
        referralId,
        referralDocId: referral.id,
        ujbCode: text(log.ujbCode || payment?.meta?.recipientUjbCode || referral?.orbiter?.ujbCode || referral?.orbiter?.UJBCode),
        person: text(payment.paymentToName || referral?.orbiter?.name || referral?.orbiter?.Name),
        role: text(log.role || payment?.meta?.slot),
        adjustedAmount: amount,
        remainingAfter: round(adjustment.newGlobalRemaining ?? log.newRemaining),
        date: dateValue(log.date || log.createdAt || payment.paymentDate || payment.createdAt),
        referenceId: text(payment.paymentId || payment.transactionRef || log.id),
      });
    }
  }

  return rows;
}

function keyLoose(row) {
  return [text(row.referralId).toLowerCase(), text(row.person).toLowerCase()].join("|");
}

function keyStrict(row) {
  return [
    text(row.referralId).toLowerCase(),
    text(row.person).toLowerCase(),
    text(row.role).toLowerCase(),
    round(row.adjustedAmount),
  ].join("|");
}

function normName(value) {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function referralParticipantForRole(referral, role) {
  const normalizedRole = text(role).toLowerCase();
  const orbiter = referral?.orbiter || {};
  const cosmo = referral?.cosmoOrbiter || {};

  if (normalizedRole === "partner") {
    return {
      name: text(orbiter.name || orbiter.Name || referral.orbiterName),
      ujbCode: text(orbiter.ujbCode || orbiter.UJBCode || referral.orbiterUJBCode),
    };
  }

  if (normalizedRole === "partner mentor") {
    return {
      name: text(orbiter.mentorName || referral.orbiterMentorName),
      ujbCode: text(orbiter.mentorUJBCode || referral.orbiterMentorUJBCode),
    };
  }

  if (normalizedRole === "lp mentor") {
    return {
      name: text(cosmo.mentorName || referral.cosmoMentorName),
      ujbCode: text(cosmo.mentorUJBCode || referral.cosmoMentorUJBCode),
    };
  }

  return { name: "", ujbCode: "" };
}

async function main() {
  const targetEnv = text(process.env.ADJUSTMENT_RECON_ENV || "local").toLowerCase();
  const env =
    targetEnv === "production"
      ? parseEnvFile(`${workspace}/.env.production`)
      : targetEnv === "staging"
        ? parseEnvFile(`${workspace}/.env.local`)
        : {
            ...parseEnvFile(`${workspace}/.env.production`),
            ...parseEnvFile(`${workspace}/.env.local`),
          };

  const stagingKeyPath = `${workspace}/json/stagging.json`;
  const stagingKey =
    targetEnv === "staging" && fs.existsSync(stagingKeyPath)
      ? JSON.parse(fs.readFileSync(stagingKeyPath, "utf8"))
      : null;

  const projectId =
    stagingKey?.project_id || env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = stagingKey?.client_email || env.FIREBASE_CLIENT_EMAIL;
  const privateKey = stagingKey?.private_key || env.FIREBASE_PRIVATE_KEY;
  const referralCollection =
    process.env.ADJUSTMENT_RECON_REFERRAL_COLLECTION ||
    (targetEnv === "production" ? "referral" : "Referral");
  const userCollection =
    process.env.ADJUSTMENT_RECON_USER_COLLECTION || "usersdetail";

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase admin credentials in local environment files.");
  }

  const app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  }, `adjustment-reconcile-${Date.now()}`);

  try {
    const db = app.firestore();
    const [usersSnap, referralsSnap] = await Promise.all([
      db.collection(userCollection).get(),
      db.collection(referralCollection).get(),
    ]);

    const users = usersSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const referrals = referralsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const dbRows = extractDbAdjustments({ users, referrals });
    const referralsById = new Map(
      referrals.map((referral) => [text(getReferralDisplayId(referral)).toLowerCase(), referral])
    );

    const sheetPayload = JSON.parse(fs.readFileSync(sheetRowsPath, "utf8"));
    const sheetRows = sheetPayload.rows || [];
    const referralIdsInDb = new Set(referrals.map((referral) => text(getReferralDisplayId(referral)).toLowerCase()));
    const sheetReferralIds = [...new Set(sheetRows.map((row) => text(row.referralId)).filter(Boolean))];
    const sheetReferralIdsInDb = sheetReferralIds.filter((id) => referralIdsInDb.has(id.toLowerCase()));
    const sheetReferralIdsMissingInDb = sheetReferralIds.filter((id) => !referralIdsInDb.has(id.toLowerCase()));
    const adjustmentUsers = users
      .map((user) => {
        const payment = user?.payment?.orbiter || {};
        return {
          ujbCode: getUserCode(user),
          name: getUserName(user),
          feeType: text(payment.feeType),
          status: text(payment.status),
          adjustmentRemaining: round(payment.adjustmentRemaining),
          adjustmentLogsCount: array(payment.adjustmentLogs).length,
        };
      })
      .filter((row) => row.feeType.toLowerCase() === "adjustment" || row.adjustmentRemaining > 0 || row.adjustmentLogsCount > 0);
    const dbStrict = new Map(dbRows.map((row) => [keyStrict(row), row]));
    const dbLoose = new Map();
    for (const row of dbRows) {
      const key = keyLoose(row);
      if (!dbLoose.has(key)) dbLoose.set(key, []);
      dbLoose.get(key).push(row);
    }

    const matched = [];
    const looseMatched = [];
    const missing = [];

    for (const row of sheetRows) {
      const strict = dbStrict.get(keyStrict(row));
      if (strict) {
        matched.push({ sheet: row, db: strict });
        continue;
      }
      const loose = dbLoose.get(keyLoose(row)) || [];
      if (loose.length) {
        looseMatched.push({ sheet: row, dbCandidates: loose });
      } else {
        missing.push(row);
      }
    }

    const sheetByReferral = new Set(sheetRows.map((row) => text(row.referralId).toLowerCase()));
    const extraDb = dbRows.filter((row) => !sheetByReferral.has(text(row.referralId).toLowerCase()));
    const migrationBuckets = {
      safeRegistrationFeeAdjustments: [],
      reviewRoundingOrNoBalanceDue: [],
      reviewMissingReferral: [],
      reviewParticipantMismatch: [],
      reviewNoAdjustedAmount: [],
    };

    for (const row of sheetRows) {
      const adjustedAmount = round(row.adjustedAmount);
      const balanceDueBefore = round(row.balanceDueBefore);
      const referral = referralsById.get(text(row.referralId).toLowerCase());
      if (adjustedAmount <= 0) {
        migrationBuckets.reviewNoAdjustedAmount.push(row);
        continue;
      }
      if (balanceDueBefore <= 0) {
        migrationBuckets.reviewRoundingOrNoBalanceDue.push(row);
        continue;
      }
      if (!referral) {
        migrationBuckets.reviewMissingReferral.push(row);
        continue;
      }

      const participant = referralParticipantForRole(referral, row.role);
      const sheetName = normName(row.person);
      const dbName = normName(participant.name);
      if (!participant.ujbCode || !sheetName || !dbName || sheetName !== dbName) {
        migrationBuckets.reviewParticipantMismatch.push({
          ...row,
          dbParticipantName: participant.name,
          dbParticipantUjbCode: participant.ujbCode,
        });
        continue;
      }

      migrationBuckets.safeRegistrationFeeAdjustments.push({
        ...row,
        referralDocId: referral.id,
        ujbCode: participant.ujbCode,
        dbParticipantName: participant.name,
      });
    }

    const summary = {
      projectId,
      targetEnv,
      userCollection,
      referralCollection,
      usersScanned: users.length,
      referralsScanned: referrals.length,
      sheetRows: sheetRows.length,
      sheetUniqueReferrals: new Set(sheetRows.map((row) => row.referralId)).size,
      sheetAdjustedTotal: round(sheetRows.reduce((sum, row) => sum + round(row.adjustedAmount), 0)),
      dbAdjustmentRows: dbRows.length,
      dbUniqueReferrals: new Set(dbRows.map((row) => row.referralId)).size,
      dbAdjustedTotal: round(dbRows.reduce((sum, row) => sum + round(row.adjustedAmount), 0)),
      adjustmentUsers: adjustmentUsers.length,
      adjustmentUsersWithRemainingBalance: adjustmentUsers.filter((row) => row.adjustmentRemaining > 0).length,
      adjustmentUsersWithLogs: adjustmentUsers.filter((row) => row.adjustmentLogsCount > 0).length,
      sheetReferralIdsInDb: sheetReferralIdsInDb.length,
      sheetReferralIdsMissingInDb: sheetReferralIdsMissingInDb.length,
      strictMatches: matched.length,
      looseMatchesByReferralAndPerson: looseMatched.length,
      missingFromDb: missing.length,
      dbRowsNotInSheetByReferral: extraDb.length,
      sheetRowsWithBalanceDue: sheetRows.filter((row) => round(row.balanceDueBefore) > 0).length,
      migrationBuckets: Object.fromEntries(
        Object.entries(migrationBuckets).map(([key, rows]) => [key, rows.length])
      ),
    };

    fs.writeFileSync(
      outputPath,
      JSON.stringify({
        summary,
        matched: matched.slice(0, 100),
        looseMatched: looseMatched.slice(0, 100),
        missing: missing.slice(0, 500),
        dbRows,
        adjustmentUsers: adjustmentUsers.slice(0, 500),
        sheetReferralIdsInDb: sheetReferralIdsInDb.slice(0, 500),
        sheetReferralIdsMissingInDb: sheetReferralIdsMissingInDb.slice(0, 500),
        migrationBuckets,
        extraDb: extraDb.slice(0, 500),
      }, null, 2)
    );

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await app.delete();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
