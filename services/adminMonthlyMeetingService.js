async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchAdminMonthlyMeetings() {
  const response = await fetch("/api/admin/monthlymeeting", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load monthly meetings");
  return data.events || [];
}

export async function fetchAdminMonthlyMeetingDetails(id) {
  const response = await fetch(`/api/admin/monthlymeeting/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load monthly meeting details");
}

export async function updateAdminMonthlyMeetingDetails(id, updates) {
  const response = await fetch(`/api/admin/monthlymeeting/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ updates }),
  });

  return readApiResponse(response, "Failed to update monthly meeting");
}

export async function updateAdminMonthlyMeetingRegistration(id, userId, payload) {
  const response = await fetch(
    `/api/admin/monthlymeeting/${encodeURIComponent(id)}/registered-users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    }
  );

  return readApiResponse(response, "Failed to update registration");
}

export async function saveAdminMonthlyMeetingConclaveInvite(id, payload) {
  const response = await fetch(`/api/admin/monthlymeeting/${encodeURIComponent(id)}/conclave-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  return readApiResponse(response, "Failed to save conclave invitation");
}

export async function createAdminMonthlyMeeting(payload) {
  const response = await fetch("/api/admin/monthlymeeting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await readApiResponse(response, "Failed to create monthly meeting");
  return data.id || "";
}

export async function deleteAdminMonthlyMeeting(id) {
  const response = await fetch(`/api/admin/monthlymeeting/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });

  await readApiResponse(response, "Failed to delete monthly meeting");
}

export async function uploadAdminMonthlyMeetingFile(eventId, { file, module, folder = "" }) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("module", module);
  if (folder) formData.set("folder", folder);

  const response = await fetch(`/api/admin/monthlymeeting/${encodeURIComponent(eventId)}/files`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  return readApiResponse(response, "Failed to upload file");
}

export async function deleteAdminMonthlyMeetingFile(eventId, { path, module }) {
  const response = await fetch(`/api/admin/monthlymeeting/${encodeURIComponent(eventId)}/files`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, module }),
  });

  return readApiResponse(response, "Failed to delete file");
}
