#!/usr/bin/env node

import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import { encryptBankDetails } from "../lib/security/bankDetails.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith("--") ? argv[++i] : "true";
    args[key] = value;
  }
  return args;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function parseInteger(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseEnvFile(fileName) {
  const abs = path.resolve(fileName);
  if (!fs.existsSync(abs)) return {};

  const raw = fs.readFileSync(abs, "utf8");
  const output = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}

function loadEnvFile(fileName) {
  const env = parseEnvFile(fileName);
  const keys = Object.keys(env);
  for (const key of keys) {
    if (process.env[key] === undefined) {
      process.env[key] = env[key];
    }
  }
}

function getAdminConfigFromEnv(env = {}) {
  const projectId = normalizeText(env.FIREBASE_PROJECT_ID);
  const clientEmail = normalizeText(env.FIREBASE_CLIENT_EMAIL).replace(/^"|"$/g, "");
  const privateKey = normalizeText(env.FIREBASE_PRIVATE_KEY)
    .replace(/^"|"$/g, "")
    .replace(/\\n/g, "\n");

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function getAdminConfigFromKeyFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Key file not found: ${abs}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  return {
    projectId: normalizeText(raw.project_id),
    clientEmail: normalizeText(raw.client_email),
    privateKey: normalizeText(raw.private_key).replace(/\\n/g, "\n"),
  };
}

function validateAdminConfig(config = {}, label = "firebase") {
  if (!config.projectId || !config.clientEmail || !config.privateKey) {
    throw new Error(
      `Missing admin credentials for ${label}. Need FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in selected env file.`
    );
  }
}

function normalizeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  const scalar = normalizeText(value);
  if (!scalar) return [];
  if (scalar.includes(",")) {
    return scalar
      .split(",")
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  return [scalar];
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getByAliases(source = {}, aliases = [], fallback = undefined) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) {
      const value = source[alias];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
  }
  return fallback;
}

function looksLikeUjbCode(value) {
  return /^UJB/i.test(normalizeText(value));
}

function looksLikePhoneDigits(value) {
  return /^\d{10,15}$/.test(normalizeText(value));
}

function normalizeSocialLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const platform = normalizeText(item.platform);
      const url = normalizeText(item.url);
      if (!platform && !url) return null;
      return { platform, url };
    })
    .filter(Boolean);
}

function normalizeKycBundle(value) {
  if (!value || typeof value !== "object") return {};
  const output = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    const item = value[key];
    if (item && typeof item === "object") {
      output[key] = {
        ...item,
        url: normalizeText(item.url || item.downloadURL || item.fileURL),
        path: normalizeText(item.path),
        fileName: normalizeText(item.fileName || item.name),
      };
      continue;
    }
    const scalar = normalizeText(item);
    if (scalar) {
      output[key] = scalar;
    }
  }
  return output;
}

function normalizeAchievementCertificates(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const url = normalizeText(item.url || item.downloadURL || item.fileURL);
      const fileName = normalizeText(item.fileName || item.name);
      const filePath = normalizeText(item.path);
      if (!url && !fileName) return null;
      return { url, fileName, path: filePath };
    })
    .filter(Boolean);
}

function deriveImages(entry = {}) {
  const images = Array.isArray(entry.images) ? entry.images : [];
  const normalizedImages = images
    .map((image, index) => {
      if (!image || typeof image !== "object") return null;
      const url = normalizeText(image.url || image.imageURL || image.downloadURL);
      if (!url) return null;
      return {
        url,
        name: normalizeText(image.name || `${entry.name || "item"}-${index + 1}`),
        size: Number.isFinite(Number(image.size)) ? Number(image.size) : 0,
        type: normalizeText(image.type),
        isCover: image.isCover === true || index === 0,
      };
    })
    .filter(Boolean);

  if (normalizedImages.length) {
    const coverIndex = normalizedImages.findIndex((item) => item.isCover);
    if (coverIndex <= 0) {
      normalizedImages.forEach((item) => {
        item.isCover = false;
      });
      normalizedImages[0].isCover = true;
    }
    return normalizedImages;
  }

  const fallbackUrl = normalizeText(entry.imageURL || entry.image || entry.photoURL);
  if (!fallbackUrl) return [];
  return [
    {
      url: fallbackUrl,
      name: normalizeText(entry.name || "cover-image"),
      size: 0,
      type: "",
      isCover: true,
    },
  ];
}

