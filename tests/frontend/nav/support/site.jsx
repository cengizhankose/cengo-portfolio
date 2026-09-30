// Test harness for the site shell: header + routed <main> + social <aside>,
// as App.jsx composes them, inside a MemoryRouter. Test files must mock the
// page modules with ./pages.jsx before importing this file (the block at
// the top of each tests/frontend/nav/*.test.jsx that renders the site).
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import AppRoutes from "../../../../src/app/routes";
import Headermain from "../../../../src/header";

// Exposes the router location and a way to navigate from outside the header
// and the page (e.g. browser back/forward or an in-page anchor).
function RouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div
      hidden
      data-testid="router-probe"
      data-pathname={location.pathname}
      data-hash={location.hash}
    >
      <button type="button" onClick={() => navigate("/contact")}>
        probe: go to contact
      </button>
      <button type="button" onClick={() => navigate("#details")}>
        probe: change hash
      </button>
    </div>
  );
}

export function renderSite(path = "/") {
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <Headermain />
      <AppRoutes />
      <RouterProbe />
    </MemoryRouter>,
  );
  return {
    ...utils,
    menuButton: () => screen.getByRole("button", { name: "Menu" }),
    pageStage: () => utils.container.querySelector(".page-transition"),
    content: () => utils.container.querySelector(".s_c"),
  };
}

export const routerState = () => {
  const probe = screen.getByTestId("router-probe");
  return { pathname: probe.dataset.pathname, hash: probe.dataset.hash };
};

// Real browsers fire `animationend` when the CSS fade finishes. jsdom has no
// CSS animations and no AnimationEvent, so React listens for the prefixed
// `webkitAnimationEnd` there; dispatch both (React handles exactly one).
export function finishPageTransition(stage) {
  for (const type of ["animationend", "webkitAnimationEnd"]) {
    fireEvent(stage, new Event(type, { bubbles: true }));
  }
}
