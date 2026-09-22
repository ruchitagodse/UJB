import * as XLSX from "xlsx";
import { getDefaultCpNotificationTemplate } from "@/lib/contribution-points/notificationTemplates";

export function getCpCategoryLabel(category) {
  if (category === "R") return "Relation";
  if (category === "H") return "Health";
  return "Wealth";
}

function normalizeName(value) {
  return String(value || "").trim();
}

function firstName(value) {
  return normalizeName(value).split(/\s+/).filter(Boolean)[0] || "";
}

function renderTemplate(template, variables = {}) {
  const raw = String(template || "").trim();
  if (!raw) return "";
  return raw.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = variables?.[key];
    if (value === undefined || value === null || value === "") return "";
    return String(value);
  });
}

export function getCpActivityDisplayMessage(activity = {}, recipientName = "") {
  const explicitMessage = normalizeName(activity.notificationMessage);
  if (explicitMessage) return explicitMessage;

  const safeActivityName = normalizeName(activity.activityName);
  const points = Number(activity.points || 0);
  const safeRecipientName = firstName(recipientName || activity.name || activity.recipientName);
  const safeProspectName = normalizeName(activity.prospectName);

  const template = getDefaultCpNotificationTemplate(
    activity.activityNo,
    safeActivityName
  );

  const templatedMessage = normalizeName(
    renderTemplate(template, {
      recipientName: safeRecipientName,
      prospectName: safeProspectName,
      points: Number.isFinite(points) ? Math.abs(points) : 0,
      count: activity.thresholdCount || activity.count || "",
    })
  );

  if (templatedMessage) {
    return templatedMessage.replace(/\s+/g, " ").trim();
  }

  if (safeActivityName) {
    if (safeRecipientName) {
      return `Congratulations ${safeRecipientName}! You received CP points for ${safeActivityName}.`;
    }
    return `Congratulations! You received CP points for ${safeActivityName}.`;
  }

  if (safeRecipientName) {
    return `Congratulations ${safeRecipientName}! You received CP points.`;
  }
  return "Congratulations! You received CP points.";
}

export function filterCpActivities(activities, category = "All", searchTerm = "") {
  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();

  return activities.filter((activity) => {
    const matchesCategory =
      category === "All" || activity.categories?.includes(category);

    const matchesSearch =
      !normalizedSearch ||
      activity.notificationMessage?.toLowerCase().includes(normalizedSearch) ||
      getCpActivityDisplayMessage(activity).toLowerCase().includes(normalizedSearch) ||
      activity.activityName?.toLowerCase().includes(normalizedSearch) ||
      activity.purpose?.toLowerCase().includes(normalizedSearch) ||
      activity.month?.toLowerCase().includes(normalizedSearch);

    return matchesCategory && matchesSearch;
  });
}

export function parseCpActivityWorkbook(arrayBuffer) {
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
