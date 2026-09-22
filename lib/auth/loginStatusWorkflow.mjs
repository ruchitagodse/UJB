export const LOGIN_STATUS_ACTIVE = "Active";
export const LOGIN_STATUS_INACTIVE = "Inactive";

export const LOGIN_STATUS_OPTIONS = Object.freeze([
  LOGIN_STATUS_ACTIVE,
  LOGIN_STATUS_INACTIVE,
]);

export const DEFAULT_LOGIN_STATUS = LOGIN_STATUS_ACTIVE;

export function normalizeLoginStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === "active") {
    return LOGIN_STATUS_ACTIVE;
  }

  if (normalized === "inactive") {
    return LOGIN_STATUS_INACTIVE;
  }

  return null;
}

export function resolveLoginStatus(value, fallback = DEFAULT_LOGIN_STATUS) {
  return normalizeLoginStatus(value) || fallback;
}

export function isInactiveLoginStatus(value) {
  return normalizeLoginStatus(value) === LOGIN_STATUS_INACTIVE;
}

