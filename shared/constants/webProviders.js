// shared/constants/webProviders.js
// Nhiệm vụ: Hằng số nhà cung cấp Web.
// Khớp với đặc tả dự án:
//   - Web: Tavily, SerpJet, Brave Search
//   - KHÔNG tự đổi tên SerpJet thành nhà cung cấp khác.

export const WEB_PROVIDERS = {
  tavily: {
    id: "tavily",
    name: "Tavily",
    prefix: "tvly-",
    baseUrl: "https://api.tavily.com",
    verifyPath: "/search",
    verifyMethod: "POST",
  },
  serpjet: {
    id: "serpjet",
    name: "SerpJet",
    prefix: "sj-",
    baseUrl: "https://api.serpjet.com",
    verifyPath: "/search",
    verifyMethod: "GET",
  },
  brave: {
    id: "brave",
    name: "Brave Search",
    prefix: "BSA",
    baseUrl: "https://api.search.brave.com/res/v1",
    verifyPath: "/web/search",
    verifyMethod: "GET",
  },
};

export const WEB_PROVIDER_IDS = Object.keys(WEB_PROVIDERS);

export function getWebProvider(id) {
  return WEB_PROVIDERS[id] || null;
}

export function detectWebProviderByPrefix(key) {
  if (!key || typeof key !== "string") return null;
  for (const id of WEB_PROVIDER_IDS) {
    if (key.startsWith(WEB_PROVIDERS[id].prefix)) return id;
  }
  return null;
}

export default {
  WEB_PROVIDERS,
  WEB_PROVIDER_IDS,
  getWebProvider,
  detectWebProviderByPrefix,
};