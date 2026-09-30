// Meta for "/blog" (T-03 registry entry). Same title on both locales; the two
// pages are linked with hreflang (SEO-11). Descriptions: MKT-20 step 1
// (the blog tagline, extended to 140-160 characters for SEO-09).
import { buildTitle } from "../site.js";

export default {
  en: {
    title: buildTitle("Blog"),
    description:
      "Notes from building web, mobile and AI products by Cengizhan Köse: the decisions, the numbers and what broke along the way. In English and Turkish.",
  },
  tr: {
    title: buildTitle("Blog"),
    description:
      "Cengizhan Köse'nin web, mobil ve yapay zekâ ürünleri geliştirirken aldığı kararlar, ölçtüğü sayılar ve yolda bozulanlar. Türkçe ve İngilizce yazılar.",
  },
};
