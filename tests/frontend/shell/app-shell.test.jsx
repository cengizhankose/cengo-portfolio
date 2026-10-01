// The app shell in src/app/App.jsx, the two guards the W6 code-split review
// handed to this package (FE-05 step 4):
//   - a cursor chunk that fails to load leaves the rest of the app standing
//     (CursorGate has no boundary above it otherwise);
//   - `vite:preloadError` (a lazy import that is not a page: cursor, mermaid,
//     emailjs) reloads the tab once, after lazyPage.js had its turn, without
//     cancelling the event.
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import cursorStyles from "../../../src/components/Cursor.module.css";

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
vi.mock("../../../src/components/Cursor.jsx", () => {
  throw new Error("Failed to fetch dynamically imported module: Cursor");
});
vi.mock(
  "../../../src/components/routefallback/lazyPage.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    reloadForNewRelease: vi.fn(() => true),
  }),
);

const { default: App } = await import("../../../src/app/App.jsx");
const { reloadForNewRelease } =
  await import("../../../src/components/routefallback/lazyPage.js");

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

// A fine, hovering pointer with reduced motion off: the cursor gate opens.
function matchEverything() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })),
  );
}

beforeEach(() => {
  reloadForNewRelease.mockClear();
  window.history.replaceState(null, "", "/");
  document.head.innerHTML = "<title>x</title>";
});

describe("a cursor chunk that fails to load", () => {
  it("does not unmount the app: header and page stay, the ring is just absent", async () => {
    matchEverything();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<App />);
    await waitFor(() => expect(errors).toHaveBeenCalled());
    await nextTask();

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Home page",
    );
    expect(document.querySelector(`.${cursorStyles.cursorRing}`)).toBeNull();
  });
});

describe("vite:preloadError", () => {
  function fire() {
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    return event;
  }

  it("reloads once, one task later, and leaves the event alone", async () => {
    const { unmount } = render(<App />);

    const event = fire();

    // lazyPage.js's own guard (a microtask) gets its turn first.
    expect(reloadForNewRelease).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    await nextTask();
    expect(reloadForNewRelease).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("stops listening when the app unmounts", async () => {
    const { unmount } = render(<App />);
    unmount();

    fire();
    await nextTask();

    expect(reloadForNewRelease).not.toHaveBeenCalled();
  });
});
