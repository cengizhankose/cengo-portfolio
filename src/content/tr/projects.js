// TR page content, section "projects" (T-12, FE-14, W13). Same ids, same
// order and same fields as src/content/en/projects.js; see that file for the
// field list and the sources. Voice: "ben" (MKT-14).
export default [
  {
    id: "salesgym",
    title: "SalesGym — Canlı videoda yapay zekâ ile satış provası",
    awardLabel: "Birincilik · ConvoAI World Istanbul · 2026",
    summary:
      "Satış ekipleri için bir eğitim platformu: temsilciler canlı videoda yapay zekâ alıcı personalarıyla görüşme provası yapıyor, konuşurken puanlanıyor.",
    problem:
      "Satış eğitimi pahalı ve tutarsız; iş arkadaşlarıyla yapılan rol çalışması gerçek bir alıcıya pek benzemiyor.",
    built:
      "Hepsini tek geliştirici olarak yazdım: her oturum için bir Agora ConvoAI ajanı başlatan Next.js 16 istemci ve Python (Flask) backend (ARES konuşma tanıma, Groq LLM, MiniMax ses, Akool video avatar). Dört alıcı personası, soğuk aramadan kapanışa beş senaryo, canlı transkript, beceri başına puan, XP ve yönetici görünümü.",
    result:
      "ConvoAI World Istanbul’da (Agora Voice AI Hackathon) birincilik, Ocak 2026; sekiz saatte geliştirildi.",
    cta: { repo: "Kodu incele", demo: "Demoyu izle" },
    imageAlt:
      "SalesGym canlı oturumu: videoda yapay zekâ alıcı avatarı, köşede benim kameram ve keşif soruları, itiraz karşılama, ilişki kurma ve kapanış puanlarını gösteren panel.",
  },
  {
    id: "farmin",
    title: "Farmin — Risk puanlı DeFi getiri toplayıcı",
    awardLabel: "Birincilik · AlgoHack Istanbul, Open Innovation · 2025",
    summary:
      "Algorand üzerinde bir DeFi getiri toplayıcı: birden çok protokolün fırsatları tek ekranda, her biri risk puanıyla; yanında sigorta seçeneği ve tek tıkla yatırım.",
    problem:
      "DeFi getiri fırsatları protokollere dağınık ve riskleri karşılaştırmak zor.",
    built:
      "Teknik lider ve backend geliştirici olarak Efe Akkurt ile birlikte geliştirdim. pnpm monorepo: Next.js 15 uygulaması, protokol verisini normalize eden (önce DefiLlama), riski puanlayan ve SQLite’ta önbellekleyen adapter katmanı, yatırma ve çekme işlemleri için Algorand akıllı sözleşmeleri (ARC-4 ABI’li bir TEAL router).",
    result:
      "AlgoHack Istanbul’da (Algorand Foundation × Rise In) Open Innovation Track birinciliği ve 2.500 $ ödül, 2025. Devam projesi reset, HackStellar Istanbul’da ikinci oldu.",
    cta: { repo: "GitHub’da incele", post: "Organizatörün yazısını oku" },
    imageAlt:
      "Farmin havuz sayfası: APR, TVL ve 30 günlük performans grafiği, yatırım hesaplayıcı, 100 üzerinden 27 puanlı risk analizi ve getiri sigortası anahtarı.",
  },
  {
    id: "effort_lab",
    title: "Effort Karşılaştırması — Opus 5.5 ve Sonnet 5.5",
    summary:
      "Tek prompt (bir fitness uygulaması için tek dosyalık landing page), iki Claude modeli, altı effort seviyesi; 12 çıktının hepsi tek sitede.",
    problem:
      "Aynı prompt ve modelle, yalnız effort seviyesi değişince çıktı, süre ve dosya boyutu nasıl değişiyor?",
    built:
      "Tek yazar: prompt’u Claude Code’da Opus 5.5 ve Sonnet 5.5 ile low, medium, high, xhigh, max ve ultracode seviyelerinde çalıştırdım, her koşunun süresini ölçtüm ve karşılaştırma sitesini kurdum: ⌘K ile arama, istediğin iki çıktı sürüklenebilir bir ayraçla üst üste.",
    result:
      "12 landing page yan yana; Opus 5.5’te low 2 dk 17 sn ve 33 KB, ultracode 2 sa 33 dk ve 140 KB; Sonnet 5.5’te low 1 dk 52 sn ve 43 KB, ultracode 1 sa 22 dk ve 92 KB.",
    cta: { demo: "Karşılaştırmayı aç" },
    imageAlt:
      "Karşılaştırma sitesi: aynı fitness landing page’i, sürüklenebilir ayracın solunda Opus 5.5 low (2:17), sağında ultracode (2:33:47) çıktısıyla.",
  },
];
