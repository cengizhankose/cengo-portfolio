import styles from "./cvlink.module.css";
import { useContent, useT, useUiLocale } from "../../i18n";
import { LOCATIONS } from "../../lib/analytics/events.js";
import { track } from "../../lib/analytics/index.js";
import ExternalLink from "../ExternalLink.jsx";

// Downloadable CV (ANL-12, K-12): the public PDF in the page's language first,
// the other language second. The files are supplied by the owner
// (public/cv/, listed in src/content/{en,tr}/cv.js): an entry whose file is not
// available is never drawn, and with none available the component renders
// nothing at all.
//
// A click is one `cv_downloaded { cv_language, location }` (ui_locale comes
// from the page context). The link is marked data-track="cv", so the delegated
// outbound listener (src/lib/analytics/outbound.js) does not count the same
// click as an outbound link.

/** The entries a visitor can download, the page language's file first. */
export function orderedCvLinks(links, locale) {
  const ready = (links ?? []).filter((link) => link?.available && link.href);
  return [
    ...ready.filter((link) => link.language === locale),
    ...ready.filter((link) => link.language !== locale),
  ];
}

export function CvLink({ link, location, primary = false }) {
  const t = useT();
  const uiLocale = useUiLocale();
  const label =
    link.language === uiLocale
      ? t("cv.download")
      : t("cv.other", { language: t(`cv.language.${link.language}`) });
  return (
    <ExternalLink
      href={link.href}
      hrefLang={link.language}
      type="application/pdf"
      data-track="cv"
      className={primary ? styles.primary : styles.secondary}
      onClick={() =>
        track("cv_downloaded", { cv_language: link.language, location })
      }
    >
      {label}
    </ExternalLink>
  );
}

// `links` replaces the content list (tests); `location` is the placement the
// event reports: 'about' | 'contact' | 'cv_page'.
export function CvLinks({ location = LOCATIONS.ABOUT, links }) {
  const content = useContent();
  const uiLocale = useUiLocale();
  const ordered = orderedCvLinks(links ?? content.cv.links, uiLocale);
  if (ordered.length === 0) return null;
  return (
    <ul className={`${styles.cvLinks} list-unstyled`}>
      {ordered.map((link, index) => (
        <li key={link.language}>
          <CvLink link={link} location={location} primary={index === 0} />
        </li>
      ))}
    </ul>
  );
}
