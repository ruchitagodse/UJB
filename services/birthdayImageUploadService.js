export async function uploadBirthdayImage(userId, image) {
  if (!image) return "";

  const formData = new FormData();
  formData.append("file", image);
  formData.append("userId", userId);

  const response = await fetch("/api/admin/birthday/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to upload image");
  }

  const data = await response.json();
  return data.imageUrl;
}
