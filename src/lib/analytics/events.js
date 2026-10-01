// Event catalogue for the whole site (ANL-19, T-13). Single source of truth
// for event names, their allowed properties and every enum an event carries.
// claudedocs/analytics/tracking-plan.md documents the same catalogue and
// tests/frontend/analytics/tracking-plan.test.js keeps the two in sync.
//
// Later packages import from here and never invent event names or values:
// an unknown event is dropped by track(), an unknown property or an
// out-of-enum value is dropped by sanitizeProps().

/** page_type values (ANL-07). Independent of the /tr prefix (T-12). */
export const PAGE_TYPES = Object.freeze([
  "home",
  "about",
  "portfolio",
  "contact",
  "privacy",
  "blog_index",
  "blog_post",
  "not_found",
]);

/** Interface language, from the route prefix: /tr -> tr, none -> en (T-12). */
export const UI_LOCALES = Object.freeze(["en", "tr"]);

/** Content language: posts.lang on blog posts, the UI language elsewhere. */
export const CONTENT_LANGUAGES = Object.freeze(["en", "tr", "unknown"]);

/** K-11 channels in their fixed order, plus `other` for any other host. */
export const NETWORKS = Object.freeze([
  "linkedin",
  "github",
  "x",
  "youtube",
  "twitch",
  "instagram",
  "other",
]);

/**
 * Hosts that map to each network (outbound clicks, ANL-09) and to each
 * referrer channel (ANL-03). Subdomains such as www. and m. match too.
 */
export const NETWORK_HOSTS = Object.freeze({
  linkedin: Object.freeze(["linkedin.com", "lnkd.in"]),
  github: Object.freeze(["github.com"]),
  x: Object.freeze(["x.com", "twitter.com", "t.co"]),
  youtube: Object.freeze(["youtube.com", "youtu.be"]),
  twitch: Object.freeze(["twitch.tv"]),
  instagram: Object.freeze(["instagram.com"]),
});

/** Featured portfolio cases (K-12, 00-icerik-girdileri §4.1), in order. */
export const FEATURED_PROJECT_IDS = Object.freeze([
  "salesgym",
  "farmin",
  "effort_lab",
]);

/**
 * Stable project ids (ANL-11). Language independent and never renamed once
 * published. Candidates (§4.2) and the MKT-18 repos are reserved up front so
 * a card can be published later without an id change.
 */
export const PROJECT_IDS = Object.freeze([
  ...FEATURED_PROJECT_IDS,
  "safecall_mobile",
  "trinqa",
  "atlas_steward",
  "cycase",
  "hackathon_archive",
  "voxly",
  "road_to_doomsday",
  "bubble_writer",
]);

/** project_clicked.link_type (ANL-11). */
export const LINK_TYPES = Object.freeze(["demo", "repo", "case_study", "post"]);

/** cv_downloaded.cv_language (ANL-12). */
export const CV_LANGUAGES = Object.freeze(["en", "tr"]);

/** Contact form project type (MKT-10); also the service ids of MKT-13. */
export const PROJECT_TYPES = Object.freeze([
  "mobile",
  "web",
  "ai",
  "lead",
  "job",
  "other",
]);

/** cta_clicked.cta_id values. Language independent. */
export const CTA = Object.freeze({
  HERO_ABOUT: "hero_about", // current hero link to /about (ANL-02)
  HERO_CONTACT: "hero_contact", // hero primary CTA (ANL-02, MKT-19)
  HERO_PORTFOLIO: "hero_portfolio", // hero secondary CTA (MKT-19)
  ABOUT_CONTACT: "about_contact", // CTA that closes the About page (MKT-15)
  BLOG_END_CONTACT: "blog_end_contact", // end-of-post CTA (MKT-07)
  SERVICE_CONTACT: "service_contact", // per-service CTA, with project_type (MKT-13)
  HOME_FINAL_CONTACT: "home_final_contact", // closing CTA of the home page (MKT-03)
});
export const CTA_IDS = Object.freeze(Object.values(CTA));

/**
 * Known `location` values. The property is validated as a lower-case token
 * (see PROPS.location) so a new placement does not need an edit here, but
 * the values below are the documented ones.
 */
