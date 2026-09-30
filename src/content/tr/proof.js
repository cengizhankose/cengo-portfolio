// TR page content, section "proof" (T-12, FE-14). Same shape as
// src/content/en/proof.js; the awards come from the TR archive by id.
import awards from "./awards.js";

const FIRST_PLACES = [
  "convoai-2026",
  "algohack-2025",
  "teknasyon-2022",
  "social-cohesion-2021",
];

const byId = new Map(awards.map((award) => [award.id, award]));

export default {
  companies: [
    { name: "Monster Notebook" },
    { name: "Drivee Teknoloji" },
    { name: "MakasApp" },
    { name: "Fitmondo" },
  ],
  awards: FIRST_PLACES.map((id) => {
    const award = byId.get(id);
    if (!award) throw new Error(`proof: unknown award id "${id}"`);
    return award;
  }),
  testimonials: [],
};
