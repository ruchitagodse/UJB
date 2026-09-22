import { serializeFirestoreValue } from "@/lib/data/firebase/documentRepository.mjs";
import sanitizeForFirestore from "@/utils/sanitizeForFirestore";
import { getFormattedDate, parseDobInput } from "@/services/birthdayShared";

export const serializeBirthdayEntry = (docSnap) => {
  return {
    id: docSnap.id,
    ...serializeFirestoreValue(docSnap.data() || {}),
  };
};

export const fetchAllUserBirthdays = async (adminDb, userCollectionName) => {
  const userSnapshot = await adminDb.collection(userCollectionName).get();
  
  // Fetch logs for joining
  const logsSnapshot = await adminDb.collection("birthdayLogs").get();
  const sentLogs = {}; // userId -> [dates]
  logsSnapshot.forEach(doc => {
    const log = doc.data();
    if (log.userId && log.sentDate) {
      if (!sentLogs[log.userId]) sentLogs[log.userId] = [];
      sentLogs[log.userId].push(log.sentDate);
    }
  });

  const today = getFormattedDate(0);

  return userSnapshot.docs
    .map((docSnap) => {
      const data = serializeFirestoreValue(docSnap.data() || {});
      
      const userType = (data?.userType || data?.UserType || data?.user_type || "").toLowerCase();
      if (userType === "prospect") return null;

      const name = (data?.Name || "").trim();
      const phone = data?.MobileNo ? String(data.MobileNo) : "";
      const dob = data?.DOB || data?.dob || "";

      if (!name || !phone || !dob) return null;

      const wasSentToday = sentLogs[docSnap.id]?.includes(today) || false;

      return {
        id: docSnap.id,
        name,
        phone,
        email: data?.Email || "",
        photoURL: data?.ProfilePhotoURL || "",
        dob,
        canva: data.birthdayCanvaImageUrl ? {
          imageUrl: data.birthdayCanvaImageUrl,
          status: "approved",
          birthdayMessageSent: wasSentToday,
        } : null,
      };
    })
    .filter(Boolean);
};

