const STORAGE_KEY = "live-drawing-lite:convex-url";

export function getConvexUrl() {
  if (typeof window === "undefined") {
    return "";
  }
  if (window.CONVEX_URL && window.CONVEX_URL !== "https://YOUR-CONVEX-DEPLOYMENT.convex.cloud") {
    return window.CONVEX_URL;
  }
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setConvexUrl(url) {
  if (typeof window === "undefined") {
    return;
  }
  window.CONVEX_URL = url;
  localStorage.setItem(STORAGE_KEY, url);
}

export function requireConvexUrl() {
  const url = getConvexUrl();
  if (!url) {
    throw new Error("Convex deployment URL is required. Configure it in the connection settings or via environment variables.");
  }
  return url;
}
