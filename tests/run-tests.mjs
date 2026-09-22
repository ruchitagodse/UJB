import assert from "node:assert/strict";

import {
  API_ERROR_CODES,
  buildApiError,
  buildApiSuccess,
} from "../lib/api/contracts.mjs";
import {
  isPlainObject,
  requiredString,
} from "../lib/api/request.mjs";
import {
  authFailure,
  buildAdminAuthContext,
  buildUserAuthContext,
} from "../lib/auth/authContexts.mjs";
import {
  buildUserSessionRecord,
  buildUserSessionResponse,
  getLogoutAllRevocations,
  getLogoutCookieOptions,
  getUserSessionCookieOptions,
  shouldRefreshUserSession,
  USER_SESSION_MAX_AGE_MS,
  validateUserSessionRecord,
} from "../lib/auth/userSessionWorkflow.mjs";
import {
  buildBootstrapAdminRecord,
  buildAdminSessionPayload,
  findAuthorizedAdmin,
  shouldBootstrapAdmin,
  validateAdminRoleAccess,
  validateAdminSessionAccess,
} from "../lib/auth/adminAccessWorkflow.mjs";
import {
  hasSuperAdminAccess,
} from "../lib/auth/accessControl.js";
import {
  DEFAULT_LOGIN_STATUS,
  LOGIN_STATUS_OPTIONS,
  isInactiveLoginStatus,
  normalizeLoginStatus,
} from "../lib/auth/loginStatusWorkflow.mjs";
import {
  buildAgreementAcceptanceUpdate,
  getAgreementTitle,
  getAgreementType,
  shouldPromptAgreement,
} from "../lib/agreements/agreementWorkflow.mjs";
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
  recordUserReferralDealTransaction,
  updateReferralInvoiceStatus,
} from "../lib/referrals/referralServerWorkflow.mjs";
import {
  REFERRAL_REWARD_TYPES,
  buildDealDistribution,
  getReferralRewardDetails,
} from "../utils/referralCalculations.js";
import {
  formatValueForDisplayInput,
  normalizeValueForStorageInput,
} from "../lib/utils/dateFormat.js";
import {
  buildAccountsPaymentsReport,
  deriveCosmoSubscriptionStatus,
} from "../lib/accounts/accountsPaymentsReport.mjs";
import {
  festivalDateInIst,
  normalizeFestivalCampaignPayload,
  scheduleFestivalAtSixAmIst,
} from "../lib/festival/festivalCampaignWorkflow.mjs";

const results = [];

async function run(name, fn) {
  try {
    await fn();
    results.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "failed", error });
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

const hasAdminAccess = (role) =>
  String(role || "").toLowerCase().includes("admin");

await run("API helpers expose stable success and error envelopes", () => {
  assert.deepEqual(buildApiSuccess({ id: "abc" }), {
    success: true,
    data: { id: "abc" },
  });

  assert.deepEqual(buildApiError("Nope", API_ERROR_CODES.FORBIDDEN), {
    success: false,
    message: "Nope",
    code: "FORBIDDEN",
  });
});

await run("request helpers validate JSON object fields consistently", () => {
  assert.equal(isPlainObject({ ok: true }), true);
  assert.equal(isPlainObject([]), false);
  assert.deepEqual(requiredString(" UJB001 ", "ujbCode"), {
    ok: true,
    value: "UJB001",
  });
  assert.equal(requiredString("", "ujbCode").status, 422);
});

await run("auth contexts normalize user and admin identities", () => {
  const userContext = buildUserAuthContext({
    session: { ujbCode: " UJB001 ", phone: " 9999999999 " },
    sessionId: "session-1",
  });

  assert.equal(userContext.actorType, "user");
  assert.equal(userContext.ujbCode, "UJB001");
  assert.equal(userContext.role, "user");
  assert.deepEqual(userContext.permissions, []);

  const adminContext = buildAdminAuthContext({
    email: " ADMIN@EXAMPLE.COM ",
    name: "Admin User",
    role: "Admin",
    designation: "Lead",
  });

  assert.equal(adminContext.actorType, "admin");
  assert.equal(adminContext.email, "admin@example.com");
  assert.deepEqual(adminContext.permissions, ["Admin"]);
  assert.equal(authFailure({ reason: "missing" }).ok, false);
});

