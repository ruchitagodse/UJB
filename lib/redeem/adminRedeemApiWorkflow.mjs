import { serializeFirestoreValue } from "@/lib/data/firebase/documentRepository.mjs";
import sanitizeForFirestore from "@/utils/sanitizeForFirestore";

export const CC_REDEMPTION_COLLECTION = "CCRedemption";

function normalizeNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
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

export function getAveragePercent(items = []) {
  const percents = items.map(getOriginalPercent).filter((value) => value > 0);

  if (!percents.length) {
    return 0;
  }

  return Math.round(
    percents.reduce((sum, value) => sum + value, 0) / percents.length
  );
}

export function mapRedeemAdminUser(user) {
  return {
    id: user.id || user.UJBCode || user.ujbCode || "",
    ujbCode: user.UJBCode || user.ujbCode || user.id || "",
    name: user.Name || user.name || "",
    phone: user.MobileNo || user.phone || "",
    email: user.Email || user.email || "",
    category: user.Category || user.category || "",
    services: Array.isArray(user.services) ? user.services : [],
    products: Array.isArray(user.products) ? user.products : [],
  };
}

export function buildApprovedRedeemDealPayload({
  user,
  category,
  mode,
  selectedItem,
  multipleItems,
  originalPercent,
  enhanceRequired,
  enhancedPercent,
  finalPercent,
  minPoints,
  maxPoints,
}) {
  return sanitizeForFirestore({
    requestedBy: user.ujbCode,
    cosmo: {
      Name: user.name,
      MobileNo: user.phone,
      Email: user.email,
      ujbCode: user.ujbCode,
    },
    category,
    redemptionCategory: category,
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
    redeemPointsRequired: {
      minPoints: normalizeNumber(minPoints),
      maxPoints: normalizeNumber(maxPoints),
    },
    modelLocked: true,
    status: "Approved",
    createdAt: new Date(),
  });
}

export function normalizeRedeemDealDoc(docSnap) {
  return {
    id: docSnap.id,
    ...serializeFirestoreValue(docSnap.data() || {}),
  };
}

export function buildRedeemDealUpdate(payload) {
  return sanitizeForFirestore({
    redemptionCategory: payload.category,
    category: payload.category,
    agreedPercentage: {
      originalPercent: normalizeNumber(payload.originalPercent),
      enhancementApplied: payload.enhancedPercent > 0 ? "YES" : "NO",
      enhancedPercent: normalizeNumber(payload.enhancedPercent),
      finalAgreedPercent: normalizeNumber(payload.finalPercent),
    },
    redeemPointsRequired: {
      minPoints: normalizeNumber(payload.minPoints),
      maxPoints: normalizeNumber(payload.maxPoints),
    },
    updatedAt: new Date(),
  });
}
