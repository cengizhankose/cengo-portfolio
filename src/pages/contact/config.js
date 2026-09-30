// Language independent contact settings (MKT-12).
//
// BOOKING_URL is the link to the 20-minute intro call (D8 suggests cal.com or
// Calendly). The owner has not created one yet, so it is empty and the page
// shows no booking row. To turn it on, put the https URL here; nothing else
// changes. Public by design: it ships in the bundle and on the page.
export const BOOKING_URL = "";

/**
 * The booking link to render, or "" when there is none: empty, not a URL, or
 * not https. A value that would not open safely is treated as "not set".
 */
export function bookingHref(url = BOOKING_URL) {
  if (typeof url !== "string" || url.trim() === "") return "";
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}
