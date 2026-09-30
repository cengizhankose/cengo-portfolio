/**
 * renderHeadTags / preloadFor (SEO-01 step 4, PERF-01): the head prints what
 * getPageMeta() returns and nothing else, escapes every value, prints no
 * canonical / share card / JSON-LD for a page that has none, and gives only the
 * home page the hero preload.
 */
import { describe, expect, test } from "bun:test";
import { escapeHtml, preloadFor, renderHeadTags } from "../../../src/seo/head";
import { HERO_IMAGE, heroSrcSet } from "../../../src/pages/home/heroImage.js";
import { ALL_LIVE, matchRoute } from "../../../src/seo/routes.js";
import { EN_ONLY, getMeta, socialTags } from "../seo/loose";
import { count, EN_POST, makePost } from "./helpers";

const head = (
  path: string,
  locale = "en",
  data: object = {},
  live: object = EN_ONLY,
) => {
  const route = matchRoute(path, live as never);
  const meta = getMeta(route, locale, data, live);
  return renderHeadTags(meta, { preload: preloadFor(route, locale) });
};

describe("a static page (home)", () => {
  const html = head("/");

  test("one title, one description, one canonical, all marked data-seo", () => {
    expect(count(html, /<title\b/g)).toBe(1);
    expect(count(html, /name="description"/g)).toBe(1);
    expect(count(html, /rel="canonical"/g)).toBe(1);
    expect(html).toStartWith(
      "<title data-seo>Cengizhan Köse | Senior Fullstack Engineer</title>",
    );
    // Every tag carries data-seo (how usePageMeta finds and reuses it), the
    // preload hint excepted.
    const tags = html.match(/<(?:title|meta|link|script)\b[^>]*>/g) ?? [];
    const unmarked = tags.filter((tag) => !tag.includes("data-seo"));
    expect(unmarked).toHaveLength(1);
    expect(unmarked[0]).toContain('rel="preload"');
  });

  test("the canonical is the absolute www URL of the page", () => {
    expect(html).toContain(
      '<link rel="canonical" href="https://www.cengizhankose.com/" data-seo>',
    );
  });

  test("Open Graph and Twitter tags are socialTags() in that order", () => {
    const route = matchRoute("/", EN_ONLY as never);
    const tags = socialTags(getMeta(route, "en", {}, EN_ONLY)) as {
      attribute: string;
      key: string;
      content: string;
    }[];
    const printed = [
      ...html.matchAll(/<meta (property|name)="((?:og|twitter):[^"]+)"/g),
    ].map((m) => `${m[1]}:${m[2]}`);
    expect(printed).toEqual(tags.map((t) => `${t.attribute}:${t.key}`));
    expect(count(html, /property="og:url"/g)).toBe(1);
    expect(count(html, /name="twitter:card"/g)).toBe(1);
  });

  test("one JSON-LD block (Person + WebSite) that parses", () => {
    expect(count(html, /application\/ld\+json/g)).toBe(1);
    const json =
      /<script type="application\/ld\+json" id="ld-json" data-seo>([\s\S]*?)<\/script>/.exec(
        html,
      )![1];
    const graph = JSON.parse(json)["@graph"];
    expect(graph.map((node: { "@type": string }) => node["@type"])).toEqual([
      "Person",
      "WebSite",
    ]);
  });

  test("no hreflang while only the EN pages are open", () => {
    expect(html).not.toContain("hreflang");
  });
});

describe("hero preload (PERF-01)", () => {
  test("the home page prints the AVIF set with no href", () => {
    const html = head("/");
    expect(count(html, /rel="preload" as="image"/g)).toBe(1);
    const tag = /<link rel="preload"[^>]*>/.exec(html)![0];
    expect(tag).toBe(
      `<link rel="preload" as="image" type="image/avif" imagesrcset="${heroSrcSet("avif")}" imagesizes="${HERO_IMAGE.sizes}" fetchpriority="high">`,
    );
    expect(tag).not.toContain("href=");
  });

  test("once /tr is open its home page gets it too (same hint, both languages)", () => {
    const html = head("/tr", "tr", {}, ALL_LIVE);
    expect(count(html, /rel="preload" as="image"/g)).toBe(1);
    expect(preloadFor(matchRoute("/tr", ALL_LIVE as never), "tr")).toEqual(
      preloadFor(matchRoute("/", ALL_LIVE as never), "en"),
    );
  });

  test.each(["/blog", "/about", "/contact", "/portfolio"])(
    "%s prints no preload",
    (path) => {
      expect(count(head(path), /rel="preload"/g)).toBe(0);
    },
  );

  test("a post, a 404 and an unknown route have no hint", () => {
    const post = matchRoute("/blog/hello-world");
    expect(preloadFor(post, "en")).toBeNull();
    expect(preloadFor(matchRoute("/nope"), "en")).toBeNull();
    expect(preloadFor(null, "en")).toBeNull();
    expect(
      count(head("/blog/hello-world", "en", { post: EN_POST }), /preload/g),
    ).toBe(0);
  });

  test("the hint names exactly the files of the <picture> in the snapshot", () => {
    const hint = preloadFor(matchRoute("/"), "en")!;
    expect(hint.imagesrcset).toBe(heroSrcSet("avif"));
    expect(hint.imagesizes).toBe(HERO_IMAGE.sizes);
    expect(hint.type).toBe("image/avif");
  });
});

