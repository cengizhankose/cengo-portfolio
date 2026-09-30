// usePageMeta (T-03, SEO-25): updates the existing <head> in place, never
// duplicates title/description/robots, and removes robots when a page is
// indexable again. SEO-04/06/07: the same for the canonical link, the
// og:/article:/twitter: tags and the JSON-LD block.
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { serializeJsonLd } from "../../../src/seo/jsonld.js";
import { getPageMeta } from "../../../src/seo/pages.js";
import { ALL_LIVE, matchRoute } from "../../../src/seo/routes.js";
import {
  applyPageMeta,
  setCanonical,
  setJsonLd,
  setSocialTags,
  usePageMeta,
} from "../../../src/seo/usePageMeta.js";

function Probe({ meta }) {
  usePageMeta(meta);
  return null;
}

const count = (selector) => document.head.querySelectorAll(selector).length;
const content = (name) =>
  document.head.querySelector(`meta[name="${name}"]`)?.getAttribute("content");

const ABOUT = {
  title: "About | Cengizhan Köse",
  description: "About description",
  robots: null,
  lang: "en",
};
const PORTFOLIO = {
  title: "Portfolio | Cengizhan Köse",
  description: "Portfolio description",
  robots: "noindex, follow",
  lang: "en",
};

beforeEach(() => {
  document.head.innerHTML = "";
  document.documentElement.lang = "";
});

describe("usePageMeta", () => {
  it("writes title, description, robots and html lang with data-seo marks", () => {
    render(<Probe meta={PORTFOLIO} />);

    expect(document.title).toBe("Portfolio | Cengizhan Köse");
    expect(content("description")).toBe("Portfolio description");
    expect(content("robots")).toBe("noindex, follow");
    expect(document.documentElement.lang).toBe("en");
    expect(document.head.querySelector("title")).toHaveAttribute("data-seo");
    expect(
      document.head.querySelector('meta[name="description"]'),
    ).toHaveAttribute("data-seo");
  });

  it("updates the same elements when the meta changes and drops robots", () => {
    const { rerender } = render(<Probe meta={PORTFOLIO} />);
    const title = document.head.querySelector("title");
    const description = document.head.querySelector('meta[name="description"]');

    rerender(<Probe meta={ABOUT} />);

    expect(document.head.querySelector("title")).toBe(title);
    expect(document.head.querySelector('meta[name="description"]')).toBe(
      description,
    );
    expect(document.title).toBe("About | Cengizhan Köse");
    expect(content("description")).toBe("About description");
    expect(count('meta[name="robots"]')).toBe(0);
    expect(count("title")).toBe(1);
    expect(count('meta[name="description"]')).toBe(1);
  });

  it("reuses tags printed by index.html or the server instead of adding new ones", () => {
    document.head.innerHTML = [
      "<title>Cengizhan Köse | Senior Fullstack Engineer</title>",
      '<meta name="description" content="server text">',
      '<meta name="description" content="stray duplicate">',
      '<meta name="robots" content="noindex">',
    ].join("");

    render(<Probe meta={ABOUT} />);

    expect(count("title")).toBe(1);
    expect(count('meta[name="description"]')).toBe(1);
    expect(content("description")).toBe("About description");
    expect(count('meta[name="robots"]')).toBe(0);
  });

  it("switches html lang with the page locale", () => {
    const { rerender } = render(<Probe meta={ABOUT} />);
    expect(document.documentElement.lang).toBe("en");

    rerender(
      <Probe
        meta={{ ...ABOUT, title: "Hakkımda | Cengizhan Köse", lang: "tr" }}
      />,
    );
    expect(document.documentElement.lang).toBe("tr");
    expect(document.title).toBe("Hakkımda | Cengizhan Köse");
  });

  it("ignores empty input without throwing", () => {
    expect(() => applyPageMeta(null)).not.toThrow();
    applyPageMeta({ title: "", description: "", robots: "", lang: "" });
    expect(count("title")).toBe(0);
    expect(count("meta")).toBe(0);
  });
});

const canonicals = () => [
  ...document.head.querySelectorAll('link[rel="canonical"]'),
];
const social = () =>
  [
    ...document.head.querySelectorAll(
      'meta[property^="og:"], meta[property^="article:"], meta[name^="twitter:"]',
    ),
  ].map((element) => [
    element.getAttribute("property") ?? element.getAttribute("name"),
    element.getAttribute("content"),
  ]);
