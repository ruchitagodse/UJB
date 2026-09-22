import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReferralDuplicateKey,
  buildReferralLockId,
  buildReferralId,
  buildReferralNotifications,
  buildReferralWritePayload,
  isValidReferralEmail,
  isValidReferralPhone,
  normalizeReferralItem,
  validateReferralPayload,
} from "../lib/referrals/referralWorkflow.mjs";
import {
  buildReferralStatusUpdatePayload,
  getAcceptedReferralStatus,
  getRejectedReferralStatus,
  validateReferralCreationRequest,
  validateReferralStatusUpdate,
} from "../lib/referrals/referralMutationWorkflow.mjs";
import {
  REFERRAL_STATUSES,
  canTransitionReferralStatus,
  normalizeReferralStatus,
} from "../lib/referrals/referralStates.mjs";
import {
  canUserUpdateReferralStatus,
  getReferralParticipantRole,
} from "../lib/referrals/referralServerWorkflow.mjs";
import {
  buildReferralCpNotificationMessage,
  splitCategoryPoints,
} from "../lib/referrals/referralCpWorkflow.mjs";
import {
  REFERRAL_REWARD_TYPES,
  buildDealDistribution,
  getReferralRewardDetails,
} from "../utils/referralCalculations.js";
import {
  formatValueForDisplayInput,
  normalizeValueForStorageInput,
} from "../lib/utils/dateFormat.js";

test("referral workflow normalizes legacy percentage items", () => {
  const item = normalizeReferralItem({
    name: "Design",
    percentage: 15,
  });

  assert.equal(item.agreedValue.single.type, "percentage");
  assert.equal(item.agreedValue.single.value, "15");
});

test("referral workflow builds stable referral ids", () => {
  const referralId = buildReferralId(3010, new Date("2026-04-03T00:00:00Z"));
  assert.equal(referralId, "Ref/26-27/00003010");
});

test("referral workflow builds payloads for someone else and notification fanout", () => {
  const payload = buildReferralWritePayload({
    referralId: "Ref/26-27/00003010",
    leadDescription: "Warm lead",
    selectedFor: "someone",
    otherName: "Lead Name",
    otherPhone: "8888888888",
    otherEmail: "lead@example.com",
    selectedItem: { type: "service", label: "Coaching" },
    finalItem: { name: "Coaching" },
    cosmoDetails: {
      ujbCode: "COS001",
      name: "Cosmo",
      email: "cosmo@example.com",
      phone: "7777777777",
    },
    orbiterDetails: {
      ujbCode: "ORB001",
      name: "Orbiter",
      email: "orbiter@example.com",
      phone: "6666666666",
    },
    timestampValue: "SERVER_TS",
  });

  assert.equal(payload.referralType, "Others");
  assert.equal(payload.referredForName, "Lead Name");
  assert.equal(payload.service.name, "Coaching");
  assert.equal(payload.product, null);
  assert.deepEqual(payload.followups, []);

  const notifications = buildReferralNotifications({
    selectedItem: { label: "Coaching" },
    orbiterDetails: { name: "Orbiter", phone: "6666666666" },
    cosmoDetails: { name: "Cosmo", phone: "7777777777" },
  });

  assert.equal(notifications.length, 2);
  assert.match(notifications[0].parameters[1], /Coaching/);
  assert.match(notifications[1].parameters[1], /Coaching/);
});

test("referral workflow validates self-referral and contact quality", () => {
  const sharedPayload = {
    selectedItem: { type: "service", label: "Coaching" },
    leadDescription: "Warm lead",
    selectedFor: "self",
    otherName: "",
    otherPhone: "",
    otherEmail: "",
    cosmoDetails: {
      ujbCode: "UJB001",
      name: "Same User",
      email: "same@example.com",
      phone: "9999999999",
    },
    orbiterDetails: {
      ujbCode: "UJB001",
      name: "Same User",
      email: "same@example.com",
      phone: "9999999999",
    },
  };

  assert.equal(validateReferralPayload(sharedPayload).ok, false);
  assert.equal(isValidReferralPhone("99999"), false);
  assert.equal(isValidReferralEmail("bad-email"), false);
});

test("referral workflow builds stable duplicate lock identities", () => {
  const duplicateKey = buildReferralDuplicateKey({
    selectedItem: { type: "service", label: "Coaching" },
    selectedFor: "someone",
    otherName: "Lead Name",
    otherPhone: "+91 88888 88888",
    otherEmail: "lead@example.com",
    cosmoDetails: { ujbCode: "COS001", email: "cosmo@example.com", phone: "7777777777" },
    orbiterDetails: { ujbCode: "ORB001", email: "orbiter@example.com", phone: "6666666666" },
  });

  assert.match(duplicateKey, /orbiter:ORB001/);
  assert.match(buildReferralLockId(duplicateKey), /^user-referral-/);
  assert.equal(
    validateReferralCreationRequest({
      payload: {
        selectedItem: { type: "service", label: "Coaching" },
        leadDescription: "Warm lead",
        selectedFor: "self",
        cosmoDetails: { ujbCode: "COS001", email: "cosmo@example.com", phone: "7777777777" },
        orbiterDetails: { ujbCode: "ORB001", email: "orbiter@example.com", phone: "6666666666" },
      },
      isDuplicate: true,
    }).ok,
    false
  );
});

