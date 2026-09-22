import admin from "firebase-admin";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function parseEnv(filePath) {
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        let value = line.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [line.slice(0, index).trim(), value];
      })
  );
}

const environment = process.argv[2] || "development";
const sourceImagePath = process.argv[3] || "public/fallback.png";
const destination = process.argv[4] || "birthdayImages/fallback/fallback.png";
const envPath = `.env.${environment}`;
const env = parseEnv(envPath);

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  }),
  storageBucket: env.FIREBASE_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

const bucket = admin.storage().bucket();
const token = crypto.randomUUID();

await bucket.upload(path.resolve(sourceImagePath), {
  destination,
  metadata: {
    cacheControl: "public, max-age=31536000",
    contentType: "image/png",
    metadata: {
      firebaseStorageDownloadTokens: token,
    },
  },
});

const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;
console.log(url);

await admin.app().delete();