const socialValue = (key) =>
  document.head
    .querySelector(`meta[property="${key}"], meta[name="${key}"]`)
    ?.getAttribute("content");
const ldScripts = () => [
  ...document.querySelectorAll('script[type="application/ld+json"]'),
];

const TR_POST = {
  slug: "atlas-steward",
  lang: "tr",
  title: "Atlas Steward",
  seoTitle: "Atlas Steward: Yarım İşi Yakalayan Sistem",
  excerpt: "Sohbetlerde yarım kalan işleri yakalayan yerel sistem.",
  createdAt: "2026-07-01T08:00:00.000Z",
  publishedAt: "2026-07-02T09:30:00.000Z",
  updatedAt: "2026-07-05T12:00:00.000Z",
  translations: [{ lang: "en", slug: "atlas-steward-en" }],
};

describe("canonical link (SEO-04 step 3)", () => {
  it("creates one canonical link with a data-seo mark", () => {
    setCanonical("https://www.cengizhankose.com/about");
    expect(canonicals()).toHaveLength(1);
    expect(canonicals()[0]).toHaveAttribute(
      "href",
      "https://www.cengizhankose.com/about",
    );
    expect(canonicals()[0]).toHaveAttribute("data-seo");
  });

  it("updates the same element, reuses a server-printed one and drops duplicates", () => {
    document.head.innerHTML = [
      '<link rel="canonical" href="https://www.cengizhankose.com/">',
      '<link rel="canonical" href="https://www.cengizhankose.com/stray">',
    ].join("");
    const printed = canonicals()[0];

    setCanonical("https://www.cengizhankose.com/about");
    expect(canonicals()).toHaveLength(1);
    expect(canonicals()[0]).toBe(printed);
    expect(printed).toHaveAttribute(
      "href",
      "https://www.cengizhankose.com/about",
    );
  });

  it("removes the link when the page has none (404, noindex)", () => {
    setCanonical("https://www.cengizhankose.com/about");
    setCanonical(null);
    expect(canonicals()).toHaveLength(0);
    setCanonical("");
    expect(canonicals()).toHaveLength(0);
  });

  it("leaves other link elements (hreflang, icons) alone", () => {
    document.head.innerHTML =
      '<link rel="alternate" hreflang="en" href="https://x.test/"><link rel="icon" href="/favicon.ico">';
    setCanonical("https://www.cengizhankose.com/");
    expect(document.head.querySelectorAll("link")).toHaveLength(3);
  });
});

