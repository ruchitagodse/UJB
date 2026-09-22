async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchUserProspects() {
  const response = await fetch("/api/user/prospects", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load prospects");
  return data.prospects || [];
}

export async function createUserProspect(payload) {
  const response = await fetch("/api/user/prospects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await readApiResponse(response, "Failed to create prospect");
  return data.prospect;
}

export async function createUserDraftProspect(payload) {
  const response = await fetch("/api/user/prospects/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await readApiResponse(
    response,
    "Failed to create draft prospect"
  );
  return {
    prospect: data.prospect,
    messageTrigger: data.messageTrigger,
  };
}

export async function fetchCurrentUserProfile() {
  const response = await fetch("/api/user/profile", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load profile");
  return data?.user || null;
}
