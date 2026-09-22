// src/utils/referralCalculations.js

import {
  buildCommissionDistribution,
  calculateCommissionFromCommercialModel,
  COMMISSION_VALUE_TYPES,
  normalizeCommercialModel,
  normalizeCommissionType,
} from "./commercialModel.js";

const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
};

export const REFERRAL_REWARD_TYPES = {
  PERCENTAGE: "percentage",
  FIXED: "fixed",
};

export const normalizeReferralRewardType = (type) =>
  normalizeCommissionType(type) === COMMISSION_VALUE_TYPES.FIXED
    ? REFERRAL_REWARD_TYPES.FIXED
    : REFERRAL_REWARD_TYPES.PERCENTAGE;

const formatRewardLabel = (type, value) =>
  type === REFERRAL_REWARD_TYPES.PERCENTAGE ? `${value}%` : `₹${value}`;

const findMatchingRewardEntry = (deal, item) => {
  const commercialModel = normalizeCommercialModel(
    item?.commercialModel,
    item?.agreedValue
  );
  const commercialMatch = calculateCommissionFromCommercialModel(
    deal,
    commercialModel
  );

  if (commercialMatch) {
    return {
      mode:
        commercialModel.modelType === "multi_slab" ? "multiple" : "single",
      type: normalizeReferralRewardType(commercialMatch.commissionType),
      value: toNumber(commercialMatch.commissionValue, 0),
      slab: commercialMatch.matchedSlab || null,
      source: "commercialModel",
    };
  }

  const av = item?.agreedValue;

  if (!av) {
    return {
      mode: "legacy",
      type: REFERRAL_REWARD_TYPES.PERCENTAGE,
      value: toNumber(item?.percentage, 0),
      source: "item.percentage",
    };
  }

  if (av.mode === "single") {
    const single = av.single || item.single;
    if (!single) return null;

    return {
      mode: "single",
      type: normalizeReferralRewardType(single.type),
      value: toNumber(single.value, 0),
      source: "agreedValue.single",
    };
  }

  if (av.mode === "multiple") {
    const rawSlabs =
      av.multiple?.slabs?.length
        ? av.multiple.slabs
        : av.multiple?.itemSlabs || [];

    if (!rawSlabs.length) return null;

    const slabs = rawSlabs.map((s) => ({
      ...s,
      from: toNumber(s.from),
      to: s.to === "" || s.to == null ? Infinity : toNumber(s.to),
      value: toNumber(s.value),
      type: normalizeReferralRewardType(s.type),
    }));

    const match = slabs
      .filter((s) => deal >= s.from && deal <= s.to)
      .sort((a, b) => b.from - a.from)[0];

    if (!match) return null;

    return {
      mode: "multiple",
      type: match.type,
      value: match.value,
      slab: match,
      source: "agreedValue.multiple",
    };
  }

  return null;
};

export const getReferralRewardDetails = (dealAmount, item) => {
  if (!item) {
    return {
      rewardType: REFERRAL_REWARD_TYPES.PERCENTAGE,
      rewardValue: 0,
      rewardAmount: 0,
      rewardLabel: "0%",
      mode: null,
      slab: null,
    };
  }

  const deal = toNumber(dealAmount);
  const entry = findMatchingRewardEntry(deal, item);

  if (!entry) {
    return {
      rewardType: REFERRAL_REWARD_TYPES.PERCENTAGE,
      rewardValue: 0,
      rewardAmount: 0,
      rewardLabel: "0%",
      mode: item?.agreedValue?.mode || null,
      slab: null,
    };
  }

  const rewardAmount =
    entry.type === REFERRAL_REWARD_TYPES.PERCENTAGE
      ? (deal * entry.value) / 100
      : entry.value;

  return {
    rewardType: entry.type,
    rewardValue: entry.value,
    rewardAmount,
    rewardLabel: formatRewardLabel(entry.type, entry.value),
    mode: entry.mode,
    slab: entry.slab || null,
    source: entry.source,
  };
};

/* -------------------------------------------------
   AGREED VALUE CALCULATION
------------------------------------------------- */
export const calculateAgreedFromItem = (dealAmount, item) => {
  return getReferralRewardDetails(dealAmount, item).rewardAmount;
};

/* -------------------------------------------------
   DEAL DISTRIBUTION  ✅ THIS WAS MISSING
------------------------------------------------- */

export const buildDealDistribution = (dealValue, referralData) => {
  const deal = toNumber(dealValue);

  const item =
    referralData?.service ||
    referralData?.product ||
    referralData?.services?.[0] ||
    referralData?.products?.[0] ||
    null;

  const reward = getReferralRewardDetails(deal, item);
  const agreedAmount = reward.rewardAmount;
  const distribution = buildCommissionDistribution(agreedAmount);

  return {
    dealValue: deal,
    percentage:
      reward.rewardType === REFERRAL_REWARD_TYPES.PERCENTAGE
        ? reward.rewardValue
        : 0,
    rewardType: reward.rewardType,
    rewardValue: reward.rewardValue,
    rewardLabel: reward.rewardLabel,
    agreedAmount,
    orbiterShare: distribution.referrer,
    orbiterMentorShare: distribution.referrerMentor,
    cosmoMentorShare: distribution.receiverMentor,
    ujustbeShare: distribution.platform,
    timestamp: new Date().toISOString(),
  };
};

/* -------------------------------------------------
   ADJUSTMENT CALC (ALREADY FIXED)
------------------------------------------------- */
export const applyAdjustmentBeforePayRoleCalc = ({
  requestedAmount,
  userDetailData,
  dealValue,
  role,
  ujbCode,
  referral,
}) => {
  const req = Number(requestedAmount || 0);
  const prev = Math.max(
    Number(userDetailData?.adjustmentRemaining || 0),
    0
  );

  // STOP conditions
  if (req <= 0 || prev <= 0) {
    return {
      deducted: 0,
      remainingForCash: req,
      newGlobalRemaining: prev,
      logEntry: null,
    };
  }

  // ✅ CORE LOGIC (AS YOU SAID)
  const deducted = Math.min(req, prev);     // 900
  const newRemaining = prev - deducted;     // 100
  const remainingForCash = req - deducted;  // 0

  const logEntry = {
    type: "RoleFeeAdjustment",
    role: role || null,
    ujbCode: ujbCode || null,

    requestedAmount: req,
    deducted,
    remainingForCash,

    previousRemaining: prev,
    newRemaining,

    dealValue: dealValue ?? null,
    referralId: referral?.id ?? null,

    deductedFrom: "orbiter",
    feeType: "adjustment",
    createdAt: new Date().toISOString(),
    _v: 1,
  };

  return {
    deducted,
    remainingForCash,
    newGlobalRemaining: newRemaining,
    logEntry,
  };
};
