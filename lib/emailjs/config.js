function normalize(value) {
  return String(value || "").trim();
}

export const GLOBAL_EMAILJS_SERVICE_ID = normalize(
  process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID
);

export const GLOBAL_EMAILJS_TEMPLATE_ID = normalize(
  process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID
);

export const GLOBAL_EMAILJS_PUBLIC_KEY = normalize(
  process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY
);

export function resolveEmailJsServiceId(serviceId = "") {
  return GLOBAL_EMAILJS_SERVICE_ID || normalize(serviceId);
}

export function resolveEmailJsTemplateId(templateId = "") {
  return GLOBAL_EMAILJS_TEMPLATE_ID || normalize(templateId);
}

export function resolveEmailJsPublicKey(publicKey = "") {
  return GLOBAL_EMAILJS_PUBLIC_KEY || normalize(publicKey);
}

export function getResolvedEmailJsConfig(config = {}) {
  return {
    serviceId: resolveEmailJsServiceId(config?.serviceId),
    templateId: resolveEmailJsTemplateId(config?.templateId),
    publicKey: resolveEmailJsPublicKey(config?.publicKey),
  };
}

export function toEmailJsErrorDetails(error) {
  if (!error) {
    return {
      message: "Unknown EmailJS error",
    };
  }

  return {
    name: normalize(error?.name),
    message: normalize(error?.message),
    text: normalize(error?.text),
    status:
      typeof error?.status === "number" || typeof error?.status === "string"
        ? error.status
        : "",
  };
}
