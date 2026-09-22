import { REFERRAL_STATUSES, normalizeReferralStatus } from "./referralStates.mjs";

const CP_BOARD_COLLECTION = "CPBoard";
const ACTIVITIES_SUBCOLLECTION = "activities";
const CP_ACTIVITY_COLLECTION = "cpactivity";
const RULE_VERSION = "referral_cp_v1";

const CP_ACTIVITY_DEFS = Object.freeze({
  "020": { activityName: "Referral Identification by the Prospect (DIP Status)", points: 125, categories: ["R"] },
  "021": { activityName: "Referral Identification by Self (DIP Status)", points: 100, categories: ["R"] },
  "022": { activityName: "Referral Closure passed by Prospect", points: 200, categories: ["R", "W"] },
  "023": { activityName: "Referral Closure passed by Self", points: 150, categories: ["R", "W"] },
  "024": { activityName: "Referral passed for Third Party (DIP Status)", points: 75, categories: ["R", "W"] },
  "025": { activityName: "Referral Closure passed for Third Party", points: 125, categories: ["R", "W"] },
  "026": { activityName: "Self Referral Deal value more than 50k", points: 200, categories: ["W"] },
  "027": { activityName: "Prospect Referral Deal value more than 50k", points: 300, categories: ["R", "W"] },
  "028": { activityName: "Third Party Referral Deal value more than 50k", points: 175, categories: ["R", "W"] },
  "029": { activityName: "Identifying 2 or more referral in a month for Self", points: 200, categories: ["W"] },
  "030": { activityName: "Identifying 5 or more referral in a month for Third Party", points: 300, categories: ["R", "W"] },
  "031": { activityName: "Identifying 2 or more referral in a month by Prospect in first 2 months", points: 300, categories: ["R", "W"] },
});

const CP_NOTIFICATION_TEMPLATE_KEYS = Object.freeze({
  "020": "referral_identification_prospect",
  "021": "referral_identification_self",
  "022": "referral_closure_prospect",
  "023": "referral_closure_self",
  "024": "referral_identification_third_party",
  "025": "referral_closure_third_party",
  "026": "referral_deal_value_self_50k",
  "027": "referral_deal_value_prospect_50k",
  "028": "referral_deal_value_third_party_50k",
  "029": "referral_monthly_self_threshold",
  "030": "referral_monthly_third_party_threshold",
  "031": "referral_monthly_prospect_threshold",
});

function toNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function normalizeUjbCode(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function normalizeName(value) {
  return String(value || "").trim();
}

function getTimestamp(referral = {}) {
  const raw = referral?.timestamp || referral?.createdAt || referral?.lastUpdated;
  if (raw?.toDate) return raw.toDate();
  const parsed = new Date(raw || 0);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getMonthKey(dateValue = new Date()) {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function splitCategoryPoints(categories = [], points = 0) {
  const unique = Array.from(new Set((Array.isArray(categories) ? categories : []).filter(Boolean)));
  const normalizedPoints = toNumber(points);
  const totals = { R: 0, H: 0, W: 0 };

  if (unique.length === 0 || normalizedPoints <= 0) {
    return totals;
  }

  if (unique.length === 1) {
    const key = unique[0];
    if (key in totals) totals[key] = normalizedPoints;
    return totals;
  }

  const base = Math.floor(normalizedPoints / unique.length);
  let remainder = normalizedPoints - base * unique.length;

  unique.forEach((category, index) => {
    if (!(category in totals)) return;
    totals[category] += base;
    if (remainder > 0 && index === unique.length - 1) {
      totals[category] += remainder;
      remainder = 0;
    }
  });

  return totals;
}

function resolveOrbiterUjbCode(referral = {}) {
  return normalizeUjbCode(
    referral?.orbiterUJBCode || referral?.orbiter?.ujbCode || referral?.orbiter?.UJBCode
  );
}

function isThirdPartyReferral(referral = {}) {
  const type = String(referral?.referralType || referral?.refType || "").trim().toLowerCase();
  const selectedFor = String(referral?.selectedFor || "").trim().toLowerCase();
  return type === "others" || selectedFor === "someone";
}

function hasDealOver50k(referral = {}) {
  const logs = Array.isArray(referral?.dealLogs) ? referral.dealLogs : [];
  const latest = logs.length ? logs[logs.length - 1] : null;
  const dealValue = toNumber(latest?.dealValue ?? referral?.dealValue);
  return dealValue > 50000;
}

function pickActivity(activityNo) {
  const def = CP_ACTIVITY_DEFS[activityNo];
  if (!def) return null;
  return {
    activityNo,
    activityName: def.activityName,
    points: def.points,
    categories: [...def.categories],
  };
}

function resolveProspectName(referral = {}) {
  return normalizeName(
    referral?.referredForName ||
      referral?.otherName ||
      referral?.prospectName ||
      referral?.leadName
  );
}

function buildGreetingPrefix(recipientName) {
  const safeName = normalizeName(recipientName);
  if (safeName) return `Congratulations ${safeName}!`;
  return "Congratulations!";
}

function toInrNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function formatMonthLabel(monthKey) {
  const text = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(text)) return "";
  const [yearText, monthText] = text.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export function buildReferralCpNotificationMessage({
  activityNo,
  recipientName,
  prospectName,
  dealValue,
  monthKey,
  thresholdCount,
}) {
  const greeting = buildGreetingPrefix(recipientName);
  const safeProspectName = normalizeName(prospectName);
  const monthLabel = formatMonthLabel(monthKey);
  const safeCount = Number.isFinite(Number(thresholdCount)) ? Number(thresholdCount) : null;
  const safeDealValue = toInrNumber(dealValue);

  if (activityNo === "020") {
    return safeProspectName
      ? `${greeting} You earned CP points as your referral for ${safeProspectName} moved to Discussion in Progress.`
      : `${greeting} You earned CP points as your referral moved to Discussion in Progress.`;
  }

  if (activityNo === "021") {
    return safeProspectName
      ? `${greeting} You earned CP points as your self referral with ${safeProspectName} moved to Discussion in Progress.`
      : `${greeting} You earned CP points as your self referral moved to Discussion in Progress.`;
  }

  if (activityNo === "022") {
    return safeProspectName
      ? `${greeting} You received CP points for closing referral for ${safeProspectName}.`
      : `${greeting} You received CP points for closing your prospect referral.`;
  }

  if (activityNo === "023") {
    return safeProspectName
      ? `${greeting} You received CP points for closing self referral for ${safeProspectName}.`
      : `${greeting} You received CP points for closing a self referral.`;
  }

  if (activityNo === "024") {
    return safeProspectName
      ? `${greeting} You earned CP points as your third-party referral for ${safeProspectName} moved to Discussion in Progress.`
      : `${greeting} You earned CP points as your third-party referral moved to Discussion in Progress.`;
  }

  if (activityNo === "025") {
    return safeProspectName
      ? `${greeting} You received CP points for closing third-party referral for ${safeProspectName}.`
      : `${greeting} You received CP points for closing a third-party referral.`;
  }

  if (activityNo === "026") {
    if (safeDealValue) {
      return `${greeting} You received CP points for a self referral deal above Rs. 50,000 (Rs. ${safeDealValue}).`;
    }
    return `${greeting} You received CP points for a self referral deal above Rs. 50,000.`;
  }

  if (activityNo === "027") {
    if (safeDealValue && safeProspectName) {
      return `${greeting} You received CP points for ${safeProspectName}'s referral deal above Rs. 50,000 (Rs. ${safeDealValue}).`;
    }
    return `${greeting} You received CP points for a prospect referral deal above Rs. 50,000.`;
  }

  if (activityNo === "028") {
    if (safeDealValue) {
      return `${greeting} You received CP points for a third-party referral deal above Rs. 50,000 (Rs. ${safeDealValue}).`;
    }
    return `${greeting} You received CP points for a third-party referral deal above Rs. 50,000.`;
  }

  if (activityNo === "029") {
    const countText = safeCount || 2;
    if (monthLabel) {
      return `${greeting} You received CP points for identifying ${countText} or more self referrals in ${monthLabel}.`;
    }
    return `${greeting} You received CP points for identifying ${countText} or more self referrals this month.`;
  }

  if (activityNo === "030") {
    const countText = safeCount || 5;
    if (monthLabel) {
      return `${greeting} You received CP points for identifying ${countText} or more third-party referrals in ${monthLabel}.`;
    }
    return `${greeting} You received CP points for identifying ${countText} or more third-party referrals this month.`;
  }

  if (activityNo === "031") {
    const countText = safeCount || 2;
    if (monthLabel) {
      return `${greeting} You received CP points for identifying ${countText} or more prospect referrals in ${monthLabel} within your first 2 months.`;
    }
    return `${greeting} You received CP points for identifying ${countText} or more prospect referrals within your first 2 months.`;
  }

  return `${greeting} You received CP points for referral activity.`;
}

function renderTemplate(template, variables = {}) {
  const raw = String(template || "").trim();
  if (!raw) return "";
  return raw.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = variables?.[key];
    if (value === undefined || value === null || value === "") return match;
    return String(value);
  });
}

function buildPerReferralDedupeKey(activityNo, referralId) {
  return `ref:${activityNo}:${referralId}`;
}

function buildPerMonthDedupeKey(activityNo, recipientUjbCode, monthKey) {
  return `month:${activityNo}:${recipientUjbCode}:${monthKey}`;
}

function buildProspectReferralIdSet(referrals = []) {
  const sorted = [...referrals].sort(
    (left, right) => getTimestamp(left).getTime() - getTimestamp(right).getTime()
  );
  return new Set(sorted.length > 0 ? [sorted[0].id] : []);
}

function countClosedReferralsForMonth({ referrals = [], monthKey, filterFn }) {
  return referrals.filter((entry) => {
    const status = normalizeReferralStatus(entry?.dealStatus || entry?.status || "");
    if (status !== REFERRAL_STATUSES.CLOSED) return false;
    if (getMonthKey(getTimestamp(entry)) !== monthKey) return false;
    return typeof filterFn === "function" ? filterFn(entry) : true;
  }).length;
}

function isWithinFirstTwoMonths(dateValue, startDate) {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + 2);
  return date >= startDate && date < end;
}

