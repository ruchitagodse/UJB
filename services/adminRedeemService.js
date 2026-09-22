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

export async function fetchAllRedeemUsers() {
  const response = await fetch("/api/admin/redeem?view=users", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load users");
  return data.users || [];
}

export async function createApprovedRedeemDeal(payload) {
  const response = await fetch("/api/admin/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await readApiResponse(response, "Failed to create redeem deal");
  return data.id || "";
}

export async function fetchRedeemDeals() {
  const response = await fetch("/api/admin/redeem", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load redeem deals");
  return data.deals || [];
}

export async function approveRedeemDeal(id, category) {
  const response = await fetch(`/api/admin/redeem/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "approve",
      category,
    }),
  });

  await readApiResponse(response, "Failed to approve redeem deal");
}

export async function rejectRedeemDeal(id) {
  const response = await fetch(`/api/admin/redeem/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "reject",
    }),
  });

  await readApiResponse(response, "Failed to reject redeem deal");
}

export async function updateRedeemDeal(id, payload) {
  const response = await fetch(`/api/admin/redeem/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "update",
      payload,
    }),
  });

  await readApiResponse(response, "Failed to update redeem deal");
}
