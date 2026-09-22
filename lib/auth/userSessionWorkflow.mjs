export const USER_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180;
export const USER_SESSION_REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 7;

export function buildUserSessionRecord({
  phone,
  ujbCode,
  userData,
  ip,
  geo,
  deviceInfo,
  now = Date.now(),
}) {
  return {
    phone,
    ujbCode,
    name: userData?.Name || "",
    type: userData?.Type || "",
    ip,
    geo,
    deviceInfo,
    createdAt: now,
    expiry: now + USER_SESSION_MAX_AGE_MS,
    revoked: false,
  };
}

function shouldUseSecureCookie(isProduction, req) {
  if (!isProduction) return false;

  const hostHeader = String(req?.headers?.get?.("host") || "").toLowerCase();
  const hostname = String(req?.nextUrl?.hostname || "").toLowerCase();
  const forwardedProto = String(
    req?.headers?.get?.("x-forwarded-proto") || ""
  ).toLowerCase();
  const protocol = String(req?.nextUrl?.protocol || "").toLowerCase();

  const isLocalHost =
    hostHeader.includes("localhost") ||
    hostHeader.includes("127.0.0.1") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1";

  if (isLocalHost) return false;

  if (forwardedProto) {
    return forwardedProto.includes("https");
  }

  return protocol === "https:";
}

export function getUserSessionCookieOptions(isProduction, req) {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookie(isProduction, req),
    sameSite: "lax",
    path: "/",
    maxAge: USER_SESSION_MAX_AGE_MS / 1000,
  };
}

export function getLogoutCookieOptions(isProduction, req) {
  return {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
    secure: shouldUseSecureCookie(isProduction, req),
    sameSite: "lax",
  };
}

export function validateUserSessionRecord(session, now = Date.now()) {
  if (!session) {
    return { ok: false, reason: "missing" };
  }

  if (session.revoked) {
    return { ok: false, reason: "revoked" };
  }

  if (now > session.expiry) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true };
}

export function shouldRefreshUserSession(session, now = Date.now()) {
  return session.expiry - now < USER_SESSION_REFRESH_THRESHOLD_MS;
}

export function buildUserSessionResponse(session) {
  return {
    phone: session.phone,
    role: "user",
    profile: {
      ujbCode: session.ujbCode,
      name: session.name,
      type: session.type,
    },
  };
}

export function getLogoutAllRevocations(sessionDocs) {
  return sessionDocs.map((docSnap) => ({
    id: docSnap.id,
    ref: docSnap.ref,
    data: typeof docSnap.data === "function" ? docSnap.data() : docSnap.data,
  }));
}
