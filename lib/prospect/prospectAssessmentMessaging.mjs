import { adminDb } from "@/lib/firebase/firebaseAdmin";
import { getResolvedEmailJsConfig } from "@/lib/emailjs/config";
import { getFallbackOnboardingEmailTemplate } from "@/lib/onboarding/onboarding_email";
import { getFallbackOnboardingWhatsAppTemplate } from "@/lib/onboarding/onboarding_whatsapp";
import { sendEmailViaEmailJs } from "@/lib/prospectAutomation/notifications.mjs";
import { sendWhatsAppTemplate } from "@/lib/server/whatsapp";

const ONBOARDING_TEMPLATES_COLLECTION = "onboarding_templates";
const PROSPECT_ASSESSMENT_TEMPLATE_ID = "prospect_assessment_request";

const DEFAULT_TEMPLATE = {
  channels: {
    email: getFallbackOnboardingEmailTemplate("prospect_assessment_request"),
    whatsapp: getFallbackOnboardingWhatsAppTemplate("prospect_assessment_request"),
  },
};

function normalize(value) {
  return String(value || "").trim();
}

function shouldRetryNotification(result = {}) {
  if (!result || result.ok) {
    return false;
  }

  return ![
    "email_disabled",
    "whatsapp_disabled",
    "missing_orbiter_email",
    "missing_orbiter_phone",
    "missing_emailjs_config",
    "missing_emailjs_private_key",
  ].includes(String(result.reason || "").trim());
}

async function retryNotification(factory, maxAttempts = 2) {
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const currentResult = await factory(attempt);
    lastResult = {
      ...currentResult,
      attempts: attempt,
    };

    if (currentResult?.ok || !shouldRetryNotification(currentResult) || attempt === maxAttempts) {
      return lastResult;
    }
  }

  return lastResult || { ok: false, reason: "notification_unknown_failure", attempts: 0 };
}

function applyTemplateVariables(template = "", values = {}) {
  return String(template || "").replace(/\{\{\s*(.*?)\s*\}\}/g, (_, key) => {
    const normalizedKey = normalize(key);
    return values[normalizedKey] ?? `{{${normalizedKey}}}`;
  });
}

function normalizeVariableKeys(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalize(item)).filter(Boolean);
}

function normalizeRecipientContent(value, channelType) {
  const recipient = value && typeof value === "object" ? value : {};

  if (channelType === "email") {
    return {
      subject: normalize(recipient.subject),
      body: String(recipient.body || ""),
      variableKeys: normalizeVariableKeys(recipient.variableKeys),
    };
  }

  return {
    templateName: normalize(recipient.templateName),
    body: String(recipient.body || ""),
    variableKeys: normalizeVariableKeys(recipient.variableKeys),
  };
}

function normalizeRecipients(channel, channelType) {
  const recipients = channel?.recipients;

  if (recipients && typeof recipients === "object") {
    return {
      prospect: normalizeRecipientContent(recipients.prospect, channelType),
      orbiter: normalizeRecipientContent(recipients.orbiter, channelType),
    };
  }

  return {
    prospect: normalizeRecipientContent(null, channelType),
    orbiter: normalizeRecipientContent(channel, channelType),
  };
}

function normalizeTemplate(data = {}) {
  const fallbackEmail = DEFAULT_TEMPLATE.channels.email || {};
  const fallbackWhatsApp = DEFAULT_TEMPLATE.channels.whatsapp || {};
  const normalizedEmailRecipients = normalizeRecipients(data?.channels?.email, "email");
  const normalizedWhatsAppRecipients = normalizeRecipients(
    data?.channels?.whatsapp,
    "whatsapp"
  );
  const fallbackEmailRecipients = normalizeRecipients(fallbackEmail, "email");
  const fallbackWhatsAppRecipients = normalizeRecipients(fallbackWhatsApp, "whatsapp");
  const emailJsConfig = getResolvedEmailJsConfig(data?.channels?.email || fallbackEmail);

  return {
    channels: {
      email: {
        enabled: data?.channels?.email?.enabled !== false,
        provider: normalize(data?.channels?.email?.provider || "emailjs"),
        serviceId: emailJsConfig.serviceId,
        templateId: emailJsConfig.templateId,
        publicKey: emailJsConfig.publicKey,
        recipients: {
          prospect: {
            ...fallbackEmailRecipients.prospect,
            ...normalizedEmailRecipients.prospect,
            body:
              normalizedEmailRecipients.prospect.body ||
              fallbackEmailRecipients.prospect.body,
            variableKeys:
              normalizedEmailRecipients.prospect.variableKeys?.length > 0
                ? normalizedEmailRecipients.prospect.variableKeys
                : fallbackEmailRecipients.prospect.variableKeys,
          },
          orbiter: {
            ...fallbackEmailRecipients.orbiter,
            ...normalizedEmailRecipients.orbiter,
            body:
              normalizedEmailRecipients.orbiter.body ||
              fallbackEmailRecipients.orbiter.body,
            variableKeys:
              normalizedEmailRecipients.orbiter.variableKeys?.length > 0
                ? normalizedEmailRecipients.orbiter.variableKeys
                : fallbackEmailRecipients.orbiter.variableKeys,
          },
        },
      },
      whatsapp: {
        enabled: data?.channels?.whatsapp?.enabled !== false,
        recipients: {
          prospect: {
            ...fallbackWhatsAppRecipients.prospect,
            ...normalizedWhatsAppRecipients.prospect,
            templateName:
              normalizedWhatsAppRecipients.prospect.templateName ||
              fallbackWhatsAppRecipients.prospect.templateName,
            body:
              normalizedWhatsAppRecipients.prospect.body ||
              fallbackWhatsAppRecipients.prospect.body,
            variableKeys:
              normalizedWhatsAppRecipients.prospect.variableKeys?.length > 0
                ? normalizedWhatsAppRecipients.prospect.variableKeys
                : fallbackWhatsAppRecipients.prospect.variableKeys,
          },
          orbiter: {
            ...fallbackWhatsAppRecipients.orbiter,
            ...normalizedWhatsAppRecipients.orbiter,
            templateName:
              normalizedWhatsAppRecipients.orbiter.templateName ||
              fallbackWhatsAppRecipients.orbiter.templateName,
            body:
              normalizedWhatsAppRecipients.orbiter.body ||
              fallbackWhatsAppRecipients.orbiter.body,
            variableKeys:
              normalizedWhatsAppRecipients.orbiter.variableKeys?.length > 0
                ? normalizedWhatsAppRecipients.orbiter.variableKeys
                : fallbackWhatsAppRecipients.orbiter.variableKeys,
          },
        },
      },
    },
  };
}

