async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

async function patchAdminReferral(id, payload, fallbackMessage) {
  const response = await fetch(`/api/admin/referrals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  return readApiResponse(response, fallbackMessage);
}

export async function fetchAdminReferralDetails(id) {
  const response = await fetch(`/api/admin/referrals/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load admin referral");
}

export async function updateAdminReferralStatus({
  id,
  status,
  rejectReason = "",
}) {
  return patchAdminReferral(
    id,
    {
      action: "updateStatus",
      status,
      rejectReason,
    },
    "Failed to update admin referral status"
  );
}

export async function saveAdminReferralDealLog({ id, distribution }) {
  return patchAdminReferral(
    id,
    {
      action: "saveDealLog",
      distribution,
    },
    "Failed to save admin referral deal log"
  );
}

export async function replaceAdminReferralFollowups({ id, followups }) {
  return patchAdminReferral(
    id,
    {
      action: "replaceFollowups",
      followups,
    },
    "Failed to update admin referral followups"
  );
}

export async function attachAdminReferralFile({ id, type, url, name }) {
  return patchAdminReferral(
    id,
    {
      action: "attachFile",
      type,
      url,
      name,
    },
    "Failed to attach admin referral file"
  );
}

export async function deleteAdminReferralFile({ id, type, url }) {
  return patchAdminReferral(
    id,
    {
      action: "deleteFile",
      type,
      url,
    },
    "Failed to delete admin referral file"
  );
}

export async function recordAdminReferralCosmoPayment({ id, entry }) {
  return patchAdminReferral(
    id,
    {
      action: "recordCosmoPayment",
      entry,
    },
    "Failed to record admin referral payment"
  );
}

export async function recordAdminReferralUjbPayout({ id, recipient, entry }) {
  return patchAdminReferral(
    id,
    {
      action: "recordUjbPayout",
      recipient,
      entry,
    },
    "Failed to record admin referral payout"
  );
}

export async function recordAdminReferralDealTransaction({
  id,
  amountReceived,
  modeOfPayment,
  transactionRef = "",
  paymentDate,
}) {
  return patchAdminReferral(
    id,
    {
      action: "recordDealTransaction",
      amountReceived,
      modeOfPayment,
      transactionRef,
      paymentDate,
    },
    "Failed to record deal transaction"
  );
}

export async function updateAdminReferralInvoiceStatus({
  referralDocId,
  invoiceId,
  status,
  paymentMode = "",
  paymentReference = "",
  paidAt = "",
  notes = "",
}) {
  const response = await fetch("/api/admin/accounts/invoices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      referralDocId,
      invoiceId,
      status,
      paymentMode,
      paymentReference,
      paidAt,
      notes,
    }),
  });

  return readApiResponse(response, "Failed to update invoice status");
}
