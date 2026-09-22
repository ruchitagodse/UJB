async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchCosmOrbiters() {
  const response = await fetch("/api/user/cosmorbiters", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load CosmOrbiters");
  return data.businesses || [];
}

export async function fetchCosmOrbiterDetails(id) {
  const response = await fetch(`/api/user/cosmorbiters/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load CosmOrbiter details");
}

export async function addCosmOrbiterFavorite(id) {
  const response = await fetch(`/api/user/cosmorbiters/${id}/favorite`, {
    method: "POST",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to add favorite");
}

export async function removeCosmOrbiterFavorite(id) {
  const response = await fetch(`/api/user/cosmorbiters/${id}/favorite`, {
    method: "DELETE",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to remove favorite");
}
