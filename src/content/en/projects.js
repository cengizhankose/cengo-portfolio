// EN page content, section "projects" (T-12, FE-14): the text of the
// portfolio cards (FE-04 Aşama B, DSG-08, MKT-01). One entry per case that
// src/content/projects.js publishes, same ids and order as that registry and
// as src/content/tr/projects.js. Facts come from 00-icerik-girdileri.md §4.1;
// nothing is stored for a candidate that is waiting for permission or
// confirmation (ids safecall_mobile, trinqa, atlas_steward, cycase).
//
//   title       card heading (<= 60 characters)
//   awardLabel  one-line badge above the title, only when there is a podium
//               (<= 56 characters); kept short, the result sentence says more
//   problem / role / result   the three lines of the card
//   cta         link labels by link type (<= 28 characters); the arrow is
//               drawn by the page
//   imageAlt    alternative text; added in the same commit as the image
//
// Farmin: the organizer's wording (Open Innovation Track), never "first among
// 25 teams" (§5). SalesGym: the event is named both ways, as the CV and the
// Agora repository write it (§4.1).
export default [
  {
    id: "salesgym",
    title: "SalesGym — AI sales practice on live video",
    awardLabel: "1st place · ConvoAI World Istanbul · 2026",
    problem:
      "Sales training is expensive and inconsistent, and role-play with colleagues rarely feels like a real buyer.",
    role: "Sole developer: Next.js client, Python (Flask) backend, AI buyer personas on real-time video with Agora ConvoAI, scoring and a manager view.",
    result:
      "1st place at ConvoAI World Istanbul (Agora Voice AI Hackathon), January 2026; built in eight hours.",
    cta: { repo: "View the code", demo: "Watch the demo" },
  },
  {
    id: "farmin",
    title: "Farmin — DeFi yields with risk scores",
    awardLabel: "1st place · AlgoHack Istanbul, Open Innovation · 2025",
    problem:
      "DeFi yield opportunities are scattered across protocols and their risks are hard to compare.",
    role: "Technical lead and backend developer, built with Efe Akkurt: protocol adapters, Algorand smart contracts, risk scoring and an insurance flow.",
    result:
      "1st place, Open Innovation Track, AlgoHack Istanbul (Algorand Foundation × Rise In), 2025, with a $2,500 prize. The follow-up, reset, took 2nd place at HackStellar Istanbul.",
    cta: { repo: "View on GitHub", post: "Read the organizer’s recap" },
  },
  {
    id: "effort_lab",
    title: "Effort Lab — Opus 5.5 vs Sonnet 5.5",
    problem:
      "With the same prompt and model, how do output, build time and file size change when only the effort level changes?",
    role: "Sole author: designed the experiment, generated and measured all 12 builds and built the comparison site.",
    result:
      "12 landing pages (two models × six effort levels) side by side; Opus 5.5 went from 2 min 17 s and 33 KB at low to 2 h 33 min and 140 KB at ultracode.",
    cta: { demo: "Open the comparison (TR)" },
  },
];
