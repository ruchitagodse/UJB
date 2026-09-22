
import { adminDb } from "@/lib/firebase/firebaseAdmin";
import {
  resolveEmailJsPublicKey,
  resolveEmailJsServiceId,
  resolveEmailJsTemplateId,
} from "@/lib/emailjs/config";
import { getFallbackJourneyEmailTemplate } from "@/lib/journey/journey_email";
import { getFallbackJourneyWhatsAppTemplate } from "@/lib/journey/journey_whatsapp";
import { issueProspectActionToken, buildActionUrl } from "@/lib/prospectAutomation/actionTokens.mjs";
import { sendWhatsAppTemplate } from "@/lib/server/whatsapp";

const ONBOARDING_TEMPLATES_COLLECTION = "onboarding_templates";
const LEGACY_JOURNEY_TEMPLATES_COLLECTION = "journey_templates";

function normalize(value) {
  return String(value || "").trim();
}

function applyTemplateVariables(template = "", values = {}) {
  return String(template || "").replace(/\{\{\s*(.*?)\s*\}\}/g, (_, key) => {
    const normalizedKey = normalize(key);
    return values[normalizedKey] ?? `{{${normalizedKey}}}`;
  });
}

function mergeEmailRecipientWithFallback(recipient = {}, fallbackRecipient = {}) {
  const normalizedRecipient = recipient && typeof recipient === "object" ? recipient : {};
  const normalizedFallback =
    fallbackRecipient && typeof fallbackRecipient === "object" ? fallbackRecipient : {};

  return {
    subject: String(normalizedRecipient.subject || normalizedFallback.subject || ""),
    body: String(normalizedRecipient.body || normalizedFallback.body || ""),
    variableKeys:
      Array.isArray(normalizedRecipient.variableKeys) &&
      normalizedRecipient.variableKeys.length > 0
        ? normalizedRecipient.variableKeys
        : Array.isArray(normalizedFallback.variableKeys)
          ? normalizedFallback.variableKeys
          : [],
  };
}

function resolveEmailRecipientTemplate(channel, fallback, variantKey) {
  const dynamicRecipient = variantKey
    ? channel?.variants?.[variantKey]?.recipients?.prospect
    : channel?.recipients?.prospect;
  const fallbackRecipient = variantKey
    ? fallback?.variants?.[variantKey]?.recipients?.prospect
    : fallback?.recipients?.prospect;

  return mergeEmailRecipientWithFallback(dynamicRecipient, fallbackRecipient);
}

function enforceChooseToEnrollClickHereBody(body, yesUrl, needTimeUrl) {
  let nextBody = String(body || "");

  // EmailJS template output is plain text in our setup, so HTML anchors render literally.
  // Keep links as raw URLs to ensure mail clients auto-link them reliably.
  nextBody = nextBody
    .replace(/<a\s+href="([^"]+)">Click here<\/a>/gi, "$1")
    .replace(/<a\s+href='([^']+)'>Click here<\/a>/gi, "$1")
    .replace(/&lt;a\s+href=(["'])(.*?)\1&gt;Click here&lt;\/a&gt;/gi, "$2");

  nextBody = nextBody.replace(
    /1\)\s*Yes to This Journey:\s*(.*)/i,
    `1) Yes to This Journey: Click here: ${yesUrl}`
  );
  nextBody = nextBody.replace(
    /2\)\s*Need Some Time:\s*(.*)/i,
    `2) Need Some Time: Click here: ${needTimeUrl}`
  );

  if (!/1\)\s*Yes to This Journey:/i.test(nextBody)) {
    nextBody = `${nextBody}\n\n1) Yes to This Journey: Click here: ${yesUrl}`;
  }
  if (!/2\)\s*Need Some Time:/i.test(nextBody)) {
    nextBody = `${nextBody}\n2) Need Some Time: Click here: ${needTimeUrl}`;
  }

  return nextBody
    .replace(/\{\{\s*yes_journey_url\s*\}\}/gi, yesUrl)
    .replace(/\{\{\s*need_time_url\s*\}\}/gi, needTimeUrl)
    .replace(/<[^>]+>/g, "");
}

async function fetchOnboardingTemplate(templateId) {
  try {
    const onboardingRef = adminDb.collection(ONBOARDING_TEMPLATES_COLLECTION).doc(templateId);
    const snap = await onboardingRef.get();
    if (snap.exists) {
      return snap.data() || null;
    }

    const legacySnap = await adminDb
      .collection(LEGACY_JOURNEY_TEMPLATES_COLLECTION)
      .doc(templateId)
      .get();

    if (legacySnap.exists) {
      const legacyData = legacySnap.data() || null;

      if (legacyData) {
        await onboardingRef.set(
          {
            ...legacyData,
            id: templateId,
            templateType: "variant",
            migratedFrom: LEGACY_JOURNEY_TEMPLATES_COLLECTION,
            migratedAt: new Date(),
          },
          { merge: true }
        );
      }

      return legacyData;
    }
  } catch (error) {
    console.error("fetchOnboardingTemplate failed:", error);
  }
  return null;
}

