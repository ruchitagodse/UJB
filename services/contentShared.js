export function validateContentForm({
  contentCategoryId,
  contentFiles,
  contentFormat,
  contentName,
  contentType,
  contDiscription,
  ownershipType,
  parternameId,
  thumbnailFiles,
}) {
  const errors = {};
  const normalizedFormat = String(contentFormat || "").trim().toLowerCase();
  const isImageFormat = normalizedFormat === "image";
  const isVideoFormat = normalizedFormat === "video";
  const isTextFormat = normalizedFormat === "text";

  if (!contentType) errors.contentType = "Required";
  if (!contentFormat) errors.contentFormat = "Required";
  if (!contentName) errors.contentName = "Required";
  if (!contentCategoryId) errors.contentCategoryId = "Required";
  if (ownershipType === "Partner" && !parternameId) {
    errors.parternameId = "Required";
  }
  if (!contDiscription) errors.contDiscription = "Required";
  if (!isTextFormat && !contentFiles.length) errors.contentFiles = "Content file required";
  if (!isTextFormat && (isVideoFormat || !isImageFormat) && !thumbnailFiles.length) {
    errors.thumbnailFiles = "Thumbnail required";
  }

  return errors;
}

export function validateFileSizes(files, maxMB) {
  const maxBytes = maxMB * 1024 * 1024;

  for (const file of files) {
    if (file.size > maxBytes) {
      return `File too large: ${file.name}`;
    }
  }

  return null;
}
