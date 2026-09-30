// Meta for "/privacy" (T-03 registry entry, SEC-25, ANL-04). Titles: T-07 /
// DSG-33 pattern "<Page> | Cengizhan Köse". Descriptions follow the SEO-09
// rule of the other pages: 140-160 characters, with the name in it.
// /tr/privacy opens with the other TR pages (W11).
import { buildTitle } from "../site.js";

export default {
  en: {
    title: buildTitle("Privacy"),
    description:
      "Privacy notice of Cengizhan Köse's site: what the contact form and cookie-free statistics collect, who receives the data, how long it is kept and your rights.",
  },
  tr: {
    title: buildTitle("Gizlilik"),
    description:
      "Cengizhan Köse'nin sitesinin gizlilik bildirimi: iletişim formu ve çerezsiz istatistiklerin topladığı veriler, alıcılar, saklama süreleri ve haklarınız.",
  },
};
