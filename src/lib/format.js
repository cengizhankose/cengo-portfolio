// Date formatting shared by the blog pages and, later, the server snapshot
// (FE-33, SEO-21, DSG-19, T-12). Pure: no React, no DOM.
//
// Dates are shown in the page's language (Intl, 'en' -> "September 30, 2026",
// 'tr' -> "30 Eylül 2026") and in the site's time zone, so a post published
// late in the evening in Istanbul never shows the next or previous day
// depending on the reader's clock.
import { DEFAULT_LOCALE } from "../seo/site.js";

export const DATE_TIME_ZONE = "Europe/Istanbul";

// BCP 47 tag for Intl: 'tr' -> 'tr-TR', anything else -> 'en-US'.
export const localeTag = (locale) => (locale === "tr" ? "tr-TR" : "en-US");

const formatters = new Map();

function dateFormatter(locale) {
  const tag = localeTag(locale);
  if (!formatters.has(tag)) {
    formatters.set(
      tag,
      new Intl.DateTimeFormat(tag, {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: DATE_TIME_ZONE,
      }),
    );
  }
  return formatters.get(tag);
}

// A valid Date for `value` (Date, ISO string or epoch ms), or null.
export function toDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// formatDate('2026-09-30T10:00:00Z', 'tr') -> "30 Eylül 2026";
// formatDate('x', 'en') -> "Invalid date". Callers render a <time> only when
// toIsoDate() returns a value, so "Invalid date" never reaches the page.
export const formatDate = (value, locale = DEFAULT_LOCALE) => {
  const date = toDate(value);
  return date ? dateFormatter(locale).format(date) : "Invalid date";
};

// Machine-readable value for <time dateTime> (SEO-21, FE-34): the full ISO
// timestamp, or "" when the value is not a date.
export function toIsoDate(value) {
  const date = toDate(value);
  return date ? date.toISOString() : "";
}
