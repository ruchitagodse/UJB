import "server-only";
import { resolveAppEnv } from "@/lib/config/appEnv";

/**
 * Ensures required env variables exist
 * In development → warns instead of crashing
 * In production → throws error (strict)
 */
function ensureServerEnv(name, value) {
  const isProd = process.env.NODE_ENV === "production";

  if (typeof value !== "string" || value.trim() === "") {
    if (isProd) {
      throw new Error(
        `❌ Missing required server environment variable: ${name}`
      );
    } else {
      console.warn(`⚠️ Missing env: ${name}`);
      return ""; // prevent crash in dev
    }
  }

  return value.trim();
}

/**
 * Handles Firebase private key formatting
 */
function ensurePrivateKey(name, value) {
  const key = ensureServerEnv(name, value);

  if (!key) return "";

  const normalized = key.replace(/\\n/g, "\n");

  if (!normalized.includes("BEGIN PRIVATE KEY")) {
    console.warn(`⚠️ Invalid private key format: ${name}`);
  }

  return normalized;
}

const jwtSecret =
  process.env.JWT_SECRET?.trim() || "dev-secret";

const adminJwtSecret =
  process.env.ADMIN_JWT_SECRET?.trim() || jwtSecret;

export const serverEnv = Object.freeze({
  appEnv: resolveAppEnv(),
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",

  // 🔐 Auth
  jwtSecret,
  adminJwtSecret,

  // 🤖 OpenAI (optional in dev)
  openaiApiKey: ensureServerEnv(
    "OPENAI_API_KEY",
    process.env.OPENAI_API_KEY
  ),

  // 🔥 Firebase Admin
  firebaseAdmin: Object.freeze({
    projectId: ensureServerEnv(
      "FIREBASE_PROJECT_ID",
      process.env.FIREBASE_PROJECT_ID
    ),
    clientEmail: ensureServerEnv(
      "FIREBASE_CLIENT_EMAIL",
      process.env.FIREBASE_CLIENT_EMAIL
    ),
    privateKey: ensurePrivateKey(
      "FIREBASE_PRIVATE_KEY",
      process.env.FIREBASE_PRIVATE_KEY
    ),
    storageBucket: ensureServerEnv(
      "FIREBASE_STORAGE_BUCKET",
      process.env.FIREBASE_STORAGE_BUCKET ||
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    ),
  }),

  // 📱 WhatsApp (optional safe handling)
  whatsapp: Object.freeze({
    phoneNumberId: ensureServerEnv(
      "WHATSAPP_PHONE_NUMBER_ID",
      process.env.WHATSAPP_PHONE_NUMBER_ID
    ),
    accessToken: ensureServerEnv(
      "WHATSAPP_ACCESS_TOKEN",
      process.env.WHATSAPP_ACCESS_TOKEN
    ),
  }),
});