function normalizeAgreedValue(entry = {}) {
  const agreed = entry.agreedValue && typeof entry.agreedValue === "object" ? entry.agreedValue : null;
  if (agreed) {
    const mode = normalizeText(agreed.mode || "single").toLowerCase() === "multiple" ? "multiple" : "single";
    const singleType = normalizeText(agreed?.single?.type || "percentage").toLowerCase();
    const singleValue = normalizeText(agreed?.single?.value);
    const slabs = Array.isArray(agreed?.multiple?.slabs)
      ? agreed.multiple.slabs
      : Array.isArray(agreed?.multiple?.itemSlabs)
        ? agreed.multiple.itemSlabs
        : [];
    return {
      mode,
      single: {
        type: singleType === "fixed" ? "fixed" : "percentage",
        value: singleValue,
      },
      multiple: {
        slabs: slabs.map((slab) => ({
          from: normalizeText(slab?.from ?? slab?.min),
          to: normalizeText(slab?.to ?? slab?.max),
          type: normalizeText(slab?.type || slab?.commissionType || "percentage"),
          value: normalizeText(slab?.value),
        })),
        itemSlabs: slabs.map((slab) => ({
          from: normalizeText(slab?.from ?? slab?.min),
          to: normalizeText(slab?.to ?? slab?.max),
          type: normalizeText(slab?.type || slab?.commissionType || "percentage"),
          value: normalizeText(slab?.value),
        })),
      },
    };
  }

  const legacyPercentage = normalizeText(entry.percentage);
  if (legacyPercentage) {
    return {
      mode: "single",
      single: {
        type: "percentage",
        value: legacyPercentage,
      },
      multiple: { slabs: [], itemSlabs: [] },
    };
  }

  const type = normalizeText(entry.commissionType || "percentage").toLowerCase();
  const value = normalizeText(entry.commissionValue || entry.value);
  return {
    mode: "single",
    single: {
      type: type === "fixed" ? "fixed" : "percentage",
      value,
    },
    multiple: { slabs: [], itemSlabs: [] },
  };
}

function normalizeCommercialModel(agreedValue = null) {
  if (agreedValue?.mode === "multiple") {
    const slabs = Array.isArray(agreedValue?.multiple?.slabs)
      ? agreedValue.multiple.slabs
      : [];
    return {
      modelType: "multi_slab",
      singleSlab: { commissionType: "percentage", value: "" },
      multiSlab: {
        slabs: slabs.map((slab) => ({
          min: normalizeText(slab.from),
          max: normalizeText(slab.to),
          commissionType: normalizeText(slab.type || "percentage"),
          value: normalizeText(slab.value),
        })),
      },
    };
  }
  return {
    modelType: "single_slab",
    singleSlab: {
      commissionType: normalizeText(agreedValue?.single?.type || "percentage"),
      value: normalizeText(agreedValue?.single?.value),
    },
    multiSlab: { slabs: [] },
  };
}

function normalizeOfferingItem(entry = {}, kind = "service") {
  const images = deriveImages(entry);
  const agreedValue = normalizeAgreedValue(entry);
  const commercialModel = normalizeCommercialModel(agreedValue);

  return {
    name: normalizeText(entry.name || entry.title),
    description: normalizeText(entry.description || entry.details),
    imageURL: images.find((img) => img.isCover)?.url || "",
    images,
    keywords: normalizeArray(entry.keywords),
    deliveryTime: normalizeText(entry.deliveryTime),
    targetAudience: normalizeArray(entry.targetAudience),
    industries: normalizeArray(entry.industries),
    useCases: normalizeArray(entry.useCases),
    clientele: normalizeText(entry.clientele),
    experience: normalizeText(entry.experience),
    pastClients: normalizeArray(entry.pastClients),
    proofPoints: normalizeArray(entry.proofPoints),
    deliveryMode: normalizeText(entry.deliveryMode),
    isVisible: entry.isVisible !== false,
    status: normalizeText(entry.status || "Active"),
    previewDealValue: normalizeText(entry.previewDealValue),
    priority: normalizeText(entry.priority),
    serviceLevel: normalizeText(entry.serviceLevel),
    agreedValue,
    commercialModel,
    offeringType: kind,
    isActive: entry.isActive !== false,
  };
}

function normalizeOfferings(value, kind) {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : [];
  return source
    .map((entry) => normalizeOfferingItem(entry, kind))
    .filter((entry) => entry.name || entry.description || entry.imageURL);
}

