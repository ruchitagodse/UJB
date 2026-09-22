import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import {
  adminDb as defaultAdminDb,
  getFirebaseAdminInitError as getDefaultFirebaseAdminInitError,
} from "@/lib/firebase/firebaseAdmin";
import { API_ERROR_CODES } from "@/lib/api/contracts.mjs";
import { USER_COOKIE_NAME } from "@/lib/auth/accessControl";
import {
  authFailure,
  buildUserAuthContext,
} from "@/lib/auth/authContexts.mjs";
import { serverEnv } from "@/lib/config/serverEnv";
import {
  shouldRefreshUserSession,
  USER_SESSION_MAX_AGE_MS,
  validateUserSessionRecord,
} from "@/lib/auth/userSessionWorkflow.mjs";

export async function requireUserSession(req, options = {}) {
  const adminDb = options.adminDb || defaultAdminDb;
  const getFirebaseAdminInitError =
    options.getFirebaseAdminInitError || getDefaultFirebaseAdminInitError;
  const firebaseAdminInitError = getFirebaseAdminInitError();

  if (firebaseAdminInitError || !adminDb) {
    return authFailure({
      status: 500,
      message: "User session access is not configured.",
      code: API_ERROR_CODES.PROVIDER_UNAVAILABLE,
      reason: "provider_unavailable",
    });
  }

  const token = req.cookies.get(USER_COOKIE_NAME)?.value;

  if (!token) {
    return authFailure({
      status: 401,
      message: "Unauthorized",
      code: API_ERROR_CODES.AUTH_REQUIRED,
      reason: "missing_user_session_cookie",
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, serverEnv.jwtSecret);
  } catch {
    return authFailure({
      status: 401,
      message: "Unauthorized",
      code: API_ERROR_CODES.AUTH_REQUIRED,
      reason: "invalid_user_session_token",
    });
  }

  const sessionId = String(decoded?.sessionId || "").trim();

  if (!sessionId) {
    return authFailure({
      status: 401,
      message: "Unauthorized",
      code: API_ERROR_CODES.AUTH_REQUIRED,
      reason: "missing_user_session_id",
    });
  }

  try {
    const sessionRef = adminDb.collection("user_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return authFailure({
        status: 401,
        message: "Session not found",
        code: API_ERROR_CODES.AUTH_REQUIRED,
        reason: "user_session_not_found",
      });
    }

    const session = sessionSnap.data();
    const validation = validateUserSessionRecord(session, Date.now());

    if (!validation.ok) {
      return authFailure({
        status: 401,
        message: "Session invalid",
        code: API_ERROR_CODES.AUTH_REQUIRED,
        reason: validation.reason || "invalid_user_session_record",
      });
    }

    if (shouldRefreshUserSession(session, Date.now())) {
      await sessionRef.update({
        expiry: Date.now() + USER_SESSION_MAX_AGE_MS,
      });
    }

    return {
      ok: true,
      context: buildUserAuthContext({ session, sessionId }),
      session,
    };
  } catch (error) {
    return authFailure({
      status: 500,
      message: "User session validation failed",
      code: API_ERROR_CODES.PROVIDER_FAILURE,
      reason: error?.message || "user_session_provider_failure",
    });
  }
}

export async function validateUserRequest(req, adminDb, getFirebaseAdminInitError) {
  const firebaseAdminInitError = getFirebaseAdminInitError();

  if (firebaseAdminInitError || !adminDb) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          message:
            "Profile access is not configured. Missing or invalid Firebase Admin credentials.",
        },
        { status: 500 }
      ),
    };
  }

  const token = req.cookies.get("crm_token")?.value;

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const decoded = jwt.verify(token, serverEnv.jwtSecret);
    const sessionRef = adminDb.collection("user_sessions").doc(decoded.sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return {
        ok: false,
        response: NextResponse.json(
          { message: "Session not found" },
          { status: 401 }
        ),
      };
    }

    const session = sessionSnap.data();
    const validation = validateUserSessionRecord(session, Date.now());

    if (!validation.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          { message: "Session invalid" },
          { status: 401 }
        ),
      };
    }

    if (shouldRefreshUserSession(session, Date.now())) {
      await sessionRef.update({
        expiry: Date.now() + USER_SESSION_MAX_AGE_MS,
      });
    }

    return { ok: true, session };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ message: "Unauthorized" }, { status: 401 }),
    };
  }
}
