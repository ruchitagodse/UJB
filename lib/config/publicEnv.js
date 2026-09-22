import { resolveAppEnv } from "@/lib/config/appEnv";

function ensurePublicEnv(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required public environment variable: ${name}`);
  }

  return value.trim();
}

const firebase = Object.freeze({
  apiKey: ensurePublicEnv(
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  ),
  authDomain: ensurePublicEnv(
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  ),
  projectId: ensurePublicEnv(
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ),
  storageBucket: ensurePublicEnv(
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  ),
  messagingSenderId: ensurePublicEnv(
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  ),
  appId: ensurePublicEnv(
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  ),
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() || undefined,
});

const collections = Object.freeze({
  conclaves: ensurePublicEnv(
    "NEXT_PUBLIC_COLLECTION_CONCLAVES",
    process.env.NEXT_PUBLIC_COLLECTION_CONCLAVES
  ),
  loginLogs: ensurePublicEnv(
    "NEXT_PUBLIC_COLLECTION_LOGIN_LOGS",
    process.env.NEXT_PUBLIC_COLLECTION_LOGIN_LOGS
  ),
  monthlyMeeting: ensurePublicEnv(
    "NEXT_PUBLIC_COLLECTION_MONTHLY_MEETING",
    process.env.NEXT_PUBLIC_COLLECTION_MONTHLY_MEETING
  ),
  pageVisit: ensurePublicEnv(
    "NEXT_PUBLIC_COLLECTION_PAGE_VISIT",
    process.env.NEXT_PUBLIC_COLLECTION_PAGE_VISIT
  ),
  referral: ensurePublicEnv(
    "NEXT_PUBLIC_COLLECTION_REFERRAL",
    process.env.NEXT_PUBLIC_COLLECTION_REFERRAL
  ),
  birthdayCanva: ensurePublicEnv(
    "NEXT_PUBLIC_COLLECTION_BIRTHDAY_CANVA",
    process.env.NEXT_PUBLIC_COLLECTION_BIRTHDAY_CANVA
  ),
  userDetail: ensurePublicEnv(
    "NEXT_PUBLIC_COLLECTION_USER_DETAIL",
    process.env.NEXT_PUBLIC_COLLECTION_USER_DETAIL
  ),
  prospect: ensurePublicEnv(
    "NEXT_PUBLIC_COLLECTION_PROSPECT",
    process.env.NEXT_PUBLIC_COLLECTION_PROSPECT
  ),
  doorstep: ensurePublicEnv(
    "NEXT_PUBLIC_COLLECTION_DOORSTEP",
    process.env.NEXT_PUBLIC_COLLECTION_DOORSTEP
  ),
  orbiter: ensurePublicEnv(
    "NEXT_PUBLIC_COLLECTION_ORBITER",
    process.env.NEXT_PUBLIC_COLLECTION_ORBITER
  ),
});

export const publicEnv = Object.freeze({
  appEnv: resolveAppEnv(),
  firebase,
  collections,
});
