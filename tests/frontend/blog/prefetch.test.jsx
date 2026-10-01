// PERF-14: one delegated pointerover/focusin listener starts the blog data
// request on intent (src/lib/prefetch.js, mounted by <IntentPrefetch /> in
// src/main.jsx), preloaded answers land in the app cache, and a key the
// server already sent (SWRConfig fallback, W7) is never fetched again.
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntentPrefetch } from "../../../src/hooks/useIntentPrefetch";
import { PRELOAD_TTL_MS } from "../../../src/hooks/usePosts.js";
import { track } from "../../../src/lib/analytics";
import {
  PREFETCH_SELECTOR,
  installIntentPrefetch,
  keysForRoute,
} from "../../../src/lib/prefetch.js";
import { matchRoute } from "../../../src/seo/routes.js";
import {
  POST_EN,
  POST_TR,
  calls,
  deferred,
  json,
  renderBlog,
  testSWRValue,
} from "./support.jsx";

vi.mock("../../../src/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal()),
  track: vi.fn(),
}));

const errorEvents = () =>
  track.mock.calls.filter(([name]) => name === "error_occurred");

// Records every "Loading…" that is ever put into the document.
function watchLoading() {
  const seen = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.textContent?.includes("Loading…")) seen.push(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { seen, stop: () => observer.disconnect() };
}

const Links = () => (
  <nav>
    <Link to="/blog">Blog</Link>
    <Link to="/blog/hello-world">Hello link</Link>
    <Link to="/tr/blog">TR blog (closed)</Link>
    <a href="https://example.org/blog/x">Elsewhere</a>
  </nav>
);

