// Meta for "/about" (T-03 registry entry). Titles: T-07 / DSG-33 table.
// Descriptions: SEO-09 draft aligned with the roles in 00-icerik-girdileri.md
// §3.1 (Fullstack Engineer, Mobile Team Lead at MakasApp, Co-Founder at Profo
// and aiavatarim). Update together with the About copy (SEO-18).
import { buildTitle } from "../site.js";

export default {
  en: {
    title: buildTitle("About"),
    description:
      "Cengizhan Köse's background and skills: Senior Fullstack Engineer, former mobile team lead and startup co-founder, working with TypeScript, React and Node.js.",
  },
  tr: {
    title: buildTitle("Hakkımda"),
    description:
      "Cengizhan Köse'nin geçmişi ve becerileri: Senior Fullstack Engineer, eski mobil ekip lideri ve girişim kurucu ortağı; TypeScript, React, Node.js ile çalışıyor.",
  },
};
