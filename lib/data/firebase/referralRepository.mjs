import {
  createFirebaseDocumentRepository,
  serializeFirestoreValue,
} from "@/lib/data/firebase/documentRepository.mjs";

function normalizeUjbCode(value) {
  return String(value || "").trim();
}

function buildChatId(firstUjbCode, secondUjbCode, referralId) {
  return [firstUjbCode, secondUjbCode].sort().join("_") + "_" + referralId;
}

function snapshotToRecords(snapshot) {
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...serializeFirestoreValue(docSnap.data()),
  }));
}

function getReferralTimestampValue(referral) {
  const parsed = new Date(referral?.timestamp || referral?.createdAt || 0).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortReferralsByLatest(referrals = []) {
  return [...referrals].sort(
    (a, b) => getReferralTimestampValue(b) - getReferralTimestampValue(a)
  );
}

export function createFirebaseReferralRepository({ db, collectionName }) {
  const documents = createFirebaseDocumentRepository({ db, collectionName });
  const ccDocuments = createFirebaseDocumentRepository({
    db,
    collectionName: "CCReferral",
  });
  const referrals = () => db.collection(collectionName);
  const chats = () => db.collection("chats");

  return Object.freeze({
    async getById(id) {
      return documents.getById(id);
    },

    async getCcById(id) {
      return ccDocuments.getById(id);
    },

    async create(data) {
      return documents.create(data);
    },

    async listAll() {
      const snapshot = await referrals().get();
      return sortReferralsByLatest(snapshotToRecords(snapshot));
    },

    async updateById(id, update) {
      return documents.updateById(id, update);
    },

    async deleteById(id) {
      await referrals().doc(String(id || "").trim()).delete();
      return true;
    },

    async updateCcById(id, update) {
      return ccDocuments.setById(id, update, { merge: true });
    },

    async listForUser(ujbCode) {
      const actorCode = normalizeUjbCode(ujbCode);

      if (!actorCode) {
        return { my: [], passed: [] };
      }

      const [mySnap, passedSnap] = await Promise.all([
        referrals().where("cosmoOrbiter.ujbCode", "==", actorCode).get(),
        referrals().where("orbiter.ujbCode", "==", actorCode).get(),
      ]);

      return {
        my: sortReferralsByLatest(snapshotToRecords(mySnap)),
        passed: sortReferralsByLatest(snapshotToRecords(passedSnap)),
      };
    },

    async listDiscussionMessages(referralId) {
      const snapshot = await referrals()
        .doc(referralId)
        .collection("discussionMessages")
        .orderBy("createdAt", "asc")
        .get();

      return snapshotToRecords(snapshot);
    },

    async addDiscussionMessage({ referralId, senderUjbCode, text }) {
      const docRef = await referrals()
        .doc(referralId)
        .collection("discussionMessages")
        .add({
          text,
          senderUjbCode,
          createdAt: new Date(),
        });
      const snap = await docRef.get();

      return {
        id: snap.id,
        ...serializeFirestoreValue(snap.data()),
      };
    },

    async listChatMessages({ referralId, currentUserUjbCode, otherUjbCode }) {
      const chatId = buildChatId(currentUserUjbCode, otherUjbCode, referralId);
      const snapshot = await chats()
        .doc(chatId)
        .collection("messages")
        .orderBy("createdAt", "asc")
        .get();

      return snapshotToRecords(snapshot);
    },

    async addChatMessage({ referralId, currentUserUjbCode, otherUjbCode, text }) {
      const chatId = buildChatId(currentUserUjbCode, otherUjbCode, referralId);
      const chatRef = chats().doc(chatId);

      await chatRef.set(
        {
          participants: [currentUserUjbCode, otherUjbCode],
          referralId,
          updatedAt: new Date(),
          lastMessage: text,
        },
        { merge: true }
      );

      const messageRef = await chatRef.collection("messages").add({
        senderUjbCode: currentUserUjbCode,
        text,
        createdAt: new Date(),
      });
      const snap = await messageRef.get();

      return {
        id: snap.id,
        ...serializeFirestoreValue(snap.data()),
      };
    },
  });
}
