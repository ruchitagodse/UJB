function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeEmail(value) {
  return normalizeText(value);
}

function normalizeUjbCode(value) {
  return String(value || "").trim().toUpperCase();
}

function getItemType(item = {}, fallbackType = "") {
  const type = String(item?.type || fallbackType || "").trim().toLowerCase();
  return type === "product" ? "product" : "service";
}

function getItemLabel(selectedItem, finalItem) {
  return (
    String(
      selectedItem?.label ||
        finalItem?.serviceName ||
        finalItem?.productName ||
        finalItem?.name ||
        ""
    ).trim() || "unknown"
  );
}

function buildTargetIdentity({
  selectedFor,
  otherName,
  otherPhone,
  otherEmail,
  orbiterDetails,
}) {
  if (selectedFor === "someone") {
    return (
      normalizePhone(otherPhone) ||
      normalizeEmail(otherEmail) ||
      normalizeText(otherName) ||
      "unknown"
    );
  }

  return (
    normalizeUjbCode(orbiterDetails?.ujbCode) ||
    normalizePhone(orbiterDetails?.phone) ||
    normalizeEmail(orbiterDetails?.email) ||
    "self"
  );
}

function hasSameIdentity(left = {}, right = {}) {
  const leftUjb = normalizeUjbCode(left.ujbCode);
  const rightUjb = normalizeUjbCode(right.ujbCode);

  if (leftUjb && rightUjb && leftUjb === rightUjb) {
    return true;
  }

  const leftEmail = normalizeEmail(left.email);
  const rightEmail = normalizeEmail(right.email);

  if (leftEmail && rightEmail && leftEmail === rightEmail) {
    return true;
  }

  const leftPhone = normalizePhone(left.phone);
  const rightPhone = normalizePhone(right.phone);

  return Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
}

export function isValidReferralPhone(value) {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 15;
}

