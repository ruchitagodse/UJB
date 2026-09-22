import { randomUUID } from "crypto";
import { API_ERROR_CODES } from "@/lib/api/contracts.mjs";
import { publicEnv } from "@/lib/config/publicEnv";
import { TODO_COLLECTION_NAME, TODO_DOCS_COLLECTION_NAME } from "@/lib/todo/constants";

const prospectCollectionName = publicEnv.collections.prospect;
const userCollectionName = publicEnv.collections.userDetail;

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeDateValue(value) {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function toDateOnlyKey(value) {
  if (!value) return "";

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  const parsed = coerceTimestampToDate(value);
  if (!parsed) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateTimeValue(value) {
  const parsed = coerceTimestampToDate(value);
  return parsed || null;
}

function normalizeMinuteValue(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric);
}

export function coerceTimestampToDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === "function") {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime())
      ? converted
      : null;
  }

  if (typeof value?.seconds === "number") {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function serializeTodoRecord(todo = {}, id = todo?.id) {
  const createdAt = coerceTimestampToDate(todo.created_at);
  const updatedAt = coerceTimestampToDate(todo.updated_at);
  const startTime = coerceTimestampToDate(todo.start_time);
  const completionDate = coerceTimestampToDate(todo.completion_date);

  return {
    id,
    ...todo,
    created_at: createdAt ? createdAt.toISOString() : null,
    updated_at: updatedAt ? updatedAt.toISOString() : null,
    start_time: startTime ? startTime.toISOString() : null,
    completion_date: completionDate ? completionDate.toISOString() : null,
  };
}

export function normalizeAdminRole(role) {
  return normalizeString(role).toLowerCase();
}

export function isOpsAdmin(admin) {
  return normalizeAdminRole(admin?.role) === "ops";
}

export function buildTodoDocCollection(db) {
  return db.collection(TODO_DOCS_COLLECTION_NAME);
}

export function buildTodoCollection(db) {
  return db.collection(TODO_COLLECTION_NAME);
}

async function findProspectById(db, id) {
  const snap = await db.collection(prospectCollectionName).doc(id).get();
  if (!snap.exists) {
    return null;
  }

  return { id: snap.id, ...snap.data() };
}

async function findOrbitorById(db, id) {
  const snap = await db.collection(userCollectionName).doc(id).get();
  if (!snap.exists) {
    return null;
  }

  return { id: snap.id, ...snap.data() };
}

export async function resolveLinkedTodoTarget(db, payload = {}) {
  const prospectId = normalizeString(payload.prospect_id);
  const orbitorId = normalizeString(payload.orbitor_id);
  const userType = normalizeString(payload.user_type).toLowerCase();

  const hasProspect = Boolean(prospectId);
  const hasOrbitor = Boolean(orbitorId);

  if (hasProspect === hasOrbitor) {
    const error = new Error("Select exactly one linked prospect or orbitor.");
    error.status = 400;
    error.code = API_ERROR_CODES.INVALID_INPUT;
    throw error;
  }

  if (hasProspect && userType !== "prospect") {
    const error = new Error("Linked type must be prospect.");
    error.status = 400;
    error.code = API_ERROR_CODES.INVALID_INPUT;
    throw error;
  }

  if (hasOrbitor && userType !== "orbitor") {
    const error = new Error("Linked type must be orbitor.");
    error.status = 400;
    error.code = API_ERROR_CODES.INVALID_INPUT;
    throw error;
  }

  if (hasProspect) {
    const prospect = await findProspectById(db, prospectId);

    if (!prospect) {
      const error = new Error("Linked prospect not found.");
      error.status = 404;
      error.code = API_ERROR_CODES.NOT_FOUND;
      throw error;
    }

    const assignTo = normalizeString(prospect.assignedOpsEmail);

    if (!assignTo) {
      const error = new Error("Prospect is missing assigned OPS ownership.");
      error.status = 400;
      error.code = API_ERROR_CODES.INVALID_INPUT;
      throw error;
    }

    return {
      prospect,
      orbitor: null,
      assignTo,
      assignToName: normalizeString(prospect.assignedOpsName),
      prospectId,
      orbitorId: "",
      userType: "prospect",
      linkedName: normalizeString(prospect.prospectName || prospect.name),
    };
  }

  const orbitor = await findOrbitorById(db, orbitorId);

  if (!orbitor) {
    const error = new Error("Linked orbitor not found.");
    error.status = 404;
    error.code = API_ERROR_CODES.NOT_FOUND;
    throw error;
  }

  let assignTo = normalizeString(orbitor.assignedOpsEmail);
  let assignToName = normalizeString(orbitor.assignedOpsName);

  if (!assignTo) {
    const sourceProspectId = normalizeString(orbitor.SourceProspectId);

    if (sourceProspectId) {
      const sourceProspect = await findProspectById(db, sourceProspectId);
      assignTo = normalizeString(sourceProspect?.assignedOpsEmail);
      assignToName = normalizeString(sourceProspect?.assignedOpsName);
    }
  }

  if (!assignTo) {
    const error = new Error("Orbitor is missing assigned OPS ownership.");
    error.status = 400;
    error.code = API_ERROR_CODES.INVALID_INPUT;
    throw error;
  }

  return {
    prospect: null,
    orbitor,
    assignTo,
    assignToName,
    prospectId: "",
    orbitorId,
    userType: "orbitor",
    linkedName: normalizeString(orbitor.Name || orbitor.name || orbitor.UJBCode || orbitorId),
  };
}

export function buildTodoPayload({ payload = {}, linkedTarget, admin, existingTodo = null }) {
  const now = new Date();
  const followUpDate = normalizeDateValue(payload.follow_up_date);
  const purpose = normalizeString(payload.purpose);
  const discussionDetails = normalizeString(payload.discussion_details);
  const currentStatus = normalizeString(existingTodo?.status || "Pending");
  const existingStartTime = normalizeDateTimeValue(existingTodo?.start_time);
  const existingCompletionDate = normalizeDateTimeValue(existingTodo?.completion_date);
  const requestedStartTime = normalizeDateTimeValue(payload.start_time);
  const requestedCompletionDate = normalizeDateTimeValue(payload.completion_date);
  const requestedCompletionMinutes = normalizeMinuteValue(payload.completion_time);

  if (!purpose) {
    const error = new Error("Purpose is required.");
    error.status = 400;
    error.code = API_ERROR_CODES.INVALID_INPUT;
    throw error;
  }

  if (!followUpDate) {
    const error = new Error("Follow-up date is required.");
    error.status = 400;
    error.code = API_ERROR_CODES.INVALID_INPUT;
    throw error;
  }

  let startTime =
    Object.prototype.hasOwnProperty.call(payload, "start_time")
      ? requestedStartTime
      : existingStartTime;

  let completionDate =
    Object.prototype.hasOwnProperty.call(payload, "completion_date")
      ? requestedCompletionDate
      : existingCompletionDate;

  let completionTime =
    Object.prototype.hasOwnProperty.call(payload, "completion_time")
      ? requestedCompletionMinutes
      : normalizeMinuteValue(existingTodo?.completion_time);

  if (completionDate && !startTime) {
    const error = new Error("Start time is required when completion date is provided.");
    error.status = 400;
    error.code = API_ERROR_CODES.INVALID_INPUT;
    throw error;
  }

  if (startTime && completionDate && completionDate.getTime() < startTime.getTime()) {
    const error = new Error("Completion date cannot be earlier than start time.");
    error.status = 400;
    error.code = API_ERROR_CODES.INVALID_INPUT;
    throw error;
  }

  if (startTime && completionDate && completionTime === null) {
    completionTime = Math.max(
      0,
      Math.round((completionDate.getTime() - startTime.getTime()) / 60000)
    );
  }

  if (!completionDate) {
    completionTime = null;
  }

  if (currentStatus === "In Progress" && !startTime) {
    const error = new Error("In-progress TODOs must have a start time.");
    error.status = 400;
    error.code = API_ERROR_CODES.INVALID_INPUT;
    throw error;
  }

  if (currentStatus === "Done") {
    if (!startTime) {
      const error = new Error("Completed TODOs must have a start time.");
      error.status = 400;
      error.code = API_ERROR_CODES.INVALID_INPUT;
      throw error;
    }

    if (!completionDate) {
      const error = new Error("Completed TODOs must have a completion date.");
      error.status = 400;
      error.code = API_ERROR_CODES.INVALID_INPUT;
      throw error;
    }
  }

  return {
    uuid: existingTodo?.uuid || randomUUID(),
    assign_to: linkedTarget.assignTo,
    assign_to_name: linkedTarget.assignToName,
    prospect_id: linkedTarget.prospectId,
    orbitor_id: linkedTarget.orbitorId,
    user_type: linkedTarget.userType,
    linked_name: linkedTarget.linkedName,
    purpose,
    follow_up_date: followUpDate,
    discussion_details: discussionDetails,
    status: currentStatus,
    start_time: startTime,
    completion_date: completionDate,
    completion_time: completionTime,
    added_by: normalizeString(existingTodo?.added_by || admin?.email || admin?.name),
    created_at: existingTodo?.created_at || now,
    updated_at: now,
  };
}

export function ensureTodoExists(todo) {
  if (todo) {
    return;
  }

  const error = new Error("TODO not found.");
  error.status = 404;
  error.code = API_ERROR_CODES.NOT_FOUND;
  throw error;
}

export function buildTodoFilters({ query, admin }) {
  const status = normalizeString(query.get("status"));
  const purpose = normalizeString(query.get("purpose"));
  const assignTo = normalizeString(query.get("assignTo"));
  const userType = normalizeString(query.get("userType")).toLowerCase();
  const search = normalizeString(query.get("search")).toLowerCase();

  return { status, purpose, assignTo, userType, search, isOps: isOpsAdmin(admin) };
}
