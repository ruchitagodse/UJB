import { serializeFirestoreValue } from "@/lib/data/firebase/documentRepository.mjs";
import sanitizeForFirestore from "@/utils/sanitizeForFirestore";

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveMeetingDate(data = {}) {
  return (
    toDate(data.time) ||
    toDate(data.date) ||
    toDate(data.meetingDate) ||
    toDate(data.createdAt) ||
    toDate(data.AdminCreatedby) ||
    null
  );
}

export function getMeetingStatus(timeValue) {
  if (!timeValue) {
    return "draft";
  }

  const time =
    timeValue instanceof Date
      ? timeValue
      : timeValue?.toDate?.() || new Date(timeValue);

  if (!(time instanceof Date) || Number.isNaN(time.getTime())) {
    return "draft";
  }

  const now = new Date();
  const diff = time.getTime() - now.getTime();

  if (Math.abs(diff) < 3 * 60 * 60 * 1000) {
    return "live";
  }

  if (diff > 0) {
    return "upcoming";
  }

  return "completed";
}

export function mapAdminMeetingListEntry(docSnap, registeredCount = 0) {
  const data = serializeFirestoreValue(docSnap.data() || {});
  const meetingDate = resolveMeetingDate(data);
  const time = meetingDate ? meetingDate.toISOString() : data.time || "";

  return {
    id: docSnap.id,
    ...data,
    name: data.Eventname || data.eventName || "Untitled",
    time,
    zoom: data.zoomLink || "",
    registeredCount,
    status: data.status || getMeetingStatus(time),
  };
}

export function buildAdminMeetingCreatePayload(data) {
  return sanitizeForFirestore({
    Eventname: String(data.eventName || "").trim(),
    time: new Date(data.eventTime),
    zoomLink: String(data.zoomLink || "").trim(),
    agenda: [],
    topicSections: [],
    facilitatorSections: [],
    referralSections: [],
    sections: [],
    e2aSections: [],
    prospectSections: [],
    knowledgeSections: [],
    requirementSections: [],
    documentUploads: [],
    imageUploads: [],
    invitedUsers: [],
    createdAt: new Date(),
  });
}
