// PERF-07 step 3: the landing page has no entry animation (its LCP element
// is painted opaque in the first frame); the entry fade runs from the first
// pathname change on and stays on for every later page (PERF-13 / FE-17 made
// the new route mount at once: the landing page is the wrapper without
// .page-enter). Pages are stubs: this tests the shell in src/app/routes.jsx.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import appStyles from "../../../src/app/App.module.css";

function stubPage(name) {
  const Page = () => <h1>{name}</h1>;
  Page.displayName = name.replace(/\s+/g, "");
  return Page;
}

vi.mock("../../../src/pages/home", () => ({ Home: stubPage("Home page") }));
vi.mock("../../../src/pages/about", () => ({ About: stubPage("About page") }));

const { default: AppRoutes } = await import("../../../src/app/routes.jsx");

let navigate;
function Navigator() {
  navigate = useNavigate();
  return null;
}

function renderAt(path) {
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <Navigator />
    </MemoryRouter>,
  );
  return {
    ...utils,
    stage: () => utils.container.querySelector("[data-route]"),
  };
}

const go = (to) => act(() => navigate(to));

describe("page change on the first load (PERF-07)", () => {
  it.each(["/", "/about"])(
    "%s: the landing page is shown without the entry animation",
    (path) => {
      const { stage } = renderAt(path);

      expect(stage()).toHaveAttribute("data-route", path);
      expect(stage()).not.toHaveClass(appStyles.pageEnter);
    },
  );

  it("a hash change on the landing page keeps it still", async () => {
    const { stage } = renderAt("/");
    const landing = stage();

    await go("#details");

    expect(stage()).toBe(landing);
    expect(stage()).not.toHaveClass(appStyles.pageEnter);
  });

  it("the first navigation shows the next page at once, with the entry fade", async () => {
    const { stage } = renderAt("/");

    await go("/about");

    expect(stage()).toHaveClass(appStyles.pageEnter);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "About page",
    );
  });

  it("stays animated after that, also back on the landing path", async () => {
    const { stage } = renderAt("/");

    await go("/about");
    await go("/");

    expect(stage()).toHaveAttribute("data-route", "/");
    expect(stage()).toHaveClass(appStyles.pageEnter);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Home page",
    );
  });

  it("nothing waits for an animation event", async () => {
    const { stage } = renderAt("/");

    await go("/about");
    for (const type of ["animationend", "webkitAnimationEnd"]) {
      fireEvent(
        screen.getByRole("heading", { level: 1 }),
        new Event(type, { bubbles: true }),
      );
    }

    expect(stage()).toHaveAttribute("data-route", "/about");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "About page",
    );
  });
});
