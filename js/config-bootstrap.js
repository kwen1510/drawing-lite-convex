(() => {
  if (typeof window === "undefined") {
    return;
  }

  async function fetchConfig() {
    try {
      const response = await fetch("/api/config", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      if (data && data.convexUrl && !window.CONVEX_URL) {
        window.CONVEX_URL = data.convexUrl;
        window.dispatchEvent(
          new CustomEvent("convex:config", {
            detail: { convexUrl: data.convexUrl },
          }),
        );
      }
    } catch (error) {
      console.warn("Unable to fetch Convex config from backend.", error);
    }
  }

  fetchConfig();
})();
