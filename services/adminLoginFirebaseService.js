export { auth, googleProvider, microsoftProvider } from "@/lib/firebase/firebaseClient";

export {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
