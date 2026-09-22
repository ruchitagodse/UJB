import { ref, uploadBytes, getDownloadURL, storage } from "@/services/profileAssetStorageService";

export async function uploadOrbiterProfileAsset(file, fullPath) {
  if (!file || !fullPath) {
    throw new Error("Missing profile asset upload input");
  }

  const fileRef = ref(storage, fullPath);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);

  return {
    url,
    path: fullPath,
    fileName: fullPath.split("/").pop(),
  };
}
