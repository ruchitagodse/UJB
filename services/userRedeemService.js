async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

function normalizeNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

export function getOriginalPercent(item) {
  if (!item?.agreedValue) return 0;

  if (
    item.agreedValue.mode === "single" &&
    item.agreedValue.single?.type === "percentage"
  ) {
    return normalizeNumber(item.agreedValue.single.value);
  }

  if (
    item.agreedValue.mode === "multiple" &&
    item.agreedValue.multiple?.slabs?.length
  ) {
    return normalizeNumber(item.agreedValue.multiple.slabs[0]?.value);
  }

  return 0;
}

export function getAveragePercent(items = []) {
  const percents = items.map(getOriginalPercent).filter((value) => value > 0);

  if (!percents.length) {
    return 0;
  }

  return Math.round(
    percents.reduce((sum, value) => sum + value, 0) / percents.length
  );
}

export async function fetchRedeemUserProfile() {
  const response = await fetch("/api/user/redeem", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load redemption profile");
  return data.profile || null;
}

export async function acceptRedeemAgreement() {
  const response = await fetch("/api/user/redeem", {
    method: "PATCH",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to accept agreement");
  return data.profile || null;
}

export async function submitRedeemRequest(payload) {
  const response = await fetch("/api/user/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await readApiResponse(response, "Failed to submit redeem request");
  return data.requestId || "";
}

export async function fetchUserPayments() {
  const response = await fetch("/api/user/payments", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load payments");
  return {
    payments: data.payments || [],
    totalReceived: data.totalReceived || 0,
    role: data.role || "",
  };
}
