import { adminDb } from "@/lib/firebase/firebaseAdmin";
import { getResolvedEmailJsConfig } from "@/lib/emailjs/config";
import { getFallbackJourneyEmailTemplate } from "@/lib/journey/journey_email";
import { getFallbackJourneyWhatsAppTemplate } from "@/lib/journey/journey_whatsapp";
import { sendEmailViaEmailJs } from "@/lib/prospectAutomation/notifications.mjs";
import { sendWhatsAppTemplate } from "@/lib/server/whatsapp";

const ONBOARDING_TEMPLATES_COLLECTION = "onboarding_templates";
const TEMPLATE_ID = "meeting_logs";

function normalize(value) {
  return String(value || "").trim();
}

function applyTemplateVariables(template = "", values = {}) {
  return String(template || "").replace(/\{\{\s*(.*?)\s*\}\}/g, (_, key) => {
    const normalizedKey = normalize(key);
    return values[normalizedKey] ?? `{{${normalizedKey}}}`;
  });
}

function getMeetingVariant(previousEvents = [], nextEvents = []) {
  const prev = Array.isArray(previousEvents) ? previousEvents : [];
  const next = Array.isArray(nextEvents) ? nextEvents : [];

  if (!next.length) return "";

  const latestNext = next[next.length - 1];
  const latestPrev = prev[prev.length - 1] || null;

  if (normalize(latestNext?.status).toLowerCase() === "done") {
    return "thank_you";
  }

  if (!latestPrev || next.length > prev.length) {
    return "schedule";
  }

  const prevDate = normalize(latestPrev?.dateISO || latestPrev?.date);
  const nextDate = normalize(latestNext?.dateISO || latestNext?.date);
  const prevMode = normalize(latestPrev?.mode).toLowerCase();
  const nextMode = normalize(latestNext?.mode).toLowerCase();
  const prevHistoryCount = Array.isArray(latestPrev?.rescheduleHistory)
    ? latestPrev.rescheduleHistory.length
    : 0;
  const nextHistoryCount = Array.isArray(latestNext?.rescheduleHistory)
    ? latestNext.rescheduleHistory.length
    : 0;

  if (
    prevDate !== nextDate ||
    prevMode !== nextMode ||
    nextHistoryCount > prevHistoryCount
  ) {
    return "reschedule";
  }

  return "";
}

