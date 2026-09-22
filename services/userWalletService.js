async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchUserWallet() {
  const response = await fetch("/api/user/wallet", {
    method: "GET",
    credentials: "include",
  });

  return readApiResponse(response, "Failed to load wallet");
}

export async function submitWalletWithdraw({ amount, note = "" }) {
  const response = await fetch("/api/user/wallet/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ amount, note }),
  });

  return readApiResponse(response, "Failed to submit withdrawal request");
}