describe("Open Graph and Twitter tags (SEO-06 step 5)", () => {
  const tags = [
    { attribute: "property", key: "og:type", content: "website" },
    { attribute: "property", key: "og:title", content: "T" },
    { attribute: "name", key: "twitter:card", content: "summary_large_image" },
  ];

  it("creates property tags for og:* and name tags for twitter:*, marked data-seo", () => {
    setSocialTags(tags);
    expect(social()).toEqual([
      ["og:type", "website"],
      ["og:title", "T"],
      ["twitter:card", "summary_large_image"],
    ]);
    expect(
      document.head.querySelector('meta[property="og:type"]'),
    ).toHaveAttribute("data-seo");
    expect(
      document.head.querySelector('meta[name="twitter:card"]'),
    ).toHaveAttribute("data-seo");
  });

  it("updates in place: the same element nodes, changed content, no extras", () => {
    setSocialTags(tags);
    const before = document.head.querySelector('meta[property="og:title"]');

    setSocialTags([
      { attribute: "property", key: "og:type", content: "article" },
      { attribute: "property", key: "og:title", content: "Changed" },
      {
        attribute: "name",
        key: "twitter:card",
        content: "summary_large_image",
      },
    ]);

    expect(document.head.querySelector('meta[property="og:title"]')).toBe(
      before,
    );
    expect(socialValue("og:title")).toBe("Changed");
    expect(socialValue("og:type")).toBe("article");
    expect(social()).toHaveLength(3);
  });

  it("removes every tag of the namespace that the new page does not have", () => {
    setSocialTags([
      ...tags,
      {
        attribute: "property",
        key: "article:published_time",
        content: "2026-01-01T00:00:00.000Z",
      },
      { attribute: "property", key: "og:locale:alternate", content: "en_US" },
    ]);
    expect(social()).toHaveLength(5);

    setSocialTags(tags);
    expect(social().map(([key]) => key)).toEqual([
      "og:type",
      "og:title",
      "twitter:card",
    ]);

    setSocialTags([]);
    expect(social()).toEqual([]);
  });

  it("og:locale:alternate may repeat: one element per value, in place", () => {
    const alternates = (...values) =>
      values.map((content) => ({
        attribute: "property",
        key: "og:locale:alternate",
        content,
      }));
    setSocialTags(alternates("en_US", "de_DE"));
    const first = document.head.querySelector(
      'meta[property="og:locale:alternate"]',
    );
    expect(
      [
        ...document.head.querySelectorAll(
          'meta[property="og:locale:alternate"]',
        ),
      ].map((element) => element.getAttribute("content")),
    ).toEqual(["en_US", "de_DE"]);

    setSocialTags(alternates("tr_TR"));
    const now = [
      ...document.head.querySelectorAll('meta[property="og:locale:alternate"]'),
    ];
    expect(now).toHaveLength(1);
    expect(now[0]).toBe(first);
    expect(now[0]).toHaveAttribute("content", "tr_TR");
  });

  it("reuses server-printed tags and removes stray duplicates", () => {
    document.head.innerHTML = [
      '<meta property="og:title" content="server" data-seo>',
      '<meta property="og:title" content="stray">',
      '<meta name="twitter:card" content="summary">',
    ].join("");
    const printed = document.head.querySelector('meta[property="og:title"]');

    setSocialTags(tags);
    expect(
      document.head.querySelectorAll('meta[property="og:title"]'),
    ).toHaveLength(1);
    expect(document.head.querySelector('meta[property="og:title"]')).toBe(
      printed,
    );
    expect(socialValue("og:title")).toBe("T");
    expect(socialValue("twitter:card")).toBe("summary_large_image");
  });

  it("does not touch the description, robots or other meta tags", () => {
    document.head.innerHTML =
      '<meta name="description" content="d"><meta name="robots" content="noindex"><meta name="theme-color" content="#000">';
    setSocialTags(tags);
    setSocialTags([]);
    expect(document.head.querySelectorAll("meta")).toHaveLength(3);
  });

  it("skips invalid entries", () => {
    setSocialTags([
      { attribute: "property", key: "og:title", content: "" },
      { attribute: "id", key: "og:x", content: "y" },
      { attribute: "property", key: "", content: "y" },
      null,
      { attribute: "property", key: "og:type", content: "website" },
    ]);
    expect(social()).toEqual([["og:type", "website"]]);
    setSocialTags(undefined);
    expect(social()).toEqual([]);
  });

  it("a hostile value is stored as an attribute value, never as markup", () => {
    const hostile = '"><script>alert(1)</script>';
    setSocialTags([
      { attribute: "property", key: "og:title", content: hostile },
    ]);
    expect(document.head.querySelector("script")).toBeNull();
    expect(socialValue("og:title")).toBe(hostile);
  });
});

describe("JSON-LD block (SEO-07 step 5)", () => {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [{ "@type": "WebSite" }],
  };

  it("creates one ld+json script with id ld-json whose text parses to the graph", () => {
    setJsonLd(graph);
    expect(ldScripts()).toHaveLength(1);
    expect(ldScripts()[0].id).toBe("ld-json");
    expect(ldScripts()[0]).toHaveAttribute("data-seo");
    expect(JSON.parse(ldScripts()[0].textContent)).toEqual(graph);
    expect(ldScripts()[0].textContent).toBe(serializeJsonLd(graph));
  });

  it("changes the content of the same script on a route change, never adds a second", () => {
    setJsonLd(graph);
    const script = ldScripts()[0];
    setJsonLd({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "BlogPosting" }],
    });
    expect(ldScripts()).toHaveLength(1);
    expect(ldScripts()[0]).toBe(script);
    expect(JSON.parse(script.textContent)["@graph"][0]["@type"]).toBe(
      "BlogPosting",
    );
  });

  it("removes the script when the page has no graph", () => {
    setJsonLd(graph);
    setJsonLd(null);
    expect(ldScripts()).toHaveLength(0);
    setJsonLd(undefined);
    expect(ldScripts()).toHaveLength(0);
  });

  it("reuses a server-printed block wherever it sits and removes duplicates", () => {
    document.head.innerHTML =
      '<script type="application/ld+json">{"stale":true}</script>';
    const inBody = document.createElement("script");
    inBody.type = "application/ld+json";
    inBody.textContent = "{}";
    document.body.appendChild(inBody);
    const printed = ldScripts()[0];

    setJsonLd(graph);
    expect(ldScripts()).toHaveLength(1);
    expect(ldScripts()[0]).toBe(printed);
    expect(printed.id).toBe("ld-json");
    expect(JSON.parse(printed.textContent)).toEqual(graph);
    inBody.remove();
  });

  it("escapes < so a value cannot close the script element", () => {
    setJsonLd({ headline: "</script><img src=x onerror=alert(1)>" });
    const text = ldScripts()[0].textContent;
    expect(text).not.toContain("<");
    expect(JSON.parse(text).headline).toBe(
      "</script><img src=x onerror=alert(1)>",
    );
    expect(document.querySelector("img")).toBeNull();
  });

  it("leaves other scripts alone", () => {
    document.head.innerHTML = '<script type="module" src="/app.js"></script>';
    setJsonLd(graph);
    setJsonLd(null);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
  });
});

