// PERF-13 / FE-17: a page change is one commit. The new route is rendered the
// moment the location changes (no exit animation, nothing waits for
// animationend), it plays a short entry fade, the landing page plays none
// (PERF-07), and one effect keyed on the pathname does the scroll and the
// focus. Pages are stubs: this tests the shell in src/app/routes.jsx.
import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import appStyles from "../../../src/app/App.module.css";

function stubPage(name) {
  const Page = () => <h1>{name}</h1>;
  Page.displayName = name.replace(/\s+/g, "");
  return Page;
}

vi.mock("../../../src/pages/home", () => ({ Home: stubPage("Home page") }));
vi.mock("../../../src/pages/about", () => ({ About: stubPage("About page") }));
vi.mock("../../../src/pages/portfolio", () => ({
  Portfolio: stubPage("Portfolio page"),
}));
vi.mock("../../../src/pages/contact", () => ({
  ContactUs: stubPage("Contact page"),
}));
vi.mock("../../../src/lib/analytics/usePageViewTracking.js", () => ({
  usePageViewTracking: () => {},
}));

const { default: AppRoutes } = await import("../../../src/app/routes.jsx");

let navigate;
function Links() {
  navigate = useNavigate();
  return (
    <nav aria-label="test links">
      <Link to="/">home</Link>
      <Link to="/about">about</Link>
      <Link to="/about#team">about team</Link>
      <Link to="/contact">contact</Link>
    </nav>
  );
}

function renderAt(path, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Links />
      <AppRoutes />
    </MemoryRouter>
  );
  const utils = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return {
    ...utils,
    page: () => utils.container.querySelector("[data-route]"),
    main: () => document.getElementById("main"),
  };
}

const heading = () => screen.getByRole("heading", { level: 1 });
const click = (name) => fireEvent.click(screen.getByRole("link", { name }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the landing page (PERF-07)", () => {
  it.each(["/", "/about"])("%s is shown without the entry fade", (path) => {
    const { page } = renderAt(path);

    expect(page()).toHaveAttribute("data-route", path);
    expect(page()).not.toHaveClass(appStyles.pageEnter);
    expect(page().className).toBe("");
  });

  it("stays still on a hash change", async () => {
    const { page } = renderAt("/");
    const landing = page();

    await act(async () => navigate("#details"));

    expect(page()).toBe(landing);
    expect(page()).not.toHaveClass(appStyles.pageEnter);
  });
});

describe("a page change renders the new page at once (FE-17 step 1)", () => {
  it("has the new page in the DOM right after the click, with no timer and no animationend", () => {
    const { page } = renderAt("/");
    const landing = page();

    click("about");

    expect(heading()).toHaveTextContent("About page");
    expect(screen.queryByText("Home page")).not.toBeInTheDocument();
    expect(page()).not.toBe(landing);
    expect(page()).toHaveAttribute("data-route", "/about");
  });

  it("plays the entry fade on the new page", () => {
    const { page } = renderAt("/");

    click("about");

    expect(page()).toHaveClass(appStyles.pageEnter);
  });

  it("keeps the fade for every later page, also back on the landing path", () => {
    const { page } = renderAt("/");

    click("about");
    click("home");

    expect(heading()).toHaveTextContent("Home page");
    expect(page()).toHaveAttribute("data-route", "/");
    expect(page()).toHaveClass(appStyles.pageEnter);
  });

  it("does not wait for, or react to, animation events", () => {
    const { page } = renderAt("/");

    click("about");
    for (const type of ["animationend", "webkitAnimationEnd"]) {
      fireEvent(page(), new Event(type, { bubbles: true }));
    }

    expect(heading()).toHaveTextContent("About page");
    expect(page()).toHaveAttribute("data-route", "/about");
  });
});

describe("the same page (FE-17 step 5)", () => {
  it("keeps the very same node when its own link is clicked", () => {
    const { page } = renderAt("/");
    click("about");
    const before = page();

    click("about");

    expect(page()).toBe(before);
    expect(heading()).toHaveTextContent("About page");
  });

  it("keeps the same node on a hash change and leaves the focus alone", () => {
    const { page, main } = renderAt("/");
    click("about");
    const before = page();
    const focus = vi.spyOn(main(), "focus");

    click("about team");

    expect(page()).toBe(before);
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("one scroll point (PERF-13 step 5, FE-17 step 4)", () => {
  it("does not scroll on the first load", () => {
    const scroll = vi.spyOn(window, "scrollTo");
    renderAt("/about");

    expect(scroll).not.toHaveBeenCalled();
  });

  it("scrolls to the top exactly once per page change", () => {
    const scroll = vi.spyOn(window, "scrollTo");
    renderAt("/");

    click("about");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenLastCalledWith(0, 0);

    click("contact");
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it("does not scroll again for the same page or a hash change", () => {
    const scroll = vi.spyOn(window, "scrollTo");
    renderAt("/");
    click("about");
    scroll.mockClear();

    click("about");
    click("about team");

    expect(scroll).not.toHaveBeenCalled();
  });

  it("leaves the scroll position to a URL that carries a hash", () => {
    const scroll = vi.spyOn(window, "scrollTo");
    renderAt("/");

    click("about team");

    expect(heading()).toHaveTextContent("About page");
    expect(scroll).not.toHaveBeenCalled();
  });

  it("scrolls once per page change under StrictMode", () => {
    const scroll = vi.spyOn(window, "scrollTo");
    renderAt("/", { strict: true });

    click("about");

    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("scrolls once on the back button", async () => {
    const scroll = vi.spyOn(window, "scrollTo");
    renderAt("/");
    click("about");
    scroll.mockClear();

    await act(async () => navigate(-1));

    expect(heading()).toHaveTextContent("Home page");
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});

describe("focus follows the page (FE-10)", () => {
  it("leaves the focus alone on the first load, also under StrictMode", () => {
    const { main } = renderAt("/", { strict: true });

    expect(document.activeElement).toBe(document.body);
    expect(main()).not.toBe(document.activeElement);
  });

  it("moves focus to <main> once per page change, without scrolling", () => {
    const { main } = renderAt("/");
    const focus = vi.spyOn(main(), "focus");

    click("about");

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(main());
  });

  it("moves focus once per page change under StrictMode", () => {
    const { main } = renderAt("/", { strict: true });
    const focus = vi.spyOn(main(), "focus");

    click("about");

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("keeps <main id=main tabIndex=-1> as the target", () => {
    const { main } = renderAt("/");

    expect(main()).toHaveAttribute("tabindex", "-1");
    expect(main().tagName).toBe("MAIN");
  });
});

describe("unknown paths", () => {
  it("render the not-found page inside the same wrapper", () => {
    const { page } = renderAt("/does-not-exist");

    expect(page()).toHaveAttribute("data-route", "/does-not-exist");
    expect(heading()).toHaveTextContent(/not found/i);
  });
});
