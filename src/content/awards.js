// Language-independent record of the hackathon archive (W13-DSG-portfolio-
// redesign). The text of each podium (event, place, project, summary, alt
// text) and its evidence links (`links`, each with the language of the linked
// page) live in src/content/{en,tr}/awards.js under the same id; this file
// holds what the page needs besides them. Pure ESM: the image pipeline
// (scripts/images/build-responsive.ts) reads it too.
//
//   id        the id of the award in src/content/{en,tr}/awards.js
//   rank      1, 2 or 3: the podium place. A record without a photo shows
//             this numeral in its picture box instead (decoration; the
//             place is in the text)
//   image     null, or { name } of the square responsive set in
//             public/img/awards (preset "award-<name>"), optionally with its
//             own `widths` when the source photo is smaller than the
//             default set (src/pages/portfolio/awardImage.js). Photos come
//             from the owner's own LinkedIn posts only; an organizer's or a
//             newspaper's picture is linked, never copied
//             (00-icerik-girdileri.md section 9)
//
// Same ids and order as the content files (tests/frontend/portfolio).
import { deepFreeze } from "./define.js";

export const AWARD_RECORDS = deepFreeze([
  {
    id: "convoai-2026",
    rank: 1,
    image: { name: "convoai-2026" },
  },
  {
    id: "hackstellar-2025",
    rank: 2,
    // The post's photo is 800x449: the square crop is 449 px.
    image: { name: "hackstellar-2025", widths: [320, 448] },
  },
  // No photo of the owner's own: Rise In's pictures stay theirs.
  { id: "algohack-2025", rank: 1, image: null },
  { id: "multiversx-2025", rank: 2, image: null },
  { id: "istanhack-2024", rank: 2, image: null },
  {
    id: "solana-mini-2024",
    rank: 3,
    image: { name: "solana-mini-2024" },
  },
  {
    id: "solana-demo-day-2023",
    rank: 3,
    image: { name: "solana-demo-day-2023" },
  },
  {
    id: "solana-mini-2023",
    rank: 2,
    image: { name: "solana-mini-2023" },
  },
  {
    id: "teknasyon-2022",
    rank: 1,
    image: { name: "teknasyon-2022" },
  },
  // The press photo belongs to the newspaper: the article is linked.
  { id: "social-cohesion-2021", rank: 1, image: null },
]);

/** The record of an award id, or undefined. */
export const awardRecord = (id) =>
  AWARD_RECORDS.find((record) => record.id === id);
