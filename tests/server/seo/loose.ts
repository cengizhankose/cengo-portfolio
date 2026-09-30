// Loosely typed handles on the plain-JS head modules for the SEO-04/06/07
// tests. TypeScript infers the types of src/seo/*.js from their default values
// and frozen literals (`data = {}`, `og: null`, `"Drivee Teknoloji"`), which is
// narrower than what these tests deliberately feed them (partial input, other
// locales, hostile strings, a changed author). The aliases keep the functions
// as they are and only loosen their signatures, so `bun run typecheck` (part
// of the image build gate) stays green without casts in every test.
import * as jsonld from "../../../src/seo/jsonld.js";
import * as pages from "../../../src/seo/pages.js";
import ogImageByLocale from "../../../src/seo/pages/ogImage.js";
import * as site from "../../../src/seo/site.js";

type Loose = (...args: any[]) => any;

export const getMeta = pages.getPageMeta as Loose;
export const canonicalUrl = pages.canonicalUrl as Loose;
export const alternatesFor = pages.alternatesFor as Loose;
export const socialTags = pages.socialTags as Loose;
export const routePathname = pages.routePathname as Loose;
export const localePath = pages.localePath as Loose;

export const personSchema = jsonld.personSchema as Loose;
export const websiteSchema = jsonld.websiteSchema as Loose;
export const blogPostingSchema = jsonld.blogPostingSchema as Loose;
export const homeJsonLd = jsonld.homeJsonLd as Loose;
export const jsonLdGraph = jsonld.jsonLdGraph as Loose;
export const isoDate = jsonld.isoDate as Loose;
export const serializeJsonLd = jsonld.serializeJsonLd as Loose;

export const ogImage = ogImageByLocale as Record<string, { alt: string }>;
export const OG_LOCALE = site.OG_LOCALE as Record<string, string>;
export const AUTHOR = site.AUTHOR as any;

// The route table as it is today (only EN static pages open, both post
// languages live). Tests whose expectation depends on that state pass it
// explicitly, so flipping LIVE.static for the TR launch (SEO-11 Adım B, W11)
// does not silently change what they check.
export const EN_ONLY = Object.freeze({
  static: ["en"],
  post: ["en", "tr"],
});
