import { publicEnv } from "@/lib/config/publicEnv";
import { serverEnv } from "@/lib/config/serverEnv";

void publicEnv;
void serverEnv;

function hasPermissionDeniedSignal(value) {
  if (!value) return false;

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return (
      normalized.includes("missing or insufficient permissions") ||
      normalized.includes("permission-denied")
    );
  }

  if (Array.isArray(value)) {
    return value.some(hasPermissionDeniedSignal);
  }

  if (typeof value === "object") {
    return (
      hasPermissionDeniedSignal(value.message) ||
      hasPermissionDeniedSignal(value.code) ||
      hasPermissionDeniedSignal(value.reason) ||
      hasPermissionDeniedSignal(value.error) ||
      hasPermissionDeniedSignal(value.name) ||
      hasPermissionDeniedSignal(value.stack) ||
      hasPermissionDeniedSignal(
        typeof value.toString === "function" ? value.toString() : ""
      )
    );
  }

  return false;
}

if (typeof window !== "undefined" && !window.__firebasePermissionGuardInstalled) {
  const originalConsoleError = window.console.error.bind(window.console);

  window.console.error = (...args) => {
    if (args.some(hasPermissionDeniedSignal)) {
      return;
    }

    originalConsoleError(...args);
  };

  const originalConsoleWarn = window.console.warn.bind(window.console);

  window.console.warn = (...args) => {
    if (args.some(hasPermissionDeniedSignal)) {
      return;
    }

    originalConsoleWarn(...args);
  };

  window.addEventListener("unhandledrejection", (event) => {
    if (hasPermissionDeniedSignal(event.reason)) {
      event.preventDefault();
    }
  });

  window.addEventListener("error", (event) => {
    if (hasPermissionDeniedSignal(event.error) || hasPermissionDeniedSignal(event.message)) {
      event.preventDefault();
    }
  });

  window.__firebasePermissionGuardInstalled = true;
}
