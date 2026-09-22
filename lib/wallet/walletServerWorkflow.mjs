import { adminDb } from "@/lib/firebase/firebaseAdmin";

export const WALLET_COLLECTION = "wallet";
export const WALLET_HISTORY_COLLECTION = "wallet_history";
const WALLET_HISTORY_PAGE_SIZE = 1000;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUserId(value) {
  return String(value || "").trim();
}

function makeSafeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 240);
}

function nowIso() {
  return new Date().toISOString();
}

function toDateOnly(value) {
  return String(value || "").split("T")[0];
}

function walletRefForUser(db, userId) {
  return db.collection(WALLET_COLLECTION).doc(userId);
}

function getRecipientUserIdFromReferral(referral, recipient, explicitUserId = "") {
  const explicit = normalizeUserId(explicitUserId);
  if (explicit) {
    return explicit;
  }

  const nextRecipient = String(recipient || "").trim();

  if (nextRecipient === "Orbiter") {
    return normalizeUserId(
      referral?.orbiter?.ujbCode || referral?.orbiter?.UJBCode || referral?.orbiterUJBCode
    );
  }

  if (nextRecipient === "OrbiterMentor") {
    return normalizeUserId(
      referral?.orbiter?.mentorUJBCode || referral?.orbiterMentorUJBCode
    );
  }

  if (nextRecipient === "CosmoMentor") {
    return normalizeUserId(
      referral?.cosmoOrbiter?.mentorUJBCode || referral?.cosmoMentorUJBCode
    );
  }

  return "";
}

export function buildWalletCreditIdempotencyKey({
  referralId,
  cosmoPaymentId,
  recipient,
  amount,
}) {
  return makeSafeId(
    `release_${referralId || "na"}_${cosmoPaymentId || "na"}_${recipient || "na"}_${Math.round(
      toNumber(amount, 0) * 100
    )}`
  );
}

export async function creditWalletForReferralRelease({
  db = adminDb,
  referralId,
  referral,
  recipient,
  amount,
  cosmoPaymentId,
  recipientUserId = "",
  note = "",
  processedBy = "",
}) {
  if (!db) {
    const error = new Error("Wallet storage is not configured.");
    error.status = 500;
    throw error;
  }

  const userId = getRecipientUserIdFromReferral(referral, recipient, recipientUserId);
  if (!userId) {
    const error = new Error("Recipient user not found for wallet credit.");
    error.status = 422;
    throw error;
  }

  const creditAmount = Math.max(0, toNumber(amount, 0));
  if (creditAmount <= 0) {
    const error = new Error("Wallet credit amount must be greater than zero.");
    error.status = 422;
    throw error;
  }

  const idempotencyKey = buildWalletCreditIdempotencyKey({
    referralId,
    cosmoPaymentId,
    recipient,
    amount: creditAmount,
  });
  const historyId = `credit_${idempotencyKey}`;
  const historyRef = db.collection(WALLET_HISTORY_COLLECTION).doc(historyId);
  const walletRef = walletRefForUser(db, userId);
  const createdAt = nowIso();
  const depositDate = toDateOnly(createdAt);

  const result = await db.runTransaction(async (transaction) => {
    const existingHistorySnap = await transaction.get(historyRef);
    if (existingHistorySnap.exists) {
      return {
        status: "already_processed",
        userId,
        historyId,
        idempotencyKey,
      };
    }

    const walletSnap = await transaction.get(walletRef);
    const walletData = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentAmount = toNumber(walletData.amount, 0);
    const nextAmount = Math.round((currentAmount + creditAmount) * 100) / 100;

    transaction.set(
      walletRef,
      {
        user_id: userId,
        amount: nextAmount,
        created_at: walletData.created_at || createdAt,
        updated_at: createdAt,
      },
      { merge: true }
    );

    transaction.set(historyRef, {
      uuid: historyId,
      user_id: userId,
      type: "other",
      referral_id: referralId || "",
      note:
        note ||
        `UJustBe Reciprocation for Referral ${referral?.referralId || referralId || ""} at ${depositDate}`,
      amount: creditAmount,
      txn_type: "credit",
      status: "paid",
      created_at: createdAt,
      meta: {
        slot: recipient || "",
        cosmoPaymentId: cosmoPaymentId || "",
        releaseSource: "manual_release",
        idempotencyKey,
        processedBy: String(processedBy || "").trim(),
      },
    });

    return {
      status: "credited",
      userId,
      historyId,
      idempotencyKey,
      amount: creditAmount,
      balance: nextAmount,
    };
  });

  return result;
}

