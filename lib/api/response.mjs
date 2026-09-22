import { NextResponse } from "next/server";
import {
  API_ERROR_CODES,
  buildApiError,
  buildApiSuccess,
} from "./contracts.mjs";

export {
  API_ERROR_CODES,
  buildApiError,
  buildApiSuccess,
};

/**
 * @template T
 * @param {T} data
 * @param {ResponseInit=} init
 */
export function jsonSuccess(data, init) {
  return NextResponse.json(buildApiSuccess(data), init);
}

/**
 * @param {string} message
 * @param {{ status?: number, code?: string, headers?: HeadersInit }=} options
 */
export function jsonError(message, options = {}) {
  const { status = 500, code, headers } = options;

  return NextResponse.json(buildApiError(message, code), {
    status,
    headers,
  });
}
