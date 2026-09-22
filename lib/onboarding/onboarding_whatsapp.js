export const ONBOARDING_WHATSAPP_TEMPLATES = Object.freeze({
  prospect_assessment_request: Object.freeze({
    enabled: true,
    recipients: Object.freeze({
      prospect: Object.freeze({
        templateName: "",
        body: "",
        variableKeys: Object.freeze([]),
      }),
      orbiter: Object.freeze({
        templateName: "mentorbiter_assesment_form",
        body: "",
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

export function getFallbackOnboardingWhatsAppTemplate(templateId) {
  const template = ONBOARDING_WHATSAPP_TEMPLATES[templateId];

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