function mergeRecipientContent(recipient = {}, fallbackRecipient = {}) {
  const normalizedRecipient = recipient && typeof recipient === "object" ? recipient : {};
  const normalizedFallback =
    fallbackRecipient && typeof fallbackRecipient === "object" ? fallbackRecipient : {};
  const recipientSubject = normalize(normalizedRecipient.subject);
  const fallbackSubject = normalize(normalizedFallback.subject);
  const recipientTemplateName = normalize(normalizedRecipient.templateName);
  const fallbackTemplateName = normalize(normalizedFallback.templateName);

  return {
    subject: recipientSubject || fallbackSubject,
    templateName: recipientTemplateName || fallbackTemplateName,
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

function mergeVariantWithFallback(variant = {}, fallbackVariant = {}) {
  return {
    recipients: {
      prospect: mergeRecipientContent(
        variant?.recipients?.prospect,
        fallbackVariant?.recipients?.prospect
      ),
      orbiter: mergeRecipientContent(
        variant?.recipients?.orbiter,
        fallbackVariant?.recipients?.orbiter
      ),
    },
  };
}

function mergeVariantsWithFallback(variants = {}, fallbackVariants = {}) {
  const variantKeys = Array.from(
    new Set([
      ...Object.keys(variants || {}),
      ...Object.keys(fallbackVariants || {}),
    ])
  );

  return Object.fromEntries(
    variantKeys.map((variantKey) => [
      variantKey,
      mergeVariantWithFallback(variants?.[variantKey], fallbackVariants?.[variantKey]),
    ])
  );
}

async function fetchMeetingTemplate() {
  const fallbackEmail = getFallbackJourneyEmailTemplate(TEMPLATE_ID) || {};
  const fallbackWhatsApp = getFallbackJourneyWhatsAppTemplate(TEMPLATE_ID) || {};

  if (!adminDb) {
    return {
      channels: {
        email: fallbackEmail,
        whatsapp: fallbackWhatsApp,
      },
    };
  }

  try {
    const snap = await adminDb.collection(ONBOARDING_TEMPLATES_COLLECTION).doc(TEMPLATE_ID).get();
    const data = snap.exists ? snap.data() || {} : {};
    const emailChannelData = data?.channels?.email || {};
    const whatsappChannelData = data?.channels?.whatsapp || {};

    return {
      channels: {
        email: {
          ...fallbackEmail,
          ...emailChannelData,
          ...getResolvedEmailJsConfig(emailChannelData || fallbackEmail),
          variants: mergeVariantsWithFallback(
            emailChannelData?.variants,
            fallbackEmail?.variants
          ),
        },
        whatsapp: {
          ...fallbackWhatsApp,
          ...whatsappChannelData,
          variants: mergeVariantsWithFallback(
            whatsappChannelData?.variants,
            fallbackWhatsApp?.variants
          ),
        },
      },
    };
  } catch (error) {
    console.error("Meeting template fetch failed:", error);
    return {
      channels: {
        email: fallbackEmail,
        whatsapp: fallbackWhatsApp,
      },
    };
  }
}

function buildValues({ meeting = {}, prospect = {} }) {
  const latestHistory = Array.isArray(meeting?.rescheduleHistory) && meeting.rescheduleHistory.length
    ? meeting.rescheduleHistory[meeting.rescheduleHistory.length - 1]
    : null;
  const prospectName = normalize(prospect?.prospectName) || "Prospect";
  const orbiterName = normalize(prospect?.orbiterName) || "UJustBe Team";
  const opsName = normalize(prospect?.assignedOpsName) || "OPS";
  const date = normalize(meeting?.date) || normalize(meeting?.dateISO);
  const locationDetails =
    normalize(meeting?.mode).toLowerCase() === "offline"
      ? normalize(meeting?.venue)
      : normalize(meeting?.zoomLink);
  const scheduleDetails = locationDetails;
  const reason = normalize(latestHistory?.reason);

  return {
    recipient_name: prospectName,
    name: prospectName,
    prospect_name: prospectName,
    date,
    schedule_details: scheduleDetails,
    location_details: locationDetails,
    reason,
    orbiter_name: orbiterName,
    ops_name: opsName,
    assignedOpsName: opsName,
    assigned_ops_name: opsName,
  };
}

function withRecipientValues(values = {}, recipientName = "") {
  const normalizedRecipientName = normalize(recipientName);
  if (!normalizedRecipientName) return values;
  return {
    ...values,
    recipient_name: normalizedRecipientName,
    name: normalizedRecipientName,
  };
}

async function sendMeetingEmail(channel, recipientTemplate, toEmail, values) {
  if (!toEmail || !recipientTemplate) {
    return { ok: true, skipped: true, reason: "missing_email_recipient_or_template" };
  }

  const subject = applyTemplateVariables(recipientTemplate.subject, values);
  const body = applyTemplateVariables(recipientTemplate.body, values);
  return sendEmailViaEmailJs(channel, {
    to_email: toEmail,
    recipient_name: values.recipient_name,
    subject,
    body,
    orbiter_name: values.orbiter_name,
    date: values.date,
  });
}

async function sendMeetingWhatsApp(recipientTemplate, phone, values) {
  if (!phone || !recipientTemplate) {
    return { ok: true, skipped: true, reason: "missing_whatsapp_recipient_or_template" };
  }

  const templateName = normalize(recipientTemplate?.templateName);
  if (!templateName) {
    return { ok: true, skipped: true, reason: "missing_whatsapp_template_name" };
  }

  const variableKeys = Array.isArray(recipientTemplate?.variableKeys)
    ? recipientTemplate.variableKeys
    : [];

  try {
    await sendWhatsAppTemplate({
      phone,
      templateName,
      parameters: variableKeys.map((key) => values[key] ?? ""),
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

function summarizeChannelResults(resultsByRecipient = {}, channelLabel = "channel") {
  const entries = Object.entries(resultsByRecipient);
  const failed = entries.filter(([, result]) => !result?.ok);
  const skipped = entries.filter(([, result]) => result?.skipped);

  if (failed.length === 0) {
    const allSkipped = entries.length > 0 && skipped.length === entries.length;
    return {
      ok: true,
      skipped: allSkipped,
      reason: allSkipped ? `${channelLabel}_all_skipped` : "",
      recipients: resultsByRecipient,
    };
  }

  const details = failed
    .map(([recipientKey, result]) => {
      const reason = String(result?.details || result?.reason || "unknown_error").trim();
      return `${recipientKey}: ${reason}`;
    })
    .join(" | ");

  return {
    ok: false,
    reason: `${channelLabel}_partial_failure`,
    details,
    recipients: resultsByRecipient,
  };
}

export async function triggerMeetingNotifications({
  previousEvents = [],
  nextEvents = [],
  prospect = {},
}) {
  const variantKey = getMeetingVariant(previousEvents, nextEvents);
  if (!variantKey) {
    return { success: true, skipped: true, reason: "no_notification_variant" };
  }

  const latestMeeting = Array.isArray(nextEvents) && nextEvents.length
    ? nextEvents[nextEvents.length - 1]
    : null;
  if (!latestMeeting) {
    return { success: true, skipped: true, reason: "missing_latest_meeting" };
  }

  const template = await fetchMeetingTemplate();
  const baseValues = buildValues({ meeting: latestMeeting, prospect });
  const prospectValues = withRecipientValues(baseValues, baseValues.prospect_name);
  const orbiterValues = withRecipientValues(baseValues, baseValues.orbiter_name);
  const emailChannel = template?.channels?.email || {};
  const whatsappChannel = template?.channels?.whatsapp || {};
  const emailRecipients = emailChannel?.variants?.[variantKey]?.recipients || {};
  const whatsappRecipients = whatsappChannel?.variants?.[variantKey]?.recipients || {};

  const [prospectEmail, orbiterEmail, opsEmail] = await Promise.all([
    sendMeetingEmail(
      emailChannel,
      emailRecipients?.prospect,
      normalize(prospect?.email),
      prospectValues
    ),
    sendMeetingEmail(
      emailChannel,
      emailRecipients?.orbiter,
      normalize(prospect?.orbiterEmail),
      orbiterValues
    ),
    sendMeetingEmail(
      emailChannel,
      emailRecipients?.ops,
      normalize(prospect?.assignedOpsEmail),
      baseValues
    ),
  ]);

  const [prospectWhatsApp, orbiterWhatsApp] = await Promise.all([
    sendMeetingWhatsApp(
      whatsappRecipients?.prospect,
      normalize(prospect?.prospectPhone),
      prospectValues
    ),
    sendMeetingWhatsApp(
      whatsappRecipients?.orbiter,
      normalize(prospect?.orbiterContact),
      orbiterValues
    ),
  ]);

  const emailResult = summarizeChannelResults(
    {
      prospect: prospectEmail,
      orbiter: orbiterEmail,
      ops: opsEmail,
    },
    "email"
  );
  const whatsappResult = summarizeChannelResults(
    {
      prospect: prospectWhatsApp,
      orbiter: orbiterWhatsApp,
    },
    "whatsapp"
  );

  return {
    success: Boolean(emailResult?.ok) && Boolean(whatsappResult?.ok),
    variantKey,
    email: emailResult,
    whatsapp: whatsappResult,
    triggeredAt: new Date(),
  };
}
