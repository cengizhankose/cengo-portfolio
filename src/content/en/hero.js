// EN page content, section "hero" (T-12, FE-14). Source: 00-icerik-girdileri
// §2.4 and the brief in .agents/product-marketing.md (K-06b: a static H1 with
// name and role, and one line under it that turns once and stops on its last
// phrase). src/content/tr/hero.js has the same shape.
//
//   name, role  the H1 ("Cengizhan Köse" + role on its own line)
//   roleLang    language of `role`: it stays English on the TR pages too
//               (recommended default, §2.4/§10), so the page marks it up
//               with lang="en" there (WCAG 3.1.2)
//   headline    the H1 as one line of text, for the server snapshot and the
//               share texts (SEO-12); the page draws name and role itself
//   lead        what he builds, for whom: the static sentence under the H1
//   location    second sentence of the subheadline while availability is closed
//   availability
//               { status: "open" | "limited" | "closed", text }. `closed`
//               (the default: the sources say nothing about availability, so
//               none is invented) shows `location`. The owner fills the
//               brackets in `text` and sets the status; a text that still has
//               brackets is never shown (src/pages/home/heroStatus.js).
//   phrases     the rotating line, shown in order; the last one stays. At
//               most 4 and the same count in both languages (DSG-07 timing)
//   phrasesText the rotating line as one sentence, read once by screen readers
//   proofLine   one line of evidence under the rotating line (§2.3: only
//               numbers the sources carry)
// The hero buttons and the reply note are interface text: src/i18n/en/cta.js.
export default {
  name: "Cengizhan Köse",
  role: "Senior Fullstack Engineer",
  roleLang: "en",
  headline: "Cengizhan Köse — Senior Fullstack Engineer",
  lead: "I build web and mobile products end to end with TypeScript, React, Node.js and React Native.",
  location: "Based in Istanbul, Türkiye.",
  availability: {
    status: "closed",
    text: "Based in Istanbul, open to [freelance projects / full-time roles] from [month year].",
  },
  phrases: [
    "Shipping for fleet technology",
    "Shipping for e-commerce",
    "Fleet tech, e-commerce and AI.",
  ],
  phrasesText: "I build products for fleet technology, e-commerce and AI.",
  proofLine: "4× hackathon winner · 6+ years",
};
