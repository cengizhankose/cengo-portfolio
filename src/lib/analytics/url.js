// URL handling for analytics payloads (ANL-03). Only campaign parameters
// reach the tool: UTM keys and `ref` are kept on the first page view of a
// visit, everything else in the query string (for example ?email=...) is
// dropped. Referrers keep origin + path only.

export const TRACKED_QUERY_PARAMS = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "ref",
]);

const MAX_PARAM_LENGTH = 200;

/** Path without query or hash, always starting with "/". */
export function cleanPath(pathname) {
  const path = String(pathname ?? "").split(/[?#]/)[0];
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * buildTrackedUrl('/', '?utm_source=linkedin&utm_medium=social&email=a%40b.c')
 * -> '/?utm_source=linkedin&utm_medium=social'
 */
export function buildTrackedUrl(pathname, search) {
  const path = cleanPath(pathname);
  let params;
  try {
    params = new URLSearchParams(search ?? "");
  } catch {
    return path;
  }

  const kept = new URLSearchParams();
  for (const [key, value] of params) {
    if (!TRACKED_QUERY_PARAMS.includes(key) || kept.has(key)) continue;
    const trimmed = value.trim().slice(0, MAX_PARAM_LENGTH);
    if (trimmed) kept.append(key, trimmed);
  }
  const query = kept.toString();
  return query ? `${path}?${query}` : path;
}

/** External referrer reduced to origin + path; "" when absent or invalid. */
export function trackedReferrer(referrer) {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}
