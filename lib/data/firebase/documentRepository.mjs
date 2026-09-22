function assertDocumentId(id, label = "document id") {
  const text = String(id || "").trim();

  if (!text) {
    throw new Error(`Missing ${label}`);
  }

  return text;
}

export function serializeFirestoreValue(value) {
  if (!value) {
    return value;
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeFirestoreValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        serializeFirestoreValue(entry),
      ])
    );
  }

  return value;
}

function toRecord(docSnap) {
  if (!docSnap?.exists) {
    return null;
  }

  return {
    id: docSnap.id,
    ...serializeFirestoreValue(docSnap.data()),
  };
}

export function createFirebaseDocumentRepository({ db, collectionName }) {
  if (!db) {
    throw new Error("Missing Firebase admin database");
  }

  if (!collectionName) {
    throw new Error("Missing Firebase collection name");
  }

  const collection = () => db.collection(collectionName);

  return Object.freeze({
    async getById(id) {
      const docId = assertDocumentId(id);
      const snap = await collection().doc(docId).get();

      return toRecord(snap);
    },

    async create(data) {
      const docRef = await collection().add(data || {});
      const snap = await docRef.get();

      return toRecord(snap);
    },

    async setById(id, data, options = {}) {
      const docId = assertDocumentId(id);
      const docRef = collection().doc(docId);

      await docRef.set(data || {}, options);

      const snap = await docRef.get();
      return toRecord(snap);
    },

    async updateById(id, update) {
      const docId = assertDocumentId(id);
      const docRef = collection().doc(docId);

      await docRef.update(update || {});

      const snap = await docRef.get();
      return toRecord(snap);
    },
  });
}
