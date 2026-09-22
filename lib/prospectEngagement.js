export function buildProspectEngagementUpdate(note, overrides = {}) {
  const timestamp = overrides.lastEngagementDate || new Date();

  return {
    lastEngagementDate: timestamp,
    lastEngagementNote: String(note || "").trim(),
    updatedAt: overrides.updatedAt || new Date(),
    ...overrides,
  };
}

