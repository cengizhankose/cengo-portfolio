// DSG-20 acceptance criteria (EN, today's route table): error, empty and
// not-found states render through the shared StatusState, with their own
// links, titles and robots, and pass axe. The TR half (once the TR pages are
// live) is in blog-states-tr.test.jsx.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppRoutes from "../../../src/app/routes";
import { StatusState } from "../../../src/components/statusstate";
import { POST_EN, POST_TR, json, renderBlog } from "./support.jsx";

const ROOT = process.cwd();

const robotsTags = () => document.head.querySelectorAll('meta[name="robots"]');

// jsdom has no layout: contrast and target size stay with Lighthouse.
async function violations() {
  const results = await axe.run(document, {
    rules: {
      "color-contrast": { enabled: false },
      "target-size": { enabled: false },
    },
    resultTypes: ["violations"],
  });
  return results.violations.map(({ id, nodes }) => ({
    id,
    targets: nodes.map((node) => node.target.join(" ")),
  }));
}

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
});

describe("post not found (DSG-20 criterion 1, EN)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "Not found", code: "NOT_FOUND" }, 404)),
    );
  });

  it("/blog/olmayan-yazi-xyz: h1, the two links, title and one noindex", async () => {
    renderBlog("/blog/olmayan-yazi-xyz");
    await screen.findByRole("heading", { level: 1, name: "Post not found" });

    expect(document.querySelector("h1").textContent).toBe("Post not found");
    expect(
      document.querySelectorAll(
        '.status-state a[href="/blog"], .status-state a[href="/"]',
      ),
    ).toHaveLength(2);
    await waitFor(() =>
      expect(document.title).toBe("Post not found | Cengizhan Köse"),
    );
    expect(robotsTags()).toHaveLength(1);
    expect(robotsTags()[0].getAttribute("content")).toMatch(/noindex/);
    expect(await violations()).toEqual([]);
  });
});

describe("unknown page (DSG-20 criterion 2, client half)", () => {
  it("/bilinmeyen-sayfa: 'Page not found', no Home content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([])),
    );
    render(
      <MemoryRouter initialEntries={["/bilinmeyen-sayfa"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
    expect(document.querySelector(".intro_sec")).toBeNull();
    const state = document.querySelector(".status-state");
    expect(state).toHaveClass("not-found");
    expect(within(state).getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(within(state).getByRole("link", { name: "Blog" })).toHaveAttribute(
      "href",
      "/blog",
    );
  });
});

describe("blocked API (DSG-20 criterion 3)", () => {
  it("'Try again' instead of 'No posts yet'; after the block, the button loads the cards", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderBlog("/blog");

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText(/No posts yet/)).toBeNull();
    const state = retry.closest(".status-state");
    expect(state).toHaveAttribute("role", "alert");
    expect(within(state).getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(await violations()).toEqual([]);

    fetchMock.mockImplementation(async (url) =>
      url === "/api/posts?lang=en" ? json([POST_EN]) : json([POST_TR]),
    );
    await user.click(retry);
    await screen.findByRole("link", { name: "Hello world" });
    expect(document.querySelectorAll(".blog-card")).toHaveLength(2);
    expect(document.querySelector(".status-state")).toBeNull();
  });
});

describe("one language group fails (T-12 second group)", () => {
  it("the page language's posts stay; the other group gets its own error and 'Try again'", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url) =>
      url === "/api/posts?lang=en"
        ? json([POST_EN])
        : json({ error: "Unavailable" }, 503),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBlog("/blog");

    expect(
      await screen.findByRole("link", { name: "Hello world" }),
    ).toBeVisible();
    const state = document.querySelector(".status-state");
    expect(state).toHaveClass("blog-other-error");
    expect(state).toHaveAttribute("role", "alert");
    expect(
      within(state).getByRole("heading", {
        level: 2,
        name: "Posts in Turkish couldn't be loaded",
      }),
    ).toBeInTheDocument();
    expect(
      within(state).getByText(/server couldn't answer/i),
    ).toBeInTheDocument();
    // Not the page's error, and never "No posts yet".
    expect(screen.queryByText("Posts couldn't be loaded")).toBeNull();
    expect(screen.queryByText(/No posts yet/)).toBeNull();
    expect(await violations()).toEqual([]);

    fetchMock.mockImplementation(async (url) =>
      url === "/api/posts?lang=en" ? json([POST_EN]) : json([POST_TR]),
    );
    await user.click(within(state).getByRole("button", { name: "Try again" }));
    await screen.findByRole("link", { name: "Merhaba dünya" });
    expect(document.querySelector(".status-state")).toBeNull();
    // "Try again" asked again only for the group that failed.
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/posts?lang=en"),
    ).toHaveLength(1);
  });

  it("no posts of its own and the other group fails: the page's error, not 'No posts yet'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/posts?lang=en"
          ? json([])
          : json({ error: "Unavailable" }, 503),
      ),
    );
    renderBlog("/blog");
    await screen.findByRole("heading", {
      level: 2,
      name: "Posts couldn't be loaded",
    });
    expect(screen.queryByText(/No posts yet/)).toBeNull();
    expect(document.querySelector(".status-state")).toHaveClass("blog-error");
  });
});

