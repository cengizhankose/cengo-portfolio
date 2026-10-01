// TR interface text, namespace "contact" (T-12, FE-14). Same keys as
// src/i18n/en/contact.js. TR is live (W11, MKT-14): the parity test is strict, so every key
// exists in both languages with a non-empty value. Voice: .agents/product-marketing.md
// ("Dil ve hitap": sen; "Terim sözlüğü").
// Status messages: `{time}` is the reply promise (content contact.responseTime),
// `{emailMe}` is rendered as a mailto: link whose text is contact.emailMe and
// `{latestPost}` as a link to the blog whose text is contact.latestPost
// (src/pages/contact).
export default {
  title: "Birlikte çalışalım",
  reachMe: "Doğrudan ulaş",
  emailLabel: "E-posta:",
  bookCall: "20 dakikalık tanışma görüşmesi planla",
  linkedin: "LinkedIn’den yaz",
  newTab: "(yeni sekmede açılır)",
  form: {
    name: "Ad",
    email: "E-posta",
    projectType: "Proje tipi",
    projectTypeChoose: "Birini seç",
    message: "Mesaj",
  },
  placeholder: {
    name: "Ayşe Yılmaz…",
    email: "ornek@eposta.com…",
    message: "Projenden bahset…",
  },
  submit: "Detayları gönder",
  sending: "Gönderiliyor…",
  success:
    "Mesajın ulaştı. {time} içinde e-postana dönüyorum. Bu arada {latestPost} göz atabilirsin.",
  latestPost: "son yazıma",
  error: "Mesajın gönderilemedi. Tekrar dene ya da {emailMe}.",
  rateLimited:
    "30 saniyede bir mesaj gönderebilirsin. Biraz bekleyip tekrar dene ya da {emailMe}.",
  emailMe: "bana doğrudan e-posta gönder",
  honeypot: "Bu alanı boş bırak",
  closeAlert: "Uyarıyı kapat",
};
