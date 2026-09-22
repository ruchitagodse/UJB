async function readApiResponse(response, fallbackMessage) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    const text = await response.text().catch(() => "");
    body = text ? { message: text } : {};
  }

  if (!response.ok || body?.success === false) {
    const statusHint = response?.status ? ` (HTTP ${response.status})` : "";
    throw new Error(body?.message || `${fallbackMessage}${statusHint}`);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchAdminConclaveUsers() {
  const response = await fetch("/api/admin/conclave?view=users", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load conclave users");
  return data.users || [];
}

export async function createAdminConclave(payload) {
  const response = await fetch("/api/admin/conclave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await readApiResponse(response, "Failed to create conclave");
  return data.id || "";
}

export async function fetchAdminConclaves() {
  const response = await fetch("/api/admin/conclave", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load conclaves");
  return data.conclaves || [];
}

export async function deleteAdminConclave(id) {
  const response = await fetch(`/api/admin/conclave/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });

  await readApiResponse(response, "Failed to delete conclave");
}

export async function fetchAdminConclave(id) {
  const response = await fetch(`/api/admin/conclave/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load conclave");
  return {
    conclave: data.conclave || null,
    meetings: data.meetings || [],
  };
}

export async function updateAdminConclave(id, payload) {
  const response = await fetch(`/api/admin/conclave/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  await readApiResponse(response, "Failed to update conclave");
}

export async function createAdminConclaveMeeting(id, payload) {
  const response = await fetch(
    `/api/admin/conclave/${encodeURIComponent(id)}/meetings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    }
  );

  const data = await readApiResponse(response, "Failed to create conclave meeting");
  return data.id || "";
}

export async function fetchAdminConclaveMeetingDetails(conclaveId, meetingId) {
  try {
    const response = await fetch(
      `/api/admin/conclave/${encodeURIComponent(conclaveId)}/meetings/${encodeURIComponent(meetingId)}`,
      {
        method: "GET",
        credentials: "include",
      }
    );

    const data = await readApiResponse(response, "Failed to load conclave meeting");
    return data.meeting || null;
  } catch (error) {
    // Fallback path: if detail endpoint fails, resolve via conclave detail payload.
    const { meetings = [] } = await fetchAdminConclave(conclaveId);
    const found = meetings.find((meeting) => String(meeting?.id || "").trim() === String(meetingId || "").trim());
    if (found) return found;
    throw error;
  }
}

export async function updateAdminConclaveMeeting(conclaveId, meetingId, payload) {
  const response = await fetch(
    `/api/admin/conclave/${encodeURIComponent(conclaveId)}/meetings/${encodeURIComponent(meetingId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    }
  );

  await readApiResponse(response, "Failed to update conclave meeting");
}

export async function fetchAdminConclaveRegisteredUsers(conclaveId, meetingId) {
  const response = await fetch(
    `/api/admin/conclave/${encodeURIComponent(conclaveId)}/meetings/${encodeURIComponent(meetingId)}/registered-users`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = await readApiResponse(response, "Failed to load registered users");
  return data.users || [];
}

export async function markAdminConclaveAttendance(conclaveId, meetingId, userId) {
  const response = await fetch(
    `/api/admin/conclave/${encodeURIComponent(conclaveId)}/meetings/${encodeURIComponent(meetingId)}/registered-users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ attendanceStatus: true }),
    }
  );

  await readApiResponse(response, "Failed to update attendance");
}

export async function uploadAdminConclaveMeetingFile(conclaveId, meetingId, { file, module }) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("module", module);

  const response = await fetch(
    `/api/admin/conclave/${encodeURIComponent(conclaveId)}/meetings/${encodeURIComponent(meetingId)}/files`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    }
  );

  return readApiResponse(response, "Failed to upload conclave file");
}

export async function deleteAdminConclaveMeetingFile(conclaveId, meetingId, { path, module }) {
  const response = await fetch(
    `/api/admin/conclave/${encodeURIComponent(conclaveId)}/meetings/${encodeURIComponent(meetingId)}/files`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, module }),
    }
  );

  return readApiResponse(response, "Failed to delete conclave file");
}
