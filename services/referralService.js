async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function createReferral(payload) {
  const response = await fetch("/api/user/referrals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await readApiResponse(response, "Failed to create referral");
  return data.referralId || data.id || "";
}

export async function fetchUserReferrals() {
  const response = await fetch("/api/user/referrals", {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load referrals");
}

export async function fetchUserReferralDetails(id) {
  const response = await fetch(`/api/user/referrals/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load referral");
}

export async function updateReferralStatus({ id, status, rejectReason = "" }) {
  const response = await fetch(`/api/user/referrals/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status, rejectReason }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.success) {
    throw new Error(data?.message || "Failed to update referral");
  }

  return {
    referral: data.referral || null,
    cpAwards: Array.isArray(data.cpAwards) ? data.cpAwards : [],
    cpAwarded: Boolean(data.cpAwarded),
  };
}

export async function recordReferralDealTransaction({
  id,
  amountReceived,
  modeOfPayment,
  transactionRef = "",
  paymentDate,
}) {
  const response = await fetch(`/api/user/referrals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "recordDealTransaction",
      amountReceived,
      modeOfPayment,
      transactionRef,
      paymentDate,
    }),
  });

  const data = await readApiResponse(
    response,
    "Failed to record deal transaction"
  );

  return data.referral;
}

export async function fetchReferralDiscussionMessages(referralId) {
  const response = await fetch(
    `/api/user/referrals/${referralId}/discussion`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = await readApiResponse(response, "Failed to load discussion");
  return data.messages || [];
}

export async function sendReferralDiscussionMessage({ referralId, text }) {
  const response = await fetch(
    `/api/user/referrals/${referralId}/discussion`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text }),
    }
  );

  const data = await readApiResponse(response, "Failed to send message");
  return data.message;
}

export async function fetchReferralChatMessages({ referralId, otherUjbCode }) {
  const params = new URLSearchParams({ otherUjbCode });
  const response = await fetch(
    `/api/user/referrals/${referralId}/chat?${params.toString()}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = await readApiResponse(response, "Failed to load chat");
  return data.messages || [];
}

export async function sendReferralChatMessage({
  referralId,
  otherUjbCode,
  text,
}) {
  const response = await fetch(`/api/user/referrals/${referralId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ otherUjbCode, text }),
  });

  const data = await readApiResponse(response, "Failed to send chat message");
  return data.message;
}
