import { useEffect, useRef, useState } from "react";
import "./style.css";
import { VscGrabber, VscClose } from "react-icons/vsc";
import { Link, useLocation } from "react-router-dom";
import { logotext, socialprofils } from "../content_option";
import Themetoggle from "../components/themetoggle";
import { getSocialLinks } from "../components/socialicons/icons";

const MENU_ID = "site-navigation";

const NAV_ITEMS = [
  { to: "/", label: "Home" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/about", label: "About" },
  { to: "/blog", label: "Blog" },
  { to: "/contact", label: "Contact" },
];

// Same K-11 list and order as the side strip; the visible text is the name.
const SOCIAL_LINKS = getSocialLinks(socialprofils);

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Keeps Tab / Shift+Tab inside `container` while the full-screen menu is open.
// `inert` on the page content does the same in current browsers; this also
// covers browsers without `inert` (Safari < 15.5).
function keepFocusInside(container, event) {
  const items = Array.from(container.querySelectorAll(FOCUSABLE));
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
  const headerRef = useRef(null);
  const buttonRef = useRef(null);
  const firstLinkRef = useRef(null);

  // Any route change (link, back/forward) closes the menu.
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setIsOpen(false);
  }

  const closeMenu = () => setIsOpen(false);

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
      <a className="skip-link" href="#main" onClick={skipToMain}>
        Skip to content
      </a>
      <header className="fixed-top site__header" ref={headerRef}>
        <div className="d-flex align-items-center justify-content-between">
          <Link className="navbar-brand nav_ac" to="/">
            {logotext}
          </Link>
          <div className="d-flex align-items-center">
            <Themetoggle />
            <button
              ref={buttonRef}
              type="button"
              className="menu__button nav_ac"
              aria-label="Menu"
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
              <nav className="menu__container p-3" aria-label="Main menu">
                <ul className="the_menu">
                  {NAV_ITEMS.map(({ to, label }, index) => (
                    <li className="menu_item" key={to}>
                      <Link
                        ref={index === 0 ? firstLinkRef : undefined}
                        onClick={closeMenu}
                        to={to}
                        className="my-3"
                      >
                        {label}
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
            <p className="copyright m-0">copyright __ {logotext}</p>
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
