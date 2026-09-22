async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchUserProfile() {
  const response = await fetch("/api/user/profile", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load profile");
  return data.user || null;
}

export async function updateUserProfile(update) {
  const response = await fetch("/api/user/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      update: update && typeof update === "object" ? update : {},
    }),
  });

  const data = await readApiResponse(response, "Failed to update profile");
  return data.user || null;
}

export async function uploadUserProfilePhoto(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/user/profile/photo", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await readApiResponse(response, "Failed to upload profile photo");

  return {
    user: data.user || null,
    url: data.url || "",
    path: data.path || "",
  };
}

export async function uploadUserProfileAsset({
  file,
  folder,
  key = "",
}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  if (key) {
    formData.append("key", key);
  }

  const response = await fetch("/api/user/profile/upload", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await readApiResponse(response, "Failed to upload file");

  return {
    url: data.url || "",
    path: data.path || "",
    fileName: data.fileName || "",
  };
}

export async function uploadUserAgreementPdf(file) {
  return uploadUserProfileAsset({
    file,
    folder: "agreement",
  });
}
