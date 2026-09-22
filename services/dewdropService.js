async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchUserDewdropContentBundle(categoryId = "") {
  const searchParams = new URLSearchParams();
  const normalizedCategoryId = String(categoryId || "").trim();

  if (normalizedCategoryId) {
    searchParams.set("categoryId", normalizedCategoryId);
  }

  const response = await fetch(
    `/api/user/dewdrop${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = await readApiResponse(response, "Failed to load content");
  return {
    contents: Array.isArray(data?.contents) ? data.contents : [],
    categories: Array.isArray(data?.categories) ? data.categories : [],
  };
}

export async function fetchUserDewdropContentByCategory(categoryId = "") {
  const data = await fetchUserDewdropContentBundle(categoryId);
  return data.contents || [];
}

export async function fetchUserDewdropContent() {
  const data = await fetchUserDewdropContentBundle();
  return data.contents || [];
}

export async function fetchUserDewdropContentDetails(id) {
  const response = await fetch(`/api/user/dewdrop/${id}`, {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load content details");
  return data.content || null;
}

export async function likeUserDewdropContent(id) {
  const response = await fetch(`/api/user/dewdrop/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "like" }),
  });

  const data = await readApiResponse(response, "Failed to like content");
  return data.content || null;
}
