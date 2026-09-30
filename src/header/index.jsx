import { useEffect, useRef, useState } from "react";
import "./style.css";
import { VscGrabber, VscClose } from "react-icons/vsc";
import { Link, useLocation } from "react-router-dom";
import { logotext } from "../content/shared.js";
import Themetoggle from "../components/themetoggle";
import { LanguageSwitcher } from "../components/langswitch";
import { SOCIAL_PROFILE_URLS } from "../components/socialicons";
import { getSocialLinks } from "../components/socialicons/icons";
import { useLocalePath, useT, useUiLocale } from "../i18n";

const MENU_ID = "site-navigation";

// Menu sections: path (made language-specific with useLocalePath) and the
// nav.* dictionary key of the label.
const NAV_ITEMS = [
  { path: "/", key: "home" },
  { path: "/portfolio", key: "portfolio" },
  { path: "/about", key: "about" },
  { path: "/blog", key: "blog" },
  { path: "/contact", key: "contact" },
];

// Same K-11 list and order as the side strip; the visible text is the name
// (a brand name, not translated).
const SOCIAL_LINKS = getSocialLinks(SOCIAL_PROFILE_URLS);

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

const Headermain = () => {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [menuPathname, setMenuPathname] = useState(pathname);
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

    const content = document.querySelector(".s_c");
    document.body.classList.add("ovhidden");
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
      document.body.classList.remove("ovhidden");
      content?.removeAttribute("inert");
    };
  }, [isOpen]);

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
      <header
        className="fixed-top site__header"
        lang={uiLocale}
        ref={headerRef}
      >
        <div className="d-flex align-items-center justify-content-between">
          <Link className="navbar-brand nav_ac" to={lp("/")}>
            {logotext}
          </Link>
          <div className="d-flex align-items-center">
            <LanguageSwitcher />
            <Themetoggle label={t("a11y.darkTheme")} />
            <button
              ref={buttonRef}
              type="button"
              className="menu__button nav_ac"
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

        <div
          id={MENU_ID}
          className={`site__navigation ${isOpen ? "menu__opend" : ""}`}
        >
          <div className="bg__menu h-100">
            <div className="menu__wrapper">
              <nav className="menu__container p-3" aria-label={t("nav.label")}>
                <ul className="the_menu">
                  {NAV_ITEMS.map(({ path, key }, index) => (
                    <li className="menu_item" key={path}>
                      <Link
                        ref={index === 0 ? firstLinkRef : undefined}
                        onClick={() => closeMenu(lp(path))}
                        to={lp(path)}
                        className="my-3"
                      >
                        {t(`nav.${key}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>
          <div className="menu_footer d-flex flex-column flex-md-row justify-content-between align-items-md-center position-absolute w-100 p-3">
            <ul className="menu_footer__social d-flex flex-wrap m-0 p-0">
              {SOCIAL_LINKS.map(({ id, label, url }) => (
                <li key={id}>
                  <a href={url}>{label}</a>
                </li>
              ))}
            </ul>
            <p className="copyright m-0">
              {t("footer.copyright", { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </header>
      <div className="br-top"></div>
      <div className="br-bottom"></div>
      <div className="br-left"></div>
      <div className="br-right"></div>
    </>
  );
};

export default Headermain;
