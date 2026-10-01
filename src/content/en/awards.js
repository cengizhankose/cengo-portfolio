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
//   summary   1-2 sentences for the podium on the portfolio page (W13), drawn
//             from the owner's post and §4.2/§5; teammates only as the owner
//             credited them
//   imageAlt  alternative text of the podium photo, only for a record with an
//             image in src/content/awards.js (photos from the owner's posts)
//   linkLabel the text of the evidence link (<= 32 characters); "(TR)" when
//             the linked page is Turkish only
export default [
  {
    id: "convoai-2026",
    event: "ConvoAI World Istanbul (Agora Voice AI Hackathon)",
    year: 2026,
    place: "1st place",
    project: "SalesGym",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7420909334194434049/",
    summary:
      "SalesGym, a training platform where AI agents play realistic buyers, progress is measured and managers get a dashboard. I built it alone in eight hours.",
    imageAlt:
      "Me biting the giant Sales Gym prize check in front of the ConvoAI World Istanbul screen.",
    linkLabel: "My post on LinkedIn",
  },
  {
    id: "hackstellar-2025",
    event: "HackStellar Istanbul (Stellar × Rise In)",
    year: 2025,
    place: "2nd place",
    project: "reset",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7406226922319376385/",
    summary:
      "With Efe Akkurt I built reset, Farmin’s idea of yields with risk scores and insurance carried over to Stellar, at ARDVENTURE in Maslak; we finished second.",
    imageAlt:
      "Three of us between the HackStellar Hackathon Istanbul banners at ARDVENTURE; I’m on the left.",
    linkLabel: "My post on LinkedIn (TR)",
  },
  {
    id: "algohack-2025",
    event: "AlgoHack Istanbul (Algorand Foundation × Rise In)",
    year: 2025,
    place: "1st place, Open Innovation Track",
    project: "Farmin",
    url: "https://www.risein.com/blog/algohack-istanbul-the-weekend-builders-took-over-the-city",
    summary:
      "Farmin, built with Efe Akkurt over a 36-hour weekend, won the Open Innovation Track and its $2,500 prize.",
    linkLabel: "Organizer’s recap",
  },
  {
    id: "multiversx-2025",
    event: "MultiversX Labs Xperience Hackathon (Rise In)",
    year: 2025,
    place: "2nd place",
    project: "Avenrise",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7310203306436395008/",
    summary:
      "Rise In’s winners post named Avenrise, my entry, second of the three winning projects.",
    linkLabel: "Organizer’s post",
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
    summary:
      "Codadux, a Solana platform where developers learn, show their skills and earn rewards, built alone in 30 hours: third place and $1,000.",
    imageAlt:
      "Me in a boxer’s stance on the Superteam stage, between the Solana and Superteam neon signs.",
    linkLabel: "My post on LinkedIn (TR)",
  },
  {
    id: "solana-demo-day-2023",
    event: "Solana Demo Day (Superteam TR)",
    year: 2023,
    place: "3rd place",
    project: "ScheduleIt",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7122167244377239553/",
    summary:
      "Kaan Mert Koç and I presented ScheduleIt, our entry to the global Solana Hyperdrive hackathon, at Superteam Turkey’s Demo Day and placed third of 43 teams.",
    imageAlt:
      "Kaan Mert Koç (left) and me in front of the Superteam Turkey banner.",
    linkLabel: "My post on LinkedIn (TR)",
  },
  {
    id: "solana-mini-2023",
    event: "Solana Mini Hackathon (Superteam TR)",
    year: 2023,
    place: "2nd place",
    project: "ScheduleIt",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7106681953436786688/",
    summary:
      "ScheduleIt, a cloud workflow automation tool with Web3 integration, built with Kaan Mert Koç, took second place.",
    imageAlt:
      "Me with my fists up next to the Superteam Turkey banner and the Superteam neon sign.",
    linkLabel: "My post on LinkedIn (TR)",
  },
  {
    id: "teknasyon-2022",
    event: "Teknasyon Yüzük Kardeşliği Hackathon",
    year: 2022,
    place: "1st place, solo",
    project: "Shuddy",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:6977326538954321920/",
    summary:
      "Shuddy, a real-time shopping app in React Native and Firebase. I built it, its business plan and its design alone in 40 hours; first of 13 teams.",
    imageAlt:
      "Me holding the Teknasyon Hackathon’22 first-place prize check between cardboard figures of Frodo and Gandalf.",
    linkLabel: "My post on LinkedIn (TR)",
  },
  {
    id: "social-cohesion-2021",
    event: "Social Cohesion Innovation Hackathon (GSB × UNDP × Habitat)",
    year: 2021,
    place: "1st place",
    project: "Game Pair",
    url: "https://www.hurriyet.com.tr/egitim/universite-ogrencilerine-bm-odulu-41910191",
    summary:
      "Game Pair, a technology project for social cohesion, won this 52-hour hackathon of the Ministry of Youth and Sports, UNDP and Habitat.",
    linkLabel: "News story in Hürriyet (TR)",
  },
];
