const SYSTEM_KEYS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "submittedAt",
  "auditLogs",
]);

function normalizeComparableValue(value) {
  if (value == null) return "";

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function diffChangedFields(previous = {}, next = {}) {
  const keys = new Set([
    ...Object.keys(previous || {}),
    ...Object.keys(next || {}),
  ]);

  return [...keys]
    .filter((key) => !SYSTEM_KEYS.has(key))
    .map((key) => {
      const before = normalizeComparableValue(previous?.[key]);
      const after = normalizeComparableValue(next?.[key]);

      if (before === after) {
        return null;
      }

      return {
        field: key,
        before,
        after,
      };
    })
    .filter(Boolean);
}

export function buildFormAuditEntry({
  formName,
  actionType,
  performedBy,
  userRole,
  userIdentity = "",
  changedFields = [],
}) {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    formName: String(formName || "").trim(),
    actionType: String(actionType || "").trim(),
    performedBy: String(performedBy || "").trim(),
    userRole: String(userRole || "").trim(),
    userIdentity: String(userIdentity || "").trim(),
    changedFields: Array.isArray(changedFields) ? changedFields : [],
    timestamp: new Date().toISOString(),
  };
}

export function appendFormAuditLogs(existingLogs = [], entries = []) {
  const nextLogs = Array.isArray(existingLogs) ? [...existingLogs] : [];

  for (const entry of entries) {
    if (entry) {
      nextLogs.push(entry);
    }
  }

  return nextLogs.slice(-100);
}

export function getFormAuditLogs(source = {}, formName) {
  const logs = Array.isArray(source?.formAuditLogs) ? source.formAuditLogs : [];
  return logs.filter((entry) => entry?.formName === formName);
}
