/**
 * renderSnapshot / renderNotFoundSnapshot (SEO-01 step 6): the readable
 * content written into <div id="root">. Text is escaped, the body of a post is
 * the sanitised markdown, internal links point at the page's own language,
 * and the markup of the blog pages equals what the app's components render
 * (same data, react-dom/server) so the stylesheet draws both alike.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SWRConfig } from "swr";
import { getContent } from "../../../src/content/index.js";
import { swrConfig } from "../../../src/lib/swr.js";
import { blogIndexLists } from "../../../src/lib/swrFallback.js";
import { HERO_IMAGE, heroSrcSet } from "../../../src/pages/home/heroImage.js";
import {
  renderNotFoundSnapshot,
  renderSnapshot,
  type SnapshotData,
} from "../../../src/seo/snapshot";
import { ALL_LIVE, matchRoute } from "../../../src/seo/routes.js";
import { EN_ONLY } from "../seo/loose";
import {
  card,
  count,
  EN_POST,
  makePost,
  POST_MARKDOWN,
  TR_ONLY_POST,
  TR_POST,
} from "./helpers";

const snap = (
  path: string,
  locale: string,
  data: SnapshotData = {},
  live: typeof EN_ONLY | typeof ALL_LIVE = EN_ONLY,
) =>
  renderSnapshot(matchRoute(path, live as never), locale, data, live as never);

/** The internal links of an HTML fragment: hrefs that start with "/". */
function internalLinks(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\shref="(\/[^"]*)"/g)].map((m) => m[1]);
}

// The page components are .jsx; the server tsconfig has no --jsx, so they are
// loaded through a computed path (Bun runs them as they are).
const SRC = join(import.meta.dir, "..", "..", "..", "src");
const component = async (file: string) =>
  (await import(join(SRC, file))) as Record<string, any>;

const dom = (html: string) => new JSDOM(`<body>${html}</body>`).window.document;

/** An element's outer HTML with data-discover dropped, attributes sorted, tags tight. */
function normalised(element: Element | null): string {
  if (!element) return "";
  const clone = element.cloneNode(true) as Element;
  for (const node of [clone, ...clone.querySelectorAll("*")]) {
    const attributes = [...node.attributes]
      // data-discover: the router's link marker; _R_… / :r…: React's useId.
      .filter(
        ({ name, value }) =>
          name !== "data-discover" &&
          !(name === "id" && /^(_R_|:r)/.test(value)),
      )
      .map(({ name, value }) => [name, value] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const { name } of [...node.attributes]) node.removeAttribute(name);
    for (const [name, value] of attributes) node.setAttribute(name, value);
  }
  return clone.outerHTML.replace(/>\s+</g, "><").trim();
}

const app = (path: string, element: ReactElement, fallback = {}) =>
  renderToStaticMarkup(
    createElement(
      SWRConfig,
      {
        value: { ...swrConfig, provider: () => new Map(), fallback },
      } as never,
      createElement(MemoryRouter, { initialEntries: [path] }, element),
    ),
  );