await run("OTP login creates a long-lived session record", () => {
  const now = 1_700_000_000_000;
  const session = buildUserSessionRecord({
    phone: "9999999999",
    ujbCode: "UJB001",
    userData: { Name: "Ruchita", Type: "Orbiter" },
    ip: "127.0.0.1",
    geo: { city: "Pune" },
    deviceInfo: { type: "Desktop" },
    now,
  });

  assert.equal(session.phone, "9999999999");
  assert.equal(session.name, "Ruchita");
  assert.equal(session.type, "Orbiter");
  assert.equal(session.expiry, now + USER_SESSION_MAX_AGE_MS);
});

await run("session validation rejects invalid sessions and refreshes near expiry", () => {
  const now = 1_700_000_000_000;

  assert.deepEqual(validateUserSessionRecord(null, now), {
    ok: false,
    reason: "missing",
  });
  assert.deepEqual(
    validateUserSessionRecord({ revoked: true, expiry: now + 1000 }, now),
    { ok: false, reason: "revoked" }
  );
  assert.deepEqual(
    validateUserSessionRecord({ revoked: false, expiry: now - 1 }, now),
    { ok: false, reason: "expired" }
  );
  assert.equal(
    shouldRefreshUserSession({ expiry: now + 1000 * 60 * 60 * 24 * 3 }, now),
    true
  );
  assert.equal(
    shouldRefreshUserSession({ expiry: now + 1000 * 60 * 60 * 24 * 20 }, now),
    false
  );
});

await run("logout and logout-all helpers expose cookie clearing and revocation targets", () => {
  const cookieOptions = getLogoutCookieOptions(true);
  assert.equal(cookieOptions.httpOnly, true);
  assert.equal(cookieOptions.secure, true);

  const revocations = getLogoutAllRevocations([
    { id: "a", ref: { update() {} }, data: () => ({ phone: "1" }) },
    { id: "b", ref: { update() {} }, data: () => ({ phone: "1" }) },
  ]);

  assert.deepEqual(
    revocations.map((item) => item.id),
    ["a", "b"]
  );
});

await run("session response and cookie helpers remain stable", () => {
  const payload = buildUserSessionResponse({
    phone: "9999999999",
    ujbCode: "UJB001",
    name: "Ruchita",
    type: "Orbiter",
  });

  assert.deepEqual(payload, {
    phone: "9999999999",
    role: "user",
    profile: {
      ujbCode: "UJB001",
      name: "Ruchita",
      type: "Orbiter",
    },
  });

  const cookie = getUserSessionCookieOptions(false);
  assert.equal(cookie.maxAge, USER_SESSION_MAX_AGE_MS / 1000);
});

await run("admin-only access boundaries stay role-aware", () => {
  const docs = [
    { data: () => ({ email: "member@example.com", role: "Member" }) },
    {
      data: () => ({
        email: "admin@example.com",
        role: "Admin",
        name: "Admin User",
      }),
    },
  ];

  const denied = findAuthorizedAdmin(docs, "member@example.com", hasAdminAccess);
  assert.equal(denied.ok, false);

  const allowed = findAuthorizedAdmin(docs, "admin@example.com", hasAdminAccess);
  assert.equal(allowed.ok, true);

  const payload = buildAdminSessionPayload(allowed.adminData, {
    email: "admin@example.com",
    name: "Fallback Name",
    picture: "photo.png",
  });
  assert.equal(payload.name, "Admin User");

  assert.equal(
    validateAdminSessionAccess({ role: "Member" }, hasAdminAccess).ok,
    false
  );
  assert.equal(
    validateAdminSessionAccess({ ...payload, designation: "" }, hasAdminAccess).ok,
    true
  );
  assert.equal(hasSuperAdminAccess("Super"), true);
  assert.equal(hasSuperAdminAccess("Admin"), false);
  assert.equal(
    validateAdminRoleAccess(
      { role: "Admin" },
      hasSuperAdminAccess,
      "Only Super Admin can manage roles"
    ).ok,
    false
  );
  assert.equal(
    validateAdminRoleAccess(
      { role: "Super" },
      hasSuperAdminAccess,
      "Only Super Admin can manage roles"
    ).ok,
    true
  );
});

