import { API_ERROR_CODES } from "../api/contracts.mjs";

export const USER_ACTOR_TYPE = "user";
export const ADMIN_ACTOR_TYPE = "admin";

/**
 * @typedef {{
 *   actorType: "user",
 *   ujbCode: string,
 *   phone: string,
 *   sessionId: string,
 *   role: "user",
 *   permissions: string[],
 *   identity: { id: string, ujbCode: string, phone: string }
 * }} UserAuthContext
 */

/**
 * @typedef {{
 *   actorType: "admin",
 *   email: string,
 *   name: string,
 *   role: string,
 *   permissions: string[],
 *   designation: string,
 *   photo: string | null,
 *   identity: { id: string, email: string }
 * }} AdminAuthContext
 */

/**
 * @param {{ session: object, sessionId: string }} input
 * @returns {UserAuthContext}
 */
export function buildUserAuthContext({ session, sessionId }) {
  const ujbCode = String(session?.ujbCode || "").trim();
  const phone = String(session?.phone || "").trim();

  return {
    actorType: USER_ACTOR_TYPE,
    ujbCode,
    phone,
    sessionId: String(sessionId || "").trim(),
    role: "user",
    permissions: [],
    identity: {
      id: ujbCode,
      ujbCode,
      phone,
    },
  };
}

/**
 * @param {object} admin
 * @returns {AdminAuthContext}
 */
export function buildAdminAuthContext(admin) {
  const email = String(admin?.email || "").trim().toLowerCase();
  const role = String(admin?.role || "").trim();

  return {
    actorType: ADMIN_ACTOR_TYPE,
    email,
    name: String(admin?.name || "").trim(),
    role,
    permissions: role ? [role] : [],
    designation: String(admin?.designation || "").trim(),
    photo: admin?.photo || null,
    identity: {
      id: email,
      email,
    },
  };
}

export function authFailure({
  status = 401,
  message = "Unauthorized",
  code = API_ERROR_CODES.AUTH_REQUIRED,
  reason = "",
} = {}) {
  return {
    ok: false,
    status,
    message,
    code,
    reason,
  };
}
