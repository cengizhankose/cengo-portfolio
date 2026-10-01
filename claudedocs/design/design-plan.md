# Tasarım planı: cengizhankose.com görsel kimliği (FE-01)

> Durum: **öneri, sahip onayı bekliyor** · Hazırlayan: W12-DSG-visual-identity (2026-10-01)
> Kapsam: palet, tip rolleri, header / hero / sosyal şerit yerleşimi, imza öğesi, ilkeler.
> Kaynaklar: `claudedocs/audit-2026-09-30/plans/07-frontend-plan.md` (FE-01), `08-design-plan.md`
> (DSG-18, DSG-19, DSG-21, DSG-22, DSG-30), kararlar T-12, T-14, K-06a, K-06b, K-11,
> içerik `00-icerik-girdileri.md` §2. Kod karşılığı: `src/styles/tokens.css`.

## 1. Brief

| Soru | Cevap |
|---|---|
| Konu | Web ve mobil ürünleri uçtan uca geliştiren bir Senior Fullstack Engineer: filo teknolojisi, e-ticaret ve yapay zekâ (AI agent sistemleri dahil). Kaynak: içerik girdileri §2.2, §2.4. |
| Hedef kitle | 1) işe alımcı ve ekip lideri (rolü ve kanıtı 30 saniyede görmek ister), 2) proje sahibi müşteri (ne yaptığını ve nasıl ulaşacağını arar), 3) topluluk (blog, hackathon, sosyal kanallar). |
| Sayfanın birincil işi | **Bir proje ya da iş görüşmesi başlatmak.** Ana sayfada tek düğme iletişim sayfasına gider (MKT-19), ikinci yol seçili işlere giden kanıt linkidir. |
| Ton | Sakin, editoryal, ölçülü. Kanıt sayılarla değil, kaynakta geçen tek satırla verilir (§2.3: "4× hackathon winner · 6+ years"). |
| İki dil | EN ön eksiz, TR `/tr` (T-12). Her arayüz metni iki sözlükte, TR hitap "sen". |

## 2. Yön: monokrom editoryal, şablondan bağımsız

