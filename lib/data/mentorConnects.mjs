const USER_KEY_FIELDS = ["id", "UJBCode", "ujbCode", "UjbCode"];
const MENTOR_KEY_FIELDS = [
  "mentorId",
  "MentorId",
  "mentorID",
  "MentorID",
  "mentorUJBCode",
  "MentorUJBCode",
  "mentorUjbCode",
  "MentorUjbCode",
  "mentorCode",
  "MentorCode",
  "mentor",
];

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeKey(value) {
  return normalizeText(value).toUpperCase();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function getUserKeys(user = {}) {
  return [...new Set(
    USER_KEY_FIELDS
      .map((field) => normalizeKey(user?.[field]))
      .filter(Boolean)
  )];
}

function getMentorKey(user = {}) {
  for (const field of MENTOR_KEY_FIELDS) {
    const key = normalizeKey(user?.[field]);
    if (key) return key;
  }
  return "";
}

function buildConnectSummary(user = {}) {
  const id = firstNonEmpty(user.id);
  const ujbCode = firstNonEmpty(user.UJBCode, user.ujbCode, id);

  return {
    id,
    ujbCode,
    name: firstNonEmpty(user.Name, user.name),
    phone: firstNonEmpty(user.MobileNo, user.mobileNo, user.phoneNumber, user.phone),
    email: firstNonEmpty(user.Email, user.email),
  };
}

function connectSortKey(connect = {}) {
  return [
    normalizeKey(connect.name),
    normalizeKey(connect.ujbCode),
    normalizeKey(connect.id),
  ].join("|");
}

function sortConnects(connects = []) {
  return [...connects].sort((left, right) =>
    connectSortKey(left).localeCompare(connectSortKey(right))
  );
}

function normalizeConnects(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const id = firstNonEmpty(item.id);
      const ujbCode = firstNonEmpty(item.ujbCode, item.UJBCode, id);

      return {
        id,
        ujbCode,
        name: firstNonEmpty(item.name, item.Name),
        phone: firstNonEmpty(item.phone, item.MobileNo),
        email: firstNonEmpty(item.email, item.Email),
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      connectSortKey(left).localeCompare(connectSortKey(right))
    );
}

function sameConnects(left = [], right = []) {
  return JSON.stringify(normalizeConnects(left)) === JSON.stringify(normalizeConnects(right));
}

export function buildMentorConnectSyncPlan(users = []) {
  const records = users.map((user) => {
    const primaryId = firstNonEmpty(user?.id, user?.UJBCode, user?.ujbCode);
    const primaryKey = normalizeKey(primaryId);
    const summary = buildConnectSummary(user);
    const keys = getUserKeys(user);

    return {
      user,
      primaryId,
      primaryKey,
      mentorKey: getMentorKey(user),
      summary,
      keys,
      hasConnectsField: Object.prototype.hasOwnProperty.call(user || {}, "connects"),
    };
  });

  const recordsByKey = new Map();
  for (const record of records) {
    for (const key of record.keys) {
      if (!recordsByKey.has(key)) {
        recordsByKey.set(key, []);
      }
      recordsByKey.get(key).push(record);
    }
  }

  const syncMap = new Map();
  for (const record of records) {
    syncMap.set(record.primaryKey, {
      record,
      connects: [],
      seen: new Set(),
    });
  }

  for (const record of records) {
    if (!record.mentorKey) continue;

    const mentorRecords = recordsByKey.get(record.mentorKey) || [];
    const uniqueMentorRecords = new Map();

    for (const mentorRecord of mentorRecords) {
      if (!mentorRecord?.primaryKey) continue;
      uniqueMentorRecords.set(mentorRecord.primaryKey, mentorRecord);
    }

    for (const mentorRecord of uniqueMentorRecords.values()) {
      if (mentorRecord.primaryKey === record.primaryKey) {
        continue;
      }

      const slot = syncMap.get(mentorRecord.primaryKey);
      if (!slot) continue;

      const dedupeKey = normalizeKey(
        firstNonEmpty(record.summary.id, record.summary.ujbCode, record.summary.name, record.summary.email)
      );

      if (!dedupeKey || slot.seen.has(dedupeKey)) {
        continue;
      }

      slot.seen.add(dedupeKey);
      slot.connects.push(record.summary);
    }
  }

  return [...syncMap.values()].map((entry) => ({
    id: entry.record.primaryId,
    connects: sortConnects(entry.connects),
    currentConnects: Array.isArray(entry.record.user?.connects)
      ? entry.record.user.connects
      : [],
    hasConnectsField: entry.record.hasConnectsField,
    user: entry.record.user,
  }));
}

export function buildMentorConnectIndex(users = []) {
  const index = new Map();
  const plan = buildMentorConnectSyncPlan(users);

  for (const entry of plan) {
    const key = normalizeKey(entry.id);
    if (!key) continue;
    index.set(key, entry.connects);
  }

  return index;
}

export function applyDerivedConnectsToUser(users = [], targetUser = null) {
  if (!targetUser || typeof targetUser !== "object") return targetUser;

  const index = buildMentorConnectIndex(users);
  const targetKey = normalizeKey(firstNonEmpty(targetUser.id, targetUser.UJBCode, targetUser.ujbCode));
  if (!targetKey) return targetUser;

  const derivedConnects = index.get(targetKey) || [];

  return {
    ...targetUser,
    connects: derivedConnects,
  };
}

export async function syncMentorConnectsInProvider(provider, options = {}) {
  const { dryRun = false, logger = console } = options;

  if (!provider?.users?.listAll || !provider?.users?.updateByUjbCode) {
    throw new Error("Provider does not support user sync operations");
  }

  const users = await provider.users.listAll();
  const plan = buildMentorConnectSyncPlan(users);

  const summary = {
    scannedUsers: users.length,
    mentorsUpdated: 0,
    menteesLinked: 0,
    unchanged: 0,
    missingTargets: 0,
  };

  for (const entry of plan) {
    const targetId = firstNonEmpty(entry.id, entry.user?.UJBCode, entry.user?.ujbCode);
    if (!targetId) {
      summary.missingTargets += 1;
      continue;
    }

    if (entry.hasConnectsField && sameConnects(entry.currentConnects, entry.connects)) {
      summary.unchanged += 1;
      continue;
    }

    summary.mentorsUpdated += 1;
    summary.menteesLinked += entry.connects.length;

    if (!dryRun) {
      await provider.users.updateByUjbCode(targetId, {
        connects: entry.connects,
      });
    }

    if (logger?.log) {
      logger.log(
        `[${dryRun ? "DRY-RUN" : "SYNC"}] ${targetId} connects=${entry.connects.length}`
      );
    }
  }

  return summary;
}
