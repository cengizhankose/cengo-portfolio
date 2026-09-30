// EN page content, section "hero" (T-12, FE-14). Source: 00-icerik-girdileri
// §2.4 (K-06b: a static H1 with name and role, and one line under it that
// turns once and stops on its last phrase). src/content/tr/hero.js has the
// same shape. W7-MKT-hero-contact-conversion (MKT-02) extends this section
// with the value proposition; the H1 structure stays.
//
//   name, role  the H1 ("Cengizhan Köse" + role on its own line)
//   roleLang    language of `role`: it stays English on the TR pages too
//               (recommended default, §2.4/§10), so the page marks it up
//               with lang="en" there (WCAG 3.1.2)
//   phrases     the rotating line, shown in order; the last one stays. At
//               most 4 and the same count in both languages (DSG-07 timing)
//   lead        the sentence under the rotating line
export default {
  name: "Cengizhan Köse",
  role: "Senior Fullstack Engineer",
  roleLang: "en",
  phrases: [
    "Shipping for fleet technology",
    "Shipping for e-commerce",
    "Fleet tech, e-commerce and AI.",
  ],
  lead: "I build web and mobile products end to end with TypeScript, React, Node.js and React Native.",
};
