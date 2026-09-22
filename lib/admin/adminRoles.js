export const ADMIN_USERS_COLLECTION = "AdminUsers";
export const ADMIN_ROLES_COLLECTION = "AdminRoles";
export const DEFAULT_ADMIN_ROLE_NAMES = ["Admin", "Super"];

export function normalizeRoleName(roleName) {
  return String(roleName || "").trim().toLowerCase();
}

export function getMergedAdminRoleNames(roleNames = []) {
  const seen = new Set();
  const merged = [];

  for (const roleName of [...DEFAULT_ADMIN_ROLE_NAMES, ...roleNames]) {
    const trimmedName = String(roleName || "").trim();
    const normalizedName = normalizeRoleName(trimmedName);

    if (!normalizedName || seen.has(normalizedName)) {
      continue;
    }

    seen.add(normalizedName);
    merged.push(trimmedName);
  }

  return merged;
}

export function toRoleOptions(roleNames = []) {
  return getMergedAdminRoleNames(roleNames).map((roleName) => ({
    label: roleName,
    value: roleName,
  }));
}

export function isSystemAdminRole(roleName) {
  return DEFAULT_ADMIN_ROLE_NAMES.some(
    (defaultRoleName) =>
      normalizeRoleName(defaultRoleName) === normalizeRoleName(roleName)
  );
}
