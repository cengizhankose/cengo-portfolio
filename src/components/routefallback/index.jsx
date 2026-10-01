// What a route shows while its page chunk loads (PERF-04 step 3, FE-05).
//
// A direct open of /blog or /blog/<slug> renders this for the moment between
// the entry chunk and the page chunk; moving between pages keeps the old page
// on screen while the new chunk loads whenever the router wraps the
// navigation in a transition, and a hover or focus on the link has usually
// loaded the chunk already (src/lib/prefetch.js).
//
// It holds the page's height (min-height 100vh, the same rule as the blog's
// own loading placeholder, PERF-16) so the page that replaces it does not push
// anything around. The text is for screen readers only and comes from the
// dictionary in the interface language (T-12).
import { useT, useUiLocale } from "../../i18n";
import styles from "./routefallback.module.css";

export function RouteFallback() {
  const t = useT();
  const uiLocale = useUiLocale();
  return (
    <div className={styles.routeFallback} aria-busy="true" lang={uiLocale}>
      <span className="visually-hidden">{t("status.loading")}</span>
    </div>
  );
}

export default RouteFallback;
