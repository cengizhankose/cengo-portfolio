# Provenance of the podium cover masters

Each master is a square at the largest output size (640 px), sRGB, without
metadata. `bun run images:build award-<name>` turns it into the AVIF and WebP
sets in `public/img/awards/` (`<name>-v1-{320,640}`). The six masters that were
here before (convoai-2026, hackstellar-2025, solana-*, teknasyon-2022) are not
listed: they are unchanged.

Rule: photos come from the owner's own LinkedIn posts. An organizer's or a
newspaper's picture is linked, never copied. The one exception is a designed
graphic (MultiversX below), which is not a photograph and is never described as
one.

URLs are copied as observed; the IDs were not edited. The expiring signature
parameters (`?e=...&v=...&t=...`) of the image URLs are left out.

## algohack-2025 (photo)

- Post: Cengizhan Köse's own LinkedIn post of 2025-10-03 (AlgoHack Istanbul,
  Algorand Foundation × Rise In, Farmin with Efe Akkurt):
  https://www.linkedin.com/posts/cengizhankose_hackathon-algorand-riseinn-ugcPost-7379814181509779456-zher/
  (short link: https://lnkd.in/p/d_6qGxY3)
- Image (third photo of the post, 2048×1365):
  https://media.licdn.com/dms/image/v2/D4D22AQF4zYqbwQRWdw/feedshare-image-high-res/B4DZmpd0kTJQAs-/0/1759484796597
- Crop: x 775, y 270, 688×688 px of the original, scaled to 640×640.
- Event check: the winners screen in the picture lists Farmin in first place;
  the post names the event and the team. The AlgoHack banners at the edges of
  the original are cropped out, so the crop shows four people (the owner and
  Efe Akkurt in the red hoodie among them) and the screen only. Who stands
  where is the owner's identification (Logan's brief), not read from the file.
- Not used: the post's caption wording (overall first, number of teams); the
  page keeps "1st place, Open Innovation Track".

## social-cohesion-2021 (photo)

- Post: Cengizhan Köse's own LinkedIn post of 2021-09-19 (Social Cohesion
  Innovation Hackathon, first place, with Buğrahan Çakır and Mehmet Ali İnce):
  https://www.linkedin.com/feed/update/urn:li:activity:6845384529444671488/
- Image (og:image of that post, 1108×1478):
  https://media.licdn.com/dms/image/v2/C4D22AQGfVUCKH1JxIg/feedshare-shrink_1280/feedshare-shrink_1280/0/1632066851467
- Crop: x 0, y 230, 1108×1108 px of the original, scaled to 640×640.
- Event check: the picture shows the first-team prize check and the
  "Teknoloji Hackathonu" backdrop of the event. It is the same scene as the
  480 px image of the same post. Not used: the press photos (Hürriyet,
  Ekonomim) and the image of the later post 6853822120028315648.

## multiversx-2025 (designed title card, NOT an event photo)

- The owner has no photo of this event: his LinkedIn photo gallery, his posts
  filtered by MultiversX and Avenrise and his X search had none, and Rise In's
  pictures stay theirs.
- The cover is an original graphic, `multiversx-2025.svg`: "#2", "Avenrise",
  "MultiversX Labs Xperience Hackathon", "2025", in white type on the site's
  dark theme colours with a hairline grid. It uses only facts of the award
  record; no logo, prize, teammate or date. The place is "#2" so the card reads
  the same in English and Turkish.
- Type: Marcellus and Raleway (SIL OFL, `public/fonts/v1/OFL.txt`), outlined to
  paths, so the SVG holds no text, font reference or raster.
- Rebuild: `bun scripts/images/build-title-card.ts` (writes the SVG and the
  640×640 `multiversx-2025.jpg`), then `bun run images:build award-multiversx-2025`.
- The record is flagged `graphic: true` in `src/content/awards.js`, and the alt
  text in both languages says it is a title card, not a photo.