// JSON round trip: dates become the ISO strings the page gets from the API.
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("a post page", () => {
  const html = snap("/blog/hello-world", "en", { post: EN_POST });

  test("one h1, the section headings, the article in the post's language", () => {
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(count(html, /<h2\b/g)).toBe(2); // "First section" + the footnotes label
    expect(count(html, /<h3\b/g)).toBe(2);
    expect(html).toContain('<article class="blog-post" lang="en">');
    expect(html).toContain('<h1 class="blog-post-title-full">Hello world</h1>');
  });

  test("the date is machine-readable and written in the post's language", () => {
    expect(html).toContain(
      '<time datetime="2026-09-30T10:00:00.000Z">September 30, 2026</time>',
    );
    expect(html).toContain("Published:");
    const tr = snap(
      "/tr/blog/merhaba-dunya",
      "tr",
      { post: TR_POST },
      ALL_LIVE,
    );
    expect(tr).toContain('<article class="blog-post" lang="tr">');
    expect(tr).toContain("Yayınlandı:");
    expect(tr).toContain(
      '<time datetime="2026-09-30T10:00:00.000Z">30 Eylül 2026</time>',
    );
  });

  test("an edit on a later day adds an Edited line", () => {
    const edited = makePost({ updatedAt: new Date("2026-10-02T10:00:00Z") });
    const out = snap("/blog/hello-world", "en", { post: edited });
    expect(out).toContain("Edited:");
    expect(out).toContain(
      '<time datetime="2026-10-02T10:00:00.000Z">October 2, 2026</time>',
    );
    expect(html).not.toContain("Edited:");
  });

  test("the body is the sanitised markdown, the diagram stays source text", () => {
    expect(html).toContain("<h2>First section</h2>");
    expect(html).toContain('<pre><code class="language-mermaid">flowchart LR');
    const hostile = snap("/blog/hello-world", "en", {
      post: makePost({
        content: "Hi <script>alert(1)</script> [x](javascript:alert(2))",
      }),
    });
    expect(hostile).not.toContain("<script");
    expect(hostile).not.toContain("javascript:");
  });

  test("title, excerpt-free text and attributes are escaped", () => {
    const out = snap("/blog/hello-world", "en", {
      post: makePost({
        title: 'Q "x" <img src=x onerror=alert(1)> & co',
        coverImage: 'https://example.com/a.png" onerror="alert(1)',
      }),
    });
    expect(out).toContain(
      "Q &quot;x&quot; &lt;img src=x onerror=alert(1)&gt; &amp; co",
    );
    expect(out).not.toContain("<img src=x");
    expect(out).toContain(
      'src="https://example.com/a.png&quot; onerror=&quot;alert(1)"',
    );
    // Parsed, the image has no event handler attribute (the hostile text sits
    // inside the escaped alt and src values).
    const images = dom(out).querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0].hasAttribute("onerror")).toBe(false);
  });

  test("a cover URL that is not https or a site path is left out", () => {
    for (const coverImage of [
      "javascript:alert(1)",
      "//evil.example/a.png",
      "/\\evil",
      "data:image/png;base64,AA",
      "http://example.com/a.png",
    ]) {
      const out = snap("/blog/hello-world", "en", {
        post: makePost({ coverImage }),
      });
      expect(out, coverImage).not.toContain('class="blog-post-cover"');
    }
    expect(
      snap("/blog/hello-world", "en", {
        post: makePost({ coverImage: "https://example.com/a.png" }),
      }),
    ).toContain('class="blog-post-cover"');
    expect(
      snap("/blog/hello-world", "en", {
        post: makePost({ coverImage: "/blog/a.png" }),
      }),
    ).toContain('src="/blog/a.png"');
  });

  test("without a post there is nothing to print", () => {
    expect(snap("/blog/hello-world", "en", {})).toBe("");
    expect(snap("/blog/hello-world", "en", { post: null })).toBe("");
  });

  test("the back link and interface text stay in a language whose pages are open", () => {
    // TR post, TR pages closed: Turkish article, English chrome linking to /blog.
    const closed = snap(
      "/tr/blog/merhaba-dunya",
      "tr",
      { post: TR_POST },
      EN_ONLY,
    );
    expect(closed).toContain('<div class="blog-post-container" lang="en">');
    expect(closed).toContain('<a href="/blog" class="blog-back">');
    expect(closed).toContain("Back to Blog");
    // Once the TR pages open the chrome follows the URL language.
    const open = snap(
      "/tr/blog/merhaba-dunya",
      "tr",
      { post: TR_POST },
      ALL_LIVE,
    );
    expect(open).toContain('<div class="blog-post-container" lang="tr">');
    expect(open).toContain('<a href="/tr/blog" class="blog-back">');
  });
});

