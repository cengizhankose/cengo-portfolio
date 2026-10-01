// Helper for tr-open.test.ts, run by Bun in its own process: the site as it
// will be once the TR static pages are opened (SEO-11 Adım B, W11), which is
// the single edit `static: ["en"]` -> `["en", "tr"]` in src/seo/routes.js. The
// edit is applied while the module loads, so nothing on disk changes. Prerenders
// a copy of the fixture dist, serves it through the real site handler and
// prints, as JSON, what each page answered.
//
//   bun tests/server/ssr/tr-open-prerender.ts <tmp dist dir>
import { plugin } from "bun";
import "../../frontend/css-arch/bun-css-modules";
import { Hono } from "hono";

plugin({
  name: "open-tr-static-pages",
  setup(build) {
    build.onLoad(
      { filter: /src[\\/]seo[\\/]routes\.js$/ },
      async ({ path }) => {
        const source = await Bun.file(path).text();
        const opened = source.replace(
          'static: Object.freeze(["en"])',
          'static: Object.freeze(["en", "tr"])',
        );
        if (opened === source) throw new Error("LIVE.static changed shape");
        return { contents: opened, loader: "js" };
      },
    );
  },
});

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
