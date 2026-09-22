async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchUserConclaves() {
  const response = await fetch("/api/user/conclave", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load conclaves");
  return data.conclaves || [];
}

export async function fetchUserConclaveDetails(id) {
  const response = await fetch(`/api/user/conclave/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load conclave details");
}

export async function fetchUserConclaveMeetingDetails(conclaveId, meetingId) {
  const response = await fetch(
    `/api/user/conclave/${conclaveId}/meetings/${meetingId}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  return readApiResponse(response, "Failed to load meeting details");
}

export async function submitConclaveMeetingResponse(
  conclaveId,
  meetingId,
  payload
) {
  const response = await fetch(
    `/api/user/conclave/${conclaveId}/meetings/${meetingId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    }
  );

  return readApiResponse(response, "Failed to submit meeting response");
}
