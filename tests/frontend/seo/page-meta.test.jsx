// FE-25 / SEO-25 / MKT-21 / DSG-33: every page writes its own meta from
// src/seo/pages.js through usePageMeta; route changes keep exactly one
// <title> and one description. The real page components are mounted in a
// plain router (no page-transition animation), so this does not depend on
// src/app/routes.jsx.
import { act, render, waitFor } from "@testing-library/react";
import { useNavigate, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "../../../src/pages/home";
import { About } from "../../../src/pages/about";
import { Portfolio } from "../../../src/pages/portfolio";
import { ContactUs } from "../../../src/pages/contact";
import BlogHome from "../../../src/pages/blog/BlogHome";
import BlogPost from "../../../src/pages/blog/BlogPost";
import { pages } from "../../../src/seo/pages.js";

const T07 = /( \| Cengizhan Köse$)|(^Cengizhan Köse \| )/;

let navigate;
function CaptureNavigate() {
  navigate = useNavigate();
  return null;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CaptureNavigate />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/blog" element={<BlogHome />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function go(path) {
  await act(async () => navigate(path));
}

const descriptions = () =>
  document.head.querySelectorAll('meta[name="description"]');
const titles = () => document.head.querySelectorAll("title");
const robots = () =>
  document.head.querySelector('meta[name="robots"]')?.getAttribute("content");

function expectSingleHead(entry) {
  expect(titles()).toHaveLength(1);
  expect(descriptions()).toHaveLength(1);
  expect(document.title).toBe(entry.title);
  expect(descriptions()[0]).toHaveAttribute("content", entry.description);
  expect(document.title).toBe(document.title.trim());
  expect(document.title).not.toContain("KÖSE");
  expect(document.title).toMatch(T07);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  document.head.innerHTML =
    "<title>Cengizhan Köse | Senior Fullstack Engineer</title>";
  document.documentElement.lang = "en";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse([])),
  );
});

describe("page meta across routes (FE-25)", () => {
  it("each static route shows its pages.js title and description", async () => {
    renderAt("/");
    await waitFor(() => expectSingleHead(pages["/"].en));

    for (const path of ["/about", "/portfolio", "/contact", "/blog"]) {
      await go(path);
      await waitFor(() => expectSingleHead(pages[path].en));
      expect(document.documentElement.lang).toBe("en");
    }
  });

  it("after 5 route changes there is still one title and one description", async () => {
    renderAt("/");
    for (const path of ["/about", "/portfolio", "/contact", "/blog", "/"]) {
      await go(path);
    }
    await waitFor(() => expectSingleHead(pages["/"].en));
    expect(document.title).toBe("Cengizhan Köse | Senior Fullstack Engineer");
  });

  it("/portfolio is noindex, and robots goes away on the next page", async () => {
    renderAt("/portfolio");
    await waitFor(() => expect(robots()).toMatch(/^noindex/));

    await go("/about");
    await waitFor(() => expect(document.title).toBe(pages["/about"].en.title));
    expect(robots()).toBeUndefined();
  });

  it("the /, /about, /contact and /blog descriptions differ", () => {
    const texts = ["/", "/about", "/contact", "/blog"].map(
      (path) => pages[path].en.description,
    );
    expect(new Set(texts).size).toBe(4);
  });

  it("an unknown path is titled 'Page not found' and noindex", async () => {
    renderAt("/no-such-page");
    await waitFor(() => expectSingleHead(pages.notFound.en));
    expect(document.title).toBe("Page not found | Cengizhan Köse");
    expect(robots()).toBe("noindex");
  });
});

describe("blog post meta (MKT-21 step 4)", () => {
  it("uses the post title and excerpt once loaded", async () => {
    fetch.mockImplementation(async () =>
      jsonResponse({
        id: 1,
        slug: "hello",
        title: "Hello post",
        excerpt: "What the post is about.",
        content: "Body",
        createdAt: "2026-01-15T12:00:00.000Z",
      }),
    );

    renderAt("/blog/hello");
    await waitFor(() =>
      expect(document.title).toBe("Hello post | Cengizhan Köse"),
    );
    expect(descriptions()).toHaveLength(1);
    expect(descriptions()[0]).toHaveAttribute(
      "content",
      "What the post is about.",
    );
    expect(robots()).toBeUndefined();
  });

  it("an API 404 gives 'Post not found' with noindex", async () => {
    fetch.mockImplementation(async () =>
      jsonResponse({ error: "Not found", code: "NOT_FOUND" }, 404),
    );

    renderAt("/blog/missing");
    await waitFor(() => expectSingleHead(pages.postNotFound.en));
    expect(robots()).toBe("noindex");
  });

  it("a network error does not mark the post noindex", async () => {
    fetch.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });

    renderAt("/blog/offline");
    await waitFor(() =>
      expect(document.querySelector(".blog-error")).toBeInTheDocument(),
    );
    expect(robots()).toBeUndefined();
    expect(document.title).toBe(pages["/blog"].en.title);
  });
});
