// Smoke: blog index states with a mocked fetch (FE-22), on the swr data
// layer (W5-FE-blog-data-layer: FE-03, FE-12, ANL-15). BlogHome renders
// without an app <SWRConfig> here, so BlogDataScope gives each render its
// own cache. The detailed state tests live in tests/frontend/blog/.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import BlogHome from "../../../src/pages/blog/BlogHome";

const POSTS = [
  {
    id: 1,
    slug: "first-post",
    title: "First post",
    excerpt: "What the first post is about.",
    coverImage: null,
    createdAt: "2026-01-15T12:00:00.000Z",
  },
  {
    id: 2,
    slug: "second-post",
    title: "Second post",
    excerpt: null,
    coverImage: null,
    createdAt: "2026-02-20T12:00:00.000Z",
  },
];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderBlogHome() {
  return render(
    <MemoryRouter initialEntries={["/blog"]}>
      <BlogHome />
    </MemoryRouter>,
  );
}

describe("BlogHome (smoke)", () => {
  it("shows a loading state while the posts request is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    renderBlogHome();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows the empty state when the API returns no posts", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    renderBlogHome();

    expect(await screen.findByText(/no posts yet/i)).toBeInTheDocument();
    // One request per group (T-12): the page language's posts, then the
    // other language's posts that have no English translation.
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/posts?lang=en",
      "/api/posts?lang=tr&missingIn=en",
    ]);
  });

  it("shows an error state, not 'No posts yet', when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    renderBlogHome();

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Posts couldn't be loaded",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByText(/no posts yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Blog" }),
    ).toBeInTheDocument();
  });

  it("lists published posts with links, excerpt and date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(POSTS)),
    );

    renderBlogHome();

    expect(
      await screen.findByRole("link", { name: "First post" }),
    ).toHaveAttribute("href", "/blog/first-post");
    expect(screen.getByRole("link", { name: "Second post" })).toHaveAttribute(
      "href",
      "/blog/second-post",
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(
      screen.getByText("What the first post is about."),
    ).toBeInTheDocument();
    expect(screen.getByText("January 15, 2026")).toBeInTheDocument();
  });
});
