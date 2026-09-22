import { serializeFirestoreValue } from "@/lib/data/firebase/documentRepository.mjs";
import sanitizeForFirestore from "@/utils/sanitizeForFirestore";

export const FESTIVAL_CAMPAIGNS_COLLECTION = "festivalCampaigns";
export const FESTIVAL_RECIPIENTS_COLLECTION = "festivalRecipients";
export const FESTIVAL_STATUSES = ["draft", "approved", "scheduled", "sending", "sent", "failed", "cancelled"];
export const FESTIVAL_SEND_TIME_IST = "06:00";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const clean = (value) => String(value ?? "").trim();
const list = (value) => Array.from(new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean)));

export function festivalDateInIst(value) {
  const input = clean(value);
  if (!input) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(input)) {
    const millis = Date.parse(input);
    return Number.isNaN(millis) ? "" : new Date(millis + IST_OFFSET_MS).toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(input)) return input.slice(0, 10);
  const millis = Date.parse(input);
  return Number.isNaN(millis) ? "" : new Date(millis + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function scheduleFestivalAtSixAmIst(value) {
  const date = festivalDateInIst(value);
  return date ? new Date(`${date}T${FESTIVAL_SEND_TIME_IST}:00+05:30`).toISOString() : "";
}

export function serializeFestivalDocument(docSnap) {
  return { id: docSnap.id, ...serializeFirestoreValue(docSnap.data() || {}) };
}

export function normalizeFestivalCampaignPayload(payload = {}, { requireReady = false } = {}) {
  const eventName = clean(payload.eventName);
  const scheduledInput = clean(payload.scheduledAt);
  const scheduledAt = scheduleFestivalAtSixAmIst(scheduledInput);
  const messageText = clean(payload.messageText);
  const imageUrl = clean(payload.imageUrl);
  const status = FESTIVAL_STATUSES.includes(clean(payload.status).toLowerCase())
    ? clean(payload.status).toLowerCase()
    : "draft";
  const recipientGroupIds = list(payload.recipientGroupIds);
  const recipientIds = list(payload.recipientIds);

  if (!eventName) throw new Error("Festival name is required");
  if (scheduledInput && !scheduledAt) throw new Error("Schedule date is invalid");
  if (requireReady || ["approved", "scheduled"].includes(status)) {
    if (!scheduledAt || !messageText || !imageUrl || (!recipientGroupIds.length && !recipientIds.length)) {
      throw new Error("Approved or scheduled campaigns need date/time, message, creative, and recipients");
    }
  }

  return sanitizeForFirestore({
    eventName,
    festivalYear: Number(payload.festivalYear) || new Date(scheduledAt || Date.now()).getFullYear(),
    scheduledAt: scheduledAt || null,
    messageText,
    imageUrl,
    imageName: clean(payload.imageName),
    templateName: clean(payload.templateName) || "daily_reminder",
    templateLanguage: clean(payload.templateLanguage) || "en",
    recipientGroupIds,
    recipientIds,
    status,
    active: payload.active !== false,
  });
}

export async function listFestivalCampaigns(adminDb) {
  const snapshot = await adminDb.collection(FESTIVAL_CAMPAIGNS_COLLECTION).get();
  return snapshot.docs
    .map(serializeFestivalDocument)
    .sort((a, b) => String(a.scheduledAt || "9999").localeCompare(String(b.scheduledAt || "9999")));
}

export async function getFestivalCampaign(adminDb, id) {
  const snap = await adminDb.collection(FESTIVAL_CAMPAIGNS_COLLECTION).doc(id).get();
  return snap.exists ? serializeFestivalDocument(snap) : null;
}

export async function createFestivalCampaign(adminDb, payload, actor = {}) {
  const data = normalizeFestivalCampaignPayload(payload);
  const now = new Date();
  const ref = await adminDb.collection(FESTIVAL_CAMPAIGNS_COLLECTION).add({
    ...data,
    createdAt: now,
    updatedAt: now,
    createdBy: clean(actor.email),
    updatedBy: clean(actor.email),
  });
  return getFestivalCampaign(adminDb, ref.id);
}

export async function updateFestivalCampaign(adminDb, id, payload, actor = {}) {
  const current = await getFestivalCampaign(adminDb, id);
  if (!current) return null;
  const data = normalizeFestivalCampaignPayload({ ...current, ...payload });
  await adminDb.collection(FESTIVAL_CAMPAIGNS_COLLECTION).doc(id).update({
    ...data,
    updatedAt: new Date(),
    updatedBy: clean(actor.email),
  });
  return getFestivalCampaign(adminDb, id);
}

export async function deleteFestivalCampaign(adminDb, id) {
  const ref = adminDb.collection(FESTIVAL_CAMPAIGNS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

export async function cloneFestivalCampaign(adminDb, id, actor = {}) {
  const current = await getFestivalCampaign(adminDb, id);
  if (!current) return null;
  const nextYear = Number(current.festivalYear || new Date().getFullYear()) + 1;
  const currentDate = festivalDateInIst(current.scheduledAt);
  const nextSchedule = currentDate ? `${nextYear}${currentDate.slice(4)}` : "";
  return createFestivalCampaign(adminDb, {
    ...current,
    eventName: current.eventName,
    festivalYear: nextYear,
    scheduledAt: nextSchedule,
    status: "draft",
    active: false,
  }, actor);
}

export async function listFestivalRecipients(adminDb) {
  const snapshot = await adminDb.collection(FESTIVAL_RECIPIENTS_COLLECTION).get();
  return snapshot.docs.map(serializeFestivalDocument).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function saveFestivalRecipient(adminDb, payload, actor = {}) {
  const name = clean(payload.name);
  const phone = clean(payload.phone);
  const groupId = clean(payload.groupId) || "other";
  if (!name || !phone) throw new Error("Recipient name and phone are required");
  const id = clean(payload.id);
  const data = sanitizeForFirestore({ name, phone, groupId, active: payload.active !== false, updatedAt: new Date(), updatedBy: clean(actor.email) });
  if (id) {
    await adminDb.collection(FESTIVAL_RECIPIENTS_COLLECTION).doc(id).set(data, { merge: true });
    return id;
  }
  const ref = await adminDb.collection(FESTIVAL_RECIPIENTS_COLLECTION).add({ ...data, createdAt: new Date(), createdBy: clean(actor.email) });
  return ref.id;
}

export async function deleteFestivalRecipient(adminDb, id) {
  await adminDb.collection(FESTIVAL_RECIPIENTS_COLLECTION).doc(id).delete();
}
