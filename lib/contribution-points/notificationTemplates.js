const DEFAULT_CP_NOTIFICATION_TEMPLATES = Object.freeze({
  "001":
    "Congratulations {recipientName}! You received {points} CP points for introducing {prospectName}.",
  "020":
    "Congratulations {recipientName}! You received CP points for introducing {prospectName}.",
  "021":
    "Congratulations {recipientName}! You received CP points for identifying a self referral.",
  "022":
    "Congratulations {recipientName}! You received CP points for closing referral for {prospectName}.",
  "023":
    "Congratulations {recipientName}! You received CP points for closing a self referral.",
  "024":
    "Congratulations {recipientName}! You received CP points for passing a third-party referral.",
  "025":
    "Congratulations {recipientName}! You received CP points for closing a third-party referral.",
  "026":
    "Congratulations {recipientName}! You received CP points for a self referral deal above Rs. 50,000.",
  "027":
    "Congratulations {recipientName}! You received CP points for a prospect referral deal above Rs. 50,000.",
  "028":
    "Congratulations {recipientName}! You received CP points for a third-party referral deal above Rs. 50,000.",
  "029":
    "Congratulations {recipientName}! You received CP points for identifying {count} or more self referrals this month.",
  "030":
    "Congratulations {recipientName}! You received CP points for identifying {count} or more third-party referrals this month.",
  "031":
    "Congratulations {recipientName}! You received CP points for identifying {count} or more prospect referrals within your first 2 months.",
});

export function getDefaultCpNotificationTemplate(activityNo, activityName = "") {
  const code = String(activityNo || "").trim();
  if (DEFAULT_CP_NOTIFICATION_TEMPLATES[code]) {
    return DEFAULT_CP_NOTIFICATION_TEMPLATES[code];
  }

  const safeName = String(activityName || "").trim();
  if (safeName) {
    return "Congratulations {recipientName}! You received {points} CP points for " + safeName + ".";
  }

  return "Congratulations {recipientName}! You received {points} CP points for your contribution.";
}

export { DEFAULT_CP_NOTIFICATION_TEMPLATES };
