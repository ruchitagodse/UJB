import {
  REFERRAL_STATUSES,
  canTransitionReferralStatus,
  normalizeReferralStatus,
} from "./referralStates.mjs";
import { validateReferralPayload } from "./referralWorkflow.mjs";

export function validateReferralCreationRequest({
  payload,
  isDuplicate = false,
}) {
  const validation = validateReferralPayload(payload);

  if (!validation.ok) {
    return validation;
  }

  if (isDuplicate) {
    return {
      ok: false,
      status: 409,
      message: "This referral has already been passed.",
    };
  }

  return { ok: true };
}

export function getAcceptedReferralStatus() {
  return REFERRAL_STATUSES.ACCEPTED;
}

export function getRejectedReferralStatus() {
  return REFERRAL_STATUSES.REJECTED;
}

export function validateReferralStatusUpdate({
  currentStatus,
  nextStatus,
  rejectReason = "",
}) {
  const normalizedCurrent = normalizeReferralStatus(currentStatus);
  const normalizedNext = normalizeReferralStatus(nextStatus);

  if (!normalizedNext) {
    return {
      ok: false,
      status: 400,
      message: "Missing referral status.",
    };
  }

  if (!canTransitionReferralStatus(normalizedCurrent, normalizedNext)) {
    return {
      ok: false,
      status: 409,
      message: `Invalid referral status transition from "${normalizedCurrent}" to "${normalizedNext}".`,
    };
  }

  if (
    normalizedNext === REFERRAL_STATUSES.REJECTED &&
    !String(rejectReason || "").trim()
  ) {
    return {
      ok: false,
      status: 400,
      message: "Reject reason is required.",
    };
  }

  return {
    ok: true,
    nextStatus: normalizedNext,
  };
}

export function buildReferralStatusUpdatePayload({
  nextStatus,
  rejectReason = "",
  now = new Date(),
}) {
  const payload = {
    dealStatus: nextStatus,
    status: nextStatus,
    "cosmoOrbiter.dealStatus": nextStatus,
    lastUpdated: now,
    statusLogs: [
      {
        status: nextStatus,
        updatedAt: now,
      },
    ],
  };

  if (nextStatus === REFERRAL_STATUSES.REJECTED) {
    payload.rejectReason = String(rejectReason || "").trim();
    payload.statusLogs[0].reason = payload.rejectReason;
  }

  return payload;
}
