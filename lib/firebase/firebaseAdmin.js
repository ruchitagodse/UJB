import admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { serverEnv } from "@/lib/config/serverEnv";

let firebaseAdminInitError = null;

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serverEnv.firebaseAdmin.projectId,
        clientEmail: serverEnv.firebaseAdmin.clientEmail,
        privateKey: serverEnv.firebaseAdmin.privateKey,
      }),
      storageBucket: serverEnv.firebaseAdmin.storageBucket || undefined,
    });
  }
} catch (error) {
  firebaseAdminInitError = error;
  console.error("Firebase Admin initialization error:", error);
}

export const adminApp = admin.apps.length ? admin.app() : null;
export const adminAuth = adminApp ? admin.auth(adminApp) : null;
export const adminDb = adminApp ? admin.firestore(adminApp) : null;
export const adminStorage = adminApp ? getStorage(adminApp) : null;
export function getFirebaseAdminInitError() {
  return firebaseAdminInitError;
}
export function getAdminStorageBucket() {
  if (!adminStorage) {
    return null;
  }

  try {
    const bucketName = serverEnv.firebaseAdmin.storageBucket || undefined;
    return bucketName ? adminStorage.bucket(bucketName) : adminStorage.bucket();
  } catch (error) {
    console.error("Firebase Admin storage bucket error:", error);
    return null;
  }
}
export default adminApp;
