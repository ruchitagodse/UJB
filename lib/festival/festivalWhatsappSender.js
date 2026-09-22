import { serverEnv } from "@/lib/config/serverEnv";
import { normalizePhone } from "@/lib/server/whatsapp";

export async function sendFestivalWhatsappMessage({ phone, recipientName, messageText, imageUrl, templateName = "daily_reminder", templateLanguage = "en" }) {
  const to = normalizePhone(phone);
  if (!to || !imageUrl || !messageText) throw new Error("Recipient, creative, and message are required");
  const response = await fetch(`https://graph.facebook.com/v21.0/${serverEnv.whatsapp.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serverEnv.whatsapp.accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: templateName, language: { code: templateLanguage }, components: [
      { type: "header", parameters: [{ type: "image", image: { link: imageUrl } }] },
      { type: "body", parameters: [{ type: "text", text: String(recipientName || "Team") }, { type: "text", text: messageText }] },
    ] } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "WhatsApp request failed");
  return data;
}