export async function getUserWalletSnapshot({ db = adminDb, userId }) {
  if (!db) {
    const error = new Error("Wallet storage is not configured.");
    error.status = 500;
    throw error;
  }

  const nextUserId = normalizeUserId(userId);
  if (!nextUserId) {
    const error = new Error("Missing wallet user.");
    error.status = 422;
    throw error;
  }

  const walletSnap = await walletRefForUser(db, nextUserId).get();
  const wallet = walletSnap.exists ? walletSnap.data() || {} : {};

  const historySnap = await db
    .collection(WALLET_HISTORY_COLLECTION)
    .where("user_id", "==", nextUserId)
    .limit(200)
    .get();

  const history = historySnap.docs
    .map((doc) => ({ ...(doc.data() || {}), id: doc.id }))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return {
    wallet: {
      user_id: nextUserId,
      amount: toNumber(wallet.amount, 0),
      created_at: wallet.created_at || "",
      updated_at: wallet.updated_at || "",
    },
    history,
  };
}

export async function createWalletWithdrawalRequest({
  db = adminDb,
  userId,
  amount,
  note = "",
}) {
  if (!db) {
    const error = new Error("Wallet storage is not configured.");
    error.status = 500;
    throw error;
  }

  const nextUserId = normalizeUserId(userId);
  const nextAmount = Math.max(0, toNumber(amount, 0));

  if (!nextUserId) {
    const error = new Error("Missing wallet user.");
    error.status = 422;
    throw error;
  }

  if (nextAmount <= 0) {
    const error = new Error("Withdrawal amount must be greater than zero.");
    error.status = 422;
    throw error;
  }

  const walletSnap = await walletRefForUser(db, nextUserId).get();
  const available = toNumber(walletSnap.exists ? walletSnap.data()?.amount : 0, 0);

  if (available < nextAmount) {
    const error = new Error("Insufficient wallet balance.");
    error.status = 422;
    throw error;
  }

  const historyRef = db.collection(WALLET_HISTORY_COLLECTION).doc();
  const createdAt = nowIso();
  const withdrawDate = toDateOnly(createdAt);

  await historyRef.set({
    uuid: historyRef.id,
    user_id: nextUserId,
    type: "self",
    referral_id: "",
    note: note || `Wallet Withdrawal at ${withdrawDate}`,
    amount: nextAmount,
    txn_type: "debit",
    status: "pending",
    created_at: createdAt,
    meta: {
      requestSource: "user_wallet",
    },
  });

  return {
    requestId: historyRef.id,
    status: "pending",
  };
}

export async function markWalletWithdrawalPaid({
  db = adminDb,
  requestId,
  processedBy = "",
  paymentMode = "",
  transactionRef = "",
  paidAt = "",
}) {
  if (!db) {
    const error = new Error("Wallet storage is not configured.");
    error.status = 500;
    throw error;
  }

  const nextRequestId = normalizeUserId(requestId);
  if (!nextRequestId) {
    const error = new Error("Missing withdrawal request id.");
    error.status = 422;
    throw error;
  }

  const historyRef = db.collection(WALLET_HISTORY_COLLECTION).doc(nextRequestId);
  const updatedAt = nowIso();
  const nextPaymentMode = String(paymentMode || "").trim();
  const nextTransactionRef = String(transactionRef || "").trim();
  const nextPaidAt = String(paidAt || "").trim() || updatedAt.split("T")[0];

  if (!nextPaymentMode) {
    const error = new Error("Payment mode is required.");
    error.status = 422;
    throw error;
  }

  if (!nextTransactionRef) {
    const error = new Error("Transaction reference is required.");
    error.status = 422;
    throw error;
  }

  return db.runTransaction(async (transaction) => {
    const historySnap = await transaction.get(historyRef);
    if (!historySnap.exists) {
      const error = new Error("Withdrawal request not found.");
      error.status = 404;
      throw error;
    }

    const history = historySnap.data() || {};
    if (history.txn_type !== "debit") {
      const error = new Error("Only debit requests can be processed.");
      error.status = 422;
      throw error;
    }

    const requestSource = String(history?.meta?.requestSource || "").trim();
    const historyType = String(history?.type || "").trim().toLowerCase();
    const isUserWithdrawal = requestSource === "user_wallet" || historyType === "self";
    if (!isUserWithdrawal) {
      const error = new Error("Only user withdrawal requests can be marked paid.");
      error.status = 422;
      throw error;
    }

    if (history.status === "paid") {
      return {
        requestId: nextRequestId,
        status: "already_paid",
      };
    }

    if (history.status !== "pending") {
      const error = new Error("Only pending requests can be marked paid.");
      error.status = 422;
      throw error;
    }

    const userId = normalizeUserId(history.user_id);
    const walletRef = walletRefForUser(db, userId);
    const walletSnap = await transaction.get(walletRef);
    const wallet = walletSnap.exists ? walletSnap.data() || {} : {};
    const currentAmount = toNumber(wallet.amount, 0);
    const debitAmount = Math.max(0, toNumber(history.amount, 0));

    if (debitAmount <= 0) {
      const error = new Error("Invalid debit amount.");
      error.status = 422;
      throw error;
    }

    if (currentAmount < debitAmount) {
      const error = new Error("Insufficient wallet balance to mark paid.");
      error.status = 422;
      throw error;
    }

    const nextAmount = Math.round((currentAmount - debitAmount) * 100) / 100;

    transaction.set(
      walletRef,
      {
        user_id: userId,
        amount: nextAmount,
        created_at: wallet.created_at || updatedAt,
        updated_at: updatedAt,
      },
      { merge: true }
    );

    transaction.set(
      historyRef,
      {
        status: "paid",
        meta: {
          ...(history.meta || {}),
          processedBy: String(processedBy || "").trim(),
          processedAt: updatedAt,
          paymentMode: nextPaymentMode,
          transactionRef: nextTransactionRef,
          paidAt: nextPaidAt,
        },
      },
      { merge: true }
    );

    return {
      requestId: nextRequestId,
      userId,
      status: "paid",
      amount: debitAmount,
      balance: nextAmount,
    };
  });
}