describe("the blog index (T-12 grouping)", () => {
  const lists = [[card(EN_POST)], [card(TR_ONLY_POST)]];
  const html = snap("/blog", "en", { lists });

  test("one h1, own posts first, the other language's untranslated posts in their own group", () => {
    expect(count(html, /<h1\b/g)).toBe(1);
    const own = html.indexOf(
      '<h2 class="blog-post-title"><a href="/blog/hello-world"',
    );
    const group = html.indexOf('<section class="blog-other"');
    expect(own).toBeGreaterThan(-1);
    expect(group).toBeGreaterThan(own);
    expect(html).toContain(
      '<h2 id="other-lang" class="blog-other__title">Posts in Turkish</h2>',
    );
    expect(html).toContain(
      '<article class="blog-card" lang="tr"><h3 class="blog-post-title"><a href="/tr/blog/sadece-turkce">',
    );
    expect(html).toContain(
      '<span class="lang-badge" aria-hidden="true">TR</span>',
    );
  });

  test("a translated pair is listed once, in the page's language", () => {
    const pair = snap("/blog", "en", {
      lists: [[card(EN_POST)], [card(TR_POST), card(TR_ONLY_POST)]],
    });
    expect(count(pair, /<article\b/g)).toBe(2);
    expect(pair).not.toContain("merhaba-dunya");
  });

  test("TR index: Turkish posts first, every link under /tr", () => {
    const tr = snap(
      "/tr/blog",
      "tr",
      { lists: [[card(TR_POST), card(TR_ONLY_POST)], []] },
      ALL_LIVE,
    );
    expect(tr).toContain('<a href="/tr/blog/merhaba-dunya">');
    expect(tr.indexOf("merhaba-dunya")).toBeLessThan(
      tr.indexOf("sadece-turkce"),
    );
    expect(tr).not.toContain("blog-other");
    for (const href of internalLinks(tr)) expect(href).toStartWith("/tr");
  });

  test("no posts: the empty state with links home and to contact, never a blank list", () => {
    const empty = snap("/blog", "en", { lists: [[], []] });
    expect(empty).toContain(
      'class="status-state status-state--inline blog-empty"',
    );
    expect(empty).toContain("No posts yet");
    expect(empty).not.toContain("blog-grid");
    expect(internalLinks(empty)).toEqual(
      expect.arrayContaining(["/", "/contact"]),
    );
  });

  test("hostile post fields are escaped", () => {
    const out = snap("/blog", "en", {
      lists: [
        [
          {
            ...card(EN_POST),
            title: "<b>x</b>",
            excerpt: "a & b",
            slug: 'x"y',
          },
        ],
        [],
      ],
    });
    expect(out).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(out).toContain("a &amp; b");
    expect(out).toContain('href="/blog/x&quot;y"');
  });
});