describe("usePageMeta with the full getPageMeta output (SEO-04/06/07)", () => {
  // The route table as it is today: only the EN static pages are open, so the
  // static pages have no counterpart (no og:locale:alternate) and the post's
  // author page is the English About. Explicit, so the TR launch flip
  // (SEO-11 Adım B) does not change what these tests check.
  const EN_ONLY = { static: ["en"], post: ["en", "tr"] };
  const homeMeta = () => getPageMeta(matchRoute("/"), "en", {}, EN_ONLY);
  const aboutMeta = () => getPageMeta(matchRoute("/about"), "en", {}, EN_ONLY);
  const portfolioMeta = () =>
    getPageMeta(matchRoute("/portfolio"), "en", {}, EN_ONLY);
  const postMeta = () =>
    getPageMeta(
      matchRoute("/tr/blog/atlas-steward"),
      "tr",
      { post: TR_POST },
      EN_ONLY,
    );

  it("writes canonical, the og/twitter set and the ld+json of the home page", () => {
    render(<Probe meta={homeMeta()} />);

    expect(canonicals()).toHaveLength(1);
    expect(canonicals()[0]).toHaveAttribute(
      "href",
      "https://www.cengizhankose.com/",
    );
    expect(socialValue("og:url")).toBe("https://www.cengizhankose.com/");
    expect(socialValue("og:type")).toBe("website");
    expect(socialValue("og:locale")).toBe("en_US");
    expect(socialValue("og:image")).toBe(
      "https://www.cengizhankose.com/og/default.jpg",
    );
    expect(socialValue("twitter:card")).toBe("summary_large_image");
    expect(socialValue("twitter:site")).toBe("@cengzhnkse");
    expect(ldScripts()).toHaveLength(1);
    const types = JSON.parse(ldScripts()[0].textContent)["@graph"].map(
      (node) => node["@type"],
    );
    expect(types).toEqual(["Person", "WebSite"]);
  });

  it("each tag appears once, and og:url equals the canonical", () => {
    render(<Probe meta={homeMeta()} />);
    const keys = social().map(([key]) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(socialValue("og:url")).toBe(canonicals()[0].getAttribute("href"));
  });

  it("a post: article tags, post language, BlogPosting and og:locale:alternate", () => {
    render(<Probe meta={postMeta()} />);

    expect(document.documentElement.lang).toBe("tr");
    expect(canonicals()[0]).toHaveAttribute(
      "href",
      "https://www.cengizhankose.com/tr/blog/atlas-steward",
    );
    expect(socialValue("og:type")).toBe("article");
    expect(socialValue("og:locale")).toBe("tr_TR");
    expect(socialValue("og:locale:alternate")).toBe("en_US");
    expect(socialValue("article:published_time")).toBe(
      "2026-07-02T09:30:00.000Z",
    );
    expect(socialValue("article:modified_time")).toBe(
      "2026-07-05T12:00:00.000Z",
    );
    expect(socialValue("article:author")).toBe(
      "https://www.cengizhankose.com/about",
    );

    expect(ldScripts()).toHaveLength(1);
    const posting = JSON.parse(ldScripts()[0].textContent)["@graph"][0];
    expect(posting["@type"]).toBe("BlogPosting");
    expect(posting.mainEntityOfPage).toBe(canonicals()[0].getAttribute("href"));
    expect(posting.inLanguage).toBe("tr");
  });

  it("route changes keep one of each and never leave the previous page's fields", () => {
    const { rerender } = render(<Probe meta={homeMeta()} />);
    const canonical = canonicals()[0];
    const script = ldScripts()[0];

    rerender(<Probe meta={aboutMeta()} />);
    expect(canonicals()).toHaveLength(1);
    expect(canonicals()[0]).toBe(canonical);
    expect(canonicals()[0]).toHaveAttribute(
      "href",
      "https://www.cengizhankose.com/about",
    );
    expect(socialValue("og:title")).toBe("About | Cengizhan Köse");
    expect(socialValue("og:url")).toBe("https://www.cengizhankose.com/about");
    // The home graph does not stay on /about.
    expect(ldScripts()).toHaveLength(0);

    rerender(<Probe meta={postMeta()} />);
    expect(canonicals()).toHaveLength(1);
    expect(social().filter(([key]) => key === "og:title")).toHaveLength(1);
    expect(ldScripts()).toHaveLength(1);
    expect(ldScripts()[0]).not.toBe(script);
    expect(socialValue("article:author")).toBeDefined();

    rerender(<Probe meta={homeMeta()} />);
    expect(canonicals()).toHaveLength(1);
    expect(socialValue("article:author")).toBeUndefined();
    expect(socialValue("article:published_time")).toBeUndefined();
    expect(socialValue("og:locale:alternate")).toBeUndefined();
    expect(socialValue("og:type")).toBe("website");
    expect(ldScripts()).toHaveLength(1);
  });

  it("a noindex page (portfolio) and a 404 print no canonical, share card or schema", () => {
    const { rerender } = render(<Probe meta={homeMeta()} />);
    expect(canonicals()).toHaveLength(1);

    rerender(<Probe meta={portfolioMeta()} />);
    expect(canonicals()).toHaveLength(0);
    expect(social()).toEqual([]);
    expect(ldScripts()).toHaveLength(0);
    expect(content("robots")).toBe("noindex, follow");

    rerender(<Probe meta={homeMeta()} />);
    expect(canonicals()).toHaveLength(1);

    rerender(<Probe meta={getPageMeta(matchRoute("/no-such-page"), "en")} />);
    expect(canonicals()).toHaveLength(0);
    expect(social()).toEqual([]);
    expect(ldScripts()).toHaveLength(0);
    expect(content("robots")).toBe("noindex");
  });

  it("a post that is still loading prints no post fields", () => {
    const loading = getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", {
      post: null,
    });
    const { rerender } = render(<Probe meta={postMeta()} />);
    rerender(<Probe meta={loading} />);
    expect(canonicals()).toHaveLength(0);
    expect(social()).toEqual([]);
    expect(ldScripts()).toHaveLength(0);
  });

  it("the same meta again changes nothing in the DOM (same nodes)", () => {
    const { rerender } = render(<Probe meta={homeMeta()} />);
    const before = [...document.head.children];
    rerender(<Probe meta={homeMeta()} />);
    expect([...document.head.children]).toEqual(before);
  });

  it("after the TR pages open the TR home has its own canonical and the EN locale as alternate", () => {
    render(<Probe meta={getPageMeta("/tr", "tr", {}, ALL_LIVE)} />);
    expect(document.documentElement.lang).toBe("tr");
    expect(canonicals()[0]).toHaveAttribute(
      "href",
      "https://www.cengizhankose.com/tr",
    );
    expect(socialValue("og:locale")).toBe("tr_TR");
    expect(socialValue("og:locale:alternate")).toBe("en_US");
    expect(
      document.head.querySelectorAll('link[rel="alternate"][hreflang]'),
    ).toHaveLength(3);
  });

  it("applyPageMeta on a partial meta (no head fields) clears them", () => {
    applyPageMeta(homeMeta());
    expect(canonicals()).toHaveLength(1);
    applyPageMeta({ title: "T", description: "d", robots: null, lang: "en" });
    expect(canonicals()).toHaveLength(0);
    expect(social()).toEqual([]);
    expect(ldScripts()).toHaveLength(0);
  });
});