export const LOCATIONS = Object.freeze({
  SOCIAL_RAIL: "social_rail",
  MENU_FOOTER: "menu_footer",
  BLOG_BODY: "blog_body",
  CONTACT_PAGE: "contact_page",
  ABOUT: "about",
  CONTACT: "contact",
  CV_PAGE: "cv_page",
  OTHER: "other",
});

export const FORM_RESULTS = Object.freeze(["success", "error"]);
export const MESSAGE_LENGTH_BUCKETS = Object.freeze([
  "lt_200",
  "200_1000",
  "gt_1000",
]);
export const READ_DEPTH_PERCENTS = Object.freeze([25, 50, 75, 100]);
export const ENGAGED_SECONDS_BUCKETS = Object.freeze([
  "lt_10",
  "10_30",
  "30_60",
  "60_180",
  "180_600",
  "gt_600",
]);
export const PATH_GROUPS = Object.freeze([
  "dotfile",
  "php",
  "wp",
  "blog",
  "api",
  "other",
]);
export const ERROR_SCOPES = Object.freeze(["blog_api", "contact_api"]);
export const WEB_VITAL_METRICS = Object.freeze([
  "LCP",
  "INP",
  "CLS",
  "FCP",
  "TTFB",
]);
export const WEB_VITAL_RATINGS = Object.freeze([
  "good",
  "needs-improvement",
  "poor",
]);
export const LOCALE_SWITCH_TARGETS = Object.freeze([
  "translation",
  "blog_index",
]);
export const THEMES = Object.freeze(["dark", "light"]);

/** Longest string any property may carry (plan: "100 karakterde keser"). */
export const MAX_STRING_LENGTH = 100;

const enumOf = (values) => Object.freeze({ kind: "enum", values });
const pattern = (regex) => Object.freeze({ kind: "pattern", regex });

// lower-case identifier: social_rail, contact_page ...
const TOKEN = pattern(/^[a-z][a-z0-9_]{0,39}$/);
// status or error code: 412, network, bad_shape, list ...
const CODE = pattern(/^[A-Za-z0-9_.-]{1,40}$/);
// blog slug
const SLUG = pattern(/^[a-z0-9][a-z0-9-]{0,99}$/);
// bare host name (never a URL, never a path): example.org, direct, internal
const HOST = pattern(/^[a-z0-9][a-z0-9.-]{0,99}$/);

/** Value rule for every property that any event may carry. */
export const PROPS = Object.freeze({
  // global context (setPageContext), allowed on every event
  page_type: enumOf(PAGE_TYPES),
  ui_locale: enumOf(UI_LOCALES),
  content_language: enumOf(CONTENT_LANGUAGES),
  // event specific
  post_slug: SLUG,
  cta_id: enumOf(CTA_IDS),
  project_type: enumOf(PROJECT_TYPES),
  network: enumOf(NETWORKS),
  location: TOKEN,
  link_host: HOST,
  result: enumOf(FORM_RESULTS),
  error_code: CODE,
  message_length_bucket: enumOf(MESSAGE_LENGTH_BUCKETS),
  cv_language: enumOf(CV_LANGUAGES),
  project_id: enumOf(PROJECT_IDS),
  link_type: enumOf(LINK_TYPES),
  position: Object.freeze({ kind: "integer", min: 1, max: 100 }),
  percent: enumOf(READ_DEPTH_PERCENTS),
  engaged_seconds_bucket: enumOf(ENGAGED_SECONDS_BUCKETS),
  requested_path_group: enumOf(PATH_GROUPS),
  referrer_host: HOST,
  scope: enumOf(ERROR_SCOPES),
  endpoint: CODE,
  status: CODE,
  metric: enumOf(WEB_VITAL_METRICS),
  value: Object.freeze({ kind: "number" }),
  rating: enumOf(WEB_VITAL_RATINGS),
  from_locale: enumOf(UI_LOCALES),
  to_locale: enumOf(UI_LOCALES),
  target: enumOf(LOCALE_SWITCH_TARGETS),
  theme: enumOf(THEMES),
});

/** Context properties every event carries (B3 rule + T-12). */
export const GLOBAL_PROPS = Object.freeze([
  "page_type",
  "ui_locale",
  "content_language",
]);

/**
 * Keys that never leave the browser, whatever the event (B3 PII rule):
 * no name, e-mail, message text, phone number or IP address.
 */
