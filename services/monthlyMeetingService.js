async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchUserMonthlyMeetings() {
  const response = await fetch("/api/user/monthlymeeting", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(
    response,
    "Failed to load monthly meetings"
  );

  return data.events || [];
}

export async function fetchUserMonthlyMeetingDetails(id) {
  const response = await fetch(`/api/user/monthlymeeting/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load monthly meeting details");
}

export async function registerUserForMonthlyMeeting(id) {
  const response = await fetch(`/api/user/monthlymeeting/${id}`, {
    method: "POST",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to register for monthly meeting");
}
