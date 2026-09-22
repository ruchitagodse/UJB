async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchApiUserNotifications() {
  const response = await fetch("/api/user/notifications", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load notifications");
  return data.notifications || [];
}
