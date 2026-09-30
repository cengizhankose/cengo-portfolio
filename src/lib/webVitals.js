// Field Web Vitals (ANL-06 + PERF-23, one implementation, web-vitals 5 API).
// Loaded only through the dynamic import in initAnalytics(), so web-vitals
// never lands in the entry chunk. Each metric becomes one
// `web_vital_reported` event: LCP, INP, CLS (+ FCP, TTFB for diagnosis).
//
// web-vitals measures the page that was loaded (the landing page); SPA
// navigations are not measured separately. page_type and ui_locale therefore
// describe the landing page, read from the route table through pageType.js
// (the same source as the page view hook); content_language comes from the
// page context.

import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { track } from "./analytics/index.js";
import { getPageType, getUiLocale } from "./analytics/pageType.js";

function landingPage(pathname) {
  return {
    page_type: getPageType(pathname),
    ui_locale: getUiLocale(pathname),
  };
}

function roundValue(name, value) {
  return name === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value);
}

/**
 * Registers the web-vitals listeners. `pageType` overrides the landing page
 * lookup; `pathname` defaults to the current location.
 */
export function initWebVitals({ pathname, pageType } = {}) {
  const landing = landingPage(pathname ?? window.location.pathname);
  if (pageType) landing.page_type = pageType;

  const send = ({ name, value, rating }) =>
    track("web_vital_reported", {
      metric: name,
      value: roundValue(name, value),
      rating,
      ...landing,
    });

  onLCP(send);
  onINP(send);
  onCLS(send);
  onFCP(send);
  onTTFB(send);
  return landing;
}
