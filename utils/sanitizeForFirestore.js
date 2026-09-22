// src/utils/sanitizeForFirestore.js
export function sanitizeForFirestore(obj) {
  if (obj == null) return null;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
    return obj.map((v) => sanitizeForFirestore(v)).filter((v) => v !== null);
  }
  if (typeof obj !== "object") return obj;
  const out = {};
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (v === undefined) return;
    if (v === null) {
      out[k] = null;
      return;
    }
    if (typeof v === "object") {
      const nested = sanitizeForFirestore(v);
      if (
        nested !== null &&
        (typeof nested !== "object" ||
          nested instanceof Date ||
          Object.keys(nested).length > 0)
      ) {
        out[k] = nested;
      }
      return;
    }
    out[k] = v;
  });
  return out;
}

export default sanitizeForFirestore;
