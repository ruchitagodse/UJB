import * as XLSX from "xlsx";
import { serializeFirestoreValue } from "@/lib/data/firebase/documentRepository.mjs";
import { publicEnv } from "@/lib/config/publicEnv";
import sanitizeForFirestore from "@/utils/sanitizeForFirestore";
import { getDefaultCpNotificationTemplate } from "@/lib/contribution-points/notificationTemplates";

export const CP_BOARD_COLLECTION = "CPBoard";
export const CP_ACTIVITY_COLLECTION = "cpactivity";
export const USER_ACTIVITY_LOG_COLLECTION = "user_activity_log";

function normalizeNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function normalizeName(value) {
  return String(value || "").trim();
}

function normalizeUjbCode(value) {
  return String(value || "").trim().toUpperCase();
}

function isActivityOwnedByUjbCode(activity = {}, ujbCode = "") {
  const expected = normalizeUjbCode(ujbCode);
  if (!expected) return true;

  const candidateKeys = [
    "ujbCode",
    "memberUjbCode",
    "userUjbCode",
    "forUjbCode",
    "recipientUjbCode",
    "UJBCode",
  ];
  const candidateValues = candidateKeys
    .map((key) => normalizeUjbCode(activity?.[key]))
    .filter(Boolean);

  if (candidateValues.length === 0) {
    return true;
  }

  return candidateValues.includes(expected);
}

function renderTemplate(template, variables = {}) {
  const raw = String(template || "").trim();
  if (!raw) return "";
  return raw.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = variables?.[key];
    if (value === undefined || value === null || value === "") return match;
    return String(value);
  });
}

export function buildCpTotals(activities) {
  return activities.reduce(
    (totals, activity) => {
      const points = normalizeNumber(activity.points);
      totals.total += points;

      if (activity.categories?.includes("R")) totals.relation += points;
      if (activity.categories?.includes("H")) totals.health += points;
      if (activity.categories?.includes("W")) totals.wealth += points;

      return totals;
    },
    { total: 0, relation: 0, health: 0, wealth: 0 }
  );
}

function normalizeActivityCategories(activity) {
  if (Array.isArray(activity.categories) && activity.categories.length > 0) {
    return activity.categories;
  }

  if (activity.category) {
    return [String(activity.category).trim().toUpperCase()];
  }

  return ["W"];
}

export function serializeCpBoardUser(docSnap) {
  return {
    id: docSnap.id,
    ...serializeFirestoreValue(docSnap.data() || {}),
  };
}

export function serializeCpActivity(docSnap) {
  const data = serializeFirestoreValue(docSnap.data() || {});
  const categories = normalizeActivityCategories(data);
  const points = normalizeNumber(data.points);

  return {
    id: docSnap.id,
    ...data,
    points,
    direction: points < 0 ? "DEBIT" : "CREDIT",
    category: data.category || categories[0],
    categories,
  };
}

export async function fetchCpBoardSummaryByUjbCode(adminDb, ujbCode) {
  const userSnap = await adminDb.collection(CP_BOARD_COLLECTION).doc(ujbCode).get();

  async function tryReadActivityCollection(collectionName) {
    try {
      const snap = await adminDb
        .collection(CP_BOARD_COLLECTION)
        .doc(ujbCode)
        .collection(collectionName)
        .orderBy("addedAt", "desc")
        .get();
      return snap.docs.map(serializeCpActivity);
    } catch {
      try {
        const snap = await adminDb
          .collection(CP_BOARD_COLLECTION)
          .doc(ujbCode)
          .collection(collectionName)
          .get();
        return snap.docs.map(serializeCpActivity);
      } catch {
        return [];
      }
    }
  }

  function mapLegacyUserActivityLog(docSnap) {
    const data = serializeFirestoreValue(docSnap.data() || {});
    const points = normalizeNumber(
      data.points ?? data.cpPoints ?? data.point ?? data.value
    );
    const category = String(
      data.category || data.cpCategory || data.bucket || "W"
    )
      .trim()
      .toUpperCase();

    return {
      id: docSnap.id,
      activityNo: data.activityNo || data.code || "",
      activityName:
        data.activityName || data.activity || data.title || "CP Activity",
      categories: [category || "W"],
      category: category || "W",
      points,
      direction: points < 0 ? "DEBIT" : "CREDIT",
      purpose: data.purpose || data.description || data.note || "",
      month: data.month || "",
      addedAt: data.addedAt || data.createdAt || data.timestamp || data.date || null,
    };
  }

  async function readLegacyUserActivityLog() {
    const keys = ["ujbCode", "memberUjbCode", "userUjbCode"];
    for (const key of keys) {
      try {
        const snap = await adminDb
          .collection(USER_ACTIVITY_LOG_COLLECTION)
          .where(key, "==", ujbCode)
          .get();
        if (snap.size > 0) {
          return snap.docs.map(mapLegacyUserActivityLog);
        }
      } catch {
        // continue to next possible key
      }
    }
    return [];
  }

  const primaryActivities = await tryReadActivityCollection("activities");
  const fallbackActivities =
    primaryActivities.length > 0
      ? []
      : [
          ...(await tryReadActivityCollection("activity")),
          ...(await tryReadActivityCollection("cpActivity")),
          ...(await readLegacyUserActivityLog()),
        ];

  const activities = (primaryActivities.length > 0
    ? primaryActivities
    : fallbackActivities
  )
    .filter((activity) => isActivityOwnedByUjbCode(activity, ujbCode))
    .sort((left, right) => {
    const leftTime =
      typeof left?.addedAt?.seconds === "number"
        ? left.addedAt.seconds * 1000
        : new Date(left?.addedAt || 0).getTime() || 0;
    const rightTime =
      typeof right?.addedAt?.seconds === "number"
        ? right.addedAt.seconds * 1000
        : new Date(right?.addedAt || 0).getTime() || 0;
    return rightTime - leftTime;
  });
  const computedTotals = buildCpTotals(activities);
  const persistedTotals = userSnap.exists
    ? serializeFirestoreValue(userSnap.data() || {})?.totals
    : null;
  const hasComputedTotals =
    computedTotals.total > 0 ||
    computedTotals.relation > 0 ||
    computedTotals.health > 0 ||
    computedTotals.wealth > 0;

  const totals =
    hasComputedTotals || !persistedTotals || typeof persistedTotals !== "object"
      ? computedTotals
      : {
          total: normalizeNumber(persistedTotals.total),
          relation: normalizeNumber(persistedTotals.relation),
          health: normalizeNumber(persistedTotals.health),
          wealth: normalizeNumber(persistedTotals.wealth),
        };

  return {
    user: userSnap.exists ? serializeCpBoardUser(userSnap) : null,
    activities,
    totals,
  };
}

