export {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  Timestamp,
  query,
  orderBy,
  arrayUnion,
  where,
  getDocs,
} from "firebase/firestore";

export { auth, db } from "@/lib/firebase/firebaseClient";
