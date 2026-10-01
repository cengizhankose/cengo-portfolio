// TR interface text, namespace "privacy" (T-12, FE-14). Same keys as
// src/i18n/en/privacy.js. TR is live (W11, MKT-14): the parity test is strict, so every key
// exists in both languages with a non-empty value. Voice: .agents/product-marketing.md
// ("Dil ve hitap": sen; "Terim sözlüğü").
// Written for the privacy notice (W9, SEC-25/ANL-04); the long text is in
// src/content/tr/privacy.js. The owner approves both languages before the
// page goes live.
export default {
  title: "Gizlilik",
  updated: "Son güncelleme: {date}",
  disclaimer:
    "Bu sayfa sitenin nasıl çalıştığını anlatır. Hukuki görüş değildir.",
  formNote:
    "Bu formla gönderdiğin ad, e-posta, proje tipi ve mesaj yalnızca sana yanıt vermek için EmailJS (ABD) üzerinden bana iletilir ve en fazla 12 ay saklanır. Ayrıntılar:",
  formLink: "Gizlilik",
  section: {
    controller: "Veri sorumlusu kim",
    data: "Hangi veriler işleniyor",
    purposes: "Amaç ve hukuki sebep",
    recipients: "Verileri başka kim alıyor",
    analytics: "Ziyaret istatistikleri",
    retention: "Ne kadar saklanıyor",
    rights: "Haklarların",
    changes: "Bu sayfadaki değişiklikler",
  },
  processor: {
    purpose: "Ne için",
    data: "Veri",
    location: "Nerede",
  },
  umami: {
    noCookies: "Umami çerez kullanmaz.",
    noIpStorage: "IP adresin saklanmaz.",
    salt: "Ziyaretçi kimliği, her ay değişen bir tuzla üretilen bir özettir; bu yüzden bir aydan diğerine izlenemez ve sana kadar geri götürülemez.",
    noThirdParty:
      "İstatistikler kendi veritabanımda kalır, kimseyle paylaşılmaz.",
    dnt: "Do Not Track (İzleme) tercihine uyulur: tarayıcın bunu gönderiyorsa hiçbir şey kaydedilmez.",
    optOutLead: "İstatistikleri bu tarayıcı için kendin de kapatabilirsin:",
    optOut: "istatistikleri kapat",
    optIn: "yeniden aç",
  },
};
