// Meta for "/portfolio" (T-03 registry entry). Descriptions: MKT-21 step 3
// (the three featured projects from 00-icerik-girdileri.md §4.1).
//
// T-10 / SEO-14: until the case studies ship (MKT-01, W8-MKT-portfolio-cases)
// the page stays out of the index on both locales. Remove `robots` from both
// entries when the cases go live; the server's X-Robots-Tag hook (W3) and the
// sitemap (W9) derive their behaviour from this value.
import { buildTitle } from "../site.js";

const ROBOTS = "noindex, follow";

export default {
  en: {
    title: buildTitle("Portfolio"),
    description:
      "Selected work by Cengizhan Köse: SalesGym, AI sales practice on live video; Farmin, a DeFi yield aggregator; and a Claude effort-level comparison.",
    robots: ROBOTS,
  },
  tr: {
    title: buildTitle("Portfolyo"),
    description:
      "Cengizhan Köse'nin seçili işleri: canlı videoda yapay zekâ ile satış provası SalesGym, DeFi getiri toplayıcı Farmin ve Claude effort karşılaştırması.",
    robots: ROBOTS,
  },
};
