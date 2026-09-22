async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

async function patchCcReferral(id, payload, fallbackMessage) {
  const response = await fetch(`/api/user/ccreferrals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  return readApiResponse(response, fallbackMessage);
}

export async function fetchCcReferralDetails(id) {
  const response = await fetch(`/api/user/ccreferrals/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load CC referral");
}

export async function updateCcReferralStatus({ id, status, rejectReason = "" }) {
  return patchCcReferral(
    id,
    {
      action: "updateStatus",
      status,
      rejectReason,
    },
    "Failed to update CC referral status"
  );
}

export async function saveCcReferralDealLog({ id, distribution }) {
  return patchCcReferral(
    id,
    {
      action: "saveDealLog",
      distribution,
    },
    "Failed to save CC referral deal log"
  );
}

export async function replaceCcReferralFollowups({ id, followups }) {
  return patchCcReferral(
    id,
    {
      action: "replaceFollowups",
      followups,
    },
    "Failed to update CC referral followups"
  );
}

export async function attachCcReferralFile({ id, type, url, name }) {
  return patchCcReferral(
    id,
    {
      action: "attachFile",
      type,
      url,
      name,
    },
    "Failed to attach CC referral file"
  );
}

export async function recordCcCosmoPayment({ id, entry }) {
  return patchCcReferral(
    id,
    {
      action: "recordCosmoPayment",
      entry,
    },
    "Failed to record CC referral payment"
  );
}

export async function recordCcUjbPayout({ id, recipient, entry }) {
  return patchCcReferral(
    id,
    {
      action: "recordUjbPayout",
      recipient,
      entry,
    },
    "Failed to record CC referral payout"
  );
}

export async function previewCcReferralAdjustment({
  id,
  role,
  requestedAmount,
  dealValue,
  ujbCode,
}) {
  return patchCcReferral(
    id,
    {
      action: "previewAdjustment",
      role,
      requestedAmount,
      dealValue,
      ujbCode,
    },
    "Failed to preview adjustment"
  );
}

export async function applyCcReferralAdjustment({
  id,
  role,
  requestedAmount,
  dealValue,
  ujbCode,
}) {
  return patchCcReferral(
    id,
    {
      action: "applyAdjustment",
      role,
      requestedAmount,
      dealValue,
      ujbCode,
    },
    "Failed to apply adjustment"
  );
}
