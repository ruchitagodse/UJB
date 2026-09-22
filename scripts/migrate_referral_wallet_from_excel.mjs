#!/usr/bin/env node

import fs from "fs";
import path from "path";
import crypto from "crypto";
import admin from "firebase-admin";
import xlsx from "xlsx";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith("--") ? argv[++i] : "true";
    args[key] = value;
  }
  return args;
}

function normalizeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function parseInteger(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).replace(/,/g, "").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toIsoDate(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return "";
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString();
  }

  if (typeof raw === "number" && raw > 20000 && raw < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(epoch.getTime() + raw * 86400000);
    return date.toISOString();
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const text = String(raw).trim();
  const dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
      const dt = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  }

  return "";
}

function secondsToIso(rawSeconds) {
  const seconds = Number(rawSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return new Date(seconds * 1000).toISOString();
}

function isoFromDateOnly(raw) {
  const iso = toIsoDate(raw);
  if (!iso) return "";
  return iso.split("T")[0];
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

function randomToken() {
  return crypto.randomBytes(16).toString("hex");
}

function toCsvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows = []) {
  if (!rows.length) {
    fs.writeFileSync(filePath, "\n", "utf8");
    return;
  }
  const keys = Object.keys(rows[0]);
  const lines = [keys.join(",")];
  for (const row of rows) {
    lines.push(keys.map((k) => toCsvValue(row[k])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function getAdminConfigFromKeyFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Key file not found: ${abs}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  return {
    projectId: normalizeText(raw.project_id),
    clientEmail: normalizeText(raw.client_email),
    privateKey: normalizeText(raw.private_key).replace(/\\n/g, "\n"),
  };
}

function normalizeMode(raw) {
  const value = normalizeText(raw).toLowerCase().replace(/[_\s]+/g, " ");
  if (!value) return { ok: false, mode: "", reason: "missing payment mode" };
  if (value === "cash") return { ok: true, mode: "Cash" };
  if (value === "cheque") return { ok: true, mode: "Cheque" };
  if (value === "neft" || value === "bank transfer" || value === "rtgs" || value === "imps") {
    return { ok: true, mode: "Bank Transfer" };
  }
  if (value === "google pay" || value === "phonepe" || value === "upi") {
    return { ok: true, mode: "UPI" };
  }
  return { ok: false, mode: "", reason: `unknown payment mode: ${raw}` };
}

function normalizeStatus(raw) {
  const value = normalizeText(raw).toLowerCase();
  if (!value) return "Pending";
  const map = new Map([
    ["agreed percentage transferred to ujustbe", "Agreed Percentage transferred to UJB"],
    ["received full and final payment", "Received Full and Final Payment"],
    ["received full and final payment ", "Received Full and Final Payment"],
    ["received part payment & transferred to ujustbe", "Received Part Payment & Transferred to UJB"],
    ["deal won", "Deal Won"],
    ["deal lost", "Deal Lost"],
    ["pending", "Pending"],
  ]);
  return map.get(value) || raw;
}

function isLikelyPercent(value) {
  const n = parseNumber(value, NaN);
  if (!Number.isFinite(n)) return false;
  return n >= 0 && n <= 100;
}

function parseAgreedModel(rawAgreed, dealValue) {
  const rawText = normalizeText(rawAgreed);
  const hasPercentSymbol = rawText.includes("%");
  const numeric = round2(parseNumber(rawText.replace(/%/g, ""), 0));

  if (numeric <= 0) {
    return {
      agreedAmount: 0,
      agreedType: "amount",
      agreedValue: 0,
      agreedPercent: 0,
      sourceText: rawText,
      overrideFromExcel: rawText.length > 0,
    };
  }

  // Migration rule: Excel value is authoritative.
  // If source carries '%' sign, force percentage irrespective of service config.
  if (hasPercentSymbol || isLikelyPercent(rawAgreed)) {
    const agreedAmount = round2((round2(dealValue) * numeric) / 100);
    return {
      agreedAmount,
      agreedType: "percentage",
      agreedValue: numeric,
      agreedPercent: numeric,
      sourceText: rawText,
      overrideFromExcel: true,
    };
  }

  const agreedPercent = dealValue > 0 ? round2((numeric / dealValue) * 100) : 0;
  return {
    agreedAmount: numeric,
    agreedType: "amount",
    agreedValue: numeric,
    agreedPercent,
    sourceText: rawText,
    overrideFromExcel: true,
  };
}

function buildDistribution(agreedAmount) {
  const total = round2(agreedAmount);
  const orbiterShare = round2((total * 50) / 100);
  const orbiterMentorShare = round2((total * 15) / 100);
  const cosmoMentorShare = round2((total * 15) / 100);
  const ujustbeShare = round2(total - orbiterShare - orbiterMentorShare - cosmoMentorShare);

  return {
    agreedAmount: total,
    orbiterShare,
    orbiterMentorShare,
    cosmoMentorShare,
    ujustbeShare,
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function addSecondsToIso(iso, seconds = 0) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Date(parsed.getTime() + seconds * 1000).toISOString();
}

function hashId(...parts) {
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 20);
}

function isRetryableFirestoreError(error) {
  const text = normalizeText(error?.message || error).toUpperCase();
  return (
    text.includes("DEADLINE_EXCEEDED") ||
    text.includes("UNAVAILABLE") ||
    text.includes("ABORTED") ||
    text.includes("RESOURCE_EXHAUSTED") ||
    text.includes("INTERNAL")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withFirestoreRetry(label, fn, maxAttempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableFirestoreError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const waitMs = Math.min(12000, 600 * 2 ** (attempt - 1));
      console.warn(`[WARN] ${label} failed (attempt ${attempt}/${maxAttempts}): ${error?.message || error}. retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

function buildDuplicateKey(base) {
  const orb = normalizeText(base.orbiter?.ujbCode).toUpperCase();
  const cos = normalizeText(base.cosmoOrbiter?.ujbCode).toUpperCase();
  const item = normalizeText(base.itemName).toLowerCase();
  const type = base.referralType === "Others" ? "someone" : "self";
  const target = type === "self"
    ? orb
    : normalizeText(base.referredForPhone || base.referredForEmail || base.referredForName).toLowerCase();
  if (!orb || !cos || !item) return "";
  return `orbiter:${orb}|cosmo:${cos}|item:${item}|for:${type}|target:${target || "unknown"}`;
}

function parseWorkbook(excelPath, sheetName = "sheet 1") {
  const wb = xlsx.readFile(excelPath, { cellDates: true });
  const sheet = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Sheet not found in workbook");
  return xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function groupByReferral(rows, referralFilter = "") {
  const map = new Map();
  rows.forEach((row, idx) => {
    const referralId = normalizeText(row["Referral Id"]);
    if (!referralId) return;
    if (referralFilter && referralId !== referralFilter) return;
    const rowNo = idx + 2;
    if (!map.has(referralId)) map.set(referralId, []);
    map.get(referralId).push({ rowNo, row });
  });
  return map;
}

function buildBaseReferral(referralId, entries) {
  const first = entries[0]?.row || {};
  const referralGivenAt =
    toIsoDate(first["Referral Given date"]) ||
    secondsToIso(first[" timestamp_seconds"]) ||
    secondsToIso(first[" lastUpdated_seconds"]) ||
    new Date().toISOString();

  const referredName = normalizeText(first["Referred for (Self/Third Party) Name"]);
  const referredEmail = normalizeText(first["Referred for (Self/Third Party) Email"]);
  const referredPhone = normalizeText(first["Referred for (Self/Third Party) Mobile number"]);
  const referralType = referredName || referredEmail || referredPhone ? "Others" : "Self";

  const itemName = normalizeText(first["Product/Service Name"]);
  const isProduct = normalizeText(first.service).toLowerCase().includes("product");
  const dealValue = round2(parseNumber(first["Deal value "]));
  const agreedModel = parseAgreedModel(first["Agreed Percentage/ amount "], dealValue);
  const distribution = buildDistribution(agreedModel.agreedAmount);
  const seedStatusTimeline = [
    "Acknowledged / Accepted",
    "Proposal Sent / Quote Sent",
    "Deal Won",
    "Work Completed",
  ];
  const statusLogs = seedStatusTimeline.map((status, index) => ({
    status,
    updatedAt: addSecondsToIso(referralGivenAt, index),
    source: "excel_migration_seed",
  }));
  const latestStatus = statusLogs[statusLogs.length - 1].status;

  const base = {
    referralId,
    referralSource: normalizeText(first.referralSource || "Migration"),
    referralType,
    status: latestStatus,
    dealStatus: latestStatus,
    leadDescription: normalizeText(first["Referral Description"]),
    itemName,
    cosmoUjbCode: normalizeText(first["CosmOrbiter UJB Code"]).toUpperCase(),
    orbiter: {
      name: normalizeText(first["Orbiter Name"]),
      email: normalizeText(first["Orbiter Email"]),
      phone: normalizeText(first["Orbiter Mobile number"]),
      ujbCode: normalizeText(first["Orbiter_ujbCode"]).toUpperCase(),
      mentorName: normalizeText(first["Orbiter MentOrbiter Name"]),
      mentorPhone: normalizeText(first["Orbiter MentOrbiter Mobile number"]),
    },
    cosmoOrbiter: {
      name: normalizeText(first["CosmOrbiter Name"]),
      email: normalizeText(first["CosmOrbiter bussiness  Email"] || first["CosmOrbiter personal  Email"]),
      phone: normalizeText(first["CosmOrbiter  Mobile number"]),
      ujbCode: normalizeText(first["CosmOrbiter UJB Code"]).toUpperCase(),
      mentorName: normalizeText(first["CosmOrbiter mentorbiter Name "]),
      mentorPhone: normalizeText(first["CosmOrbiter MentOrbiter Contact No "]),
    },
    referredForName: referralType === "Others" ? referredName : null,
    referredForEmail: referralType === "Others" ? referredEmail : null,
    referredForPhone: referralType === "Others" ? referredPhone : null,
    service: isProduct
      ? null
      : {
          name: itemName,
          serviceName: itemName,
          agreedValue: {
            mode: "single",
            single: {
              type: agreedModel.agreedType === "percentage" ? "percentage" : "fixed",
              value: String(agreedModel.agreedValue || 0),
            },
            multiple: { slabs: [], itemSlabs: [] },
          },
          commercialModel: {
            modelType: "single_slab",
            singleSlab: {
              commissionType: agreedModel.agreedType === "percentage" ? "percentage" : "fixed",
              value: String(agreedModel.agreedValue || 0),
            },
            multiSlab: { slabs: [] },
          },
        },
    product: isProduct
      ? {
          name: itemName,
          productName: itemName,
          agreedValue: {
            mode: "single",
            single: {
              type: agreedModel.agreedType === "percentage" ? "percentage" : "fixed",
              value: String(agreedModel.agreedValue || 0),
            },
            multiple: { slabs: [], itemSlabs: [] },
          },
          commercialModel: {
            modelType: "single_slab",
            singleSlab: {
              commissionType: agreedModel.agreedType === "percentage" ? "percentage" : "fixed",
              value: String(agreedModel.agreedValue || 0),
            },
            multiSlab: { slabs: [] },
          },
        }
      : null,
    timestamp: referralGivenAt,
    createdAt: referralGivenAt,
    lastUpdated: referralGivenAt,
    statusLogs,
    dealLogs: [{
      dealValue,
      agreedAmount: distribution.agreedAmount,
      agreedType: agreedModel.agreedType,
      agreedValue: agreedModel.agreedValue,
      agreedPercent: agreedModel.agreedPercent,
      orbiterShare: distribution.orbiterShare,
      orbiterMentorShare: distribution.orbiterMentorShare,
      cosmoMentorShare: distribution.cosmoMentorShare,
      ujustbeShare: distribution.ujustbeShare,
      dealStatus: latestStatus,
      timestamp: referralGivenAt,
      source: "excel_migration",
    }],
    followups: [],
    rejectReason: normalizeText(first["Referral Rejected Reason"]),
    meta: {
      sourceLegacy: {
        workbook: path.basename(process.env.MIGRATION_EXCEL_PATH || ""),
        rowRefs: entries.map((e) => e.rowNo),
        agreedOverrideFromExcel: true,
        agreedSourceText: agreedModel.sourceText || "",
        agreedResolvedType: agreedModel.agreedType,
        agreedResolvedValue: agreedModel.agreedValue,
        agreedResolvedPercent: agreedModel.agreedPercent,
        agreedResolvedAmount: distribution.agreedAmount,
      },
    },
    dealValue,
    agreedTotal: distribution.agreedAmount,
  };

  base.duplicateKey = buildDuplicateKey(base);
  return base;
}

function buildEvents(referral, entries, context) {
  const quarantines = [];
  const fatalErrors = [];
  const dealTransactions = [];
  const payments = [];
  const walletCredits = [];

  const seenDeal = new Set();
  const seenCredit = new Set();
  const seenInvoiceByTx = new Set();
  const paymentDates = [];
  let totalCosmoReceived = 0;
  let totalCosmoTransferredToUjb = 0;
  const invoices = [];

  for (const { rowNo, row } of entries) {
    let rowCosmoPaymentId = "";
    const amountReceived = round2(parseNumber(row["Amount Recieved by CosmOrbiter "]));
    const paymentDate = toIsoDate(row["Payment Date "]);
    const modeCheck = normalizeMode(row["Payment Mode "]);

    if (amountReceived > 0) {
      if (!modeCheck.ok) {
        quarantines.push({ referralId: referral.referralId, rowNo, field: "Payment Mode", reason: modeCheck.reason });
      } else {
        const key = `${amountReceived}|${paymentDate}|${modeCheck.mode}`;
        if (!seenDeal.has(key)) {
          seenDeal.add(key);
          const txId = `DEAL-TXN-${hashId(referral.referralId, String(rowNo), key)}`;
          const paymentDateValue = paymentDate ? paymentDate.split("T")[0] : "";
          const txCreatedAt = paymentDate || new Date().toISOString();
          paymentDates.push(paymentDateValue || new Date().toISOString().split("T")[0]);
          totalCosmoReceived = round2(totalCosmoReceived + amountReceived);
          dealTransactions.push({
            transactionId: txId,
            amountReceived,
            modeOfPayment: modeCheck.mode,
            transactionRef: normalizeText(row["Referral Id"]) + `-ROW-${rowNo}`,
            paymentDate: paymentDateValue,
            paymentFromUjbCode: referral.orbiter?.ujbCode || "",
            paymentToUjbCode: referral.cosmoOrbiter?.ujbCode || "",
            recordedByUjbCode: referral.cosmoOrbiter?.ujbCode || "migration",
            createdAt: txCreatedAt,
            source: "excel_migration",
          });

          if (!seenInvoiceByTx.has(txId)) {
            seenInvoiceByTx.add(txId);
            const agreedPercent = round2(
              referral?.dealLogs?.[0]?.agreedPercent ??
              (referral.dealValue > 0
                ? ((referral?.dealLogs?.[0]?.agreedAmount || 0) / referral.dealValue) * 100
                : 0)
            );
            const invoiceBase = round2((amountReceived * agreedPercent) / 100);
            const gstAmount = 0;
            const totalAmount = invoiceBase;
            const nowIso = paymentDate || new Date().toISOString();
            const invoiceId = `UJB-INV-${hashId(referral.referralId, txId, String(rowNo))}`;
            invoices.push({
              invoiceId,
              invoiceNumber: `UJB/MIG/${hashId(referral.referralId, txId).slice(0, 8).toUpperCase()}`,
              referralId: "",
              referralDisplayId: referral.referralId,
              dealTransactionId: txId,
              invoiceType: "Referral Commission",
              status: "Paid",
              issuedAt: paymentDate || nowIso,
              dueDate: paymentDateValue || nowIso.split("T")[0],
              billedBy: {
                legalName: "UJustBe",
                businessName: "UJustBe",
              },
              billedTo: {
                ujbCode: referral.cosmoOrbiter?.ujbCode || "",
                name: referral.cosmoOrbiter?.name || "",
                businessName: referral.cosmoOrbiter?.name || "",
                email: referral.cosmoOrbiter?.email || "",
                phone: referral.cosmoOrbiter?.phone || "",
              },
              referral: {
                orbiterUjbCode: referral.orbiter?.ujbCode || "",
                orbiterName: referral.orbiter?.name || "",
                cosmoUjbCode: referral.cosmoOrbiter?.ujbCode || "",
                cosmoName: referral.cosmoOrbiter?.name || "",
                serviceOrProductName: referral.itemName || "",
                dealValue: round2(referral.dealLogs?.[0]?.dealValue || referral.dealValue || 0),
              },
              sourcePayment: {
                amountReceived,
                modeOfPayment: modeCheck.mode,
                transactionRef: `${referral.referralId}-ROW-${rowNo}`,
                paymentDate: paymentDateValue,
              },
              baseAmount: invoiceBase,
              gstRate: 0,
              gstAmount,
              totalAmount,
              totals: {
                taxableAmount: invoiceBase,
                cgstRate: 0,
                cgstAmount: 0,
                sgstRate: 0,
                sgstAmount: 0,
                igstRate: 0,
                igstAmount: 0,
                gstAmount,
                totalAmount,
                amountPaid: totalAmount,
                balanceDue: 0,
              },
              accountPayment: {
                paidAt: paymentDateValue || nowIso,
                paymentMode: modeCheck.mode,
                paymentReference: `${referral.referralId}-INV-${rowNo}`,
                receivedByAdminId: "excel_migration",
                notes: "Marked paid during migration",
              },
              statusAuditLogs: [
                {
                  at: nowIso,
                  fromStatus: "Pending",
                  toStatus: "Paid",
                  changedByAdminId: "excel_migration",
                  paymentMode: modeCheck.mode,
                  paymentReference: `${referral.referralId}-INV-${rowNo}`,
                  paidAt: paymentDateValue || nowIso,
                  notes: "Marked paid during migration",
                },
              ],
              updatedAt: nowIso,
            });
          }
        }
      }
    }

    const toUjb = round2(parseNumber(row["Amount Transfered to ujb for this deal"]));
    if (toUjb > 0) {
      rowCosmoPaymentId = `COSMO-UJB-${hashId(referral.referralId, String(rowNo), String(toUjb))}`;
      totalCosmoTransferredToUjb = round2(totalCosmoTransferredToUjb + toUjb);
      payments.push({
        paymentId: rowCosmoPaymentId,
        paymentFrom: "CosmoOrbiter",
        paymentTo: "UJustBe",
        amountReceived: toUjb,
        grossAmount: toUjb,
        paymentDate: paymentDate ? paymentDate.split("T")[0] : "",
        modeOfPayment: modeCheck.ok ? modeCheck.mode : "",
        transactionRef: `COSMO-UJB-${referral.referralId}-${rowNo}`,
        createdAt: paymentDate || new Date().toISOString(),
        meta: { isCosmoToUjb: true, sourceRow: rowNo },
      });
    }

    const payoutSpecs = [
      {
        amount: round2(parseNumber(row["Amount UJb transfered to Orbiter "])),
        date: toIsoDate(row["Orbiter Payment Date "]),
        modeRaw: row["Orbiter Payment Mode "],
        recipient: "Orbiter",
        recipientUjbCode: referral.orbiter?.ujbCode || "",
        recipientName: referral.orbiter?.name || "",
      },
      {
        amount: round2(parseNumber(row["Amount Ujb transfered to Orbiter mentor "])),
        date: toIsoDate(row["Orbiter mentor Payment Date  "]),
        modeRaw: row["Orbiter mentor Payment Mode "],
        recipient: "OrbiterMentor",
        recipientUjbCode: normalizeText(row["Orbiter MentOrbiter UJB Code"]).toUpperCase(),
        recipientName: referral.orbiter?.mentorName || "",
      },
      {
        amount: round2(parseNumber(row["Amount ujb transfered to CosmOrbiter mentor  "])),
        date: toIsoDate(row["CosmOrbiter mentor Payment Date  "]),
        modeRaw: row["CosmOrbiter mentor Payment Mode "],
        recipient: "CosmoMentor",
        recipientUjbCode: normalizeText(row["UJB Code_CosmOrbiter MentOrbiter"]).toUpperCase(),
        recipientName: referral.cosmoOrbiter?.mentorName || "",
      },
    ];

    for (const spec of payoutSpecs) {
      if (spec.amount <= 0) continue;
      if (!spec.recipientUjbCode) {
        fatalErrors.push({ referralId: referral.referralId, rowNo, reason: `missing recipient UJB code for ${spec.recipient}` });
        continue;
      }

      const mode = normalizeMode(spec.modeRaw);
      if (!mode.ok) {
        quarantines.push({ referralId: referral.referralId, rowNo, field: `${spec.recipient} payout mode`, reason: mode.reason });
        continue;
      }

      const creditId = `credit_release_${hashId(referral.referralId, spec.recipient, String(rowNo), String(spec.amount))}`;
      if (seenCredit.has(creditId)) continue;
      seenCredit.add(creditId);

      walletCredits.push({
        historyId: creditId,
        userId: spec.recipientUjbCode,
        recipient: spec.recipient,
        amount: spec.amount,
        paidAt: spec.date ? spec.date.split("T")[0] : "",
        mode: mode.mode,
        sourceRow: rowNo,
        recipientName: spec.recipientName,
      });

      payments.push({
        paymentId: `UJB-PAYOUT-${hashId(referral.referralId, spec.recipient, String(rowNo))}`,
        paymentFrom: "UJustBe",
        paymentTo: spec.recipient,
        paymentToName: spec.recipientName,
        amountReceived: spec.amount,
        paymentDate: spec.date ? spec.date.split("T")[0] : "",
        modeOfPayment: mode.mode,
        transactionRef: `UJB-${spec.recipient}-${referral.referralId}-${rowNo}`,
        createdAt: spec.date || new Date().toISOString(),
        meta: {
          isUjbPayout: true,
          slot: spec.recipient,
          belongsToPaymentId: rowCosmoPaymentId || null,
          logicalAmount: spec.amount,
          recipientUjbCode: spec.recipientUjbCode,
          sourceRow: rowNo,
          imported: true,
          releaseSource: "manual_release",
        },
      });
    }
  }

  const totalDealReceived = round2(dealTransactions.reduce((s, t) => s + round2(t.amountReceived), 0));
  const baseDeal = round2(referral.dealLogs?.[0]?.dealValue || 0);
  const paidDatesSorted = paymentDates
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const lastPaymentDate = paidDatesSorted.length ? paidDatesSorted[paidDatesSorted.length - 1] : "";
  if (totalDealReceived - baseDeal > 0.01) {
    const adjustmentIso = lastPaymentDate
      ? (toIsoDate(lastPaymentDate) || "")
      : "";
    const fallbackIso =
      adjustmentIso ||
      toIsoDate(referral.createdAt) ||
      toIsoDate(referral.timestamp) ||
      new Date().toISOString();
    if (!referral.meta) referral.meta = {};
    if (!referral.meta.sourceLegacy) referral.meta.sourceLegacy = {};
    referral.meta.sourceLegacy.dealValueAutoRaised = true;
    referral.meta.sourceLegacy.dealValueBefore = baseDeal;
    referral.meta.sourceLegacy.dealValueAfter = totalDealReceived;
    referral.meta.sourceLegacy.dealValueRaiseReason =
      "Total received by CosmOrbiter exceeded exported deal value; raised deal value during migration.";

    if (Array.isArray(referral.dealLogs) && referral.dealLogs.length > 0) {
      referral.dealLogs[referral.dealLogs.length - 1].dealValue = totalDealReceived;
      referral.dealLogs[referral.dealLogs.length - 1].dealValueAdjustedAt = fallbackIso;
      referral.dealLogs[referral.dealLogs.length - 1].dealValueAdjustedSource = "excel_migration";
    } else {
      referral.dealLogs = [
        {
          dealValue: totalDealReceived,
          agreedAmount: 0,
          dealStatus: referral.dealStatus || "Pending",
          timestamp: fallbackIso,
          source: "excel_migration",
        },
      ];
    }
  }

  const ujbIn = round2(payments.filter((p) => p.paymentFrom === "CosmoOrbiter").reduce((s, p) => s + round2(p.amountReceived), 0));
  const paidToOrbiter = round2(payments.filter((p) => p.paymentTo === "Orbiter").reduce((s, p) => s + round2(p.amountReceived), 0));
  const paidToOrbiterMentor = round2(payments.filter((p) => p.paymentTo === "OrbiterMentor").reduce((s, p) => s + round2(p.amountReceived), 0));
  const paidToCosmoMentor = round2(payments.filter((p) => p.paymentTo === "CosmoMentor").reduce((s, p) => s + round2(p.amountReceived), 0));
  const ujbBalance = round2(ujbIn - paidToOrbiter - paidToOrbiterMentor - paidToCosmoMentor);

  referral.dealTransactions = dealTransactions;
  referral.payments = payments;
  referral.paidToOrbiter = paidToOrbiter;
  referral.paidToOrbiterMentor = paidToOrbiterMentor;
  referral.paidToCosmoMentor = paidToCosmoMentor;
  referral.ujbBalance = ujbBalance;
  referral.dealTransactionTotalReceived = totalDealReceived;
  referral.ujustbeeInvoices = invoices.map((invoice) => ({
    ...invoice,
    referralId: context.referralDocId || "",
  }));
  referral.ujustbeeInvoiceBaseTotal = round2(
    invoices.reduce((sum, invoice) => sum + round2(invoice.baseAmount || 0), 0)
  );
  referral.ujustbeeInvoiceTotalPayable = round2(
    invoices.reduce((sum, invoice) => sum + round2(invoice.totalAmount || 0), 0)
  );
  if (!referral.dealLogs?.length) referral.dealLogs = [{}];
  const latestDealLog = referral.dealLogs[referral.dealLogs.length - 1];
  referral.dealValue = round2(latestDealLog.dealValue || referral.dealValue || 0);
  referral.agreedTotal = round2(latestDealLog.agreedAmount || referral.agreedTotal || 0);

  const timeline = Array.isArray(referral.statusLogs) ? [...referral.statusLogs] : [];
  const agreedReached =
    totalCosmoTransferredToUjb > 0 &&
    round2(totalCosmoTransferredToUjb) >= round2(referral.agreedTotal || 0);

  // Strict sequence after Work Completed:
  // - For multi-part collections, add Received Part Payment per earlier payment dates
  // - Add Agreed % Transferred to UJustBe at final payment date when agreed is reached
  if (paidDatesSorted.length > 1) {
    for (let i = 0; i < paidDatesSorted.length - 1; i += 1) {
      const d = paidDatesSorted[i];
      const baseIso = toIsoDate(d) || new Date().toISOString();
      timeline.push({
        status: "Received Part Payment",
        updatedAt: addSecondsToIso(baseIso, i),
        source: "excel_migration_payment_timeline",
      });
    }
  }

  if (lastPaymentDate && agreedReached) {
    const finalBase = toIsoDate(lastPaymentDate) || new Date().toISOString();
    timeline.push({
      status: "Agreed % Transferred to UJustBe",
      updatedAt: addSecondsToIso(finalBase, 0),
      source: "excel_migration_payment_timeline",
    });
    timeline.push({
      status: "Closed",
      updatedAt: addSecondsToIso(finalBase, 1),
      source: "excel_migration_close_timeline",
    });
  } else if (lastPaymentDate && paidDatesSorted.length > 0) {
    // If agreed transfer is not reached yet, keep latest as Received Part Payment only.
    const finalBase = toIsoDate(lastPaymentDate) || new Date().toISOString();
    timeline.push({
      status: "Received Part Payment",
      updatedAt: addSecondsToIso(finalBase, 0),
      source: "excel_migration_payment_timeline",
    });
  }

  timeline.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  referral.statusLogs = timeline;
  referral.dealStatus = timeline.length ? timeline[timeline.length - 1].status : referral.dealStatus;
  referral.status = referral.dealStatus;
  referral.lastUpdated = timeline.length ? timeline[timeline.length - 1].updatedAt : referral.lastUpdated;

  const walletPlan = buildWalletPlan(walletCredits, context);

  return {
    quarantines,
    fatalErrors,
    walletPlan,
    checks: {
      timelineComplete: timeline.length >= 4,
      agreedSplitConsistent:
        round2((latestDealLog.orbiterShare || 0) + (latestDealLog.orbiterMentorShare || 0) + (latestDealLog.cosmoMentorShare || 0) + (latestDealLog.ujustbeShare || 0)) === round2(latestDealLog.agreedAmount || 0),
      invoiceCountMatchesPayments: invoices.length === dealTransactions.length,
      invoicePaidTotalsConsistent: invoices.every((inv) => round2(inv.totals?.amountPaid || 0) === round2(inv.totalAmount || 0)),
      walletCreditMatchesPayouts:
        round2(
          walletCredits.reduce((s, item) => s + round2(item.amount || 0), 0)
        ) ===
        round2(
          paidToOrbiter + paidToOrbiterMentor + paidToCosmoMentor
        ),
    },
  };
}

function buildWalletPlan(walletCredits, context) {
  const wallets = new Map();
  const history = [];

  for (const credit of walletCredits) {
    const historicalCreatedAt = toIsoDate(credit.paidAt) || new Date().toISOString();
    const depositDate = (historicalCreatedAt || "").split("T")[0] || "";
    const current = wallets.get(credit.userId) || 0;
    wallets.set(credit.userId, round2(current + credit.amount));
    history.push({
      id: credit.historyId,
      user_id: credit.userId,
      type: "other",
      referral_id: context.referralId,
      note: `UJustBe Reciprocation for Referral ${context.referralId} at ${depositDate}`,
      amount: credit.amount,
      txn_type: "credit",
      status: "paid",
      created_at: historicalCreatedAt,
      meta: {
        slot: credit.recipient,
        sourceRow: credit.sourceRow,
        paymentMode: credit.mode,
        paidAt: credit.paidAt,
        releaseSource: "excel_migration",
      },
    });

    // Same-day settlement debit for payout rows imported from Excel.
    // This is not a withdrawal request; it records that the credited payout was already settled.
    const debitId = `debit_settlement_${hashId(
      context.referralId,
      credit.userId,
      credit.recipient,
      String(credit.sourceRow),
      String(credit.amount)
    )}`;
    const running = wallets.get(credit.userId) || 0;
    wallets.set(credit.userId, round2(running - credit.amount));
    history.push({
      id: debitId,
      uuid: debitId,
      user_id: credit.userId,
      type: "self",
      referral_id: context.referralId,
      note: `Wallet Withdrawal at ${depositDate}`,
      amount: credit.amount,
      txn_type: "debit",
      status: "paid",
      created_at: historicalCreatedAt,
      meta: {
        requestSource: "user_wallet",
        slot: credit.recipient,
        sourceRow: credit.sourceRow,
        paymentMode: credit.mode,
        paidAt: credit.paidAt,
        transactionRef: `MIG-WD-${hashId(context.referralId, credit.userId, credit.recipient, String(credit.sourceRow))}`,
        processedAt: credit.paidAt || new Date().toISOString().split("T")[0],
        settlementSource: "excel_migration",
        linkedCreditId: credit.historyId,
      },
    });

  }

  return { wallets, history };
}

async function findReferralDocByBusinessId(db, collectionName, referralId) {
  const snap = await withFirestoreRetry(
    `find referral ${referralId}`,
    () => db.collection(collectionName).where("referralId", "==", referralId).limit(1).get()
  );
  if (snap.empty) return null;
  return snap.docs[0];
}

function buildManifest({ excelPath, workbookHash, projectId, token, mode, generatedAt, args }) {
  return {
    generatedAt,
    mode,
    excelPath,
    workbookHash,
    projectId,
    confirmToken: token,
    args,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  const defaultTargetKey = "C:/Ruchita/Next/Universe_CC_tool/UJB_Karma_CC/json/prod-project-key.json";
  const defaultExcelPath = "C:/Ruchita/Next/Universe_CC_tool/UJB_Karma_CC/json/ReferralTracking-Export_UJB_1760693869683.xlsx";

  const targetKeyPath = normalizeText(args["target-key"] || defaultTargetKey);
  const excelPath = normalizeText(args.excel || defaultExcelPath);
  const mode = normalizeText(args.mode || "dry-run").toLowerCase();
  const limit = parseInteger(args.limit, 0);
  const offset = Math.max(0, parseInteger(args.offset, 0));
  const referralFilter = normalizeText(args["referral-id"]);
  const reportRoot = path.resolve(normalizeText(args["report-dir"] || "migration-reports"));
  const forceLargeBatch = parseBoolean(args["force-large-batch"], false);

  const referralCollection = normalizeText(args["referral-collection"] || "referral");
  const referralLocksCollection = normalizeText(args["referral-locks-collection"] || "referralLocks");
  const walletCollection = normalizeText(args["wallet-collection"] || "wallet");
  const walletHistoryCollection = normalizeText(args["wallet-history-collection"] || "wallet_history");

  if (!["dry-run", "apply"].includes(mode)) {
    throw new Error(`Invalid --mode '${mode}'. Use dry-run or apply.`);
  }

  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel file not found: ${excelPath}`);
  }

  const targetConfig = getAdminConfigFromKeyFile(targetKeyPath);
  if (!targetConfig.projectId || !targetConfig.clientEmail || !targetConfig.privateKey) {
    throw new Error("Invalid target service key configuration.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = path.join(reportRoot, timestamp);
  ensureDir(reportDir);

  const workbookHash = sha256File(excelPath);
  process.env.MIGRATION_EXCEL_PATH = excelPath;

  const rows = parseWorkbook(excelPath, "sheet 1");
  const grouped = groupByReferral(rows, referralFilter);
  let referralEntries = Array.from(grouped.entries());
  referralEntries = referralEntries.slice(offset);
  if (limit > 0) {
    referralEntries = referralEntries.slice(0, limit);
  }

  const app = admin.initializeApp({ credential: admin.credential.cert(targetConfig) }, `migration-referral-wallet-${timestamp}`);
  const db = app.firestore();

  const quarantines = [];
  const fatalErrors = [];
  const writePlan = [];
  const walletAggregates = new Map();
  const walletHistoryRows = [];
  const reconRows = [];

  for (const [referralId, entries] of referralEntries) {
    const referral = buildBaseReferral(referralId, entries);
    const eventResult = buildEvents(referral, entries, { referralId });
    quarantines.push(...eventResult.quarantines);
    fatalErrors.push(...eventResult.fatalErrors);

    for (const [userId, amount] of eventResult.walletPlan.wallets.entries()) {
      walletAggregates.set(userId, round2((walletAggregates.get(userId) || 0) + amount));
    }
    walletHistoryRows.push(...eventResult.walletPlan.history);

    writePlan.push({ referralId, referral, entries: entries.length });

    reconRows.push({
      referralId,
      dealValue: round2(referral.dealLogs?.[0]?.dealValue || 0),
      totalDealReceived: round2(referral.dealTransactionTotalReceived || 0),
      paidToOrbiter: round2(referral.paidToOrbiter || 0),
      paidToOrbiterMentor: round2(referral.paidToOrbiterMentor || 0),
      paidToCosmoMentor: round2(referral.paidToCosmoMentor || 0),
      ujbBalance: round2(referral.ujbBalance || 0),
      timelineComplete: Boolean(eventResult.checks?.timelineComplete),
      agreedSplitConsistent: Boolean(eventResult.checks?.agreedSplitConsistent),
      invoiceCountMatchesPayments: Boolean(eventResult.checks?.invoiceCountMatchesPayments),
      invoicePaidTotalsConsistent: Boolean(eventResult.checks?.invoicePaidTotalsConsistent),
      walletCreditMatchesPayouts: Boolean(eventResult.checks?.walletCreditMatchesPayouts),
    });
  }

  const quarantineRatio = rows.length ? quarantines.length / rows.length : 0;
  const hardStopQuarantineRatio = 0.35;
  if (quarantineRatio > hardStopQuarantineRatio) {
    fatalErrors.push({
      referralId: "global",
      rowNo: "global",
      reason: `quarantine ratio ${quarantineRatio.toFixed(4)} exceeds threshold ${hardStopQuarantineRatio}`,
    });
  }

  if (!forceLargeBatch && writePlan.length > 1000) {
    fatalErrors.push({
      referralId: "global",
      rowNo: "global",
      reason: `write plan has ${writePlan.length} referrals; pass --force-large-batch true to continue apply`,
    });
  }

  const summary = {
    mode,
    projectId: targetConfig.projectId,
    workbook: path.basename(excelPath),
    workbookHash,
    totalRows: rows.length,
    groupedReferrals: grouped.size,
    processedReferrals: writePlan.length,
    offset,
    limit: limit || null,
    quarantinedEvents: quarantines.length,
    fatalErrors: fatalErrors.length,
    walletCreditsPlanned: walletHistoryRows.length,
    generatedAt: new Date().toISOString(),
  };

  const confirmToken = randomToken();
  const manifest = buildManifest({
    excelPath,
    workbookHash,
    projectId: targetConfig.projectId,
    token: confirmToken,
    mode,
    generatedAt: summary.generatedAt,
    args,
  });

  fs.writeFileSync(path.join(reportDir, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(reportDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(reportDir, "write-plan.json"), JSON.stringify(writePlan, null, 2));
  fs.writeFileSync(path.join(reportDir, "reconciliation.json"), JSON.stringify(reconRows, null, 2));
  writeCsv(path.join(reportDir, "quarantine.csv"), quarantines.map((q) => ({
    referralId: q.referralId,
    rowNo: q.rowNo,
    field: q.field || "",
    reason: q.reason,
  })));
  writeCsv(path.join(reportDir, "fatal-errors.csv"), fatalErrors.map((e) => ({
    referralId: e.referralId,
    rowNo: e.rowNo,
    reason: e.reason,
  })));

  console.log(`[INFO] reportDir=${reportDir}`);
  console.log(`[INFO] mode=${mode} project=${targetConfig.projectId} referrals=${writePlan.length}`);
  console.log(`[INFO] quarantines=${quarantines.length} fatalErrors=${fatalErrors.length}`);

  if (mode === "dry-run") {
    console.log(`[DRY-RUN] confirmToken=${confirmToken}`);
    await app.delete();
    return;
  }

  const confirmTokenArg = normalizeText(args["confirm-token"]);
  const confirmProject = normalizeText(args["confirm-project"]);
  const manifestPath = normalizeText(args["manifest"]);

  if (!manifestPath || !fs.existsSync(manifestPath)) {
    throw new Error("Apply requires --manifest <path-to-dry-run-manifest.json>.");
  }

  const priorManifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), "utf8"));

  if (normalizeText(priorManifest.workbookHash) !== workbookHash) {
    throw new Error("Workbook hash mismatch between dry-run manifest and current excel file.");
  }

  if (normalizeText(priorManifest.projectId) !== targetConfig.projectId) {
    throw new Error("Manifest projectId does not match current target key project.");
  }

  if (!confirmTokenArg || confirmTokenArg !== normalizeText(priorManifest.confirmToken)) {
    throw new Error("Invalid --confirm-token for apply.");
  }

  if (!confirmProject || confirmProject !== targetConfig.projectId) {
    throw new Error("--confirm-project must equal target project id from service key.");
  }

  if (fatalErrors.length > 0) {
    throw new Error(`Apply blocked: ${fatalErrors.length} fatal errors. See fatal-errors.csv`);
  }

  const writeSummary = {
    referralCreated: 0,
    referralUpdated: 0,
    referralLocksUpserted: 0,
    walletUpserted: 0,
    walletHistoryUpserted: 0,
  };

  const walletHistoryByUser = new Map();
  for (const row of walletHistoryRows) {
    const userId = normalizeText(row.user_id);
    if (!userId) continue;
    if (!walletHistoryByUser.has(userId)) walletHistoryByUser.set(userId, []);
    walletHistoryByUser.get(userId).push(row);
  }

  for (const item of writePlan) {
    const existing = await findReferralDocByBusinessId(db, referralCollection, item.referralId);
    let referralRef = null;
    if (existing) {
      referralRef = existing.ref;
      writeSummary.referralUpdated += 1;
    } else {
      referralRef = db.collection(referralCollection).doc();
      writeSummary.referralCreated += 1;
    }

    await withFirestoreRetry(
      `upsert referral ${item.referralId}`,
      () => referralRef.set(item.referral, { merge: true })
    );

    if (item.referral.duplicateKey) {
      const lockId = `user-referral-${hashId(item.referral.duplicateKey)}`;
      await withFirestoreRetry(
        `upsert referral lock ${item.referralId}`,
        () =>
          db.collection(referralLocksCollection).doc(lockId).set({
            duplicateKey: item.referral.duplicateKey,
            referralDocId: referralRef.id,
            referralId: item.referral.referralId,
            status: item.referral.dealStatus || "Pending",
            createdAt: item.referral.createdAt || new Date().toISOString(),
            orbiterUjbCode: item.referral.orbiter?.ujbCode || "",
            cosmoUjbCode: item.referral.cosmoOrbiter?.ujbCode || "",
            migrationSource: "excel_referral_wallet",
          }, { merge: true })
      );
      writeSummary.referralLocksUpserted += 1;
    }
  }

  for (const [userId, amountDelta] of walletAggregates.entries()) {
    const walletRef = db.collection(walletCollection).doc(userId);
    const walletSnap = await withFirestoreRetry(
      `read wallet ${userId}`,
      () => walletRef.get()
    );
    const userHistory = walletHistoryByUser.get(userId) || [];
    const historyTimes = userHistory
      .map((h) => new Date(h.created_at || 0).getTime())
      .filter((t) => Number.isFinite(t) && t > 0)
      .sort((a, b) => a - b);
    const earliestHistoryIso = historyTimes.length ? new Date(historyTimes[0]).toISOString() : "";
    const latestHistoryIso = historyTimes.length
      ? new Date(historyTimes[historyTimes.length - 1]).toISOString()
      : "";
    const currentAmount = walletSnap.exists ? round2(parseNumber(walletSnap.data()?.amount, 0)) : 0;
    const nextAmount = round2(currentAmount + amountDelta);
    await withFirestoreRetry(
      `upsert wallet ${userId}`,
      () =>
        walletRef.set({
          user_id: userId,
          amount: nextAmount,
          created_at: walletSnap.exists
            ? walletSnap.data()?.created_at || earliestHistoryIso || new Date().toISOString()
            : earliestHistoryIso || new Date().toISOString(),
          updated_at: latestHistoryIso || new Date().toISOString(),
          meta: { migrationSource: "excel_referral_wallet" },
        }, { merge: true })
    );
    writeSummary.walletUpserted += 1;
  }

  for (const row of walletHistoryRows) {
    await withFirestoreRetry(
      `upsert wallet_history ${row.id}`,
      () => db.collection(walletHistoryCollection).doc(row.id).set(row, { merge: true })
    );
    writeSummary.walletHistoryUpserted += 1;
  }

  fs.writeFileSync(path.join(reportDir, "apply-summary.json"), JSON.stringify(writeSummary, null, 2));
  console.log("[APPLY DONE]");
  console.log(JSON.stringify(writeSummary, null, 2));

  await app.delete();
}

main().catch((error) => {
  console.error("[FATAL]", error?.message || error);
  process.exit(1);
});
