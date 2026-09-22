"use client";

function getReadStorageKey(ujbCode) {
  return `user-notifications-read:${ujbCode}`;
}

export function getReadNotificationIds(ujbCode) {
  if (typeof window === "undefined" || !ujbCode) return [];

  try {
    const raw = window.localStorage.getItem(getReadStorageKey(ujbCode));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveReadNotificationIds(ujbCode, ids) {
  if (typeof window === "undefined" || !ujbCode) return;

  window.localStorage.setItem(getReadStorageKey(ujbCode), JSON.stringify(ids));
}

export function markNotificationAsRead(ujbCode, notificationId) {
  const current = new Set(getReadNotificationIds(ujbCode));
  current.add(notificationId);
  saveReadNotificationIds(ujbCode, Array.from(current));
}

export function markAllNotificationsAsRead(ujbCode, notificationIds) {
  const current = new Set(getReadNotificationIds(ujbCode));
  notificationIds.forEach((id) => current.add(id));
  saveReadNotificationIds(ujbCode, Array.from(current));
}
