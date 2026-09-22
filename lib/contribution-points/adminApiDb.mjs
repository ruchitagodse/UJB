import {
  contributionPointProductionDb,
  getContributionPointProductionCollections,
  getContributionPointProductionInitError,
  getContributionPointProductionProjectId,
} from "@/lib/firebase/contributionPointProductionAdmin";

export function getContributionPointAdminDbGuard() {
  const initError = getContributionPointProductionInitError();

  if (initError || !contributionPointProductionDb) {
    return {
      ok: false,
      status: 500,
      message:
        initError?.message ||
        "Contribution point production database is not configured.",
    };
  }

  return {
    ok: true,
    db: contributionPointProductionDb,
    collections: getContributionPointProductionCollections(),
    projectId: getContributionPointProductionProjectId(),
  };
}
