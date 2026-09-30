// TR interface text, namespace "status" (T-12, FE-14). Same keys as
// src/i18n/en/status.js; a missing or empty value falls back to EN until the
// strict parity test is switched on (W11, MKT-14 approves the TR voice).
export default {
  loading: "Yükleniyor…",
  retry: "Tekrar dene",
  reload: "Sayfayı yenile",
  home: "Ana sayfa",
  network: "Tarayıcın sunucuya ulaşamadı. Bağlantını kontrol edip tekrar dene.",
  server: "Sunucu şu anda yanıt veremedi. Biraz sonra tekrar dene.",
  postError: "Bu yazı yüklenemedi",
  crash: {
    title: "Bu sayfada bir sorun çıktı",
    text: "Sitenin geri kalanı çalışıyor. Sayfayı yenile ya da ana sayfaya dön.",
  },
};
