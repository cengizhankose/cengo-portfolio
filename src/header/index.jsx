import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./header.module.css";
import { VscGrabber, VscClose } from "react-icons/vsc";
import { Link, NavLink, useLocation } from "react-router-dom";
import { hasPublishedCases } from "../content/projects.js";
import { logotext } from "../content/shared.js";
import Themetoggle from "../components/themetoggle";
import { LanguageSwitcher } from "../components/langswitch";
import SocialLinks from "../components/SocialLinks.jsx";
import { useLocalePath, useT, useUiLocale } from "../i18n";
import { LOCATIONS } from "../lib/analytics/events.js";

const MENU_ID = "site-navigation";

// Past this many pixels of scroll the header strip takes the page background
// (DSG-22). At the top of the page it stays clear, so the hero under it does
// not change.
const SCROLLED_AFTER = 4;

// Scroll state, read with useSyncExternalStore: the server (and the
// hydrating first render) sees the page at the top, the browser then
// re-renders with its real value, without a hydration mismatch.
const subscribeScroll = (onChange) => {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
};
const readScrolled = () => window.scrollY > SCROLLED_AFTER;

const onServer = () => false;

// Joins the class names that apply (no trailing space for a false state).
const classes = (...names) => names.filter(Boolean).join(" ");

// Menu sections: path (made language-specific with useLocalePath) and the
// nav.* dictionary key of the label.
const ALL_NAV_ITEMS = [
  { path: "/", key: "home" },
  { path: "/portfolio", key: "portfolio" },
  { path: "/about", key: "about" },
  { path: "/blog", key: "blog" },
  { path: "/contact", key: "contact" },
];

