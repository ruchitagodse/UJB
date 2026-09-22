import { NextResponse } from "next/server";
import { API_ERROR_CODES } from "@/lib/api/contracts.mjs";
import { hasAdminAccess as defaultHasAdminAccess } from "@/lib/auth/accessControl";
import {
  ADMIN_COOKIE_NAME,
  verifyAdminSessionToken,
} from "@/lib/auth/adminSession";
import {
  authFailure,
  buildAdminAuthContext,
} from "@/lib/auth/authContexts.mjs";
import { validateAdminSessionAccess } from "@/lib/auth/adminAccessWorkflow.mjs";

export function requireAdminSession(req, hasAdminAccess = defaultHasAdminAccess) {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;

  if (!token) {
    return authFailure({
      status: 401,
      message: "Unauthorized",
      code: API_ERROR_CODES.AUTH_REQUIRED,
      reason: "missing_admin_session_cookie",
    });
  }

  try {
    const decoded = verifyAdminSessionToken(token);
    const validation = validateAdminSessionAccess(decoded, hasAdminAccess);

    if (!validation.ok) {
      return authFailure({
        status: validation.status,
        message: validation.message,
        code:
          validation.status === 403
            ? API_ERROR_CODES.FORBIDDEN
            : API_ERROR_CODES.AUTH_REQUIRED,
        reason:
          validation.status === 403
            ? "admin_forbidden"
            : "invalid_admin_session",
      });
    }

    return {
      ok: true,
      admin: validation.admin,
      context: buildAdminAuthContext(validation.admin),
    };
  } catch {
    return authFailure({
      status: 401,
      message: "Unauthorized",
      code: API_ERROR_CODES.AUTH_REQUIRED,
      reason: "invalid_admin_session_token",
    });
  }
}

export function validateAdminRequest(req, hasAdminAccess) {
  const result = requireAdminSession(req, hasAdminAccess);

  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: result.message },
        { status: result.status }
      ),
    };
  }

  return { ok: true, admin: result.admin, context: result.context };
}
