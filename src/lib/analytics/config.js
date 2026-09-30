// Analytics configuration (ANL-01, T-13): self-hosted Umami at
// stats.cengizhankose.com. Values come from build-time env (Vite inlines
// VITE_* at build); nothing here is a secret:
//   VITE_UMAMI_WEBSITE_ID  public website id from the Umami dashboard (UUID).
//                          Empty = tracking off. The owner sets it only after
//                          the privacy pages are live (W9, T-09/T-13).
//   VITE_UMAMI_SRC         tracker URL, defaults to DEFAULT_SCRIPT_SRC. Only
//                          changes if the script is renamed with Umami's
//                          TRACKER_SCRIPT_NAME (CSP stays host based).

export const DEFAULT_SCRIPT_SRC = "https://stats.cengizhankose.com/script.js";

/** Canonical host (K-03). The only host that may send data. */
export const CANONICAL_HOST = "www.cengizhankose.com";

const WEBSITE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readScriptSrc(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return DEFAULT_SCRIPT_SRC;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : DEFAULT_SCRIPT_SRC;
  } catch {
    return DEFAULT_SCRIPT_SRC;
  }
}

/**
 * Builds the analytics config from an env object. A missing or malformed
 * website id turns tracking off (provider "none") instead of shipping a
 * broken tracker tag.
 */
export function readAnalyticsConfig(env = {}) {
  const rawId =
    typeof env.VITE_UMAMI_WEBSITE_ID === "string"
      ? env.VITE_UMAMI_WEBSITE_ID.trim()
      : "";
  const websiteId = WEBSITE_ID.test(rawId) ? rawId.toLowerCase() : "";

  return Object.freeze({
    provider: websiteId ? "umami" : "none",
    scriptSrc: readScriptSrc(env.VITE_UMAMI_SRC),
    websiteId,
    // Umami's own host filter (data-domains) and our guard (ANL-16).
    domains: Object.freeze([CANONICAL_HOST]),
    allowedHosts: Object.freeze([CANONICAL_HOST]),
    // Open question 6 of the analytics plan, recommended default: honour the
    // browser's Do Not Track setting (data-do-not-track + guard).
    respectDoNotTrack: true,
  });
}

export const ANALYTICS = readAnalyticsConfig({
  VITE_UMAMI_WEBSITE_ID: import.meta.env.VITE_UMAMI_WEBSITE_ID,
  VITE_UMAMI_SRC: import.meta.env.VITE_UMAMI_SRC,
});
