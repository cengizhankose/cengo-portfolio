// Meta for "/" (T-03 registry entry). Title: T-07 home pattern with the role
// from 00-icerik-girdileri.md §2.4, English on both locales (recommended
// default). Descriptions: MKT-21 step 3 (SEO-09 length 140-160).
// TR renders only after the W11 LIVE flip (SEO-11 Adım B).
//
// `preload` (PERF-01) is the resource hint the server writes into the <head>
// of this page only (src/seo/head.ts preloadFor(): "/" and, once it is live,
// "/tr"). It is the LCP photo: the AVIF set of the <picture> in
// src/pages/home/index.jsx, with no `href`, so the browser picks the same file
// for the preload and for the <source type="image/avif"> and downloads it
// once. Both values come from heroImage.js, the one place that names the
// files, so the hint and the markup cannot drift. The same in both languages.
import { HERO_IMAGE, heroSrcSet } from "../../pages/home/heroImage.js";
import { buildHomeTitle } from "../site.js";

const preload = Object.freeze({
  as: "image",
  type: "image/avif",
  imagesrcset: heroSrcSet("avif"),
  imagesizes: HERO_IMAGE.sizes,
  fetchpriority: "high",
});

export default {
  en: {
    title: buildHomeTitle(),
    description:
      "Cengizhan Köse is a Senior Fullstack Engineer with 6+ years of building web and mobile products in TypeScript, React, Node.js and React Native.",
    preload,
  },
  tr: {
    title: buildHomeTitle(),
    description:
      "Cengizhan Köse, TypeScript, React, Node.js ve React Native ile 6 yılı aşkın süredir web ve mobil ürünler geliştiren bir Senior Fullstack Engineer.",
    preload,
  },
};
