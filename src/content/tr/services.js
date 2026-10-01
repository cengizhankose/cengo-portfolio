// TR page content, section "services" (T-12, FE-14; MKT-13). Same shape,
// same ids in the same order and the same `to` values as
// src/content/en/services.js (see the field notes there). Sen form, short
// imperative; technology and product names stay as they are (MKT-14 step 2).
// Drafted from the brief and the CV, not owner-approved: the TR voice is
// reviewed with MKT-14 before the TR pages go live.
export default [
  {
    id: "mobile",
    title: "React Native ile mobil uygulama",
    outcome:
      "Ekibinin yayınlayıp sürdürebileceği bir React Native uygulaması: kimlik doğrulama, canlı veri, bildirimler ve otomatik test build’leri; ilk ekrandan mağaza yayınına.",
    proof: {
      label: "Tek geliştirici olarak yazdığım Drivee SafeCall",
      to: "https://apps.apple.com/tr/app/drivee-safecall/id6741858026",
    },
    cta: { label: "Bununla ilgili yaz", to: "/contact?type=mobile" },
  },
  {
    id: "web",
    title: "Fullstack web ürünleri",
    outcome:
      "Next.js arayüzleri ve Node.js API’leri tek sorumlu tarafından tasarlanır, geliştirilir ve canlıya alınır; kararlar katmanlar arasında kaybolmaz.",
    proof: {
      label: "Farmin: Open Innovation Track birinciliği",
      to: "/portfolio#project-farmin",
    },
    cta: { label: "Bununla ilgili yaz", to: "/contact?type=web" },
  },
  {
    id: "ai",
    title: "Ürününe yapay zekâ özellikleri",
    outcome:
      "Web ya da mobil uygulamana ses, sohbet ve agent özellikleri: LLM entegrasyonları, gerçek zamanlı ses ve görüntü, MCP tabanlı araçlar.",
    proof: {
      label: "SalesGym: sekiz saatte tek başıma, birincilik",
      to: "/portfolio#project-salesgym",
    },
    cta: { label: "Bununla ilgili yaz", to: "/contact?type=ai" },
  },
  {
    id: "lead",
    title: "Teknik liderlik",
    outcome:
      "Altı kişilik bir mobil yeniden yazımı ve beş kişilik bir ürün ekibini yönettim; ekibinde işi mimariden yayına kadar üstlenirim.",
    proof: {
      label: "Zaman çizelgesine bak",
      to: "/about#timeline",
    },
    cta: { label: "Bununla ilgili yaz", to: "/contact?type=lead" },
  },
];