await run("login status helpers normalize access states", () => {
  assert.equal(DEFAULT_LOGIN_STATUS, "Active");
  assert.deepEqual(LOGIN_STATUS_OPTIONS, ["Active", "Inactive"]);
  assert.equal(normalizeLoginStatus(" active "), "Active");
  assert.equal(normalizeLoginStatus("Inactive"), "Inactive");
  assert.equal(normalizeLoginStatus("unknown"), null);
  assert.equal(isInactiveLoginStatus("Inactive"), true);
  assert.equal(isInactiveLoginStatus("Active"), false);
});

await run("first admin login bootstraps when admin registry is empty", () => {
  assert.equal(shouldBootstrapAdmin([]), true);
  assert.equal(shouldBootstrapAdmin([{ data: () => ({}) }]), false);

  const bootstrap = buildBootstrapAdminRecord({
    email: "founder@example.com",
    name: "Founder",
    picture: "photo.png",
  });

  assert.equal(bootstrap.email, "founder@example.com");
  assert.equal(bootstrap.role, "Admin");
  assert.equal(bootstrap.designation, "Founding Admin");
  assert.equal(bootstrap.bootstrap, true);
});

await run("agreement acceptance workflow remains consistent", () => {
  assert.equal(shouldPromptAgreement({ agreementAccepted: false }), true);
  assert.equal(shouldPromptAgreement({ agreementAccepted: true }), false);
  assert.equal(getAgreementTitle("CosmOrbiter"), "Listed Partner Agreement");
  assert.equal(getAgreementType("Orbiter"), "PARTNER");

  const acceptedAt = new Date("2026-04-03T10:00:00Z");
  assert.deepEqual(
    buildAgreementAcceptanceUpdate({
      category: "CosmOrbiter",
      pdfUrl: "https://example.com/agreement.pdf",
      acceptedAt,
    }),
    {
      agreementAccepted: true,
      agreementAcceptedAt: acceptedAt,
      agreementType: "LISTED_PARTNER",
      agreementPdfUrl: "https://example.com/agreement.pdf",
    }
  );
});

await run("referral creation workflow builds ids, payloads, and notifications", () => {
  assert.equal(
    buildReferralId(3010, new Date("2026-04-03T00:00:00Z")),
    "Ref/26-27/00003010"
  );

  const item = normalizeReferralItem({ name: "Design", percentage: 15 });
  assert.equal(item.agreedValue.single.value, "15");

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
  assert.equal(payload.service.name, "Coaching");

  const notifications = buildReferralNotifications({
    selectedItem: { label: "Coaching" },
    orbiterDetails: { name: "Orbiter", phone: "6666666666" },
    cosmoDetails: { name: "Cosmo", phone: "7777777777" },
  });

  assert.equal(notifications.length, 2);
});

await run("referral create validation rejects self-referrals and duplicates", () => {
  const payload = {
    selectedItem: { type: "service", label: "Coaching" },
    leadDescription: "Warm lead",
    selectedFor: "self",
    cosmoDetails: {
      ujbCode: "ORB001",
      email: "same@example.com",
      phone: "9999999999",
    },
    orbiterDetails: {
      ujbCode: "ORB001",
      email: "same@example.com",
      phone: "9999999999",
    },
  };

  assert.equal(validateReferralPayload(payload).ok, false);
  assert.equal(
    validateReferralCreationRequest({
      payload: {
        ...payload,
        cosmoDetails: {
          ujbCode: "COS001",
          email: "cosmo@example.com",
          phone: "8888888888",
        },
      },
      isDuplicate: true,
    }).ok,
    false
  );
  assert.equal(isValidReferralPhone("99999"), false);
  assert.equal(isValidReferralEmail("bad-email"), false);
});