export async function sendEmailViaEmailJs(channel, templateParams) {
  const serviceId = resolveEmailJsServiceId(channel?.serviceId);
  const templateId = resolveEmailJsTemplateId(channel?.templateId);
  const publicKey = resolveEmailJsPublicKey(channel?.publicKey);
  const privateKey = normalize(process.env.EMAILJS_PRIVATE_KEY);
  if (!serviceId || !templateId || !publicKey) {
    return { ok: false, reason: "missing_emailjs_config" };
  }
  if (!privateKey) {
    return { ok: false, reason: "missing_emailjs_private_key" };
  }

  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        accessToken: privateKey,
        template_params: templateParams,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, reason: `emailjs_http_${res.status}`, details: text };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "emailjs_fetch_error", details: error?.message || "unknown" };
  }
}

function toVariantKey(label, status) {
  return `${normalize(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")}_${normalize(status)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")}`;
}

function getEnrollmentRow(rows, label) {
  return (Array.isArray(rows) ? rows : []).find((row) => normalize(row?.label) === normalize(label));
}

export function buildEnrollmentRowsUpdate(rows, label, status, dateIso) {
  const nowDate = normalize(dateIso || new Date().toISOString().slice(0, 10));
  const nextRows = Array.isArray(rows) ? [...rows] : [];
  const idx = nextRows.findIndex((row) => normalize(row?.label) === normalize(label));
  const entry = {
    label,
    checked: true,
    date: nowDate,
    status,
    sent: false,
  };
  if (idx >= 0) {
    nextRows[idx] = {
      ...nextRows[idx],
      ...entry,
    };
  } else {
    nextRows.push(entry);
  }
  return nextRows;
}

export async function sendEnrollmentStatusProspectEmail({
  prospect = {},
  rowLabel,
  rowStatus,
  rowDate,
  extraVariables = {},
}) {
  const email = normalize(prospect?.email);
  if (!email) return { ok: false, reason: "missing_prospect_email" };

  const dynamicTemplate = await fetchOnboardingTemplate("enrollment_status");
  const fallback = getFallbackJourneyEmailTemplate("enrollment_status");
  const channel = dynamicTemplate?.channels?.email || fallback;
  const variantKey = toVariantKey(rowLabel, rowStatus);
  const recipientTemplate = resolveEmailRecipientTemplate(channel, fallback, variantKey);

  const templateValues = {
    prospect_name: prospect?.prospectName || "Prospect",
    date: rowDate || new Date().toISOString().slice(0, 10),
    ...extraVariables,
  };
  const subject = applyTemplateVariables(recipientTemplate?.subject, templateValues);
  const body = applyTemplateVariables(recipientTemplate?.body, templateValues);

  return sendEmailViaEmailJs(channel, {
    to_email: email,
    prospect_name: prospect?.prospectName || "Prospect",
    subject,
    body,
  });
}

