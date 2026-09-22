import { serializeFirestoreValue } from "@/lib/data/firebase/documentRepository.mjs";

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeMeetingTime(data = {}) {
  return (
    toDate(data.time) ||
    toDate(data.date) ||
    toDate(data.meetingDate) ||
    toDate(data.createdAt) ||
    toDate(data.AdminCreatedby) ||
    null
  );
}

function toRecord(docSnap) {
  if (!docSnap?.exists) {
    return null;
  }

  const data = serializeFirestoreValue(docSnap.data());
  const meetingTime = normalizeMeetingTime(data);

  return {
    id: docSnap.id,
    ...data,
    ...(meetingTime && !data.time ? { time: meetingTime.toISOString() } : {}),
  };
}

export function createFirebaseMeetingRepository({ db, collectionName }) {
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

      return snapshot.docs
        .map((docSnap) => toRecord(docSnap))
        .filter(Boolean);
    },

    async getById(id) {
      const docId = String(id || "").trim();
      if (!docId) return null;

      const snap = await collection().doc(docId).get();
      return toRecord(snap);
    },

    async isUserRegistered(eventId, phone) {
      const docId = String(eventId || "").trim();
      const phoneId = String(phone || "").trim();

      if (!docId || !phoneId) {
        return false;
      }

      const snap = await collection()
        .doc(docId)
        .collection("registeredUsers")
        .doc(phoneId)
        .get();

      return snap.exists;
    },

    async listRegisteredUsers(eventId) {
      const docId = String(eventId || "").trim();
      if (!docId) return [];

      const snapshot = await collection()
        .doc(docId)
        .collection("registeredUsers")
        .get();

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...serializeFirestoreValue(docSnap.data()),
      }));
    },

    async registerUser(eventId, registration) {
      const docId = String(eventId || "").trim();
      const phoneId = String(registration?.phone || registration?.phoneNumber || "").trim();

      if (!docId || !phoneId) {
        return { created: false, record: null };
      }

      const registeredUserRef = collection()
        .doc(docId)
        .collection("registeredUsers")
        .doc(phoneId);

      const existingSnap = await registeredUserRef.get();
      const existingData = existingSnap.exists ? serializeFirestoreValue(existingSnap.data()) : {};
      const created = !existingSnap.exists;

      const nextRecord = {
        ...existingData,
        name: String(registration?.name || existingData?.name || "").trim(),
        phone: phoneId,
        phoneNumber: phoneId,
        ujbCode: String(registration?.ujbCode || existingData?.ujbCode || "").trim(),
        category: String(registration?.category || existingData?.category || "").trim(),
        type: String(registration?.type || existingData?.type || "member").trim(),
        interestedIn:
          registration?.interestedIn && typeof registration.interestedIn === "object"
            ? registration.interestedIn
            : existingData?.interestedIn || {
                knowledgeSharing: false,
                e2a: false,
                oneToOne: false,
                none: true,
              },
        attendanceStatus: existingData?.attendanceStatus === true,
        registrationSource: String(
          registration?.registrationSource || existingData?.registrationSource || "user"
        ).trim(),
        registeredAt: existingData?.registeredAt || new Date(),
        updatedAt: new Date(),
      };

      await registeredUserRef.set(nextRecord, { merge: true });

      return {
        created,
        record: {
          id: phoneId,
          ...nextRecord,
        },
      };
    },
  });
}