// T-10: the portfolio is in the menu while it has cases to show; with none,
// the page stays reachable by its URL (noindex, src/seo/pages/portfolio.js)
// and the link is left out. Both follow hasPublishedCases() in
// src/content/projects.js.
const NAV_ITEMS = ALL_NAV_ITEMS.filter(
  ({ path }) => path !== "/portfolio" || hasPublishedCases(),
);

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A control hidden by CSS (display: none, visibility: hidden, e.g. a
// width-dependent header item) must not become the trap's first or last
// stop. Browsers without checkVisibility (and jsdom) keep every candidate.
const isShown = (element) =>
  typeof element.checkVisibility === "function"
    ? element.checkVisibility({ visibilityProperty: true })
    : true;

// Keeps Tab / Shift+Tab inside `container` while the full-screen menu is open.
// `inert` on the page content does the same in current browsers; this also
// covers browsers without `inert` (Safari < 15.5).
function keepFocusInside(container, event) {
  const items = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    isShown,
  );
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;

  if (!container.contains(active)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

// Moves focus to <main> without changing the URL: a hash change would give
// React Router a new location and start the page fade-out (DSG-14).
function skipToMain(event) {
  const main = document.getElementById("main");
  if (!main) return;
  event.preventDefault();
  main.focus();
}

// The header bar (FE-01, DSG-18, DSG-22): brand, the navigation panel,
// language switcher, theme toggle, menu button, then the colophon.
//   - The navigation is the full-screen panel the menu button opens (FE-11),
//     at every width (owner decision 2026-10-01: the hamburger menu as before
//     the redesign, no desktop row of tabs). NavLink marks the current page
//     with aria-current="page".
//   - The colophon (profiles, privacy, copyright) is the foot of the open
//     panel.
const Headermain = () => {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPathname, setMenuPathname] = useState(pathname);
  // DSG-22: the strip gets its background once the page has scrolled (one
  // passive listener; React skips the render while the boolean is the same).
  const isScrolled = useSyncExternalStore(
    subscribeScroll,
    readScrolled,
    onServer,
  );
  const t = useT();
  const lp = useLocalePath();
  // Header, menu and footer speak the interface language (DSG-19 uiLang),
  // which differs from <html lang> on a TR post before the TR pages open.
  const uiLocale = useUiLocale();
  const headerRef = useRef(null);
  const buttonRef = useRef(null);
  const firstLinkRef = useRef(null);

  // Any route change (link, back/forward) closes the menu.
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setIsOpen(false);
  }

  // Choosing the page that is already open changes no route, so the
  // route-change focus in routes.jsx does not run and focus would drop to
  // <body>. Move it to <main> once the menu has closed (the page content is
  // inert until then).
  const focusMainAfterClose = useRef(false);
  const closeMenu = (target) => {
    if (target === pathname) focusMainAfterClose.current = true;
    setIsOpen(false);
  };

  useEffect(() => {
    if (isOpen || !focusMainAfterClose.current) return;
    focusMainAfterClose.current = false;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [isOpen]);

  // Everything that depends on the open state follows `isOpen`: body scroll
  // lock, inert page content, focus and the Escape / Tab handling. The
  // cleanup undoes all of it, so closing (or unmounting) never leaves the page
  // locked.
  useEffect(() => {
    if (!isOpen) return undefined;

    const content = document.querySelector(".page-shell");
    document.body.classList.add("scroll-locked");
    content?.setAttribute("inert", "");
    firstLinkRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      } else if (event.key === "Tab" && headerRef.current) {
        keepFocusInside(headerRef.current, event);
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("scroll-locked");
      content?.removeAttribute("inert");
    };
  }, [isOpen]);

  const headerClass = classes(
    styles.siteHeader,
    isScrolled && styles.isScrolled,
    isOpen && styles.isOpen,
  );

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        lang={uiLocale}
        onClick={skipToMain}
      >
        {t("a11y.skipToContent")}
      </a>
      <header className={headerClass} lang={uiLocale} ref={headerRef}>
        <div className={styles.bar}>
          <Link className={`${styles.brand} ${styles.navAction}`} to={lp("/")}>
            {logotext}
          </Link>

          <div
            id={MENU_ID}
            className={classes(
              styles.siteNavigation,
              isOpen && styles.menuOpen,
            )}
          >
            <div className={styles.menuPanel}>
              <nav aria-label={t("nav.label")}>
                <ul className={styles.menuList}>
                  {NAV_ITEMS.map(({ path, key }, index) => (
                    <li className={styles.menuItem} key={path}>
                      {/* Home is current on its own path only (`end`),
                          also on /tr. */}
                      <NavLink
                        ref={index === 0 ? firstLinkRef : undefined}
                        onClick={() => closeMenu(lp(path))}
                        to={lp(path)}
                        end={path === "/"}
                        className={() => styles.navLink}
                      >
                        {t(`nav.${key}`)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>

          <div className={styles.controls}>
            <LanguageSwitcher />
            <Themetoggle
              label={t("a11y.darkTheme")}
              className={`${styles.navAction} ${styles.themeToggle}`}
            />
            <button
              ref={buttonRef}
              type="button"
              className={`${styles.menuButton} ${styles.navAction}`}
              aria-label={t("nav.menu")}
              aria-expanded={isOpen}
              aria-controls={MENU_ID}
              onClick={() => setIsOpen((open) => !open)}
            >
              {isOpen ? (
                <VscClose aria-hidden="true" focusable="false" />
              ) : (
                <VscGrabber aria-hidden="true" focusable="false" />
              )}
            </button>
          </div>
        </div>

        <div className={styles.menuFooter}>
          {/* Same K-11 list and order as the side rail (DSG-30); the visible
              text is the channel's brand name. */}
          <SocialLinks
            variant="text"
            locale={uiLocale}
            location={LOCATIONS.MENU_FOOTER}
            className={styles.footerSocial}
          />
          <div className={styles.colophon}>
            <Link
              to={lp("/privacy")}
              className="menu_footer__privacy"
              onClick={() => closeMenu(lp("/privacy"))}
            >
              {t("nav.privacy")}
            </Link>
            {/* The year is read when the page is drawn: a prerendered page
                keeps the year of its build (PERF-03), which the browser
                corrects after hydrating instead of reporting a mismatch. */}
            <p className="copyright" suppressHydrationWarning>
              {t("footer.copyright", { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </header>
      {/* The page frame, the signature element (claudedocs/design/
          design-plan.md §7): one fixed box with a --frame-size border, over
          the header and under the skip link. Decoration only: it takes no
          pointer events and is hidden from assistive technology. */}
      <div className={styles.frame} aria-hidden="true"></div>
    </>
  );
};

export default Headermain;
