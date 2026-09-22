import { serializeFirestoreValue } from "@/lib/data/firebase/documentRepository.mjs";

function toRecord(docSnap) {
  if (!docSnap?.exists) {
    return null;
  }

  return {
    id: docSnap.id,
    ...serializeFirestoreValue(docSnap.data()),
  };
}

export function createFirebaseConclaveRepository({ db, collectionName }) {
  if (!db) {
    throw new Error("Missing Firebase admin database");
  }

  if (!collectionName) {
    throw new Error("Missing Firebase collection name");
  }

  const collection = () => db.collection(collectionName);

  return Object.freeze({
    async listAll() {
      const snapshot = await collection().get();
      return snapshot.docs.map((docSnap) => toRecord(docSnap)).filter(Boolean);
    },

    async getById(id) {
      const docId = String(id || "").trim();
      if (!docId) return null;

      const snap = await collection().doc(docId).get();
      return toRecord(snap);
    },

    async listMeetings(conclaveId) {
      const id = String(conclaveId || "").trim();
      if (!id) return [];

      const snapshot = await collection().doc(id).collection("meetings").get();

      return snapshot.docs
        .map((docSnap) => toRecord(docSnap))
        .filter(Boolean);
    },

    async getMeetingById(conclaveId, meetingId) {
      const cId = String(conclaveId || "").trim();
      const mId = String(meetingId || "").trim();
      if (!cId || !mId) return null;

      const snap = await collection()
        .doc(cId)
        .collection("meetings")
        .doc(mId)
        .get();

      return toRecord(snap);
    },

    async upsertMeetingResponse(conclaveId, meetingId, phone, payload) {
      const cId = String(conclaveId || "").trim();
      const mId = String(meetingId || "").trim();
      const phoneId = String(phone || "").trim();

      if (!cId || !mId || !phoneId) {
        throw new Error("Missing conclave, meeting, or phone id");
      }

      const ref = collection()
        .doc(cId)
        .collection("meetings")
        .doc(mId)
        .collection("registeredUsers")
        .doc(phoneId);

      await ref.set(
        {
          ...payload,
          phoneNumber: phoneId,
          responseTime: new Date(),
        },
        { merge: true }
      );

      const snap = await ref.get();
      return toRecord(snap);
    },
  });
}
