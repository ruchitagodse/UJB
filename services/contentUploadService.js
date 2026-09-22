export async function uploadContentFiles(files, onProgress) {
  if (!files?.length) return [];

  const urls = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/admin/content/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success === false) {
      throw new Error(body?.message || "Failed to upload content file");
    }

    const fileUrl = body?.data?.url || body?.url;
    if (!fileUrl) {
      throw new Error("Upload completed but file URL is missing");
    }

    urls.push(fileUrl);
    if (onProgress) {
      onProgress(Math.round(((index + 1) / files.length) * 100));
    }
  }

  return urls;
}
