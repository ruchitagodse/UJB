import CryptoJS from "crypto-js";

function secretVariants(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return [];

  const unquoted = trimmed.replace(/^["']|["']$/g, "");
  return [trimmed, unquoted].filter(Boolean);
}

function getBankSecrets() {
  const keys = [
    ...secretVariants(process.env.KYC_SECRET),
    ...secretVariants(process.env.NEXT_PUBLIC_KYC_SECRET),
    "ujb-kyc-secret-key",
  ].filter(Boolean);

  return [...new Set(keys)];
}

function getBankSecret() {
  return getBankSecrets()[0];
}

function encryptValue(value) {
  if (!value) return "";
  return CryptoJS.AES.encrypt(String(value), getBankSecret()).toString();
}

function decryptValue(value) {
  if (!value) return "";

  let current = String(value);
  const secrets = getBankSecrets();

  for (let i = 0; i < 10; i += 1) {
    let changed = false;

    for (const secret of secrets) {
      try {
        const bytes = CryptoJS.AES.decrypt(current, secret);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        if (decrypted && decrypted !== current) {
          current = decrypted;
          changed = true;
          break;
        }
      } catch {
        // try next secret
      }
    }

    if (!changed) {
      break;
    }
  }

  return current;
}

export function decryptBankDetails(bankDetails) {
  if (!bankDetails || typeof bankDetails !== "object") {
    return bankDetails;
  }

  return {
    ...bankDetails,
    accountHolderName: decryptValue(bankDetails.accountHolderName),
    bankName: decryptValue(bankDetails.bankName),
    accountNumber: decryptValue(bankDetails.accountNumber),
    ifscCode: decryptValue(bankDetails.ifscCode),
  };
}

export function encryptBankDetails(bankDetails) {
  if (!bankDetails || typeof bankDetails !== "object") {
    return bankDetails;
  }

  return {
    ...bankDetails,
    accountHolderName: encryptValue(bankDetails.accountHolderName),
    bankName: encryptValue(bankDetails.bankName),
    accountNumber: encryptValue(bankDetails.accountNumber),
    ifscCode: encryptValue(bankDetails.ifscCode),
  };
}
