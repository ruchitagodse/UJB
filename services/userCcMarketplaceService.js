async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchApprovedCcDeals() {
  const response = await fetch("/api/user/deals", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load deals");
  return data.deals || [];
}

export async function fetchApprovedCcDealById(id) {
  const response = await fetch(`/api/user/deals/${id}`, {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load deal");
  return {
    deal: data.deal || null,
    orbiter: data.orbiter || null,
  };
}

export async function createCcReferralFromDeal({ id, leadDescription }) {
  const response = await fetch(`/api/user/deals/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      leadDescription,
    }),
  });

  const data = await readApiResponse(response, "Failed to submit referral");
  return data.referralId || "";
}
