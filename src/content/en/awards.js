// EN page content, section "awards" (T-12, FE-14): the hackathon archive on
// /about#awards, newest first (MKT-04 step 5, 00-icerik-girdileri.md §5: ten
// podiums since 2021, four of them first place). src/content/tr/awards.js has
// the same shape, the same ids and the same order.
//
//   id       stable, identical in every language (ANL-19, proof.awards)
//   event    event name as the organizer writes it. SalesGym's event is named
//            two ways (the Agora repo: "Voice AI Hackathon Istanbul", the CV:
//            "ConvoAI World Istanbul", §4.1); both names are kept
//   year     the year only: the sources disagree on months (§5)
//   place    the result; Farmin keeps the organizer's wording, never "among 25
//            teams" (§5, inconsistencies)
//   project  the project name; `url` the public evidence (an organizer post,
//            a press article or the owner's own post), left out when there is
//            none: nothing is linked that was not verified (§5)
//   hidden   true while a record is not shown on the page. IstanHack 2024 has
//            no record outside the CV (label DY in §5); the recommended default
//            is hidden (§10). It still counts in "10 podiums".
export default [
  {
    id: "convoai-2026",
    event: "ConvoAI World Istanbul (Agora Voice AI Hackathon)",
    year: 2026,
    place: "1st place",
    project: "SalesGym",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7420909334194434049/",
  },
  {
    id: "hackstellar-2025",
    event: "HackStellar Istanbul (Stellar × Rise In)",
    year: 2025,
    place: "2nd place",
    project: "reset",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7406226922319376385/",
  },
  {
    id: "algohack-2025",
    event: "AlgoHack Istanbul (Algorand Foundation × Rise In)",
    year: 2025,
    place: "1st place, Open Innovation Track",
    project: "Farmin",
    url: "https://www.risein.com/blog/algohack-istanbul-the-weekend-builders-took-over-the-city",
  },
  {
    id: "multiversx-2025",
    event: "MultiversX Labs Xperience Hackathon (Rise In)",
    year: 2025,
    place: "2nd place",
    project: "Avenrise",
  },
  {
    id: "istanhack-2024",
    event: "IstanHack, Infrastructure track",
    year: 2024,
    place: "2nd place",
    hidden: true,
  },
  {
    id: "solana-mini-2024",
    event: "Solana Mini Hackathon (Superteam TR)",
    year: 2024,
    place: "3rd place",
    project: "Codadux",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7172850511556153344/",
  },
  {
    id: "solana-demo-day-2023",
    event: "Solana Demo Day (Superteam TR)",
    year: 2023,
    place: "3rd place",
    project: "ScheduleIt",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7122167244377239553/",
  },
  {
    id: "solana-mini-2023",
    event: "Solana Mini Hackathon (Superteam TR)",
    year: 2023,
    place: "2nd place",
    project: "ScheduleIt",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7106681953436786688/",
  },
  {
    id: "teknasyon-2022",
    event: "Teknasyon Yüzük Kardeşliği Hackathon",
    year: 2022,
    place: "1st place, solo",
    project: "Shuddy",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:6977326538954321920/",
  },
  {
    id: "social-cohesion-2021",
    event: "Social Cohesion Innovation Hackathon (GSB × UNDP × Habitat)",
    year: 2021,
    place: "1st place",
    project: "Game Pair",
    url: "https://www.hurriyet.com.tr/egitim/universite-ogrencilerine-bm-odulu-41910191",
  },
];
