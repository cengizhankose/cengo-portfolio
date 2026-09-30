// Meta for "/" (T-03 registry entry). Title: T-07 home pattern with the role
// from 00-icerik-girdileri.md §2.4, English on both locales (recommended
// default). Descriptions: MKT-21 step 3 (SEO-09 length 140-160).
// TR renders only after the W11 LIVE flip (SEO-11 Adım B).
import { buildHomeTitle } from "../site.js";

export default {
  en: {
    title: buildHomeTitle(),
    description:
      "Cengizhan Köse is a Senior Fullstack Engineer with 6+ years of building web and mobile products in TypeScript, React, Node.js and React Native.",
  },
  tr: {
    title: buildHomeTitle(),
    description:
      "Cengizhan Köse, TypeScript, React, Node.js ve React Native ile 6 yılı aşkın süredir web ve mobil ürünler geliştiren bir Senior Fullstack Engineer.",
  },
};
