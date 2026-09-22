import fs from "node:fs";
import admin from "firebase-admin";

const workspace = process.cwd();
const stagingKeyPath = `${workspace}/json/stagging.json`;
const outputPath = `${workspace}/json/adjustment/adjustment_log_cleanup_dry_run.json`;
const appliedPath = `${workspace}/json/adjustment/adjustment_log_cleanup_applied.json`;
const RUN_LIMIT = 5;
const PAYABLE_CAP = 1000;

function text(value) {
  return String(value || "").trim();
}

function round(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function getUserCode(user) {
  return text(user.UJBCode || user.ujbCode || user.id);
}

function getUserName(user) {
  return text(user.Name || user.name || user.BusinessName || user.businessName);
}

function amountOf(log) {
  return round(log.adjustedAmount ?? log.deducted ?? log.amount ?? log.usedAmount);
}

function isExcelLog(log) {
  return text(log?.source) === "excel_adjustment_migration";
}

function logId(log) {
  return text(log?.id || log?.migrationId);
}

function logSortDate(log) {
  const raw = text(log?.dateOfTransfer || log?.createdAt || log?.date || log?.adjustedAt);
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanupCandidatesForUser(user) {
  const logs = array(user?.payment?.orbiter?.adjustmentLogs);
  const excelLogs = logs.filter(isExcelLog);
  const seen = new Set();
  const removals = [];
  const uniqueLogs = [];

  for (const log of excelLogs) {
    const id = logId(log);
    if (id && seen.has(id)) {
      removals.push({ reason: "duplicate_log_id", log });
      continue;
    }
    if (id) seen.add(id);
    uniqueLogs.push(log);
  }

  let total = uniqueLogs.reduce((sum, log) => round(sum + amountOf(log)), 0);
  const entryPendingLogs = uniqueLogs
    .filter((log) => text(log.sourceSheet) === "Entry Pending")
    .sort((a, b) => logSortDate(b) - logSortDate(a));

  for (const log of entryPendingLogs) {
    total = round(total - amountOf(log));
    removals.push({
      reason: "entry_pending_duplicate_source",
      log,
    });
  }

  return { totalBefore: uniqueLogs.reduce((sum, log) => round(sum + amountOf(log)), 0), removals };
}

function overCapSummaries(users) {
  return users
    .map((user) => {
      const logs = array(user?.payment?.orbiter?.adjustmentLogs).filter(isExcelLog);
      const unique = new Map();
      for (const log of logs) {
        const id = logId(log);
        if (id && !unique.has(id)) unique.set(id, log);
      }
      const regularLogs = [...unique.values()].filter((log) => text(log.sourceSheet) !== "Entry Pending");
      const total = regularLogs.reduce((sum, log) => round(sum + amountOf(log)), 0);
      return {
        userDocId: user.id,
        userUjbCode: getUserCode(user),
        userName: getUserName(user),
        total,
        overBy: round(total - PAYABLE_CAP),
        logCount: regularLogs.length,
      };
    })
    .filter((row) => row.overBy > 0)
    .sort((a, b) => b.overBy - a.overBy);
}

function removeLogIds(logs, ids) {
  const idSet = new Set(ids);
  return array(logs).filter((log) => !idSet.has(logId(log)));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const key = JSON.parse(fs.readFileSync(stagingKeyPath, "utf8"));
  const app = admin.initializeApp(
    { credential: admin.credential.cert(key) },
    `adjustment-cleanup-${Date.now()}`
  );

  try {
    const db = app.firestore();
    const [usersSnap, referralsSnap] = await Promise.all([
      db.collection("usersdetail").get(),
      db.collection("Referral").get(),
    ]);

    const users = usersSnap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...(doc.data() || {}) }));
    const referrals = referralsSnap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...(doc.data() || {}) }));
    const referralsByDocId = new Map(referrals.map((referral) => [referral.id, referral]));

    const planned = [];
    for (const user of users) {
      const { totalBefore, removals } = cleanupCandidatesForUser(user);
      for (const removal of removals) {
        const id = logId(removal.log);
        if (!id) continue;
        planned.push({
          id,
          reason: removal.reason,
          userDocId: user.id,
          userUjbCode: getUserCode(user),
          userName: getUserName(user),
          referralDocId: text(removal.log.referralDocId),
          referralId: text(removal.log.referralId),
          sourceSheet: text(removal.log.sourceSheet),
          adjustedAmount: amountOf(removal.log),
          totalBefore,
        });
      }
    }

    const batch = planned.slice(0, RUN_LIMIT);
    const overCapAfterCleanup = overCapSummaries(users);
    const summary = {
      mode: apply ? "apply" : "dry-run",
      runLimit: RUN_LIMIT,
      projectId: key.project_id,
      plannedRemovals: planned.length,
      removalsThisRun: batch.length,
      overCapAfterCleanupCount: overCapAfterCleanup.length,
      byReason: planned.reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + 1;
        return acc;
      }, {}),
      collections: { users: "usersdetail", referrals: "Referral" },
    };

    if (!apply) {
      fs.writeFileSync(
        outputPath,
        JSON.stringify({ summary, batch, planned, overCapAfterCleanup }, null, 2)
      );
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    let userWrites = 0;
    let referralWrites = 0;
    for (const item of batch) {
      const userRef = db.collection("usersdetail").doc(item.userDocId);
      const referral = item.referralDocId ? referralsByDocId.get(item.referralDocId) : null;
      const referralRef = referral ? db.collection("Referral").doc(referral.id) : null;

      await db.runTransaction(async (transaction) => {
        const [userSnap, referralSnap] = await Promise.all([
          transaction.get(userRef),
          referralRef ? transaction.get(referralRef) : null,
        ]);

        if (userSnap.exists) {
          const user = userSnap.data() || {};
          const payment = user.payment || {};
          const orbiter = payment.orbiter || {};
          const nextLogs = removeLogIds(orbiter.adjustmentLogs, [item.id]);
          transaction.set(
            userRef,
            { payment: { ...payment, orbiter: { ...orbiter, adjustmentLogs: nextLogs } } },
            { merge: true }
          );
          userWrites += 1;
        }

        if (referralSnap?.exists) {
          const referralData = referralSnap.data() || {};
          const nextLogs = removeLogIds(referralData.adjustmentLogs, [item.id]);
          transaction.set(referralRef, { adjustmentLogs: nextLogs }, { merge: true });
          referralWrites += 1;
        }
      });
    }

    fs.writeFileSync(
      appliedPath,
      JSON.stringify({ summary: { ...summary, userWrites, referralWrites }, batch }, null, 2)
    );
    console.log(JSON.stringify({ ...summary, userWrites, referralWrites }, null, 2));
  } finally {
    await app.delete();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
