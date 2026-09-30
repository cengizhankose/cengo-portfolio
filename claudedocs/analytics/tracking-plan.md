# İzleme planı (tracking plan)

> Tek doğruluk kaynağı: bu doküman + `src/lib/analytics/events.js`. İkisi `tests/frontend/analytics/tracking-plan.test.js` ile eşit tutulur (olay adları, olay başına özellikler, öncelik, UTM kayıtları). Bir olay ya da özellik eklenirken ikisi aynı commit'te değişir.

## 1. Genel

| Alan | Değer |
|---|---|
| Araç | Umami, self-host, `https://stats.cengizhankose.com` (K-05, T-13). Çerezsiz. |
| İzlenen host | Yalnız `www.cengizhankose.com` (K-03). Apex, `*.outplane.app` ve `localhost` gönderim yapmaz (ANL-16). |
| Diller | `en` (ön eksiz) ve `tr` (`/tr` önekli), tek Umami website'ı; dil ayrımı `ui_locale` özelliğiyle (T-12). |
| Kod | `src/lib/analytics/` (`index.js` API, `events.js` katalog, `guard.js`, `config.js`, `url.js`), `src/lib/webVitals.js` |
| Açma anahtarı | Build zamanı env: `VITE_UMAMI_WEBSITE_ID` (boş = kapalı), isteğe bağlı `VITE_UMAMI_SRC` (varsayılan `https://stats.cengizhankose.com/script.js`). Sır değildir. |
| Durum | Kod hazır, **izleme kapalı**. Sahip `VITE_UMAMI_WEBSITE_ID`'yi ancak gizlilik sayfaları (`/privacy`, `/tr/privacy`, W9) yayına çıktıktan sonra girer (T-09, T-13). |
| Sorumlu | Sahip (Cengizhan Köse) |
| Son güncelleme | 2026-09-30 |

## 2. Umami işletimi

Değerler (bağlantı dizesi, parolalar, `APP_SECRET`) bu dokümana **yazılmaz**; yalnız adlar ve tarihler.

