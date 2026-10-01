// EN page content, section "projects" (T-12, FE-14): the text of the
// portfolio cases (FE-04 Aşama B, DSG-08, MKT-01, W13). One entry per case
// that src/content/projects.js publishes, same ids and order as that registry
// and as src/content/tr/projects.js. Facts come from 00-icerik-girdileri.md
// §4.1 and the projects' own READMEs (SalesGym in Agora's hackathon
// repository, cengizhankose/farmin) and comparison site; nothing is stored
// for a candidate that is waiting for permission or confirmation (ids
// safecall_mobile, trinqa, atlas_steward, cycase).
//
//   title       case heading (<= 60 characters)
//   awardLabel  one-line badge above the title, only when there is a podium
//               (<= 56 characters); kept short, the result sentence says more
//   summary     what the project is, in one sentence (<= 180 characters)
//   problem / built / result   the three facts of the case: the problem,
//               what I built and my part in it, the result with its proof
//   cta         link labels by link type (<= 28 characters); the arrow is
//               drawn by the page
//   imageAlt    alternative text of the case image (README screenshot or
//               the live site); added in the same commit as the image
//
// Farmin: the organizer's wording (Open Innovation Track), never "first among
// 25 teams" (§5). SalesGym: the event is named both ways, as the CV and the
// Agora repository write it (§4.1).
export default [
  {
    id: "salesgym",
    title: "SalesGym — AI sales practice on live video",
    awardLabel: "1st place · ConvoAI World Istanbul · 2026",
    summary:
      "A sales training platform: reps practise calls with AI buyer personas on live video and are scored while they talk.",
    problem:
      "Sales training is expensive and inconsistent, and role-play with colleagues rarely feels like a real buyer.",
    built:
      "Everything, as the sole developer: a Next.js 16 client and a Python (Flask) backend that start an Agora ConvoAI agent for each session (ARES speech-to-text, a Groq LLM, MiniMax voice, an Akool video avatar). Four buyer personas, five scenarios from a cold call to the close, a live transcript, a score per skill, XP and a manager view.",
    result:
      "1st place at ConvoAI World Istanbul (Agora Voice AI Hackathon), January 2026; built in eight hours.",
    cta: { repo: "View the code", demo: "Watch the demo" },
    imageAlt:
      "SalesGym live session: an AI buyer avatar on video, my camera in the corner and a score panel for discovery questions, objection handling, rapport and closing.",
  },
  {
    id: "farmin",
    title: "Farmin — DeFi yields with risk scores",
    awardLabel: "1st place · AlgoHack Istanbul, Open Innovation · 2025",
    summary:
      "A DeFi yield aggregator on Algorand: opportunities from several protocols in one view, each with a risk score, an insurance option and one-click deposits.",
    problem:
      "DeFi yield opportunities are scattered across protocols and their risks are hard to compare.",
    built:
      "Technical lead and backend developer, built with Efe Akkurt. A pnpm monorepo: a Next.js 15 app, an adapter layer that normalises protocol data (DefiLlama first), scores risk and caches it in SQLite, and Algorand smart contracts, a TEAL router with an ARC-4 ABI, for deposits and withdrawals.",
    result:
      "1st place, Open Innovation Track, AlgoHack Istanbul (Algorand Foundation × Rise In), 2025, with a $2,500 prize. The follow-up, reset, took 2nd place at HackStellar Istanbul.",
    cta: { repo: "View on GitHub", post: "Read the organizer’s recap" },
    imageAlt:
      "Farmin pool page: APR, TVL and a 30-day performance chart, a deposit calculator, a risk analysis scored 27 out of 100 and the yield insurance switch.",
  },
  {
    id: "effort_lab",
    title: "Effort Lab — Opus 5.5 vs Sonnet 5.5",
    summary:
      "One prompt, a single-file landing page for a fitness app, run on two Claude models at six effort levels, with all 12 results on one site.",
    problem:
      "With the same prompt and model, how do output, build time and file size change when only the effort level changes?",
    built:
      "Sole author: I ran the prompt in Claude Code on Opus 5.5 and Sonnet 5.5 at low, medium, high, xhigh, max and ultracode, timed every run and built the comparison site, with ⌘K search and any two outputs stacked under a drag divider.",
    result:
      "12 landing pages side by side; Opus 5.5 went from 2 min 17 s and 33 KB at low to 2 h 33 min and 140 KB at ultracode, Sonnet 5.5 from 1 min 52 s and 43 KB to 1 h 22 min and 92 KB.",
    cta: { demo: "Open the comparison (TR)" },
    imageAlt:
      "The comparison site: the same fitness landing page by Opus 5.5 at low effort (2:17) left of the drag divider and at ultracode (2:33:47) right of it.",
  },
];
