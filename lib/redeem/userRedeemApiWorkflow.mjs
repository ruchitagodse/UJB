import { serializeFirestoreValue } from "@/lib/data/firebase/documentRepository.mjs";
import sanitizeForFirestore from "@/utils/sanitizeForFirestore";

export const CC_REDEMPTION_COLLECTION = "CCRedemption";
export const CC_REFERRAL_COLLECTION = "CCReferral";

function normalizeNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDealItems(deal) {
  return [
    ...(deal.selectedItem ? [deal.selectedItem] : []),
    ...(Array.isArray(deal.multipleItems) ? deal.multipleItems : []),
  ];
}

export function normalizeRedemptionDeal(docSnap) {
  const deal = {
    id: docSnap.id,
    ...serializeFirestoreValue(docSnap.data() || {}),
  };
  const items = buildDealItems(deal);

  return {
    ...deal,
    items,
    displayName: items.map((item) => item?.name).filter(Boolean).join(", "),
    displayDescription: items
      .map((item) => item?.description)
      .filter(Boolean)
      .join(" "),
    displayImage: items.find((item) => item?.imageURL)?.imageURL || "",
    searchText: [
      deal.cosmo?.Name,
      deal.redemptionCategory,
      ...items.flatMap((item) => [item?.name, item?.description]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export async function listApprovedRedemptionDeals(adminDb) {
  const snapshot = await adminDb.collection(CC_REDEMPTION_COLLECTION).get();

  return snapshot.docs
    .map(normalizeRedemptionDeal)
    .filter((deal) => deal.status === "Approved");
}

export async function getApprovedRedemptionDealById(adminDb, id) {
  const snap = await adminDb.collection(CC_REDEMPTION_COLLECTION).doc(id).get();

  if (!snap.exists) {
    return null;
  }

  const deal = normalizeRedemptionDeal(snap);
  return deal.status === "Approved" ? deal : null;
}

export function getOriginalPercent(item) {
  if (!item?.agreedValue) return 0;

  if (
    item.agreedValue.mode === "single" &&
    item.agreedValue.single?.type === "percentage"
  ) {
    return normalizeNumber(item.agreedValue.single.value);
  }

  if (
    item.agreedValue.mode === "multiple" &&
    item.agreedValue.multiple?.slabs?.length
  ) {
    return normalizeNumber(item.agreedValue.multiple.slabs[0]?.value);
  }

  return 0;
}

export function buildRedeemProfile(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    ujbCode: user.UJBCode || user.ujbCode || user.id || "",
    name: user.Name || user.name || "",
    phone: user.MobileNo || user.phone || "",
    email: user.Email || user.email || "",
    category: user.Category || user.category || "",
    services: Array.isArray(user.services) ? user.services : [],
    products: Array.isArray(user.products) ? user.products : [],
    agreementAccepted: user.ccRedemptionAgreementAccepted === true,
  };
}

export function buildRedeemRequestPayload({
  profile,
  mode,
  selectedItem,
  multipleItems,
  originalPercent,
  enhanceRequired,
  enhancedPercent,
  finalPercent,
}) {
  return sanitizeForFirestore({
    requestedBy: profile.ujbCode,
    cosmo: {
      Name: profile.name,
      MobileNo: profile.phone,
      Email: profile.email,
      ujbCode: profile.ujbCode,
    },
    mode,
    selectedItem: mode === "single" ? selectedItem : null,
    multipleItems: mode === "multiple" ? multipleItems : [],
    allItems: mode === "all",
    agreedPercentage: {
      originalPercent: normalizeNumber(originalPercent),
      enhancementApplied: enhanceRequired,
      enhancedPercent:
        enhanceRequired === "YES" ? normalizeNumber(enhancedPercent) : 0,
      finalAgreedPercent:
        enhanceRequired === "YES"
          ? normalizeNumber(finalPercent)
          : normalizeNumber(originalPercent),
    },
    status: "Requested",
    createdAt: new Date(),
  });
}

export function buildCcReferralPayload({ deal, orbiter, leadDescription }) {
  const cosmo = deal?.cosmo || {};
  const firstItem = deal?.items?.[0] || {};

  return sanitizeForFirestore({
    referralId: `CCR-${Date.now()}`,
    referralSource: "CC",
    referralType: "CCDeal",
    dealStatus: "Pending",
    status: "Pending",
    createdAt: new Date(),
    timestamp: new Date(),
    orbiter: orbiter || null,
    orbiterUJBCode: orbiter?.ujbCode || "",
    cosmoOrbiter: {
      name: cosmo.Name || cosmo.name || "",
      phone: cosmo.MobileNo || cosmo.phone || "",
      email: cosmo.Email || cosmo.email || "",
      ujbCode: cosmo.UJBCode || cosmo.ujbCode || "",
      mentorName: cosmo.mentorName || cosmo.MentorName || "",
      mentorUJBCode: cosmo.mentorUJBCode || cosmo.MentorUJBCode || "",
      mentorResidentStatus:
        cosmo.mentorResidentStatus || cosmo.MentorResidentStatus || "Resident",
      residentStatus:
        cosmo.residentStatus || cosmo.ResidentStatus || "Resident",
    },
    leadRequirement: leadDescription,
    category: deal.redemptionCategory || "",
    itemName: deal.displayName || firstItem.name || "",
    itemDescription: deal.displayDescription || firstItem.description || "",
    itemImage: deal.displayImage || firstItem.imageURL || "",
    selectedItem: {
      name: deal.displayName || firstItem.name || "",
      description: deal.displayDescription || firstItem.description || "",
      imageURL: deal.displayImage || firstItem.imageURL || "",
    },
    sourceDealId: deal.id,
    sourceDealTitle: deal.displayName || firstItem.name || "",
    followups: [],
    payments: [],
    dealLogs: [],
    statusLogs: [
      {
        status: "Pending",
        updatedAt: new Date().toISOString(),
      },
    ],
    supportingDocs: [],
    paidToOrbiter: 0,
    paidToOrbiterMentor: 0,
    paidToCosmoMentor: 0,
    ujbBalance: 0,
  });
}

function getUserRoleFromCategory(category) {
  const normalized = String(category || "").toLowerCase();

  if (normalized.includes("cosmo")) return "CosmoOrbiter";
  if (normalized.includes("ujustbe") || normalized === "admin") return "UJustBe";
  if (normalized.includes("orbiter")) return "Orbiter";
  return "";
}

function formatPaymentDate(value) {
  const date = normalizeTimestamp(value);
  return date ? date.toLocaleDateString("en-GB") : "N/A";
}

export async function buildUserPaymentsSummary({ adminDb, ujbCode, category, referralCollectionName }) {
  if (!ujbCode) {
    return { payments: [], totalReceived: 0, role: "" };
  }

  const role = getUserRoleFromCategory(category);
  const collectionsToScan = [referralCollectionName, CC_REFERRAL_COLLECTION];
  const snapshots = await Promise.all(
    collectionsToScan.map((name) => adminDb.collection(name).get())
  );

  const payments = [];

  snapshots.forEach((snapshot, index) => {
    const sourceCollection = collectionsToScan[index];

    snapshot.forEach((docSnap) => {
      const data = serializeFirestoreValue(docSnap.data() || {});
      const orbiterUjb = data?.orbiter?.ujbCode || data?.orbiterUJBCode;
      const cosmoUjb =
        data?.cosmoOrbiter?.ujbCode || data?.cosmo?.ujbCode || data?.requestedBy;

      const userIsOrbiter = ujbCode === orbiterUjb;
      const userIsCosmo = ujbCode === cosmoUjb;
      const userIsUjb = role === "UJustBe";

      if (!Array.isArray(data.payments)) return;

      data.payments.forEach((payment, paymentIndex) => {
        const normalizedDate = normalizeTimestamp(payment.paymentDate);
        const stablePaymentId =
          payment.transactionRef ||
          normalizedDate?.toISOString() ||
          `payment-${paymentIndex}`;

        const isSender =
          (userIsOrbiter && payment.paymentFrom === "Orbiter") ||
          (userIsCosmo && payment.paymentFrom === "CosmoOrbiter") ||
          (userIsUjb && payment.paymentFrom === "UJustBe");

        const isReceiver =
          (userIsOrbiter && payment.paymentTo === "Orbiter") ||
          (userIsCosmo && payment.paymentTo === "CosmoOrbiter") ||
          (userIsUjb && payment.paymentTo === "UJustBe");

        if (!isSender && !isReceiver) return;

        payments.push({
          id: `${docSnap.id}-${stablePaymentId}`,
          referralId: payment.referralId || docSnap.id,
          sourceCollection,
          paymentFrom: payment.paymentFrom || "-",
          paymentFromName: payment.paymentFromName || "-",
          paymentTo: payment.paymentTo || "-",
          paymentToName: payment.paymentToName || "-",
          amountReceived: normalizeNumber(payment.amountReceived),
          adjustedAmount: normalizeNumber(payment.adjustedAmount),
          actualReceived: normalizeNumber(payment.actualReceived),
          modeOfPayment: payment.modeOfPayment || "-",
          paymentDate: normalizedDate ? normalizedDate.toISOString() : null,
          paymentDateLabel: formatPaymentDate(payment.paymentDate),
          feeType: payment.feeType || "-",
          transactionRef: payment.transactionRef || "-",
        });
      });
    });
  });

  payments.sort((left, right) => {
    const leftTime = left.paymentDate ? new Date(left.paymentDate).getTime() : 0;
    const rightTime = right.paymentDate ? new Date(right.paymentDate).getTime() : 0;
    return rightTime - leftTime;
  });

  const totalReceived = payments.reduce(
    (sum, payment) => sum + normalizeNumber(payment.actualReceived),
    0
  );

  return { payments, totalReceived, role };
}
