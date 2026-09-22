import fs from "node:fs";
import admin from "firebase-admin";

const workspace = process.cwd();
const sheetRowsPath = `${workspace}/json/adjustment/sheet_adjustment_rows.json`;
const stagingKeyPath = `${workspace}/json/stagging.json`;
const RUN_LIMIT = 5;

function text(value) {
  return String(value || "").trim();
}

function normName(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function round(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function migrationId(row) {
  return [
    "excel_adjustment",
    text(row.referralId).replace(/[^a-zA-Z0-9]/g, "_"),
    text(row.role).replace(/[^a-zA-Z0-9]/g, "_"),
    text(row.person).replace(/[^a-zA-Z0-9]/g, "_"),
    Math.round(round(row.adjustedAmount) * 100),
  ].join("_");
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

function buildUsersByName(users) {
  const index = new Map();
  for (const user of users) {
    const name = normName(getUserName(user));
    if (!name) continue;
    if (!index.has(name)) index.set(name, []);
    index.get(name).push(user);
  }
  return index;
}

function resolveParticipantWithNameFallback(participant, row, usersByName) {
  const participantNameMatches = normName(participant.name) === normName(row.person);
  if (participant.ujbCode || !participantNameMatches) {
    return { participant, fallback: null };
  }

  const userMatches = usersByName.get(normName(row.person)) || [];
  if (userMatches.length !== 1) {
    return {
      participant,
      fallback: {
        status: userMatches.length ? "ambiguous_user_name" : "missing_user_name",
        matches: userMatches.map((user) => ({
          id: user.id,
          ujbCode: getUserCode(user),
          name: getUserName(user),
        })),
      },
    };
  }

  const [user] = userMatches;
  return {
    participant: {
      ...participant,
      ujbCode: getUserCode(user),
      name: getUserName(user),
      resolvedBy: "exact_unique_user_name",
    },
    fallback: { status: "resolved_by_exact_unique_user_name" },
  };
}

function participantForRole(referral, role) {
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

function buildLog({ row, participant, referral }) {
  const id = migrationId(row);
  return {
    id,
    type: "RegistrationFeeAdjustment",
    source: "excel_adjustment_migration",
    sourceSheet: row.sheet,
    referralId: row.referralId,
    referralDisplayId: row.referralId,
    referralDocId: referral.id,
    role: row.role,
    ujbCode: participant.ujbCode,
    person: row.person,
    deducted: round(row.adjustedAmount),
    adjustedAmount: round(row.adjustedAmount),
    referralAmount: round(row.referralAmount),
    balanceDueBefore: round(row.balanceDueBefore),
    remainingAfter: Math.max(round(row.balanceDueBefore) - round(row.adjustedAmount), 0),
    newRemaining: Math.max(round(row.balanceDueBefore) - round(row.adjustedAmount), 0),
    postAdjustmentAmount: round(row.postAdjustmentAmount),
    finalCashAmount: round(row.finalCashAmount),
    dateOfTransfer: text(row.dateOfTransfer),
    createdAt: new Date().toISOString(),
    migratedAt: new Date().toISOString(),
    _v: 1,
  };
}

function mergeById(existing, nextLog) {
  const logs = array(existing);
  if (logs.some((log) => text(log?.id) === nextLog.id)) {
    return { logs, changed: false };
  }
  return { logs: [...logs, nextLog], changed: true };
}

async function resolveUserRef(db, usersByCode, participant) {
  const direct = usersByCode.get(text(participant.ujbCode).toLowerCase());
  if (direct?.id) {
    return db.collection("usersdetail").doc(direct.id);
  }

  if (participant.ujbCode) {
    return db.collection("usersdetail").doc(participant.ujbCode);
  }

  return null;
}

function isAlreadyMigrated(usersByCode, item) {
  const { referral, participant, log } = item;
  const user = usersByCode.get(text(participant.ujbCode).toLowerCase());
  const userLogs = array(user?.payment?.orbiter?.adjustmentLogs);
  const referralLogs = array(referral?.adjustmentLogs);

  return (
    userLogs.some((entry) => text(entry?.id) === log.id) ||
    referralLogs.some((entry) => text(entry?.id) === log.id)
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  const key = JSON.parse(fs.readFileSync(stagingKeyPath, "utf8"));
  const sheetPayload = JSON.parse(fs.readFileSync(sheetRowsPath, "utf8"));
  const sheetRows = sheetPayload.rows || [];

  const app = admin.initializeApp(
    { credential: admin.credential.cert(key) },
    `adjustment-log-migrate-${Date.now()}`
  );

  try {
    const db = app.firestore();
    const [usersSnap, referralsSnap] = await Promise.all([
      db.collection("usersdetail").get(),
      db.collection("Referral").get(),
    ]);

    const users = usersSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const referrals = referralsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const usersByCode = new Map(users.map((user) => [getUserCode(user).toLowerCase(), user]));
    const usersByName = buildUsersByName(users);
    const referralsById = new Map(
      referrals.map((referral) => [getReferralDisplayId(referral).toLowerCase(), referral])
    );

    const safe = [];
    const review = [];

    for (const row of sheetRows) {
      if (round(row.adjustedAmount) <= 0 || round(row.balanceDueBefore) <= 0) {
        review.push({ reason: "not_registration_fee_adjustment", row });
        continue;
      }

      const referral = referralsById.get(text(row.referralId).toLowerCase());
      if (!referral) {
        review.push({ reason: "missing_referral", row });
        continue;
      }

      const initialParticipant = participantForRole(referral, row.role);
      const { participant, fallback } = resolveParticipantWithNameFallback(
        initialParticipant,
        row,
        usersByName
      );
      if (!participant.ujbCode || normName(participant.name) !== normName(row.person)) {
        review.push({
          reason: "participant_mismatch",
          row,
          dbParticipantName: initialParticipant.name,
          dbParticipantUjbCode: initialParticipant.ujbCode,
          fallback,
        });
        continue;
      }

      safe.push({ row, referral, participant, log: buildLog({ row, referral, participant }) });
    }

    const pendingSafe = [];
    let alreadyMigrated = 0;
    for (const item of safe) {
      if (isAlreadyMigrated(usersByCode, item)) {
        alreadyMigrated += 1;
      } else {
        pendingSafe.push(item);
      }
    }
    const batch = pendingSafe.slice(0, RUN_LIMIT);

    const summary = {
      mode: apply ? "apply" : "dry-run",
      runLimit: RUN_LIMIT,
      safeRowsTotal: safe.length,
      safeRowsAlreadyMigrated: alreadyMigrated,
      safeRowsPending: pendingSafe.length,
      safeRowsThisRun: batch.length,
      reviewRows: review.length,
      reviewByReason: review.reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + 1;
        return acc;
      }, {}),
      projectId: key.project_id,
      collections: { users: "usersdetail", referrals: "Referral" },
    };

    if (!apply) {
      fs.writeFileSync(
        `${workspace}/json/adjustment/adjustment_log_migration_dry_run.json`,
        JSON.stringify(
          {
            summary,
            safe: batch.map(({ row, participant, log }) => ({
              row,
              participant,
              log,
            })),
            review,
          },
          null,
          2
        )
      );
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    let userWrites = 0;
    let referralWrites = 0;

    for (const item of batch) {
      const { referral, participant, log } = item;
      const userRef = await resolveUserRef(db, usersByCode, participant);
      const referralRef = db.collection("Referral").doc(referral.id);

      await db.runTransaction(async (transaction) => {
        const [userSnap, referralSnap] = await Promise.all([
          userRef ? transaction.get(userRef) : null,
          transaction.get(referralRef),
        ]);

        if (userSnap?.exists) {
          const user = userSnap.data() || {};
          const payment = user.payment || {};
          const orbiter = payment.orbiter || {};
          const merged = mergeById(orbiter.adjustmentLogs, log);
          if (merged.changed) {
            transaction.set(
              userRef,
              {
                payment: {
                  ...payment,
                  orbiter: {
                    ...orbiter,
                    feeType: orbiter.feeType || "adjustment",
                    adjustmentLogs: merged.logs,
                  },
                },
              },
              { merge: true }
            );
            userWrites += 1;
          }
        }

        if (referralSnap.exists) {
          const referralData = referralSnap.data() || {};
          const merged = mergeById(referralData.adjustmentLogs, log);
          if (merged.changed) {
            transaction.set(referralRef, { adjustmentLogs: merged.logs }, { merge: true });
            referralWrites += 1;
          }
        }
      });
    }

    const applied = { ...summary, userWrites, referralWrites };
    fs.writeFileSync(
      `${workspace}/json/adjustment/adjustment_log_migration_applied.json`,
      JSON.stringify({ summary: applied, review }, null, 2)
    );
    console.log(JSON.stringify(applied, null, 2));
  } finally {
    await app.delete();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
