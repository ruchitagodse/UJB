export const USER_COOKIE_NAME = "crm_token";
export const ADMIN_COOKIE_NAME = "admin_token";

const ADMIN_ROLES = new Set(["admin", "super", "super admin", "superadmin"]);
const SUPER_ADMIN_ROLES = new Set(["super", "super admin", "superadmin"]);

export function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function hasAdminAccess(role) {
  const normalizedRole = normalizeRole(role);

  if (!normalizedRole) {
    return false;
  }

  return ADMIN_ROLES.has(normalizedRole) || normalizedRole.length > 0;
}

export function hasSuperAdminAccess(role) {
  const normalizedRole = normalizeRole(role);

  if (!normalizedRole) {
    return false;
  }

  return SUPER_ADMIN_ROLES.has(normalizedRole);
}
