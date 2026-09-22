import "server-only";
import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

const PRODUCTION_APP_NAME = "contribution-points-production";

let initError = null;
let productionApp = null;
let productionProjectId = "";
const productionEnv = parseEnvFile(path.join(process.cwd(), ".env.production"));

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function getProductionCredentials() {
  const projectId =
    process.env.CONTRIBUTION_POINTS_FIREBASE_PROJECT_ID ||
    productionEnv.FIREBASE_PROJECT_ID ||
    (process.env.NEXT_PUBLIC_APP_ENV === "production"
      ? process.env.FIREBASE_PROJECT_ID
      : "");
  const clientEmail =
    process.env.CONTRIBUTION_POINTS_FIREBASE_CLIENT_EMAIL ||
    productionEnv.FIREBASE_CLIENT_EMAIL ||
    (process.env.NEXT_PUBLIC_APP_ENV === "production"
      ? process.env.FIREBASE_CLIENT_EMAIL
      : "");
  const privateKey = normalizePrivateKey(
    process.env.CONTRIBUTION_POINTS_FIREBASE_PRIVATE_KEY ||
      productionEnv.FIREBASE_PRIVATE_KEY ||
      (process.env.NEXT_PUBLIC_APP_ENV === "production"
        ? process.env.FIREBASE_PRIVATE_KEY
        : "")
  );
  const storageBucket =
    process.env.CONTRIBUTION_POINTS_FIREBASE_STORAGE_BUCKET ||
    productionEnv.FIREBASE_STORAGE_BUCKET ||
    productionEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    (process.env.NEXT_PUBLIC_APP_ENV === "production"
      ? process.env.FIREBASE_STORAGE_BUCKET ||
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      : "");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Contribution point production Firebase credentials are not configured."
    );
  }

  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "Contribution point production Firebase private key is invalid."
    );
  }

  return {
    projectId: projectId.trim(),
    clientEmail: clientEmail.trim(),
    privateKey,
    storageBucket: String(storageBucket || "").trim(),
  };
}

try {
  const credentials = getProductionCredentials();
  productionProjectId = credentials.projectId;
  productionApp =
    admin.apps.find((app) => app.name === PRODUCTION_APP_NAME) ||
    admin.initializeApp(
      {
        credential: admin.credential.cert({
          projectId: credentials.projectId,
          clientEmail: credentials.clientEmail,
          privateKey: credentials.privateKey,
        }),
        storageBucket: credentials.storageBucket || undefined,
      },
      PRODUCTION_APP_NAME
    );
} catch (error) {
  initError = error;
  console.error("Contribution point production Firebase initialization error:", error);
}

export const contributionPointProductionDb = productionApp
  ? admin.firestore(productionApp)
  : null;

export function getContributionPointProductionInitError() {
  return initError;
}

export function getContributionPointProductionProjectId() {
  return productionProjectId;
}

export function getContributionPointProductionCollections() {
  return Object.freeze({
    userDetail:
      process.env.CONTRIBUTION_POINTS_COLLECTION_USER_DETAIL ||
      productionEnv.NEXT_PUBLIC_COLLECTION_USER_DETAIL ||
      (process.env.NEXT_PUBLIC_APP_ENV === "production"
        ? process.env.NEXT_PUBLIC_COLLECTION_USER_DETAIL
        : "") ||
      "usersdetail",
  });
}
