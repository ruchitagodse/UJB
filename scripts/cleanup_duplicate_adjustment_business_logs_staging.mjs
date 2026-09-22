import fs from "node:fs";
import admin from "firebase-admin";

const workspace = process.cwd();
const stagingKeyPath = `${workspace}/json/stagging.json`;
const outputPath = `${workspace}/json/adjustment/duplicate_adjustment_business_cleanup_dry_run.json`;
const appliedPath = `${workspace}/json/adjustment/duplicate_adjustment_business_cleanup_applied.json`;
const RUN_LIMIT = 5;

function text(value) {
  return String(value || "").trim();
}

function norm(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function round(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function logId(log) {
  return text(log?.id || log?.migrationId);
}

function isAdjustmentLog(log) {
  return text(log?.source) === "excel_adjustment_migration" && !log?.adjustmentIgnored;
}

function amountOf(log) {
  return round(log?.adjustedAmount ?? log?.deducted ?? log?.amount);
}

function rolePriority(role) {
  const normalized = norm(role);
  if (normalized === "partner") return 0;
  if (normalized === "partner mentor") return 1;
  if (normalized === "lp mentor") return 2;
  return 3;
}

function referralOrbiterCode(referral) {
  return text(referral?.orbiter?.ujbCode || referral?.orbiter?.UJBCode || referral?.orbiterUJBCode);
}

function businessKey(referral, log) {
  return [
    referralOrbiterCode(referral),
    text(referral.referralId || referral.ReferralId || referral.id),
    amountOf(log),
    text(log?.adjustedUserUjbCode || log?.ujbCode),
    norm(log?.adjustedUserName || log?.person),
  ].join("|");
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
    `duplicate-adjustment-cleanup-${Date.now()}`
  );

  try {
    const db = app.firestore();
    const [usersSnap, referralsSnap] = await Promise.all([
      db.collection("usersdetail").get(),
      db.collection("Referral").get(),
    ]);
    const users = usersSnap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...(doc.data() || {}) }));
    const referrals = referralsSnap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...(doc.data() || {}) }));

    const userIdsByLogId = new Map();
    users.forEach((user) => {
      array(user?.payment?.orbiter?.adjustmentLogs).forEach((log) => {
        const id = logId(log);
        if (id) userIdsByLogId.set(id, user.id);
      });
    });

    const planned = [];
    referrals.forEach((referral) => {
      const groups = new Map();
      array(referral.adjustmentLogs).filter(isAdjustmentLog).forEach((log) => {
        const key = businessKey(referral, log);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(log);
      });

      groups.forEach((logs) => {
        if (logs.length <= 1) return;
        const sorted = [...logs].sort((a, b) => {
          const roleDiff = rolePriority(a.role) - rolePriority(b.role);
          return roleDiff || logId(a).localeCompare(logId(b));
        });
        const [keep, ...remove] = sorted;
        remove.forEach((log) => {
          planned.push({
            id: logId(log),
            keepId: logId(keep),
            referralDocId: referral.id,
            referralId: text(referral.referralId || referral.ReferralId || referral.id),
            userDocId: userIdsByLogId.get(logId(log)) || "",
            orbiterUjbCode: referralOrbiterCode(referral),
            adjustedUserUjbCode: text(log?.adjustedUserUjbCode || log?.ujbCode),
            adjustedUserName: text(log?.adjustedUserName || log?.person),
            role: text(log?.role),
            amount: amountOf(log),
            reason: "duplicate_business_adjustment_log",
          });
        });
      });
    });

    const batch = planned.slice(0, RUN_LIMIT);
    const summary = {
      mode: apply ? "apply" : "dry-run",
      runLimit: RUN_LIMIT,
      projectId: key.project_id,
      plannedRemovals: planned.length,
      removalsThisRun: batch.length,
      collections: { users: "usersdetail", referrals: "Referral" },
    };

    if (!apply) {
      fs.writeFileSync(outputPath, JSON.stringify({ summary, batch, planned }, null, 2));
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    let userWrites = 0;
    let referralWrites = 0;
    for (const item of batch) {
      const referralRef = db.collection("Referral").doc(item.referralDocId);
      const userRef = item.userDocId ? db.collection("usersdetail").doc(item.userDocId) : null;

      await db.runTransaction(async (transaction) => {
        const [referralSnap, userSnap] = await Promise.all([
          transaction.get(referralRef),
          userRef ? transaction.get(userRef) : null,
        ]);

        if (referralSnap.exists) {
          const referral = referralSnap.data() || {};
          transaction.set(
            referralRef,
            { adjustmentLogs: removeLogIds(referral.adjustmentLogs, [item.id]) },
            { merge: true }
          );
          referralWrites += 1;
        }

        if (userSnap?.exists) {
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
                  adjustmentLogs: removeLogIds(orbiter.adjustmentLogs, [item.id]),
                },
              },
            },
            { merge: true }
          );
          userWrites += 1;
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
