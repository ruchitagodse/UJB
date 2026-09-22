import {
  buildReferralDuplicateKey,
  buildReferralId,
  buildReferralLockId,
  buildReferralNotifications,
  buildReferralWritePayload,
  normalizeReferralItem,
} from "./referralWorkflow.mjs";
import {
  buildReferralStatusUpdatePayload,
  validateReferralCreationRequest,
  validateReferralStatusUpdate,
} from "./referralMutationWorkflow.mjs";
import { REFERRAL_STATUSES, isFinalReferralStatus } from "./referralStates.mjs";
import { sanitizeForFirestore } from "../../utils/sanitizeForFirestore.js";
import { creditWalletForReferralRelease } from "@/lib/wallet/walletServerWorkflow.mjs";
import { getReferralRewardDetails } from "../../utils/referralCalculations.js";
import { applyReferralCpRules } from "./referralCpWorkflow.mjs";

const DEFAULT_REFERRAL_LAST_NUMBER = 2999;
const REFERRAL_COUNTER_COLLECTION = "counters";
const REFERRAL_COUNTER_DOC = "referral";
const REFERRAL_LOCKS_COLLECTION = "referralLocks";

function normalizeUjbCode(value) {
  return String(value || "").trim();
}

function getDocData(snapshot) {
  if (!snapshot) {
    return null;
  }

  return typeof snapshot.data === "function" ? snapshot.data() : snapshot.data;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getLatestDealLog(referral) {
  const logs = Array.isArray(referral?.dealLogs) ? referral.dealLogs : [];
  return logs.length ? logs[logs.length - 1] : null;
}

function getFinalizedDealValue(referral) {
  const latestDeal = getLatestDealLog(referral);
  return toNumber(latestDeal?.dealValue ?? referral?.dealValue, 0);
}

function getReferralItem(referral) {
  return (
    referral?.service ||
    referral?.product ||
    referral?.services?.[0] ||
    referral?.products?.[0] ||
    referral?.selectedItem ||
    null
  );
}

function buildFinancialYear(date = new Date()) {
  const year = date.getFullYear();
  const startsCurrentYear = date.getMonth() >= 3;
  const startYear = startsCurrentYear ? year : year - 1;
  const endYear = String((startYear + 1) % 100).padStart(2, "0");

  return `${startYear}-${endYear}`;
}

function buildInvoiceNumber(now = new Date()) {
  const financialYear = buildFinancialYear(now);
  const serial = String(now.getTime()).slice(-6);

  return `UJB/${financialYear}/${serial}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().split("T")[0];
}

function getParticipantBusinessName(participant) {
  return (
    participant?.businessName ||
    participant?.BusinessName ||
    participant?.companyName ||
    participant?.name ||
    participant?.Name ||
    ""
  );
}

function buildInvoiceParty(participant = {}) {
  return {
    ujbCode: participant?.ujbCode || participant?.UJBCode || "",
    name: participant?.name || participant?.Name || "",
    businessName: getParticipantBusinessName(participant),
    email: participant?.email || participant?.Email || "",
    phone: participant?.phone || participant?.MobileNo || "",
    gstin: participant?.gstin || participant?.GSTIN || "",
    address: participant?.address || participant?.Address || "",
  };
}

function calculateInvoiceBase({
  referral,
  amountReceived,
  dealValue,
  previousReceived,
  existingInvoices,
}) {
  const item = getReferralItem(referral);
  const reward = getReferralRewardDetails(dealValue, item);
  const targetCommissionBase = roundCurrency(reward.rewardAmount);
  const alreadyInvoicedBase = roundCurrency(
    (Array.isArray(existingInvoices) ? existingInvoices : []).reduce(
      (sum, invoice) => sum + toNumber(invoice?.baseAmount ?? invoice?.totals?.taxableAmount, 0),
      0
    )
  );
  const remainingCommissionBase = Math.max(
    roundCurrency(targetCommissionBase - alreadyInvoicedBase),
    0
  );
  const remainingDealValue = Math.max(roundCurrency(dealValue - previousReceived), 0);
  const effectiveCommissionRate =
    dealValue > 0 ? roundCurrency((targetCommissionBase / dealValue) * 100) : 0;
  const invoiceBase =
    remainingDealValue > 0
      ? roundCurrency(
        Math.min(
          remainingCommissionBase,
          (toNumber(amountReceived, 0) * remainingCommissionBase) / remainingDealValue
        )
      )
      : 0;

  return {
    invoiceBase,
    reward,
    targetCommissionBase,
    alreadyInvoicedBase,
    remainingCommissionBase,
    remainingDealValue,
    effectiveCommissionRate,
  };
}

function getInvoiceStatus(value) {
  const status = normalizeText(value);
  return ["Pending", "Paid", "Cancelled"].includes(status) ? status : "Pending";
}

function buildUjustbeeInvoice({
  referral,
  transaction,
  invoiceBase,
  calculation,
  now,
}) {
  const gstRate = 18;
  const gstAmount = roundCurrency((invoiceBase * gstRate) / 100);
  const totalAmount = roundCurrency(invoiceBase + gstAmount);
  const invoiceId = `UJB-INV-${now.getTime()}`;
  const invoiceNumber = buildInvoiceNumber(now);
  const cosmo = referral?.cosmoOrbiter || {};
  const orbiter = referral?.orbiter || {};
  const item = getReferralItem(referral) || {};
  const serviceOrProductName =
    item?.serviceName || item?.productName || item?.name || item?.label || "";

  return sanitizeForFirestore({
    invoiceId,
    invoiceNumber,
    referralId: referral?.id || "",
    referralDisplayId: referral?.referralId || referral?.id || "",
    dealTransactionId: transaction.transactionId,
    invoiceType: "Referral Commission",
    status: "Pending",
    issuedAt: now.toISOString(),
    dueDate: addDays(now, 7),
    financialYear: buildFinancialYear(now),
    billedBy: {
      legalName: "UJustBe",
      businessName: "UJustBe",
      gstin: "",
      email: "",
      phone: "",
      address: "",
    },
    billedTo: buildInvoiceParty(cosmo),
    referral: {
      orbiterUjbCode: orbiter?.ujbCode || orbiter?.UJBCode || referral?.orbiterUJBCode || "",
      orbiterName: orbiter?.name || orbiter?.Name || "",
      cosmoUjbCode: cosmo?.ujbCode || cosmo?.UJBCode || referral?.cosmoUjbCode || "",
      cosmoName: cosmo?.name || cosmo?.Name || "",
      serviceOrProductName,
      dealValue: calculation.finalizedDealValue,
    },
    sourcePayment: {
      amountReceived: transaction.amountReceived,
      modeOfPayment: transaction.modeOfPayment,
      transactionRef: transaction.transactionRef,
      paymentDate: transaction.paymentDate,
    },
    calculationSnapshot: {
      modelType:
        calculation.reward?.slab?.modelType ||
        item?.commercialModel?.modelType ||
        calculation.reward?.mode ||
        null,
      commissionType: calculation.reward?.rewardType,
      commissionValue: calculation.reward?.rewardValue,
      rewardLabel: calculation.reward?.rewardLabel,
      matchedSlab: calculation.reward?.slab || null,
      finalizedDealValue: calculation.finalizedDealValue,
      effectiveCommissionRate: calculation.effectiveCommissionRate,
      targetCommissionBase: calculation.targetCommissionBase,
      alreadyInvoicedBaseBeforeThisInvoice: calculation.alreadyInvoicedBase,
      remainingCommissionBaseBeforeThisInvoice: calculation.remainingCommissionBase,
      remainingDealValueBeforeThisInvoice: calculation.remainingDealValue,
    },
    lineItems: [
      {
        description: "Referral commission on payment received",
        taxableAmount: invoiceBase,
        gstRate,
        gstAmount,
        totalAmount,
      },
    ],
    baseAmount: invoiceBase,
    gstRate,
    gstAmount,
    totalAmount,
    totals: {
      taxableAmount: invoiceBase,
      cgstRate: 9,
      cgstAmount: roundCurrency(gstAmount / 2),
      sgstRate: 9,
      sgstAmount: roundCurrency(gstAmount / 2),
      igstRate: 0,
      igstAmount: 0,
      gstAmount,
      totalAmount,
      amountPaid: 0,
      balanceDue: totalAmount,
    },
    accountPayment: {
      paidAt: null,
      paymentMode: "",
      paymentReference: "",
      receivedByAdminId: "",
      notes: "",
    },
    pdf: {
      url: "",
      generatedAt: null,
    },
    email: {
      sentAt: null,
      sentTo: [],
      status: "Not Sent",
    },
  });
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

async function resolveDuplicateLockState({
  adminDb,
  referralCollectionName,
  lockRef,
  lockSnap,
  transaction = null,
}) {
  if (!lockSnap?.exists) {
    return {
      exists: false,
      isActive: false,
      lockData: null,
      referralData: null,
      referralRef: null,
    };
  }

  const lockData = getDocData(lockSnap) || {};
  const referralDocId = String(lockData?.referralDocId || "").trim();

  if (!referralDocId) {
    return {
      exists: true,
      isActive: false,
      lockData,
      referralData: null,
      referralRef: null,
    };
  }

  const referralRef = adminDb.collection(referralCollectionName).doc(referralDocId);
  const referralSnap = transaction
    ? await transaction.get(referralRef)
    : await referralRef.get();

  if (!referralSnap.exists) {
    return {
      exists: true,
      isActive: false,
      lockData,
      referralData: null,
      referralRef,
    };
  }

  const referralData = getDocData(referralSnap) || {};
  const referralStatus =
    referralData?.dealStatus ||
    referralData?.status ||
    lockData?.status ||
    REFERRAL_STATUSES.PENDING;

  return {
    exists: true,
    isActive: !isFinalReferralStatus(referralStatus),
    lockData,
    referralData,
    referralRef,
  };
}

export async function getCanonicalReferralItem({ adminDb, userCollectionName, cosmoUjbCode, selectedItem }) {
  const cosmoSnap = await adminDb.collection(userCollectionName).doc(cosmoUjbCode).get();

  if (!cosmoSnap.exists) {
    const error = new Error("Cosmo profile not found");
    error.status = 404;
    throw error;
  }

  const data = getDocData(cosmoSnap);
  const rawServices = data?.services
    ? Array.isArray(data.services)
      ? data.services
      : Object.values(data.services)
    : [];
  const rawProducts = data?.products
    ? Array.isArray(data.products)
      ? data.products
      : Object.values(data.products)
    : [];
  const label = String(selectedItem?.label || "").trim();

  return (
    rawServices.find((service) => (service.serviceName || service.name) === label) ||
    rawProducts.find((product) => (product.productName || product.name) === label) ||
    selectedItem.raw ||
    selectedItem
  );
}

export async function createReferralRecord({
  adminDb,
  referralCollectionName,
  userCollectionName,
  payload,
}) {
  const canonical = await getCanonicalReferralItem({
    adminDb,
    userCollectionName,
    cosmoUjbCode: payload.cosmoDetails?.ujbCode,
    selectedItem: payload.selectedItem,
  });
  const finalItem = normalizeReferralItem(canonical);
  const duplicateKey = buildReferralDuplicateKey({
    selectedItem: payload.selectedItem,
    finalItem,
    selectedFor: payload.selectedFor,
    otherName: payload.otherName,
    otherPhone: payload.otherPhone,
    otherEmail: payload.otherEmail,
    cosmoDetails: payload.cosmoDetails,
    orbiterDetails: payload.orbiterDetails,
  });
  const lockRef = adminDb
    .collection(REFERRAL_LOCKS_COLLECTION)
    .doc(buildReferralLockId(duplicateKey));
  const duplicateSnap = await lockRef.get();
  const duplicateState = await resolveDuplicateLockState({
    adminDb,
    referralCollectionName,
    lockRef,
    lockSnap: duplicateSnap,
  });
  const validation = validateReferralCreationRequest({
    payload,
    isDuplicate: duplicateState.isActive,
  });

  if (!validation.ok) {
    const error = new Error(validation.message);
    error.status = validation.status || 400;
    throw error;
  }

  const notifications = buildReferralNotifications({
    selectedItem: payload.selectedItem,
    orbiterDetails: payload.orbiterDetails,
    cosmoDetails: payload.cosmoDetails,
  });

  return adminDb.runTransaction(async (transaction) => {
    const lockSnap = await transaction.get(lockRef);
    const lockState = await resolveDuplicateLockState({
      adminDb,
      referralCollectionName,
      lockRef,
      lockSnap,
      transaction,
    });

    if (lockState.isActive) {
      const error = new Error("This referral has already been passed.");
      error.status = 409;
      throw error;
    }

    const counterRef = adminDb
      .collection(REFERRAL_COUNTER_COLLECTION)
      .doc(REFERRAL_COUNTER_DOC);
    const counterSnap = await transaction.get(counterRef);
    const storedNumber = counterSnap.exists
      ? Number(getDocData(counterSnap)?.lastNumber)
      : NaN;
    const currentNumber = Number.isFinite(storedNumber)
      ? storedNumber
      : DEFAULT_REFERRAL_LAST_NUMBER;
    const nextNumber = currentNumber + 1;
    const referralId = buildReferralId(nextNumber, new Date());
    const referralRef = adminDb.collection(referralCollectionName).doc();
    const auditTimestamp = new Date();

    transaction.set(
      counterRef,
      { lastNumber: nextNumber },
      { merge: true }
    );
    transaction.set(lockRef, {
      duplicateKey,
      referralDocId: referralRef.id,
      referralId,
      referralSource: payload.referralSource || "User",
      status: REFERRAL_STATUSES.PENDING,
      createdAt: auditTimestamp,
      orbiterUjbCode: payload.orbiterDetails?.ujbCode || "",
      cosmoUjbCode: payload.cosmoDetails?.ujbCode || "",
    });
    transaction.set(
      referralRef,
      buildReferralWritePayload({
        referralId,
        referralSource: payload.referralSource || "User",
        leadDescription: payload.leadDescription,
        selectedFor: payload.selectedFor,
        otherName: payload.otherName,
        otherPhone: payload.otherPhone,
        otherEmail: payload.otherEmail,
        selectedItem: payload.selectedItem,
        finalItem,
        cosmoDetails: payload.cosmoDetails,
        orbiterDetails: payload.orbiterDetails,
        duplicateKey,
        timestampValue: auditTimestamp,
        auditTimestamp,
      })
    );

    if (payload.dealStatus && payload.dealStatus !== REFERRAL_STATUSES.PENDING) {
      transaction.set(
        referralRef,
        {
          dealStatus: payload.dealStatus,
          status: payload.dealStatus,
        },
        { merge: true }
      );
    }

    return {
      id: referralRef.id,
      referralId,
      duplicateKey,
      notifications,
    };
  });
}

export async function updateReferralStatusRecord({
  provider,
  adminDb,
  referralCollectionName,
  referralId,
  nextStatus,
  rejectReason = "",
  cpSource = "referral_status_update",
  cpActor = "system",
}) {
  const referral = provider
    ? await provider.referrals.getById(referralId)
    : null;

  if (!provider) {
    const referralRef = adminDb.collection(referralCollectionName).doc(referralId);
    const referralSnap = await referralRef.get();

    if (!referralSnap.exists) {
      const error = new Error("Referral not found");
      error.status = 404;
      throw error;
    }
  }

  const currentReferral =
    referral ||
    getDocData(
      await adminDb.collection(referralCollectionName).doc(referralId).get()
    );

  if (!currentReferral) {
    const error = new Error("Referral not found");
    error.status = 404;
    throw error;
  }

  const validation = validateReferralStatusUpdate({
    currentStatus:
      currentReferral.dealStatus ||
      currentReferral.status ||
      REFERRAL_STATUSES.PENDING,
    nextStatus,
    rejectReason,
  });

  if (!validation.ok) {
    const error = new Error(validation.message);
    error.status = validation.status || 400;
    throw error;
  }

  const now = new Date();
  const payload = buildReferralStatusUpdatePayload({
    nextStatus: validation.nextStatus,
    rejectReason,
    now,
  });

  const update = {
    ...payload,
    statusLogs: [
      ...(Array.isArray(currentReferral.statusLogs)
        ? currentReferral.statusLogs
        : []),
      payload.statusLogs[0],
    ],
  };

  let updatedReferral = null;
  const effectiveDb = adminDb;

  if (provider) {
    updatedReferral = await provider.referrals.updateById(referralId, update);
  } else {
    const referralRef = effectiveDb.collection(referralCollectionName).doc(referralId);
    await referralRef.set(update, { merge: true });

    if (currentReferral?.duplicateKey) {
      const lockRef = effectiveDb
        .collection(REFERRAL_LOCKS_COLLECTION)
        .doc(buildReferralLockId(currentReferral.duplicateKey));

      await lockRef.set(
        {
          status: validation.nextStatus,
          lastUpdated: now,
        },
        { merge: true }
      );
    }

    const updatedSnap = await referralRef.get();
    updatedReferral = {
      id: updatedSnap.id,
      ...getDocData(updatedSnap),
    };
  }

  if (!updatedReferral || !effectiveDb || !referralCollectionName) {
    return {
      referral: updatedReferral,
      cpAwards: [],
      cpAwarded: false,
    };
  }

  const cpAwards = await applyReferralCpRules({
    adminDb: effectiveDb,
    referralCollectionName,
    referralBefore: {
      id: referralId,
      ...currentReferral,
    },
    referralAfter: {
      id: referralId,
      ...updatedReferral,
    },
    actor: cpActor,
    source: cpSource,
  });

  return {
    referral: updatedReferral,
    cpAwards,
    cpAwarded: cpAwards.length > 0,
  };
}

export async function fetchAdminReferralDetail({ provider, id }) {
  const referral = await provider.referrals.getById(id);

  if (!referral) {
    return null;
  }

  const [orbiterProfile, cosmoProfile] = await Promise.all([
    referral.orbiter?.ujbCode
      ? provider.users.getByUjbCode(referral.orbiter.ujbCode)
      : null,
    referral.cosmoOrbiter?.ujbCode
      ? provider.users.getByUjbCode(referral.cosmoOrbiter.ujbCode)
      : null,
  ]);

  return {
    referral,
    orbiter: mergeParticipant(referral.orbiter, orbiterProfile),
    cosmoOrbiter: mergeParticipant(referral.cosmoOrbiter, cosmoProfile),
  };
}

export async function saveAdminReferralDealLog({
  provider,
  referral,
  id,
  distribution,
}) {
  const nextLog = sanitizeForFirestore({
    ...distribution,
    dealStatus: referral?.dealStatus || "Deal Won",
    timestamp: new Date().toISOString(),
    lastDealCalculatedAt: new Date().toISOString(),
  });
  const existingLogs = Array.isArray(referral.dealLogs) ? referral.dealLogs : [];

  return provider.referrals.updateById(id, {
    dealLogs: [...existingLogs, nextLog],
    lastDealCalculatedAt: new Date().toISOString(),
    agreedTotal: nextLog.agreedAmount,
    dealValue: nextLog.dealValue,
  });
}

export async function replaceAdminReferralFollowups({
  provider,
  id,
  followups,
}) {
  return provider.referrals.updateById(id, {
    followups: sanitizeForFirestore(followups || []),
  });
}

export async function attachAdminReferralFile({
  provider,
  referral,
  id,
  type,
  url,
  name,
}) {
  const existing = Array.isArray(referral.supportingDocs)
    ? referral.supportingDocs
    : [];

  return provider.referrals.updateById(id, {
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

export async function deleteAdminReferralFile({
  provider,
  referral,
  id,
  url,
  type,
}) {
  const existing = Array.isArray(referral.supportingDocs)
    ? referral.supportingDocs
    : [];

  return provider.referrals.updateById(id, {
    supportingDocs: existing.filter(
      (entry) =>
        !(String(entry?.url || "") === String(url || "") && String(entry?.type || "") === String(type || ""))
    ),
  });
}

export async function recordAdminReferralCosmoPayment({
  provider,
  referral,
  id,
  entry,
}) {
  const update = buildAdminReferralCosmoPaymentUpdate({ referral, entry });

  return provider.referrals.updateById(id, update);
}

function buildAdminReferralCosmoPaymentUpdate({ referral, entry }) {
  const existingPayments = Array.isArray(referral.payments) ? referral.payments : [];
  const nextPayments = dedupePayments([
    ...existingPayments,
    sanitizeForFirestore(entry),
  ]);
  const nextUjbBalance =
    toNumber(referral.ujbBalance, 0) + toNumber(entry.amountReceived, 0);
  const nextTdsReceivable =
    toNumber(referral.tdsReceivable, 0) + toNumber(entry.tdsAmount, 0);

  return {
    payments: nextPayments,
    ujbBalance: nextUjbBalance,
    tdsReceivable: nextTdsReceivable,
  };
}

function hasInvoicePaymentEntry({ referral, invoiceId }) {
  const target = normalizeText(invoiceId);
  const payments = Array.isArray(referral?.payments) ? referral.payments : [];

  return payments.some(
    (payment) =>
      normalizeText(payment?.meta?.invoiceId) === target ||
      normalizeText(payment?.invoiceId) === target ||
      normalizeText(payment?.paymentId) === `INV-PAY-${target}`
  );
}

function buildInvoiceLinkedCosmoPayment({ invoice, now }) {
  const taxableAmount = roundCurrency(
    invoice?.baseAmount || invoice?.totals?.taxableAmount || 0
  );
  const invoiceTotal = roundCurrency(
    invoice?.totalAmount || invoice?.totals?.totalAmount || 0
  );
  const accountPayment = invoice?.accountPayment || {};
  const orbiterShare = roundCurrency((taxableAmount * 50) / 100);
  const orbiterMentorShare = roundCurrency((taxableAmount * 15) / 100);
  const cosmoMentorShare = roundCurrency((taxableAmount * 15) / 100);
  const ujustbeShare = roundCurrency(
    taxableAmount - orbiterShare - orbiterMentorShare - cosmoMentorShare
  );

  return sanitizeForFirestore({
    paymentId: `INV-PAY-${invoice.invoiceId}`,
    paymentFrom: "CosmoOrbiter",
    paymentTo: "UJustBe",
    grossAmount: taxableAmount,
    tdsAmount: 0,
    tdsRate: 0,
    amountReceived: taxableAmount,
    distribution: {
      orbiter: orbiterShare,
      orbiterMentor: orbiterMentorShare,
      cosmoMentor: cosmoMentorShare,
      ujustbe: ujustbeShare,
    },
    paymentDate:
      normalizeText(accountPayment.paidAt)?.split("T")?.[0] ||
      now.toISOString().split("T")[0],
    modeOfPayment: normalizeText(accountPayment.paymentMode),
    transactionRef: normalizeText(accountPayment.paymentReference),
    createdAt: now.toISOString(),
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    meta: {
      isCosmoToUjb: true,
      isInvoiceLinkedPayment: true,
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceTotalAmount: invoiceTotal,
      gstAmount: roundCurrency(invoice?.gstAmount || invoice?.totals?.gstAmount || 0),
      taxableAmount,
      dealTransactionId: invoice.dealTransactionId || "",
    },
  });
}

export async function recordAdminReferralUjbPayout({
  provider,
  referral,
  id,
  entry,
  recipientField,
  processedBy = "",
}) {
  await creditWalletForReferralRelease({
    referralId: id,
    referral,
    recipient: entry?.paymentTo,
    recipientUserId: entry?.meta?.recipientUjbCode || "",
    amount: entry?.meta?.logicalAmount ?? entry?.amountReceived,
    cosmoPaymentId: entry?.meta?.belongsToPaymentId || "",
    note: `UJustBe Reciprocation for Referral ${referral?.referralId || id} at ${entry?.paymentDate || new Date().toISOString().split("T")[0]}`,
    processedBy,
  });

  const existingPayments = Array.isArray(referral.payments) ? referral.payments : [];
  const nextPayments = dedupePayments([
    ...existingPayments,
    sanitizeForFirestore(entry),
  ]);
  const nextUjbBalance =
    toNumber(referral.ujbBalance, 0) - toNumber(entry.amountReceived, 0);
  const nextRecipientTotal =
    toNumber(referral[recipientField], 0) +
    toNumber(entry.meta?.logicalAmount, 0);

  const updatedReferral = await provider.referrals.updateById(id, {
    payments: nextPayments,
    ujbBalance: nextUjbBalance,
    [recipientField]: nextRecipientTotal,
  });

  return updatedReferral;
}

export async function recordUserReferralDealTransaction({
  provider,
  referral,
  id,
  entry,
  actorUjbCode,
}) {
  const role = getReferralParticipantRole({
    referral,
    sessionUjbCode: actorUjbCode,
  });

  if (role !== "cosmo") {
    const error = new Error("Only the receiving CosmOrbiter can record deal transactions.");
    error.status = 403;
    throw error;
  }

  return recordReferralDealTransactionShared({
    provider,
    referral,
    id,
    entry,
    recordedByUjbCode: actorUjbCode,
  });
}

export async function recordAdminReferralDealTransaction({
  provider,
  referral,
  id,
  entry,
  adminActorId = "",
}) {
  return recordReferralDealTransactionShared({
    provider,
    referral,
    id,
    entry,
    recordedByUjbCode: normalizeText(adminActorId) || "admin_support",
    source: "admin_support_override",
  });
}

async function recordReferralDealTransactionShared({
  provider,
  referral,
  id,
  entry,
  recordedByUjbCode,
  source = "cosmo_user",
}) {

  const amountReceived = roundCurrency(entry?.amountReceived);
  const modeOfPayment = normalizeText(entry?.modeOfPayment);
  const paymentDate = normalizeText(entry?.paymentDate);
  const allowedModes = new Set(["UPI", "Bank Transfer", "Cash", "Cheque"]);

  if (amountReceived <= 0) {
    const error = new Error("Enter a valid amount received.");
    error.status = 422;
    throw error;
  }

  if (!allowedModes.has(modeOfPayment)) {
    const error = new Error("Choose a valid mode of payment.");
    error.status = 422;
    throw error;
  }

  if (!paymentDate) {
    const error = new Error("Select payment date.");
    error.status = 422;
    throw error;
  }

  const dealValue = getFinalizedDealValue(referral);

  if (dealValue <= 0) {
    const error = new Error("Finalize the deal value before recording payment.");
    error.status = 422;
    throw error;
  }

  const existingTransactions = Array.isArray(referral?.dealTransactions)
    ? referral.dealTransactions
    : [];
  const existingInvoices = Array.isArray(referral?.ujustbeeInvoices)
    ? referral.ujustbeeInvoices
    : [];
  const previousReceived = roundCurrency(
    existingTransactions.reduce(
      (sum, item) => sum + toNumber(item?.amountReceived, 0),
      0
    )
  );
  const nextReceived = roundCurrency(previousReceived + amountReceived);

  if (nextReceived > dealValue) {
    const error = new Error("Recorded payments cannot be greater than finalized deal value.");
    error.status = 422;
    throw error;
  }

  const now = new Date();
  const transactionId = `DEAL-TXN-${now.getTime()}`;
  const orbiter = referral?.orbiter || {};
  const cosmo = referral?.cosmoOrbiter || {};
  const calculation = calculateInvoiceBase({
    referral,
    amountReceived,
    dealValue,
    previousReceived,
    existingInvoices,
  });
  const transaction = sanitizeForFirestore({
    transactionId,
    amountReceived,
    modeOfPayment,
    transactionRef: normalizeText(entry?.transactionRef),
    paymentDate,
    paymentFromUjbCode:
      orbiter?.ujbCode || orbiter?.UJBCode || referral?.orbiterUJBCode || "",
    paymentToUjbCode:
      cosmo?.ujbCode || cosmo?.UJBCode || referral?.cosmoUjbCode || "",
    recordedByUjbCode: normalizeText(recordedByUjbCode),
    createdAt: now.toISOString(),
    linkedInvoiceId: "",
    source,
  });
  const invoice = buildUjustbeeInvoice({
    referral: { ...referral, id },
    transaction,
    invoiceBase: calculation.invoiceBase,
    calculation: {
      ...calculation,
      finalizedDealValue: dealValue,
    },
    now,
  });

  const linkedTransaction = {
    ...transaction,
    linkedInvoiceId: invoice.invoiceId,
  };
  const nextTransactions = [...existingTransactions, linkedTransaction];
  const nextInvoices = [...existingInvoices, invoice];

  return provider.referrals.updateById(id, {
    dealTransactions: sanitizeForFirestore(nextTransactions),
    ujustbeeInvoices: sanitizeForFirestore(nextInvoices),
    dealTransactionTotalReceived: nextReceived,
    ujustbeeInvoiceBaseTotal: roundCurrency(
      nextInvoices.reduce((sum, item) => sum + toNumber(item?.baseAmount, 0), 0)
    ),
    ujustbeeInvoiceTotalPayable: roundCurrency(
      nextInvoices.reduce((sum, item) => sum + toNumber(item?.totalAmount, 0), 0)
    ),
  });
}

export function listReferralInvoices(referrals = []) {
  return referrals.flatMap((referral) => {
    const invoices = Array.isArray(referral?.ujustbeeInvoices)
      ? referral.ujustbeeInvoices
      : [];

    return invoices.map((invoice) => ({
      ...invoice,
      referralDocId: referral?.id || "",
      referralId: invoice?.referralId || referral?.id || "",
      referralDisplayId:
        invoice?.referralDisplayId || referral?.referralId || referral?.id || "",
      dealStatus: referral?.dealStatus || referral?.status || "",
    }));
  });
}

export async function updateReferralInvoiceStatus({
  provider,
  referral,
  id,
  invoiceId,
  status,
  paymentMode = "",
  paymentReference = "",
  paidAt = "",
  notes = "",
  adminId = "",
}) {
  const normalizedStatus = getInvoiceStatus(status);
  const invoices = Array.isArray(referral?.ujustbeeInvoices)
    ? referral.ujustbeeInvoices
    : [];
  const targetInvoiceId = normalizeText(invoiceId);
  const now = new Date().toISOString();
  const nowDate = new Date(now);
  let found = false;
  let updatedInvoice = null;
  let previousInvoiceStatus = "";
  const adminActor = normalizeText(adminId);

  const nextInvoices = invoices.map((invoice) => {
    if (normalizeText(invoice?.invoiceId) !== targetInvoiceId) {
      return invoice;
    }

    found = true;
    previousInvoiceStatus = getInvoiceStatus(invoice?.status);

    if (
      previousInvoiceStatus === "Paid" &&
      normalizedStatus !== "Paid"
    ) {
      const error = new Error("Paid invoices cannot be changed back.");
      error.status = 422;
      throw error;
    }

    const totalAmount = roundCurrency(invoice?.totalAmount || invoice?.totals?.totalAmount || 0);
    const amountPaid = normalizedStatus === "Paid" ? totalAmount : 0;
    const effectivePaidAt =
      normalizedStatus === "Paid" ? normalizeText(paidAt) || now : null;
    const statusAuditLogs = Array.isArray(invoice?.statusAuditLogs)
      ? invoice.statusAuditLogs
      : [];
    const nextStatusAuditLogs = [
      ...statusAuditLogs,
      sanitizeForFirestore({
        at: now,
        fromStatus: previousInvoiceStatus,
        toStatus: normalizedStatus,
        changedByAdminId: adminActor,
        paymentMode: normalizeText(paymentMode),
        paymentReference: normalizeText(paymentReference),
        paidAt: effectivePaidAt,
        notes: normalizeText(notes),
      }),
    ];

    updatedInvoice = sanitizeForFirestore({
      ...invoice,
      status: normalizedStatus,
      updatedAt: now,
      statusAuditLogs: nextStatusAuditLogs,
      totals: {
        ...(invoice?.totals || {}),
        amountPaid,
        balanceDue: normalizedStatus === "Paid" ? 0 : totalAmount,
      },
      accountPayment: {
        ...(invoice?.accountPayment || {}),
        paidAt: effectivePaidAt,
        paymentMode: normalizeText(paymentMode),
        paymentReference: normalizeText(paymentReference),
        receivedByAdminId: normalizeText(adminId),
        notes: normalizeText(notes),
      },
    });

    return updatedInvoice;
  });

  if (!found) {
    const error = new Error("Invoice not found");
    error.status = 404;
    throw error;
  }

  let update = {
    ujustbeeInvoices: sanitizeForFirestore(nextInvoices),
  };

  if (
    normalizedStatus === "Paid" &&
    previousInvoiceStatus !== "Paid" &&
    updatedInvoice &&
    !hasInvoicePaymentEntry({ referral, invoiceId: targetInvoiceId })
  ) {
    update = {
      ...update,
      ...buildAdminReferralCosmoPaymentUpdate({
        referral,
        entry: buildInvoiceLinkedCosmoPayment({
          invoice: updatedInvoice,
          now: nowDate,
        }),
      }),
    };
  }

  return provider.referrals.updateById(id, update);
}

export function getReferralParticipantRole({ referral, sessionUjbCode }) {
  const actorCode = normalizeUjbCode(sessionUjbCode);

  if (!actorCode) {
    return null;
  }

  const cosmoCode = normalizeUjbCode(
    referral?.cosmoUjbCode || referral?.cosmoOrbiter?.ujbCode
  );
  const orbiterCode = normalizeUjbCode(
    referral?.orbiterUJBCode ||
    referral?.orbiter?.ujbCode ||
    referral?.orbiter?.UJBCode
  );

  if (actorCode === cosmoCode) {
    return "cosmo";
  }

  if (actorCode === orbiterCode) {
    return "orbiter";
  }

  return null;
}

export function canUserUpdateReferralStatus({ referral, sessionUjbCode }) {
  const role = getReferralParticipantRole({ referral, sessionUjbCode });
  return role === "cosmo" || role === "orbiter";
}
