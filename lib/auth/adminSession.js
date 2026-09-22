import jwt from "jsonwebtoken";
import { ADMIN_COOKIE_NAME } from "@/lib/auth/accessControl";
import { serverEnv } from "@/lib/config/serverEnv";

const ADMIN_SESSION_AGE_SECONDS = 60 * 60 * 8;

function getAdminSessionSecret() {
  return serverEnv.adminJwtSecret;
}

export function createAdminSessionToken(payload) {
  const secret = getAdminSessionSecret();

  if (!secret) {
    throw new Error("Missing ADMIN_JWT_SECRET or JWT_SECRET");
  }

  return jwt.sign(
    {
      role: payload.role,
      email: payload.email,
      name: payload.name,
      designation: payload.designation || "",
      photo: payload.photo || null,
    },
    secret,
    { expiresIn: `${ADMIN_SESSION_AGE_SECONDS}s` }
  );
}

export function verifyAdminSessionToken(token) {
  const secret = getAdminSessionSecret();

  if (!secret) {
    throw new Error("Missing ADMIN_JWT_SECRET or JWT_SECRET");
  }

  return jwt.verify(token, secret);
}

export function setAdminSessionCookie(response, token) {
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    // secure: false,
    secure: serverEnv.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_AGE_SECONDS,
  });
}

export function clearAdminSessionCookie(response) {
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export { ADMIN_COOKIE_NAME };
