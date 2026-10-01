/**
 * The server render (src/entry-server.jsx, PERF-03): the app's own HTML for a
 * URL, drawn by Bun straight from source. What each page must carry for a
 * visitor and a crawler without JavaScript, what must not be in it (head tags,
 * inline scripts), and the cases the browser has to be able to hydrate.
 */
import { describe, expect, test } from "bun:test";
import { diagramKey } from "../../../src/lib/diagram-key.js";
import { count, EN_POST, makePost, POST_MARKDOWN, render } from "./helpers";

const body = async (url: string, options?: Parameters<typeof render>[1]) =>
  (await render(url, options)).html;
const h1Of = (html: string) =>
  /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1].replace(/<[^>]*>/g, " ");

const STATIC_URLS = ["/", "/about", "/portfolio", "/contact", "/blog"];
// What the server gives /blog (src/server/static.ts renderBlog).
const LISTS = {
  "/api/posts?lang=en": [],
  "/api/posts?lang=tr&missingIn=en": [],
};

describe("the static pages", () => {
  test.each(STATIC_URLS)(
    "%s: one h1, the header and the menu, the social strip, no head tags, no script",
    async (url) => {
      const html = await body(url, { fallback: LISTS });
      expect(count(html, /<h1\b/g)).toBe(1);
      expect(html).toContain('<header class="fixed-top siteHeader"');
      expect(html).toContain('<main id="main" tabindex="-1">');
      expect(html).toContain('<aside aria-label="Social links"');
      // The head is src/seo/head.ts's alone (T-03): nothing of it in the body.
      expect(html).not.toMatch(
        /data-seo|<title\b|<meta\b|application\/ld\+json/,
      );
      // No inline `$RC` boundary scripts, which the CSP would block, and no
      // hidden half-streamed boundary.
      expect(html).not.toContain("<script");
      expect(html).not.toContain('hidden id="S:');
      // Nothing is waiting for the browser.
      expect(html).not.toContain("Loading...");
    },
  );

  test("the h1 text is the page's own: the pages differ from each other", async () => {
    const titles = new Set<string>();
    for (const url of STATIC_URLS) {
      titles.add(h1Of(await body(url, { fallback: LISTS }))!);
    }
    expect(titles.size).toBe(STATIC_URLS.length);
  });

  test("the home page draws the hero photo once, without React's own preload copy", async () => {
    const html = await body("/");
    expect(count(html, /<img\b/g)).toBeGreaterThanOrEqual(1);
    expect(html).toContain('src="/img/hero/cengizhan-kose-v1-768.jpg"');
    expect(html).not.toContain('rel="preload"');
  });

  test("the language of a page is the URL's: /tr/about is the About page in Turkish, an unknown /tr path the Turkish 404 page", async () => {
    // LIVE.static has 'tr' since W11 (SEO-11 Adım B); the client's LiveGate
    // says the same, which is what hydration needs.
    const tr = await body("/tr/about");
    expect(tr).not.toContain(" not-found");
    expect(tr).not.toBe(await body("/about"));
    expect(tr).toContain('lang="tr"');
    const missing = await body("/tr/yok-boyle-bir-sayfa");
    expect(missing).toContain(" not-found");
    expect(h1Of(missing)).toContain("Sayfa bulunamadı");
  });

  test("an unknown path is the NotFound page, with a link home", async () => {
    const html = await body("/definitely-not-a-page");
    expect(html).toContain(" not-found");
    expect(html).toContain('href="/"');
  });

  test("the same URL and data give the same HTML (nothing random or clock-bound but the year)", async () => {
    expect(await body("/about")).toBe(await body("/about"));
  });

  test("two renders at once do not share state", async () => {
    const [a, b] = await Promise.all([body("/about"), body("/contact")]);
    expect(a).not.toBe(b);
    expect(h1Of(a)).not.toBe(h1Of(b));
  });
});

