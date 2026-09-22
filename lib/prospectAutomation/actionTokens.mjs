import { createHash, randomUUID } from "crypto";
import { publicEnv } from "@/lib/config/publicEnv";

const TOKEN_COLLECTION = "prospect_action_tokens";
const DEFAULT_EXPIRY_HOURS = 72;

function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function normalizeString(value) {
  return String(value || "").trim();
}

export function buildPublicBaseUrl(req) {
  const fallback =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    process.env.VERCEL_URL ||
    "";

  if (fallback) {
    const formatted = fallback.startsWith("http") ? fallback : `https://${fallback}`;
    return formatted.replace(/\/+$/, "");
  }

  const host = req?.headers?.get?.("host");
  if (host) {
    const protocol = host.includes("localhost") ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return "http://localhost:3000";
}

export function buildActionUrl(baseUrl, token) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/api/prospect-actions/${encodeURIComponent(
    token
  )}`;
}

function buildTokenCollection(db) {
  return db.collection(TOKEN_COLLECTION);
}

export async function issueProspectActionToken(db, payload = {}) {
  const prospectId = normalizeString(payload.prospectId);
  const action = normalizeString(payload.action);
  if (!prospectId || !action) {
    throw new Error("prospectId and action are required for action token.");
  }

  const rawToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const now = new Date();
  const ttlHours = Number.isFinite(payload.ttlHours) ? payload.ttlHours : DEFAULT_EXPIRY_HOURS;
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
  const tokenHash = hashToken(rawToken);

  await buildTokenCollection(db).add({
    tokenHash,
    tokenVersion: 1,
    action,
    prospectId,
    payload: payload.payload && typeof payload.payload === "object" ? payload.payload : {},
    createdAt: now,
    expiresAt,
    consumedAt: null,
    consumed: false,
    createdBy: normalizeString(payload.createdBy),
  });

  return {
    token: rawToken,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function consumeProspectActionToken(db, token, expectedAction = "") {
  const tokenHash = hashToken(token);
  const snapshot = await buildTokenCollection(db)
    .where("tokenHash", "==", tokenHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return { ok: false, reason: "invalid_token" };
  }

  const doc = snapshot.docs[0];
  const data = doc.data() || {};
  const now = new Date();
  const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);

  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: "expired_token", tokenRef: doc.ref, tokenData: data };
  }

  if (data.consumed || data.consumedAt) {
    return { ok: false, reason: "consumed_token", tokenRef: doc.ref, tokenData: data };
  }

  if (expectedAction && normalizeString(data.action) !== normalizeString(expectedAction)) {
    return { ok: false, reason: "action_mismatch", tokenRef: doc.ref, tokenData: data };
  }

  await doc.ref.set(
    {
      consumed: true,
      consumedAt: now,
    },
    { merge: true }
  );

  return {
    ok: true,
    tokenId: doc.id,
    action: normalizeString(data.action),
    prospectId: normalizeString(data.prospectId),
    payload: data.payload && typeof data.payload === "object" ? data.payload : {},
  };
}

export function getProspectCollection(db) {
  return db.collection(publicEnv.collections.prospect);
}

