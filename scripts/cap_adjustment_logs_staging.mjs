import fs from "node:fs";
import admin from "firebase-admin";

const workspace = process.cwd();
const stagingKeyPath = `${workspace}/json/stagging.json`;
const outputPath = `${workspace}/json/adjustment/adjustment_log_cap_dry_run.json`;
const appliedPath = `${workspace}/json/adjustment/adjustment_log_cap_applied.json`;
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

function logId(log) {
  return text(log?.id || log?.migrationId);
}

function amountOf(log) {
  return round(log?.adjustedAmount ?? log?.deducted ?? log?.amount ?? log?.usedAmount);
}

function isMigratedRegularLog(log) {
  return (
    text(log?.source) === "excel_adjustment_migration" &&
    text(log?.sourceSheet) !== "Entry Pending" &&
    !log?.adjustmentIgnored
  );
}

function parseLogDate(log) {
  const raw = text(log?.dateOfTransfer || log?.createdAt || log?.date || log?.adjustedAt);
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function withCappedAmount(log, amount, reason) {
  const nextAmount = round(amount);
  const originalAdjustedAmount = round(log.originalAdjustedAmount ?? log.adjustedAmount ?? log.deducted);
  const originalDeducted = round(log.originalDeducted ?? log.deducted ?? log.adjustedAmount);
  const nextLog = {
    ...log,
    originalAdjustedAmount,
    originalDeducted,
    originalRemainingAfter: log.originalRemainingAfter ?? log.remainingAfter,
    adjustedAmount: nextAmount,
    deducted: nextAmount,
    remainingAfter: Math.max(round(log.balanceDueBefore) - nextAmount, 0),
    newRemaining: Math.max(round(log.balanceDueBefore) - nextAmount, 0),
    capCleanupReason: reason,
    capCleanupAt: new Date().toISOString(),
    _capV: 1,
  };
  if (log.amount !== undefined) nextLog.amount = nextAmount;
  return nextLog;
}

function withIgnoredLog(log, reason) {
  const originalAdjustedAmount = round(log.originalAdjustedAmount ?? log.adjustedAmount ?? log.deducted);
  const originalDeducted = round(log.originalDeducted ?? log.deducted ?? log.adjustedAmount);
  const nextLog = {
    ...log,
    originalAdjustedAmount,
    originalDeducted,
    ignoredAmount: originalAdjustedAmount,
    adjustedAmount: 0,
    deducted: 0,
    remainingAfter: Math.max(round(log.balanceDueBefore), 0),
    newRemaining: Math.max(round(log.balanceDueBefore), 0),
    adjustmentIgnored: true,
    ignoredFromAdjustmentUsage: true,
    capCleanupReason: reason,
    capCleanupAt: new Date().toISOString(),
    _capV: 1,
  };
  if (log.amount !== undefined) nextLog.amount = 0;
  return nextLog;
}

function plannedActionsForUser(user) {
  const logs = array(user?.payment?.orbiter?.adjustmentLogs);
  const candidates = logs
    .map((log, index) => ({ log, index }))
    .filter(({ log }) => isMigratedRegularLog(log) && amountOf(log) > 0)
    .sort((a, b) => {
      const dateDiff = parseLogDate(a.log) - parseLogDate(b.log);
      return dateDiff || a.index - b.index;
    });

  let applied = 0;
  const actions = [];
  for (const item of candidates) {
    const amount = amountOf(item.log);
    const id = logId(item.log);
    if (!id) continue;

    if (applied >= PAYABLE_CAP) {
      actions.push({
        id,
        type: "ignore_over_cap",
        originalAmount: amount,
        nextAmount: 0,
        userDocId: user.id,
        userUjbCode: getUserCode(user),
        userName: getUserName(user),
        referralDocId: text(item.log.referralDocId),
        referralId: text(item.log.referralId),
        sourceSheet: text(item.log.sourceSheet),
      });
      continue;
    }

    if (round(applied + amount) > PAYABLE_CAP) {
      const allowed = round(PAYABLE_CAP - applied);
      actions.push({
        id,
        type: "cap_amount",
        originalAmount: amount,
        nextAmount: allowed,
        userDocId: user.id,
        userUjbCode: getUserCode(user),
        userName: getUserName(user),
        referralDocId: text(item.log.referralDocId),
        referralId: text(item.log.referralId),
        sourceSheet: text(item.log.sourceSheet),
      });
      applied = PAYABLE_CAP;
      continue;
    }

    applied = round(applied + amount);
  }

  return actions;
}

function applyLogActions(logs, actionById) {
  return array(logs).map((log) => {
    const action = actionById.get(logId(log));
    if (!action) return log;
    if (action.type === "cap_amount") {
      return withCappedAmount(log, action.nextAmount, "capped_to_payable_amount");
    }
    return withIgnoredLog(log, "ignored_after_payable_cap");
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const key = JSON.parse(fs.readFileSync(stagingKeyPath, "utf8"));
  const app = admin.initializeApp(
    { credential: admin.credential.cert(key) },
    `adjustment-cap-${Date.now()}`
  );

  try {
    const db = app.firestore();
    const usersSnap = await db.collection("usersdetail").get();
    const users = usersSnap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...(doc.data() || {}) }));

    const planned = users.flatMap(plannedActionsForUser);
    const batch = planned.slice(0, RUN_LIMIT);
    const summary = {
      mode: apply ? "apply" : "dry-run",
      runLimit: RUN_LIMIT,
      payableCap: PAYABLE_CAP,
      projectId: key.project_id,
      plannedActions: planned.length,
      actionsThisRun: batch.length,
      byType: planned.reduce((acc, action) => {
        acc[action.type] = (acc[action.type] || 0) + 1;
        return acc;
      }, {}),
      collections: { users: "usersdetail", referrals: "Referral" },
    };

    if (!apply) {
      fs.writeFileSync(outputPath, JSON.stringify({ summary, batch, planned }, null, 2));
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    let userWrites = 0;
    let referralWrites = 0;
    for (const action of batch) {
      const userRef = db.collection("usersdetail").doc(action.userDocId);
      const referralRef = action.referralDocId
        ? db.collection("Referral").doc(action.referralDocId)
        : null;

      await db.runTransaction(async (transaction) => {
        const [userSnap, referralSnap] = await Promise.all([
          transaction.get(userRef),
          referralRef ? transaction.get(referralRef) : null,
        ]);
        const actionById = new Map([[action.id, action]]);

        if (userSnap.exists) {
          const user = userSnap.data() || {};
          const payment = user.payment || {};
          const orbiter = payment.orbiter || {};
          transaction.set(
            userRef,
            {
              payment: {
                ...payment,
                orbiter: {
                  ...orbiter,
                  adjustmentLogs: applyLogActions(orbiter.adjustmentLogs, actionById),
                  adjustmentRemaining: 0,
                  adjustmentCompleted: true,
                },
              },
            },
            { merge: true }
          );
          userWrites += 1;
        }

        if (referralSnap?.exists) {
          const referral = referralSnap.data() || {};
          transaction.set(
            referralRef,
            { adjustmentLogs: applyLogActions(referral.adjustmentLogs, actionById) },
            { merge: true }
          );
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
