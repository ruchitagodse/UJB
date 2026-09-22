import { publicEnv } from "@/lib/config/publicEnv";
import {
  adminDb,
  getFirebaseAdminInitError,
} from "@/lib/firebase/firebaseAdmin";
import { DATA_PROVIDER_NAMES } from "@/lib/data/contracts.mjs";
import { createFirebaseConclaveRepository } from "@/lib/data/firebase/conclaveRepository.mjs";
import { createFirebaseDocumentRepository } from "@/lib/data/firebase/documentRepository.mjs";
import { createFirebaseMeetingRepository } from "@/lib/data/firebase/meetingRepository.mjs";
import { createFirebaseProspectRepository } from "@/lib/data/firebase/prospectRepository.mjs";
import { createFirebaseReferralRepository } from "@/lib/data/firebase/referralRepository.mjs";
import { createFirebaseUserRepository } from "@/lib/data/firebase/userRepository.mjs";

function createCapabilityRepository({ db, collectionName }) {
  const documents = createFirebaseDocumentRepository({ db, collectionName });

  return Object.freeze({
    getById: documents.getById,
    create: documents.create,
    updateById: documents.updateById,
  });
}

export function createFirebaseDataProvider(options = {}) {
  const db = options.db || adminDb;
  const initError =
    typeof options.getInitError === "function"
      ? options.getInitError()
      : getFirebaseAdminInitError();

  if (initError || !db) {
    const error = new Error("Firebase data provider is not configured.");
    error.cause = initError || undefined;
    error.code = "PROVIDER_UNAVAILABLE";
    throw error;
  }

  const collections = options.collections || publicEnv.collections;

  return Object.freeze({
    name: DATA_PROVIDER_NAMES.FIREBASE,
    users: createFirebaseUserRepository({
      db,
      collectionName: collections.userDetail,
    }),
    referrals: createFirebaseReferralRepository({
      db,
      collectionName: collections.referral,
    }),
    prospects: createFirebaseProspectRepository({
      db,
      collectionName: collections.prospect,
    }),
    meetings: createFirebaseMeetingRepository({
      db,
      collectionName: collections.monthlyMeeting,
    }),
    conclaves: createFirebaseConclaveRepository({
      db,
      collectionName: collections.conclaves,
    }),
    content: createCapabilityRepository({
      db,
      collectionName: collections.doorstep,
    }),
    favorites: createCapabilityRepository({
      db,
      collectionName: collections.orbiter,
    }),
    notifications: createCapabilityRepository({
      db,
      collectionName: collections.pageVisit,
    }),
  });
}