describe("the blog pages", () => {
  const card = (post = EN_POST) => {
    const { content: _c, translations: _t, ...rest } = post;
    return JSON.parse(JSON.stringify(rest));
  };
  const WITH_POST = {
    "/api/posts?lang=en": [card()],
    "/api/posts?lang=tr&missingIn=en": [],
  };

  test("/blog draws the lists it is given and nothing else", async () => {
    const html = await body("/blog", { fallback: WITH_POST });
    expect(html).toContain(">Hello world</a>");
    expect(html).not.toContain("blog-skeleton");
    expect(count(html, /<h1\b/g)).toBe(1);
  });

  test("/blog without data draws the loading state (the browser then asks)", async () => {
    const html = await body("/blog");
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(html).not.toContain("Hello world");
  });

  test("a post page draws the article: h1, headings, list, table, footnote", async () => {
    const post = JSON.parse(JSON.stringify(EN_POST));
    const html = await body("/blog/hello-world", {
      fallback: { "/api/posts/hello-world": post },
    });
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(html).toContain('<article class="blog-post" lang="en">');
    expect(html).toContain("<h2>First section</h2>");
    expect(html).toContain("<h3>A detail</h3>");
    expect(html).toContain("<table>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("The footnote.");
    // The post's own language inside the article, the interface's outside it.
    expect(html).toContain('<time dateTime="2026-09-30T10:00:00.000Z">');
  });

  test("a TR post: the article speaks Turkish with Turkish dates", async () => {
    const post = JSON.parse(
      JSON.stringify(
        makePost({
          slug: "merhaba",
          lang: "tr",
          title: "Merhaba dünya",
          translations: [],
        }),
      ),
    );
    const html = await body("/tr/blog/merhaba", {
      fallback: { "/api/posts/merhaba": post },
    });
    expect(html).toContain('<article class="blog-post" lang="tr">');
    expect(html).toContain("30 Eylül 2026");
  });

  test("a stored drawing is printed as two SVGs and CSS picks one (PERF-05): nothing theme-dependent is in the markup", async () => {
    const chart = "flowchart LR\n  A --> B";
    const svg = (name: string) =>
      `<svg role="img" viewBox="0 0 10 10"><title>${name}</title></svg>`;
    const post = JSON.parse(
      JSON.stringify(
        makePost({
          content: `Before.\n\n\`\`\`mermaid\n${chart}\n\`\`\`\n\nAfter.`,
          diagrams: {
            [diagramKey(chart)]: {
              label: "A to B",
              light: svg("light"),
              dark: svg("dark"),
            },
          },
        } as never),
      ),
    );
    const html = await body("/blog/hello-world", {
      fallback: { "/api/posts/hello-world": post },
    });
    expect(count(html, /class="mermaid-theme mermaid-theme--light"/g)).toBe(1);
    expect(count(html, /class="mermaid-theme mermaid-theme--dark"/g)).toBe(1);
    expect(html).not.toContain("mermaid-placeholder");
  });

  test("without a stored drawing the page keeps a placeholder (mermaid is the browser's)", async () => {
    const post = JSON.parse(JSON.stringify(EN_POST));
    expect(POST_MARKDOWN).toContain("```mermaid");
    const html = await body("/blog/hello-world", {
      fallback: { "/api/posts/hello-world": post },
    });
    expect(count(html, /class="mermaid-placeholder"/g)).toBe(1);
  });

  test("errors: a post whose request came back 404 is the post's NotFound page", async () => {
    const html = await body("/blog/not-found", {
      errors: { "/api/posts/not-found": 404 },
    });
    expect(html).toContain(" not-found");
    expect(html).toContain("Post not found");
    expect(html).not.toContain("blog-skeleton");
    const tr = await body("/tr/blog/not-found", {
      errors: { "/api/posts/not-found": 404 },
    });
    expect(h1Of(tr)).not.toContain("Post not found"); // Turkish
    expect(tr).toContain('lang="tr"');
  });

  test("errors: any other status is the error state, not a 404", async () => {
    const html = await body("/blog/some-post", {
      errors: { "/api/posts/some-post": 500 },
    });
    expect(html).not.toContain(" not-found");
    expect(html).toContain("blog-error");
  });
});

describe("a render that cannot finish", () => {
  test("rejects with the URL in the message: the build fails, the request path falls back to the shell", async () => {
    // A post whose title is an object: React cannot draw it.
    const broken = { slug: "x", title: {}, content: null, lang: "en" };
    await expect(
      render("/blog/x", { fallback: { "/api/posts/x": broken } }),
    ).rejects.toThrow("render(/blog/x) failed");
  });
});
