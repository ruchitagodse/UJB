function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value.trim();
}

function getWhatsAppEnv() {
  return {
    phoneNumberId: requireEnv("WHATSAPP_PHONE_NUMBER_ID"),
    accessToken: requireEnv("WHATSAPP_ACCESS_TOKEN"),
  };
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length === 10) {
    return `91${digits}`;
  }

  return digits;
}

export async function sendWhatsAppPayload(payload) {
  const { phoneNumberId, accessToken } = getWhatsAppEnv();

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    const message = data?.error?.message || "WhatsApp request failed";
    throw new Error(message);
  }

  return data;
}

export async function sendWhatsAppTemplate({
  phone,
  templateName,
  parameters = [],
}) {
  const to = normalizePhone(phone);

  if (!to) {
    throw new Error("Missing phone number");
  }

  if (!templateName) {
    throw new Error("Missing template name");
  }

  return sendWhatsAppPayload({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: parameters.map((text) => ({
            type: "text",
            text: String(text ?? ""),
          })),
        },
      ],
    },
  });
}

export async function sendWhatsAppText({ phone, text }) {
  const to = normalizePhone(phone);

  if (!to) {
    throw new Error("Missing phone number");
  }

  if (!text) {
    throw new Error("Missing text");
  }

  return sendWhatsAppPayload({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: String(text) },
  });
}

export { normalizePhone };
