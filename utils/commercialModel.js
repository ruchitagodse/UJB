export const COMMERCIAL_MODEL_TYPES = {
  SINGLE: "single_slab",
  MULTI: "multi_slab",
};

export const COMMISSION_VALUE_TYPES = {
  PERCENTAGE: "percentage",
  FIXED: "fixed",
};

export const COMMISSION_DISTRIBUTION = {
  referrer: 50,
  referrerMentor: 15,
  receiverMentor: 15,
  platform: 20,
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const roundCurrency = (value) =>
  Math.round((Number(value) || 0) * 100) / 100;

export const normalizeCommissionType = (type) => {
  const normalized = String(type || "").trim().toLowerCase();

  if (
    normalized === COMMISSION_VALUE_TYPES.FIXED ||
    normalized === "amount" ||
    normalized === "fixed_amount"
  ) {
    return COMMISSION_VALUE_TYPES.FIXED;
  }

  return COMMISSION_VALUE_TYPES.PERCENTAGE;
};

export const createDefaultCommercialModel = () => ({
  modelType: COMMERCIAL_MODEL_TYPES.SINGLE,
  singleSlab: {
    commissionType: COMMISSION_VALUE_TYPES.PERCENTAGE,
    value: "",
  },
  multiSlab: {
    slabs: [],
  },
});

const normalizeSlab = (slab = {}) => ({
  min: slab.min ?? slab.from ?? "",
  max:
    slab.max === undefined
      ? slab.to ?? ""
      : slab.max,
  commissionType: normalizeCommissionType(slab.commissionType ?? slab.type),
  value: slab.value ?? "",
});

export const agreedValueToCommercialModel = (agreedValue) => {
  if (!agreedValue) {
    return createDefaultCommercialModel();
  }

  if (agreedValue.mode === "multiple") {
    return {
      modelType: COMMERCIAL_MODEL_TYPES.MULTI,
      singleSlab: {
        commissionType: COMMISSION_VALUE_TYPES.PERCENTAGE,
        value: "",
      },
      multiSlab: {
        slabs: (
          agreedValue?.multiple?.slabs ||
          agreedValue?.multiple?.itemSlabs ||
          []
        ).map(normalizeSlab),
      },
    };
  }

  return {
    modelType: COMMERCIAL_MODEL_TYPES.SINGLE,
    singleSlab: {
      commissionType: normalizeCommissionType(agreedValue?.single?.type),
      value: agreedValue?.single?.value ?? "",
    },
    multiSlab: {
      slabs: [],
    },
  };
};

export const commercialModelToAgreedValue = (commercialModel) => {
  const normalized = normalizeCommercialModel(commercialModel);

  if (normalized.modelType === COMMERCIAL_MODEL_TYPES.MULTI) {
    return {
      mode: "multiple",
      single: { type: "", value: "" },
      multiple: {
        slabs: normalized.multiSlab.slabs.map((slab) => ({
          from: slab.min,
          to: slab.max,
          type: slab.commissionType,
          value: slab.value,
        })),
        itemSlabs: normalized.multiSlab.slabs.map((slab) => ({
          from: slab.min,
          to: slab.max,
          type: slab.commissionType,
          value: slab.value,
        })),
      },
    };
  }

  return {
    mode: "single",
    single: {
      type: normalized.singleSlab.commissionType,
      value: normalized.singleSlab.value,
    },
    multiple: { slabs: [], itemSlabs: [] },
  };
};

export const normalizeCommercialModel = (commercialModel, agreedValue) => {
  const base =
    commercialModel && typeof commercialModel === "object"
      ? commercialModel
      : agreedValueToCommercialModel(agreedValue);

  return {
    modelType:
      base?.modelType === COMMERCIAL_MODEL_TYPES.MULTI
        ? COMMERCIAL_MODEL_TYPES.MULTI
        : COMMERCIAL_MODEL_TYPES.SINGLE,
    singleSlab: {
      commissionType: normalizeCommissionType(
        base?.singleSlab?.commissionType
      ),
      value: base?.singleSlab?.value ?? "",
    },
    multiSlab: {
      slabs: Array.isArray(base?.multiSlab?.slabs)
        ? base.multiSlab.slabs.map(normalizeSlab)
        : [],
    },
  };
};

const buildRangeLabel = (min, max) => {
  const minText = `₹${toNumber(min).toLocaleString("en-IN")}`;
  const maxNum = toNumber(max);
  const maxText =
    max === "" || max == null
      ? "+"
      : ` - ₹${maxNum.toLocaleString("en-IN")}`;

  return `${minText}${maxText}`;
};

export const validateCommercialModel = (commercialModel) => {
  const normalized = normalizeCommercialModel(commercialModel);
  const errors = [];

  if (normalized.modelType === COMMERCIAL_MODEL_TYPES.SINGLE) {
    const { commissionType, value } = normalized.singleSlab;
    const numericValue = toNumber(value, NaN);

    if (!commissionType) {
      errors.push("Choose a commission type for the single slab.");
    }

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      errors.push("Enter a valid single slab commission value.");
    }

    if (
      commissionType === COMMISSION_VALUE_TYPES.PERCENTAGE &&
      numericValue > 100
    ) {
      errors.push("Single slab percentage cannot exceed 100%.");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  const slabs = normalized.multiSlab.slabs;

  if (!slabs.length) {
    errors.push("Add at least one slab for the multi slab model.");
  }

  const parsedSlabs = slabs.map((slab, index) => {
    const min = toNumber(slab.min, NaN);
    const max =
      slab.max === "" || slab.max == null ? Infinity : toNumber(slab.max, NaN);
    const value = toNumber(slab.value, NaN);

    if (!Number.isFinite(min) || min < 0) {
      errors.push(`Slab ${index + 1}: enter a valid minimum range value.`);
    }

    if (slab.max !== "" && slab.max != null && (!Number.isFinite(max) || max < min)) {
      errors.push(`Slab ${index + 1}: maximum range must be greater than or equal to minimum.`);
    }

    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`Slab ${index + 1}: enter a valid commission value.`);
    }

    if (
      normalizeCommissionType(slab.commissionType) ===
        COMMISSION_VALUE_TYPES.PERCENTAGE &&
      value > 100
    ) {
      errors.push(`Slab ${index + 1}: percentage cannot exceed 100%.`);
    }

    return {
      index,
      min,
      max,
      value,
      commissionType: normalizeCommissionType(slab.commissionType),
    };
  });

  const validParsedSlabs = parsedSlabs
    .filter((slab) => Number.isFinite(slab.min) && Number.isFinite(slab.value))
    .sort((a, b) => a.min - b.min);

  for (let i = 1; i < validParsedSlabs.length; i += 1) {
    const previous = validParsedSlabs[i - 1];
    const current = validParsedSlabs[i];

    if (previous.max >= current.min) {
      errors.push(
        `Slab ranges overlap between ${buildRangeLabel(previous.min, previous.max)} and ${buildRangeLabel(current.min, current.max)}.`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const calculateCommissionFromCommercialModel = (
  dealValue,
  commercialModel
) => {
  const normalized = normalizeCommercialModel(commercialModel);
  const dealAmount = toNumber(dealValue, NaN);

  if (!Number.isFinite(dealAmount) || dealAmount < 0) {
    return null;
  }

  if (normalized.modelType === COMMERCIAL_MODEL_TYPES.SINGLE) {
    const commissionType = normalizeCommissionType(
      normalized.singleSlab.commissionType
    );
    const value = toNumber(normalized.singleSlab.value, NaN);

    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    const commissionAmount =
      commissionType === COMMISSION_VALUE_TYPES.PERCENTAGE
        ? roundCurrency((dealAmount * value) / 100)
        : roundCurrency(value);

    return {
      modelType: normalized.modelType,
      slabLabel: "Single Slab",
      commissionType,
      commissionValue: value,
      commissionAmount,
      matchedSlab: null,
    };
  }

  const slabs = normalized.multiSlab.slabs.map((slab) => ({
    ...slab,
    min: toNumber(slab.min, NaN),
    max:
      slab.max === "" || slab.max == null
        ? Infinity
        : toNumber(slab.max, NaN),
    value: toNumber(slab.value, NaN),
    commissionType: normalizeCommissionType(slab.commissionType),
  }));

  const matchedSlab = slabs.find(
    (slab) =>
      Number.isFinite(slab.min) &&
      Number.isFinite(slab.value) &&
      dealAmount >= slab.min &&
      dealAmount <= slab.max
  );

  if (!matchedSlab) {
    return null;
  }

  const commissionAmount =
    matchedSlab.commissionType === COMMISSION_VALUE_TYPES.PERCENTAGE
      ? roundCurrency((dealAmount * matchedSlab.value) / 100)
      : roundCurrency(matchedSlab.value);

  return {
    modelType: normalized.modelType,
    slabLabel: buildRangeLabel(matchedSlab.min, matchedSlab.max),
    commissionType: matchedSlab.commissionType,
    commissionValue: matchedSlab.value,
    commissionAmount,
    matchedSlab,
  };
};

export const buildCommissionDistribution = (commissionAmount) => {
  const total = roundCurrency(commissionAmount);
  const referrer = roundCurrency(
    (total * COMMISSION_DISTRIBUTION.referrer) / 100
  );
  const referrerMentor = roundCurrency(
    (total * COMMISSION_DISTRIBUTION.referrerMentor) / 100
  );
  const receiverMentor = roundCurrency(
    (total * COMMISSION_DISTRIBUTION.receiverMentor) / 100
  );
  let platform = roundCurrency(
    (total * COMMISSION_DISTRIBUTION.platform) / 100
  );

  const distributed = roundCurrency(
    referrer + referrerMentor + receiverMentor + platform
  );
  const diff = roundCurrency(total - distributed);

  if (diff !== 0) {
    platform = roundCurrency(platform + diff);
  }

  return {
    totalCommissionAmount: total,
    referrer,
    referrerMentor,
    receiverMentor,
    platform,
    percentages: { ...COMMISSION_DISTRIBUTION },
  };
};

