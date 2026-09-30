/**
 * What a crawler that does not run scripts gets from the end of a post and
 * from the head (SEO-16 criterion 4, MKT-07, MKT-20 criterion 5): the raw HTML
 * of createApp() over the fixture build. The byline, the author box, the AI
 * note once, the footer links, the feed autodiscovery in every head and the
 * JSON-LD author that matches the byline's About link.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createApp } from "../../../src/api/app";
import { renderHeadTags } from "../../../src/seo/head";
import { getPageMeta } from "../../../src/seo/pages.js";
import { LIVE, matchRoute } from "../../../src/seo/routes.js";
import { silenceLogs } from "../helpers";
import {
  EN_POST,
  FIXTURE_DIST,
  fakeQueries,
  makePost,
  TR_ONLY_POST,
  TR_POST,
} from "../ssr/helpers";

silenceLogs();

const COVER = "/blog/merhaba-dunya.png";
const app = createApp({
  queries: fakeQueries({
    posts: [EN_POST, { ...TR_POST, coverImage: COVER }, TR_ONLY_POST],
  }),
  serveSpa: true,
  distDir: FIXTURE_DIST,
  env: { RATE_LIMIT_DISABLED: "1" },
});

const page = async (path: string) => {
  const html = await (await app.request(path)).text();
  return { html, doc: new JSDOM(html).window.document };
};

describe("a TR post, raw HTML ($POST)", () => {
  let html: string;
  let doc: Document;
  let article: Element;
  beforeAll(async () => {
    ({ html, doc } = await page("/tr/blog/merhaba-dunya"));
    article = doc.querySelector("article")!;
  });

  test("the h1 is followed by a byline in Turkish with an rel=author About link", () => {
    const h1 = article.querySelector("h1")!;
    const byline = h1.nextElementSibling!;
    expect(byline.className).toBe("blog-post-byline");
    expect(byline.textContent).toBe(
      "Yazar: Cengizhan Köse & Logan (AI asistanı)",
    );
    const link = byline.querySelector("a")!;
    expect(link.getAttribute("rel")).toBe("author");
    // TR static pages are closed: the EN About page.
    expect(link.getAttribute("href")).toBe("/about");
  });

  test("exactly one aside.author-box with the name, the role and a Turkish bio of 60+ characters", () => {
    const boxes = doc.querySelectorAll("aside.author-box");
    expect(boxes).toHaveLength(1);
    const box = boxes[0];
    expect(box.textContent).toContain("Cengizhan Köse");
    expect(box.textContent).toContain("Senior Fullstack Engineer");
    expect(
      box.querySelector(".author-box__bio")!.textContent!.length,
    ).toBeGreaterThanOrEqual(60);
    expect(box.querySelector('a[href="/about"]')).not.toBeNull();
    expect(
      [...box.querySelectorAll('a[rel~="me"]')].map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual([
      "https://www.linkedin.com/in/cengizhankose",
      "https://github.com/cengizhankose",
    ]);
  });

  test("the AI note is in the page exactly once", () => {
    expect(html.match(/class="ai-disclosure"/g)).toHaveLength(1);
  });

  test("the footer has one contact, one About and one RSS link, and the RSS link is the TR feed", () => {
    const footer = doc.querySelector(".post-footer")!;
    expect(
      footer.querySelectorAll(
        'a[href$="/contact"], a[href$="/about"], a[href$="rss.xml"]',
      ),
    ).toHaveLength(3);
    expect(
      footer.querySelector('a[href$="rss.xml"]')!.getAttribute("href"),
    ).toBe("/tr/rss.xml");
    expect(footer.textContent).toContain("Yeni yazıları kaçırma");
  });

  test("the JSON-LD author URL is the absolute form of the byline's About link", () => {
    const ld = JSON.parse(
      doc.querySelector('script[type="application/ld+json"]')!.textContent!,
    );
    const posting = ld["@graph"].find(
      (node: { "@type": string }) => node["@type"] === "BlogPosting",
    );
    const href = article
      .querySelector(".blog-post-byline a")!
      .getAttribute("href");
    expect(posting.author.url).toBe(`https://www.cengizhankose.com${href}`);
    expect(posting.author.name).toBe("Cengizhan Köse");
  });

  test("the cover is decoration with its size, and it is the og:image (MKT-20 criterion 5)", () => {
    const cover = article.querySelector("img.blog-post-cover")!;
    expect(cover.getAttribute("alt")).toBe("");
    expect(cover.getAttribute("width")).toBe("1200");
    expect(cover.getAttribute("height")).toBe("630");
    expect(
      doc.querySelector('meta[property="og:image"]')!.getAttribute("content"),
    ).toBe(`https://www.cengizhankose.com${COVER}`);
  });

  test("the body sits in its own wrapper between the byline/date and the footer", () => {
    const body = article.querySelector(".blog-post-body")!;
    expect(body.querySelector(".blog-content")).not.toBeNull();
    expect(body.previousElementSibling!.className).toBe("blog-post-date");
    expect(body.nextElementSibling!.className).toBe("post-footer");
  });
});

describe("an EN post, raw HTML", () => {
  let doc: Document;
  beforeAll(async () => {
    ({ doc } = await page("/blog/hello-world"));
  });

  test("English byline, English AI note, the EN feed", () => {
    expect(doc.querySelector(".blog-post-byline")!.textContent).toBe(
      "By Cengizhan Köse & Logan (AI assistant)",
    );
    expect(doc.querySelector(".ai-disclosure")!.textContent).toContain(
      "written with the AI assistant Logan",
    );
    expect(
      doc
        .querySelector('.post-footer a[href$="rss.xml"]')!
        .getAttribute("href"),
    ).toBe("/rss.xml");
  });
});

describe("feed autodiscovery (MKT-07 criterion 5)", () => {
  test.each([
    "/",
    "/about",
    "/contact",
    "/blog",
    "/blog/hello-world",
    "/tr/blog/merhaba-dunya",
  ])(
    "%s: exactly two application/rss+xml links, one per language, no hreflang",
    async (path) => {
      const { doc, html } = await page(path);
      expect(html.match(/application\/rss\+xml/g)).toHaveLength(2);
      const links = [
        ...doc.querySelectorAll(
          'link[rel="alternate"][type="application/rss+xml"]',
        ),
      ];
      expect(links.map((l) => l.getAttribute("href"))).toEqual([
        "https://www.cengizhankose.com/rss.xml",
        "https://www.cengizhankose.com/tr/rss.xml",
      ]);
      expect(links.map((l) => l.getAttribute("title"))).toEqual([
        "Blog (EN) | Cengizhan Köse",
        "Blog (TR) | Cengizhan Köse",
      ]);
      // Not hreflang: those are one per page and managed by the client.
      expect(links.every((l) => !l.hasAttribute("hreflang"))).toBe(true);
    },
  );

  test("a 404 page carries them too; a missing title (no page) prints none", async () => {
    expect((await page("/nope")).html).toContain("application/rss+xml");
    expect(renderHeadTags({})).toBe("");
  });

  test("the option can switch them off", () => {
    const meta = getPageMeta(matchRoute("/blog", LIVE), "en");
    expect(renderHeadTags(meta, { feeds: false })).not.toContain("rss+xml");
    expect(renderHeadTags(meta)).toContain("rss+xml");
  });
});

describe("the blog index, raw HTML (MKT-20)", () => {
  test("the tagline follows the h1; covers are decoration with width, height and lazy loading", async () => {
    const { doc } = await page("/blog");
    const h1 = doc.querySelector("h1")!;
    expect(h1.nextElementSibling!.className).toBe("blog-tagline");
    expect(h1.nextElementSibling!.textContent).toBe(
      "Notes from building web, mobile and AI products: the decisions, the numbers and what broke.",
    );
  });

  test("a card with a cover", async () => {
    const withCover = createApp({
      queries: fakeQueries({
        posts: [makePost({ coverImage: "/blog/hello-world.png" })],
      }),
      serveSpa: true,
      distDir: FIXTURE_DIST,
      env: { RATE_LIMIT_DISABLED: "1" },
    });
    const html = await (await withCover.request("/blog")).text();
    const cover = new JSDOM(html).window.document.querySelector(".blog-cover")!;
    expect(cover.getAttribute("alt")).toBe("");
    expect(cover.getAttribute("width")).toBe("1200");
    expect(cover.getAttribute("height")).toBe("630");
    expect(cover.getAttribute("loading")).toBe("lazy");
  });

  test("the empty state names the feed", async () => {
    const empty = createApp({
      queries: fakeQueries({ posts: [] }),
      serveSpa: true,
      distDir: FIXTURE_DIST,
      env: { RATE_LIMIT_DISABLED: "1" },
    });
    const { doc } = {
      doc: new JSDOM(await (await empty.request("/blog")).text()).window
        .document,
    };
    expect(doc.querySelector(".blog-empty-feed a")!.getAttribute("href")).toBe(
      "/rss.xml",
    );
    expect(doc.querySelector(".status-state__text")!.textContent).toBe(
      "The first post is on its way.",
    );
  });
});
