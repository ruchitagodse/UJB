export async function sendWhatsAppTemplateRequest({
  phone,
  templateName,
  parameters = [],
}) {
  const res = await fetch("/api/send-whatsapp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone,
      templateName,
      parameters,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || data?.message || "WhatsApp request failed");
  }

  return data;
}

export async function sendWhatsAppTextRequest({ phone, text }) {
  const res = await fetch("/api/send-whatsapp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone,
      text,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || data?.message || "WhatsApp request failed");
  }

  return data;
}

export async function sendJourneyWhatsAppRequest({
  phone,
  bodyText,
  orbiterName = "UJustBe Team",
}) {
  return sendWhatsAppTemplateRequest({
    phone,
    templateName: "enrollment_journey",
    parameters: [String(bodyText || ""), String(orbiterName || "UJustBe Team")],
  });
}
