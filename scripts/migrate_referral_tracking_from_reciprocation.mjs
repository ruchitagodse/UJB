#!/usr/bin/env node

import fs from "fs";
import path from "path";
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

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value) {
  const digits = normalizeText(value).replace(/\D/g, "");
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, " ").toLowerCase();
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function parseEnvFile(fileName) {
  const abs = path.resolve(fileName);
  if (!fs.existsSync(abs)) return {};

  const raw = fs.readFileSync(abs, "utf8");
  const output = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}

function loadEnvFile(fileName) {
  const env = parseEnvFile(fileName);
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }
}

function getAdminConfigFromEnv(env = {}) {
  return {
    projectId: normalizeText(env.FIREBASE_PROJECT_ID),
    clientEmail: normalizeText(env.FIREBASE_CLIENT_EMAIL).replace(/^"|"$/g, ""),
    privateKey: normalizeText(env.FIREBASE_PRIVATE_KEY).replace(/^"|"$/g, "").replace(/\\n/g, "\n"),
  };
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

function validateAdminConfig(config = {}, label = "firebase") {
  if (!config.projectId || !config.clientEmail || !config.privateKey) {
    throw new Error(
      `Missing admin credentials for ${label}. Need FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.`
    );
  }
}

function chooseFirst(...values) {
  for (const v of values) {
    const t = normalizeText(v);
    if (t) return t;
  }
  return "";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDdMmYyyy(value) {
  const raw = normalizeText(value);
  if (!raw || raw.toUpperCase() === "NA") return raw;

  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let day = Number(dmy[1]);
    let month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${pad2(day)}/${pad2(month)}/${year}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
  }

  return raw;
}

function normalizeDateColumns(row = {}) {
  const dateColumns = [
    "Referral Given date",
    "Status Updated Date",
    "Payment Date ",
    "Orbiter Payment Date ",
    "Orbiter mentor Payment Date  ",
    "CosmOrbiter mentor Payment Date  ",
  ];
  const out = { ...row };
  for (const col of dateColumns) {
    if (Object.prototype.hasOwnProperty.call(out, col)) {
      out[col] = toDdMmYyyy(out[col]);
    }
  }
  return out;
}

function parseReferralSortKey(referralId) {
  const text = normalizeText(referralId);
  const m = text.match(/^(.*\/)(\d+)$/);
  if (!m) {
    return { prefix: text, seq: Number.MAX_SAFE_INTEGER };
  }
  return { prefix: m[1], seq: Number(m[2]) };
}

function compareReferralIds(a, b) {
  const ka = parseReferralSortKey(a?.["Referral Id"]);
  const kb = parseReferralSortKey(b?.["Referral Id"]);
  const prefixCmp = ka.prefix.localeCompare(kb.prefix);
  if (prefixCmp !== 0) return prefixCmp;
  if (ka.seq !== kb.seq) return ka.seq - kb.seq;
  return normalizeText(a?.["Referral Id"]).localeCompare(normalizeText(b?.["Referral Id"]));
}

function readSheet(filePath, sheetName) {
  const wb = xlsx.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Sheet not found: ${sheetName} in ${filePath}`);
  }
  return xlsx.utils.sheet_to_json(ws, { defval: "", raw: false });
}

function buildUserIndexes(users = []) {
  const byNameEmailPhone = new Map();
  const byEmailPhone = new Map();
  const byPhone = new Map();

  for (const user of users) {
    const ujbCode = chooseFirst(user.UJBCode, user.ujbCode, user.UjbCode, user.id).toUpperCase();
    if (!ujbCode) continue;

    const name = normalizeName(chooseFirst(user.Name, user.name, user.FullName, user.fullName, user.displayName));
    const email = normalizeEmail(chooseFirst(user.Email, user.email, user.primaryEmail));
    const phone = normalizePhone(chooseFirst(user.MobileNo, user.mobileNo, user.phone, user.phoneNumber, user.mobile));

    if (name && email && phone) {
      const key = `${name}|${email}|${phone}`;
      if (!byNameEmailPhone.has(key)) byNameEmailPhone.set(key, ujbCode);
    }
    if (email && phone) {
      const key = `${email}|${phone}`;
      if (!byEmailPhone.has(key)) byEmailPhone.set(key, ujbCode);
    }
    if (phone) {
      if (!byPhone.has(phone)) byPhone.set(phone, ujbCode);
    }
  }

  return { byNameEmailPhone, byEmailPhone, byPhone };
}

function resolveUjbCode(indexes, identity) {
  const name = normalizeName(identity.name);
  const email = normalizeEmail(identity.email);
  const phone = normalizePhone(identity.phone);

  if (name && email && phone) {
    const key = `${name}|${email}|${phone}`;
    const hit = indexes.byNameEmailPhone.get(key);
    if (hit) return { ujbCode: hit, via: "name+email+phone" };
  }
  if (email && phone) {
    const key = `${email}|${phone}`;
    const hit = indexes.byEmailPhone.get(key);
    if (hit) return { ujbCode: hit, via: "email+phone" };
  }
  if (phone) {
    const hit = indexes.byPhone.get(phone);
    if (hit) return { ujbCode: hit, via: "phone" };
  }

  return { ujbCode: "", via: "not_found" };
}

function buildTargetRow(baseRow = {}, srcRow = {}, codeResolvers = {}) {
  const out = { ...baseRow };

  const set = (target, source) => {
    out[target] = srcRow[source] ?? "";
  };

  set("Referral Id", "Referral Id");
  set("Referral Given date", "Referral Given date");
  set("Orbiter Name", "Partner Name");
  set("Orbiter Email", "Partner Email");
  set("Orbiter Mobile number", "Partner Mobile number");
  set("Orbiter MentOrbiter Name", "Partner Mentor Name");
  set("Orbiter MentOrbiter Email", "Partner Mentor Email");
  set("Orbiter MentOrbiter Mobile number", "Partner Mentor Mobile number");
  set("CosmOrbiter Name", "LP Name");
  set("CosmOrbiter personal  Email", "LP personal  Email");
  set("CosmOrbiter bussiness  Email", "LP bussiness  Email");
  set("CosmOrbiter  Mobile number", "LP  Mobile number");
  set("CosmOrbiter mentorbiter Name ", "LP mentor Name ");
  set("CosmOrbiter MentOrbiter Email ID", "LP mentor Email ID");
  set("CosmOrbiter MentOrbiter Contact No ", "LP Mentor Contact No ");
  set("Referral/Deal Status", "Referral/Deal Status");
  set("Status Updated Date", "Status Updated Date");
  set("Product/Service Name", "Product/Service Name");
  set("Referral Rejected Reason", "Referral Rejected Reason");
  set("Referred for (Self/Third Party) Name", "Referred for (Self/Third Party) Name");
  set("Referred for (Self/Third Party) Email", "Referred for (Self/Third Party) Email");
  set("Referred for (Self/Third Party) Mobile number", "Referred for (Self/Third Party) Mobile number");
  set("Referral Description", "Referral Description");
  set("Deal value ", "Deal value ");
  set("Agreed Percentage/ amount ", "Agreed Percentage/ amount ");
  set("Amount Recieved by CosmOrbiter ", "Amount Recieved by lp ");
  set("Payment Date ", "Payment Date ");
  set("Payment Mode ", "Payment Mode ");
  set("Amount Transfered to ujb for this deal", "Amount Transfered to ujb for this deal");
  set("Amount UJb transfered to Orbiter ", "Amount UJb transfered to partner ");
  set("Orbiter Payment Date ", "Partner Payment Date ");
  set("Orbiter Payment Mode ", "Partner Payment Mode ");
  set("Amount Ujb transfered to Orbiter mentor ", "Amount Ujb transfered to partner mentor ");
  set("Orbiter mentor Payment Date  ", "Partner mentor Payment Date  ");
  set("Orbiter mentor Payment Mode ", "Partner mentor Payment Mode ");
  set("Amount ujb transfered to CosmOrbiter mentor  ", "Amount ujb transfered to lp mentor  ");
  set("CosmOrbiter mentor Payment Date  ", "Lp mentor Payment Date  ");
  set("CosmOrbiter mentor Payment Mode ", "Lp mentor Payment Mode ");
  set("Balance remaining with UJB ", "Balance remaining with UJB ");

  out["Orbiter_ujbCode"] = codeResolvers.orbiter?.ujbCode || out["Orbiter_ujbCode"] || "";
  out["Orbiter MentOrbiter UJB Code"] = codeResolvers.orbiterMentor?.ujbCode || out["Orbiter MentOrbiter UJB Code"] || "";
  out["CosmOrbiter UJB Code"] = codeResolvers.cosmo?.ujbCode || out["CosmOrbiter UJB Code"] || "";
  out["UJB Code_CosmOrbiter MentOrbiter"] = codeResolvers.cosmoMentor?.ujbCode || out["UJB Code_CosmOrbiter MentOrbiter"] || "";

  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  const sourceFile = path.resolve(
    args.source || "json/referrel/Referral Recprocation Sheet_Latest.xlsx"
  );
  const sourceSheet = args.sourceSheet || "Referral Data";
  const finalFile = path.resolve(
    args.final || "json/referrel/ReferralTracking-Export_UJB_1760693869683.xlsx"
  );
  const finalSheet = args.finalSheet || "sheet 1";
  const outputFile = path.resolve(
    args.output || `json/referrel/ReferralTracking-Export_UJB_1760693869683.migrated.xlsx`
  );
  const dryRun = parseBoolean(args["dry-run"], false);
  const envFile = args.envFile || ".env.local";

  if (!fs.existsSync(sourceFile)) throw new Error(`Source file not found: ${sourceFile}`);
  if (!fs.existsSync(finalFile)) throw new Error(`Final file not found: ${finalFile}`);

  loadEnvFile(envFile);

  const sourceRows = readSheet(sourceFile, sourceSheet);

  const finalWb = xlsx.readFile(finalFile, { cellDates: true });
  const finalWs = finalWb.Sheets[finalSheet];
  if (!finalWs) throw new Error(`Final sheet not found: ${finalSheet}`);
  const finalRows = xlsx.utils.sheet_to_json(finalWs, { defval: "", raw: false });
  const finalHeaders = xlsx.utils.sheet_to_json(finalWs, { header: 1, range: 0 })[0] || [];

  const finalByReferralId = new Map();
  for (const row of finalRows) {
    const referralId = normalizeText(row["Referral Id"]);
    if (referralId) {
      finalByReferralId.set(referralId, row);
    }
  }

  const config = args.keyFile
    ? getAdminConfigFromKeyFile(args.keyFile)
    : getAdminConfigFromEnv(process.env);
  validateAdminConfig(config, "migration-script");

  const app = admin.initializeApp(
    { credential: admin.credential.cert(config) },
    `migration-ref-tracking-${Date.now()}`
  );

  const db = app.firestore();
  const envUserCollection = chooseFirst(
    process.env.NEXT_PUBLIC_COLLECTION_USER_DETAIL,
    process.env.NENEXT_PUBLIC_COLLECTION_USER_DETAIL
  );

  const preferredCollection =
    normalizeText(args.usersCollection) ||
    normalizeText(envUserCollection);

  async function resolveUsersCollectionName() {
    if (preferredCollection) return preferredCollection;

    const candidates = ["usersdetail", "usersDetail", "userdetail", "userDetail", "users"];
    for (const candidate of candidates) {
      try {
        const probe = await db.collection(candidate).limit(1).get();
        if (!probe.empty) return candidate;
      } catch (_) {
        // Ignore and try next candidate.
      }
    }
    return "usersdetail";
  }

  const usersCollection = await resolveUsersCollectionName();

  const usersSnap = await db.collection(usersCollection).get();
  const users = usersSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const userIndexes = buildUserIndexes(users);

  let inserted = 0;
  let skippedExisting = 0;
  let orbiterCodeResolved = 0;
  let orbiterMentorCodeResolved = 0;
  let cosmoCodeResolved = 0;
  let cosmoMentorCodeResolved = 0;

  const rowsToAppend = [];
  for (const srcRow of sourceRows) {
    const referralId = normalizeText(srcRow["Referral Id"]);
    if (!referralId) continue;
    if (finalByReferralId.has(referralId)) {
      skippedExisting += 1;
      continue;
    }

    const orbiter = resolveUjbCode(userIndexes, {
      name: srcRow["Partner Name"],
      email: srcRow["Partner Email"],
      phone: srcRow["Partner Mobile number"],
    });
    const orbiterMentor = resolveUjbCode(userIndexes, {
      name: srcRow["Partner Mentor Name"],
      email: srcRow["Partner Mentor Email"],
      phone: srcRow["Partner Mentor Mobile number"],
    });
    const cosmo = resolveUjbCode(userIndexes, {
      name: srcRow["LP Name"],
      email: chooseFirst(srcRow["LP personal  Email"], srcRow["LP bussiness  Email"]),
      phone: srcRow["LP  Mobile number"],
    });
    const cosmoMentor = resolveUjbCode(userIndexes, {
      name: srcRow["LP mentor Name "],
      email: srcRow["LP mentor Email ID"],
      phone: srcRow["LP Mentor Contact No "],
    });

    if (orbiter.ujbCode) orbiterCodeResolved += 1;
    if (orbiterMentor.ujbCode) orbiterMentorCodeResolved += 1;
    if (cosmo.ujbCode) cosmoCodeResolved += 1;
    if (cosmoMentor.ujbCode) cosmoMentorCodeResolved += 1;

    const merged = buildTargetRow({}, srcRow, {
      orbiter,
      orbiterMentor,
      cosmo,
      cosmoMentor,
    });

    inserted += 1;
    rowsToAppend.push(merged);
  }

  const mergedRows = [...finalRows, ...rowsToAppend]
    .map((row) => normalizeDateColumns(row))
    .sort(compareReferralIds);
  const outWs = xlsx.utils.json_to_sheet(mergedRows, { header: finalHeaders });

  // Keep exact final-file header order.
  xlsx.utils.sheet_add_aoa(outWs, [finalHeaders], { origin: "A1" });

  const outWb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(outWb, outWs, finalSheet);

  if (!dryRun) {
    xlsx.writeFile(outWb, outputFile);
  }

  console.log("--- Migration Summary ---");
  console.log(`Source rows scanned: ${sourceRows.length}`);
  console.log(`Final rows before: ${finalRows.length}`);
  console.log(`Final rows after: ${mergedRows.length}`);
  console.log(`Inserted rows from source: ${inserted}`);
  console.log(`Skipped source rows (Referral Id already in final): ${skippedExisting}`);
  console.log(`Orbiter_ujbCode resolved: ${orbiterCodeResolved}`);
  console.log(`Orbiter MentOrbiter UJB Code resolved: ${orbiterMentorCodeResolved}`);
  console.log(`CosmOrbiter UJB Code resolved: ${cosmoCodeResolved}`);
  console.log(`UJB Code_CosmOrbiter MentOrbiter resolved: ${cosmoMentorCodeResolved}`);
  console.log(`Users collection used: ${usersCollection}`);
  console.log(`Dry run: ${dryRun ? "YES" : "NO"}`);
  if (!dryRun) {
    console.log(`Output file: ${outputFile}`);
  }

  await app.delete();
}

main().catch((error) => {
  console.error("Migration failed:", error?.message || error);
  process.exit(1);
});
