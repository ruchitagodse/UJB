import {
  createFirebaseDocumentRepository,
  serializeFirestoreValue,
} from "@/lib/data/firebase/documentRepository.mjs";

function toRecord(docSnap) {
  if (!docSnap?.exists) {
    return null;
  }

  return {
    id: docSnap.id,
    ...serializeFirestoreValue(docSnap.data()),
  };
}

function toSortTime(record) {
  const value = record?.registeredAt || record?.updatedAt || null;

  if (!value) {
    return 0;
  }

  const parsed = new Date(value);
  const time = parsed.getTime();

  return Number.isNaN(time) ? 0 : time;
}

export function createFirebaseProspectRepository({ db, collectionName }) {
  if (!db) {
    throw new Error("Missing Firebase admin database");
  }

  if (!collectionName) {
    throw new Error("Missing Firebase collection name");
  }

  const documents = createFirebaseDocumentRepository({ db, collectionName });
  const collection = () => db.collection(collectionName);

  async function appendQueryResults(records, field, value) {
    const text = String(value || "").trim();

    if (!text) {
      return;
    }

    const snapshot = await collection().where(field, "==", text).get();

    snapshot.docs.forEach((docSnap) => {
      const record = toRecord(docSnap);

      if (record) {
        records.set(record.id, record);
      }
    });
  }

  return Object.freeze({
    getById: documents.getById,
    create: documents.create,
    updateById: documents.updateById,

    async listForUser({ ujbCode = "", phone = "" } = {}) {
      const records = new Map();

      await appendQueryResults(records, "mentorUjbCode", ujbCode);
      await appendQueryResults(records, "orbiterContact", phone);

      return [...records.values()].sort((left, right) => {
        return toSortTime(right) - toSortTime(left);
      });
    },
  });
}