export async function listWalletLedger({ db = adminDb }) {
  if (!db) {
    const error = new Error("Wallet storage is not configured.");
    error.status = 500;
    throw error;
  }

  const [walletSnap, history] = await Promise.all([
    db.collection(WALLET_COLLECTION).get(),
    (async () => {
      const allHistory = [];
      let query = db
        .collection(WALLET_HISTORY_COLLECTION)
        .orderBy("__name__")
        .limit(WALLET_HISTORY_PAGE_SIZE);

      while (true) {
        const snap = await query.get();
        if (snap.empty) break;

        allHistory.push(
          ...snap.docs.map((doc) => ({ ...(doc.data() || {}), id: doc.id }))
        );

        if (snap.size < WALLET_HISTORY_PAGE_SIZE) break;
        query = db
          .collection(WALLET_HISTORY_COLLECTION)
          .orderBy("__name__")
          .startAfter(snap.docs[snap.docs.length - 1])
          .limit(WALLET_HISTORY_PAGE_SIZE);
      }

      return allHistory;
    })(),
  ]);

  const wallets = walletSnap.docs
    .map((doc) => ({ ...(doc.data() || {}), id: doc.id }))
    .sort((a, b) => String(a.user_id || "").localeCompare(String(b.user_id || "")));

  history.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  const totals = wallets.reduce(
    (acc, wallet) => {
      acc.walletUsers += 1;
      acc.availableBalance += toNumber(wallet.amount, 0);
      return acc;
    },
    { walletUsers: 0, availableBalance: 0 }
  );

  history.forEach((entry) => {
    const amount = toNumber(entry.amount, 0);
    if (entry.txn_type === "credit" && entry.status === "paid") {
      totals.totalCredited = toNumber(totals.totalCredited, 0) + amount;
    }
    if (entry.txn_type === "debit" && entry.status === "paid") {
      totals.totalWithdrawn = toNumber(totals.totalWithdrawn, 0) + amount;
    }
    if (entry.txn_type === "debit" && entry.status === "pending") {
      totals.pendingWithdrawals = toNumber(totals.pendingWithdrawals, 0) + amount;
    }
  });

  return { wallets, history, totals };
}

export async function listWalletWithdrawalRequests({ db = adminDb, status = "" }) {
  if (!db) {
    const error = new Error("Wallet storage is not configured.");
    error.status = 500;
    throw error;
  }

  let query = db.collection(WALLET_HISTORY_COLLECTION).where("txn_type", "==", "debit");
  const nextStatus = String(status || "").trim().toLowerCase();
  if (nextStatus === "pending" || nextStatus === "paid") {
    query = query.where("status", "==", nextStatus);
  }

  const snap = await query.limit(300).get();
  const requests = snap.docs
    .map((doc) => ({ ...(doc.data() || {}), id: doc.id }))
    .filter((entry) => {
      const requestSource = String(entry?.meta?.requestSource || "").trim();
      const historyType = String(entry?.type || "").trim().toLowerCase();
      return requestSource === "user_wallet" || historyType === "self";
    })
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return { requests };
}
