import {
  buildReferralStatusUpdatePayload,
  validateReferralStatusUpdate,
} from "@/lib/referrals/referralMutationWorkflow.mjs";
import { getReferralParticipantRole } from "@/lib/referrals/referralServerWorkflow.mjs";
import { applyAdjustmentBeforePayRoleCalc } from "@/utils/referralCalculations";
import sanitizeForFirestore from "@/utils/sanitizeForFirestore";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getNestedValue(object, path, fallback = undefined) {
  return path.split(".").reduce((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return current[part];
    }

    return undefined;
  }, object) ?? fallback;
}

function buildUserProfileSummary(profile, fallback = {}) {
  if (!profile) {
    return fallback;
  }

  return {
    ...fallback,
    ...profile,
    ujbCode:
      profile.ujbCode ||
      profile.UJBCode ||
      fallback.ujbCode ||
      fallback.UJBCode ||
      "",
    name: profile.name || profile.Name || fallback.name || "",
    phone: profile.phone || profile.MobileNo || fallback.phone || "",
    email: profile.email || profile.Email || fallback.email || "",
    mentorName:
      profile.mentorName || profile.MentorName || fallback.mentorName || "",
    mentorUJBCode:
      profile.mentorUJBCode || profile.MentorUJBCode || fallback.mentorUJBCode || "",
    mentorResidentStatus:
      profile.mentorResidentStatus ||
      profile.MentorResidentStatus ||
      fallback.mentorResidentStatus ||
      "Resident",
    residentStatus:
      profile.residentStatus ||
      profile.ResidentStatus ||
      fallback.residentStatus ||
      "Resident",
  };
}

function mergeParticipant(participant, profile) {
  return buildUserProfileSummary(profile, participant || {});
}

function buildPaymentIdentity(payment, index = 0) {
  return (
    payment?.paymentId ||
    payment?.meta?.paymentId ||
    payment?.transactionRef ||
    `payment-${index}`
  );
}

