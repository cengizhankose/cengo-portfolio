// TR page content, section "contact" (T-12, FE-14; MKT-10, MKT-12). Same
// shape as src/content/en/contact.js; the ids of projectTypes are the same in
// both languages. Sen form, short imperative (brief); the TR voice is reviewed
// with MKT-14 (W11) before the TR pages go live.
export default {
  responseTime: "2 iş günü",
  description: "E-postana {time} içinde dönüyorum. Süreç:",
  steps: [
    "Mesajını okurum",
    "20 dakikalık tanışma görüşmesi",
    "Kapsam ve sonraki adımlar",
  ],
  projectTypes: [
    { id: "mobile", label: "Mobil uygulama" },
    { id: "web", label: "Web uygulaması" },
    { id: "ai", label: "AI / LLM entegrasyonu" },
    { id: "lead", label: "Teknik liderlik" },
    { id: "job", label: "Tam zamanlı pozisyon" },
    { id: "other", label: "Diğer" },
  ],
};