describe("static pages", () => {
  test("home: one h1 with name and role, the intro, links to the other pages", () => {
    const html = snap("/", "en");
    const { hero } = getContent("en") as any;
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(html).toContain(
      `<h1 class="intro__name">${hero.name} <span class="intro__role">${hero.role}</span></h1>`,
    );
    expect(html).toContain(`<p class="intro__lead">${hero.lead}</p>`);
    expect(internalLinks(html)).toEqual(
      expect.arrayContaining(["/about", "/contact", "/blog"]),
    );
  });

  test("home: the text comes first, then the <picture> with the preloaded AVIF set (W6 contract)", () => {
    const document = dom(snap("/", "en"));
    const section = document.querySelector("section#home")!;
    const row = section.querySelector(".intro_sec")!;
    expect(
      [...row.children].map((child) => child.className.trim().split(" ")[0]),
    ).toEqual(["text", "h_bg-image"]);

    const sources = [...row.querySelectorAll(".h_bg-image > picture > source")];
    expect(sources.map((s) => s.getAttribute("type"))).toEqual([
      "image/avif",
      "image/webp",
    ]);
    expect(sources[0].getAttribute("srcset")).toBe(heroSrcSet("avif"));
    expect(sources[0].getAttribute("sizes")).toBe(HERO_IMAGE.sizes);
    const img = row.querySelector(".h_bg-image > picture > img")!;
    expect(img.getAttribute("width")).toBe(String(HERO_IMAGE.width));
    expect(img.getAttribute("height")).toBe(String(HERO_IMAGE.height));
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("alt")).toBe("Cengizhan Köse");
  });

  test("home: the hero photo, the h1 and the DOM order equal what <Home/> renders", async () => {
    const { Home } = await component("pages/home/index.jsx");
    const client = dom(
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          { initialEntries: ["/"] },
          createElement(Home),
        ),
      ),
    );
    const server = dom(snap("/", "en"));
    const pick = (d: Document, selector: string) =>
      normalised(d.querySelector(selector));
    expect(pick(server, ".h_bg-image")).toBe(pick(client, ".h_bg-image"));
    expect(pick(server, "h1.intro__name")).toBe(pick(client, "h1.intro__name"));
    expect(pick(server, "section#home")).not.toBe("");
    expect(
      server.querySelector("section#home > .intro_sec > .text + .h_bg-image"),
    ).not.toBeNull();
    expect(
      client.querySelector("section#home > .intro_sec > .text + .h_bg-image"),
    ).not.toBeNull();
  });

  test("about: one h1, eight h2 sections, every timeline role, skill, award and talk", () => {
    const html = snap("/about", "en");
    const content = getContent("en") as any;
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(count(html, /<h2\b/g)).toBe(8);
    for (const role of content.timeline) expect(html).toContain(role.jobtitle);
    for (const group of content.skills) {
      for (const item of group.items)
        expect(html).toContain(`>${item}</li>`.replace("&", "&amp;"));
    }
    for (const award of content.awards.filter((a: any) => !a.hidden)) {
      expect(html).toContain(award.event.replace("&", "&amp;"));
    }
    for (const talk of content.about.talks)
      expect(html).toContain(`href="${talk.url}"`);
    expect(html).toContain('id="awards"');
    expect(html).toContain('<table class="table caption-top timeline">');
    expect(html).toContain('href="/about#awards"');
  });

  test("contact: the address as a mailto link and the description", () => {
    const html = snap("/contact", "en");
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(html).toContain(
      '<a href="mailto:hello@cengizhankose.com">hello@cengizhankose.com</a>',
    );
    expect(html).toContain((getContent("en") as any).contact.description);
    expect(html).not.toContain("<form");
  });

  test("portfolio: the heading only (noindex page)", () => {
    const html = snap("/portfolio", "en");
    expect(html).toContain('<h1 class="display-4 mb-4">Portfolio</h1>');
  });

  test("every static page has exactly one <main> and a navigation of indexable pages", () => {
    for (const path of ["/", "/about", "/contact", "/portfolio", "/blog"]) {
      const html = snap(path, "en", { lists: [[], []] });
      expect(count(html, /<main\b/g), path).toBe(1);
      expect(count(html, /<nav\b/g), path).toBe(1);
      const nav = /<nav[\s\S]*<\/nav>/.exec(html)![0];
      expect(internalLinks(nav), path).toEqual([
        "/",
        "/about",
        "/blog",
        "/contact",
      ]);
    }
  });

  test("a route the snapshot has nothing to say about gives an empty string", () => {
    expect(
      renderSnapshot({ type: "notfound", locale: "en", path: "/x" }, "en"),
    ).toBe("");
    expect(
      renderSnapshot({ type: "static", locale: "en", path: "/privacy" }, "en"),
    ).toBe("");
  });
});

describe("TR pages (once LIVE.static opens 'tr')", () => {
  const pages: [string, SnapshotData][] = [
    ["/tr", {}],
    ["/tr/about", {}],
    ["/tr/contact", {}],
    ["/tr/blog", { lists: [[card(TR_POST)], []] }],
    ["/tr/blog/merhaba-dunya", { post: TR_POST }],
  ];

  test.each(pages)("%s: every internal link starts with /tr", (path, data) => {
    const html = snap(path, "tr", data, ALL_LIVE);
    expect(html).not.toBe("");
    const links = internalLinks(html);
    expect(links.length).toBeGreaterThan(0);
    for (const href of links)
      expect(href, `${path} -> ${href}`).toStartWith("/tr");
  });

  test("the text is Turkish", () => {
    expect(snap("/tr/about", "tr", {}, ALL_LIVE)).toContain("Hakkımda");
    expect(snap("/tr/contact", "tr", {}, ALL_LIVE)).toContain("İletişime geç");
    const home = snap("/tr", "tr", {}, ALL_LIVE);
    expect(home).toContain('<div id="button_p" class="ac_btn btn ">Hakkımda');
    // The role keeps its own language on the TR page (WCAG 3.1.2).
    expect(home).toContain('<span class="intro__role" lang="en">');
  });

  test("while the TR pages are closed the TR post links to the EN pages", () => {
    const html = snap(
      "/tr/blog/merhaba-dunya",
      "tr",
      { post: TR_POST },
      EN_ONLY,
    );
    for (const href of internalLinks(html)) expect(href).not.toStartWith("/tr");
  });
});