test("referral status workflow enforces canonical transitions", () => {
  assert.equal(normalizeReferralStatus("Reject"), REFERRAL_STATUSES.REJECTED);
  assert.equal(
    canTransitionReferralStatus(
      REFERRAL_STATUSES.PENDING,
      getAcceptedReferralStatus()
    ),
    true
  );
  assert.equal(
    canTransitionReferralStatus(
      REFERRAL_STATUSES.PENDING,
      REFERRAL_STATUSES.DEAL_WON
    ),
    false
  );

  assert.equal(
    validateReferralStatusUpdate({
      currentStatus: REFERRAL_STATUSES.PENDING,
      nextStatus: getRejectedReferralStatus(),
      rejectReason: "",
    }).ok,
    false
  );

  const acceptedPayload = buildReferralStatusUpdatePayload({
    nextStatus: getAcceptedReferralStatus(),
    now: new Date("2026-04-03T00:00:00Z"),
  });
  assert.equal(acceptedPayload.status, REFERRAL_STATUSES.ACCEPTED);

  const rejectedPayload = buildReferralStatusUpdatePayload({
    nextStatus: getRejectedReferralStatus(),
    rejectReason: "Not a fit",
    now: new Date("2026-04-03T00:00:00Z"),
  });
  assert.equal(rejectedPayload.rejectReason, "Not a fit");
});

test("referral calculations treat percentage rewards as percentages of the deal", () => {
  const item = {
    agreedValue: {
      mode: "single",
      single: {
        type: "percentage",
        value: 10,
      },
    },
  };

  const reward = getReferralRewardDetails(10000, item);
  const distribution = buildDealDistribution(10000, { service: item });

  assert.equal(reward.rewardType, REFERRAL_REWARD_TYPES.PERCENTAGE);
  assert.equal(reward.rewardValue, 10);
  assert.equal(reward.rewardAmount, 1000);
  assert.equal(distribution.agreedAmount, 1000);
});

test("referral calculations preserve fixed rewards as rupee amounts", () => {
  const item = {
    agreedValue: {
      mode: "single",
      single: {
        type: "fixed",
        value: 10,
      },
    },
  };

  const reward = getReferralRewardDetails(10000, item);
  const distribution = buildDealDistribution(10000, { service: item });

  assert.equal(reward.rewardType, REFERRAL_REWARD_TYPES.FIXED);
  assert.equal(reward.rewardValue, 10);
  assert.equal(reward.rewardAmount, 10);
  assert.equal(distribution.agreedAmount, 10);
  assert.equal(distribution.percentage, 0);
});

test("referral status permissions allow assigned cosmo and orbiter only", () => {
  const referral = {
    cosmoUjbCode: "COS001",
    orbiterUJBCode: "ORB001",
  };

  assert.equal(
    getReferralParticipantRole({
      referral,
      sessionUjbCode: "COS001",
    }),
    "cosmo"
  );
  assert.equal(
    getReferralParticipantRole({
      referral,
      sessionUjbCode: "ORB001",
    }),
    "orbiter"
  );
  assert.equal(
    canUserUpdateReferralStatus({
      referral,
      sessionUjbCode: "COS001",
    }),
    true
  );
  assert.equal(
    canUserUpdateReferralStatus({
      referral,
      sessionUjbCode: "ORB001",
    }),
    true
  );
  assert.equal(
    canUserUpdateReferralStatus({
      referral,
      sessionUjbCode: "OTHER001",
    }),
    false
  );
});

test("date inputs keep dd/mm/yy display with ISO storage", () => {
  assert.equal(
    formatValueForDisplayInput("2026-04-27", "date"),
    "27/04/26"
  );
  assert.equal(
    normalizeValueForStorageInput("27/04/26", "date"),
    "2026-04-27"
  );
  assert.equal(
    formatValueForDisplayInput("2026-04-27T14:30", "datetime-local"),
    "27/04/26 14:30"
  );
  assert.equal(
    normalizeValueForStorageInput("27/04/26 14:30", "datetime-local"),
    "2026-04-27T14:30"
  );
});

test("referral CP category split preserves totals for R+W", () => {
  const evenSplit = splitCategoryPoints(["R", "W"], 200);
  assert.equal(evenSplit.R, 100);
  assert.equal(evenSplit.W, 100);

  const oddSplit = splitCategoryPoints(["R", "W"], 175);
  assert.equal(oddSplit.R + oddSplit.W, 175);
  assert.equal(oddSplit.R, 87);
  assert.equal(oddSplit.W, 88);
});

test("referral CP notification includes recipient and prospect names", () => {
  const message = buildReferralCpNotificationMessage({
    activityNo: "020",
    recipientName: "Ruchita",
    prospectName: "Amit",
  });

  assert.match(message, /^Congratulations Ruchita!/);
  assert.match(message, /introducing Amit/);
});

test("referral CP notification falls back when recipient/prospect names are missing", () => {
  const message = buildReferralCpNotificationMessage({
    activityNo: "020",
    recipientName: "",
    prospectName: "",
  });

  assert.match(message, /^Congratulations!/);
  assert.match(message, /introducing your prospect/);
});
