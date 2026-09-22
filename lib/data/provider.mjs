import { API_ERROR_CODES } from "@/lib/api/contracts.mjs";
import { DATA_PROVIDER_NAMES } from "@/lib/data/contracts.mjs";
import { createFirebaseDataProvider } from "@/lib/data/firebase/provider.mjs";

let cachedProvider = null;

export function getDataProvider(options = {}) {
  const providerName =
    options.providerName ||
    process.env.DATA_PROVIDER ||
    DATA_PROVIDER_NAMES.FIREBASE;

  if (providerName !== DATA_PROVIDER_NAMES.FIREBASE) {
    const error = new Error(`Unsupported data provider: ${providerName}`);
    error.code = API_ERROR_CODES.PROVIDER_UNAVAILABLE;
    throw error;
  }

  if (!cachedProvider || options.disableCache) {
    cachedProvider = createFirebaseDataProvider(options);
  }

  return cachedProvider;
}

export function resetDataProviderForTests() {
  cachedProvider = null;
}
