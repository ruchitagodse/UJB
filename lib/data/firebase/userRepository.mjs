import {
  createFirebaseDocumentRepository,
  serializeFirestoreValue,
} from "@/lib/data/firebase/documentRepository.mjs";

export function createFirebaseUserRepository({ db, collectionName }) {
  const documents = createFirebaseDocumentRepository({ db, collectionName });
  const collection = () => db.collection(collectionName);

  async function resolveUserRecordByUjbCode(ujbCode) {
    const normalizedCode = String(ujbCode || "").trim();

    if (!normalizedCode) {
      return null;
    }

    const direct = await documents.getById(normalizedCode);
    if (direct) {
      return direct;
    }

    for (const fieldName of ["UJBCode", "ujbCode", "UjbCode"]) {
      const snapshot = await collection()
        .where(fieldName, "==", normalizedCode)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        return {
          id: docSnap.id,
          ...serializeFirestoreValue(docSnap.data()),
        };
      }
    }

    return null;
  }

  return Object.freeze({
    async listAll() {
      const snapshot = await collection().get();

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...serializeFirestoreValue(docSnap.data()),
      }));
    },

    async getByUjbCode(ujbCode) {
      return resolveUserRecordByUjbCode(ujbCode);
    },

    async createById(id, data) {
      return documents.setById(id, data || {}, { merge: false });
    },

    async updateByUjbCode(ujbCode, update) {
      const existing = await resolveUserRecordByUjbCode(ujbCode);
      const targetId = String(existing?.id || ujbCode || "").trim();

      return documents.setById(
        targetId,
        {
          ...(update || {}),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    },

    async getManyByUjbCodes(ujbCodes = []) {
      const uniqueCodes = [...new Set(
        ujbCodes
          .map((ujbCode) => String(ujbCode || "").trim())
          .filter(Boolean)
      )];

      const users = await Promise.all(
        uniqueCodes.map((ujbCode) => resolveUserRecordByUjbCode(ujbCode))
      );

      return users.filter(Boolean);
    },

    async deleteByUjbCode(ujbCode) {
      const existing = await resolveUserRecordByUjbCode(ujbCode);

      if (!existing?.id) {
        return false;
      }

      await collection().doc(existing.id).delete();
      return true;
    },
  });
}
