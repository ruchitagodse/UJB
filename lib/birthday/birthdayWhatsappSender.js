import axios from "axios";

const DEFAULT_TEMPLATE_NAME = "daily_reminder";
const DEFAULT_TEMPLATE_LANGUAGE = "en";
const DEFAULT_IMAGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/ujustbedev.firebasestorage.app/o/birthdayImages%2Ffallback%2Ffallback.png?alt=media&token=ae34c321-707a-47ee-b855-580845d3c070";

function sanitizeText(text) {
  return String(text || "")
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

function firstNonEmpty(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return value;
    }
  }

  return "";
}

function buildBirthdayMessage() {
  return sanitizeText(`
    Today Be Special, *Connect* with *Love* and *Grow* in Abundance.
    UJustBe Universe wishes you a day full of happiness and a year that brings you much success.
    Happy Birthday!!!
  `);
}

async function sendTemplateMessage({
  accessToken,
  phoneNumberId,
  to,
  name,
  message,
  imageUrl,
  templateName = DEFAULT_TEMPLATE_NAME,
  templateLanguage = DEFAULT_TEMPLATE_LANGUAGE,
}) {
  await axios.post(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: [
          {
            type: "header",
            parameters: [{ type: "image", image: { link: imageUrl } }],
          },
          {
            type: "body",
            parameters: [
              { type: "text", text: name },
              { type: "text", text: message },
            ],
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
}

export async function sendBirthdayWhatsappMessages({
  adminDb,
  collectionName,
  whatsapp,
  user,
}) {
  if (!adminDb) {
    throw new Error("Firebase Admin is not configured");
  }

  if (!user || !user.id || !user.phone || !user.name) {
    throw new Error("Invalid birthday user payload");
  }

  const phoneNumber = normalizePhone(user.phone);
  const name = sanitizeText(user.name);
  const imageUrl = user.imageUrl || DEFAULT_IMAGE_URL;

  if (!phoneNumber) {
    throw new Error("Birthday user phone number is missing");
  }

  await sendTemplateMessage({
    accessToken: whatsapp.accessToken,
    phoneNumberId: whatsapp.phoneNumberId,
    to: phoneNumber,
    name: `*${name}*`,
    message: buildBirthdayMessage(),
    imageUrl,
  });

  const mentorSnap = await adminDb.collection(collectionName).doc(user.id).get();

  if (!mentorSnap.exists) {
    return { userSent: true, mentorSent: false };
  }

  const mentorData = mentorSnap.data() || {};
  const mentorPhone = normalizePhone(
    firstNonEmpty(mentorData, [
      "MentorPhone",
      "Mentor Phone",
      "mentorPhone",
      "mentor phone",
      "Mentor Mobile",
      "MentorMobile",
    ])
  );

  if (!mentorPhone) {
    return { userSent: true, mentorSent: false };
  }

  const mentorName = sanitizeText(
    firstNonEmpty(mentorData, [
      "MentorName",
      "Mentor Name",
      "mentorName",
      "mentor name",
    ]) || "Mentor"
  );
  const gender = String(mentorData.Gender || "").toLowerCase();
  let pronoun = "them";
  if (gender === "male") pronoun = "him";
  if (gender === "female") pronoun = "her";

  await sendTemplateMessage({
    accessToken: whatsapp.accessToken,
    phoneNumberId: whatsapp.phoneNumberId,
    to: mentorPhone,
    name: mentorName,
    message: sanitizeText(
      `Today is your connect's (*${name}*) birthday. Kindly wish ${pronoun}. *Connect* with *Love* and *Grow*.`
    ),
    imageUrl,
  });

  return { userSent: true, mentorSent: true };
}