export async function applyReferralCpRules({
  adminDb,
  referralCollectionName,
  referralBefore,
  referralAfter,
  actor = "system",
  source = "referral_status_update",
}) {
  const nextStatus = normalizeReferralStatus(referralAfter?.dealStatus || referralAfter?.status);
  const previousStatus = normalizeReferralStatus(referralBefore?.dealStatus || referralBefore?.status);
  const referralId = String(referralAfter?.id || referralBefore?.id || "").trim();
  const recipientUjbCode = resolveOrbiterUjbCode(referralAfter);
  const recipientName =
    referralAfter?.orbiter?.name || referralAfter?.orbiter?.Name || "";
  const recipientPhone = normalizePhone(referralAfter?.orbiter?.phone || referralAfter?.orbiter?.MobileNo);
  const prospectPhone = normalizePhone(
    referralAfter?.otherPhone || referralAfter?.referredForPhone || referralAfter?.referredForContact
  );
  const prospectName = resolveProspectName(referralAfter);
  const dealValue = toNumber(
    referralAfter?.dealLogs?.[referralAfter?.dealLogs?.length - 1]?.dealValue ?? referralAfter?.dealValue
  );
  const monthKey = getMonthKey(getTimestamp(referralAfter));

  if (!recipientUjbCode || !referralId || previousStatus === nextStatus) {
    return [];
  }

  const orbiterReferralsSnap = await adminDb
    .collection(referralCollectionName)
    .where("orbiter.ujbCode", "==", recipientUjbCode)
    .get();
  const orbiterReferrals = orbiterReferralsSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() || {}),
  }));
  const sortedOrbiterReferrals = [...orbiterReferrals].sort(
    (left, right) => getTimestamp(left).getTime() - getTimestamp(right).getTime()
  );
  const prospectReferralIds = buildProspectReferralIdSet(orbiterReferrals);
  const firstReferralDate = sortedOrbiterReferrals.length
    ? getTimestamp(sortedOrbiterReferrals[0])
    : null;

  const isThirdParty = isThirdPartyReferral(referralAfter);
  const isProspect = prospectReferralIds.has(referralId);
  const over50k = hasDealOver50k(referralAfter);

  const candidates = [];

  if (nextStatus === REFERRAL_STATUSES.DISCUSSION_IN_PROGRESS) {
    if (isThirdParty) {
      candidates.push(pickActivity("024"));
    } else if (isProspect) {
      candidates.push(pickActivity("020"));
    } else {
      candidates.push(pickActivity("021"));
    }
  }

  if (nextStatus === REFERRAL_STATUSES.CLOSED) {
    if (isThirdParty) {
      candidates.push(pickActivity("025"));
    } else if (isProspect) {
      candidates.push(pickActivity("022"));
    } else {
      candidates.push(pickActivity("023"));
    }

    if (over50k) {
      if (isThirdParty) {
        candidates.push(pickActivity("028"));
      } else if (isProspect) {
        candidates.push(pickActivity("027"));
      } else {
        candidates.push(pickActivity("026"));
      }
    }

    const selfClosedCount = await countClosedReferralsForMonth({
      adminDb,
      referralCollectionName,
      recipientUjbCode,
      monthKey,
      referrals: orbiterReferrals,
      filterFn: (entry) => !isThirdPartyReferral(entry) && !prospectReferralIds.has(entry.id),
    });
    if (selfClosedCount === 2) candidates.push(pickActivity("029"));

    const thirdPartyClosedCount = await countClosedReferralsForMonth({
      referrals: orbiterReferrals,
      monthKey,
      filterFn: (entry) => isThirdPartyReferral(entry),
    });
    if (thirdPartyClosedCount === 5) candidates.push(pickActivity("030"));

    const prospectClosedCount = await countClosedReferralsForMonth({
      referrals: orbiterReferrals,
      monthKey,
      filterFn: (entry) =>
        !isThirdPartyReferral(entry) &&
        isWithinFirstTwoMonths(getTimestamp(entry), firstReferralDate),
    });
    if (prospectClosedCount === 2 && isWithinFirstTwoMonths(getTimestamp(referralAfter), firstReferralDate)) {
      candidates.push(pickActivity("031"));
    }
  }

  const validCandidates = candidates.filter(Boolean);
  if (validCandidates.length === 0) return [];
  const templateByActivityNo = new Map();

  const boardRef = adminDb.collection(CP_BOARD_COLLECTION).doc(recipientUjbCode);
  const boardSnap = await boardRef.get();
  if (!boardSnap.exists) {
    await boardRef.set({
      id: recipientUjbCode,
      name: recipientName,
      phoneNumber: recipientPhone,
      role: "Orbiter",
      totals: { R: 0, H: 0, W: 0 },
      createdAt: new Date(),
    });
  }

  const activitiesRef = boardRef.collection(ACTIVITIES_SUBCOLLECTION);
  const awarded = [];

  for (const candidate of validCandidates) {
    const isMonthlyRule = ["029", "030", "031"].includes(candidate.activityNo);
    const dedupeKey = isMonthlyRule
      ? buildPerMonthDedupeKey(candidate.activityNo, recipientUjbCode, monthKey)
      : buildPerReferralDedupeKey(candidate.activityNo, referralId);

    const duplicateSnap = await activitiesRef.where("cpDedupeKey", "==", dedupeKey).limit(1).get();
    if (!duplicateSnap.empty) continue;

    const split = splitCategoryPoints(candidate.categories, candidate.points);
    const notificationTemplateKey =
      CP_NOTIFICATION_TEMPLATE_KEYS[candidate.activityNo] || "referral_cp_generic";
    const thresholdCountByActivityNo = { "029": 2, "030": 5, "031": 2 };
    const thresholdCount = thresholdCountByActivityNo[candidate.activityNo] || null;
    const notificationVariables = {
      recipientName: normalizeName(recipientName),
      prospectName,
      dealValue,
      month: monthKey,
      count: thresholdCount,
    };
    if (!templateByActivityNo.has(candidate.activityNo)) {
      const templateSnap = await adminDb
        .collection(CP_ACTIVITY_COLLECTION)
        .where("activityNo", "==", candidate.activityNo)
        .limit(1)
        .get();
      const templateDocData = templateSnap.empty
        ? null
        : templateSnap.docs[0].data();
      const templateText = templateSnap.empty
        ? ""
        : String(templateDocData?.notificationMessageTemplate || "").trim();
      templateByActivityNo.set(candidate.activityNo, templateText);
    }
    const notificationMessageFromCode = buildReferralCpNotificationMessage({
      activityNo: candidate.activityNo,
      recipientName,
      prospectName,
      dealValue,
      monthKey,
      thresholdCount,
    });
    const notificationMessageFromTemplate = renderTemplate(
      templateByActivityNo.get(candidate.activityNo),
      notificationVariables
    );
    const notificationMessage =
      notificationMessageFromTemplate || notificationMessageFromCode;
    await activitiesRef.add({
      activityNo: candidate.activityNo,
      activityName: candidate.activityName,
      notificationMessage,
      notificationTemplateKey,
      notificationVariables,
      points: candidate.points,
      categories: candidate.categories,
      category: candidate.categories.join("+"),
      purpose: candidate.activityName,
      source: source || "referral_status_update",
      sourceRoute: source || "referral_status_update",
      sourceActor: actor || "system",
      referralId,
      prospectPhone,
      month: monthKey,
      monthKey,
      statusFrom: previousStatus,
      statusTo: nextStatus,
      cpDedupeKey: dedupeKey,
      cpRuleVersion: RULE_VERSION,
      recipientUjbCode,
      addedAt: new Date(),
    });

    const latestBoardSnap = await boardRef.get();
    const totals = latestBoardSnap.data()?.totals || { R: 0, H: 0, W: 0 };
    await boardRef.set(
      {
        totals: {
          R: toNumber(totals.R) + toNumber(split.R),
          H: toNumber(totals.H) + toNumber(split.H),
          W: toNumber(totals.W) + toNumber(split.W),
        },
        lastUpdatedAt: new Date(),
      },
      { merge: true }
    );

    awarded.push({
      activityNo: candidate.activityNo,
      points: candidate.points,
      recipientUjbCode,
    });
  }

  return awarded;
}
