// EN interface text, namespace "portfolio" (T-12, FE-14). Keys are used as
// t("portfolio.<key>"); nested objects add dotted segments. Case text is in
// src/content/en/projects.js, podium text in awards.js, repo text in
// featuredRepos.js.
export default {
  title: "Portfolio",
  lead: "Three recent projects in depth, then the hackathon podiums since 2021.",
  // Shown only when no case is publishable (T-10 interim state).
  empty: "Case studies are being prepared.",
  emptyBlog: "Read the blog",
  emptyGithub: "See my code on GitHub",
  problem: "Problem",
  built: "What I built",
  result: "Result",
  stack: "Stack",
  // The hackathon section after the cases (W13); {count} is every podium
  // of the archive, IstanHack included.
  awards: {
    title: "Hackathons — {count} podiums since 2021",
    text: "From a solo 40-hour mobile build to Web3 and voice-AI prototypes.",
  },
  repos: {
    title: "Selected GitHub repos",
    learned: "What I learned:",
    all: "All repos on GitHub",
  },
  contact: {
    text: "Working on something similar?",
    cta: "Tell me what you’re building",
  },
  // Intro reel on the About page (MKT-18).
  reel: {
    title: "Intro reel",
    label: "15-second intro reel",
    fallback: "Your browser can’t play this video.",
  },
};
