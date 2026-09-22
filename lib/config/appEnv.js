const ALLOWED_APP_ENVS = new Set(["development", "staging", "production"]);

export function normalizeAppEnv(value, fallback = "development") {
  const normalized =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : "";

  if (ALLOWED_APP_ENVS.has(normalized)) {
    return normalized;
  }

  return fallback;
}

export function resolveAppEnv() {
  return normalizeAppEnv(
    process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV,
    process.env.NODE_ENV === "production" ? "production" : "development"
  );
}