function buildTargetRecord(sourceDocId, source = {}) {
  const rawUjb = getByAliases(
    source,
    ["UJBCode", "ujbCode", "UjbCode", "UJB Code", " UJB Code"],
    looksLikeUjbCode(sourceDocId) ? sourceDocId : ""
  );
  const ujbCode = normalizeText(rawUjb).toUpperCase();

  const rawMobile = getByAliases(
    source,
    ["MobileNo", "Mobile no", " Mobile no", "mobileNo", "mobileNumber", "mobile", "phone", "Mobile Number"],
    looksLikePhoneDigits(sourceDocId) ? sourceDocId : ""
  );

  const rawName = getByAliases(source, ["Name", " Name", "name", "FullName", "fullName", "UserName", "username"], "");
  const rawMentorName = getByAliases(source, ["MentorName", "Mentor Name", " Mentor Name"], "");
  const rawMentorPhone = getByAliases(source, ["MentorPhone", "Mentor Phone", " Mentor Phone"], "");
  const rawMentorUjb = getByAliases(source, ["MentorUJBCode", "Mentor UJB Code", " Mentor UJB Code"], "");
  const rawCategory1 = getByAliases(source, ["Category1", "Category 1"], "");
  const rawCategory2 = getByAliases(source, ["Category2", "Category 2"], "");
  const rawBusinessDetails = getByAliases(
    source,
    ["BusinessDetails", "Business Details", "Business Details (Nature & Type)"],
    ""
  );
  const rawBusinessEmail = getByAliases(source, ["BusinessEmailID", "Business Email ID"], "");
  const rawContributionArea = getByAliases(
    source,
    ["ContributionAreainUJustBe", "ContributionAreaInUJustBe", "Contribution Area in UJustBe"],
    []
  );
  const rawAssignedOpsEmail = getByAliases(source, ["AssignedOpsEmail", "assignedOpsEmail"], "");
  const rawAssignedOpsName = getByAliases(source, ["AssignedOpsName", "assignedOpsName"], "");
  const rawAssignedOpsUserId = getByAliases(source, ["AssignedOpsUserId", "assignedOpsUserId"], "");
  const rawCreatedFromEnrollment = getByAliases(source, ["CreatedFromEnrollment"], false);
  const rawAgreementAccepted = getByAliases(source, ["agreementAccepted"], false);
  const rawCcAgreementAccepted = getByAliases(source, ["ccRedemptionAgreementAccepted"], false);
  const rawAgreementAcceptedAt = getByAliases(source, ["agreementAcceptedAt"], "");
  const rawCcAgreementAcceptedAt = getByAliases(source, ["ccRedemptionAgreementAcceptedAt"], "");
  const rawAgreementPdfUrl = getByAliases(source, ["agreementPdfUrl"], "");
  const rawAgreementType = getByAliases(source, ["agreementType"], "");
  const rawSourceProspectId = getByAliases(source, ["SourceProspectId"], "");
  const rawMentorEmail = getByAliases(source, ["MentorEmail"], "");
  const rawPreferredCommunication = getByAliases(source, ["PreferredCommunication"], []);
  const rawCompany = getByAliases(source, ["Company"], "");
  const rawCompanyName = getByAliases(source, ["CompanyName"], "");
  const rawCountry = getByAliases(source, ["Country"], "");
  const rawIndustry = getByAliases(source, ["Industry"], "");
  const rawProfessionType = getByAliases(source, ["ProfessionType"], "");
  const rawOrbiterName = getByAliases(source, ["orbiterName"], "");
  const rawOrbiterContact = getByAliases(source, ["orbiterContact"], "");
  const rawOrbiterEmail = getByAliases(source, ["orbiterEmail"], "");
  const rawBusinessName = getByAliases(source, ["BusinessName", "Business Name"], "");
  const rawBusinessHistory = getByAliases(source, ["BusinessHistory", "Business History"], "");
  const rawTagLine = getByAliases(source, ["TagLine", "Tag Line"], "");
  const rawWebsite = getByAliases(source, ["Website"], "");
  const rawUsp = getByAliases(source, ["USP"], "");
  const rawEstablishedAt = getByAliases(source, ["EstablishedAt", "Established Year"], "");
  const rawAddressCityState = getByAliases(source, ["Address (City, State)", "Address"], "");
  const rawCurrentProfession = getByAliases(source, ["Current Profession", "CurrentProfession"], "");
  const rawProfessionalHistory = getByAliases(source, ["Professional History", "ProfessionalHistory"], "");
  const rawProfilePhotoUrl = getByAliases(source, ["ProfilePhotoURL", "Profile Photo URL"], "");

  const payload = {
    UJBCode: ujbCode,
    Name: normalizeText(rawName),
    Email: normalizeText(getByAliases(source, ["Email", " email"], "")),
    MobileNo: normalizeText(rawMobile),
    "Mobile no": normalizeText(rawMobile),
    Category: normalizeText(getByAliases(source, ["Category"], "")),
    DOB: normalizeText(getByAliases(source, ["DOB"], "")),
    Gender: normalizeText(getByAliases(source, ["Gender"], "")),
    MentorName: normalizeText(rawMentorName),
    MentorPhone: normalizeText(rawMentorPhone),
    MentorUJBCode: normalizeText(rawMentorUjb).toUpperCase(),
    MentorEmail: normalizeText(rawMentorEmail),
    ProfilePhotoURL: normalizeText(rawProfilePhotoUrl),
    ProfileStatus: normalizeText(source.ProfileStatus || "incomplete"),
    IDType: normalizeText(getByAliases(source, ["IDType"], "")),
    IDNumber: normalizeText(getByAliases(source, ["IDNumber"], "")),
    Location: normalizeText(getByAliases(source, ["Location"], "")),
    Address: normalizeText(rawAddressCityState),
    City: normalizeText(getByAliases(source, ["City"], "")),
    State: normalizeText(getByAliases(source, ["State"], "")),
    Pincode: normalizeText(getByAliases(source, ["Pincode"], "")),
    MaritalStatus: normalizeText(getByAliases(source, ["MaritalStatus"], "")),
    LanguagesKnown: normalizeArray(getByAliases(source, ["LanguagesKnown"], [])),
    Hobbies: normalizeArray(getByAliases(source, ["Hobbies"], [])),
    InterestArea: normalizeArray(getByAliases(source, ["InterestArea"], [])),
    Skills: normalizeArray(getByAliases(source, ["Skills"], [])),
    Aspirations: normalizeText(getByAliases(source, ["Aspirations"], "")),
    ImmediateDesire: normalizeText(getByAliases(source, ["ImmediateDesire"], "")),
    CurrentProfession: normalizeText(rawCurrentProfession),
    ProfessionalHistory: normalizeText(rawProfessionalHistory),
    Mastery: normalizeArray(getByAliases(source, ["Mastery"], [])),
    ExclusiveKnowledge: normalizeArray(getByAliases(source, ["ExclusiveKnowledge"], [])),
    SpecialSocialContribution: normalizeText(getByAliases(source, ["SpecialSocialContribution"], "")),
    CurrentHealthCondition: normalizeText(getByAliases(source, ["CurrentHealthCondition"], "")),
    BloodGroup: normalizeText(getByAliases(source, ["BloodGroup"], "")),
    FitnessLevel: normalizeText(getByAliases(source, ["FitnessLevel"], "")),
    SmokingHabit: normalizeText(getByAliases(source, ["SmokingHabit"], "")),
    AlcoholConsumption: normalizeText(getByAliases(source, ["AlcoholConsumption"], "")),
    HealthParameters: normalizeArray(getByAliases(source, ["HealthParameters"], [])),
    HealthNotes: normalizeArray(getByAliases(source, ["HealthNotes"], [])),
    FamilyHistorySummary: normalizeArray(getByAliases(source, ["FamilyHistorySummary"], [])),
    BusinessLogo: normalizeText(getByAliases(source, ["BusinessLogo"], "")),
    BusinessName: normalizeText(rawBusinessName),
    BusinessStage: normalizeText(getByAliases(source, ["BusinessStage"], "")),
    BusinessDetails: normalizeText(rawBusinessDetails),
    EstablishedAt: normalizeText(rawEstablishedAt),
    TagLine: normalizeText(rawTagLine),
    USP: normalizeText(rawUsp),
    ClienteleBase: normalizeText(getByAliases(source, ["ClienteleBase"], "")),
    BusinessHistory: normalizeText(rawBusinessHistory),
    NoteworthyAchievements: normalizeText(getByAliases(source, ["NoteworthyAchievements"], "")),
    Category1: normalizeText(rawCategory1),
    Category2: normalizeText(rawCategory2),
    keyCategory: normalizeText(getByAliases(source, ["keyCategory"], "")),
    Website: normalizeText(rawWebsite),
    BusinessEmailID: normalizeText(rawBusinessEmail),
    Locality: normalizeText(getByAliases(source, ["Locality"], "")),
    AreaOfServices: normalizeArray(source.AreaOfServices || source.AreaofServices),
    BusinessSocialMediaPages: normalizeSocialLinks(source.BusinessSocialMediaPages),
    services: normalizeOfferings(source.services, "service"),
    products: normalizeOfferings(source.products, "product"),
    connects: Array.isArray(source.connects) ? source.connects : [],
    closeConnections: Array.isArray(source.closeConnections) ? source.closeConnections : [],
    achievementCertificates: normalizeAchievementCertificates(source.achievementCertificates),
    panNumber: normalizeText(source.panNumber),
    aadhaarNumber: normalizeText(source.aadhaarNumber),
    personalKYC: normalizeKycBundle(source.personalKYC),
    businessKYC: normalizeKycBundle(source.businessKYC),
    bankDetails: encryptBankDetails(source.bankDetails && typeof source.bankDetails === "object" ? source.bankDetails : {}),
    residentStatus: normalizeText(getByAliases(source, ["residentStatus"], "")),
    taxSlab: normalizeText(getByAliases(source, ["taxSlab"], "")),
    payment: source.payment && typeof source.payment === "object" ? source.payment : {},
    subscription: source.subscription && typeof source.subscription === "object" ? source.subscription : {},
    balanceAmount: normalizeNumber(source.balanceAmount, 0),
    ContributionAreainUJustBe: normalizeArray(rawContributionArea),
    AssignedOpsEmail: normalizeText(rawAssignedOpsEmail),
    AssignedOpsName: normalizeText(rawAssignedOpsName),
    AssignedOpsUserId: normalizeText(rawAssignedOpsUserId),
    assignedOpsEmail: normalizeText(rawAssignedOpsEmail),
    assignedOpsName: normalizeText(rawAssignedOpsName),
    assignedOpsUserId: normalizeText(rawAssignedOpsUserId),
    CreatedFromEnrollment: Boolean(rawCreatedFromEnrollment),
    agreementAccepted: Boolean(rawAgreementAccepted),
    agreementAcceptedAt: normalizeText(rawAgreementAcceptedAt),
    ccRedemptionAgreementAccepted: Boolean(rawCcAgreementAccepted),
    ccRedemptionAgreementAcceptedAt: normalizeText(rawCcAgreementAcceptedAt),
    agreementPdfUrl: normalizeText(rawAgreementPdfUrl),
    agreementType: normalizeText(rawAgreementType),
    SourceProspectId: normalizeText(rawSourceProspectId),
    PreferredCommunication: normalizeArray(rawPreferredCommunication),
    Company: normalizeText(rawCompany),
    CompanyName: normalizeText(rawCompanyName),
    Country: normalizeText(rawCountry),
    Industry: normalizeText(rawIndustry),
    ProfessionType: normalizeText(rawProfessionType),
    orbiterName: normalizeText(rawOrbiterName),
    orbiterContact: normalizeText(rawOrbiterContact),
    orbiterEmail: normalizeText(rawOrbiterEmail),
    id: ujbCode,
    updatedAt: new Date(),
  };

  return payload;
}