let fetchMock;
beforeEach(() => {
  // Preloads are kept per swr cache, and every render here gets a new one
  // (testSWRValue), so no test finds the previous test's answer.
  track.mockClear();
  document.head.innerHTML = "<title>x</title>";
  fetchMock = vi.fn(async (url) => {
    if (url === "/api/posts?lang=en") return json([POST_EN]);
    if (url === "/api/posts?lang=tr&missingIn=en") return json([POST_TR]);
    if (url === "/api/posts/hello-world") return json(POST_EN);
    return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWithPrefetch(path, swr = testSWRValue()) {
  return renderBlog(path, {
    swr,
    children: (
      <>
        <IntentPrefetch />
        <Links />
      </>
    ),
    extra: null,
  });
}

describe("which links count (keysForRoute)", () => {
  it("the blog index asks both groups, a post its own key", () => {
    expect(keysForRoute(matchRoute("/blog"))).toEqual([
      "/api/posts?lang=en",
      "/api/posts?lang=tr&missingIn=en",
    ]);
    expect(keysForRoute(matchRoute("/tr/blog/merhaba-dunya"))).toEqual([
      "/api/posts/merhaba-dunya",
    ]);
    // Closed language, other pages, 404s: nothing.
    expect(keysForRoute(matchRoute("/tr/blog"))).toEqual([]);
    expect(keysForRoute(matchRoute("/about"))).toEqual([]);
    expect(keysForRoute(matchRoute("/blog/Bad_Slug"))).toEqual([]);
    expect(PREFETCH_SELECTOR).toBe("a[href*='/blog']");
  });
});

describe("intent -> request (PERF-14 criterion 2)", () => {
  it("hovering a post link fetches it before the click; the post then renders without 'Loading…'", async () => {
    const user = userEvent.setup();
    renderWithPrefetch("/blog");
    const card = await screen.findByRole("link", { name: "Hello world" });
    fetchMock.mockClear();

    fireEvent.pointerOver(card);
    expect(calls(fetchMock)).toEqual(["/api/posts/hello-world"]);
    await act(async () => {});

    const loading = watchLoading();
    await user.click(card);
    expect(document.querySelector(".blog-post-title-full")).toHaveTextContent(
      "Hello world",
    );
    loading.stop();
    expect(loading.seen).toEqual([]);
    // The click reused the preloaded answer: still one request.
    expect(calls(fetchMock)).toEqual(["/api/posts/hello-world"]);
  });

  it("a click while the preload is in flight reuses it (one request)", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    fetchMock.mockImplementation((url) =>
      url === "/api/posts/hello-world" ? pending.promise : json([]),
    );
    renderWithPrefetch("/blog");
    await screen.findByText("No posts yet");

    const link = screen.getByRole("link", { name: "Hello link" });
    fireEvent.pointerOver(link);
    fireEvent.pointerOver(link);
    await user.click(link);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await act(async () => pending.resolve(json(POST_EN)));
    await screen.findByRole("heading", { level: 1, name: "Hello world" });
    expect(
      calls(fetchMock).filter((url) => url === "/api/posts/hello-world"),
    ).toHaveLength(1);
  });

  it("keyboard focus is intent too; the Blog link preloads both lists", async () => {
    renderWithPrefetch("/blog/hello-world");
    await screen.findByRole("heading", { level: 1, name: "Hello world" });
    fetchMock.mockClear();

    fireEvent.focusIn(screen.getByRole("link", { name: "Blog" }));
    expect(calls(fetchMock)).toEqual([
      "/api/posts?lang=en",
      "/api/posts?lang=tr&missingIn=en",
    ]);
  });

  it("no request for cached keys, closed languages, other sites or Save-Data", async () => {
    renderWithPrefetch("/blog");
    await screen.findByRole("link", { name: "Hello world" });
    fetchMock.mockClear();

    // Already in the cache (the page just loaded them).
    fireEvent.pointerOver(screen.getByRole("link", { name: "Blog" }));
    fireEvent.pointerOver(
      screen.getByRole("link", { name: "TR blog (closed)" }),
    );
    fireEvent.pointerOver(screen.getByRole("link", { name: "Elsewhere" }));
    expect(calls(fetchMock)).toEqual([]);

    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    try {
      fireEvent.pointerOver(screen.getByRole("link", { name: "Hello link" }));
      expect(calls(fetchMock)).toEqual([]);
    } finally {
      delete navigator.connection;
    }
  });

  it("a failed preload stays quiet and leaves no data behind", async () => {
    fetchMock.mockImplementation(async (url) =>
      url === "/api/posts/hello-world" ? json({ error: "x" }, 503) : json([]),
    );
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    const cache = new Map();
    const mutate = vi.fn();
    const uninstall = installIntentPrefetch({ cache, mutate });
    const link = document.createElement("a");
    link.href = "/blog/hello-world";
    document.body.append(link);
    try {
      fireEvent.pointerOver(link);
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(calls(fetchMock)).toEqual(["/api/posts/hello-world"]);
      expect(mutate).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      uninstall();
      link.remove();
      window.removeEventListener("unhandledrejection", unhandled);
    }
  });

  it("a failed hover preload is not replayed: the click asks again, shows the post, reports nothing", async () => {
    const user = userEvent.setup();
    renderWithPrefetch("/blog");
    const card = await screen.findByRole("link", { name: "Hello world" });
    fetchMock.mockClear();

    fetchMock.mockImplementationOnce(async () =>
      json({ error: "Unavailable" }, 503),
    );
    fireEvent.pointerOver(card);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(calls(fetchMock)).toEqual(["/api/posts/hello-world"]);

    await user.click(card);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Hello world" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(calls(fetchMock)).toEqual([
      "/api/posts/hello-world",
      "/api/posts/hello-world",
    ]);
    expect(errorEvents()).toEqual([]);
  });

  it("an answer older than PRELOAD_TTL_MS is shown at once and refreshed, not reused", async () => {
    const user = userEvent.setup();
    const start = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    try {
      renderWithPrefetch("/blog");
      const card = await screen.findByRole("link", { name: "Hello world" });
      fetchMock.mockClear();

      fireEvent.pointerOver(card);
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(calls(fetchMock)).toEqual(["/api/posts/hello-world"]);

      // The post changes on the server; the click comes long after the hover.
      fetchMock.mockImplementation(async (url) =>
        url === "/api/posts/hello-world"
          ? json({ ...POST_EN, title: "Hello world, edited" })
          : json([]),
      );
      clock.mockReturnValue(start + PRELOAD_TTL_MS + 1);

      const loading = watchLoading();
      await user.click(card);
      // The hover's answer is on screen at once (from the cache) ...
      expect(document.querySelector(".blog-post-title-full")).toBeTruthy();
      loading.stop();
      expect(loading.seen).toEqual([]);
      // ... and the page asks again instead of reusing it.
      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: "Hello world, edited",
        }),
      ).toBeInTheDocument();
      expect(calls(fetchMock)).toEqual([
        "/api/posts/hello-world",
        "/api/posts/hello-world",
      ]);
    } finally {
      clock.mockRestore();
    }
  });

  it("uninstall removes the listener", () => {
    const uninstall = installIntentPrefetch({ cache: new Map() });
    uninstall();
    const link = document.createElement("a");
    link.href = "/blog/another-post";
    document.body.append(link);
    fireEvent.pointerOver(link);
    link.remove();
    expect(calls(fetchMock)).toEqual([]);
  });
});

describe("server data first (PERF-14 criterion 1 '0 with the data block', T-06)", () => {
  it("keys in the SWRConfig fallback are shown at once and never fetched", async () => {
    const loading = watchLoading();
    renderWithPrefetch(
      "/blog",
      testSWRValue({
        fallback: {
          "/api/posts?lang=en": [POST_EN],
          "/api/posts?lang=tr&missingIn=en": [],
        },
      }),
    );
    expect(screen.getByRole("link", { name: "Hello world" })).toBeVisible();
    await act(async () => {});
    loading.stop();
    expect(loading.seen).toEqual([]);
    expect(calls(fetchMock)).toEqual([]);

    // Hovering the blog link does not ask again for what the server sent.
    fireEvent.pointerOver(screen.getByRole("link", { name: "Blog" }));
    expect(calls(fetchMock)).toEqual([]);
  });
});
