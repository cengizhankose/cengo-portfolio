// TR page content, section "privacy" (T-12, FE-14). Same shape as
// src/content/en/privacy.js: same ids, same order, same list lengths. The
// owner approves the Turkish text before the page goes live (the page opens
// with the TR pages in W11). When the Cloudflare beacon is switched off
// (T-09), delete the `cloudflare_web_analytics` entry here and in EN.
export const privacyProcessors = [
  {
    id: "emailjs",
    name: "EmailJS",
    purpose: "İletişim formunu gelen kutuma iletir.",
    data: "Ad, e-posta adresi, proje tipi, mesaj ve sayfanın dili.",
    location: "Amerika Birleşik Devletleri.",
  },
  {
    id: "umami",
    name: "Umami (kendi sunucumda)",
    purpose: "Gizliliğe saygılı ziyaret istatistikleri.",
    data: "“Ziyaret istatistikleri” bölümünde anlatılan sayfa görüntülemeleri ve olaylar. Çerez yok, IP adresi saklanmaz.",
    location:
      "Out Plane üzerinde kendi uygulamam olarak çalışır. Veri orada kendi veritabanımdadır ve kimseyle paylaşılmaz.",
  },
  {
    id: "cloudflare_web_analytics",
    name: "Cloudflare Web Analytics",
    purpose:
      "Kısa bir karşılaştırma dönemi boyunca Umami’nin yanında ziyaretleri sayar, sonra kapatılır.",
    data: "Sayfa görüntülemeleri, yönlendiren site, tarayıcı, cihaz ve ülke.",
    location: "Cloudflare’in küresel ağı.",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    purpose:
      "Sitenin önünde içerik dağıtım ağı ve güvenlik katmanı olarak çalışır. İstek kayıtları tutar.",
    data: "IP adresi, tarayıcı bilgileri ve istenen adresler.",
    location:
      "Cloudflare’in küresel ağı. Cloudflare, Inc. Amerika Birleşik Devletleri merkezlidir.",
  },
  {
    id: "out_plane",
    name: "Out Plane",
    purpose:
      "Bu siteyi ve Umami veritabanını barındırır. Yaklaşık bir gün boyunca istek kaydı tutar.",
    data: "IP adresi ve istenen adresler (istek kaydı); Umami’nin sakladığı istatistikler.",
    location: "Barındırma sağlayıcısının veri merkezi.",
  },
];