describe("the blog-states scenarios (DSG-20 criterion 4, EN)", () => {
  it("[] -> 'No posts yet' with links to Home and Contact", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([])),
    );
    renderBlog("/blog");
    await screen.findByText("No posts yet");
    const state = document.querySelector(".status-state");
    const links = within(state).getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/contact",
    ]);
    // Inside the blog page: the page keeps its own h1, the state is an h2
    // and not a second named region.
    expect(
      screen.getByRole("heading", { level: 1, name: "Blog" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "No posts yet" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
    await waitFor(() => expect(document.title).toBe("Blog | Cengizhan Köse"));
    expect(await violations()).toEqual([]);
  });

  it("a failing post: its own error, 'Try again', back to the blog, indexable", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => json({ error: "x" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    renderBlog("/blog/hello-world");

    await screen.findByRole("heading", {
      level: 1,
      name: "Couldn't load this post",
    });
    const state = document.querySelector(".status-state");
    expect(state).toHaveClass("blog-error");
    expect(
      within(state).getByRole("link", { name: "Back to Blog" }),
    ).toHaveAttribute("href", "/blog");
    expect(
      screen.queryByRole("heading", { name: "Post not found" }),
    ).toBeNull();
    expect(robotsTags()).toHaveLength(0);
    expect(await violations()).toEqual([]);

    fetchMock.mockImplementation(async () => json(POST_EN));
    await user.click(within(state).getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { level: 1, name: "Hello world" });
  });
});

describe("StatusState (DSG-20 step 1)", () => {
  it("a page-level state is a named section with the page's h1", () => {
    render(
      <MemoryRouter>
        <StatusState
          title="Page not found"
          message="Gone."
          actions={[{ to: "/", label: "Home" }]}
        />
      </MemoryRouter>,
    );
    const region = screen.getByRole("region", { name: "Page not found" });
    expect(region.tagName).toBe("SECTION");
    expect(region).toHaveClass("status-state", "status-state--page");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("onRetry adds 'Try again' (in the given language) and calls it", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <StatusState
          headingLevel={2}
          title="Yazılar yüklenemedi"
          lang="tr"
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { level: 2, name: "Yazılar yüklenemedi" })
        .parentElement,
    ).toHaveAttribute("lang", "tr");
  });
});

describe("no head manager, no hand-made reload state (DSG-20 criterion 5)", () => {
  const files = (dir) =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(`${dir}/${entry.name}`)
        : [`${dir}/${entry.name}`],
    );

  it('grep -rnE "Helmet|reloadKey" in statusstate, notfound and blog -> 0', () => {
    const hits = [
      ...files("src/components/statusstate"),
      ...files("src/pages/notfound"),
      ...files("src/pages/blog"),
    ].filter((file) =>
      /Helmet|reloadKey/.test(readFileSync(join(ROOT, file), "utf8")),
    );
    expect(hits).toEqual([]);
  });
});
