// Meta for "/portfolio" (T-03 registry entry). Descriptions: MKT-21 step 3
// (the three featured projects from 00-icerik-girdileri.md §4.1).
//
// T-10 / SEO-14: the page stays out of the index on both locales while it has
// no case to show. The cases are published (W8-MKT-portfolio-cases), so the
// page is indexable; the rule is tied to the same registry that feeds the
// page and the menu (src/content/projects.js hasPublishedCases), so the page,
// the menu link and this entry cannot disagree. The server's X-Robots-Tag
// hook (W3) and the sitemap (W9) derive their behaviour from `robots`.
// The description names the featured set; update it if that set changes.
import { hasPublishedCases } from "../../content/projects.js";
import { buildTitle } from "../site.js";

// Spread into each entry: no `robots` key at all while the page is indexable.
const interim = () =>
  hasPublishedCases() ? {} : { robots: "noindex, follow" };

export default {
  en: {
    title: buildTitle("Portfolio"),
    description:
      "Selected work by Cengizhan Köse: SalesGym, AI sales practice on live video; Farmin, a DeFi yield aggregator; and a Claude effort-level comparison.",
    ...interim(),
  },
  tr: {
    title: buildTitle("Portfolyo"),
    description:
      "Cengizhan Köse'nin seçili işleri: canlı videoda yapay zekâ ile satış provası SalesGym, DeFi getiri toplayıcı Farmin ve Claude effort karşılaştırması.",
    ...interim(),
  },
};