export async function sendEnrollmentStatusProspectWhatsApp({
  prospect = {},
  rowLabel,
  rowStatus,
  rowDate,
  extraVariables = {},
}) {
  const phone = normalize(prospect?.prospectPhone);
  if (!phone) return { ok: false, reason: "missing_prospect_phone" };

  const dynamicTemplate = await fetchOnboardingTemplate("enrollment_status");
  const fallback = getFallbackJourneyWhatsAppTemplate("enrollment_status");
  const channel = dynamicTemplate?.channels?.whatsapp || fallback;
  const variantKey = toVariantKey(rowLabel, rowStatus);
  const recipientTemplate =
    channel?.variants?.[variantKey]?.recipients?.prospect ||
    fallback?.variants?.[variantKey]?.recipients?.prospect;

  const templateName = normalize(recipientTemplate?.templateName);
  if (!templateName) {
    return { ok: true, skipped: true, reason: "missing_whatsapp_template_name" };
  }

  const baseValues = {
    prospect_name: prospect?.prospectName || "Prospect",
    date: rowDate || new Date().toISOString().slice(0, 10),
    ...extraVariables,
  };
  const resolvedBodyText = applyTemplateVariables(recipientTemplate?.body, baseValues);
  const values = {
    ...baseValues,
    body_text: resolvedBodyText,
    orbiter_name: prospect?.orbiterName || "UJustBe Team",
  };
  const variableKeys = Array.isArray(recipientTemplate?.variableKeys)
    ? recipientTemplate.variableKeys
    : [];

  try {
    await sendWhatsAppTemplate({
      phone,
      templateName,
      parameters: variableKeys.map((key) => values[normalize(key)] ?? ""),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: "whatsapp_send_failed",
      details: error?.message || "unknown",
    };
  }
}

export async function sendEnrollmentStatusProspectNotifications(payload = {}) {
  const [email, whatsapp] = await Promise.all([
    sendEnrollmentStatusProspectEmail(payload),
    sendEnrollmentStatusProspectWhatsApp(payload),
  ]);
  return {
    ok: Boolean(email?.ok) && Boolean(whatsapp?.ok),
    email,
    whatsapp,
  };
}

export async function sendAuthenticChoiceProspectEmail({
  prospect = {},
  variantKey,
  variables = {},
}) {
  const email = normalize(prospect?.email);
  if (!email || !variantKey) return { ok: false, reason: "missing_email_or_variant" };
  const dynamicTemplate = await fetchOnboardingTemplate("authentic_choice");
  const fallback = getFallbackJourneyEmailTemplate("authentic_choice");
  const channel = dynamicTemplate?.channels?.email || fallback;
  const recipientTemplate = resolveEmailRecipientTemplate(channel, fallback, variantKey);
  const templateValues = {
    prospect_name: prospect?.prospectName || "Prospect",
    ...variables,
  };
  const subject = applyTemplateVariables(recipientTemplate?.subject, templateValues);
  const body = applyTemplateVariables(recipientTemplate?.body, templateValues);
  return sendEmailViaEmailJs(channel, {
    to_email: email,
    prospect_name: prospect?.prospectName || "Prospect",
    subject,
    body,
  });
}

export async function sendChooseToEnrollProspectEmailWithLinks({
  db,
  req,
  prospect = {},
  createdBy = "system",
}) {
  const email = normalize(prospect?.email);
  const prospectId = normalize(prospect?.id);
  if (!email || !prospectId) {
    return { ok: false, reason: "missing_email_or_prospect" };
  }

  const rootUrl = req ? new URL(req.url).origin : "";
  const yesToken = await issueProspectActionToken(db, {
    prospectId,
    action: "choose_to_enroll_yes",
    createdBy,
  });
  const needTimeToken = await issueProspectActionToken(db, {
    prospectId,
    action: "choose_to_enroll_need_time",
    createdBy,
  });
  const yesUrl = buildActionUrl(rootUrl, yesToken.token);
  const needTimeUrl = buildActionUrl(rootUrl, needTimeToken.token);

  const dynamicTemplate = await fetchOnboardingTemplate("authentic_choice");
  const fallback = getFallbackJourneyEmailTemplate("authentic_choice");
  const channel = dynamicTemplate?.channels?.email || fallback;
  const recipientTemplate = resolveEmailRecipientTemplate(
    channel,
    fallback,
    "choose_to_enroll"
  );
  const subject = applyTemplateVariables(String(recipientTemplate?.subject || ""), {
    prospect_name: prospect?.prospectName || "Prospect",
  });
  let body = applyTemplateVariables(String(recipientTemplate?.body || ""), {
    prospect_name: prospect?.prospectName || "Prospect",
    yes_journey_url: "Click here",
    need_time_url: "Click here",
  });
  body = enforceChooseToEnrollClickHereBody(body, yesUrl, needTimeUrl);

  const result = await sendEmailViaEmailJs(channel, {
    to_email: email,
    prospect_name: prospect?.prospectName || "Prospect",
    subject,
    body,
    yes_journey_url: yesUrl,
    need_time_url: needTimeUrl,
  });

  return { ...result, yesUrl, needTimeUrl };
}

export async function sendEnrollmentFeeOptionEmailWithLinks({
  db,
  req,
  prospect = {},
  createdBy = "system",
}) {
  const email = normalize(prospect?.email);
  const prospectId = normalize(prospect?.id);
  if (!email || !prospectId) {
    return { ok: false, reason: "missing_email_or_prospect" };
  }

  const rootUrl = req ? new URL(req.url).origin : "";
  const option1Token = await issueProspectActionToken(db, {
    prospectId,
    action: "enrollment_fee_option1",
    createdBy,
  });
  const option2Token = await issueProspectActionToken(db, {
    prospectId,
    action: "enrollment_fee_option2",
    createdBy,
  });
  const option1Url = buildActionUrl(rootUrl, option1Token.token);
  const option2Url = buildActionUrl(rootUrl, option2Token.token);

  const dynamicTemplate = await fetchOnboardingTemplate("enrollment_status");
  const fallback = getFallbackJourneyEmailTemplate("enrollment_status");
  const channel = dynamicTemplate?.channels?.email || fallback;
  const variantKey = toVariantKey("Enrollment Fees Mail Status", "Fee mail sent");
  const recipientTemplate = resolveEmailRecipientTemplate(channel, fallback, variantKey);
  const templateValues = {
    prospect_name: prospect?.prospectName || "Prospect",
    date: new Date().toISOString().slice(0, 10),
  };
  const subject = applyTemplateVariables(recipientTemplate?.subject, templateValues);
  const bodyCore = applyTemplateVariables(recipientTemplate?.body, templateValues);
  const body = `${bodyCore}\n\nOption 1: ${option1Url}\nOption 2: ${option2Url}`;

  const result = await sendEmailViaEmailJs(channel, {
    to_email: email,
    prospect_name: prospect?.prospectName || "Prospect",
    subject,
    body,
  });

  return { ...result, option1Url, option2Url };
}

export function getEnrollmentFeeOptionRow(rows) {
  return getEnrollmentRow(rows, "Enrollment fees Option Opted for");
}