Tasarım denetimi bugünkü monokrom editoryal dili (Marcellus + Raleway + 10 px çerçeve) güçlü
buldu, frontend denetimi ise kodun bir şablon kopyası olduğunu gösterdi (07-frontend-plan, Açık
sorular #3). Önerilen yön ikisini birleştirir: **görünen dil korunur, onu taşıyan kod ve
yerleşim yeniden yazılır.** Şablondan gelen header, hero, sosyal şerit ve halkalı düğme kiti
kalkar; çerçeve ve tip eşleşmesi imza olarak kalır.

## 3. Renk paleti (5 isimli hex + türetilmiş kılçizgi)

Site iki temalıdır (`<html data-theme>`, K-10). Her düz renk token'ı tam olarak bir palet
rengine bağlıdır; vurgu rengi yoktur (08-design-plan Açık sorular #2: monokrom kalır).

| Ad | Hex | Koyu temada | Açık temada |
|---|---|---|---|
| Mürekkep (Ink) | `#0c0c0c` | `--bg-color`, `--surface-color` | — |
| Kâğıt (Paper) | `#ffffff` | `--text-color` | `--bg-color`, `--surface-color` |
| Siyah (Black) | `#000000` | — | `--text-color` |
| Kül (Ash) | `#a3a3a3` | `--text-muted` (7.75:1), imleç halkası | — |
| Arduvaz (Slate) | `#595959` | — | `--text-muted` (7.00:1), imleç halkası |

**Kılçizgi (`--border-color`)** artık ayrı iki gri değildir (`#3a3a3a` / `#d4d4d4` idi):
`color-mix(in srgb, var(--text-color) 18%, var(--bg-color))`, yani metnin %18'i sayfanın
üstünde. Tek bildirim iki temada da doğru tonu verir (koyu ≈ `#383838`, açık ≈ `#d1d1d1`;
eskisinden göz ayırt edemez). Palet yedi hex'ten beşe iner.

Değerlendirilip bırakılan: açık temanın metnini `#000` yerine Mürekkep `#0c0c0c` yapmak (iki
temayı tam yer değiştirme yapardı). Blog diyagramlarının yayın akışı (`scripts/mermaid.*.json`,
yayımlanmış SVG'ler) `#000000`'a bağlı; değişiklik bu paketin kapsamını aşıyor. Sahip isterse
ayrı bir işte yapılır.

Kurallar:

- Renk yalnız `src/styles/tokens.css`'te yazılır, kurallar token okur (FE-20).
- Durum rengi yoktur: aktif sayfa, aktif dil ve hover alt çizgi ve ağırlıkla anlatılır,
  hiçbir zaman yalnız renkle değil.
- Metin kontrastı her iki temada ≥ 4.5:1. Kılçizgi süstür (işlevi yoktur); odak halkası metin
  rengindedir.

## 4. Tipografi

| Rol | Aile | Ağırlık | Nerede |
|---|---|---|---|
| Görüntü (display) | Marcellus (`--font-display`) | 400, tek ağırlık, `font-synthesis: none` | Logo, header sekmeleri, menü linkleri, h1–h6 |
| Metin (body) | Raleway (`--font-body`) | 400 metin, 500 etiket, 700 vurgu ve aktif dil | Paragraf, rol satırı, düğme, dil değiştirici |
| Kod | sistem monospace (`--font-mono`) | — | Blog kodu |

Tip ölçeği FE-19'un altı adımıdır (`--fs-sm` … `--fs-2xl`); yeni bir boyut eklenmez.
Ana sayfa yalnız Raleway 400 ve Marcellus 400 dosyalarını çizer (PERF-08 bütçesi).

Değişiklik (öz-eleştiri §8): hero'daki rol satırı BÜYÜK HARF + harf aralığı ile yazılıyordu;
artık cümle düzeninde, `--fs-md`, soluk renkte. İsimle arasındaki fark boyut, aile ve renkle
kurulur.

## 5. Ölçü token'ları (yerleşim)

| Token | Değer | Rol |
|---|---|---|
| `--frame-size` | 10px | Sayfa çerçevesinin kalınlığı (imza) |
| `--header-height` | 50px | Header şeridinin ve sekmelerinin yüksekliği |
| `--header-offset` | 70px (`çerçeve + header + çerçeve`) | `html { scroll-padding-top }`: bağlantıyla gelinen başlık header'ın altında kalmaz (DSG-22) |
| `--tap-min` | 24px | En küçük işaretçi hedefi (WCAG 2.5.8): sosyal linkler |
| `--tap-touch` | 44px | Dokunmatik hedef: dil değiştirici, menü düğmesi |
| `--cursor-ring-size` | 32px | Takip eden imleç halkasının çapı (T-14, DSG-21) |

Boşluklar 4 px ızgarasındadır (`--space-1..6`). Köşe yarıçapı her yerde 0'dır (imleç halkası
hariç: daire).

## 6. Bileşenler ve tel çerçeveler

### 6.1 Header (DSG-18, DSG-19, DSG-22)

Masaüstü (≥ 992 px): sekmeler çerçeveden sarkan kutulardır. Logo solda, sağ grupta sırasıyla
nav, dil değiştirici, tema düğmesi. Menü düğmesi yok.

```
┌──────────────────────────────────────────────────────────────────────────────┐  ← 10px çerçeve
│┌───────┐                      ┌──────┐┌───────┐┌─────┐┌───────┐┌──┬──┐┌──┐ │
││ CENGO │                      │ Home ││ About ││ Blog││Contact││EN│TR││ ◐│ │  ← 50px sekmeler
│└───────┘                      └══════┘└───────┘└─────┘└───────┘└══┴──┘└──┘ │    (2px aralık)
│                                  ↑ aria-current="page": 2px alt çizgi        │
│  kaydırınca: şeridin tamamı --bg-color zemin alır (scroll 0'da saydam)       │
```

Mobil (< 992 px): logo + dil + tema + menü düğmesi. Nav aynı öğedir; menü düğmesi onu tam ekran
panel olarak açar (FE-11 davranışı: odak tuzağı, Escape, `inert`, kaydırma kilidi).

```
┌─────────────────────────────────────┐
│┌───────┐          ┌──┬──┐┌──┐┌───┐ │
││ CENGO │          │EN│TR││ ◐││ ≡ │ │
│└───────┘          └──┴──┘└──┘└───┘ │
│                                     │       açık panel:
│                                     │       Home        ← aktifte alt çizgi
│                                     │       About
│                                     │       Blog …
│                                     │       LinkedIn GitHub X YouTube Twitch Instagram
│                                     │       Privacy · © 2026 Cengizhan Köse
```

Kurallar:

- **Tek nav**: masaüstü sekmeleri ile mobil panel aynı `<nav>`'dır; sayfa bölümleri iki kez
  render edilmez. Linkler `NavLink`: aktif sayfa `aria-current="page"` + alt çizgi; Home yalnız
  kendi yolunda aktiftir (`end`).
- Sıra (DOM = Tab = görsel): logo → nav → dil → tema → menü düğmesi → künye.
- **Künye (colophon)**: masaüstünde gizlilik linki ve telif satırı çerçevenin alt kenarından
  sarkan küçük bir sekmedir (sağ alt). Böylece menü düğmesi kalkınca gizlilik sayfası tek
  tıkta kalır. Mobilde açık panelin altındadır; sosyal linkler masaüstünde yan rayın işidir.
- Dil değiştirici her genişlikte header'dadır, menü açılmadan erişilir (DSG-19).
  Pasif dil 400, aktif dil 700 + alt çizgi (W11-MKT kısıtı).

### 6.2 Hero (K-06b, FE-18, FE-23, MKT-19)

```
┌───────────────────────────────────┬───────────────────────────────────┐
│                                   │                                   │
│   Cengizhan Köse                  │                                   │  ← h1, Marcellus --fs-2xl
│   Senior Fullstack Engineer       │                                   │  ← rol, Raleway --fs-md, soluk
│                                   │          (fotoğraf, cover,        │
│   I build web and mobile …        │           doygunluk %50)          │  ← alt başlık
│   Based in Istanbul, Türkiye.     │                                   │  ← durum satırı
│   Fleet tech, e-commerce and AI.  │                                   │  ← bir tur dönen satır
│   ───────────────                 │                                   │  ← tek kılçizgi
│   4× hackathon winner · 6+ years  │                                   │  ← kanıt satırı
│                                   │                                   │
│   ┌──────────────┐  See selected  │                                   │  ← tek düğme + kanıt linki
│   │ Get in touch │  work →        │                                   │
│   └──────────────┘                │                                   │
│   I reply within …                │                                   │  ← yanıt notu
└───────────────────────────────────┴───────────────────────────────────┘
          50%  (≥ 992 px, 100svh, header'ın altına çekilir)      50%
```

Mobil: tek sütun, önce metin ve düğmeler (ilk ekranda), sonra 4:5 fotoğraf kutusu.

Hizalama kuralı: hero metni kendi sütununda en fazla 32rem genişliğinde (düğme ve kanıt linki tek satırda) tek bir sol kenara
dizilir; sütunun içinde dikey ortalanır. Bütün dikey aralıklar `--space-*` adımlarıdır.
Düğme sitenin tek düğme stilidir (`button.module.css` `.button`): 2 px kenarlı, sıfır
yarıçaplı kutu; hover'da sert ofset gölge. Kayan halka katmanları kalkar.

### 6.3 Sosyal şerit (K-11, DSG-12, DSG-30)

```
 masaüstü (sol kenar, dikey ortada)       mobil (sayfa akışında, ortalı)
   ┌──┐ LinkedIn                             Beni başka yerlerde bul
   ├──┤ GitHub                               ────
   ├──┤ X                                    [in][gh][x][yt][tw][ig]
   ├──┤ YouTube
   ├──┤ Twitch
   ├──┤ Instagram
   │                                         her hedef 32×32 (≥ --tap-min)
   │  ← 40px kılçizgi
   Find me elsewhere   (aşağıdan yukarı okunur)
```

Altı kanal `SOCIAL_PROFILES` tek listesinden, K-11 sırasıyla (LinkedIn, GitHub, X, YouTube,
Twitch, Instagram). Başlık EN "Find me elsewhere", TR "Beni başka yerlerde bul" (W11-MKT
kısıtı, 23 karakter).

### 6.4 İmleç (K-06a, T-14, DSG-21)

Sistem imleci gizlenmez; yalnız fareli cihazda ve hareket azaltma kapalıyken takip eden bir
halka çizilir. Çap `--cursor-ring-size`, renkler `--cursor-ring-color` /
`--cursor-ring-hover-color` (Kül/Arduvaz → Kâğıt/Siyah).

## 7. İmza öğesi: 10 px sayfa çerçevesi

Tek bir sabit kutu, `--frame-size` kalınlığında `--surface-color` kenarlı, `pointer-events:
none`, `aria-hidden`. Header sekmeleri ve künye bu çerçeveden sarkar; çerçeve dışında süs öğesi
yoktur. Başka bir imza eklenmez (tek imza kuralı).

## 8. Öz-eleştiri (kalibrasyon listesine karşı)

| Kalıp | Sitede | Karar |
|---|---|---|
| #2 near-black zemin + tek parlak vurgu | Zemin near-black (`#0c0c0c`), vurgu yok | **Bilinçli**: vurgu rengi eklemiyoruz; near-black saf siyahtan yumuşak, fotoğraf ve metinle sert kontrast yaratmıyor. "Tek parlak vurgu" yarısı yok. |
| #3 kılçizgi + sıfır yarıçap "broadsheet" | Sıfır yarıçap her yerde; kılçizgiler blog diyagramı, rozet ve şerit ayırıcısında | **Bilinçli ama sınırlı**: sıfır yarıçap çerçeve imzasının devamı. Kılçizgi hero'da bir kez (kanıt satırının üstü) ve rayda bir kez; bölümleri ayırmak için çoğaltılmaz. |
| #5 BÜYÜK HARF etiketler, `→` ekli linkler | Hero rol satırı BÜYÜK HARF + harf aralığıydı; ikincil CTA `→` taşıyor | **Alışkanlık → değişti**: rol satırı cümle düzenine döndü. `→` yalnız tek kanıt linkinde kalır (sayfada bir kez, `aria-hidden`), başka linke eklenmez. |
| Ortada her şey | Hero metni sütununda ortalı bir kutuydu | **Değişti**: tek sol kenar, sütun içinde dikey ortalı. |
| Hareketli süs (kayan halka katmanları) | Hero düğmesinde 3 katman | **Kaldırıldı**: tek düğme stili; hareket yalnız imleç halkası ve tek tur dönen satırda. |

Aksesuar çıkarma turu: halka katmanları, menünün masaüstündeki tam ekran paneli, dört ayrı
çerçeve şeridi (tek kutu oldu) ve iki ayrı kılçizgi grisi (tek türetilmiş ton oldu) çıkarıldı.

## 9. İlkeler

1. **Önce içerik**: ilk ekranda isim, rol, ne yaptığı ve tek düğme; fotoğraf ikinci.
2. **Tek kaynak**: renk, ölçü, katman ve hareket yalnız token'dan; sosyal liste yalnız
   `SOCIAL_PROFILES`'tan; nav yalnız `NAV_ITEMS`'tan.
3. **Renkle değil, biçimle durum**: aktif = alt çizgi + `aria-current`; hover = alt çizgi ya da
   ofset gölge.
4. **İki dil eşit**: her metin iki sözlükte; TR etiketler daha uzun olduğu için 992 px'te iki
   dilde de taşma yok.
5. **Hareket isteğe bağlı**: `prefers-reduced-motion` açıkken hiçbir şey kendiliğinden hareket
   etmez; imleç halkası mount edilmez.

## 10. Sahip onayı

- [ ] Yön (monokrom editoryal, çerçeve imzası) onaylandı — tarih: ____ · not: ____
- [ ] Palet (5 renk + türetilmiş kılçizgi) onaylandı — tarih: ____
- [ ] Masaüstü nav ve künye sekmesi onaylandı — tarih: ____
- [ ] README atıf metni ve LICENSE (MIT, "Copyright (c) 2021 Ubai Mutl" korunuyor) — hukuki karar
  sahibindir — tarih: ____

Onay satırları sahip tarafından doldurulur; bu plan onaydan önce uygulanmıştır (feature branch,
geri alma: merge commit'ini revert).