export async function fetchCpBoardMembers(adminDb) {
  const snap = await adminDb.collection(CP_BOARD_COLLECTION).get();

  const members = await Promise.all(
    snap.docs.map(async (docSnap) => {
      const summary = await fetchCpBoardSummaryByUjbCode(adminDb, docSnap.id);
      return {
        ...serializeCpBoardUser(docSnap),
        totalPoints: summary.totals.total,
      };
    })
  );

  return members.sort((a, b) => b.totalPoints - a.totalPoints);
}

export function parseCpActivityWorkbookRows(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return rows.map((row, index) => ({
    id: index + 1,
    activityName: String(
      row.activityName || row.ActivityName || row.Activity || ""
    ).trim(),
    categories: String(
      row.categories || row.Categories || row.Category || "W"
    )
      .split(",")
      .map((category) => category.trim().toUpperCase())
      .filter(Boolean),
    points: Number(row.points || row.Points || 0),
    purpose: String(row.purpose || row.Purpose || "").trim(),
    month: String(row.month || row.Month || "").trim(),
  }));
}

export async function importCpActivities(adminDb, rows) {
  await Promise.all(
    rows.map((row) =>
      adminDb.collection(CP_ACTIVITY_COLLECTION).add(
        sanitizeForFirestore({
          activityName: row.activityName,
          categories: row.categories,
          points: normalizeNumber(row.points),
          purpose: row.purpose || "",
          month: row.month || "",
          createdAt: new Date(),
        })
      )
    )
  );
}

export async function fetchCpActivityDefinitions(adminDb) {
  const snap = await adminDb.collection(CP_ACTIVITY_COLLECTION).get();

  const rows = await Promise.all(
    snap.docs.map(async (docSnap) => {
      const usageSnap = await adminDb
        .collection(USER_ACTIVITY_LOG_COLLECTION)
        .where("activityId", "==", docSnap.id)
        .get();
      const activity = serializeCpActivity(docSnap);

      return {
        ...activity,
        notificationMessageTemplate:
          activity.notificationMessageTemplate ||
          getDefaultCpNotificationTemplate(activity.activityNo, activity.activityName),
        usageCount: usageSnap.size,
      };
    })
  );

  return rows;
}

export async function fetchActiveCpActivityDefinitions(adminDb) {
  const rows = await fetchCpActivityDefinitions(adminDb);

  return rows
    .filter((row) => row.status === "ACTIVE")
    .sort((left, right) =>
      String(left.activityName || "").localeCompare(String(right.activityName || ""))
    );
}

export async function getNextCpActivityId(adminDb) {
  const snap = await adminDb.collection(CP_ACTIVITY_COLLECTION).get();
  let maxId = 0;

  snap.docs.forEach((docSnap) => {
    if (/^\d+$/.test(docSnap.id)) {
      maxId = Math.max(maxId, Number(docSnap.id));
    }
  });

  return String(maxId + 1).padStart(3, "0");
}

