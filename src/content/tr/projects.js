// TR page content, section "projects" (T-12, FE-14). Same ids, same order and
// same fields as src/content/en/projects.js; see that file for the field
// list. Facts from 00-icerik-girdileri.md §4.1, voice: "ben" (MKT-14).
export default [
  {
    id: "salesgym",
    title: "SalesGym — Canlı videoda yapay zekâ ile satış provası",
    awardLabel: "Birincilik · ConvoAI World Istanbul · 2026",
    problem:
      "Satış eğitimi pahalı ve tutarsız; iş arkadaşlarıyla yapılan rol çalışması gerçek bir alıcıya pek benzemiyor.",
    role: "Tek geliştirici: Next.js istemci, Python (Flask) backend, Agora ConvoAI ile gerçek zamanlı videoda yapay zekâ alıcı personaları, puanlama ve yönetici görünümü.",
    result:
      "ConvoAI World Istanbul’da (Agora Voice AI Hackathon) birincilik, Ocak 2026; sekiz saatte geliştirildi.",
    cta: { repo: "Kodu incele", demo: "Demoyu izle" },
  },
  {
    id: "farmin",
    title: "Farmin — Risk puanlı DeFi getiri toplayıcı",
    awardLabel: "Birincilik · AlgoHack Istanbul, Open Innovation · 2025",
    problem:
      "DeFi getiri fırsatları protokollere dağınık ve riskleri karşılaştırmak zor.",
    role: "Teknik lider ve backend geliştirici, Efe Akkurt ile birlikte: protokol adapter’ları, Algorand akıllı sözleşmeleri, risk puanlama ve sigorta akışı.",
    result:
      "AlgoHack Istanbul’da (Algorand Foundation × Rise In) Open Innovation Track birinciliği ve 2.500 $ ödül, 2025. Devam projesi reset, HackStellar Istanbul’da ikinci oldu.",
    cta: { repo: "GitHub’da incele", post: "Organizatörün yazısını oku" },
  },
  {
    id: "effort_lab",
    title: "Effort Karşılaştırması — Opus 5.5 ve Sonnet 5.5",
    problem:
      "Aynı prompt ve modelle, yalnız effort seviyesi değişince çıktı, süre ve dosya boyutu nasıl değişiyor?",
    role: "Tek yazar: deneyi tasarladım, 12 çıktının hepsini üretip ölçtüm ve karşılaştırma sitesini kurdum.",
    result:
      "12 landing page (iki model × altı effort seviyesi) yan yana; Opus 5.5’te low 2 dk 17 sn ve 33 KB, ultracode 2 sa 33 dk ve 140 KB.",
    cta: { demo: "Karşılaştırmayı aç" },
  },
];