function dedupePayments(paymentList = []) {
  const seen = new Set();

  return paymentList.filter((payment, index) => {
    const identity = buildPaymentIdentity(payment, index);

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
}

export async function fetchCcReferralDetail({ provider, id }) {
  const referral = await provider.referrals.getCcById(id);

  if (!referral) {
    return null;
  }

  const [orbiterProfile, cosmoProfile] = await Promise.all([
    referral.orbiterUJBCode
      ? provider.users.getByUjbCode(referral.orbiterUJBCode)
      : null,
    referral.cosmoOrbiter?.ujbCode
      ? provider.users.getByUjbCode(referral.cosmoOrbiter.ujbCode)
      : null,
  ]);

  return {
    referral,
    orbiter: mergeParticipant(referral.orbiter, orbiterProfile),
    cosmoOrbiter: mergeParticipant(referral.cosmoOrbiter, cosmoProfile),
    userRole: null,
    adjustmentBucket: {
      remaining: Math.max(
        toNumber(getNestedValue(orbiterProfile, "payment.orbiter.adjustmentRemaining", 0)),
        0
      ),
      feeType:
        getNestedValue(orbiterProfile, "payment.orbiter.feeType", "adjustment") ||
        "adjustment",
    },
  };
}

export function ensureCcReferralAccess({ referral, sessionUjbCode }) {
  return getReferralParticipantRole({ referral, sessionUjbCode });
}

export async function updateCcReferralStatus({ provider, referral, id, nextStatus, rejectReason = "" }) {
  const validation = validateReferralStatusUpdate({
    currentStatus: referral.dealStatus || referral.status || "Pending",
    nextStatus,
    rejectReason,
  });

  if (!validation.ok) {
    const error = new Error(validation.message);
    error.status = validation.status || 400;
    throw error;
  }

  const payload = buildReferralStatusUpdatePayload({
    nextStatus: validation.nextStatus,
    rejectReason,
    now: new Date(),
  });
  const existingLogs = Array.isArray(referral.statusLogs) ? referral.statusLogs : [];

  return provider.referrals.updateCcById(id, {
    ...payload,
    statusLogs: [...existingLogs, payload.statusLogs[0]],
  });
}

export async function saveCcDealLog({ provider, referral, id, distribution }) {
  const nextLog = sanitizeForFirestore({
    ...distribution,
    dealStatus: referral?.dealStatus || "Deal Won",
    timestamp: new Date().toISOString(),
    lastDealCalculatedAt: new Date().toISOString(),
  });
  const existingLogs = Array.isArray(referral.dealLogs) ? referral.dealLogs : [];

  return provider.referrals.updateCcById(id, {
    dealLogs: [...existingLogs, nextLog],
    lastDealCalculatedAt: new Date().toISOString(),
    agreedTotal: nextLog.agreedAmount,
    dealValue: nextLog.dealValue,
  });
}

export async function replaceCcFollowups({ provider, id, followups }) {
  return provider.referrals.updateCcById(id, {
    followups: sanitizeForFirestore(followups || []),
  });
}

export async function attachCcReferralFile({
  provider,
  referral,
  id,
  type,
  url,
  name,
}) {
  if (type === "invoice") {
    return provider.referrals.updateCcById(id, {
      invoiceUrl: url,
      invoiceName: name,
    });
  }

  const existing = Array.isArray(referral.supportingDocs)
    ? referral.supportingDocs
    : [];

  return provider.referrals.updateCcById(id, {
    supportingDocs: [
      ...existing,
      sanitizeForFirestore({
        url,
        name,
        type,
        uploadedAt: Date.now(),
      }),
    ],
  });
}

export async function recordCcCosmoPayment({
  provider,
  referral,
  id,
  entry,
}) {
  const existingPayments = Array.isArray(referral.payments) ? referral.payments : [];
  const nextPayments = dedupePayments([...existingPayments, sanitizeForFirestore(entry)]);
  const nextUjbBalance =
    toNumber(referral.ujbBalance, 0) + toNumber(entry.amountReceived, 0);
  const nextTdsReceivable =
    toNumber(referral.tdsReceivable, 0) + toNumber(entry.tdsAmount, 0);

  return provider.referrals.updateCcById(id, {
    payments: nextPayments,
    ujbBalance: nextUjbBalance,
    tdsReceivable: nextTdsReceivable,
  });
}

export async function recordCcUjbPayout({
  provider,
  referral,
  id,
  entry,
  recipientField,
}) {
  const existingPayments = Array.isArray(referral.payments) ? referral.payments : [];
  const nextPayments = dedupePayments([...existingPayments, sanitizeForFirestore(entry)]);
  const nextUjbBalance =
    toNumber(referral.ujbBalance, 0) - toNumber(entry.amountReceived, 0);
  const nextRecipientTotal =
    toNumber(referral[recipientField], 0) +
    toNumber(entry.meta?.logicalAmount, 0);

  return provider.referrals.updateCcById(id, {
    payments: nextPayments,
    ujbBalance: nextUjbBalance,
    [recipientField]: nextRecipientTotal,
  });
}

export async function previewOrApplyCcAdjustment({
  provider,
  referral,
  role,
  requestedAmount,
  dealValue,
  ujbCode,
  previewOnly = false,
}) {
  const user = ujbCode ? await provider.users.getByUjbCode(ujbCode) : null;
  const paymentOrbiter = user?.payment?.orbiter || {};
  const bucketRemaining = Math.max(
    toNumber(paymentOrbiter.adjustmentRemaining, 0),
    0
  );

  if (!user || !bucketRemaining || toNumber(requestedAmount, 0) <= 0) {
    return {
      previewOnly,
      deducted: 0,
      cashToPay: toNumber(requestedAmount, 0),
      newGlobalRemaining: bucketRemaining,
    };
  }

  const result = applyAdjustmentBeforePayRoleCalc({
    requestedAmount,
    userDetailData: {
      adjustmentRemaining: bucketRemaining,
      feeType: paymentOrbiter.feeType || "adjustment",
    },
    referral,
    dealValue,
    role,
    ujbCode,
  });

  if (previewOnly || !result.deducted) {
    return {
      previewOnly,
      deducted: result.deducted,
      cashToPay: result.remainingForCash,
      newGlobalRemaining: result.newGlobalRemaining,
    };
  }

  const safeLog = sanitizeForFirestore({
    id: `adj_${Date.now()}`,
    ...result.logEntry,
    previousRemaining: bucketRemaining,
    newRemaining: Math.max(result.newGlobalRemaining, 0),
    createdAt: new Date().toISOString(),
    _v: 1,
  });

  const mergedPayment = {
    ...(user.payment || {}),
    orbiter: {
      ...paymentOrbiter,
      adjustmentRemaining: result.newGlobalRemaining,
      adjustmentCompleted: result.newGlobalRemaining === 0,
      adjustmentLogs: [
        ...(Array.isArray(paymentOrbiter.adjustmentLogs)
          ? paymentOrbiter.adjustmentLogs
          : []),
        safeLog,
      ],
    },
  };

  await provider.users.updateByUjbCode(ujbCode, {
    payment: mergedPayment,
  });

  await provider.referrals.updateCcById(referral.id, {
    adjustmentLogs: [
      ...(Array.isArray(referral.adjustmentLogs) ? referral.adjustmentLogs : []),
      sanitizeForFirestore({
        type: safeLog.type,
        role: safeLog.role,
        deducted: safeLog.deducted,
        remainingForCash: safeLog.remainingForCash,
        dealValue: safeLog.dealValue,
        ujbCode: safeLog.ujbCode,
        createdAt: safeLog.createdAt,
      }),
    ],
  });

  return {
    previewOnly: false,
    deducted: result.deducted,
    cashToPay: result.remainingForCash,
    newGlobalRemaining: result.newGlobalRemaining,
    logEntry: safeLog,
  };
}
