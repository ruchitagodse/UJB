import {
  GLOBAL_EMAILJS_PUBLIC_KEY,
  GLOBAL_EMAILJS_SERVICE_ID,
  GLOBAL_EMAILJS_TEMPLATE_ID,
} from "@/lib/emailjs/config";

export const ONBOARDING_EMAIL_TEMPLATES = Object.freeze({
  prospect_assessment_request: Object.freeze({
    enabled: true,
    provider: "emailjs",
    serviceId: GLOBAL_EMAILJS_SERVICE_ID,
    templateId: GLOBAL_EMAILJS_TEMPLATE_ID,
    publicKey: GLOBAL_EMAILJS_PUBLIC_KEY,
    recipients: Object.freeze({
      prospect: Object.freeze({
        subject: "",
        body: "",
        variableKeys: Object.freeze([]),
      }),
      orbiter: Object.freeze({
        subject:
          "Prospect Assessment Request for {{prospect_name}}",
        body:
          "Dear {{orbiter_name}},\n\nPlease fill the Prospect Assessment Form for {{prospect_name}}.\n\nAssessment Form:\n{{form_link}}\n\nRegards,\nUJustBe Team\n",
        variableKeys: Object.freeze(["orbiter_name", "prospect_name", "form_link"]),
      }),
    }),
  }),
});

function cloneRecipient(recipient) {
  return {
    ...recipient,
    variableKeys: Array.isArray(recipient?.variableKeys)
      ? [...recipient.variableKeys]
      : [],
  };
}

export function getFallbackOnboardingEmailTemplate(templateId) {
  const template = ONBOARDING_EMAIL_TEMPLATES[templateId];

  if (!template) {
    return null;
  }

  return {
    ...template,
    recipients: Object.fromEntries(
      Object.entries(template.recipients || {}).map(([key, recipient]) => [
        key,
        cloneRecipient(recipient),
      ])
    ),
  };
}
