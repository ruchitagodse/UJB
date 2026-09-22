const SUBSCRIPTION_GRACE_DAYS = 15;
const SUBSCRIPTION_DUE_SOON_DAYS = 15;
const ORBITER_ADJUSTMENT_PAYABLE_AMOUNT = 1000;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundCurrency(value) {
  return Math.round(toNumber(value, 0) * 100) / 100;
}

function nonNegativeCurrency(value) {
  return Math.max(roundCurrency(value), 0);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function firstPresent(...values) {
  return values.find((value) => normalizeText(value)) || "";
}

function dateValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value?._seconds) return new Date(value._seconds * 1000).toISOString();
  if (value?.seconds) return new Date(value.seconds * 1000).toISOString();
  return normalizeText(value);
}

function dateMillis(value) {
  const parsed = new Date(dateValue(value) || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function userUjbCode(user) {
  return firstPresent(user?.UJBCode, user?.ujbCode, user?.id);
}

function userName(user) {
  return firstPresent(user?.Name, user?.name, user?.businessName, user?.BusinessName);
}

function buildUserIndex(users = []) {
  const index = new Map();
  users.forEach((user) => {
    const code = normalizeText(userUjbCode(user));
    if (code) {
      index.set(code.toLowerCase(), user);
    }
  });
  return index;
}

function getIndexedUser(index, code) {
  return index.get(normalizeText(code).toLowerCase()) || null;
}

function participantCode(participant, fallback = "") {
  return firstPresent(participant?.ujbCode, participant?.UJBCode, fallback);
}

function participantName(participant, fallback = "") {
  return firstPresent(participant?.name, participant?.Name, fallback);
}

function paymentAmount(payment) {
  return roundCurrency(
    payment?.meta?.logicalAmount ??
      payment?.amountReceived ??
      payment?.grossAmount ??
      payment?.amount ??
      0
  );
}

function paymentIdentity(payment, sourceModule, fallback = "") {
  return [
    sourceModule,
    payment?.paymentId,
    payment?.meta?.paymentId,
    payment?.meta?.invoiceId,
    payment?.transactionRef,
    payment?.paymentReference,
    payment?.id,
    fallback,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(":");
}

function isIgnoredAdjustmentLog(log) {
  return Boolean(log?.adjustmentIgnored || log?.ignoredFromAdjustmentUsage || log?.excludeFromAdjustmentUsage);
}

function addUniqueEvent(events, seen, event) {
  const identity = normalizeText(event.identity || event.referenceId || event.id);
  const key = identity || `${event.sourceModule}:${event.eventType}:${event.eventDate}:${event.amount}:${event.userUjbCode}:${event.relatedReferralId}`;
  if (seen.has(key)) return;
  seen.add(key);
  events.push({ ...event, id: key, identity: key });
}

function adjustmentRowPriority(row) {
  let priority = 0;
  if (normalizeLower(row.sourceModule) === "referral") priority += 20;
  if (
    normalizeText(row.relatedReferralDisplayId) &&
    normalizeText(row.relatedReferralDisplayId) !== normalizeText(row.relatedReferralId)
  ) {
    priority += 10;
  }
  if (row.hasExactRemaining) priority += 5;
  return priority;
}

function adjustmentBusinessKey(row) {
  return [
    "business",
    row.userUjbCode,
    row.relatedReferralDisplayId || row.relatedReferralId,
    row.amount,
    row.meta?.adjustedUserUjbCode,
    row.meta?.adjustedUserName,
  ]
    .map(normalizeText)
    .join(":")
    .toLowerCase();
}

function addUniqueAdjustmentUsage(adjustmentUsage, seenAdjustment, row) {
  const identityKey = normalizeText(row.id) || [
    row.sourceModule,
    row.userUjbCode,
    row.relatedReferralId,
    row.adjustmentDate,
    row.amount,
    row.referenceId,
  ].map(normalizeText).join(":");
  const businessKey = adjustmentBusinessKey(row);
  const keys = [identityKey, businessKey].filter(Boolean);
  const existingIndex = keys
    .map((key) => seenAdjustment.get(key))
    .find((index) => index !== undefined);

  const nextRow = { ...row, id: identityKey };
  if (existingIndex !== undefined) {
    const existingRow = adjustmentUsage[existingIndex];
    if (adjustmentRowPriority(nextRow) > adjustmentRowPriority(existingRow)) {
      adjustmentUsage[existingIndex] = nextRow;
      keys.forEach((key) => seenAdjustment.set(key, existingIndex));
      return true;
    }
    return false;
  }

  keys.forEach((key) => seenAdjustment.set(key, adjustmentUsage.length));
  adjustmentUsage.push(nextRow);
  return true;
}

function buildAdjustmentUsageRow({
  log = {},
  user = null,
  fallbackUserUjbCode = "",
  fallbackUserName = "",
  referral = null,
  amountValue,
  remainingValue,
  status = "recovering",
  sourceModule = "user_profile",
  fallbackReferenceId = "",
  fallbackRemainingValue,
}) {
  const relatedReferralId = firstPresent(
    log?.referralDocId,
    log?.relatedReferralId,
    log?.sourceReferralId,
    referral?.id
  );
  const relatedReferralDisplayId = firstPresent(
    log?.referralDisplayId,
    log?.referralId,
    log?.displayReferralId,
    log?.referralCode,
    referral?.referralId,
    relatedReferralId
  );
  const adjustedAmount = roundCurrency(
    amountValue ??
      log?.amount ??
      log?.adjustedAmount ??
      log?.usedAmount ??
      log?.deductedAmount ??
      log?.deducted
  );
  const adjustmentDate = dateValue(
    log?.date || log?.createdAt || log?.adjustedAt || log?.paymentDate
  );
  const code = firstPresent(log?.ujbCode, fallbackUserUjbCode, userUjbCode(user));
  const name = firstPresent(fallbackUserName, userName(user));
  const calculatedRemaining =
    log?.balanceDueBefore !== undefined
      ? roundCurrency(log.balanceDueBefore) - adjustedAmount
      : undefined;
  const isExcelAdjustmentLog =
    normalizeLower(log?.source) === "excel_adjustment_migration" ||
    normalizeLower(log?.type) === "registrationfeeadjustment";
  const remaining = nonNegativeCurrency(
    (isExcelAdjustmentLog ? calculatedRemaining : undefined) ??
      log?.newRemaining ??
      log?.newGlobalRemaining ??
      log?.remainingAfter ??
      calculatedRemaining ??
      remainingValue ??
      log?.adjustmentRemaining ??
      fallbackRemainingValue
  );
  const hasExactRemaining =
    log?.newRemaining !== undefined ||
    log?.newGlobalRemaining !== undefined ||
    log?.remainingAfter !== undefined ||
    remainingValue !== undefined ||
    calculatedRemaining !== undefined;
  const referenceId = firstPresent(
    log?.referenceId,
    log?.transactionId,
    log?.paymentId,
    fallbackReferenceId,
    relatedReferralId
  );
  const stableId = firstPresent(log?.id, log?.migrationId);
  const fallbackId = isExcelAdjustmentLog
    ? `excel-adjustment:${code}:${relatedReferralDisplayId || relatedReferralId || "na"}:${adjustedAmount}:${roundCurrency(log?.balanceDueBefore)}`
    : `adjustment:${sourceModule}:${code}:${relatedReferralId || relatedReferralDisplayId || "na"}:${adjustmentDate || "na"}:${adjustedAmount}:${referenceId || "na"}`;

  return {
    id: stableId || fallbackId,
    adjustmentDate,
    userUjbCode: code,
    userName: name,
    relatedReferralId,
    relatedReferralDisplayId,
    amount: adjustedAmount,
    status,
    adjustmentRemaining: remaining,
    hasExactRemaining,
    sourceModule,
    referenceId,
    notes: log?.note || log?.notes || log?.reason || "Orbiter fee adjustment usage",
    meta: log?.meta || {},
  };
}

export function deriveCosmoSubscriptionStatus(subscription = {}, cosmoPayment = {}, now = new Date()) {
  const storedStatus = normalizeLower(subscription?.status);
  const paid = normalizeLower(cosmoPayment?.status) === "paid";
  const startDate = dateValue(subscription?.startDate);
  const renewalDate = dateValue(subscription?.nextRenewalDate);

  if (storedStatus === "suspended") return "suspended";
  if (!paid && !startDate && !renewalDate) return "not_started";
  if (startDate && !renewalDate) return "needs_review";
  if (!paid && (startDate || renewalDate)) return "unpaid";

  const renewalMs = dateMillis(renewalDate);
  if (!renewalMs) return paid ? "needs_review" : "unpaid";

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const renewalStart = new Date(renewalMs);
  renewalStart.setHours(0, 0, 0, 0);
  const daysUntilRenewal = Math.ceil(
    (renewalStart.getTime() - todayStart.getTime()) / 86400000
  );

  if (daysUntilRenewal < -SUBSCRIPTION_GRACE_DAYS) return "expired";
  if (daysUntilRenewal < 0) return "overdue";
  if (daysUntilRenewal <= SUBSCRIPTION_DUE_SOON_DAYS) return "due_soon";
  return "active";
}

function buildOrbiterFees(users, events, seen, adjustmentUsage, seenAdjustment) {
  return users
    .map((user) => {
      const orbiterPayment = user?.payment?.orbiter || {};
      const feeType = normalizeLower(orbiterPayment?.feeType);
      const hasFee =
        feeType ||
        normalizeText(orbiterPayment?.status) ||
        normalizeText(orbiterPayment?.paidDate) ||
        toNumber(orbiterPayment?.adjustmentRemaining, 0) > 0;

      if (!hasFee) return null;

      const row = {
        userUjbCode: userUjbCode(user),
        userName: userName(user),
        feeType: feeType || "unknown",
        feeStatus: orbiterPayment?.status || "",
        paidDate: dateValue(orbiterPayment?.paidDate),
        paymentMode: orbiterPayment?.paymentMode || "",
        transactionId: orbiterPayment?.paymentId || "",
        adjustmentRemaining: roundCurrency(orbiterPayment?.adjustmentRemaining),
        adjustmentCompleted: Boolean(orbiterPayment?.adjustmentCompleted),
        adjustmentLogs: toArray(orbiterPayment?.adjustmentLogs),
        screenshotUrl: firstPresent(
          orbiterPayment?.screenshotURL,
          orbiterPayment?.screenshotPreview
        ),
      };

      const isAdjustment = feeType === "adjustment";
      addUniqueEvent(events, seen, {
        identity: paymentIdentity(
          {
            paymentId: row.transactionId,
            transactionRef: row.transactionId,
          },
          "user_profile",
          `orbiter-${row.userUjbCode}-${feeType}`
        ),
        eventType: isAdjustment ? "orbiter_fee_adjustment" : "orbiter_fee_upfront",
        eventDate: row.paidDate || row.adjustmentLogs[0]?.date || "",
        userUjbCode: row.userUjbCode,
        userName: row.userName,
        relatedReferralId: "",
        amount: isAdjustment ? 0 : roundCurrency(orbiterPayment?.amount || orbiterPayment?.feeAmount),
        direction: isAdjustment ? "adjustment" : "incoming",
        status: row.feeStatus,
        paymentMode: row.paymentMode,
        referenceId: row.transactionId,
        sourceModule: "user_profile",
        screenshotUrl: row.screenshotUrl,
        notes: isAdjustment
          ? `Adjustment balance remaining Rs. ${row.adjustmentRemaining}`
          : "Orbiter one-time fee",
        meta: { feeType: row.feeType },
      });

      row.adjustmentLogs.forEach((log, index) => {
        if (isIgnoredAdjustmentLog(log)) return;
        const adjustmentRow = buildAdjustmentUsageRow({
          log,
          fallbackUserUjbCode: row.userUjbCode,
          fallbackUserName: row.userName,
          fallbackRemainingValue: row.adjustmentRemaining,
          status: row.adjustmentCompleted ? "completed" : "recovering",
          sourceModule: firstPresent(log?.sourceModule, log?.source, "user_profile"),
          fallbackReferenceId: row.transactionId || `profile-log-${index}`,
        });

        addUniqueAdjustmentUsage(adjustmentUsage, seenAdjustment, adjustmentRow);
        addUniqueEvent(events, seen, {
          identity: adjustmentRow.id,
          eventType: "orbiter_fee_adjustment",
          eventDate: adjustmentRow.adjustmentDate,
          userUjbCode: row.userUjbCode,
          userName: row.userName,
          relatedReferralId: adjustmentRow.relatedReferralId,
          relatedReferralDisplayId: adjustmentRow.relatedReferralDisplayId,
          amount: adjustmentRow.amount,
          direction: "adjustment",
          status: adjustmentRow.status,
          paymentMode: "Adjustment",
          referenceId: adjustmentRow.referenceId,
          sourceModule: adjustmentRow.sourceModule,
          screenshotUrl: "",
          notes: adjustmentRow.notes,
          meta: {
            ...adjustmentRow.meta,
            feeType: row.feeType,
            adjustmentRemaining: row.adjustmentRemaining,
          },
        });
      });

      return row;
    })
    .filter(Boolean);
}

function buildCosmoSubscriptions(users, events, seen, now) {
  return users
    .map((user) => {
      const cosmoPayment = user?.payment?.cosmo || {};
      const subscription = user?.subscription || {};
      const hasValidSubscription =
        normalizeLower(cosmoPayment?.status) === "paid" ||
        normalizeText(subscription?.startDate) ||
        normalizeText(subscription?.nextRenewalDate) ||
        normalizeText(subscription?.status);

      if (!hasValidSubscription) return null;

      const derivedStatus = deriveCosmoSubscriptionStatus(subscription, cosmoPayment, now);
      const row = {
        userUjbCode: userUjbCode(user),
        userName: userName(user),
        paymentStatus: cosmoPayment?.status || "",
        paidDate: dateValue(cosmoPayment?.paidDate),
        paymentMode: cosmoPayment?.paymentMode || "",
        transactionId: cosmoPayment?.paymentId || "",
        subscriptionStart: dateValue(subscription?.startDate),
        renewalDue: dateValue(subscription?.nextRenewalDate),
        approvedOn: dateValue(subscription?.approvedOn),
        storedStatus: subscription?.status || "",
        derivedStatus,
        screenshotUrl: firstPresent(
          cosmoPayment?.screenshotURL,
          cosmoPayment?.screenshotPreview
        ),
      };

      if (normalizeLower(cosmoPayment?.status) === "paid") {
        addUniqueEvent(events, seen, {
          identity: paymentIdentity(
            { paymentId: row.transactionId, transactionRef: row.transactionId },
            "user_profile",
            `cosmo-${row.userUjbCode}`
          ),
          eventType: "cosmo_subscription",
          eventDate: row.paidDate || row.subscriptionStart,
          userUjbCode: row.userUjbCode,
          userName: row.userName,
          relatedReferralId: "",
          amount: roundCurrency(cosmoPayment?.amount || cosmoPayment?.feeAmount),
          direction: "incoming",
          status: row.paymentStatus,
          paymentMode: row.paymentMode,
          referenceId: row.transactionId,
          sourceModule: "user_profile",
          screenshotUrl: row.screenshotUrl,
          notes: `Subscription ${derivedStatus}`,
          meta: { derivedStatus, renewalDue: row.renewalDue },
        });
      }

      return row;
    })
    .filter(Boolean);
}

function buildReferralAdjustmentUsage({
  referral,
  payment = null,
  adjustment = null,
  adjustmentUsage,
  seenAdjustment,
  userIndex,
  events,
  seen,
}) {
  const sourceLog = adjustment?.logEntry || adjustment || {};
  if (isIgnoredAdjustmentLog(sourceLog)) return;
  const amount = adjustment?.deducted ?? sourceLog?.deducted;
  if (roundCurrency(amount) <= 0) return;

  const referralOrbiterCode = firstPresent(
    referral?.orbiter?.ujbCode,
    referral?.orbiter?.UJBCode,
    referral?.orbiterUJBCode
  );
  const referralOrbiterName = participantName(referral?.orbiter);
  const fallbackCode = firstPresent(
    referralOrbiterCode,
    sourceLog?.ujbCode,
    payment?.meta?.recipientUjbCode
  );
  const user = getIndexedUser(userIndex, fallbackCode);
  const displayLog = {
    ...sourceLog,
    adjustedUserUjbCode: sourceLog?.adjustedUserUjbCode || sourceLog?.ujbCode,
    adjustedUserName: sourceLog?.adjustedUserName || sourceLog?.person,
    ujbCode: fallbackCode,
    meta: {
      ...(sourceLog?.meta || {}),
      adjustedUserUjbCode: sourceLog?.adjustedUserUjbCode || sourceLog?.ujbCode,
      adjustedUserName: sourceLog?.adjustedUserName || sourceLog?.person,
    },
  };
  const row = buildAdjustmentUsageRow({
    log: displayLog,
    user,
    fallbackUserUjbCode: fallbackCode,
    fallbackUserName: referralOrbiterName,
    referral,
    amountValue: amount,
    remainingValue: adjustment?.newGlobalRemaining ?? sourceLog?.newRemaining,
    status: "applied",
    sourceModule: "referral",
    fallbackReferenceId: payment?.paymentId || payment?.transactionRef || "",
  });

  if (!addUniqueAdjustmentUsage(adjustmentUsage, seenAdjustment, row)) return;

  addUniqueEvent(events, seen, {
    identity: row.id,
    eventType: "orbiter_fee_adjustment",
    eventDate: row.adjustmentDate,
    userUjbCode: row.userUjbCode,
    userName: row.userName,
    relatedReferralId: row.relatedReferralId,
    relatedReferralDisplayId: row.relatedReferralDisplayId,
    amount: row.amount,
    direction: "adjustment",
    status: row.status,
    paymentMode: "Adjustment",
    referenceId: row.referenceId,
    sourceModule: row.sourceModule,
    screenshotUrl: "",
    notes: row.notes,
    meta: row.meta,
  });
}

function buildReferralEvents(referrals, events, seen, adjustmentUsage, seenAdjustment, userIndex) {
  referrals.forEach((referral) => {
    const referralDocId = referral?.id || "";
    const referralDisplayId = referral?.referralId || referralDocId;
    const orbiter = referral?.orbiter || {};
    const cosmo = referral?.cosmoOrbiter || {};

    toArray(referral?.payments).forEach((payment, index) => {
      const meta = payment?.meta || {};
      if (meta?.adjustment?.deducted || meta?.adjustment?.logEntry?.deducted) {
        buildReferralAdjustmentUsage({
          referral,
          payment,
          adjustment: meta.adjustment,
          adjustmentUsage,
          seenAdjustment,
          userIndex,
          events,
          seen,
        });
      }
      const isCollection = Boolean(meta?.isCosmoToUjb);
      const isPayout = Boolean(meta?.isUjbPayout);
      if (!isCollection && !isPayout) return;

      const code = isPayout
        ? firstPresent(meta?.recipientUjbCode, participantCode(orbiter))
        : participantCode(cosmo, referral?.cosmoUjbCode);
      const name = isPayout
        ? firstPresent(payment?.paymentToName, participantName(orbiter))
        : participantName(cosmo, referral?.cosmoName);

      addUniqueEvent(events, seen, {
        identity: paymentIdentity(payment, "referral", `${referralDocId}-${index}`),
        eventType: isPayout ? "ujb_wallet_release" : "referral_collection",
        eventDate: dateValue(payment?.paymentDate || payment?.createdAt),
        userUjbCode: code,
        userName: name,
        relatedReferralId: referralDocId,
        relatedReferralDisplayId: referralDisplayId,
        amount: paymentAmount(payment),
        direction: isPayout ? "outbound" : "incoming",
        status: payment?.status || "paid",
        paymentMode: firstPresent(payment?.modeOfPayment, payment?.paymentMode),
        referenceId: firstPresent(payment?.transactionRef, payment?.paymentId),
        sourceModule: "referral",
        screenshotUrl: firstPresent(payment?.screenshotUrl, payment?.screenshotURL),
        notes: isPayout ? payment?.paymentTo || "UJustBe payout release" : "CosmOrbiter to UJustBe collection",
        meta,
      });
    });

    toArray(referral?.adjustmentLogs).forEach((log) => {
      buildReferralAdjustmentUsage({
        referral,
        adjustment: log,
        adjustmentUsage,
        seenAdjustment,
        userIndex,
        events,
        seen,
      });
    });

    toArray(referral?.ujustbeeInvoices).forEach((invoice) => {
      if (normalizeLower(invoice?.status) !== "paid") return;
      const payment = invoice?.accountPayment || {};
      addUniqueEvent(events, seen, {
        identity: `invoice:${invoice?.invoiceId || invoice?.invoiceNumber || referralDocId}`,
        eventType: "invoice_payment",
        eventDate: dateValue(payment?.paidAt || invoice?.updatedAt || invoice?.issuedAt),
        userUjbCode: invoice?.billedTo?.ujbCode || participantCode(cosmo),
        userName: invoice?.billedTo?.businessName || invoice?.billedTo?.name || participantName(cosmo),
        relatedReferralId: referralDocId,
        relatedReferralDisplayId: referralDisplayId,
        amount: roundCurrency(invoice?.totalAmount || invoice?.totals?.totalAmount),
        direction: "incoming",
        status: invoice?.status,
        paymentMode: payment?.paymentMode || "",
        referenceId: firstPresent(payment?.paymentReference, invoice?.invoiceNumber, invoice?.invoiceId),
        sourceModule: "invoice",
        screenshotUrl: "",
        notes: "Invoice payment",
        meta: { invoiceId: invoice?.invoiceId, invoiceNumber: invoice?.invoiceNumber },
      });
    });
  });
}

function buildWalletEvents(walletHistory, events, seen, userIndex) {
  toArray(walletHistory).forEach((entry, index) => {
    const txnType = normalizeLower(entry?.txn_type);
    if (txnType !== "credit" && txnType !== "debit") return;

    const user = getIndexedUser(userIndex, entry?.user_id);
    const eventType = txnType === "debit" ? "wallet_withdrawal" : "wallet_credit";
    const meta = entry?.meta || {};
    const referenceId = firstPresent(
      meta?.transactionRef,
      meta?.idempotencyKey,
      entry?.uuid,
      entry?.id
    );

    addUniqueEvent(events, seen, {
      identity: `wallet:${entry?.id || entry?.uuid || index}`,
      eventType,
      eventDate: dateValue(meta?.paidAt || entry?.created_at),
      userUjbCode: entry?.user_id || userUjbCode(user),
      userName: userName(user),
      relatedReferralId: entry?.referral_id || "",
      amount: roundCurrency(entry?.amount),
      direction: txnType === "debit" ? "outbound" : "credit",
      status: entry?.status || "",
      paymentMode: firstPresent(meta?.paymentMode, txnType === "credit" ? "Wallet credit" : ""),
      referenceId,
      sourceModule: "wallet",
      screenshotUrl: "",
      notes: entry?.note || "",
      meta,
    });
  });
}

function buildSummary(orbiterFees, cosmoSubscriptions, paymentHistory) {
  const directOrbiterFeeCount = orbiterFees.filter(
    (row) => row.feeType !== "adjustment"
  ).length;
  const adjustmentFeeCount = orbiterFees.filter(
    (row) => row.feeType === "adjustment"
  ).length;
  const adjustmentFeeRows = orbiterFees.filter((row) => row.feeType === "adjustment");
  const adjustedFeeCount = adjustmentFeeRows.filter(
    (row) => row.adjustmentCompleted || roundCurrency(row.adjustmentRemaining) <= 0
  ).length;
  const pendingAdjustmentFeeCount = adjustmentFeeRows.filter(
    (row) => !row.adjustmentCompleted && roundCurrency(row.adjustmentRemaining) > 0
  ).length;
  const pendingAdjustmentBalance = adjustmentFeeRows.reduce((total, row) => {
    const remaining = roundCurrency(row.adjustmentRemaining);
    return remaining > 0 ? roundCurrency(total + remaining) : total;
  }, 0);
  const extraAdjustmentRows = adjustmentFeeRows.filter((row) => {
    const rawApplied = roundCurrency(row.rawAdjustmentAppliedAmount ?? row.adjustmentAppliedAmount);
    return rawApplied > ORBITER_ADJUSTMENT_PAYABLE_AMOUNT;
  });
  const extraAdjustmentUserCount = extraAdjustmentRows.length;
  const extraAdjustmentAmount = extraAdjustmentRows.reduce((total, row) => {
    const rawApplied = roundCurrency(row.rawAdjustmentAppliedAmount ?? row.adjustmentAppliedAmount);
    return roundCurrency(total + Math.max(rawApplied - ORBITER_ADJUSTMENT_PAYABLE_AMOUNT, 0));
  }, 0);

  return paymentHistory.reduce(
    (summary, event) => {
      summary.totalEvents += 1;
      if (event.direction === "incoming") {
        summary.totalIncoming += roundCurrency(event.amount);
      }
      if (event.direction === "outbound") {
        summary.totalOutbound += roundCurrency(event.amount);
      }
      if (event.direction === "credit") {
        summary.totalWalletCredits += roundCurrency(event.amount);
      }
      if (event.direction === "adjustment") {
        summary.totalAdjustmentUsage += roundCurrency(event.amount);
      }
      return summary;
    },
    {
      orbiterFeeCount: orbiterFees.length,
      directOrbiterFeeCount,
      upfrontOrbiterFeeCount: directOrbiterFeeCount,
      adjustmentFeeCount,
      adjustedFeeCount,
      pendingAdjustmentFeeCount,
      pendingAdjustmentBalance,
      extraAdjustmentUserCount,
      extraAdjustmentAmount,
      subscriptionCount: cosmoSubscriptions.length,
      activeSubscriptionCount: cosmoSubscriptions.filter((row) =>
        ["active", "due_soon"].includes(row.derivedStatus)
      ).length,
      totalEvents: 0,
      totalIncoming: 0,
      totalOutbound: 0,
      totalWalletCredits: 0,
      totalAdjustmentUsage: 0,
    }
  );
}

function totalAdjustmentAmount(rows = []) {
  return rows.reduce((total, row) => {
    const amount = roundCurrency(row.amount);
    return amount > 0 ? roundCurrency(total + amount) : total;
  }, 0);
}

function totalRawAdjustmentAmount(rows = []) {
  return rows.reduce((total, row) => {
    const amount = roundCurrency(row.meta?.rawAdjustmentAmount ?? row.amount);
    return amount > 0 ? roundCurrency(total + amount) : total;
  }, 0);
}

function enrichOrbiterFeesWithAdjustmentUsage(orbiterFees, adjustmentUsage) {
  const usageByCode = new Map();
  adjustmentUsage.forEach((row) => {
    const code = normalizeText(row.userUjbCode);
    if (!code) return;
    if (!usageByCode.has(code)) usageByCode.set(code, []);
    usageByCode.get(code).push(row);
  });

  const seenCodes = new Set();
  const enrichedRows = orbiterFees.map((row) => {
    seenCodes.add(normalizeText(row.userUjbCode));
    const usageRows = usageByCode.get(normalizeText(row.userUjbCode)) || [];
    if (!usageRows.length) return row;

    const rawAppliedAmount = totalRawAdjustmentAmount(usageRows);
    const appliedAmount = Math.min(totalAdjustmentAmount(usageRows), ORBITER_ADJUSTMENT_PAYABLE_AMOUNT);
    const adjustmentRemaining = Math.max(
      roundCurrency(ORBITER_ADJUSTMENT_PAYABLE_AMOUNT - appliedAmount),
      0
    );
    const adjustmentCompleted =
      Boolean(row.adjustmentCompleted) || adjustmentRemaining <= 0;

    return {
      ...row,
      feeType: "adjustment",
      feeStatus: adjustmentCompleted ? "completed" : "recovering",
      adjustmentRemaining,
      adjustmentCompleted,
      adjustmentAppliedAmount: appliedAmount,
      rawAdjustmentAppliedAmount: rawAppliedAmount,
    };
  });

  usageByCode.forEach((usageRows, code) => {
    if (seenCodes.has(code)) return;
    const firstUsage = usageRows[0] || {};
    const rawAppliedAmount = totalRawAdjustmentAmount(usageRows);
    const appliedAmount = Math.min(totalAdjustmentAmount(usageRows), ORBITER_ADJUSTMENT_PAYABLE_AMOUNT);
    const adjustmentRemaining = Math.max(
      roundCurrency(ORBITER_ADJUSTMENT_PAYABLE_AMOUNT - appliedAmount),
      0
    );
    const adjustmentCompleted = adjustmentRemaining <= 0;
    enrichedRows.push({
      userUjbCode: code,
      userName: firstUsage.userName || "",
      feeType: "adjustment",
      feeStatus: adjustmentCompleted ? "completed" : "recovering",
      paidDate: "",
      paymentMode: "",
      transactionId: "",
      adjustmentRemaining,
      adjustmentCompleted,
      adjustmentLogs: [],
      screenshotUrl: "",
      adjustmentAppliedAmount: appliedAmount,
      rawAdjustmentAppliedAmount: rawAppliedAmount,
    });
  });

  return enrichedRows;
}

function enrichAdjustmentUsageWithRunningBalance(adjustmentUsage) {
  const byCode = new Map();
  adjustmentUsage.forEach((row, index) => {
    const code = normalizeText(row.userUjbCode);
    if (!code) return;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push({ row, index });
  });

  byCode.forEach((items) => {
    let remaining = ORBITER_ADJUSTMENT_PAYABLE_AMOUNT;
    items
      .sort((a, b) => {
        const dateDiff = dateMillis(a.row.adjustmentDate) - dateMillis(b.row.adjustmentDate);
        return dateDiff || a.index - b.index;
      })
      .forEach(({ row }) => {
        const originalAmount = roundCurrency(row.amount);
        const appliedAmount = Math.min(originalAmount, remaining);
        remaining = Math.max(roundCurrency(remaining - appliedAmount), 0);
        row.meta = {
          ...(row.meta || {}),
          rawAdjustmentAmount: originalAmount,
          sourceAdjustmentRemaining: row.adjustmentRemaining,
        };
        row.amount = appliedAmount;
        row.adjustmentRemaining = remaining;
        row.hasExactRemaining = true;
      });
  });

  return adjustmentUsage.filter((row) => roundCurrency(row.amount) > 0);
}

export function buildAccountsPaymentsReport({
  users = [],
  referrals = [],
  walletHistory = [],
  now = new Date(),
} = {}) {
  const events = [];
  const seen = new Set();
  const adjustmentUsage = [];
  const seenAdjustment = new Map();
  const userIndex = buildUserIndex(users);

  let orbiterFees = buildOrbiterFees(users, events, seen, adjustmentUsage, seenAdjustment);
  const cosmoSubscriptions = buildCosmoSubscriptions(users, events, seen, now);
  buildReferralEvents(referrals, events, seen, adjustmentUsage, seenAdjustment, userIndex);
  buildWalletEvents(walletHistory, events, seen, userIndex);
  const enrichedAdjustmentUsage = enrichAdjustmentUsageWithRunningBalance(adjustmentUsage);
  orbiterFees = enrichOrbiterFeesWithAdjustmentUsage(orbiterFees, adjustmentUsage);

  const paymentHistory = events.sort((a, b) => dateMillis(b.eventDate) - dateMillis(a.eventDate));
  enrichedAdjustmentUsage.sort((a, b) => dateMillis(b.adjustmentDate) - dateMillis(a.adjustmentDate));

  return {
    summary: buildSummary(orbiterFees, cosmoSubscriptions, paymentHistory),
    orbiterFees,
    adjustmentUsage: enrichedAdjustmentUsage,
    cosmoSubscriptions,
    paymentHistory,
  };
}
