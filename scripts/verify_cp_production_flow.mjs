import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

const workspace = process.cwd();

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

const env = parseEnvFile(path.join(workspace, ".env.production"));
const projectId = String(
  process.env.CONTRIBUTION_POINTS_FIREBASE_PROJECT_ID ||
    env.FIREBASE_PROJECT_ID ||
    ""
).trim();
const clientEmail = String(
  process.env.CONTRIBUTION_POINTS_FIREBASE_CLIENT_EMAIL ||
    env.FIREBASE_CLIENT_EMAIL ||
    ""
).trim();
const privateKey = String(
  process.env.CONTRIBUTION_POINTS_FIREBASE_PRIVATE_KEY ||
    env.FIREBASE_PRIVATE_KEY ||
    ""
)
  .replace(/\\n/g, "\n")
  .trim();
const userDetailCollection = String(
  process.env.CONTRIBUTION_POINTS_COLLECTION_USER_DETAIL ||
    env.NEXT_PUBLIC_COLLECTION_USER_DETAIL ||
    "usersdetail"
).trim();

if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing production Firebase credentials for CP verification.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});

const db = admin.firestore();

async function getCount(collectionName) {
  const snap = await db.collection(collectionName).count().get();
  return snap.data().count || 0;
}

try {
  const topLevelCollections = process.argv.includes("--list-collections")
    ? (await db.listCollections()).map((collectionRef) => collectionRef.id).sort()
    : undefined;
  const [activityCount, boardCount, logCount, memberCount] = await Promise.all([
    getCount("cpactivity"),
    getCount("CPBoard"),
    getCount("user_activity_log"),
    getCount(userDetailCollection),
  ]);

  console.log(
    JSON.stringify(
      {
        projectId,
        collections: {
          cpactivity: activityCount,
          CPBoard: boardCount,
          user_activity_log: logCount,
          [userDetailCollection]: memberCount,
        },
        topLevelCollections,
        status: "production contribution-point data path verified",
      },
      null,
      2
    )
  );
} finally {
  await admin.app().delete();
}
