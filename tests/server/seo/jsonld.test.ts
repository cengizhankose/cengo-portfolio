/**
 * SEO-07: Person, WebSite and BlogPosting JSON-LD from src/seo/jsonld.js,
 * as getPageMeta(...).jsonLd hands them to the server and to usePageMeta.
 * The Rich Results Test, validator.schema.org and the RAW/RENDER
 * `application/ld+json` counts are checked after W7 and the deploy.
 *
 * The expected facts are copied from 00-icerik-girdileri.md (§3.1 current
 * roles, §5 the four first places, §8 the channels); the audit docs are not
 * part of the repository, so the test holds them as literals.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  HEADLINE_MAX_LENGTH,
  PERSON_ID,
  WEBSITE_ID,
} from "../../../src/seo/jsonld.js";
import { ALL_LIVE, matchRoute, STATIC_PATHS } from "../../../src/seo/routes.js";
import { HERO_IMAGE, LOCALES, SOCIAL_PROFILES } from "../../../src/seo/site.js";
import {
  AUTHOR,
  blogPostingSchema,
  getMeta as getPageMeta,
  homeJsonLd,
  isoDate,
  jsonLdGraph,
  personSchema,
  serializeJsonLd,
  websiteSchema,
} from "./loose";

const ROOT = join(import.meta.dir, "..", "..", "..");
const HOST = "https://www.cengizhankose.com";

// 00-icerik-girdileri.md
const CONTENT_INPUTS = {
  jobTitle: "Senior Fullstack Engineer", // §2.1 / §2.4
  worksFor: ["Drivee Teknoloji"], // §3.1: the only role without an end date
  awards: [
    "ConvoAI World Istanbul (2026)", // §5 #1
    "AlgoHack Istanbul (2025)", // §5 #3
    "Teknasyon Yüzük Kardeşliği Hackathon (2022)", // §5 #9
    "Sosyal Uyum için İnovatif Çözümler Hackathonu (2021)", // §5 #10
  ],
  sameAs: [
    "https://www.linkedin.com/in/cengizhankose",
    "https://github.com/cengizhankose",
    "https://x.com/cengzhnkse",
    "https://www.youtube.com/@cengizhankse",
    "https://www.twitch.tv/cengizhankose",
    "https://www.instagram.com/cengizhankse/",
  ], // §8 / K-11
};

type Node = Record<string, any>;
const graphOf = (meta: { jsonLd: unknown }) =>
  (meta.jsonLd as { "@graph": Node[] })["@graph"];
const findType = (nodes: Node[], type: string) =>
  nodes.find((node) => node["@type"] === type) as Node;
// What the page really carries: the serialised block, parsed again.
const reparse = (data: unknown) => JSON.parse(serializeJsonLd(data));

const post = (over: Record<string, unknown> = {}) => ({
  slug: "atlas-steward",
  lang: "tr",
  title: "Atlas Steward",
  seoTitle: "Atlas Steward: Yarım İşi Yakalayan Sistem",
  excerpt: "Sohbetlerde yarım kalan işleri yakalayan yerel sistem.",
  createdAt: "2026-07-01T08:00:00.000Z",
  publishedAt: "2026-07-02T09:30:00.000Z",
  updatedAt: "2026-07-05T12:00:00.000Z",
  ...over,
});

describe("Person (SEO-07 step 1)", () => {
  const person = personSchema("en") as Node;

  test("one identity: @id, name and url", () => {
    expect(person["@type"]).toBe("Person");
    expect(person["@id"]).toBe(`${HOST}/#person`);
    expect(person["@id"]).toBe(PERSON_ID);
    expect(person.name).toBe("Cengizhan Köse");
    expect(person.url).toBe(`${HOST}/`);
  });

  test("the @id is the same in both languages", () => {
    for (const locale of LOCALES) {
      expect((personSchema(locale) as Node)["@id"]).toBe(PERSON_ID);
      expect((personSchema(locale) as Node).url).toBe(`${HOST}/`);
    }
  });

  test("sameAs is exactly the six K-11 profiles of SOCIAL_PROFILES, in order, no Facebook", () => {
    expect(person.sameAs).toHaveLength(6);
    expect(person.sameAs).toEqual(
      SOCIAL_PROFILES.map((profile) => profile.url),
    );
    expect(person.sameAs).toEqual(CONTENT_INPUTS.sameAs);
    expect(JSON.stringify(person.sameAs)).not.toMatch(/facebook\.com/);
  });

  test("jobTitle, worksFor and award equal the content inputs", () => {
    expect(person.jobTitle).toBe(CONTENT_INPUTS.jobTitle);
    expect(person.worksFor).toEqual({
      "@type": "Organization",
      name: "Drivee Teknoloji",
    });
    expect(person.award).toEqual(CONTENT_INPUTS.awards);
    expect(AUTHOR.awards).toEqual(CONTENT_INPUTS.awards);
    expect(
      AUTHOR.worksFor.map((employer: { name: string }) => employer.name),
    ).toEqual(CONTENT_INPUTS.worksFor);
  });

  test("the role is the same English text on both pages (recommended default)", () => {
    expect((personSchema("tr") as Node).jobTitle).toBe(CONTENT_INPUTS.jobTitle);
    expect((personSchema("de") as Node).jobTitle).toBe(CONTENT_INPUTS.jobTitle);
  });

  test("a different TR role would print per language", () => {
    const author = {
      ...AUTHOR,
      jobTitles: { en: "Senior Fullstack Engineer", tr: "Kıdemli Mühendis" },
    };
    expect((personSchema("tr", author) as Node).jobTitle).toBe(
      "Kıdemli Mühendis",
    );
    expect((personSchema("en", author) as Node).jobTitle).toBe(
      "Senior Fullstack Engineer",
    );
  });

  test("the image is the absolute hero URL", () => {
    expect(HERO_IMAGE).toBe("/img/hero/cengizhan-kose-v1-1284.jpg");
    expect(person.image).toBe(`${HOST}/img/hero/cengizhan-kose-v1-1284.jpg`);
  });

  test.skipIf(!existsSync(join(ROOT, "public", HERO_IMAGE)))(
    "the hero file exists (arrives with W6-DSG-hero-image-lcp)",
    () => {
      expect(existsSync(join(ROOT, "public", HERO_IMAGE))).toBe(true);
    },
  );

  test("a fact the source does not have is not printed (no guessing)", () => {
    const bare = personSchema("en", {
      name: "Cengizhan Köse",
      jobTitle: undefined,
      jobTitles: undefined,
      worksFor: [],
      awards: [],
    } as never) as Node;
    expect(bare).not.toHaveProperty("jobTitle");
    expect(bare).not.toHaveProperty("worksFor");
    expect(bare).not.toHaveProperty("award");
    expect(bare.sameAs).toHaveLength(6);
    expect(bare["@id"]).toBe(PERSON_ID);
  });

  test("several employers become an array; a url is printed only when known", () => {
    const multi = personSchema("en", {
      ...AUTHOR,
      worksFor: [
        { name: "Drivee Teknoloji" },
        { name: "Example Co", url: "https://example.com/" },
      ],
    } as never) as Node;
    expect(multi.worksFor).toEqual([
      { "@type": "Organization", name: "Drivee Teknoloji" },
      {
        "@type": "Organization",
        name: "Example Co",
        url: "https://example.com/",
      },
    ]);
  });

  test("no empty values anywhere", () => {
    const walk = (value: unknown) => {
      expect(value).not.toBeUndefined();
      expect(value).not.toBeNull();
      expect(value).not.toBe("");
      if (Array.isArray(value)) {
        expect(value.length).toBeGreaterThan(0);
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(person);
  });
});

describe("WebSite (SEO-07 step 2)", () => {
  const website = websiteSchema() as Node;

  test("id, url, name, both languages and the publisher", () => {
    expect(website).toEqual({
      "@type": "WebSite",
      "@id": `${HOST}/#website`,
      url: `${HOST}/`,
      name: "Cengizhan Köse",
      inLanguage: ["en", "tr"],
      publisher: { "@id": `${HOST}/#person` },
    });
    expect(website["@id"]).toBe(WEBSITE_ID);
  });

  test("the publisher points at the Person node", () => {
    expect(website.publisher["@id"]).toBe(PERSON_ID);
  });
});

describe("the home graph (SEO-07 hedef durum)", () => {
  test("/ has one @graph block with Person and WebSite, and parses", () => {
    const meta = getPageMeta(matchRoute("/"), "en");
    const data = reparse(meta.jsonLd);
    expect(data["@context"]).toBe("https://schema.org");
    const types = data["@graph"].map((node: Node) => node["@type"]);
    expect(types).toEqual(["Person", "WebSite"]);
  });

  test("/tr carries the same two nodes with the same ids", () => {
    const en = graphOf(getPageMeta("/", "en", {}, ALL_LIVE));
    const tr = graphOf(getPageMeta("/tr", "tr", {}, ALL_LIVE));
    expect(tr.map((node) => node["@id"])).toEqual(
      en.map((node) => node["@id"]),
    );
    expect(tr).toEqual(en);
  });

  test("the home graph is homeJsonLd()", () => {
    expect(getPageMeta(matchRoute("/"), "en").jsonLd).toEqual(homeJsonLd("en"));
    expect(homeJsonLd("en")).toEqual(
      jsonLdGraph([personSchema("en"), websiteSchema()]),
    );
  });

  test("Person.sameAs of the printed block is the six URLs of SOCIAL_PROFILES (acceptance criterion 1)", () => {
    const data = reparse(getPageMeta(matchRoute("/"), "en").jsonLd);
    const person = findType(data["@graph"], "Person");
    expect(new Set(person.sameAs)).toEqual(
      new Set(SOCIAL_PROFILES.map((profile) => profile.url)),
    );
    expect(person.sameAs).toHaveLength(6);
    const site = findType(data["@graph"], "WebSite");
    expect(site.inLanguage).toEqual(["en", "tr"]);
  });

  test("no other page has a JSON-LD graph (404, noindex, other statics, loading post)", () => {
    for (const path of STATIC_PATHS.filter((path) => path !== "/")) {
      for (const locale of LOCALES) {
        expect(
          getPageMeta(matchRoute(path), locale).jsonLd,
          `${locale} ${path}`,
        ).toBeNull();
      }
    }
    expect(getPageMeta(matchRoute("/nope"), "en").jsonLd).toBeNull();
    expect(
      getPageMeta(matchRoute("/blog/a-post"), "en", { post: null }).jsonLd,
    ).toBeNull();
    expect(
      getPageMeta(matchRoute("/blog/a-post"), "en", { notFound: true }).jsonLd,
    ).toBeNull();
  });
});

describe("BlogPosting (SEO-07 step 3)", () => {
  const route = matchRoute("/tr/blog/atlas-steward");
  const node = (over: Record<string, unknown> = {}, locale = "tr") =>
    graphOf(getPageMeta(route, locale, { post: post(over) }))[0];

  test("a post page has a single-node graph: a BlogPosting", () => {
    const meta = getPageMeta(route, "tr", { post: post() });
    const data = reparse(meta.jsonLd);
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@graph"]).toHaveLength(1);
    expect(data["@graph"][0]["@type"]).toBe("BlogPosting");
  });

  test("headline, description, dates, author, publisher, page, language", () => {
    expect(reparse({ "@graph": [node()] })["@graph"][0]).toEqual({
      "@type": "BlogPosting",
      headline: "Atlas Steward: Yarım İşi Yakalayan Sistem",
      description: "Sohbetlerde yarım kalan işleri yakalayan yerel sistem.",
      datePublished: "2026-07-02T09:30:00.000Z",
      dateModified: "2026-07-05T12:00:00.000Z",
      author: {
        "@type": "Person",
        "@id": `${HOST}/#person`,
        name: "Cengizhan Köse",
        url: `${HOST}/about`,
      },
      publisher: { "@id": `${HOST}/#person` },
      mainEntityOfPage: `${HOST}/tr/blog/atlas-steward`,
      inLanguage: "tr",
      image: `${HOST}/og/default.jpg`,
    });
  });

  test("headline is seoTitle, else title, at most 110 characters", () => {
    expect(node({ seoTitle: "Short one" }).headline).toBe("Short one");
    expect(node({ seoTitle: null, title: "Plain title" }).headline).toBe(
      "Plain title",
    );
    const long = node({ seoTitle: null, title: "word ".repeat(40) });
    expect(long.headline.length).toBeLessThanOrEqual(HEADLINE_MAX_LENGTH);
    expect(long.headline.endsWith("…")).toBe(true);
    // The live post's title is 98 characters: it fits untouched.
    const live = "t".repeat(98);
    expect(node({ seoTitle: null, title: live }).headline).toBe(live);
    // One long unbroken word is cut at the limit.
    const solid = node({ seoTitle: null, title: "x".repeat(300) });
    expect(solid.headline.length).toBe(HEADLINE_MAX_LENGTH);
  });

  test("the headline has no brand suffix (it is the article's own title)", () => {
    expect(node().headline).not.toContain("| Cengizhan Köse");
  });

  test("dates are ISO ^YYYY-MM-DDT; published falls back to createdAt, modified to published", () => {
    const full = node();
    expect(full.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(full.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const older = node({ publishedAt: null, updatedAt: null });
    expect(older.datePublished).toBe("2026-07-01T08:00:00.000Z");
    expect(older.dateModified).toBe("2026-07-01T08:00:00.000Z");

    const undated = node({
      createdAt: undefined,
      publishedAt: null,
      updatedAt: null,
    });
    expect(undated).not.toHaveProperty("datePublished");
    expect(undated).not.toHaveProperty("dateModified");
  });

  test("Date objects and epoch milliseconds are accepted; garbage is not a date", () => {
    expect(isoDate(new Date("2026-01-02T03:04:05Z"))).toBe(
      "2026-01-02T03:04:05.000Z",
    );
    expect(isoDate(Date.UTC(2026, 0, 2))).toBe("2026-01-02T00:00:00.000Z");
    expect(isoDate("not a date")).toBeUndefined();
    expect(isoDate("")).toBeUndefined();
    expect(isoDate(null)).toBeUndefined();
    expect(isoDate(undefined)).toBeUndefined();
  });

  test("mainEntityOfPage is the canonical URL in the post's own language path", () => {
    const meta = getPageMeta(route, "tr", { post: post() });
    expect(graphOf(meta)[0].mainEntityOfPage).toBe(meta.canonical);
    const en = getPageMeta(matchRoute("/blog/a-post"), "en", {
      post: post({ slug: "a-post", lang: "en" }),
    });
    expect(graphOf(en)[0].mainEntityOfPage).toBe(`${HOST}/blog/a-post`);
    expect(graphOf(en)[0].inLanguage).toBe("en");
  });

  test("the author's url is the About page of the post's language", () => {
    expect(node().author.url).toBe(`${HOST}/about`);
    const afterFlip = graphOf(
      getPageMeta(route, "tr", { post: post() }, ALL_LIVE),
    )[0];
    expect(afterFlip.author.url).toBe(`${HOST}/tr/about`);
    expect(afterFlip.author["@id"]).toBe(PERSON_ID);
    expect(afterFlip.publisher).toEqual({ "@id": PERSON_ID });
  });

  test("the image is the cover (absolute) or the default share image", () => {
    expect(node({ coverImage: "/img/posts/atlas.png" }).image).toBe(
      `${HOST}/img/posts/atlas.png`,
    );
    expect(node({ coverImage: "https://cdn.example.com/a.webp" }).image).toBe(
      "https://cdn.example.com/a.webp",
    );
    expect(node({ coverImage: null }).image).toBe(`${HOST}/og/default.jpg`);
  });

  test("no translation links: hreflang carries that relationship", () => {
    const withTranslation = node({
      translations: [{ lang: "en", slug: "atlas-steward-en" }],
    });
    expect(withTranslation).not.toHaveProperty("translationOfWork");
    expect(withTranslation).not.toHaveProperty("workTranslation");
  });

  test("the description is the excerpt, else the title", () => {
    expect(node({ excerpt: null }).description).toBe("Atlas Steward");
    expect(node({ excerpt: " a\n  b " }).description).toBe("a b");
  });

  test("blogPostingSchema works on its own with the route-derived URLs", () => {
    const schema = blogPostingSchema(post(), {
      url: `${HOST}/tr/blog/atlas-steward`,
      authorUrl: `${HOST}/about`,
      description: "d",
    }) as Node;
    expect(schema.mainEntityOfPage).toBe(`${HOST}/tr/blog/atlas-steward`);
    expect(schema.author.url).toBe(`${HOST}/about`);
    expect(schema.description).toBe("d");
    // Missing options leave the properties out rather than print "undefined".
    const bare = blogPostingSchema(post()) as Node;
    expect(bare).not.toHaveProperty("mainEntityOfPage");
    expect(bare.author).not.toHaveProperty("url");
  });
});

describe("serializeJsonLd (SEO-07 step 4)", () => {
  test("the block round-trips to the same data", () => {
    const meta = getPageMeta(matchRoute("/"), "en");
    expect(JSON.parse(serializeJsonLd(meta.jsonLd))).toEqual(meta.jsonLd);
  });

  test("< > & and the line separators are escaped, so a value cannot end the script element", () => {
    const hostile = {
      "@context": "https://schema.org",
      headline: "</script><script>alert(1)</script> & <!-- \u2028 \u2029",
    };
    const text = serializeJsonLd(hostile);
    expect(text).not.toContain("<");
    expect(text).not.toContain(">");
    expect(text).not.toContain("&");
    expect(text).not.toContain("\u2028");
    expect(text).not.toContain("\u2029");
    expect(text.toLowerCase()).not.toContain("</script");
    expect(text).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(text)).toEqual(hostile);
  });

  test("a hostile post title is escaped in the printed block and intact once parsed", () => {
    const title = '</script><img src=x onerror=alert(1)> "q"';
    const meta = getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", {
      post: post({ title, seoTitle: null }),
    });
    const text = serializeJsonLd(meta.jsonLd);
    expect(text).not.toMatch(/<\/script/i);
    expect(JSON.parse(text)["@graph"][0].headline).toBe(title);
  });

  test("plain text stays readable (no needless escaping of quotes or accents)", () => {
    const text = serializeJsonLd({ name: "Cengizhan Köse" });
    expect(text).toBe('{"name":"Cengizhan Köse"}');
  });
});
