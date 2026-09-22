import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUserSessionRecord,
  buildUserSessionResponse,
  getLogoutAllRevocations,
  getLogoutCookieOptions,
  getUserSessionCookieOptions,
  shouldRefreshUserSession,
  USER_SESSION_MAX_AGE_MS,
  validateUserSessionRecord,
} from "../lib/auth/userSessionWorkflow.mjs";
import {
  buildAdminSessionPayload,
  findAuthorizedAdmin,
  validateAdminSessionAccess,
} from "../lib/auth/adminAccessWorkflow.mjs";

const hasAdminAccess = (role) => String(role || "").toLowerCase().includes("admin");

test("OTP login helpers create a long-lived user session record", () => {
  const now = 1_700_000_000_000;
  const session = buildUserSessionRecord({
    phone: "9999999999",
    ujbCode: "UJB001",
    userData: { Name: "Ruchita", Type: "Orbiter" },
    ip: "127.0.0.1",
    geo: { city: "Pune" },
    deviceInfo: { type: "Desktop" },
    now,
  });

  assert.equal(session.phone, "9999999999");
  assert.equal(session.name, "Ruchita");
  assert.equal(session.type, "Orbiter");
  assert.equal(session.createdAt, now);
  assert.equal(session.expiry, now + USER_SESSION_MAX_AGE_MS);
  assert.equal(session.revoked, false);
});

test("session validation helpers reject revoked or expired sessions and refresh near-expiry sessions", () => {
  const now = 1_700_000_000_000;

  assert.deepEqual(validateUserSessionRecord(null, now), {
    ok: false,
    reason: "missing",
  });
  assert.deepEqual(
    validateUserSessionRecord({ revoked: true, expiry: now + 1000 }, now),
    { ok: false, reason: "revoked" }
  );
  assert.deepEqual(
    validateUserSessionRecord({ revoked: false, expiry: now - 1 }, now),
    { ok: false, reason: "expired" }
  );
  assert.deepEqual(
    validateUserSessionRecord({ revoked: false, expiry: now + 1000 }, now),
    { ok: true }
  );

  assert.equal(
    shouldRefreshUserSession(
      { expiry: now + 1000 * 60 * 60 * 24 * 3, revoked: false },
      now
    ),
    true
  );
  assert.equal(
    shouldRefreshUserSession(
      { expiry: now + 1000 * 60 * 60 * 24 * 20, revoked: false },
      now
    ),
    false
  );
});

test("logout helpers expose cookie clearing and bulk revocation targets", () => {
  const cookieOptions = getLogoutCookieOptions(true);
  assert.equal(cookieOptions.httpOnly, true);
  assert.equal(cookieOptions.secure, true);
  assert.equal(cookieOptions.path, "/");

  const revocations = getLogoutAllRevocations([
    { id: "a", ref: { update() {} }, data: () => ({ phone: "1" }) },
    { id: "b", ref: { update() {} }, data: () => ({ phone: "1" }) },
  ]);

  assert.deepEqual(
    revocations.map((item) => item.id),
    ["a", "b"]
  );
});

test("user session response and cookie helpers stay consistent", () => {
  const payload = buildUserSessionResponse({
    phone: "9999999999",
    ujbCode: "UJB001",
    name: "Ruchita",
    type: "Orbiter",
  });

  assert.deepEqual(payload, {
    phone: "9999999999",
    role: "user",
    profile: {
      ujbCode: "UJB001",
      name: "Ruchita",
      type: "Orbiter",
    },
  });

  const cookie = getUserSessionCookieOptions(false);
  assert.equal(cookie.maxAge, USER_SESSION_MAX_AGE_MS / 1000);
  assert.equal(cookie.secure, false);
});

test("admin access helpers only authorize admin-capable roles", () => {
  const docs = [
    {
      data: () => ({ email: "member@example.com", role: "Member" }),
    },
    {
      data: () => ({
        email: "admin@example.com",
        role: "Admin",
        name: "Admin User",
      }),
    },
  ];

  const denied = findAuthorizedAdmin(docs, "member@example.com", hasAdminAccess);
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);

  const allowed = findAuthorizedAdmin(docs, "admin@example.com", hasAdminAccess);
  assert.equal(allowed.ok, true);
  assert.equal(allowed.role, "Admin");

  const sessionPayload = buildAdminSessionPayload(
    allowed.adminData,
    { email: "admin@example.com", name: "Fallback Name", picture: "photo.png" }
  );
  assert.equal(sessionPayload.email, "admin@example.com");
  assert.equal(sessionPayload.name, "Admin User");

  const validation = validateAdminSessionAccess(
    { ...sessionPayload, designation: "" },
    hasAdminAccess
  );
  assert.equal(validation.ok, true);

  const forbidden = validateAdminSessionAccess(
    { role: "Member", email: "member@example.com" },
    hasAdminAccess
  );
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.status, 403);
});