describe("the 404 page", () => {
  test("page: Page not found, links to home and blog", () => {
    const html = renderNotFoundSnapshot(matchRoute("/nope"));
    expect(html).toContain(
      '<h1 id="not-found-title" class="status-state__title">Page not found</h1>',
    );
    expect(html).toContain('lang="en"');
    expect(internalLinks(/<section[\s\S]*<\/section>/.exec(html)![0])).toEqual([
      "/",
      "/blog",
    ]);
  });

  test("post: Post not found, the blog link first, in the URL's language", () => {
    const route = matchRoute("/tr/blog/yok", EN_ONLY as never);
    const html = renderNotFoundSnapshot(
      { ...route, type: "post" },
      { post: true },
    );
    expect(html).toContain("Yazı bulunamadı");
    expect(html).toContain('lang="tr"');
    // TR pages closed: the links stay on the EN pages.
    expect(internalLinks(/<section[\s\S]*<\/section>/.exec(html)![0])).toEqual([
      "/blog",
      "/",
    ]);
  });

  test("an unknown /tr path is written in Turkish once TR is open", () => {
    const route = matchRoute("/tr/nope", ALL_LIVE as never);
    const html = renderNotFoundSnapshot(route, { live: ALL_LIVE as never });
    expect(html).toContain("Sayfa bulunamadı");
    for (const href of internalLinks(
      /<section[\s\S]*<\/section>/.exec(html)![0],
    )) {
      expect(href).toStartWith("/tr");
    }
  });
});

describe("the blog pages equal what the app's components render", () => {
  test("/blog: the index of BlogHome with the same lists", async () => {
    const { default: BlogHome } = await component("pages/blog/BlogHome.jsx");
    const cases: Record<string, Record<string, any>[][]> = {
      "other group only": [[], [card(TR_ONLY_POST)]],
      "own and other": [[card(EN_POST)], [card(TR_ONLY_POST)]],
      "with a cover": [
        [{ ...card(EN_POST), coverImage: "https://example.com/c.png" }],
        [],
      ],
      empty: [[], []],
    };
    for (const [name, lists] of Object.entries(cases)) {
      const fallback = Object.fromEntries(
        blogIndexLists("en").map(({ key }, index) => [key, wire(lists[index])]),
      );
      const client = dom(app("/blog", createElement(BlogHome), fallback));
      const server = dom(snap("/blog", "en", { lists }));
      expect(normalised(server.querySelector(".blog-container")), name).toBe(
        normalised(client.querySelector(".blog-container")),
      );
    }
  });

  test("/blog/<slug>: the article of BlogPost with the same post", async () => {
    const { default: BlogPost } = await component("pages/blog/BlogPost.jsx");
    // No diagram (the app draws it), no external link (W7 adds target/rel to those).
    const content = POST_MARKDOWN.replace(/```mermaid[\s\S]*?```/, "").replace(
      "[link](https://example.com/page)",
      "link",
    );
    for (const post of [
      makePost({ content }),
      makePost({
        content,
        coverImage: "https://example.com/c.png",
        updatedAt: new Date("2026-10-02T10:00:00Z"),
      }),
    ]) {
      const fallback = { [`/api/posts/${post.slug}`]: wire(post) };
      const tree = createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/blog/:slug",
          element: createElement(BlogPost),
        }),
      );
      const client = dom(app(`/blog/${post.slug}`, tree, fallback));
      const server = dom(snap(`/blog/${post.slug}`, "en", { post }));
      expect(normalised(server.querySelector(".blog-post-container"))).toBe(
        normalised(client.querySelector(".blog-post-container")),
      );
    }
  });
});
