// BlogPost routing (SEO-08, SEO-11 Adım A, FE-16 step 3):
// - API 404 -> NotFound variant "post" in the URL's language, noindex
// - a TR post opened at /blog/<slug> moves to /tr/blog/<slug> (replace)
// - <article lang>, <html lang>, back link to the live blog, hreflang pair
// - a new slug starts from the loading state (no stale post)
import { act, render, screen, waitFor } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BlogPost from "../../../src/pages/blog/BlogPost";
import { About } from "../../../src/pages/about";

const WWW = "https://www.cengizhankose.com";

const POSTS = {
  "hello-world": {
    id: 1,
    slug: "hello-world",
    title: "Hello world",
    excerpt: "An EN post.",
    content: "EN body",
    lang: "en",
    translationKey: "hello-world",
    translations: [{ lang: "tr", slug: "merhaba-dunya" }],
    createdAt: "2026-01-15T12:00:00.000Z",
  },
  "merhaba-dunya": {
    id: 2,
    slug: "merhaba-dunya",
    title: "Merhaba dünya",
    excerpt: "Bir TR yazı.",
    content: "TR gövde",
    lang: "tr",
    translationKey: "hello-world",
    translations: [{ lang: "en", slug: "hello-world" }],
    createdAt: "2026-01-16T12:00:00.000Z",
  },
  "sadece-turkce": {
    id: 3,
    slug: "sadece-turkce",
    title: "Sadece Türkçe",
    excerpt: "Çevirisi yok.",
    content: "TR only",
    lang: "tr",
    translationKey: null,
    translations: [],
    createdAt: "2026-01-17T12:00:00.000Z",
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let navigate;
let location;
function Probe() {
  navigate = useNavigate();
  location = useLocation();
  return null;
}

function renderAt(path, history = []) {
  return render(
    <MemoryRouter initialEntries={[...history, path]}>
      <Probe />
      <Routes>
        <Route path="/start" element={null} />
        <Route path="/about" element={<About />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/tr/blog/:slug" element={<BlogPost />} />
      </Routes>
    </MemoryRouter>,
  );
}

const robots = () =>
  document.head.querySelector('meta[name="robots"]')?.getAttribute("content");
const hreflangs = () =>
  [...document.head.querySelectorAll('link[rel="alternate"][hreflang]')].map(
    (link) => [link.getAttribute("hreflang"), link.getAttribute("href")],
  );

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      const slug = String(url).split("/api/posts/")[1];
      return POSTS[slug]
        ? json(POSTS[slug])
        : json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }),
  );
});

describe("missing post -> NotFound variant 'post' (SEO-08, FE-16 step 3)", () => {
  it("/blog/<missing>: 'Post not found', back to /blog, noindex", async () => {
    renderAt("/blog/bu-yazi-yok-seo-audit-7f3");
    await screen.findByRole("heading", { level: 1, name: "Post not found" });
    expect(screen.getByRole("link", { name: "Back to blog" })).toHaveAttribute(
      "href",
      "/blog",
    );
    await waitFor(() => expect(robots()).toBe("noindex"));
    expect(document.title).toBe("Post not found | Cengizhan Köse");
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
  });

  it("/tr/blog/<missing>: 'Yazı bulunamadı', link to the live blog (/blog)", async () => {
    renderAt("/tr/blog/bu-yazi-yok-seo-audit-7f3");
    await screen.findByRole("heading", { level: 1, name: "Yazı bulunamadı" });
    expect(screen.getByRole("link", { name: "Bloga dön" })).toHaveAttribute(
      "href",
      "/blog",
    );
    await waitFor(() =>
      expect(document.title).toBe("Yazı bulunamadı | Cengizhan Köse"),
    );
    expect(robots()).toBe("noindex");
    expect(document.documentElement.lang).toBe("tr");
  });

  it("a server error is not 'not found' and keeps the page indexable", async () => {
    fetch.mockImplementation(async () => json({ error: "x" }, 503));
    renderAt("/blog/hello-world");
    await screen.findByText(/could not be loaded/i);
    expect(
      screen.queryByRole("heading", { name: "Post not found" }),
    ).not.toBeInTheDocument();
    expect(robots()).toBeUndefined();
  });
});

describe("a post lives under its own language's path (SEO-11 Adım A)", () => {
  it("/blog/<tr-slug> moves to /tr/blog/<tr-slug> without a new history entry", async () => {
    renderAt("/blog/sadece-turkce?utm_source=li#top", ["/start"]);
    await waitFor(() =>
      expect(location.pathname).toBe("/tr/blog/sadece-turkce"),
    );
    expect(location.search).toBe("?utm_source=li");
    expect(location.hash).toBe("#top");
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Sadece Türkçe",
    });
    expect(heading.closest("article")).toHaveAttribute("lang", "tr");
    // Replace, not push: Back returns to the page before the old URL.
    await act(async () => navigate(-1));
    expect(location.pathname).toBe("/start");
  });

  it("/tr/blog/<en-slug> moves to /blog/<en-slug>", async () => {
    renderAt("/tr/blog/hello-world");
    await waitFor(() => expect(location.pathname).toBe("/blog/hello-world"));
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Hello world",
    });
    expect(heading.closest("article")).toHaveAttribute("lang", "en");
  });

  it("the TR post: <html lang='tr'>, <article lang='tr'>, back link to /blog, no hreflang", async () => {
    renderAt("/tr/blog/sadece-turkce");
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Sadece Türkçe",
    });
    expect(heading.closest("article")).toHaveAttribute("lang", "tr");
    expect(screen.getByRole("link", { name: /Back to Blog/ })).toHaveAttribute(
      "href",
      "/blog",
    );
    await waitFor(() => expect(document.documentElement.lang).toBe("tr"));
    expect(document.title).toBe("Sadece Türkçe | Cengizhan Köse");
    expect(hreflangs()).toEqual([]);
  });

  it("an EN/TR pair prints en, tr and x-default on both pages", async () => {
    const pair = [
      ["en", `${WWW}/blog/hello-world`],
      ["tr", `${WWW}/tr/blog/merhaba-dunya`],
      ["x-default", `${WWW}/blog/hello-world`],
    ];
    renderAt("/blog/hello-world");
    await waitFor(() => expect(hreflangs()).toEqual(pair));

    await act(async () => navigate("/tr/blog/merhaba-dunya"));
    await screen.findByRole("heading", { level: 1, name: "Merhaba dünya" });
    await waitFor(() => expect(document.documentElement.lang).toBe("tr"));
    expect(hreflangs()).toEqual(pair);
  });

  it("leaving the post for /about: lang back to en, hreflang removed", async () => {
    renderAt("/tr/blog/merhaba-dunya");
    await waitFor(() => expect(document.documentElement.lang).toBe("tr"));
    await waitFor(() => expect(hreflangs()).toHaveLength(3));

    await act(async () => navigate("/about"));
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(hreflangs()).toEqual([]);
  });
});

describe("moving between posts", () => {
  it("a new slug shows the loading state, not the previous post", async () => {
    let release;
    renderAt("/blog/hello-world");
    await screen.findByRole("heading", { level: 1, name: "Hello world" });

    fetch.mockImplementation(
      (url) =>
        new Promise((resolve) => {
          release = () =>
            resolve(json(POSTS[String(url).split("/api/posts/")[1]]));
        }),
    );
    await act(async () => navigate("/tr/blog/merhaba-dunya"));

    expect(screen.queryByRole("heading", { name: "Hello world" })).toBeNull();
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await act(async () => release());
    await screen.findByRole("heading", { level: 1, name: "Merhaba dünya" });
  });
});