function validateTargetRecord(record = {}) {
  const errors = [];
  if (!normalizeText(record.UJBCode)) {
    errors.push("UJBCode is required");
  }
  if (!normalizeText(record.MobileNo)) {
    errors.push("MobileNo is required");
  }
  if (!Array.isArray(record.services)) {
    errors.push("services must be an array");
  }
  if (!Array.isArray(record.products)) {
    errors.push("products must be an array");
  }
  if (record.bankDetails && typeof record.bankDetails !== "object") {
    errors.push("bankDetails must be an object");
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  const defaultSourceEnv = "C:/Ruchita/Next/Universe_CC_tool/universe-dev/.env.local";
  const defaultTargetEnv = "C:/Ruchita/Next/Universe_CC_tool/UJB_Karma_CC/.env.local";
  const defaultSourceKey = "C:/Ruchita/Next/Universe_CC_tool/UJB_Karma_CC/json/old-project-key.json";
  const defaultTargetKey = "C:/Ruchita/Next/Universe_CC_tool/UJB_Karma_CC/json/prod-project-key.json";
  const sourceEnvPath = normalizeText(args["source-env"] || defaultSourceEnv);
  const targetEnvPath = normalizeText(args["target-env"] || defaultTargetEnv);
  const sourceKeyPath = normalizeText(args["source-key"] || defaultSourceKey);
  const targetKeyPath = normalizeText(args["target-key"] || defaultTargetKey);

  const sourceEnv = parseEnvFile(sourceEnvPath);
  const targetEnv = parseEnvFile(targetEnvPath);

  // Keep existing behavior for KYC secret resolution.
  loadEnvFile(targetEnvPath);
  loadEnvFile(".env.local");
  loadEnvFile(".env.development");

  const sourceCollection = normalizeText(args.source || "userdetail");
  const targetCollection = normalizeText(args.target || "usersdetail");
  const dryRun = parseBoolean(args["dry-run"], true);
  const limit = parseInteger(args.limit, 0);

  let sourceAdminConfig = null;
  let targetAdminConfig = null;
  let sourceLabel = "";
  let targetLabel = "";

  try {
    sourceAdminConfig = getAdminConfigFromKeyFile(sourceKeyPath);
    sourceLabel = `source key (${sourceKeyPath})`;
  } catch {
    sourceAdminConfig = getAdminConfigFromEnv(sourceEnv);
    sourceLabel = `source env (${sourceEnvPath})`;
  }

  try {
    targetAdminConfig = getAdminConfigFromKeyFile(targetKeyPath);
    targetLabel = `target key (${targetKeyPath})`;
  } catch {
    targetAdminConfig = getAdminConfigFromEnv(targetEnv);
    targetLabel = `target env (${targetEnvPath})`;
  }

  validateAdminConfig(sourceAdminConfig, sourceLabel);
  validateAdminConfig(targetAdminConfig, targetLabel);

  const sourceApp = admin.initializeApp(
    {
      credential: admin.credential.cert(sourceAdminConfig),
    },
    "source-app-userdetail"
  );
  const targetApp = admin.initializeApp(
    {
      credential: admin.credential.cert(targetAdminConfig),
    },
    "target-app-usersdetail"
  );

  const sourceDb = sourceApp.firestore();
  const targetDb = targetApp.firestore();
  const sourceSnap = await sourceDb.collection(sourceCollection).get();

  const summary = {
    total: sourceSnap.size,
    processed: 0,
    success: 0,
    skipped: 0,
    failed: 0,
    transformed: 0,
  };

  console.log(
    `[START] source=${sourceCollection} (${sourceAdminConfig.projectId}), target=${targetCollection} (${targetAdminConfig.projectId}), dryRun=${dryRun}, total=${summary.total}, limit=${limit || "none"}`
  );

  for (const docSnap of sourceSnap.docs) {
    if (limit > 0 && summary.processed >= limit) break;
    summary.processed += 1;

    const sourceData = docSnap.data() || {};
    const legacyDocId = docSnap.id;

    try {
      const mapped = buildTargetRecord(legacyDocId, sourceData);
      const validation = validateTargetRecord(mapped);
      if (!validation.valid) {
        summary.skipped += 1;
        console.log(
          `[SKIP] ${legacyDocId} -> ${mapped.UJBCode || "(missing)"} | validation=${validation.errors.join("; ")}`
        );
        continue;
      }

      const targetDocId = mapped.UJBCode;
      if (!targetDocId) {
        summary.skipped += 1;
        console.log(`[SKIP] ${legacyDocId} | missing target doc id`);
        continue;
      }

      summary.transformed += 1;

      if (!dryRun) {
        await targetDb.collection(targetCollection).doc(targetDocId).set(mapped, { merge: true });
      }

      summary.success += 1;
      console.log(
        `[OK] ${legacyDocId} -> ${targetDocId} | services=${mapped.services.length} products=${mapped.products.length}${dryRun ? " | dry-run" : ""}`
      );
    } catch (error) {
      summary.failed += 1;
      console.log(
        `[FAIL] ${legacyDocId} | ${error?.message || "Unknown error"}`
      );
    }
  }

  console.log("[DONE] Migration summary:");
  console.log(JSON.stringify(summary, null, 2));
  await sourceApp.delete();
  await targetApp.delete();
}

main().catch((error) => {
  console.error("[FATAL]", error?.message || error);
  process.exit(1);
});
