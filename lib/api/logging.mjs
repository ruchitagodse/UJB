function serializeError(error) {
  if (!error) {
    return undefined;
  }

  return {
    name: error.name || "Error",
    message: error.message || String(error),
  };
}

function writeStructuredLog(level, event, payload = {}) {
  const entry = {
    level,
    event,
    at: new Date().toISOString(),
    ...payload,
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  console.warn(line);
}

export function logAuthFailure(payload = {}) {
  writeStructuredLog("warn", "api.auth_failure", payload);
}

export function logProviderFailure(payload = {}) {
  writeStructuredLog("error", "api.provider_failure", {
    ...payload,
    error: serializeError(payload.error),
  });
}

