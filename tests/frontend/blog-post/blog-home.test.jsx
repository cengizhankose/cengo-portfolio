// The blog index after W8-SEO-blog-author-rss: the tagline under the title
// (MKT-20), the RSS link in the empty state, covers that are decoration with
// their size reserved (FE-34, DSG-29) and the list skeleton (PERF-16).
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, deferred, renderBlog } from "../blog/support.jsx";

const card = (overrides = {}) => ({
  id: 1,
  slug: "hello-world",
  title: "Hello world",
  excerpt: "An EN post.",
  lang: "en",
  translationKey: null,
  coverImage: null,
  createdAt: "2026-09-30T10:00:00.000Z",
  publishedAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T10:00:00.000Z",
  ...overrides,
});

const stubPosts = (posts) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => json(String(url).includes("lang=en&") ? [] : posts)),
  );

describe("tagline (MKT-20 criterion 4)", () => {
  it("EN /blog: the tagline is the element right after the h1", async () => {
    stubPosts([card()]);
    renderBlog("/blog");
    const h1 = await screen.findByRole("heading", { level: 1, name: "Blog" });
    const tagline = h1.nextElementSibling;
    expect(tagline).toHaveClass("blog-tagline");
    expect(tagline.textContent).toBe(
      "Notes from building web, mobile and AI products: the decisions, the numbers and what broke.",
    );
    vi.unstubAllGlobals();
  });
});

describe("empty state (MKT-20 step 5)", () => {
  it("tells the first post is on its way and links the language's feed (outside the state's own links)", async () => {
    stubPosts([]);
    const { container } = renderBlog("/blog");
    await screen.findByText("No posts yet");
    expect(
      screen.getByText("The first post is on its way."),
    ).toBeInTheDocument();
    const feed = screen.getByRole("link", { name: "Follow via RSS →" });
    expect(feed).toHaveAttribute("href", "/rss.xml");
    // The state keeps exactly its two links (Home, Contact).
    const state = container.querySelector(".status-state");
    expect(
      within(state)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/", "/contact"]);
    vi.unstubAllGlobals();
  });

  it("no feed link while there are posts", async () => {
    stubPosts([card()]);
    const { container } = renderBlog("/blog");
    await screen.findByText("Hello world");
    expect(container.querySelector(".blog-empty-feed")).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("cards (FE-34 criteria 1 and 2, DSG-29)", () => {
  it("a cover is decoration, sized, lazy and async; the date has a machine-readable value", async () => {
    stubPosts([card({ coverImage: "/blog/hello-world.png" })]);
    const { container } = renderBlog("/blog");
    await screen.findByText("Hello world");
    const cover = container.querySelector(".blog-cover");
    expect(cover).toHaveAttribute("alt", "");
    expect(cover).toHaveAttribute("width", "1200");
    expect(cover).toHaveAttribute("height", "630");
    expect(cover).toHaveAttribute("loading", "lazy");
    expect(cover).toHaveAttribute("decoding", "async");
    expect(
      [...container.querySelectorAll("time")].every((node) =>
        /^\d{4}-\d{2}-\d{2}/.test(node.dateTime),
      ),
    ).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("list skeleton (PERF-16)", () => {
  it("three card bars under the title while loading, with a hidden status line", async () => {
    const gate = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => gate.promise),
    );
    const { container } = renderBlog("/blog");
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy.querySelectorAll(".blog-skeleton__card")).toHaveLength(3);
    expect(within(busy).getByRole("status")).toHaveTextContent("Loading…");
    gate.resolve(json([card()]));
    await screen.findByText("Hello world");
    await waitFor(() =>
      expect(container.querySelector('[aria-busy="true"]')).toBeNull(),
    );
    vi.unstubAllGlobals();
  });
});
