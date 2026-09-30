// PERF-07 step 3: the landing page has no entry animation (its LCP element
// is painted opaque in the first frame); the fade runs from the first
// pathname change on and stays on for every later page. Pages are stubs:
// this tests the shell in src/app/routes.jsx, not page content.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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
    stage: () => utils.container.querySelector(".page-transition"),
  };
}

const go = (to) => act(() => navigate(to));

// jsdom runs no CSS animations; React listens for the prefixed event there.
function finishAnimation(element) {
  for (const type of ["animationend", "webkitAnimationEnd"]) {
    fireEvent(element, new Event(type, { bubbles: true }));
  }
}

describe("page transition on the first load (PERF-07)", () => {
  it.each(["/", "/about"])(
    "%s: the landing page is shown without the entry animation",
    (path) => {
      const { stage } = renderAt(path);

      expect(stage()).toHaveClass("page-transition", "fadeIn", "is-initial");
      expect(stage()).not.toHaveClass("fadeOut");
    },
  );

  it("a hash change on the landing page keeps it still", async () => {
    const { stage } = renderAt("/");

    await go("#details");

    expect(stage()).toHaveClass("fadeIn", "is-initial");
  });

  it("the first navigation fades the landing page out and the next page in", async () => {
    const { stage } = renderAt("/");

    await go("/about");
    expect(stage()).toHaveClass("fadeOut");
    expect(stage()).not.toHaveClass("is-initial");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Home page",
    );

    await act(async () => finishAnimation(stage()));

    expect(stage()).toHaveClass("fadeIn");
    expect(stage()).not.toHaveClass("is-initial");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "About page",
    );
  });

  it("stays animated after that, also back on the landing path", async () => {
    const { stage } = renderAt("/");

    await go("/about");
    await act(async () => finishAnimation(stage()));
    await go("/");
    expect(stage()).toHaveClass("fadeOut");
    await act(async () => finishAnimation(stage()));

    expect(stage()).toHaveClass("fadeIn");
    expect(stage()).not.toHaveClass("is-initial");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Home page",
    );
  });

  it("an animation end that bubbles up from the page does not end the fade", async () => {
    const { stage } = renderAt("/");

    await go("/about");
    await act(async () =>
      finishAnimation(screen.getByRole("heading", { level: 1 })),
    );

    expect(stage()).toHaveClass("fadeOut");
    expect(stage()).not.toHaveClass("is-initial");
  });
});
