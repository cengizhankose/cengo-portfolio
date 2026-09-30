// not_found_viewed (ANL-05): which kind of path led here and where the
// visitor came from, so broken links can be found without storing the path.
//
// requested_path_group is the coarse group from pageType.js (dotfile, php, wp,
// blog, api, other), never the path. referrer_host is a bare host name:
//   - 'internal': the visitor moved here inside the app (a link or the back
//     button; router state, location.key is not 'default') or came from
//     another page of this site;
//   - the referrer's host: a full page load that followed a link from
//     another site;
//   - 'direct': a full page load without a usable referrer (typed address,
//     bookmark, a privacy-stripped referrer, a non-web app).
import { pathGroup } from "../../lib/analytics/pageType.js";

// `locationKey` is React Router's location.key: 'default' for the first
// location of a full page load.
export function referrerHost(
  locationKey,
  { referrer = document.referrer, hostname = window.location.hostname } = {},
) {
  if (locationKey !== "default") return "internal";
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "direct";
    return url.hostname === hostname ? "internal" : url.hostname;
  } catch {
    return "direct";
  }
}

export function notFoundViewedProps(pathname, locationKey, environment) {
  return {
    requested_path_group: pathGroup(pathname),
    referrer_host: referrerHost(locationKey, environment),
  };
}