await run("referral duplicate keys and lock ids remain stable", () => {
  const duplicateKey = buildReferralDuplicateKey({
    selectedItem: { type: "service", label: "Coaching" },
    selectedFor: "someone",
    otherName: "Lead Name",
    otherPhone: "+91 88888 88888",
    otherEmail: "lead@example.com",
    cosmoDetails: { ujbCode: "COS001", email: "cosmo@example.com", phone: "7777777777" },
    orbiterDetails: { ujbCode: "ORB001", email: "orbiter@example.com", phone: "6666666666" },
  });

  assert.match(duplicateKey, /target:918888888888/);
  assert.match(buildReferralLockId(duplicateKey), /^user-referral-/);
});

await run("referral status workflow supports accept and reject transitions", () => {
  assert.equal(normalizeReferralStatus("Reject"), REFERRAL_STATUSES.REJECTED);
  assert.equal(
    canTransitionReferralStatus(
      REFERRAL_STATUSES.PENDING,
      getAcceptedReferralStatus()
    ),
    true
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

await run("referral percentage rewards calculate against the deal value", () => {
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
  assert.equal(reward.rewardAmount, 1000);
  assert.equal(distribution.agreedAmount, 1000);
});

await run("referral fixed rewards stay as rupee amounts", () => {
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
  assert.equal(reward.rewardAmount, 10);
  assert.equal(distribution.agreedAmount, 10);
  assert.equal(distribution.percentage, 0);
});

await run("referral deal transaction invoices fixed commission proportionally", async () => {
  let capturedUpdate = null;
  const provider = {
    referrals: {
      async updateById(id, update) {
        capturedUpdate = { id, update };
        return { id, ...update };
      },
    },
  };
  const referral = {
    id: "ref-1",
    referralId: "REF-1",
    dealValue: 100000,
    cosmoUjbCode: "COS001",
    orbiterUJBCode: "ORB001",
    cosmoOrbiter: { ujbCode: "COS001", name: "Cosmo" },
    orbiter: { ujbCode: "ORB001", name: "Orbiter" },
    product: {
      name: "Product",
      agreedValue: {
        mode: "single",
        single: { type: "fixed", value: 10000 },
      },
    },
  };

  await recordUserReferralDealTransaction({
    provider,
    referral,
    id: "ref-1",
    actorUjbCode: "COS001",
    entry: {
      amountReceived: 20000,
      modeOfPayment: "Bank Transfer",
      paymentDate: "2026-05-08",
    },
  });

  const invoice = capturedUpdate.update.ujustbeeInvoices[0];
  assert.equal(capturedUpdate.update.dealTransactions[0].linkedInvoiceId, invoice.invoiceId);
  assert.equal(invoice.baseAmount, 2000);
  assert.equal(invoice.gstAmount, 360);
  assert.equal(invoice.totalAmount, 2360);
});

await run("referral deal transaction invoices future true-up after deal value change", async () => {
  let capturedUpdate = null;
  const provider = {
    referrals: {
      async updateById(id, update) {
        capturedUpdate = { id, update };
        return { id, ...update };
      },
    },
  };
  const referral = {
    id: "ref-2",
    referralId: "REF-2",
    dealValue: 200000,
    cosmoUjbCode: "COS001",
    orbiterUJBCode: "ORB001",
    cosmoOrbiter: { ujbCode: "COS001", name: "Cosmo" },
    orbiter: { ujbCode: "ORB001", name: "Orbiter" },
    product: {
      name: "Product",
      agreedValue: {
        mode: "single",
        single: { type: "fixed", value: 10000 },
      },
    },
    dealTransactions: [
      { transactionId: "old-1", amountReceived: 20000 },
      { transactionId: "old-2", amountReceived: 40000 },
    ],
    ujustbeeInvoices: [
      { invoiceId: "inv-1", baseAmount: 2000 },
      { invoiceId: "inv-2", baseAmount: 4000 },
    ],
  };

  await recordUserReferralDealTransaction({
    provider,
    referral,
    id: "ref-2",
    actorUjbCode: "COS001",
    entry: {
      amountReceived: 20000,
      modeOfPayment: "UPI",
      paymentDate: "2026-05-08",
    },
  });

  const invoice = capturedUpdate.update.ujustbeeInvoices[2];
  assert.equal(invoice.baseAmount, 571.43);
  assert.equal(invoice.gstAmount, 102.86);
  assert.equal(invoice.totalAmount, 674.29);
});

await run("paid invoice status creates one linked admin cosmo payment", async () => {
  let capturedUpdate = null;
  const provider = {
    referrals: {
      async updateById(id, update) {
        capturedUpdate = { id, update };
        return { id, ...update };
      },
    },
  };
  const referral = {
    id: "ref-3",
    ujustbeeInvoices: [
      {
        invoiceId: "inv-3",
        invoiceNumber: "UJB/2026-27/000003",
        baseAmount: 2000,
        gstAmount: 360,
        totalAmount: 2360,
        status: "Pending",
        dealTransactionId: "deal-txn-3",
        totals: {
          taxableAmount: 2000,
          gstAmount: 360,
          totalAmount: 2360,
        },
      },
    ],
    payments: [],
    ujbBalance: 0,
  };

  await updateReferralInvoiceStatus({
    provider,
    referral,
    id: "ref-3",
    invoiceId: "inv-3",
    status: "Paid",
    paymentMode: "UPI",
    paymentReference: "UPI-123",
    paidAt: "2026-05-08",
    adminId: "admin@example.com",
  });

  const payment = capturedUpdate.update.payments[0];
  const updatedInvoice = capturedUpdate.update.ujustbeeInvoices[0];
  assert.equal(payment.paymentId, "INV-PAY-inv-3");
  assert.equal(payment.meta.isInvoiceLinkedPayment, true);
  assert.equal(payment.meta.invoiceId, "inv-3");
  assert.equal(payment.meta.invoiceNumber, "UJB/2026-27/000003");
  assert.equal(payment.grossAmount, 2000);
  assert.equal(payment.meta.invoiceTotalAmount, 2360);
  assert.equal(capturedUpdate.update.ujbBalance, 2000);
  assert.equal(updatedInvoice.statusAuditLogs.length, 1);
  assert.equal(updatedInvoice.statusAuditLogs[0].changedByAdminId, "admin@example.com");
  assert.equal(updatedInvoice.statusAuditLogs[0].toStatus, "Paid");
});

await run("paid invoice status does not duplicate or move back", async () => {
  const existingPayment = {
    paymentId: "INV-PAY-inv-4",
    invoiceId: "inv-4",
    amountReceived: 2000,
    meta: { invoiceId: "inv-4" },
  };
  let capturedUpdate = null;
  const provider = {
    referrals: {
      async updateById(id, update) {
        capturedUpdate = { id, update };
        return { id, ...update };
      },
    },
  };
  const referral = {
    id: "ref-4",
    ujustbeeInvoices: [
      {
        invoiceId: "inv-4",
        invoiceNumber: "UJB/2026-27/000004",
        baseAmount: 2000,
        gstAmount: 360,
        totalAmount: 2360,
        status: "Paid",
        totals: {
          taxableAmount: 2000,
          gstAmount: 360,
          totalAmount: 2360,
          amountPaid: 2360,
        },
      },
    ],
    payments: [existingPayment],
    ujbBalance: 2000,
  };

  await updateReferralInvoiceStatus({
    provider,
    referral,
    id: "ref-4",
    invoiceId: "inv-4",
    status: "Paid",
    paymentMode: "UPI",
    paymentReference: "UPI-123",
    paidAt: "2026-05-08",
    adminId: "admin@example.com",
  });

  assert.equal("payments" in capturedUpdate.update, false);
  assert.equal(capturedUpdate.update.ujustbeeInvoices[0].statusAuditLogs.length, 1);
  assert.equal(
    capturedUpdate.update.ujustbeeInvoices[0].statusAuditLogs[0].changedByAdminId,
    "admin@example.com"
  );

  await assert.rejects(
    () =>
      updateReferralInvoiceStatus({
        provider,
        referral,
        id: "ref-4",
        invoiceId: "inv-4",
        status: "Pending",
      }),
    /Paid invoices cannot be changed back/
  );
});

await run("referral status permissions allow the assigned participants", () => {
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

await run("accounts payments report separates fees, subscriptions, and unified history", () => {
  const users = [
    {
      id: "UJB001",
      UJBCode: "UJB001",
      Name: "Paid Orbiter",
      payment: {
        orbiter: {
          feeType: "upfront",
          status: "paid",
          paidDate: "2026-05-01",
          paymentMode: "UPI",
          paymentId: "ORB-FEE-1",
          amount: 5000,
        },
      },
    },
    {
      id: "UJB002",
      UJBCode: "UJB002",
      Name: "Adjustment Orbiter",
      payment: {
        orbiter: {
          feeType: "adjustment",
          status: "recovering",
          adjustmentRemaining: 1200,
          adjustmentLogs: [{ date: "2026-05-10", amount: 300, referralId: "ref-a" }],
        },
      },
    },
    {
      id: "COS001",
      UJBCode: "COS001",
      Name: "Cosmo User",
      payment: {
        cosmo: {
          status: "paid",
          paidDate: "2026-05-02",
          paymentMode: "Bank Transfer",
          paymentId: "COSMO-SUB-1",
          amount: 10000,
        },
      },
      subscription: {
        startDate: "2026-05-02",
        nextRenewalDate: "2026-07-01",
        approvedOn: "2026-05-03",
        status: "active",
      },
    },
    {
      id: "UJB003",
      UJBCode: "UJB003",
      Name: "Non Cosmo",
    },
  ];
  const referrals = [
    {
      id: "ref-1",
      referralId: "Ref/26-27/0001",
      orbiter: { ujbCode: "UJB001", name: "Paid Orbiter" },
      cosmoOrbiter: { ujbCode: "COS001", name: "Cosmo User" },
      payments: [
        {
          paymentId: "PAY-1",
          paymentDate: "2026-05-08",
          grossAmount: 2000,
          amountReceived: 2000,
          modeOfPayment: "UPI",
          transactionRef: "TXN-1",
          meta: { isCosmoToUjb: true },
        },
        {
          paymentId: "PAY-1",
          paymentDate: "2026-05-08",
          grossAmount: 2000,
          amountReceived: 2000,
          modeOfPayment: "UPI",
          transactionRef: "TXN-1",
          meta: { isCosmoToUjb: true },
        },
        {
          paymentId: "PAYOUT-1",
          paymentDate: "2026-05-09",
          amountReceived: 800,
          paymentTo: "Orbiter",
          paymentToName: "Paid Orbiter",
          meta: {
            isUjbPayout: true,
            recipientUjbCode: "UJB001",
            belongsToPaymentId: "PAY-1",
            logicalAmount: 800,
          },
        },
      ],
    },
  ];
  const walletHistory = [
    {
      id: "credit-release-1",
      user_id: "UJB001",
      txn_type: "credit",
      status: "paid",
      amount: 800,
      referral_id: "ref-1",
      created_at: "2026-05-09T10:00:00.000Z",
      meta: { slot: "Orbiter", idempotencyKey: "release-1" },
    },
    {
      id: "withdraw-1",
      user_id: "UJB001",
      txn_type: "debit",
      status: "paid",
      amount: 500,
      created_at: "2026-05-12T10:00:00.000Z",
      meta: { requestSource: "user_wallet", paymentMode: "UPI", transactionRef: "WDR-1" },
    },
  ];

  const report = buildAccountsPaymentsReport({
    users,
    referrals,
    walletHistory,
    now: new Date("2026-06-17T00:00:00.000Z"),
  });

  const upfront = report.orbiterFees.find((row) => row.userUjbCode === "UJB001");
  assert.equal(upfront.feeType, "upfront");
  assert.equal(upfront.feeStatus, "paid");
  assert.equal(upfront.transactionId, "ORB-FEE-1");
  assert.equal(report.summary.directOrbiterFeeCount, 1);
  assert.equal(report.summary.adjustmentFeeCount, 1);
  assert.equal(report.summary.orbiterFeeCount, 2);

  const adjustment = report.orbiterFees.find((row) => row.userUjbCode === "UJB002");
  assert.equal(adjustment.feeType, "adjustment");
  assert.equal(adjustment.adjustmentRemaining, 1200);
  assert.equal(report.adjustmentUsage.length, 1);
  assert.equal(report.adjustmentUsage[0].userUjbCode, "UJB002");
  assert.equal(report.adjustmentUsage.some((row) => row.relatedReferralId === "ref-a"), true);
  assert.equal(report.adjustmentUsage.some((row) => row.amount === 300), true);
  assert.equal(
    report.paymentHistory.some(
      (entry) =>
        entry.userUjbCode === "UJB002" &&
        entry.eventType === "orbiter_fee_adjustment" &&
        entry.direction === "incoming"
    ),
    false
  );

  const subscription = report.cosmoSubscriptions.find((row) => row.userUjbCode === "COS001");
  assert.equal(subscription.paymentStatus, "paid");
  assert.equal(subscription.derivedStatus, "due_soon");
  assert.equal(subscription.approvedOn, "2026-05-03");
  assert.equal(report.cosmoSubscriptions.some((row) => row.userUjbCode === "UJB003"), false);

  assert.equal(
    report.paymentHistory.filter((entry) => entry.eventType === "referral_collection").length,
    1
  );
  assert.equal(
    report.paymentHistory.some((entry) => entry.eventType === "ujb_wallet_release"),
    true
  );

  const withdrawal = report.paymentHistory.find((entry) => entry.eventType === "wallet_withdrawal");
  assert.equal(withdrawal.direction, "outbound");
  assert.equal(withdrawal.amount, 500);
  assert.equal(withdrawal.referenceId, "WDR-1");
});

await run("accounts payments report derives late subscription states", () => {
  const paid = { status: "paid" };
  assert.equal(
    deriveCosmoSubscriptionStatus(
      { startDate: "2026-01-01", nextRenewalDate: "2026-07-20", status: "active" },
      paid,
      new Date("2026-06-17T00:00:00.000Z")
    ),
    "active"
  );
  assert.equal(
    deriveCosmoSubscriptionStatus(
      { startDate: "2026-01-01", nextRenewalDate: "2026-06-10", status: "active" },
      paid,
      new Date("2026-06-17T00:00:00.000Z")
    ),
    "overdue"
  );
  assert.equal(
    deriveCosmoSubscriptionStatus(
      { startDate: "2026-01-01", nextRenewalDate: "2026-05-15", status: "active" },
      paid,
      new Date("2026-06-17T00:00:00.000Z")
    ),
    "expired"
  );
  assert.equal(
    deriveCosmoSubscriptionStatus(
      { startDate: "2026-01-01", status: "active" },
      paid,
      new Date("2026-06-17T00:00:00.000Z")
    ),
    "needs_review"
  );
});

await run("date inputs keep dd/mm/yy display with ISO storage", () => {
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

await run("festival campaigns always schedule at 6:00 AM IST", () => {
  assert.equal(festivalDateInIst("2026-10-20T00:30:00.000Z"), "2026-10-20");
  assert.equal(scheduleFestivalAtSixAmIst("2026-10-20"), "2026-10-20T00:30:00.000Z");
  assert.equal(scheduleFestivalAtSixAmIst("2026-10-20T19:30:00.000Z"), "2026-10-21T00:30:00.000Z");
  assert.equal(normalizeFestivalCampaignPayload({ eventName: "Diwali", scheduledAt: "2026-10-20T18:45", status: "draft" }).scheduledAt, "2026-10-20T00:30:00.000Z");
});

const failed = results.filter((result) => result.status === "failed");

console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

if (failed.length) {
  process.exitCode = 1;
}
