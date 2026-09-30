// EN page content, section "proof" (T-12, FE-14): what the ProofStrip shows
// (MKT-04, src/components/proofstrip). src/content/tr/proof.js has the same
// shape.
//
//   companies     employers as plain text, no logos (employer permission,
//                 00-icerik-girdileri.md §4.3); no link: no company URL is in
//                 the inputs file
//   awards        the four first places, taken from the archive in awards.js
//                 by id so a fact lives in one place (MKT-04 step 4)
//   testimonials  [{ id, quote, name, role, company, url? }]. Empty: there is
//                 no named, permitted reference yet (§6), so the strip shows
//                 none and never invents one. The strip renders the block only
//                 from two complete entries (recommended default), and MKT-04
//                 stays open until they arrive.
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
