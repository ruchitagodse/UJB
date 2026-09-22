"use client";

import { getAnalytics, isSupported } from "firebase/analytics";
import app from "./firebaseClient";

export async function initAnalytics() {
  if (typeof window === "undefined") return;

  const supported = await isSupported();
  if (supported) {
    getAnalytics(app);
  }
}
