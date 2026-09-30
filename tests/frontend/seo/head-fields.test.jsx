// SEO-04 / SEO-06 / SEO-07 / MKT-06 in the rendered DOM: the real page
// components write canonical, the og/twitter tags and the JSON-LD block through
// usePageMeta, and an SPA route change keeps exactly one of each (the DevTools
// criteria "one canonical", "one ld+json after navigation" of the plans). The
// pages are mounted in a plain router so the test does not depend on
// src/app/routes.jsx.
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Home } from "../../../src/pages/home";
import { About } from "../../../src/pages/about";
import { Portfolio } from "../../../src/pages/portfolio";
import { ContactUs } from "../../../src/pages/contact";
import BlogHome from "../../../src/pages/blog/BlogHome";
import BlogPost from "../../../src/pages/blog/BlogPost";

const HOST = "https://www.cengizhankose.com";

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
        <Route path="/tr/blog/:slug" element={<BlogPost />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function go(path) {
  await act(async () => navigate(path));
}

const canonicals = () => [
  ...document.head.querySelectorAll('link[rel="canonical"]'),
];
const ldScripts = () => [
  ...document.querySelectorAll('script[type="application/ld+json"]'),
];
const metaAll = (key) => [
  ...document.head.querySelectorAll(
    `meta[property="${key}"], meta[name="${key}"]`,
  ),
];
const value = (key) => metaAll(key)[0]?.getAttribute("content");
const socialKeys = () =>
  [
    ...document.head.querySelectorAll(
      'meta[property^="og:"], meta[property^="article:"], meta[name^="twitter:"]',
    ),
  ].map(
    (element) =>
      element.getAttribute("property") ?? element.getAttribute("name"),
  );

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const post = (over) => ({
  id: 1,
  content: "Body",
  excerpt: "What the post is about.",
  createdAt: "2026-01-15T12:00:00.000Z",
  publishedAt: "2026-01-16T08:00:00.000Z",
  updatedAt: "2026-02-01T09:00:00.000Z",
  ...over,
});

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

describe("head fields of the static pages (SEO-04, SEO-06, SEO-07)", () => {
  it("/ has its canonical, the og/twitter set and Person + WebSite", async () => {
    renderAt("/");
    await waitFor(() => expect(canonicals()).toHaveLength(1));

    expect(canonicals()[0]).toHaveAttribute("href", `${HOST}/`);
    expect(value("og:url")).toBe(`${HOST}/`);
    expect(value("og:title")).toBe(document.title);
    expect(value("og:type")).toBe("website");
    expect(value("og:locale")).toBe("en_US");
    expect(value("og:image")).toBe(`${HOST}/og/default.jpg`);
    expect(value("og:image:width")).toBe("1200");
    expect(value("og:image:height")).toBe("630");
    expect(value("og:image:alt")).toBe(
      "Cengizhan Köse — Senior Fullstack Engineer",
    );
    expect(value("twitter:card")).toBe("summary_large_image");
    expect(value("twitter:site")).toBe("@cengzhnkse");
    expect(value("twitter:creator")).toBe("@cengzhnkse");
    expect(metaAll("og:locale:alternate")).toHaveLength(0);

    expect(ldScripts()).toHaveLength(1);
    const graph = JSON.parse(ldScripts()[0].textContent)["@graph"];
    expect(graph.map((node) => node["@type"])).toEqual(["Person", "WebSite"]);
    expect(graph[0].sameAs).toHaveLength(6);
    expect(graph[1].inLanguage).toEqual(["en", "tr"]);
  });

  it("/about: its own canonical and og:url, no schema", async () => {
    renderAt("/about");
    await waitFor(() => expect(canonicals()).toHaveLength(1));
    expect(canonicals()[0]).toHaveAttribute("href", `${HOST}/about`);
    expect(value("og:url")).toBe(`${HOST}/about`);
    expect(value("og:title")).toBe("About | Cengizhan Köse");
    expect(ldScripts()).toHaveLength(0);
  });

  it("/portfolio (noindex) has no canonical, share card or schema", async () => {
    renderAt("/portfolio");
    await waitFor(() =>
      expect(document.title).toBe("Portfolio | Cengizhan Köse"),
    );
    expect(canonicals()).toHaveLength(0);
    expect(socialKeys()).toEqual([]);
    expect(ldScripts()).toHaveLength(0);
  });

  it("an unknown path has no canonical, share card or schema", async () => {
    renderAt("/no-such-page");
    await waitFor(() =>
      expect(document.title).toBe("Page not found | Cengizhan Köse"),
    );
    expect(canonicals()).toHaveLength(0);
    expect(socialKeys()).toEqual([]);
    expect(ldScripts()).toHaveLength(0);
  });

  it("the canonical ignores the query of the URL", async () => {
    renderAt("/about?utm_source=x");
    await waitFor(() => expect(canonicals()).toHaveLength(1));
    expect(canonicals()[0]).toHaveAttribute("href", `${HOST}/about`);
  });
});

describe("SPA navigation keeps one of each (DevTools criteria)", () => {
  it("/ -> /about -> /portfolio -> /contact -> /blog -> / ends with one canonical, one set of tags and one ld+json", async () => {
    renderAt("/");
    await waitFor(() => expect(canonicals()).toHaveLength(1));

    const expectations = {
      "/about": { canonical: `${HOST}/about`, ld: 0 },
      "/portfolio": { canonical: null, ld: 0 },
      "/contact": { canonical: `${HOST}/contact`, ld: 0 },
      "/blog": { canonical: `${HOST}/blog`, ld: 0 },
      "/": { canonical: `${HOST}/`, ld: 1 },
    };

    for (const [path, expected] of Object.entries(expectations)) {
      await go(path);
      await waitFor(() =>
        expect(canonicals()).toHaveLength(expected.canonical ? 1 : 0),
      );
      if (expected.canonical) {
        expect(canonicals()[0]).toHaveAttribute("href", expected.canonical);
        expect(value("og:url")).toBe(expected.canonical);
        expect(value("og:title")).toBe(document.title);
      } else {
        expect(socialKeys()).toEqual([]);
      }
      expect(ldScripts()).toHaveLength(expected.ld);
      const keys = socialKeys();
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("head fields of a post (SEO-04, SEO-06, SEO-07, MKT-06)", () => {
  it("an EN post: canonical, article tags and BlogPosting", async () => {
    fetch.mockImplementation(async () =>
      jsonResponse(post({ slug: "hello-en", lang: "en", title: "Hello post" })),
    );

    renderAt("/blog/hello-en");
    await waitFor(() =>
      expect(document.title).toBe("Hello post | Cengizhan Köse"),
    );

    expect(canonicals()).toHaveLength(1);
    expect(canonicals()[0]).toHaveAttribute("href", `${HOST}/blog/hello-en`);
    expect(value("og:type")).toBe("article");
    expect(value("og:title")).toBe("Hello post | Cengizhan Köse");
    expect(value("og:description")).toBe("What the post is about.");
    expect(value("og:url")).toBe(`${HOST}/blog/hello-en`);
    expect(value("og:locale")).toBe("en_US");
    expect(metaAll("og:locale:alternate")).toHaveLength(0);
    expect(value("article:published_time")).toBe("2026-01-16T08:00:00.000Z");
    expect(value("article:modified_time")).toBe("2026-02-01T09:00:00.000Z");
    expect(value("article:author")).toBe(`${HOST}/about`);
    expect(value("twitter:card")).toBe("summary_large_image");

    expect(ldScripts()).toHaveLength(1);
    const posting = JSON.parse(ldScripts()[0].textContent)["@graph"][0];
    expect(posting).toMatchObject({
      "@type": "BlogPosting",
      headline: "Hello post",
      inLanguage: "en",
      mainEntityOfPage: `${HOST}/blog/hello-en`,
      datePublished: "2026-01-16T08:00:00.000Z",
      author: { name: "Cengizhan Köse" },
    });
  });

  it("a TR post under /tr/blog: its own path, tr_TR, en_US as alternate", async () => {
    fetch.mockImplementation(async () =>
      jsonResponse(
        post({
          slug: "merhaba-dunya",
          lang: "tr",
          title: "Merhaba dünya",
          translations: [{ lang: "en", slug: "hello-world" }],
        }),
      ),
    );

    renderAt("/tr/blog/merhaba-dunya");
    await waitFor(() =>
      expect(document.title).toBe("Merhaba dünya | Cengizhan Köse"),
    );

    expect(document.documentElement.lang).toBe("tr");
    expect(canonicals()[0]).toHaveAttribute(
      "href",
      `${HOST}/tr/blog/merhaba-dunya`,
    );
    expect(value("og:locale")).toBe("tr_TR");
    expect(value("og:locale:alternate")).toBe("en_US");
    expect(value("og:url")).toBe(`${HOST}/tr/blog/merhaba-dunya`);
    const posting = JSON.parse(ldScripts()[0].textContent)["@graph"][0];
    expect(posting.inLanguage).toBe("tr");
    expect(posting.mainEntityOfPage).toBe(`${HOST}/tr/blog/merhaba-dunya`);
  });

  it("leaving the post for the blog list drops the article tags and the schema", async () => {
    fetch.mockImplementation(async (url) =>
      String(url).includes("/posts/hello-back")
        ? jsonResponse(
            post({ slug: "hello-back", lang: "en", title: "Back post" }),
          )
        : jsonResponse([]),
    );

    renderAt("/blog/hello-back");
    await waitFor(() => expect(value("og:type")).toBe("article"));
    expect(ldScripts()).toHaveLength(1);

    await go("/blog");
    await waitFor(() => expect(document.title).toBe("Blog | Cengizhan Köse"));
    expect(canonicals()[0]).toHaveAttribute("href", `${HOST}/blog`);
    expect(value("og:type")).toBe("website");
    expect(metaAll("article:published_time")).toHaveLength(0);
    expect(metaAll("article:author")).toHaveLength(0);
    expect(ldScripts()).toHaveLength(0);
    expect(canonicals()).toHaveLength(1);
  });

  it("an API 404 prints no canonical, share card or schema", async () => {
    fetch.mockImplementation(async () =>
      jsonResponse({ error: "Not found", code: "NOT_FOUND" }, 404),
    );
    renderAt("/blog/missing-one");
    await waitFor(() =>
      expect(document.title).toBe("Post not found | Cengizhan Köse"),
    );
    expect(canonicals()).toHaveLength(0);
    expect(socialKeys()).toEqual([]);
    expect(ldScripts()).toHaveLength(0);
  });

  it("a hostile title stays text in the tags and the script block", async () => {
    const title = '</script><img src=x onerror=alert(1)> "q"';
    fetch.mockImplementation(async () =>
      jsonResponse(post({ slug: "hostile-one", lang: "en", title })),
    );
    renderAt("/blog/hostile-one");
    await waitFor(() => expect(value("og:type")).toBe("article"));

    expect(value("og:title")).toBe(`${title} | Cengizhan Köse`);
    expect(ldScripts()[0].textContent).not.toMatch(/<\/script/i);
    expect(JSON.parse(ldScripts()[0].textContent)["@graph"][0].headline).toBe(
      title,
    );
    expect(document.head.querySelector("img")).toBeNull();
  });
});