export function isValidReferralEmail(value) {
  const normalized = normalizeEmail(value);

  if (!normalized) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function validateReferralPayload({
  selectedItem,
  leadDescription,
  selectedFor,
  otherName,
  otherPhone,
  otherEmail,
  cosmoDetails,
  orbiterDetails,
}) {
  if (!selectedItem) {
    return { ok: false, message: "Please select a service or product." };
  }

  if (!String(leadDescription || "").trim()) {
    return { ok: false, message: "Please enter a lead description." };
  }

  if (!orbiterDetails || !cosmoDetails) {
    return { ok: false, message: "Referral users are missing." };
  }

  if (hasSameIdentity(orbiterDetails, cosmoDetails)) {
    return {
      ok: false,
      message: "You cannot pass a referral to yourself.",
    };
  }

  if (selectedFor === "someone") {
    if (!String(otherName || "").trim()) {
      return {
        ok: false,
        message: "Please enter the referred person's name.",
      };
    }

    if (!isValidReferralPhone(otherPhone)) {
      return {
        ok: false,
        message: "Please enter a valid phone number for the referred person.",
      };
    }

    if (!isValidReferralEmail(otherEmail)) {
      return {
        ok: false,
        message: "Please enter a valid email address.",
      };
    }
  }

  return { ok: true };
}

export function buildReferralDuplicateKey({
  selectedItem,
  finalItem,
  selectedFor,
  otherName,
  otherPhone,
  otherEmail,
  cosmoDetails,
  orbiterDetails,
}) {
  const orbiterKey =
    normalizeUjbCode(orbiterDetails?.ujbCode) ||
    normalizePhone(orbiterDetails?.phone) ||
    normalizeEmail(orbiterDetails?.email) ||
    "unknown-orbiter";
  const cosmoKey =
    normalizeUjbCode(cosmoDetails?.ujbCode) ||
    normalizePhone(cosmoDetails?.phone) ||
    normalizeEmail(cosmoDetails?.email) ||
    "unknown-cosmo";
  const itemType = getItemType(selectedItem, finalItem?.type);
  const itemLabel = normalizeText(getItemLabel(selectedItem, finalItem));
  const targetKey = buildTargetIdentity({
    selectedFor,
    otherName,
    otherPhone,
    otherEmail,
    orbiterDetails,
  });

  return [
    `orbiter:${orbiterKey}`,
    `cosmo:${cosmoKey}`,
    `item:${itemType}:${itemLabel}`,
    `for:${selectedFor === "someone" ? "someone" : "self"}`,
    `target:${targetKey}`,
  ].join("|");
}

export function buildDuplicateKeyFromReferralRecord(record = {}) {
  const selectedItem = record?.product
    ? {
        type: "product",
        label: record.product.productName || record.product.name || "",
      }
    : {
        type: "service",
        label: record.service?.serviceName || record.service?.name || "",
      };

  return buildReferralDuplicateKey({
    selectedItem,
    finalItem: record.product || record.service || null,
    selectedFor:
      String(record.referralType || "").trim().toLowerCase() === "others"
        ? "someone"
        : "self",
    otherName: record.referredForName,
    otherPhone: record.referredForPhone,
    otherEmail: record.referredForEmail,
    cosmoDetails: {
      ujbCode: record.cosmoUjbCode || record.cosmoOrbiter?.ujbCode,
      email: record.cosmoOrbiter?.email,
      phone: record.cosmoOrbiter?.phone,
    },
    orbiterDetails: {
      ujbCode: record.orbiter?.ujbCode,
      email: record.orbiter?.email,
      phone: record.orbiter?.phone,
    },
  });
}

import {
  commercialModelToAgreedValue,
  normalizeCommercialModel,
} from "../../utils/commercialModel.js";

export function buildReferralLockId(key) {
  let hash = 1469598103934665603n;

  for (const char of String(key || "")) {
    hash ^= BigInt(char.charCodeAt(0));
    hash *= 1099511628211n;
    hash &= 18446744073709551615n;
  }

  return `user-referral-${hash.toString(16)}`;
}

export function normalizeReferralItem(item) {
  if (!item) return null;

  const normalized = JSON.parse(JSON.stringify(item));

  if (!normalized.agreedValue && normalized.percentage != null) {
    normalized.agreedValue = {
      mode: "single",
      single: { type: "percentage", value: String(normalized.percentage) },
      multiple: { slabs: [], itemSlabs: [] },
    };
  }

  normalized.commercialModel = normalizeCommercialModel(
    normalized.commercialModel,
    normalized.agreedValue
  );
  normalized.agreedValue = commercialModelToAgreedValue(
    normalized.commercialModel
  );

  return normalized;
}

export function buildReferralId(currentNumber, now = new Date()) {
  const year1 = now.getFullYear() % 100;
  const year2 = (now.getFullYear() + 1) % 100;

  return `Ref/${year1}-${year2}/${String(currentNumber).padStart(8, "0")}`;
}

export function buildReferralWritePayload({
  referralId,
  referralSource = "User",
  leadDescription,
  selectedFor,
  otherName,
  otherPhone,
  otherEmail,
  selectedItem,
  finalItem,
  cosmoDetails,
  orbiterDetails,
  duplicateKey,
  timestampValue,
  auditTimestamp,
}) {
  const itemType = getItemType(selectedItem, finalItem?.type);
  const itemName = getItemLabel(selectedItem, finalItem);

  return {
    referralId,
    referralSource,
    referralType: selectedFor === "self" ? "Self" : "Others",
    status: "Pending",
    leadDescription,
    itemName,
    duplicateKey,
    dealStatus: "Pending",
    lastUpdated: timestampValue,
    timestamp: timestampValue,
    createdAt: auditTimestamp,
    cosmoUjbCode: cosmoDetails.ujbCode,
    cosmoOrbiter: {
      name: cosmoDetails.name,
      email: cosmoDetails.email,
      phone: cosmoDetails.phone,
      ujbCode: cosmoDetails.ujbCode,
      mentorName: cosmoDetails.mentorName || null,
      mentorPhone: cosmoDetails.mentorPhone || null,
    },
    orbiter: {
      name: orbiterDetails.name,
      email: orbiterDetails.email,
      phone: orbiterDetails.phone,
      ujbCode: orbiterDetails.ujbCode,
      mentorName: orbiterDetails.mentorName || null,
      mentorPhone: orbiterDetails.mentorPhone || null,
    },
    referredForName: selectedFor === "someone" ? otherName : null,
    referredForPhone:
      selectedFor === "someone" ? normalizePhone(otherPhone) : null,
    referredForEmail:
      selectedFor === "someone" ? normalizeEmail(otherEmail) : null,
    service: itemType === "service" ? finalItem : null,
    product: itemType === "product" ? finalItem : null,
    dealLogs: [],
    followups: [],
    statusLogs: [
      {
        status: "Pending",
        updatedAt: auditTimestamp,
      },
    ],
  };
}

export function buildReferralNotifications({
  selectedItem,
  orbiterDetails,
  cosmoDetails,
}) {
  const itemLabel = selectedItem.label;

  return [
    {
      phone: orbiterDetails.phone,
      parameters: [
        orbiterDetails.name,
        `🚀 You’ve successfully passed a referral for ${itemLabel}.`,
      ],
    },
    {
      phone: cosmoDetails.phone,
      parameters: [
        cosmoDetails.name,
        `✨ You’ve received a referral for ${itemLabel}.`,
      ],
    },
  ];
}
