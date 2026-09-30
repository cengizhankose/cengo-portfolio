// TR interface text, namespace "notFound" (T-12, FE-14). Same keys as
// src/i18n/en/notFound.js; a missing or empty value falls back to EN until the
// strict parity test is switched on (W11, MKT-14 approves the TR voice).
// Moved from src/pages/notfound/copy.js with the same keys (FE-16).
export default {
  page: {
    title: "Sayfa bulunamadı",
    text: "Adres yanlış yazılmış ya da sayfa taşınmış olabilir.",
  },
  post: {
    title: "Yazı bulunamadı",
    text: "Bu yazı yok ya da artık yayında değil.",
  },
  home: "Ana sayfa",
  blog: "Blog",
  backToBlog: "Bloga dön",
};