describe("a 404, a noindex page and a post that has no data", () => {
  test("a 404 prints title, description and robots, and no canonical, card or JSON-LD", () => {
    const html = head("/nope", "en", { notFound: true });
    expect(html).toContain(
      "<title data-seo>Page not found | Cengizhan Köse</title>",
    );
    expect(html).toContain('<meta name="robots" content="noindex" data-seo>');
    expect(count(html, /name="description"/g)).toBe(1);
    for (const absent of [
      "canonical",
      "og:",
      "twitter:",
      "ld+json",
      "hreflang",
    ]) {
      expect(html).not.toContain(absent);
    }
  });

  test("/portfolio is indexable since W8 (T-10 exit): canonical and card, no robots tag", () => {
    const html = head("/portfolio");
    expect(html).not.toContain('name="robots"');
    expect(html).toContain("https://www.cengizhankose.com/portfolio");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain("og:title");
    expect(html).not.toContain("ld+json");
  });

  test("a post route without the post falls back to the blog meta, without canonical", () => {
    const html = head("/blog/hello-world", "en", {});
    expect(html).toContain("<title data-seo>Blog | Cengizhan Köse</title>");
    expect(html).not.toContain("canonical");
  });
});

describe("a post", () => {
  const post = makePost({
    title: "Hello",
    lang: "tr",
    slug: "merhaba-dunya",
    translations: [{ lang: "en", slug: "hello-world" }],
  });
  const html = head("/tr/blog/merhaba-dunya", "tr", { post });

  test("canonical and og:url are the post's own URL", () => {
    expect(html).toContain(
      '<link rel="canonical" href="https://www.cengizhankose.com/tr/blog/merhaba-dunya" data-seo>',
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://www.cengizhankose.com/tr/blog/merhaba-dunya" data-seo>',
    );
    expect(html).toContain(
      '<meta property="og:type" content="article" data-seo>',
    );
    expect(html).toContain(
      '<meta property="og:locale" content="tr_TR" data-seo>',
    );
  });

  test("hreflang pairs: en, tr and x-default = the EN URL, in that order", () => {
    const alternates = [
      ...html.matchAll(
        /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g,
      ),
    ].map((m) => [m[1], m[2]]);
    expect(alternates).toEqual([
      ["en", "https://www.cengizhankose.com/blog/hello-world"],
      ["tr", "https://www.cengizhankose.com/tr/blog/merhaba-dunya"],
      ["x-default", "https://www.cengizhankose.com/blog/hello-world"],
    ]);
  });

  test("BlogPosting JSON-LD in the post's language", () => {
    const json = /id="ld-json" data-seo>([\s\S]*?)<\/script>/.exec(html)![1];
    const node = JSON.parse(json)["@graph"][0];
    expect(node["@type"]).toBe("BlogPosting");
    expect(node.inLanguage).toBe("tr");
    expect(node.mainEntityOfPage).toBe(
      "https://www.cengizhankose.com/tr/blog/merhaba-dunya",
    );
  });
});

describe("escaping", () => {
  const hostile = makePost({
    title: 'A "quoted" <b>title</b> & </script><script>alert(1)</script>',
    excerpt: 'Excerpt with "quotes" and <tags> & $& $1',
    coverImage: 'https://example.com/a.png?x="><script>alert(2)</script>',
  });
  const html = head("/blog/hello-world", "en", { post: hostile });

  test("title and description are HTML-escaped", () => {
    expect(html).toContain("&lt;/script&gt;&lt;script&gt;alert(1)");
    expect(html).toContain("&quot;quoted&quot;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("$&amp; $1");
  });

  test("the JSON-LD block cannot be closed from inside", () => {
    // Exactly one <script ...> and one </script> in the whole head string.
    expect(count(html, /<script\b/g)).toBe(1);
    expect(count(html, /<\/script>/g)).toBe(1);
    const json = /id="ld-json" data-seo>([\s\S]*?)<\/script>/.exec(html)![1];
    expect(JSON.parse(json)["@graph"][0].headline).toContain("</script>");
  });

  test("an attribute value cannot break out of its quotes", () => {
    expect(html).not.toMatch(/content="[^"]*"><script/);
    for (const tag of html.match(/<meta [^>]*>/g) ?? []) {
      // A well-formed meta tag: only the known attributes.
      expect(tag).toMatch(
        /^<meta (?:property|name)="[^"]*" content="[^"]*" data-seo>$/,
      );
    }
  });

  test("escapeHtml handles the four characters and non-strings", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;'");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });
});

describe("stylesheets of a lazily loaded page", () => {
  test("are linked after the other head tags, once each, with the href escaped", () => {
    const route = matchRoute("/blog");
    const meta = getMeta(route, "en", {}, EN_ONLY);
    const html = renderHeadTags(meta, {
      stylesheets: ["/assets/style-Cs9zuWa1.css", '/assets/x".css'],
    });
    expect(html).toEndWith(
      '<link rel="stylesheet" href="/assets/style-Cs9zuWa1.css"><link rel="stylesheet" href="/assets/x&quot;.css">',
    );
    expect(count(html, /rel="stylesheet"/g)).toBe(2);
  });

  test("none by default", () => {
    expect(head("/blog")).not.toContain("stylesheet");
  });
});

describe("robustness", () => {
  test("empty meta prints nothing", () => {
    expect(renderHeadTags({})).toBe("");
  });

  test("an alternate without an href or a hreflang is skipped", () => {
    const html = renderHeadTags({
      alternates: [
        { hreflang: "en", href: "" },
        { hreflang: "", href: "https://x" },
        { hreflang: "tr", href: "https://www.cengizhankose.com/tr" },
      ],
    });
    expect(count(html, /rel="alternate"/g)).toBe(1);
  });

  test("a preload without `as` prints nothing; unknown attributes are not printed", () => {
    expect(renderHeadTags({}, { preload: { type: "x" } })).toBe("");
    const tag = renderHeadTags(
      {},
      { preload: { as: "image", onload: "alert(1)", type: "image/avif" } },
    );
    expect(tag).toBe('<link rel="preload" as="image" type="image/avif">');
  });
});
