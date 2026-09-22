export const API_ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: "AUTH_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_FAILURE: "PROVIDER_FAILURE",
  SERVER_ERROR: "SERVER_ERROR",
});

/**
 * @template T
 * @typedef {{ success: true, data: T }} ApiSuccess
 */

/**
 * @typedef {{ success: false, message: string, code?: string }} ApiError
 */

/**
 * @template T
 * @param {T} data
 * @returns {ApiSuccess<T>}
 */
export function buildApiSuccess(data) {
  return { success: true, data };
}

/**
 * @param {string} message
 * @param {string=} code
 * @returns {ApiError}
 */
export function buildApiError(message, code) {
  const body = { success: false, message };

  if (code) {
    body.code = code;
  }

  return body;
}

