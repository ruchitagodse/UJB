"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { COLLECTIONS } from "@/lib/utility_collection";

export async function getUserDetailDocByUjbCode(db, ujbCode) {
  const fallbackPhone =
    typeof arguments[2] === "object" && arguments[2]
      ? String(arguments[2].phone || "").trim()
      : "";
  const normalizedCode = String(ujbCode || "").trim();

  if (!normalizedCode) {
    return null;
  }

  const directRef = doc(db, COLLECTIONS.userDetail, normalizedCode);
  const directSnap = await getDoc(directRef);

  if (directSnap.exists()) {
    return {
      ref: directRef,
      snap: directSnap,
      id: directRef.id,
    };
  }

  for (const fieldName of ["UJBCode", "ujbCode", "UjbCode"]) {
    const result = await getDocs(
      query(
        collection(db, COLLECTIONS.userDetail),
        where(fieldName, "==", normalizedCode),
        limit(1)
      )
    );

    if (!result.empty) {
      const matchedSnap = result.docs[0];

      return {
        ref: matchedSnap.ref,
        snap: matchedSnap,
        id: matchedSnap.id,
      };
    }
  }

  if (fallbackPhone) {
    for (const fieldName of ["MobileNo", "phone", "Phone", "mobile"]) {
      const result = await getDocs(
        query(
          collection(db, COLLECTIONS.userDetail),
          where(fieldName, "==", fallbackPhone),
          limit(1)
        )
      );

      if (!result.empty) {
        const matchedSnap = result.docs[0];

        return {
          ref: matchedSnap.ref,
          snap: matchedSnap,
          id: matchedSnap.id,
        };
      }
    }
  }

  return null;
}

export async function updateUserDetailByUjbCode(db, ujbCode, payload) {
  const resolvedDoc = await getUserDetailDocByUjbCode(db, ujbCode);

  if (!resolvedDoc?.ref) {
    throw new Error("User profile document not found");
  }

  await updateDoc(resolvedDoc.ref, payload);
  return resolvedDoc;
}
