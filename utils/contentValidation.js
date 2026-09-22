export function validateContent(form, mainFile, thumbnailFile) {
  const errors = {};

  if (!form.contentName) errors.contentName = "Required";
  if (!form.contentFormat) errors.contentFormat = "Required";
  if (!form.categoryId) errors.categoryId = "Required";
  if (!mainFile) errors.mainFile = "Main file required";
  if (!thumbnailFile) errors.thumbnailFile = "Thumbnail required";

  if (form.ownerType === "ORBITER" && !form.owner) {
    errors.owner = "Orbiter required";
  }

  return errors;
}