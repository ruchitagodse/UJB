export function getAgreementType(category) {
  return category === "CosmOrbiter" ? "LISTED_PARTNER" : "PARTNER";
}

export function getAgreementTitle(category) {
  return category === "CosmOrbiter"
    ? "Listed Partner Agreement"
    : "Partner Agreement";
}

export function shouldPromptAgreement(userData) {
  return Boolean(userData) && userData.agreementAccepted !== true;
}

export function buildAgreementAcceptanceUpdate({
  category,
  pdfUrl,
  acceptedAt = new Date(),
}) {
  return {
    agreementAccepted: true,
    agreementAcceptedAt: acceptedAt,
    agreementType: getAgreementType(category),
    agreementPdfUrl: pdfUrl,
  };
}
