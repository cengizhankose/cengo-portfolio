// The one analytics API of the site (ANL-01, T-13). Every event goes through
// track(); nothing else talks to window.umami.
//
//   initAnalytics()          once, from src/main.jsx. No-op unless production
//                            build + www host + website id + not opted out.
//   track(name, props)       custom event; props are sanitised (events.js).
//   trackPageview(ctx)       SPA page view (called by ANL-07's hook, W7).
//   setPageContext(ctx)      page_type / ui_locale / content_language added to
//                            every later event.
//
// Umami runs with data-auto-track="false". In that mode the tracker keeps the
// url/title/referrer of the first load, so every send passes the current page
// explicitly through the function form of umami.track (Umami 3.4.0 tracker
// source). Analytics errors never reach the UI.

import { ANALYTICS } from "./config.js";
import {
  GLOBAL_PROPS,
  isKnownEvent,
  sanitizeProps,
  sanitizeValue,
} from "./events.js";
import {
  applyOptOutParam,
  readDoNotTrack,
  readOptOut,
  safeStorage,
  shouldTrack,
} from "./guard.js";
import { buildTrackedUrl, cleanPath, trackedReferrer } from "./url.js";

/** At most this many calls wait for the tracker script. */
export const QUEUE_LIMIT = 50;
export const TRACKER_ELEMENT_ID = "umami-tracker";

// idle -> disabled | loading -> ready | failed
let state = "idle";
let queue = [];
let pageContext = {};
let currentPage = null;
let pageviewCount = 0;

const getWindow = () => (typeof window === "undefined" ? undefined : window);

function warn(message) {
  if (import.meta.env.DEV) console.warn(`[analytics] ${message}`);
}

// Page fields for a send. Before the first trackPageview (ANL-07 lands in
// W7) they come from the live location, with the query string filtered.
function pageSnapshot() {
  if (currentPage) return { ...currentPage };
  const win = getWindow();
  if (!win) return { url: "/", title: "", referrer: "" };
  return {
    url: buildTrackedUrl(win.location.pathname, win.location.search),
    title: win.document.title,
    referrer: trackedReferrer(win.document.referrer),
  };
}

function deliver(item) {
  const umami = getWindow()?.umami;
  if (!umami || typeof umami.track !== "function") return false;
  try {
    const sent = umami.track((base) => {
      const payload = { ...base, ...item.page };
      if (item.name) {
        payload.name = item.name;
        if (item.data && Object.keys(item.data).length > 0) {
          payload.data = item.data;
        }
      }
      return payload;
    });
    if (sent && typeof sent.catch === "function") sent.catch(() => {});
  } catch {
    // Swallowed on purpose: analytics must never break the page.
  }
  return true;
}

function dispatch(item) {
  if (state === "disabled" || state === "failed") return false;
  if (state === "ready" && deliver(item)) return true;
  if (queue.length >= QUEUE_LIMIT) return false;
  queue.push(item);
  return true;
}

function flush() {
  const pending = queue;
  queue = [];
  for (const item of pending) {
    if (!deliver(item)) {
      // Tracker loaded but did not expose window.umami: keep what fits.
      if (queue.length < QUEUE_LIMIT) queue.push(item);
    }
  }
}

function injectTracker(doc, config) {
  const existing = doc.getElementById(TRACKER_ELEMENT_ID);
  if (existing) return existing;

  const script = doc.createElement("script");
  script.id = TRACKER_ELEMENT_ID;
  script.src = config.scriptSrc;
  script.defer = true;
  script.setAttribute("data-website-id", config.websiteId);
  script.setAttribute("data-auto-track", "false");
  script.setAttribute("data-domains", config.domains.join(","));
  if (config.respectDoNotTrack) {
    script.setAttribute("data-do-not-track", "true");
  }
  script.addEventListener("load", () => {
    state = "ready";
    flush();
  });
  script.addEventListener("error", () => {
    state = "failed";
    queue = [];
  });
  doc.head.appendChild(script);
  return script;
}

/**
 * Starts analytics once. Returns true when the tracker is being loaded.
 * `config` and `isProd` are injectable for tests.
 */
export function initAnalytics({
  config = ANALYTICS,
  isProd = import.meta.env.PROD,
} = {}) {
  if (state !== "idle") return state === "loading" || state === "ready";
  const win = getWindow();
  try {
    if (!win) throw new Error("no window");
    const storage = safeStorage(win);
    applyOptOutParam(win.location.search, {
      storage,
      history: win.history,
      location: win.location,
    });

    const enabled =
      config.provider === "umami" &&
      shouldTrack({
        isProd,
        hostname: win.location.hostname,
        optedOut: readOptOut(storage),
        allowedHosts: config.allowedHosts,
        doNotTrack: Boolean(config.respectDoNotTrack) && readDoNotTrack(win),
      });
    if (!enabled) {
      state = "disabled";
      queue = [];
      return false;
    }

    state = "loading";
    injectTracker(win.document, config);
    // ANL-06 / PERF-23: web-vitals stays out of the entry chunk.
    import("../webVitals.js")
      .then((module) => module.initWebVitals())
      .catch(() => {});
    return true;
  } catch {
    state = "disabled";
    queue = [];
    return false;
  }
}

/**
 * Merges page_type / ui_locale / content_language into the context sent
 * with every later event. Invalid values are ignored; null removes a key.
 */
export function setPageContext(context = {}) {
  try {
    for (const key of GLOBAL_PROPS) {
      if (!context || !Object.hasOwn(context, key)) continue;
      const value = context[key];
      if (value === undefined) continue;
      if (value === null) {
        delete pageContext[key];
        continue;
      }
      const clean = sanitizeValue(key, value);
      if (clean === undefined) {
        warn(`setPageContext: invalid ${key} "${String(value)}" ignored`);
        continue;
      }
      pageContext[key] = clean;
    }
  } catch {
    // never throws
  }
  return { ...pageContext };
}

/** Sends a custom event. Returns true when it was sent or queued. */
export function track(name, props = {}) {
  try {
    if (!isKnownEvent(name)) {
      warn(`unknown event "${String(name)}" dropped`);
      return false;
    }
    const data = sanitizeProps(name, { ...pageContext, ...props });
    return dispatch({ name, data, page: pageSnapshot() });
  } catch {
    return false;
  }
}

/**
 * Records a page view (ANL-07 calls this after the new page has rendered):
 *   1. Umami's own page view with this page's url, title and referrer;
 *   2. a `page_view` event that carries page_type / post_slug (+ context).
 * The first page view of the visit keeps UTM/ref parameters and the external
 * referrer (ANL-03); later ones send the bare path and the previous path as
 * referrer, as Umami's auto-tracking would.
 */
export function trackPageview({
  path,
  search,
  pageType,
  postSlug,
  uiLocale,
  contentLanguage,
  title,
} = {}) {
  try {
    const win = getWindow();
    const pathname = cleanPath(path ?? win?.location.pathname ?? "/");
    setPageContext({
      page_type: pageType,
      ui_locale: uiLocale,
      content_language: contentLanguage,
    });

    const previous = currentPage;
    const first = pageviewCount === 0;
    currentPage = {
      url: first
        ? buildTrackedUrl(pathname, search ?? win?.location.search ?? "")
        : pathname,
      title: title ?? win?.document.title ?? "",
      referrer: first
        ? trackedReferrer(win?.document.referrer)
        : cleanPath(previous?.url ?? "/"),
    };
    pageviewCount += 1;

    const sent = dispatch({ page: { ...currentPage } });
    track("page_view", postSlug ? { post_slug: postSlug } : {});
    return sent;
  } catch {
    return false;
  }
}
