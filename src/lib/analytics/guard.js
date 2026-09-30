// Internal-traffic guard (ANL-16, T-13). Tracking runs only in a production
// build, only on the canonical host (K-03) and only when the browser is not
// opted out. The owner opts a browser out once with ?analytics=off; the flag
// also sets Umami's own `umami.disabled` key, which the tracker checks
// before every send.

export const OPT_OUT_KEY = "cengo:analytics-optout";
export const UMAMI_DISABLED_KEY = "umami.disabled";
export const OPT_OUT_PARAM = "analytics";

/**
 * Pure decision (truth table in tests/frontend/analytics/guard.test.js).
 * `doNotTrack` is only passed as true when the config honours DNT.
 */
export function shouldTrack({
  isProd,
  hostname,
  optedOut,
  allowedHosts,
  doNotTrack = false,
}) {
  return (
    Boolean(isProd) &&
    Array.isArray(allowedHosts) &&
    allowedHosts.includes(hostname) &&
    !optedOut &&
    !doNotTrack
  );
}

/** window.localStorage, or null when the browser blocks storage (FE-09). */
export function safeStorage(win) {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * True when this browser is opted out. Blocked or failing storage counts as
 * opted out: tracking stays off and the site keeps working.
 */
export function readOptOut(storage) {
  if (!storage) return true;
  try {
    return (
      storage.getItem(OPT_OUT_KEY) === "1" ||
      Boolean(storage.getItem(UMAMI_DISABLED_KEY))
    );
  } catch {
    return true;
  }
}

/** Browser Do Not Track, read the same way the Umami tracker reads it. */
export function readDoNotTrack(win) {
  const value =
    win?.doNotTrack ??
    win?.navigator?.doNotTrack ??
    win?.navigator?.msDoNotTrack;
  return value === 1 || value === "1" || value === "yes";
}

/**
 * Handles ?analytics=off / ?analytics=on, then removes the parameter from
 * the address bar (history state and hash are kept). Returns "off", "on" or
 * null. Never throws.
 */
export function applyOptOutParam(search, { storage, history, location } = {}) {
  let params;
  try {
    params = new URLSearchParams(search ?? "");
  } catch {
    return null;
  }
  if (!params.has(OPT_OUT_PARAM)) return null;

  const value = (params.get(OPT_OUT_PARAM) ?? "").trim().toLowerCase();
  const action = value === "off" ? "off" : value === "on" ? "on" : null;

  try {
    if (action === "off") {
      storage?.setItem(OPT_OUT_KEY, "1");
      storage?.setItem(UMAMI_DISABLED_KEY, "1");
    } else if (action === "on") {
      storage?.removeItem(OPT_OUT_KEY);
      storage?.removeItem(UMAMI_DISABLED_KEY);
    }
  } catch {
    // Storage blocked: readOptOut() already treats this browser as opted out.
  }

  try {
    params.delete(OPT_OUT_PARAM);
    const query = params.toString();
    const url = `${location.pathname}${query ? `?${query}` : ""}${location.hash ?? ""}`;
    history.replaceState(history.state, "", url);
  } catch {
    // Leaving the parameter in the address bar is harmless.
  }
  return action;
}
