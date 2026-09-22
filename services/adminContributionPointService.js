async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message || fallbackMessage);
  }

  return body?.success && "data" in body ? body.data : body;
}

export async function fetchCpBoardMembers() {
  const response = await fetch("/api/admin/contribution-points", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load CP members");
  return data.members || [];
}

export async function fetchCpBoardSummary(ujbCode) {
  const normalizedUjbCode = Array.isArray(ujbCode)
    ? String(ujbCode[0] || "").trim()
    : String(ujbCode || "").trim();

  if (!normalizedUjbCode) {
    return {
      user: null,
      activities: [],
      totals: { total: 0, relation: 0, health: 0, wealth: 0 },
    };
  }

  const response = await fetch(
    `/api/admin/contribution-points/${encodeURIComponent(normalizedUjbCode)}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = await readApiResponse(response, "Failed to load CP board summary");
  return {
    user: data.user || null,
    activities: data.activities || [],
    totals: data.totals || { total: 0, relation: 0, health: 0, wealth: 0 },
  };
}

export async function fetchCpActivityDefinitions() {
  const response = await fetch("/api/admin/contribution-points/activities", {
    method: "GET",
    credentials: "include",
  });

  const data = await readApiResponse(response, "Failed to load CP activities");
  return data.activities || [];
}

export async function fetchActiveCpActivityDefinitions() {
  const response = await fetch(
    "/api/admin/contribution-points/activities?status=ACTIVE",
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = await readApiResponse(
    response,
    "Failed to load active CP activities"
  );
  return data.activities || [];
}

export async function importCpActivities(rows) {
  const response = await fetch("/api/admin/contribution-points/activities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "import",
      rows,
    }),
  });

  await readApiResponse(response, "Failed to import CP activities");
}

export async function saveCpActivityDefinition(form, editingId = null) {
  const url = editingId
    ? `/api/admin/contribution-points/activities/${encodeURIComponent(editingId)}`
    : "/api/admin/contribution-points/activities";
  const response = await fetch(url, {
    method: editingId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(
      editingId
        ? { action: "update", form }
        : { action: "create", form }
    ),
  });

  const data = await readApiResponse(response, "Failed to save CP activity");
  return data.id || editingId || "";
}

export async function toggleCpActivityStatus(activity) {
  const response = await fetch(
    `/api/admin/contribution-points/activities/${encodeURIComponent(activity.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "toggle-status",
        activity,
      }),
    }
  );

  return readApiResponse(response, "Failed to update CP activity");
}

export async function deleteCpActivityDefinition(activity) {
  const response = await fetch(
    `/api/admin/contribution-points/activities/${encodeURIComponent(activity.id)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        activity,
      }),
    }
  );

  return readApiResponse(response, "Failed to delete CP activity");
}

export async function searchCpMembersByName(searchTerm) {
  const response = await fetch(
    `/api/admin/contribution-points/members/search?q=${encodeURIComponent(searchTerm)}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  const data = await readApiResponse(response, "Failed to search CP members");
  return data.members || [];
}

export async function assignCpActivityToMember(member, activity) {
  const response = await fetch("/api/admin/contribution-points/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      member,
      activity,
    }),
  });

  await readApiResponse(response, "Failed to assign CP activity");
}
