async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchUserHomeData() {
  const response = await fetch("/api/user/home", {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load home data");
}
