import { API_ERROR_CODES } from "./contracts.mjs";

export function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export async function readJsonObject(req) {
  try {
    const body = await req.json();

    if (!isPlainObject(body)) {
      return {
        ok: false,
        status: 422,
        message: "Request body must be a JSON object",
        code: API_ERROR_CODES.INVALID_INPUT,
      };
    }

    return { ok: true, data: body };
  } catch {
    return {
      ok: false,
      status: 422,
      message: "Invalid JSON request body",
      code: API_ERROR_CODES.INVALID_INPUT,
    };
  }
}

export function requiredString(value, fieldName) {
  const text = String(value || "").trim();

  if (!text) {
    return {
      ok: false,
      status: 422,
      message: `Missing ${fieldName}`,
      code: API_ERROR_CODES.INVALID_INPUT,
    };
  }

  return { ok: true, value: text };
}
