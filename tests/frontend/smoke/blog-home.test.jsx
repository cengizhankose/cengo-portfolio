// Smoke: blog index states with a mocked fetch (FE-22). Current behaviour
// only; W5-FE-blog-data-layer (FE-03/FE-12, error state + swr) owns and
// updates this file.
import { render, screen, waitFor } from "@testing-library/react";
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/posts$/);
  });

  it("leaves the loading state without crashing when the request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    renderBlogHome();

    await waitFor(() =>
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument(),
    );
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
