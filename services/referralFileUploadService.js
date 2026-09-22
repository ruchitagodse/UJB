import { ref, uploadBytes, getDownloadURL, storage } from "@/services/profileAssetStorageService";

export async function uploadReferralBrowserFile(referralId, type, file) {
  if (!referralId || !type || !file) {
    throw new Error("Missing referral upload input");
  }

  const path = `referrals/${referralId}/${type}-${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  return {
    url,
    path,
    name: file.name,
  };
}
