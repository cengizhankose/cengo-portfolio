// MKT-03 + SEO-17, rendered: the home page below the hero, in both languages.
//  - the sections and their order, titles in the page's language, one h1;
//  - the links the home page gives to portfolio, posts and contact, with the
//    language prefix on /tr;
//  - the latest-writing block: the T-12 order, the language badge, the limit
//    of three, and nothing drawn while the API is loading, failing or
//    answering with something that is not a list (FE-03).
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { post, renderPage, sectionIds, stubFetch, json } from "./support.jsx";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});
vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const { Home } = await import("../../../src/pages/home/index.jsx");
const { getContent } = await import("../../../src/content/index.js");
const { translate } = await import("../../../src/i18n/translate.js");
const { postsKey } = await import("../../../src/lib/swr.js");
const { track } = await import("../../../src/lib/analytics/index.js");

const ALL = ["home", "proof", "work", "services", "blog", "cta"];
const WITHOUT_BLOG = ALL.filter((id) => id !== "blog");

// The two swr keys of a blog index in `locale` (T-12): own posts, and the
// other language's posts that are not translated.
const keysFor = (locale) => {
  const other = locale === "en" ? "tr" : "en";
  return [postsKey(locale), postsKey(other, { missingIn: locale })];
};

const withPosts = (locale, own, other = []) => {
  const [ownKey, otherKey] = keysFor(locale);
  return { [ownKey]: own, [otherKey]: other };
};

beforeEach(() => {
  track.mockReset();
  document.head.innerHTML = "<title>x</title>";
  stubFetch(() => json([]));
});

describe.each([
  ["/", "en", "/portfolio", "/contact", "/blog/"],
  ["/tr", "tr", "/tr/portfolio", "/tr/contact", "/tr/blog/"],
])("%s", (path, locale, portfolioHref, contactHref, postPrefix) => {
  const t = (key, vars) => translate(locale, key, vars);
  const own = [post(1, locale), post(2, locale), post(3, locale)];

  it("draws the sections in order, with the hero's ids and titles in the page language", () => {
    renderPage(<Home />, path, { fallback: withPosts(locale, own) });

    expect(sectionIds()).toEqual(ALL);
    const h2 = [...document.querySelectorAll("h2")].map((h) => h.textContent);
    expect(h2).toEqual([
      t("home.proofTitle"),
      t("home.workTitle"),
      t("home.servicesTitle"),
      t("home.latestWriting"),
      t("home.finalTitle"),
    ]);
    // One h1 (the hero's); every section title is an h2.
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    for (const id of ALL.slice(1)) {
      const section = document.getElementById(id);
      expect(section.querySelectorAll("h2"), id).toHaveLength(1);
      expect(section.getAttribute("aria-labelledby"), id).toBe(
        section.querySelector("h2").id,
      );
    }
  });

  it("has the compact proof strip: companies, at least four wins", () => {
    renderPage(<Home />, path, { fallback: withPosts(locale, own) });

    const proof = document.getElementById("proof");
    expect(proof.querySelector("h2").textContent).toBe(t("home.proofTitle"));
    expect(proof.textContent).toContain(t("proof.companies"));
    expect(proof.querySelectorAll("ul")[1].querySelectorAll("li").length).toBe(
      getContent(locale).proof.awards.length,
    );
    expect(getContent(locale).proof.awards.length).toBeGreaterThanOrEqual(4);
  });

  it("shows the three selected cases with a link to each card, and 'All work'", () => {
    renderPage(<Home />, path, { fallback: withPosts(locale, own) });

    const work = document.getElementById("work");
    const cards = work.querySelectorAll("ul > li");
    expect(cards).toHaveLength(3);
    const { projects } = getContent(locale);
    expect(
      [...cards].map((card) => card.querySelector("h3").textContent),
    ).toEqual(projects.slice(0, 3).map((project) => project.title));
    expect(
      [...cards].map((card) => card.querySelector("a").getAttribute("href")),
    ).toEqual(
      ["salesgym", "farmin", "effort_lab"].map(
        (id) => `${portfolioHref}#project-${id}`,
      ),
    );
    const all = screen.getByRole("link", {
      name: new RegExp(`^${t("home.workAll")}`),
    });
    expect(all.getAttribute("href")).toBe(portfolioHref);
  });

  it("has a link to the portfolio, to a post and to the contact page; every static link keeps the language prefix", () => {
    renderPage(<Home />, path, { fallback: withPosts(locale, own) });

    const hrefs = [...document.querySelectorAll("a[href]")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs.some((href) => href.endsWith("/portfolio"))).toBe(true);
    expect(hrefs.some((href) => href.startsWith(postPrefix))).toBe(true);
    expect(hrefs.some((href) => href.endsWith("/contact"))).toBe(true);
    const internal = hrefs.filter((href) => href.startsWith("/"));
    if (locale === "tr") {
      for (const href of internal) {
        expect(href.startsWith("/tr"), href).toBe(true);
      }
    } else {
      expect(internal.filter((href) => href.startsWith("/tr"))).toEqual([]);
    }
  });

  it("the closing call to action reuses the hero's label and reply promise", () => {
    renderPage(<Home />, path, { fallback: withPosts(locale, own) });

    const cta = document.getElementById("cta");
    const { hero, contact } = getContent(locale);
    const link = cta.querySelector("a");
    expect(link.getAttribute("href")).toBe(contactHref);
    expect(link.textContent).toBe(t("cta.primary"));
    expect(cta.textContent).toContain(hero.lead);
    expect(cta.textContent).toContain(
      t("cta.note", { time: contact.responseTime }),
    );
  });
});

