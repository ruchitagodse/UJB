async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchBirthdayUsersForAdmin() {
  const response = await fetch("/api/admin/birthday/messages", {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load birthday users");
}

export async function sendBirthdayMessage(user) {
  const response = await fetch("/api/send-birthday", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user }),
  });

  if (!response.ok) {
    let message = "Failed to send birthday message";

    try {
      const data = await response.json();
      if (typeof data?.message === "string" && data.message.trim()) {
        message = data.message.trim();
      }
    } catch {}

    throw new Error(message);
  }
}

export async function markBirthdayMessageSent(userId, sentDate) {
  const response = await fetch(
    `/api/admin/birthday/${encodeURIComponent(userId)}/mark-sent`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sentDate }),
    }
  );

  await readApiResponse(response, "Failed to mark birthday message sent");
}

export async function fetchBirthdayUserOptions() {
  const response = await fetch("/api/admin/birthday/options", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load users");
  return data.users || [];
}

export async function checkBirthdayEntryExists(userId) {
  const response = await fetch(
    `/api/admin/birthday/${encodeURIComponent(userId)}/exists`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = await readApiResponse(response, "Failed to check birthday entry");
  return Boolean(data.exists);
}

export async function saveBirthdayEntry(payload) {
  const response = await fetch("/api/admin/birthday", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  await readApiResponse(response, "Failed to save birthday entry");
}

export async function fetchBirthdayEntries() {
  const response = await fetch("/api/admin/birthday", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to fetch birthday entries");
  return data.entries || [];
}

export async function deleteBirthdayEntry(id) {
  const response = await fetch(`/api/admin/birthday/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });

  await readApiResponse(response, "Failed to delete birthday entry");
}

export async function fetchBirthdayEntry(id) {
  const response = await fetch(`/api/admin/birthday/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load birthday entry");
  return data.entry || null;
}

export async function updateBirthdayEntry(id, payload) {
  const response = await fetch(`/api/admin/birthday/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  await readApiResponse(response, "Failed to update birthday entry");
}

export async function fetchAllUserBirthdays() {
  const response = await fetch("/api/admin/birthday/users", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load birthday users");
  return data.users || [];
}

export async function updateBirthdayStatus(id, status) {
  const response = await fetch(`/api/admin/birthday/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });

  await readApiResponse(response, "Failed to update birthday status");
}

export async function saveBirthdayImageToDownloads({ imageUrl, fileName }) {
  const response = await fetch("/api/admin/birthday/download-desktop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ imageUrl, fileName }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.message || "Failed to download image");
  }

  const disposition = response.headers.get("content-disposition") || "";
  const encodedFileName = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  const quotedFileName = disposition.match(/filename="([^"]+)"/)?.[1];

  return {
    blob: await response.blob(),
    fileName: encodedFileName
      ? decodeURIComponent(encodedFileName)
      : quotedFileName || fileName || "birthday-canva-image.jpg",
  };
}