export const fetchBirthdayUsersForAdmin = async (adminDb, userCollectionName) => {
  const snapshot = await adminDb.collection(userCollectionName).get();
  
  // Also fetch logs for the join
  const logsSnapshot = await adminDb.collection("birthdayLogs").get();
  const sentLogs = {}; // userId -> [dates]
  const userMap = new Map();
  logsSnapshot.forEach(doc => {
    const log = doc.data();
    if (log.userId && log.sentDate) {
      if (!sentLogs[log.userId]) sentLogs[log.userId] = [];
      sentLogs[log.userId].push(log.sentDate);
    }
  });

  const dayBeforeYesterday = getFormattedDate(-2);
  const yesterday = getFormattedDate(-1);
  const today = getFormattedDate(0);
  const tomorrow = getFormattedDate(1);
  const recentDates = Array.from({ length: 5 }, (_, index) => getFormattedDate(-index));

  const users = [];
  const sentIds = [];
  const unsentList = [];

  snapshot.forEach((docSnap) => {
    const data = serializeFirestoreValue(docSnap.data() || {});
    const userType = (data?.userType || data?.UserType || data?.user_type || "").toLowerCase();
    if (userType === "prospect") return;

    const name = (data?.Name || "").trim();
    const phone = data?.MobileNo ? String(data.MobileNo) : "";
    const dobStr = data?.DOB || data?.dob || "";

    if (!name || !phone || !dobStr) return;

    userMap.set(docSnap.id, {
      id: docSnap.id,
      name,
      phone,
      photoURL: data?.ProfilePhotoURL || "",
      imageUrl: data?.birthdayCanvaImageUrl || "",
    });

    const dobDate = parseDobInput(dobStr);
    if (!dobDate || Number.isNaN(dobDate.getTime())) return;

    const dayMonth = `${String(dobDate.getDate()).padStart(2, "0")}/${String(
      dobDate.getMonth() + 1
    ).padStart(2, "0")}`;

    const isInWindow = [dayBeforeYesterday, yesterday, today, tomorrow].includes(dayMonth);
    if (!isInWindow) return;

    const isTodayBirthday = dayMonth === today;
    // JOIN: Check if message was sent today for the current birthday date
    const wasSent = sentLogs[docSnap.id]?.includes(today) || false;

    const user = {
      id: docSnap.id,
      name,
      phone,
      imageUrl: data?.birthdayCanvaImageUrl || "",
      photoURL: data?.ProfilePhotoURL || "",
      dayMonth,
      birthdayMessageSent: wasSent,
      hasCanva: !!data?.birthdayCanvaImageUrl,
      status: data?.birthdayCanvaImageUrl ? "approved" : "missing",
    };

    users.push(user);

    if (user.birthdayMessageSent) {
      sentIds.push(user.id);
    } else if (dayMonth !== tomorrow) {
      unsentList.push(user);
    }
  });

  const recentSentLogs = logsSnapshot.docs
    .map((docSnap) => {
      const log = serializeFirestoreValue(docSnap.data() || {});
      const user = userMap.get(log.userId);

      if (!user || !recentDates.includes(log.sentDate)) return null;

      const timestampValue =
        typeof log.timestamp === "string"
          ? log.timestamp
          : log.timestamp instanceof Date
            ? log.timestamp.toISOString()
            : log.timestamp?.toDate?.()?.toISOString?.() || null;

      return {
        id: docSnap.id,
        userId: log.userId,
        sentDate: log.sentDate,
        status: log.status || "sent",
        timestamp: timestampValue,
        ...user,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const timeA = a.timestamp ? Date.parse(a.timestamp) : Number.NEGATIVE_INFINITY;
      const timeB = b.timestamp ? Date.parse(b.timestamp) : Number.NEGATIVE_INFINITY;

      if (timeA !== timeB) return timeB - timeA;
      return recentDates.indexOf(a.sentDate) - recentDates.indexOf(b.sentDate);
    });

  return { 
    users, 
    sentIds, 
    unsentList,
    recentSentLogs,
    dayBeforeYesterday,
    yesterday, 
    today, 
    tomorrow 
  };
};

export const fetchBirthdayEntry = async (adminDb, collectionName, id) => {
  const snap = await adminDb.collection(collectionName).doc(id).get();
  if (!snap.exists) return null;
  const data = serializeFirestoreValue(snap.data() || {});
  
  // Join with logs for status
  const logsSnap = await adminDb.collection("birthdayLogs")
    .where("userId", "==", id)
    .orderBy("sentDate", "desc")
    .limit(1)
    .get();
    
  const lastLog = logsSnap.empty ? null : logsSnap.docs[0].data();

  return {
    ...data,
    imageUrl: data.birthdayCanvaImageUrl || "",
    status: data.birthdayCanvaImageUrl ? "approved" : "missing",
    birthdayMessageSent: !!lastLog,
    birthdayMessageSentDate: lastLog?.sentDate || null,
  };
};

export const deleteBirthdayEntry = async (adminDb, collectionName, id) => {
  await adminDb.collection(collectionName).doc(id).update({
    birthdayCanvaImageUrl: "",
    birthdayCanvaRegisteredAt: null,
  });
};

export const markBirthdayMessageSent = async (adminDb, collectionName, userId, sentDate) => {
  // 1. Create a log in the new collection
  await adminDb.collection("birthdayLogs").add({
    userId,
    sentDate,
    status: "sent",
    timestamp: new Date()
  });

  // 2. Also keep a flag on the user for quick lookups (fallback)
  await adminDb.collection(collectionName).doc(userId).update({
    birthdayMessageSent: true,
    birthdayMessageSentDate: sentDate,
  });
};

export const fetchBirthdayUserOptions = async (adminDb, userCollectionName) => {
  const snapshot = await adminDb.collection(userCollectionName).get();

  return snapshot.docs
    .map((docSnap) => {
      const data = serializeFirestoreValue(docSnap.data() || {});
      const userType = (data?.userType || data?.UserType || data?.user_type || "").toLowerCase();
      if (userType === "prospect") return null;

      const name = (data?.Name || "").trim();
      const phone = data?.MobileNo ? String(data.MobileNo) : "";

      if (!name || !phone) return null;

      return {
        label: name,
        value: docSnap.id,
        phone: phone,
        email: data?.Email || "",
        photoURL: data?.ProfilePhotoURL || "",
        dob: data?.DOB || data?.dob || "",
      };
    })
    .filter(Boolean);
};

export const checkBirthdayEntryExists = async (adminDb, collectionName, userId) => {
  const snap = await adminDb.collection(collectionName).doc(userId).get();
  if (!snap.exists) return false;
  const data = snap.data();
  return !!data?.birthdayCanvaImageUrl;
};

export const saveBirthdayEntry = async (adminDb, collectionName, payload) => {
  const birthdayDate = parseDobInput(payload?.dob);
  const id = payload?.selectedUserData?.value;

  if (!id || !payload?.dob || !birthdayDate) {
    throw new Error("Missing birthday entry details");
  }

  await adminDb
    .collection(collectionName)
    .doc(id)
    .update(
      sanitizeForFirestore({
        birthdayCanvaImageUrl: payload.imageUrl || "",
        birthdayCanvaRegisteredAt: new Date(),
        birthdayMessageSent: false,
      })
    );
};

export const updateBirthdayEntry = async (adminDb, collectionName, id, payload) => {
  await adminDb
    .collection(collectionName)
    .doc(id)
    .update(
      sanitizeForFirestore({
        birthdayCanvaImageUrl: payload.imageUrl || "",
        birthdayCanvaUpdatedAt: new Date(),
      })
    );
};

export const fetchBirthdayEntries = async (adminDb, collectionName, statusFilter = null) => {
  const all = await fetchAllUserBirthdays(adminDb, collectionName);
  
  if (!statusFilter) return all;

  return all.filter(item => {
    const hasCanva = !!item.canva;
    if (statusFilter === "approved") return hasCanva;
    if (statusFilter === "pending" || statusFilter === "missing") return !hasCanva;
    return true;
  });
};

export const updateBirthdayEntryStatus = async (adminDb, collectionName, id, status) => {
  await adminDb.collection(collectionName).doc(id).update({
    birthdayCanvaStatus: status,
    birthdayCanvaStatusUpdatedAt: new Date(),
  });
};
