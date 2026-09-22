import { serializeFirestoreValue } from "@/lib/data/firebase/documentRepository.mjs";
import sanitizeForFirestore from "@/utils/sanitizeForFirestore";

export const CONTENT_COLLECTION = "ContentData";
export const CONTENT_CATEGORY_COLLECTION = "ContentCategory";

export function mapContentPartner(user) {
  return {
    id: user.id,
    partnerName: user.Name || "",
    PartnerType: user.Category || "",
    lpProfileimg: user.ProfilePhotoURL || "",
    ujbCode: user.ujbCode || user.UJBCode || user.id || "",
  };
}

export function mapContentCategory(docSnap) {
  return {
    id: docSnap.id,
    ...serializeFirestoreValue(docSnap.data() || {}),
  };
}

export function mapContentEntry(docSnap) {
  const data = serializeFirestoreValue(docSnap.data() || {});

  return {
    id: docSnap.id,
    ...data,
    partner: data.partnerNamelp || "",
    partnerType: data.partnerDesig || "",
    name: data.contentName || "",
    format: data.contentFormat || "",
    type: data.contentType || "",
    views: data.totalViews || 0,
    views_count: Number(data.views_count ?? data.totalViews ?? 0),
    unique_views_count: Number(data.unique_views_count ?? 0),
    likes: data.totallike || 0,
    status: data.switchValue ? "active" : "inactive",
  };
}

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

export function buildContentWritePayload(data, options = {}) {
  const { forCreate = false } = options;
  const payload = {};

  if (forCreate || hasOwn(data, "adminName") || hasOwn(data, "AdminName")) {
    payload.AdminName = data.adminName ?? data.AdminName ?? "";
  }

  if (forCreate || hasOwn(data, "Thumbnail") || hasOwn(data, "thumbnail")) {
    const thumbnails = data.Thumbnail ?? data.thumbnail;
    payload.Thumbnail = Array.isArray(thumbnails) ? thumbnails : [];
  }

  if (forCreate || hasOwn(data, "blogUrl")) {
    payload.blogUrl = data.blogUrl || "";
  }

  if (forCreate || hasOwn(data, "comments")) {
    payload.comments = Array.isArray(data.comments) ? data.comments : [];
  }

  if (forCreate || hasOwn(data, "contentCategoryId")) {
    payload.contentCategoryId = data.contentCategoryId || "";
  }

  if (forCreate || hasOwn(data, "contentCategoryName")) {
    payload.contentCategoryName = data.contentCategoryName || "";
  }

  if (forCreate || hasOwn(data, "contentFileImages")) {
    payload.contentFileImages = Array.isArray(data.contentFileImages)
      ? data.contentFileImages
      : [];
  }

  if (forCreate || hasOwn(data, "contentFormat")) {
    payload.contentFormat = data.contentFormat || "";
  }

  if (forCreate || hasOwn(data, "contentName")) {
    payload.contentName = data.contentName || "";
  }

  if (forCreate || hasOwn(data, "contentType")) {
    payload.contentType = data.contentType || "";
  }

  if (forCreate || hasOwn(data, "contDiscription")) {
    payload.contDiscription = data.contDiscription || "";
  }

  if (forCreate || hasOwn(data, "textContentHtml")) {
    payload.textContentHtml = data.textContentHtml || "";
  }

  if (forCreate || hasOwn(data, "inputTag")) {
    payload.inputTag = Array.isArray(data.inputTag) ? data.inputTag : [];
  }

  if (forCreate || hasOwn(data, "lpProfile")) {
    payload.lpProfile = data.lpProfile || "";
  }

  if (forCreate || hasOwn(data, "ownershipType")) {
    payload.ownershipType = data.ownershipType || "UjustBe";
  }

  if (forCreate || hasOwn(data, "parternameId")) {
    payload.parternameId = data.parternameId || "";
  }

  if (forCreate || hasOwn(data, "partnerDesig")) {
    payload.partnerDesig = data.partnerDesig || "";
  }

  if (forCreate || hasOwn(data, "partnerNamelp")) {
    payload.partnerNamelp = data.partnerNamelp || "";
  }

  if (forCreate || hasOwn(data, "status")) {
    payload.status = data.status || "draft";
  }

  if (forCreate || hasOwn(data, "switchValue")) {
    payload.switchValue = data.switchValue !== false;
  }

  if (forCreate || hasOwn(data, "totalCp")) {
    payload.totalCp = Number(data.totalCp || 0);
  }

  if (forCreate || hasOwn(data, "totallike")) {
    payload.totallike = Number(data.totallike || 0);
  }

  if (forCreate || hasOwn(data, "totalViews")) {
    payload.totalViews = Number(data.totalViews || 0);
  }

  if (forCreate || hasOwn(data, "videoUrl")) {
    payload.videoUrl = data.videoUrl || "";
  }

  if (forCreate || hasOwn(data, "AdminCreatedby")) {
    payload.AdminCreatedby = data.AdminCreatedby || new Date();
  }

  return sanitizeForFirestore(payload);
}
