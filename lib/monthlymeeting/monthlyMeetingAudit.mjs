const SYSTEM_KEYS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "updatedBy",
  "auditLogs",
]);

function normalizeValue(value) {
  if (value == null) return "";

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserializable array]";
    }
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

function prettyValue(value) {
  if (value == null || value === "") return "—";

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return normalizeValue(value);
}

export function diffMonthlyMeetingFields(previous = {}, next = {}, keys = []) {
  const compareKeys = keys.length
    ? keys
    : [...new Set([...Object.keys(previous || {}), ...Object.keys(next || {})])];

  return compareKeys
    .filter((key) => !SYSTEM_KEYS.has(key))
    .map((field) => {
      const before = normalizeValue(previous?.[field]);
      const after = normalizeValue(next?.[field]);

      if (before === after) {
        return null;
      }

      return {
        field,
        before: prettyValue(previous?.[field]),
        after: prettyValue(next?.[field]),
      };
    })
    .filter(Boolean);
}

export function buildMonthlyMeetingAuditEntry({
  section,
  field,
  before,
  after,
  actor,
}) {
  const name = String(actor?.name || actor?.displayName || actor?.email || "Unknown").trim();
  const role = String(actor?.role || "admin").trim();
  const identity = String(actor?.identity?.id || actor?.id || actor?.email || "").trim();

  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    section: String(section || "").trim(),
    field: String(field || "").trim(),
    before: prettyValue(before),
    after: prettyValue(after),
    timestamp: new Date().toISOString(),
    changedBy: {
      name,
      role,
      identity,
    },
  };
}

export function appendMonthlyMeetingAuditLogs(existingLogs = [], entries = []) {
  const nextLogs = Array.isArray(existingLogs) ? [...existingLogs] : [];

  for (const entry of entries) {
    if (entry) {
      nextLogs.push(entry);
    }
  }

  return nextLogs.slice(-100);
}

export function getMonthlyMeetingAuditLogs(source = {}) {
  return Array.isArray(source?.auditLogs) ? source.auditLogs : [];
}
