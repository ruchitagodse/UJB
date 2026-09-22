import admin from "firebase-admin";
import fs from "node:fs";

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

const environment = process.argv[2] || "production";
const objectPath = process.argv[3] || "birthdayImages/fallback/fallbackfinal.png";
const env = parseEnv(`.env.${environment}`);

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  }),
  storageBucket: env.FIREBASE_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

const bucket = admin.storage().bucket();
const file = bucket.file(objectPath);
const [exists] = await file.exists();

console.log(JSON.stringify({ bucket: bucket.name, objectPath, exists }, null, 2));

if (exists) {
  const [metadata] = await file.getMetadata();
  console.log(
    JSON.stringify(
      {
        size: metadata.size,
        contentType: metadata.contentType,
        updated: metadata.updated,
        downloadTokens: metadata.metadata?.firebaseStorageDownloadTokens || "",
      },
      null,
      2
    )
  );
}

await admin.app().delete();
