// FE-12 acceptance criteria (T-04 swr data layer): per-key state, cache and
// dedupe, no stale slug, separate error state, title while loading.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  POST_B,
  POST_EN,
  calls,
  deferred,
  go,
  json,
  renderBlog,
} from "./support.jsx";

const ROOT = process.cwd();

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
});

describe("FE-12 criterion 1: a 404 does not stick to the next slug", () => {
  it("/blog/yok (404) then /blog/var (200) in the same BlogPost shows 'var'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url).endsWith("/api/posts/var")
          ? json({ ...POST_EN, slug: "var", title: "Var olan yazı" })
          : json({ error: "Not found", code: "NOT_FOUND" }, 404),
      ),
    );
    renderBlog("/blog/yok");
    await screen.findByRole("heading", { level: 1, name: "Post not found" });

    await go("/blog/var");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Var olan yazı" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });
});

describe("FE-12 criterion 2: a network error is an error, not 'No posts yet'", () => {
  it("shows the error and 'Try again'; the button fetches again", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderBlog("/blog");

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByText("Posts couldn't be loaded")).toBeInTheDocument();
    expect(screen.queryByText(/No posts yet/)).not.toBeInTheDocument();
    const before = fetchMock.mock.calls.length;

    fetchMock.mockImplementation(async () => json([POST_EN]));
    await user.click(retry);

    await screen.findByRole("link", { name: "Hello world" });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("FE-12 criterion 3: cache + dedupe across navigation", () => {
  it("/blog -> /blog/x -> /blog asks /api/posts?lang=en once", async () => {
    const fetchMock = vi.fn(async (url) =>
      String(url).startsWith("/api/posts?")
        ? json([POST_EN])
        : json({ ...POST_EN, slug: "x", title: "Post x" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBlog("/blog");
    await screen.findByRole("link", { name: "Hello world" });

    await go("/blog/x");
    await screen.findByRole("heading", { level: 1, name: "Post x" });

    await go("/blog");
    // The list is on screen at once, from the cache.
    expect(screen.getByRole("link", { name: "Hello world" })).toBeVisible();
    await act(async () => {});

    const list = calls(fetchMock).filter((url) => url === "/api/posts?lang=en");
    expect(list).toHaveLength(1);
    expect(calls(fetchMock)).toEqual([
      "/api/posts?lang=en",
      "/api/posts?lang=tr&missingIn=en",
      "/api/posts/x",
    ]);
  });
});

describe("FE-12 criterion 3: the window is 5 minutes", () => {
  it("4 min later the list comes from the cache; after 5 min it refreshes once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchMock = vi.fn(async (url) =>
        String(url).startsWith("/api/posts?")
          ? json([POST_EN])
          : json({ ...POST_EN, slug: "x", title: "Post x" }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const listCalls = () =>
        calls(fetchMock).filter((url) => url === "/api/posts?lang=en").length;
      renderBlog("/blog");
      await screen.findByRole("link", { name: "Hello world" });

      await go("/blog/x");
      await screen.findByRole("heading", { level: 1, name: "Post x" });
      await act(async () => vi.advanceTimersByTime(4 * 60_000));
      await go("/blog");
      await act(async () => vi.advanceTimersByTime(50));
      expect(listCalls()).toBe(1);

      await go("/blog/x");
      await act(async () => vi.advanceTimersByTime(2 * 60_000));
      await go("/blog");
      // Stale data stays on screen while it refreshes in the background.
      expect(screen.getByRole("link", { name: "Hello world" })).toBeVisible();
      await act(async () => vi.advanceTimersByTime(50));
      await waitFor(() => expect(listCalls()).toBe(2));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("FE-12 criterion 4: a late answer for an old slug never shows", () => {
  it("/blog/a pending, move to /blog/b, a answers after b: only b is shown", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const pending = { a: deferred(), b: deferred() };
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => pending[String(url).split("/api/posts/")[1]].promise),
    );
    renderBlog("/blog/a");
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await go("/blog/b");
    await act(async () =>
      pending.b.resolve(json({ ...POST_B, slug: "b", title: "Post b" })),
    );
    await screen.findByRole("heading", { level: 1, name: "Post b" });

    await act(async () =>
      pending.a.resolve(json({ ...POST_EN, slug: "a", title: "Post a" })),
    );
    await act(async () => {});

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Post b",
    );
    expect(screen.queryByText("Post a")).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("unmounting while the request runs logs no React warning", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const pending = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending.promise),
    );
    const { unmount } = renderBlog("/blog/a");
    unmount();
    await act(async () => pending.resolve(json({ ...POST_EN, slug: "a" })));
    await act(async () => {});
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("FE-12 criterion 5: the title while loading", () => {
  it.each(["/blog", "/blog/some-post"])(
    "%s: document.title is 'Blog | Cengizhan Köse' while loading",
    async (path) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise(() => {})),
      );
      renderBlog(path);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
      await waitFor(() => expect(document.title).toBe("Blog | Cengizhan Köse"));
    },
  );
});

describe("FE-12 criterion 6: swr is the data layer, no hand-made hook", () => {
  const sourceFiles = (dir) =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(jsx?|tsx?)$/.test(entry.name) ? [path] : [];
    });

  it("package.json depends on swr", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.dependencies.swr).toMatch(/^\^?2\./);
  });

  it("nothing under src/ is called useApi (grep -rn useApi src -> 0)", () => {
    const hits = sourceFiles("src").filter((file) =>
      readFileSync(join(ROOT, file), "utf8").includes("useApi"),
    );
    expect(hits).toEqual([]);
  });

  it("the blog pages fetch nothing by hand", () => {
    for (const file of [
      "src/pages/blog/BlogHome.jsx",
      "src/pages/blog/BlogPost.jsx",
    ]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(/\bfetch\(|getJson\(|useEffect\([^)]*fetch/);
      expect(source).not.toMatch(/AbortController/);
    }
  });
});
