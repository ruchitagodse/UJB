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
    args[key] = next && !next.startsWith("--") ? argv[++i] : "true";
  }
  return args;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function parseNumber(value, fallback = 0) {
  const n = Number(normalizeText(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function toIsoDate(raw) {
  if (raw === null || raw === undefined || normalizeText(raw) === "") return "";
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();

  if (typeof raw === "number" && raw > 20000 && raw < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + raw * 86400000).toISOString();
  }

  const text = normalizeText(raw);
  const dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    ) {
      return dt.toISOString();
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function getAdminConfigFromKeyFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`Key file not found: ${abs}`);
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  return {
    projectId: normalizeText(raw.project_id),
    clientEmail: normalizeText(raw.client_email),
    privateKey: normalizeText(raw.private_key).replace(/\\n/g, "\n"),
  };
}

function normalizePaymentMode(raw) {
  const value = normalizeText(raw).toLowerCase().replace(/[_\s]+/g, " ");
  if (value === "cash") return "Cash";
  if (value === "cheque") return "Cheque";
  if (value === "neft" || value === "rtgs" || value === "imps" || value === "bank transfer") {
    return "Bank Transfer";
  }
  if (value === "google pay" || value === "phonepe" || value === "upi") return "UPI";
  if (value === "other") return "Other";
  return normalizeText(raw);
}

function dateOnly(iso) {
  return iso ? iso.slice(0, 10) : "";
}

function isExpired(renewalIso, now = new Date()) {
  if (!renewalIso) return false;
  const renewal = new Date(renewalIso);
  if (Number.isNaN(renewal.getTime())) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  renewal.setHours(0, 0, 0, 0);
  return renewal.getTime() < today.getTime();
}

function readMembershipRows(excelPath, sheetName) {
  const workbook = xlsx.readFile(excelPath, { cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  return rows.map((row, index) => {
    const startDate = toIsoDate(row["Membership Start Date"]);
    const renewalDate = toIsoDate(row["Renewal Date"]);
    const paidDate = toIsoDate(row["Subscription Payment Date"]);
    const code = normalizeText(row["UJB Code"]);
    return {
      excelRow: index + 2,
      code,
      firstName: normalizeText(row["First Name"]),
      lastName: normalizeText(row["Last Name"]),
      businessRegistrationDate: toIsoDate(row["Business Registration Date"]),
      membershipStartDate: startDate,
      membershipEndDate: toIsoDate(row["Membership End Date"]),
      renewalDate,
      subscriptionPaymentDate: paidDate,
      subscriptionPaymentMode: normalizePaymentMode(row["Subscription Payment Mode"]),
      paidMembershipAmount: parseNumber(row["paid membership amount"], 0),
      balanceMembershipAmount: parseNumber(row["balance membership amount"], 0),
      subscriptionStatus: isExpired(renewalDate) ? "expired" : "active",
    };
  });
}

function rowSignature(row) {
  return [
    row.firstName,
    row.lastName,
    dateOnly(row.membershipStartDate),
    dateOnly(row.membershipEndDate),
    dateOnly(row.renewalDate),
    dateOnly(row.subscriptionPaymentDate),
    row.subscriptionPaymentMode,
    row.paidMembershipAmount,
    row.balanceMembershipAmount,
  ].join("|");
}

function millis(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeRows(rows, duplicatePolicy = "latest-payment-date") {
  const byCode = new Map();
  for (const row of rows) {
    if (!row.code) continue;
    if (!byCode.has(row.code)) byCode.set(row.code, []);
    byCode.get(row.code).push(row);
  }

  const unique = [];
  const duplicates = [];
  const conflicts = [];
  const resolvedConflicts = [];
  for (const [code, items] of byCode.entries()) {
    const signatures = new Set(items.map(rowSignature));
    if (items.length > 1) {
      duplicates.push({ code, rows: items.map((item) => item.excelRow), identical: signatures.size === 1 });
    }
    if (signatures.size > 1 && duplicatePolicy !== "latest-payment-date") {
      conflicts.push({ code, rows: items.map((item) => item.excelRow) });
      continue;
    }

    const selected =
      signatures.size > 1
        ? [...items].sort(
            (a, b) =>
              millis(b.subscriptionPaymentDate) - millis(a.subscriptionPaymentDate) ||
              b.excelRow - a.excelRow
          )[0]
        : items[0];

    if (signatures.size > 1) {
      resolvedConflicts.push({
        code,
        rows: items.map((item) => item.excelRow),
        selectedRow: selected.excelRow,
        policy: duplicatePolicy,
      });
    }

    unique.push(selected);
  }

  return { unique, duplicates, conflicts, resolvedConflicts };
}

function buildUpdate(row, existing = {}) {
  const existingCosmo = existing?.payment?.cosmo || {};
  const existingPayment = existing?.payment || {};
  return {
    subscription: {
      ...(existing.subscription || {}),
      startDate: row.membershipStartDate,
      nextRenewalDate: row.renewalDate,
      approvedOn: row.businessRegistrationDate || row.membershipStartDate,
      status: row.subscriptionStatus,
      membershipEndDate: row.membershipEndDate,
      legacy: {
        source: "enrollment_new_list",
        excelRow: row.excelRow,
        businessRegistrationDate: row.businessRegistrationDate,
        balanceMembershipAmount: row.balanceMembershipAmount,
      },
    },
    payment: {
      ...existingPayment,
      cosmo: {
        ...existingCosmo,
        status: row.paidMembershipAmount > 0 ? "paid" : existingCosmo.status || "unpaid",
        paidDate: row.subscriptionPaymentDate,
        paymentMode: row.subscriptionPaymentMode,
        amount: row.paidMembershipAmount,
        feeAmount: row.paidMembershipAmount,
        migrationSource: "excel_subscription_membership",
      },
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const excelPath = path.resolve(
    args.excel || "json/subscription/enrollment new list.xlsx"
  );
  const sheetName = args.sheet || "LP membership details";
  const keyFile = args["target-key"] || "json/prod-project-key.json";
  const collection = args.collection || "usersdetail";
  const dryRun = parseBoolean(args["dry-run"], true);
  const limit = Number.isFinite(Number(args.limit)) ? Number(args.limit) : 0;
  const offset = Number.isFinite(Number(args.offset)) ? Number(args.offset) : 0;
  const duplicatePolicy = args["duplicate-policy"] || "latest-payment-date";

  const rows = readMembershipRows(excelPath, sheetName);
  const invalidRows = rows.filter(
    (row) => !row.code || !row.membershipStartDate || !row.renewalDate || !row.subscriptionPaymentDate
  );
  const { unique, duplicates, conflicts, resolvedConflicts } = dedupeRows(rows, duplicatePolicy);

  if (conflicts.length) {
    throw new Error(`Conflicting duplicate UJB codes found: ${JSON.stringify(conflicts)}`);
  }

  const targetConfig = getAdminConfigFromKeyFile(keyFile);
  const app = admin.initializeApp(
    { credential: admin.credential.cert(targetConfig) },
    `subscription-migration-${Date.now()}`
  );
  const db = app.firestore();

  const offsetRows = offset > 0 ? unique.slice(offset) : unique;
  const selectedRows = limit > 0 ? offsetRows.slice(0, limit) : offsetRows;
  const refs = selectedRows.map((row) => db.collection(collection).doc(row.code));
  const snapshots = [];
  for (let i = 0; i < refs.length; i += 100) {
    snapshots.push(...(await db.getAll(...refs.slice(i, i + 100))));
  }

  const missing = [];
  const planned = [];
  snapshots.forEach((snap, index) => {
    const row = selectedRows[index];
    if (!snap.exists) {
      missing.push(row);
      return;
    }
    planned.push({ row, ref: refs[index], update: buildUpdate(row, snap.data() || {}) });
  });

  const summary = {
    projectId: targetConfig.projectId,
    collection,
    dryRun,
    excelPath,
    excelSha256: sha256File(excelPath),
    sheetName,
    workbookRows: rows.length,
    uniqueCodes: unique.length,
    offset,
    limit,
    duplicateCodes: duplicates,
    duplicatePolicy,
    resolvedDuplicateConflicts: resolvedConflicts,
    invalidRows: invalidRows.map((row) => ({ code: row.code, excelRow: row.excelRow })),
    missingUsers: missing.map((row) => ({
      code: row.code,
      excelRow: row.excelRow,
      name: `${row.firstName} ${row.lastName}`.trim(),
    })),
    plannedUpdates: planned.length,
    totalPaidAmount: planned.reduce((sum, item) => sum + item.row.paidMembershipAmount, 0),
    totalBalanceAmount: planned.reduce((sum, item) => sum + item.row.balanceMembershipAmount, 0),
    sampleUpdates: planned.slice(0, 5).map((item) => ({
      code: item.row.code,
      excelRow: item.row.excelRow,
      subscription: item.update.subscription,
      cosmoPayment: item.update.payment.cosmo,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!dryRun) {
    for (let i = 0; i < planned.length; i += 400) {
      const batch = db.batch();
      planned.slice(i, i + 400).forEach((item) => {
        batch.set(item.ref, item.update, { merge: true });
      });
      await batch.commit();
    }
    console.log(JSON.stringify({ written: planned.length }, null, 2));
  }

  await app.delete();
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  try {
    await Promise.all(admin.apps.map((app) => app.delete()));
  } catch {
    // ignore cleanup errors
  }
  process.exit(1);
});
