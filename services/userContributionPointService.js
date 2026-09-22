async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

function normalizeSummary(data) {
  return {
    user: data?.user || null,
    activities: data?.activities || [],
    totals: data?.totals || { total: 0, relation: 0, health: 0, wealth: 0 },
  };
}

async function fetchHomeCpTotal() {
  const homeResponse = await fetch("/api/user/home", {
    method: "GET",
    credentials: "include",
  });
  const homeData = await readApiResponse(homeResponse, "Failed to load home data");
  return Number(homeData?.header?.cpPoints || 0);
}

export async function fetchCpBoardSummary(ujbCode) {
  const endpoints = [
    ujbCode
      ? `/api/user/contribution-points/${encodeURIComponent(String(ujbCode).trim())}`
      : null,
    "/api/user/contribution-points",
  ].filter(Boolean);

  for (const path of endpoints) {
    try {
      const response = await fetch(path, {
        method: "GET",
        credentials: "include",
      });
      const data = await readApiResponse(
        response,
        "Failed to load contribution point summary"
      );
      const normalized = normalizeSummary(data);

      // Keep CP dashboard in sync with header if CP APIs return stale zero totals.
      if (Number(normalized?.totals?.total || 0) <= 0) {
        try {
          const homeTotal = await fetchHomeCpTotal();
          if (homeTotal > 0) {
            normalized.totals.total = homeTotal;
          }
        } catch {
          // Ignore sync fallback error and keep API value.
        }
      }

      return normalized;
    } catch {
      // Try the next endpoint.
    }
  }

  // Final fallback: keep CP page consistent with header source.
  try {
    const total = await fetchHomeCpTotal();
    return normalizeSummary({
      user: null,
      activities: [],
      totals: { total, relation: 0, health: 0, wealth: 0 },
    });
  } catch {
    return normalizeSummary(null);
  }
}