describe("latest writing (SEO-17)", () => {
  it("lists the page language's posts first, the untranslated other-language posts after them with a badge, at most three", () => {
    const own = [post(1, "en"), post(2, "en")];
    const other = [post(3, "tr"), post(4, "tr")];
    renderPage(<Home />, "/", { fallback: withPosts("en", own, other) });

    const blog = document.getElementById("blog");
    const articles = [...blog.querySelectorAll("article")];
    expect(articles.map((a) => a.querySelector("h3 a").textContent)).toEqual([
      "Post 1 title",
      "Post 2 title",
      "Post 3 title",
    ]);
    // Each post links to its own language path.
    expect(
      articles.map((a) => a.querySelector("h3 a").getAttribute("href")),
    ).toEqual(["/blog/post-1", "/blog/post-2", "/tr/blog/post-3"]);
    // Only the Turkish post carries the badge and a lang attribute.
    expect(articles.map((a) => a.getAttribute("lang"))).toEqual([
      "en",
      "en",
      "tr",
    ]);
    expect(articles.map((a) => a.querySelector("h3 span") !== null)).toEqual([
      false,
      false,
      true,
    ]);
    expect(articles[2].querySelector("h3").textContent).toContain("TR");
    // Excerpt and a machine-readable date on every card.
    for (const article of articles) {
      expect(article.querySelector("p").textContent).toMatch(/^Excerpt of/);
      expect(article.querySelector("time").getAttribute("datetime")).toMatch(
        /^2026-/,
      );
    }
    // Plus a link to the whole list.
    expect(blog.querySelector('p > a[href="/blog"]').textContent).toContain(
      "All posts",
    );
  });

  it("keeps the 'Read the post' pointer link out of the keyboard order and the accessibility tree", () => {
    renderPage(<Home />, "/", {
      fallback: withPosts("en", [post(1, "en")]),
    });
    const blog = document.getElementById("blog");
    const links = [...blog.querySelectorAll("article a")];
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe(links[1].getAttribute("href"));
    expect(links[1].getAttribute("tabindex")).toBe("-1");
    expect(links[1].getAttribute("aria-hidden")).toBe("true");
    expect(links[1].textContent).toContain("Read the post");
    expect(screen.getAllByRole("link", { name: "Post 1 title" })).toHaveLength(
      1,
    );
  });

  it("asks the API under the blog's own keys when the server sent no data, then draws the block", async () => {
    const fetchMock = stubFetch((url) =>
      json(url.startsWith("/api/posts?lang=en&") ? [] : [post(1, "en")]),
    );
    renderPage(<Home />, "/");

    // Not drawn while it loads.
    expect(sectionIds()).toEqual(WITHOUT_BLOG);
    await waitFor(() => expect(sectionIds()).toEqual(ALL));
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toContain(postsKey("en"));
  });

  it.each([
    ["the API answers 500", () => json({ error: "boom" }, 500), 1],
    [
      "the network fails",
      () => {
        throw new TypeError("Failed to fetch");
      },
      1,
    ],
    ["the body is not a list", () => json({ posts: [] }), 1],
    ["there are no posts", () => json([]), 0],
  ])(
    "without the blog block, and with the rest of the page, when %s",
    async (_name, handler, reports) => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      stubFetch(handler);
      renderPage(<Home />, "/");

      // The failure is reported once (ANL-15); an empty list is no failure.
      await waitFor(() => expect(track).toHaveBeenCalledTimes(reports));
      expect(sectionIds()).toEqual(WITHOUT_BLOG);
      expect(document.querySelectorAll("h1")).toHaveLength(1);
      expect(document.getElementById("blog")).toBeNull();
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );

  it("reports a failing list as error_occurred once and never as a thrown error", async () => {
    stubFetch(() => json({ error: "boom" }, 500));
    renderPage(<Home />, "/");

    await waitFor(() => expect(track).toHaveBeenCalled());
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("error_occurred", {
      scope: "blog_api",
      endpoint: "list",
      status: "500",
    });
  });
});