async function fetchProspectAssessmentTemplate() {
  if (!adminDb) {
    return DEFAULT_TEMPLATE;
  }

  try {
    const snap = await adminDb
      .collection(ONBOARDING_TEMPLATES_COLLECTION)
      .doc(PROSPECT_ASSESSMENT_TEMPLATE_ID)
      .get();
    if (!snap.exists) {
      return DEFAULT_TEMPLATE;
    }

    return normalizeTemplate(snap.data() || {});
  } catch (error) {
    console.error("Failed to fetch onboarding template:", error);
    return DEFAULT_TEMPLATE;
  }
}

export function buildProspectAssessmentTemplateValues({
  orbiterName = "",
  prospectName = "",
  formLink = "",
  orbiterEmail = "",
  orbiterPhone = "",
}) {
  return {
    orbiter_name: normalize(orbiterName),
    prospect_name: normalize(prospectName),
    form_link: normalize(formLink),
    orbiter_email: normalize(orbiterEmail),
    orbiter_phone: normalize(orbiterPhone),
  };
}

async function triggerProspectAssessmentEmail(template, values) {
  const emailChannel = template?.channels?.email || DEFAULT_TEMPLATE.channels.email;
  const emailRecipient =
    emailChannel?.recipients?.orbiter || DEFAULT_TEMPLATE.channels.email.recipients.orbiter;

  if (emailChannel?.enabled === false) {
    return { ok: true, skipped: true, reason: "email_disabled" };
  }

  if (!values.orbiter_email) {
    return { ok: false, reason: "missing_orbiter_email" };
  }

  const subject = applyTemplateVariables(emailRecipient?.subject, values);
  const body = applyTemplateVariables(emailRecipient?.body, values);
  return sendEmailViaEmailJs(emailChannel, {
    prospect_name: values.prospect_name,
    to_email: values.orbiter_email,
    subject,
    body,
    orbiter_name: values.orbiter_name,
  });
}

async function triggerProspectAssessmentWhatsApp(template, values) {
  const whatsappChannel =
    template?.channels?.whatsapp || DEFAULT_TEMPLATE.channels.whatsapp;
  const whatsappRecipient =
    whatsappChannel?.recipients?.orbiter ||
    DEFAULT_TEMPLATE.channels.whatsapp.recipients.orbiter;

  if (whatsappChannel?.enabled === false) {
    return { ok: true, skipped: true, reason: "whatsapp_disabled" };
  }

  if (!values.orbiter_phone) {
    return { ok: false, reason: "missing_orbiter_phone" };
  }

  const variableKeys =
    whatsappRecipient?.variableKeys?.length > 0
      ? whatsappRecipient.variableKeys
      : DEFAULT_TEMPLATE.channels.whatsapp.recipients.orbiter.variableKeys || [];

  try {
    await sendWhatsAppTemplate({
      phone: values.orbiter_phone,
      templateName:
        whatsappRecipient?.templateName ||
        DEFAULT_TEMPLATE.channels.whatsapp.recipients.orbiter.templateName,
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

export async function triggerProspectAssessmentMessages(values, options = {}) {
  const skipEmail = options?.skipEmail === true;
  const skipWhatsApp = options?.skipWhatsApp === true;
  const template = await fetchProspectAssessmentTemplate();
  const [emailResult, whatsappResult] = await Promise.all([
    skipEmail
      ? Promise.resolve({ ok: true, skipped: true, reason: "email_client_side" })
      : retryNotification(() => triggerProspectAssessmentEmail(template, values)),
    skipWhatsApp
      ? Promise.resolve({ ok: true, skipped: true, reason: "whatsapp_client_side" })
      : retryNotification(() => triggerProspectAssessmentWhatsApp(template, values)),
  ]);

  return {
    success: Boolean(emailResult?.ok) && Boolean(whatsappResult?.ok),
    email: emailResult,
    whatsapp: whatsappResult,
    triggeredAt: new Date(),
  };
}
