import { serializeFirestoreValue } from "@/lib/data/firebase/documentRepository.mjs";
import sanitizeForFirestore from "@/utils/sanitizeForFirestore";

function parseDateInput(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function mapConclaveAdminUser(docSnap) {
  const data = serializeFirestoreValue(docSnap.data() || {});

  return {
    id: docSnap.id,
    label: data.Name || docSnap.id,
    value: docSnap.id,
    phone: data.MobileNo || "",
  };
}

export function mapConclaveListEntry(docSnap) {
  const data = serializeFirestoreValue(docSnap.data() || {});

  return {
    id: docSnap.id,
    ...data,
    name: data.conclaveStream || "-",
    leader: data.leader || "-",
    startDate: data.startDate || "",
    initiationDate: data.initiationDate || "",
    ntMembers: Array.isArray(data.ntMembers) ? data.ntMembers : [],
    orbiters: Array.isArray(data.orbiters) ? data.orbiters : [],
  };
}

export function mapConclaveMeetingEntry(docSnap) {
  const data = serializeFirestoreValue(docSnap.data() || {});

  return {
    id: docSnap.id,
    ...data,
  };
}

export function buildConclaveCreatePayload(data) {
  const startDate = parseDateInput(data.startDate);
  const initiationDate = parseDateInput(data.initiationDate);

  return {
    ...sanitizeForFirestore({
      conclaveStream: String(data.conclaveStream || "").trim(),
      startDate,
      initiationDate,
      leader: String(data.leader || "").trim(),
      ntMembers: Array.isArray(data.ntMembers) ? data.ntMembers : [],
      orbiters: Array.isArray(data.orbiters) ? data.orbiters : [],
      leaderRole: String(data.leaderRole || "").trim(),
      ntRoles: String(data.ntRoles || "").trim(),
      createdAt: new Date(),
    }),
    conclaveStream: String(data.conclaveStream || "").trim(),
    startDate,
    initiationDate,
  };
}

export function buildConclaveUpdatePayload(data) {
  const startDate = parseDateInput(data.startDate);
  const initiationDate = parseDateInput(data.initiationDate);

  return {
    ...sanitizeForFirestore({
      conclaveStream: String(data.conclaveStream || "").trim(),
      startDate,
      initiationDate,
      leader: String(data.leader || "").trim(),
      ntMembers: Array.isArray(data.ntMembers) ? data.ntMembers : [],
      orbiters: Array.isArray(data.orbiters) ? data.orbiters : [],
      leaderRole: String(data.leaderRole || "").trim(),
      ntRoles: String(data.ntRoles || "").trim(),
      updatedAt: new Date(),
    }),
    conclaveStream: String(data.conclaveStream || "").trim(),
    startDate,
    initiationDate,
  };
}

export function buildConclaveMeetingPayload(data) {
  return sanitizeForFirestore({
    meetingName: String(data.meetingName || "").trim(),
    datetime: parseDateInput(data.datetime),
    agenda: String(data.agenda || "").trim(),
    mode: String(data.mode || "online").trim(),
    link: String(data.link || "").trim(),
    venue: String(data.venue || "").trim(),
    createdAt: new Date(),
  });
}
