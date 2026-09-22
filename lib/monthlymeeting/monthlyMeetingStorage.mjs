import { getDownloadURL, ref, uploadBytes, uploadBytesResumable } from "@/services/adminMonthlyMeetingStorageService";

const MODULE_BUCKETS = {
  knowledge: "knowledgeDocs",
  e2a: "e2aDocs",
  prospect: "prospectDocs",
  requirement: "requirementDocs",
  media: "meetingMedia",
};

function sanitizeFileName(name = "file") {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildMonthlyMeetingStoragePath({ module, meetingId, fileName, folder = "" }) {
  const bucket = MODULE_BUCKETS[module] || MODULE_BUCKETS.media;
  const safeMeetingId = String(meetingId || "").trim();
  const safeFileName = sanitizeFileName(fileName);
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const safeFolder = String(folder || "").trim();

  const prefix = safeFolder ? `${bucket}/${safeMeetingId}/${safeFolder}` : `${bucket}/${safeMeetingId}`;
  return `${prefix}/${nonce}_${safeFileName}`;
}

export async function uploadMonthlyMeetingFile({ storage, module, meetingId, file, folder = "", metadata = {}, resumable = false }) {
  const path = buildMonthlyMeetingStoragePath({
    module,
    meetingId,
    fileName: file?.name || "file",
    folder,
  });
  const fileRef = ref(storage, path);
  const baseMetadata = {
    contentType: file?.type || "application/octet-stream",
    customMetadata: {
      meetingId: String(meetingId || ""),
      module: String(module || "media"),
    },
    ...metadata,
  };

  if (resumable) {
    const task = uploadBytesResumable(fileRef, file, baseMetadata);
    return { task, path, fileRef };
  }

  await uploadBytes(fileRef, file, baseMetadata);
  const url = await getDownloadURL(fileRef);
  return { url, path, fileRef };
}