export async function saveCpActivityDefinition(adminDb, form, editingId = null) {
  const category = String(form.category || "W").trim().toUpperCase();
  const activityNo = String(form.activityNo || "").trim();
  const activityName = String(form.activityName || "").trim();
  const notificationMessageTemplate = String(
    form.notificationMessageTemplate || ""
  ).trim();
  const payload = sanitizeForFirestore({
    activityName,
    notificationMessageTemplate:
      notificationMessageTemplate ||
      getDefaultCpNotificationTemplate(activityNo, activityName),
    activityNo,
    category,
    categories: [category],
    points: normalizeNumber(form.points),
    mentorPoints: normalizeNumber(form.mentorPoints),
    purpose: String(form.purpose || "").trim(),
    automationType: String(form.automationType || "AUTO").trim().toUpperCase(),
    status: String(form.status || "ACTIVE").trim().toUpperCase(),
    updatedAt: new Date(),
  });

  if (editingId) {
    await adminDb.collection(CP_ACTIVITY_COLLECTION).doc(editingId).update(payload);
    return editingId;
  }

  const nextId = await getNextCpActivityId(adminDb);
  await adminDb.collection(CP_ACTIVITY_COLLECTION).doc(nextId).set({
    ...payload,
    activityNo: payload.activityNo || nextId,
    createdAt: new Date(),
  });

  return nextId;
}

export async function toggleCpActivityStatus(adminDb, activity) {
  const nextStatus = activity.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  await adminDb.collection(CP_ACTIVITY_COLLECTION).doc(activity.id).update({
    status: nextStatus,
    updatedAt: new Date(),
  });
}

export async function deleteCpActivityDefinition(adminDb, activity) {
  if (activity.usageCount > 0) {
    await adminDb.collection(CP_ACTIVITY_COLLECTION).doc(activity.id).update({
      status: "INACTIVE",
      updatedAt: new Date(),
    });
    return { deleted: false, deactivated: true };
  }

  await adminDb.collection(CP_ACTIVITY_COLLECTION).doc(activity.id).delete();
  return { deleted: true, deactivated: false };
}

export async function searchCpMembersByName(adminDb, searchTerm, options = {}) {
  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();

  if (normalizedSearch.length < 2) {
    return [];
  }

  const userCollectionName =
    options.collections?.userDetail || publicEnv.collections?.userDetail || "usersdetail";
  const snap = await adminDb.collection(userCollectionName).get();

  return snap.docs
    .map((docSnap) => {
      const data = serializeFirestoreValue(docSnap.data() || {});
      const name = String(data.Name || data[" Name"] || "").trim();

      if (!name) {
        return null;
      }

      return {
        id: docSnap.id,
        ujbCode: data.UJBCode || data.ujbCode || data.UjbCode || docSnap.id,
        name,
        phoneNumber: String(
          data.MobileNo || data["Mobile no"] || data.mobileNo || data.phone || ""
        ).trim(),
        role: String(data.Category || data.category || "").trim() || "CosmOrbiter",
      };
    })
    .filter(Boolean)
    .filter((member) => member.name.toLowerCase().includes(normalizedSearch));
}

export async function ensureCpBoardMember(adminDb, member) {
  if (!member?.ujbCode) {
    throw new Error("Selected member is missing a UJB code.");
  }

  await adminDb
    .collection(CP_BOARD_COLLECTION)
    .doc(member.ujbCode)
    .set(
      {
        id: member.ujbCode,
        name: member.name,
        phoneNumber: member.phoneNumber || "",
        role: member.role || "CosmOrbiter",
      },
      { merge: true }
    );
}

export async function assignCpActivityToMember(adminDb, member, activity) {
  if (!member?.ujbCode) {
    throw new Error("Selected member is missing a UJB code.");
  }

  if (!activity?.id) {
    throw new Error("Select an activity before assigning it.");
  }

  await ensureCpBoardMember(adminDb, member);
  const monthLabel = new Date().toLocaleString("default", {
    month: "short",
    year: "numeric",
  });
  const notificationVariables = {
    recipientName: normalizeName(member.name),
    activityName: normalizeName(activity.activityName),
    points: normalizeNumber(activity.points),
    month: monthLabel,
  };
  const fallbackMessage = notificationVariables.recipientName
    ? `${notificationVariables.recipientName}, congratulations! You received ${notificationVariables.points} CP points for ${notificationVariables.activityName}.`
    : `Congratulations! You received ${notificationVariables.points} CP points for ${notificationVariables.activityName}.`;
  const notificationMessage = renderTemplate(
    activity.notificationMessageTemplate ||
      getDefaultCpNotificationTemplate(activity.activityNo || activity.id, activity.activityName),
    notificationVariables
  ) || fallbackMessage;

  await adminDb
    .collection(CP_BOARD_COLLECTION)
    .doc(member.ujbCode)
    .collection("activities")
    .add(
      sanitizeForFirestore({
        activityNo: activity.activityNo || activity.id,
        activityName: activity.activityName,
        categories: activity.categories?.length
          ? activity.categories
          : [activity.category || "W"],
        category: activity.category || activity.categories?.[0] || "W",
        points: normalizeNumber(activity.points),
        mentorPoints: normalizeNumber(activity.mentorPoints),
        notificationMessage,
        notificationTemplateKey: `cp_activity_${activity.activityNo || activity.id}`,
        notificationVariables,
        purpose: activity.purpose || "",
        activityDescription: activity.purpose || "",
        name: member.name,
        phoneNumber: member.phoneNumber || "",
        month: monthLabel,
        addedAt: new Date(),
      })
    );
}