export const PII_KEYS = Object.freeze([
  "name",
  "full_name",
  "first_name",
  "last_name",
  "email",
  "e_mail",
  "mail",
  "message",
  "phone",
  "phone_number",
  "tel",
  "ip",
  "ip_address",
  "address",
]);

const event = (props, priority, task) =>
  Object.freeze({ props: Object.freeze(props), priority, task });

/**
 * The 16 events (B3's 15 + locale_switched from ANL-18). `props` lists the
 * event-specific keys; GLOBAL_PROPS are allowed on top of them.
 * priority: "required" (Şart) | "nice_to_have" (İyi olur).
 */
export const EVENTS = Object.freeze({
  page_view: event(["post_slug"], "required", "ANL-07"),
  cta_clicked: event(["cta_id", "project_type"], "required", "ANL-02"),
  outbound_link_clicked: event(
    ["network", "location", "link_host"],
    "required",
    "ANL-09",
  ),
  email_link_clicked: event(["location"], "required", "ANL-02"),
  contact_form_started: event([], "required", "ANL-02"),
  contact_form_submitted: event(
    ["result", "error_code", "message_length_bucket", "project_type"],
    "required",
    "ANL-02",
  ),
  cv_downloaded: event(["cv_language", "location"], "required", "ANL-12"),
  project_clicked: event(
    ["project_id", "link_type", "position"],
    "required",
    "ANL-11",
  ),
  blog_read_progress: event(["post_slug", "percent"], "required", "ANL-10"),
  blog_post_engaged: event(
    ["post_slug", "engaged_seconds_bucket"],
    "nice_to_have",
    "ANL-10",
  ),
  not_found_viewed: event(
    ["requested_path_group", "referrer_host"],
    "required",
    "ANL-05",
  ),
  error_occurred: event(["scope", "endpoint", "status"], "required", "ANL-15"),
  web_vital_reported: event(
    ["metric", "value", "rating"],
    "required",
    "ANL-06",
  ),
  locale_switched: event(
    ["from_locale", "to_locale", "target"],
    "required",
    "ANL-18",
  ),
  nav_menu_opened: event([], "nice_to_have", "ANL-19"),
  theme_toggled: event(["theme"], "nice_to_have", "ANL-19"),
});

export const EVENT_NAMES = Object.freeze(Object.keys(EVENTS));

export function isKnownEvent(name) {
  return typeof name === "string" && Object.hasOwn(EVENTS, name);
}

function warn(message) {
  if (import.meta.env.DEV) console.warn(`[analytics] ${message}`);
}

/**
 * Returns the cleaned value for `key`, or undefined when the key is unknown
 * or the value breaks the key's rule. Strings are cut at MAX_STRING_LENGTH
 * before they are checked.
 */
export function sanitizeValue(key, value) {
  const rule = Object.hasOwn(PROPS, key) ? PROPS[key] : undefined;
  if (!rule || value === undefined || value === null) return undefined;

  switch (rule.kind) {
    case "enum":
      return rule.values.includes(value) ? value : undefined;
    case "pattern": {
      if (typeof value !== "string" && typeof value !== "number") {
        return undefined;
      }
      const text = String(value).trim().slice(0, MAX_STRING_LENGTH);
      return rule.regex.test(text) ? text : undefined;
    }
    case "integer":
      return Number.isInteger(value) && value >= rule.min && value <= rule.max
        ? value
        : undefined;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
    default:
      return undefined;
  }
}

/**
 * Keeps only the properties the event allows (its own + GLOBAL_PROPS) whose
 * values pass their rule. PII keys are refused for every event. Unknown
 * events keep nothing.
 *
 *   sanitizeProps('contact_form_submitted', { email: 'a@b.c', result: 'success' })
 *   -> { result: 'success' }
 */
export function sanitizeProps(name, props) {
  const clean = {};
  if (!isKnownEvent(name)) {
    warn(`unknown event "${String(name)}"`);
    return clean;
  }
  if (!props || typeof props !== "object") return clean;

  const allowed = new Set([...GLOBAL_PROPS, ...EVENTS[name].props]);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (PII_KEYS.includes(key) || !allowed.has(key)) {
      warn(`"${name}": property "${key}" is not allowed, dropped`);
      continue;
    }
    const cleaned = sanitizeValue(key, value);
    if (cleaned === undefined) {
      warn(`"${name}": invalid value for "${key}", dropped`);
      continue;
    }
    clean[key] = cleaned;
  }
  return clean;
}
