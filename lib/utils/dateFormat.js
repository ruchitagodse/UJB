import { format, isValid, parse } from "date-fns";
import { DATE_FORMAT_CONFIG } from "../config/dateConfig.js";

const DATE_PARSE_PATTERNS = [
  "dd/MM/yy",
  "dd/MM/yyyy",
  "yyyy-MM-dd",
];

const DATE_TIME_PARSE_PATTERNS = [
  "dd/MM/yy HH:mm",
  "dd/MM/yyyy HH:mm",
  "yyyy-MM-dd'T'HH:mm",
  "yyyy-MM-dd HH:mm",
];

function parseWithPatterns(value, patterns = []) {
  const baseDate = new Date();

  for (const pattern of patterns) {
    const parsed = parse(String(value || "").trim(), pattern, baseDate);
    if (isValid(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function toDateObject(value, { includeTime = false } = {}) {
  if (!value) return null;

  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return isValid(date) ? date : null;
  }

  if (typeof value?.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return isValid(date) ? date : null;
  }

  // Support Firestore Timestamp JSON produced by admin/server responses.
  if (typeof value?._seconds === "number") {
    const date = new Date(value._seconds * 1000);
    return isValid(date) ? date : null;
  }

  const stringValue = String(value || "").trim();
  if (!stringValue) return null;

  const parsedWithPatterns = parseWithPatterns(
    stringValue,
    includeTime ? DATE_TIME_PARSE_PATTERNS : DATE_PARSE_PATTERNS
  );

  if (parsedWithPatterns) {
    return parsedWithPatterns;
  }

  const nativeParsed = new Date(stringValue);
  return isValid(nativeParsed) ? nativeParsed : null;
}

export function formatDate(value, fallback = "") {
  const date = toDateObject(value);
  return date ? format(date, DATE_FORMAT_CONFIG.displayDateFormat) : fallback;
}

export function formatDateTime(value, fallback = "") {
  const date = toDateObject(value, { includeTime: true });
  return date
    ? format(date, DATE_FORMAT_CONFIG.displayDateTimeFormat)
    : fallback;
}

export function normalizeDateForStorage(value) {
  const date = toDateObject(value);
  return date ? format(date, DATE_FORMAT_CONFIG.storageDateFormat) : "";
}

export function normalizeDateTimeForStorage(value) {
  const date = toDateObject(value, { includeTime: true });
  return date
    ? format(date, DATE_FORMAT_CONFIG.storageDateTimeFormat)
    : "";
}

export function isValidDisplayDate(value) {
  return Boolean(toDateObject(value));
}

export function isValidDisplayDateTime(value) {
  return Boolean(toDateObject(value, { includeTime: true }));
}

export function compareDateValues(a, b, { includeTime = false } = {}) {
  const dateA = toDateObject(a, { includeTime });
  const dateB = toDateObject(b, { includeTime });

  if (!dateA || !dateB) return null;
  return dateA.getTime() - dateB.getTime();
}

export function getDateInputPlaceholder(type = "date") {
  return type === "datetime-local"
    ? DATE_FORMAT_CONFIG.displayDateTimeFormat.toUpperCase()
    : DATE_FORMAT_CONFIG.displayDateFormat.toUpperCase();
}

export function formatValueForDisplayInput(value, type = "date") {
  return type === "datetime-local" ? formatDateTime(value) : formatDate(value);
}

export function normalizeValueForStorageInput(value, type = "date") {
  return type === "datetime-local"
    ? normalizeDateTimeForStorage(value)
    : normalizeDateForStorage(value);
}
