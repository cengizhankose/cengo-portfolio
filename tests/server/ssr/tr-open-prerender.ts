// Helper for tr-open.test.ts, run by Bun in its own process: the site with
// the TR static pages open (LIVE.static = ["en", "tr"] since W11, SEO-11 Adım
// B). Until W11 this helper applied that edit while src/seo/routes.js loaded;
// the real table now says it, so nothing is patched. Prerenders
// a copy of the fixture dist, serves it through the real site handler and
// prints, as JSON, what each page answered.
//
//   bun tests/server/ssr/tr-open-prerender.ts <tmp dist dir>
import "../../frontend/css-arch/bun-css-modules";
import { Hono } from "hono";

const dist = process.argv[2];
const { prerender } = await import("../../../scripts/prerender");
const { mountSite } = await import("../../../src/server/static");
const { render, fakeQueries } = await import("./helpers");

const written = await prerender(dist, render);
const app = new Hono();
mountSite(app, { distDir: dist, queries: fakeQueries(), render });

const urls = [
  "/",
  "/about",
  "/portfolio",
  "/contact",
  "/tr",
  "/tr/about",
  "/tr/portfolio",
  "/tr/contact",
  "/tr/",
  "/TR/about",
  "/tr/about/index.html",
  "/blog",
  "/tr/blog",
];
const pages: Record<string, unknown> = {};
for (const url of urls) {
  const res = await app.request(url);
  const html = await res.text();
  pages[url] = {
    status: res.status,
    location: res.headers.get("location"),
    html,
  };
}
const out = JSON.stringify({
  files: written.map(({ url, file }) => [url, file.slice(dist.length)]),
  pages,
});
await new Promise<void>((resolve, reject) =>
  process.stdout.write(out, (error) => (error ? reject(error) : resolve())),
);