| Alan | Değer |
|---|---|
| Out Plane uygulaması | `umami` (alınamazsa `cengostats`), private port 3000, platform adresi yok |
| Sürüm (imaj) | `ghcr.io/umami-software/umami:3.4.0` (`latest` kullanılmaz) |
| Database / rol | `umami` / `umami` (portföy database'inden izole, `REVOKE CONNECT … FROM PUBLIC` iki yönde) |
| Env anahtarları (yalnız Out Plane'de) | `DATABASE_URL`, `APP_SECRET`, `TWO_FACTOR_ENCRYPTION_KEY`, `DISABLE_TELEMETRY` |
| Website | `cengizhankose.com`, domain `www.cengizhankose.com` |
| Kurulum tarihi | — (henüz kurulmadı) |
| Son yedek | — |
| Son güncelleme | — |
| Veritabanı boyutu | — (`SELECT pg_size_pretty(pg_database_size('umami'));`, aylık) |
| Admin | Varsayılan parola değiştirildi: — · 2FA açık: — |
| Sorumlu | Sahip |

Runbook (sahip; ayrıntı `05-analyst-plan.md` ANL-01 adım 2.8):

- **Yedek:** ayda bir ve her sürüm güncellemesinden önce `pg_dump` (repo dışı, şifreli dizin, son 3 dosya). Tarih yukarıdaki "Son yedek" satırına yazılır.
- **Güncelleme:** ayda bir `gh api repos/umami-software/umami/releases/latest --jq .tag_name` → sürüm notları → yedek → `outplane build set --app umami --image ghcr.io/umami-software/umami:<X.Y.Z> --deploy` (önce `--dry-run`) → `/api/heartbeat` 200. Şema değişirse 11. bölümdeki SQL yeniden kontrol edilir.
- **Boyut:** aylık yedekle birlikte boyut sorgusu; ilk hafta `outplane metrics` ile bellek/CPU.

## 3. Cloudflare Web Analytics paralel dönemi (T-09)

Umami yayına çıktığı gün başlar, 2 hafta sürer; 15. gün Cloudflare panelinden otomatik enjeksiyon (www + apex) kapatılır ve aynı hafta gizlilik metinlerinden ve CSP'den çıkarılır (PERF-25).

| Alan | Değer |
|---|---|
| Başlangıç | — |
| Bitiş / kapatma | — |
| Sonuç notu | — (sayfa görüntüleme farkı, reklam engelleyici etkisi, bot filtresi; CWV p75 karşılaştırması) |

| Gün | Cloudflare sayfa görüntüleme | Umami sayfa görüntüleme | Not |
|---|---|---|---|
| — | — | — | — |

Not: Cloudflare beacon'ı `?analytics=off` opt-out'unu tanımaz; paralel dönemde sahip trafiği CF sayılarında kalır.

## 4. Karar soruları (B1)

| İş sorusu | Karar | Metrik | Kaynak |
|---|---|---|---|
| Kim geliyor? | İçerik işe alımcıya mı, müşteriye mi, geliştiriciye mi? | Giriş sayfası × kanal × dil × ülke × cihaz | Umami |
| Nereden geliyor? | Hangi kanala zaman ayrılmalı? | Kanal payı, kanal başına dönüşüm | Referrer + UTM + Search Console |
| Hangi proje / yazı ilgi çekiyor? | Hangi proje öne çıkmalı, hangi konuda yazılmalı? | `project_clicked`, %75 okuma oranı, etkileşim süresi | Olaylar |
| İletişime dönüşüyor mu? | İletişim akışı / CTA değişmeli mi? | Nitelikli temas / insan oturumu, form başarı oranı | Olaylar |
| Site sağlıklı mı? | Performans / hata işi önceliklendirilmeli mi? | LCP/INP/CLS p75, `not_found` ve `error_occurred` oranı | web-vitals + olaylar |

## 5. KPI ağacı ve kuzey yıldızı (B2)

- **Kuzey yıldızı — aylık nitelikli temas:** `contact_form_submitted[result=success]` + `email_link_clicked` + `cv_downloaded`; ayrıca `ui_locale` başına.
- **Erişim:** insan oturumu, kanala göre oturum, yeni / geri dönen, giriş sayfası payı.
- **İlgi:** etkileşimli oturum oranı (≥ 10 sn ya da ≥ 2 sayfa), `/about` görüntüleme oranı, blog %75 okuma oranı, `project_clicked` / oturum.
- **Niyet:** `cta_clicked[cta_id=hero_contact]`, `/contact` görüntüleme oranı, `contact_form_started` oranı, `outbound_link_clicked[network=linkedin|github]`.
- **Dönüşüm:** form başarı oranı (başarılı / başlayan), `email_link_clicked`, `cv_downloaded`.
- **Korkuluk metrikleri:** LCP p75 ≤ 2,5 sn · INP p75 ≤ 200 ms · CLS p75 ≤ 0,1 · form hata oranı · `not_found` görüntüleme oranı.

## 6. Olaylar

Ad kuralı: `object_action`, küçük harf + alt çizgi, ≤ 50 karakter. Her olay ayrıca global özellikleri taşır (7. bölüm). "Durum" = bu paketten sonraki uygulama durumu; tetikleyici henüz yazılmamış olaylar için planlanan dosya ve paket yazılıdır.

| Olay | Tetikleyici (dosya:satır) | Özellikler ve izinli değerler | Karar | Öncelik | Durum |
|---|---|---|---|---|---|
| `page_view` | `src/lib/analytics/usePageViewTracking.js` (yeni sayfa render edildikten sonra; blog yazısında veri gelince) → `trackPageview()` `src/lib/analytics/index.js` | `post_slug` (yalnız blog yazısı; slug) + global `page_type` | İçerik önceliği | Şart | API hazır (`trackPageview`); hook W7-FE-route-shell (ANL-07) |
| `cta_clicked` | `src/pages/home/index.jsx` hero linkleri; About sonu, yazı sonu, hizmet CTA'ları | `cta_id` ∈ {`hero_about`, `hero_contact`, `hero_portfolio`, `about_contact`, `blog_end_contact`, `service_contact`}; `project_type` ∈ {`mobile`, `web`, `ai`, `lead`, `job`, `other`} (yalnız `service_contact`) | Hero mesajı ve CTA'lar çalışıyor mu | Şart | Planlandı: W7-MKT-hero-contact-conversion (ANL-02, MKT-19), W6-MKT-about-positioning (MKT-15), W8-SEO-blog-author-rss (MKT-07), W11-FE-home-sections (MKT-13) |
| `outbound_link_clicked` | `src/lib/analytics/outbound.js` capture `click`/`auxclick` dinleyicisi (`initAnalytics` içinden) | `network` ∈ {`linkedin`, `github`, `x`, `youtube`, `twitch`, `instagram`, `other`}; `location` (token: `social_rail`, `menu_footer`, `blog_body`, `contact_page`, `other`); `link_host` (yalnız `network=other`; çıplak host, tam URL asla) | Hangi profil ikinci durak | Şart | Planlandı: W7-DSG-social-links (ANL-09) |
| `email_link_clicked` | `src/pages/contact/index.jsx` mailto linki | `location` (token: `contact_page`) | Formu atlayan temas | Şart | Planlandı: W7-MKT-hero-contact-conversion (ANL-02) |
| `contact_form_started` | `src/pages/contact/index.jsx` `<form onFocus>` (sayfa görüntüleme başına bir kez) | — | Form sürtünmesi | Şart | Planlandı: W7-MKT-hero-contact-conversion (ANL-02) |
| `contact_form_submitted` | `src/pages/contact/index.jsx` `emailjs.send` then/catch | `result` ∈ {`success`, `error`}; `error_code` (kod, ör. `412`, `unknown`); `message_length_bucket` ∈ {`lt_200`, `200_1000`, `gt_1000`}; `project_type` ∈ {`mobile`, `web`, `ai`, `lead`, `job`, `other`} | Kuzey yıldızı | Şart | Planlandı: W7-MKT-hero-contact-conversion (ANL-02, MKT-10). Hata ayrı olay değil, `result=error` |
| `cv_downloaded` | `src/components/cvlink/index.jsx` | `cv_language` ∈ {`en`, `tr`}; `location` (token: `about`, `contact`, `cv_page`) | İşe alımcı ilgisi | Şart | Planlandı: W11-FE-home-sections (ANL-12); CV PDF'leri sahipte |
| `project_clicked` | `src/pages/portfolio/index.jsx` proje kartı linkleri (`data-track="project"`) | `project_id` ∈ 8. bölümdeki `PROJECT_IDS`; `link_type` ∈ {`demo`, `repo`, `case_study`, `post`}; `position` (tam sayı 1–100) | Hangi proje öne | Şart | Planlandı: W8-MKT-portfolio-cases (ANL-11) |
| `blog_read_progress` | `src/pages/blog/useBlogReadTracking.js` + `src/lib/analytics/readDepth.js` (scroll eşikleri) | `post_slug` (slug); `percent` ∈ {`25`, `50`, `75`, `100`} | Hangi konu okunuyor | Şart | Planlandı: W8-SEO-blog-author-rss (ANL-10) |
| `blog_post_engaged` | aynı hook; `visibilitychange → hidden`, `pagehide` ya da unmount | `post_slug` (slug); `engaged_seconds_bucket` ∈ {`lt_10`, `10_30`, `30_60`, `60_180`, `180_600`, `gt_600`} | Derinlik vs tık tuzağı | İyi olur | Planlandı: W8-SEO-blog-author-rss (ANL-10) |
| `not_found_viewed` | `src/pages/notfound/index.jsx` mount (bir kez) | `requested_path_group` ∈ {`dotfile`, `php`, `wp`, `blog`, `api`, `other`}; `referrer_host` (host, `direct` ya da `internal`) | Kırık link avı | Şart | Planlandı: W7-FE-route-shell (ANL-05) |
| `error_occurred` | `src/pages/blog/BlogHome.jsx`, `src/pages/blog/BlogPost.jsx` (`useSWR` `onError`, anahtar başına bir kez) | `scope` ∈ {`blog_api`, `contact_api`}; `endpoint` (kod: `list`, `post`); `status` (kod: HTTP durumu, ör. "500"; ağ hatası "network"; beklenmeyen gövde "bad_shape") | Sessiz arızalar | Şart | Planlandı: W5-FE-blog-data-layer (ANL-15) |
| `web_vital_reported` | `src/lib/webVitals.js:55` (`onLCP`/`onINP`/`onCLS`/`onFCP`/`onTTFB`, web-vitals 5) | `metric` ∈ {`LCP`, `INP`, `CLS`, `FCP`, `TTFB`}; `value` (sayı; ms, CLS 3 ondalık); `rating` ∈ {`good`, `needs-improvement`, `poor`}; `page_type` ve `ui_locale` giriş sayfasının | Performans önceliği | Şart | **Uygulandı** (W2, ANL-06 + PERF-23); izleme açılınca gönderir |
| `locale_switched` | `src/components/langswitch/**` dil değiştirici tıklaması | `from_locale` ∈ {`en`, `tr`}; `to_locale` ∈ {`en`, `tr`}; `target` ∈ {`translation`, `blog_index`} | Dil değiştirici kullanılıyor mu | Şart | Planlandı: W8-ANL-locale-segmentation (ANL-18) |
| `nav_menu_opened` | `src/header/index.jsx` menü butonu | — | Menü keşfediliyor mu | İyi olur | Planlandı, uygulanmadı |
| `theme_toggled` | `src/components/themetoggle/index.jsx` | `theme` ∈ {`dark`, `light`} | Varsayılan tema kararı | İyi olur | Planlandı, uygulanmadı |

`track()` bilinmeyen bir olay adını göndermez; izinli olmayan bir özelliği ya da izinli değer kümesi dışındaki bir değeri düşürür (dev'de `console.warn`). String değerler 100 karakterde kesilir.

## 7. Global özellikler

`setPageContext()` ile bir kez verilir, sonraki her olaya eklenir (olayın kendi değeri önceliklidir).

| Özellik | İzinli değerler | Kaynak |
|---|---|---|
| `page_type` | `home`, `about`, `portfolio`, `contact`, `privacy`, `blog_index`, `blog_post`, `not_found` | Rota; `/tr` önekinden bağımsız (ANL-07) |
| `ui_locale` | `en`, `tr` | Rota öneki: `/tr…` → `tr`, diğerleri → `en` (T-12) |
| `content_language` | `en`, `tr`, `unknown` | Blog yazısında `posts.lang`, diğer sayfalarda arayüz dili (ANL-18) |

Umami'nin yerleşik "Language" metriği tarayıcı dilidir (`navigator.language`); site dili için kullanılmaz.

## 8. Enum'lar ve stabil id'ler

Hepsi `src/lib/analytics/events.js`'ten import edilir; hiçbir paket kendi kopyasını tutmaz.

| Enum | Değerler | Not |
|---|---|---|
| `NETWORKS` | `linkedin`, `github`, `x`, `youtube`, `twitch`, `instagram`, `other` | K-11 sırası; `SOCIAL_PROFILES` id'leri (`src/seo/site.js`) `other` dışındakilere sırayla eşittir. Facebook yok. |
| `NETWORK_HOSTS` | linkedin: `linkedin.com`, `lnkd.in` · github: `github.com` · x: `x.com`, `twitter.com`, `t.co` · youtube: `youtube.com`, `youtu.be` · twitch: `twitch.tv` · instagram: `instagram.com` | Alt alan adları (`www.`, `m.`, `l.`) da eşleşir. ANL-09 ve referrer eşlemesi (12. bölüm) aynı tabloyu kullanır. |
| `FEATURED_PROJECT_IDS` | `salesgym`, `farmin`, `effort_lab` | K-12, içerik dokümanı §4.1; bu sırayla |
| `PROJECT_IDS` | öne çıkan 3 + `safecall_mobile`, `trinqa`, `atlas_steward`, `cycase`, `hackathon_archive`, `voxly`, `road_to_doomsday`, `bubble_writer` | Adaylar önceden ayrıldı; kart yayına girince id değişmez. `^[a-z0-9_]+$` |
| `LINK_TYPES` | `demo`, `repo`, `case_study`, `post` | ANL-11 |
| `CV_LANGUAGES` | `en`, `tr` | ANL-12 |
| `PROJECT_TYPES` | `mobile`, `web`, `ai`, `lead`, `job`, `other` | MKT-10 form alanı; MKT-13 hizmet id'leri bunun alt kümesi |
| `CTA` | `hero_about`, `hero_contact`, `hero_portfolio`, `about_contact`, `blog_end_contact`, `service_contact` | Dilden bağımsız |
| `LOCATIONS` | `social_rail`, `menu_footer`, `blog_body`, `contact_page`, `about`, `contact`, `cv_page`, `other` | `location` küçük harfli token olarak doğrulanır; yeni yerleşim bu listeye ve 6. bölüme yazılır |
| `PAGE_TYPES`, `UI_LOCALES`, `CONTENT_LANGUAGES` | 7. bölüm | |
| Diğer | `FORM_RESULTS`, `MESSAGE_LENGTH_BUCKETS`, `READ_DEPTH_PERCENTS`, `ENGAGED_SECONDS_BUCKETS`, `PATH_GROUPS`, `ERROR_SCOPES`, `WEB_VITAL_METRICS`, `WEB_VITAL_RATINGS`, `LOCALE_SWITCH_TARGETS`, `THEMES` | 6. bölümdeki değerler |

İçerik öğelerinin stabil id'leri (T-12, iki dilde aynı): sosyal profiller = `NETWORKS` (W2-SEO-head-module `SOCIAL_PROFILES`), portföy = `PROJECT_IDS` (W8), hizmetler = `PROJECT_TYPES` alt kümesi (MKT-13, W11).

## 9. PII kuralları

- Ad, e-posta, mesaj metni, telefon ve IP hiçbir olay özelliğine girmez. `name`, `email`, `message`, `phone`, `ip` (ve türevleri) her olayda reddedilir; mesaj için yalnız uzunluk kovası.
- Sorgu dizesinden yalnız `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `ref` araca gider (ilk sayfa görüntülemesinde); diğer parametreler (ör. `?email=`) atılır.
- Dış referrer yalnız origin + path olarak gider (sorgu ve hash atılır).
- Dış link olaylarında tam URL gönderilmez; sosyal olmayan hostlar için yalnız `link_host`.
- Umami çerez bırakmaz; IP saklamaz (oturum tuzu aylık döner, `SALT_ROTATION` varsayılanı).

## 10. Gönderim modeli

- Tracker `initAnalytics()` tarafından eklenir: `<script defer src="https://stats.cengizhankose.com/script.js" data-website-id="…" data-auto-track="false" data-domains="www.cengizhankose.com" data-do-not-track="true">`. Dinamik eklendiği için render'ı bloklamaz; `preconnect` yok. `data-exclude-search` bilerek yok (UTM için).
- Otomatik izleme kapalı: tracker yükteki `url`/`title`/`referrer`'ı ilk yüklemede bırakır, bu yüzden modül her gönderimde güncel sayfayı `umami.track(fn)` biçimiyle kendisi verir.
- Sayfa görüntüleme ikili yapıdadır: (a) Umami'nin yerel page view'ı (`name` yok; Umami'nin sayfa raporları bunu sayar), (b) özellikleri taşıyan `page_view` olayı (`page_type`, `post_slug` + global). İlk sayfa görüntülemesi UTM'yi ve dış referrer'ı taşır; sonrakiler çıplak path'i ve önceki path'i referrer olarak gönderir.
- Script yüklenene kadar en fazla 50 çağrı kuyrukta bekler (her biri kendi sayfasıyla); script yüklenemezse (reklam engelleyici) kuyruk atılır, site etkilenmez. Tracker `fetch(…, { keepalive: true })` kullandığı için sekme kapanırken de gönderir; `sendBeacon` yedeği yok.
- Bütün API `try/catch` içinde; analitik hatası UI'ı bozmaz.

## 11. Web Vitals (ANL-06, PERF-23)

- `src/lib/webVitals.js` yalnız izleme açıkken dinamik import ile yüklenir (web-vitals giriş chunk'ında yok). LCP, INP, CLS (+ teşhis için FCP, TTFB) → `web_vital_reported`.
- web-vitals yalnız yüklenen (giriş) sayfayı ölçer; SPA içi geçişler ayrı ölçülmez. `page_type` ve `ui_locale` giriş sayfasınındır, `content_language` bağlamdan gelir. INP/CLS sekme gizlenince raporlanır.
- Giriş sayfası tipi W7'ye kadar `webVitals.js` içindeki geçici eşlemeyle bulunur; W7-FE-route-shell `pageType.js`'teki `getPageType()`'a geçirir (aynı değerler).
- Umami'nin yerleşik `data-performance` ölçümü otomatik izleme kapalıyken çalışmadığı için kullanılmaz.
- p75 (sahip, haftalık; Umami 3.4.0 şeması, sürüm güncellemesinde kontrol edilir): `outplane env run --app umami -- sh -c 'psql "$DATABASE_URL" -f web-vitals-p75.sql'`

```sql
SELECT m.string_value AS metric, p.string_value AS page_type, l.string_value AS ui_locale,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY v.number_value) AS p75, count(*) AS n
FROM website_event e
JOIN event_data m ON m.website_event_id = e.event_id AND m.data_key = 'metric'
JOIN event_data v ON v.website_event_id = e.event_id AND v.data_key = 'value'
JOIN event_data p ON p.website_event_id = e.event_id AND p.data_key = 'page_type'
LEFT JOIN event_data l ON l.website_event_id = e.event_id AND l.data_key = 'ui_locale'
WHERE e.event_name = 'web_vital_reported' AND e.created_at >= now() - interval '7 days'
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
```

Korkuluk eşikleri: LCP ≤ 2500 ms · INP ≤ 200 ms · CLS ≤ 0,1. T-09 paralel döneminde Cloudflare'in CWV p75'i karşılaştırma tabanı olarak 3. bölüme not edilir.

## 12. UTM kuralları ve kayıt tablosu (B4, ANL-03)

Kurallar: hepsi küçük harf, kelimeler alt çizgiyle; site içi linklerde asla UTM yok; her link her zaman `https://www.` ile (K-03); profil linkleri kök adrese (`/`, EN, `x-default`) gider, yalnız Türkçe içerik paylaşılan yerde `/tr/`. Kanal sırası K-11. Facebook K-11 ile çıktı; oraya link konmaz.

### UTM kayıtları

Sahip her linki profile koyduğu gün "Eklendiği tarih" sütununu doldurur.

| Kanal | Konum | URL | Eklendiği tarih |
|---|---|---|---|
| LinkedIn | Profil → İletişim bilgileri → Web sitesi | `https://www.cengizhankose.com/?utm_source=linkedin&utm_medium=social&utm_campaign=profile&utm_content=website_field` | — |
| GitHub | Settings → Public profile → URL | `https://www.cengizhankose.com/?utm_source=github&utm_medium=referral&utm_campaign=profile&utm_content=profile_url` | — |
| GitHub | Profil README'si (`cengizhankose/cengizhankose`) | `https://www.cengizhankose.com/?utm_source=github&utm_medium=referral&utm_campaign=profile&utm_content=readme` | — |
| X | Edit profile → Website | `https://www.cengizhankose.com/?utm_source=x&utm_medium=social&utm_campaign=profile&utm_content=bio` | — |
| YouTube | YouTube Studio → Customization → Basic info → Links | `https://www.cengizhankose.com/?utm_source=youtube&utm_medium=social&utm_campaign=profile&utm_content=channel_links` | — |
| Twitch | Settings → Channel → About / Social links | `https://www.cengizhankose.com/?utm_source=twitch&utm_medium=social&utm_campaign=profile&utm_content=about_panel` | — |
| Instagram | Edit profile → Links | `https://www.cengizhankose.com/?utm_source=instagram&utm_medium=social&utm_campaign=profile&utm_content=bio_link` | — |
| E-posta | İmza | `https://www.cengizhankose.com/?utm_source=email&utm_medium=email&utm_campaign=signature` | — |
| CV (EN) | PDF başlığındaki site linki (ANL-12) | `https://www.cengizhankose.com/?utm_source=cv&utm_medium=document&utm_campaign=cv_2026&utm_content=header_link` | — |
| CV (TR) | PDF başlığındaki site linki (ANL-12) | `https://www.cengizhankose.com/tr/?utm_source=cv&utm_medium=document&utm_campaign=cv_2026&utm_content=header_link` | — |

Kalıplar (tek seferlik paylaşımlar; her kullanım yukarıdaki tabloya tarihli satır olarak eklenir):

- LinkedIn gönderisi (blog paylaşımı): `utm_source=linkedin&utm_medium=social_post&utm_campaign=blog_<kisa_slug>&utm_content=post_<yyyymmdd>`
- YouTube video açıklaması: `utm_source=youtube&utm_medium=social&utm_campaign=<video_kisa_adi>`

### Referrer → kanal eşlemesi

UTM varsa kanal `utm_source`'tur. UTM yoksa referrer host'u (`www.`/`m.`/`l.` soyulmuş) `NETWORK_HOSTS`'a göre eşlenir:

| Referrer | Kanal |
|---|---|
| `linkedin.com`, `lnkd.in` | linkedin |
| `github.com` | github |
| `t.co`, `x.com`, `twitter.com` | x |
| `youtube.com`, `youtu.be` | youtube |
| `twitch.tv` | twitch |
| `instagram.com`, `l.instagram.com` | instagram |
| `google.*`, `bing.com`, `duckduckgo.com` | organic_search |
| UTM ve referrer yok | direct |
| diğer | referral |

UTM, apex → www 301'inde (ANL-08) ve T-12'nin `/blog/<tr-slug>` → `/tr/blog/<tr-slug>` yönlendirmesinde korunur (W3 kapısında kontrol edilir).

## 13. İç trafik (ANL-16)

- İzleme yalnız prod build + `www.cengizhankose.com` + website id tanımlı + opt-out yok + Do Not Track kapalıyken açılır (`src/lib/analytics/guard.js`). Dev (`bun run dev`, `localhost:3000`), apex ve `*.outplane.app` hiç istek atmaz.
- İkinci katman: tracker'da `data-domains="www.cengizhankose.com"`; Umami sunucusu bot UA'larını reddeder (`DISABLE_BOT_CHECK` verilmez).
- **Opt-out yöntemi (sahip):** masaüstü ve telefondaki her tarayıcıda bir kez `https://www.cengizhankose.com/?analytics=off` açılır. Bu, `localStorage`'a `cengo:analytics-optout=1` ve Umami'nin kendi `umami.disabled=1` anahtarını yazar ve parametreyi adres çubuğundan siler. Geri almak: `?analytics=on`.
- Depolama engelliyse (gizli pencere, site verisi kapalı) izleme kapalı kabul edilir; site çalışır.
- **Do Not Track:** tarayıcıda DNT açıksa hiçbir şey yüklenmez ve gönderilmez (analitik planı açık soru 6, önerilen varsayılan; karar sahibin, `config.js` → `respectDoNotTrack`). Gizlilik metni (W9) bunu belirtir.

## 14. Konversiyonlar

- Umami → Goals: olay `contact_form_submitted`, özellik `result = success` (iletişim sayfası iki dilde tek hedef; dil kırılımı `ui_locale`).
- Kuzey yıldızı 5. bölümdeki toplamdır; dil başına ayrıca raporlanır.

## 15. Panolar ve haftalık özet (B7)

1. **Haftalık özet:** insan oturumu ve haftalık değişim, kanal payı (UTM + referrer), ilk 5 giriş sayfası, nitelikli temas sayısı. `en` ve `tr` için ayrı sütun (ANL-18; sorgu ve tablo W8-ANL-locale-segmentation ile eklenir).
2. **İletişim hunisi:** oturum → `/contact` görüntüleme → `contact_form_started` → `contact_form_submitted[success]`; yan yollar `email_link_clicked`, `outbound_link_clicked[linkedin]`; form hata oranı.
3. **Blog performansı:** yazı başına görüntüleme, %50/%75/%100 okuma, etkileşim süresi kovaları, yazıdan iletişime geçiş, organik sorgular (Search Console).
4. **Teknik sağlık:** Web Vitals p75 (11. bölüm), `not_found_viewed` ve `error_occurred` oranı.

## 16. Veri kaynakları ve saklama

| Kaynak | Ne | Saklama |
|---|---|---|
| Umami (self-host) | Sayfa görüntüleme, olaylar, referrer/UTM, Web Vitals | 13 ay (sahip kararıyla değişebilir); DB boyutu aylık izlenir |
| Out Plane proxy kaydı | Ham istekler (referrer/UA yok) | ≈ 1 gün |
| Günlük istek özetleri | Path grubu × gün, botlar ayrı (ANL-13) | Planlandı: W10-ANL-request-stats |
| Search Console / Bing | Organik sorgular, indeks | Google/Bing varsayılanı (ANL-14, sahip) |
| Cloudflare Web Analytics | Sayfa görüntüleme, CWV | T-09 paralel dönemi bitince kapatılır |

## 17. Değişiklik günlüğü

| Tarih | Değişiklik | Paket |
|---|---|---|
| 2026-09-30 | Plan oluşturuldu: 16 olay, enum'lar, Umami işletimi, UTM kayıtları, iç trafik; `track`/`trackPageview`/`setPageContext`/`initAnalytics` ve `web_vital_reported` uygulandı, izleme kapalı. | W2-ANL-analytics-core (ANL-19, ANL-01, ANL-16, ANL-06, PERF-23, ANL-03) |