export default {
  intro:
    "Bu sayfa, cengizhankose.com’un hangi kişisel verileri neden işlediğini, verileri başka kimin aldığını ve bu konuda bana nasıl ulaşabileceğini anlatır. İngilizce ve Türkçe sayfaların ikisi için de geçerlidir.",
  controller:
    "Burada anlatılan kişisel verilerin veri sorumlusu Cengizhan Köse’dir (KVKK’daki veri sorumlusu, GDPR’daki controller). Her soru ve talep için {email} adresine yaz.",
  data: [
    {
      id: "form",
      label: "İletişim formu",
      text: "Ad, e-posta adresi, proje tipi ve yazdığın mesaj; bir de kullandığın sayfanın dili. Form bunları EmailJS üzerinden gelen kutuma gönderir. Başka bir şey sorulmaz ve bu sitenin kendi sunucularında hiçbir şey saklanmaz.",
    },
    {
      id: "logs",
      label: "İstek kayıtları",
      text: "Her web sitesinde olduğu gibi, sitenin önündeki ağ (Cloudflare) ve barındırıcı (Out Plane) IP adresini, tarayıcı bilgilerini ve istediğin adresleri görür. Bunları güvenlik ve işletim için istek kayıtlarında tutarlar. Ziyaretçileri tanımak için kullanmıyorum.",
    },
    {
      id: "statistics",
      label: "Ziyaret istatistikleri",
      text: "Sayfa görüntülemeleri ve bir bağlantıyı açmak ya da formu göndermek gibi birkaç olay. Aşağıdaki “Ziyaret istatistikleri” bölümüne bak. Olaylar yazdığın hiçbir şeyi taşımaz.",
    },
    {
      id: "storage",
      label: "Cihazında",
      text: "Çerez yok. Site, tarayıcının yerel depolamasında en fazla üç küçük kayıt tutar: açık ya da koyu tema tercihin, formu en son gönderdiğin an (form 30 saniyede bir mesaj kabul etsin diye) ve yalnızca istatistiklerden çıkarsan bu tercihin. Bunlar cihazında kalır.",
    },
  ],
  purposes: [
    {
      id: "reply",
      label: "Mesajına yanıt vermek",
      text: "Olası bir iş birliği öncesinde senin talebin üzerine adım atmak (GDPR md. 6/1-b; KVKK md. 5/2-c) ve soruları yanıtlamaktaki meşru menfaatim.",
    },
    {
      id: "statistics",
      label: "Sitenin nasıl kullanıldığını anlamak ve güvenli tutmak",
      text: "Meşru menfaat (GDPR md. 6/1-f; KVKK md. 5/2-f): kimseyi profillemeden ziyaretleri saymak, yavaş sayfaları düzeltmek ve kötüye kullanımı engellemek.",
    },
  ],
  analytics: {
    text: "Umami sayfa görüntülemelerini ve birkaç olayı kaydeder: sayfa adresi, geldiğin site, adresteki kampanya parametreleri (utm_*), tarayıcı, işletim sistemi, cihaz türü, ekran boyutu, dil ve IP adresinden türetilen yaklaşık konum. Sayfa hızı ölçümleri de aynı şekilde kaydedilir. İletişim formu için yalnızca üç şey kaydedilir: gönderimin başarılı olup olmadığı, seçtiğin proje tipi ve mesajın uzunluk aralığı. Adın, e-posta adresin ve mesaj metnin istatistiklere asla ulaşmaz.",
  },
  retention: [
    {
      id: "form",
      label: "İletişim mesajları",
      text: "En fazla 12 ay. Sonra gelen kutumdan ve EmailJS geçmişinden silerim.",
    },
    {
      id: "statistics",
      label: "Ziyaret istatistikleri",
      text: "13 ay.",
    },
    {
      id: "logs",
      label: "İstek kayıtları",
      text: "Sağlayıcılarda kısa süre: Out Plane’de yaklaşık bir gün. Cloudflare kendi kayıtlarını kendi koşullarında tutar.",
    },
  ],
  rights: {
    intro: "KVKK’nın 11. maddesi uyarınca benden şunları isteyebilirsin:",
    items: [
      "kişisel verilerinin işlenip işlenmediğini öğrenmek ve buna ilişkin bilgi almak,",
      "işleme amacını ve verilerin amacına uygun kullanılıp kullanılmadığını öğrenmek,",
      "verilerin yurt içinde ya da yurt dışında aktarıldığı üçüncü kişileri bilmek,",
      "eksik ya da yanlış verilerin düzeltilmesini istemek,",
      "7. maddedeki şartlar çerçevesinde verilerin silinmesini ya da yok edilmesini istemek,",
      "bu düzeltme ve silme işlemlerinin verilerin aktarıldığı üçüncü kişilere bildirilmesini istemek,",
      "yalnızca otomatik analiz sonucu aleyhine çıkan bir sonuca itiraz etmek,",
      "hukuka aykırı işleme nedeniyle zarara uğrarsan zararın giderilmesini talep etmek.",
    ],
    gdpr: "GDPR sana uygulanıyorsa erişim, düzeltme, silme, kısıtlama, taşınabilirlik ve itiraz haklarına da sahipsin (md. 15–21).",
    how: "{email} adresine yaz. Ücretsiz olarak en geç 30 gün içinde yanıtlarım.",
    complaint:
      "Ayrıca Türkiye’de Kişisel Verileri Koruma Kurumu’na (KVKK) ya da ülkendeki veri koruma otoritesine şikâyette bulunabilirsin.",
  },
  changes:
    "Yukarıdakilerden biri değişirse, örneğin Cloudflare Web Analytics kapatıldığında, bu sayfayı ve tarihini güncellerim.",
  privacyProcessors,
};
