// Outbound link clicks (ANL-09, T-13): `outbound_link_clicked
// { network, location, link_host? }` for every link that leaves the site.
//
// One delegated listener on the document, in the capture phase, for `click`
// and `auxclick` (middle click opens a new tab without a click event). It
// only reads the clicked link: no preventDefault, no stopPropagation, so it
// cannot interfere with other handlers or with the navigation. Umami's
// tracker sends with fetch keepalive, so a same-tab navigation does not lose
// the event.
//
// What is sent (never the URL itself):
//   network    K-11 channel of the link's host (NETWORKS in events.js), or
//              "other" for any other host
//   location   the nearest data-analytics-location around the link
//              (social_rail, menu_footer, blog_body ...), else "other"
//   link_host  only for network "other": the bare lower-case host name
//
// Not outbound, so no event: links on this site (the same host, with or
// without www), anything that is not http(s) (mailto:, tel:, #fragments),
// and links marked data-track="project" or "cv" (they have their own
// events, ANL-11 / ANL-12).
import { LOCATIONS, NETWORKS, NETWORK_HOSTS } from "./events.js";

export const OUTBOUND_EVENT = "outbound_link_clicked";
export const LOCATION_ATTRIBUTE = "data-analytics-location";
export const EXCLUDED_TRACKS = Object.freeze(["project", "cv"]);

const OTHER = "other";
const LOCATION_TOKEN = /^[a-z][a-z0-9_]{0,39}$/;

// Holds the stop function of the document's listener, so there is one
// listener per document even when the module is evaluated twice (hot
// reload, tests that reset modules): the newest start replaces the older.
const LISTENING = Symbol.for("cengo.analytics.outbound");

const bareHost = (hostname) =>
  String(hostname ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");

const withoutWww = (hostname) => bareHost(hostname).replace(/^www\./, "");

/**
 * K-11 network of a host name; subdomains (www., m., ...) match their
 * network, anything else is "other".
 *   networkFromHost("www.linkedin.com") -> "linkedin"
 *   networkFromHost("youtu.be")         -> "youtube"
 *   networkFromHost("example.org")      -> "other"
 */
export function networkFromHost(hostname) {
  const host = bareHost(hostname);
  if (!host) return OTHER;
  for (const network of NETWORKS) {
    const hosts = NETWORK_HOSTS[network] ?? [];
    if (hosts.some((known) => host === known || host.endsWith(`.${known}`))) {
      return network;
    }
  }
  return OTHER;
}

/** The link's placement: nearest data-analytics-location, else "other". */
export function linkLocation(anchor) {
  const value = anchor
    ?.closest?.(`[${LOCATION_ATTRIBUTE}]`)
    ?.getAttribute(LOCATION_ATTRIBUTE);
  const token = typeof value === "string" ? value.trim().toLowerCase() : "";
  return LOCATION_TOKEN.test(token) ? token : LOCATIONS.OTHER;
}

/**
 * Event properties for a click on `anchor`, or null when the link is not
 * outbound. `baseUrl` resolves relative hrefs, `currentHost` is this site's
 * host name.
 */
export function outboundProps(anchor, { baseUrl, currentHost } = {}) {
  if (!anchor || typeof anchor.getAttribute !== "function") return null;
  const href = anchor.getAttribute("href");
  if (!href) return null;

  const track = (anchor.getAttribute("data-track") ?? "").trim().toLowerCase();
  if (EXCLUDED_TRACKS.includes(track)) return null;

  let url;
  try {
    url = new URL(href, baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = bareHost(url.hostname);
  if (!host || withoutWww(host) === withoutWww(currentHost)) return null;

  const network = networkFromHost(host);
  return {
    network,
    location: linkLocation(anchor),
    ...(network === OTHER ? { link_host: host } : {}),
  };
}

/**
 * Starts the delegated listener. `send(name, props)` is track() of the
 * analytics module (passed in, so this file does not import index.js).
 * Returns a function that removes the listener. A second start on the same
 * document removes the first listener.
 */
export function initOutboundTracking({
  send,
  doc = typeof document === "undefined" ? undefined : document,
} = {}) {
  if (!doc || typeof send !== "function") return () => {};
  if (typeof doc[LISTENING] === "function") doc[LISTENING]();

  const onClick = (event) => {
    try {
      // auxclick also fires for the right button (context menu): only the
      // middle button opens the link.
      if (event.type === "auxclick" && event.button !== 1) return;
      const target = event.target;
      const anchor =
        typeof target?.closest === "function"
          ? target.closest("a[href]")
          : null;
      if (!anchor) return;
      const view = doc.defaultView;
      const props = outboundProps(anchor, {
        baseUrl: doc.baseURI,
        currentHost: view?.location?.hostname ?? "",
      });
      if (props) send(OUTBOUND_EVENT, props);
    } catch {
      // Analytics never breaks a click.
    }
  };

  const options = { capture: true };
  doc.addEventListener("click", onClick, options);
  doc.addEventListener("auxclick", onClick, options);
  const stop = () => {
    doc.removeEventListener("click", onClick, options);
    doc.removeEventListener("auxclick", onClick, options);
    if (doc[LISTENING] === stop) delete doc[LISTENING];
  };
  doc[LISTENING] = stop;
  return stop;
}

/** Removes the document's outbound listener, if any (tests, teardown). */
export function stopOutboundTracking(
  doc = typeof document === "undefined" ? undefined : document,
) {
  if (typeof doc?.[LISTENING] === "function") doc[LISTENING]();
}
