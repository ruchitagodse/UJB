function buildEmailJsError(message, details = "", status = 500) {
  const error = new Error(message || "Failed to send email");
  error.details = details;
  error.status = status;
  return error;
}

export async function sendEmailViaServer({
  templateParams,
  serviceId = "",
  templateId = "",
  publicKey = "",
}) {
  const res = await fetch("/api/emailjs/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      serviceId,
      templateId,
      publicKey,
      templateParams,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw buildEmailJsError(
      data?.message || "Failed to send email",
      data?.details || "",
      res.status
    );
  }

  return data;
}
