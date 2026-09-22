import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { publicEnv } from "@/lib/config/publicEnv";

export const firebaseConfig = publicEnv.firebase;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const microsoftProvider = new OAuthProvider("microsoft.com");
const googleProvider = new GoogleAuthProvider();

microsoftProvider.setCustomParameters({
  prompt: "select_account",
});

googleProvider.setCustomParameters({
  prompt: "select_account",
});

export {
  app,
  auth,
  db,
  storage,
  googleProvider,
  microsoftProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
};

export default app;
