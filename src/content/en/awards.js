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
//   project  the project name
//   hidden   true while a record is not shown on the page. IstanHack 2024 has
//            no record outside the CV (label DY in §5); the recommended default
//            is hidden (§10). It still counts in "10 podiums".
//   summary   1-2 sentences for the podium on the portfolio page (W13), drawn
//             from the owner's post and §4.2/§5; teammates only as the owner
//             credited them
//   imageAlt  alternative text of the podium photo, only for a record with an
//             image in src/content/awards.js (photos from the owner's posts;
//             the one title card, `graphic`, says it is a graphic, not a photo)
//   links     [{ label, url, hreflang? }]: the public evidence (an organizer
//             post, a press article or the owner's own post), left out when
//             there is none: nothing is linked that was not verified (§5).
//             The first link is the main evidence: the About archive and the
//             ProofStrip link the record to it. `label` is the link text (<= 36
//             characters), in English with "(TR)" when the linked page is
//             Turkish only; `hreflang` "en" or "tr" when the linked page is in
//             one language only, left out for a bilingual page (never null:
//             the parity walker of tests/frontend/i18n takes no null). `url`
//             and `hreflang` are the same in both languages, in the same order
export default [
  {
    id: "convoai-2026",
    event: "ConvoAI World Istanbul (Agora Voice AI Hackathon)",
    year: 2026,
    place: "1st place",
    project: "SalesGym",
    summary:
      "SalesGym, a training platform where AI agents play realistic buyers, progress is measured and managers get a dashboard. I built it alone in eight hours.",
    imageAlt:
      "Me biting the giant Sales Gym prize check in front of the ConvoAI World Istanbul screen.",
    links: [
      {
        label: "My post on LinkedIn",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:7420909334194434049/",
      },
      {
        label: "My post on X",
        url: "https://x.com/cengzhnkse/status/2015134325902041451",
        hreflang: "en",
      },
    ],
  },
  {
    id: "hackstellar-2025",
    event: "HackStellar Istanbul (Stellar × Rise In)",
    year: 2025,
    place: "2nd place",
    project: "reset",
    summary:
      "With Efe Akkurt I built reset, Farmin’s idea of yields with risk scores and insurance carried over to Stellar, at ARDVENTURE in Maslak; we finished second.",
    imageAlt:
      "Three of us between the HackStellar Hackathon Istanbul banners at ARDVENTURE; I’m on the left.",
    links: [
      {
        label: "My post on LinkedIn (TR)",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:7406226922319376385/",
        hreflang: "tr",
      },
      {
        label: "Organizer’s post",
        url: "https://www.linkedin.com/posts/risein_hackstellar-hackathon-winners-activity-7401250445479972866-AclP",
        hreflang: "en",
      },
      {
        label: "Rise In on X",
        url: "https://x.com/riseinweb3/status/1995473145453572163",
        hreflang: "en",
      },
    ],
  },
  {
    id: "algohack-2025",
    event: "AlgoHack Istanbul (Algorand Foundation × Rise In)",
    year: 2025,
    place: "1st place, Open Innovation Track",
    project: "Farmin",
    summary:
      "Farmin, built with Efe Akkurt over a 36-hour weekend, won the Open Innovation Track and its $2,500 prize.",
    imageAlt:
      "Four people in front of the winners screen, which lists Farmin in first place.",
    links: [
      {
        label: "Organizer’s recap",
        url: "https://www.risein.com/blog/algohack-istanbul-the-weekend-builders-took-over-the-city",
        hreflang: "en",
      },
      {
        label: "Rise In on LinkedIn",
        url: "https://www.linkedin.com/pulse/algohack-istanbul-weekend-builders-took-over-city-risein-2dznf",
        hreflang: "en",
      },
    ],
  },
  {
    id: "multiversx-2025",
    event: "MultiversX Labs Xperience Hackathon (Rise In)",
    year: 2025,
    place: "2nd place",
    project: "Avenrise",
    summary:
      "Rise In’s winners post named Avenrise, my entry, second of the three winning projects.",
    imageAlt:
      "Designed title card, not a photo: “#2 Avenrise” in white type on a dark grid, with MultiversX Labs Xperience Hackathon and 2025 below.",
    links: [
      {
        label: "Organizer’s post",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:7310203306436395008/",
        hreflang: "en",
      },
      {
        label: "Rise In on X",
        url: "https://x.com/riseinweb3/status/1896580848927064441",
        hreflang: "en",
      },
    ],
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
    summary:
      "Codadux, a Solana platform where developers learn, show their skills and earn rewards, built alone in 30 hours: third place and $1,000.",
    imageAlt:
      "Me in a boxer’s stance on the Superteam stage, between the Solana and Superteam neon signs.",
    links: [
      {
        label: "My post on LinkedIn (TR)",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:7172850511556153344/",
        hreflang: "tr",
      },
      {
        label: "My post on X (TR)",
        url: "https://x.com/cengzhnkse/status/1767085517991039147",
        hreflang: "tr",
      },
    ],
  },
  {
    id: "solana-demo-day-2023",
    event: "Solana Demo Day (Superteam TR)",
    year: 2023,
    place: "3rd place",
    project: "ScheduleIt",
    summary:
      "Kaan Mert Koç and I presented ScheduleIt, our entry to the global Solana Hyperdrive hackathon, at Superteam Turkey’s Demo Day and placed third of 43 teams.",
    imageAlt:
      "Kaan Mert Koç (left) and me in front of the Superteam Turkey banner.",
    links: [
      {
        label: "My post on LinkedIn (TR)",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:7122167244377239553/",
        hreflang: "tr",
      },
    ],
  },
  {
    id: "solana-mini-2023",
    event: "Solana Mini Hackathon (Superteam TR)",
    year: 2023,
    place: "2nd place",
    project: "ScheduleIt",
    summary:
      "ScheduleIt, a cloud workflow automation tool with Web3 integration, built with Kaan Mert Koç, took second place.",
    imageAlt:
      "Me with my fists up next to the Superteam Turkey banner and the Superteam neon sign.",
    links: [
      {
        label: "My post on LinkedIn (TR)",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:7106681953436786688/",
        hreflang: "tr",
      },
      {
        label: "My post on X (TR)",
        url: "https://x.com/cengzhnkse/status/1700916623647928770",
        hreflang: "tr",
      },
    ],
  },
  {
    id: "teknasyon-2022",
    event: "Teknasyon Yüzük Kardeşliği Hackathon",
    year: 2022,
    place: "1st place, solo",
    project: "Shuddy",
    summary:
      "Shuddy, a real-time shopping app in React Native and Firebase. I built it, its business plan and its design alone in 40 hours; first of 13 teams.",
    imageAlt:
      "Me holding the Teknasyon Hackathon’22 first-place prize check between cardboard figures of Frodo and Gandalf.",
    links: [
      {
        label: "My post on LinkedIn (TR)",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:6977326538954321920/",
        hreflang: "tr",
      },
      {
        label: "My post on X (TR)",
        url: "https://x.com/cengzhnkse/status/1569719858891493378",
        hreflang: "tr",
      },
      {
        label: "After the win on X (TR)",
        url: "https://x.com/cengzhnkse/status/1571534565394599942",
        hreflang: "tr",
      },
    ],
  },
  {
    id: "social-cohesion-2021",
    event: "Social Cohesion Innovation Hackathon (GSB × UNDP × Habitat)",
    year: 2021,
    place: "1st place",
    project: "Game Pair",
    summary:
      "Game Pair, a technology project for social cohesion, won this 52-hour hackathon of the Ministry of Youth and Sports, UNDP and Habitat.",
    imageAlt:
      "Me on stage holding the giant first-team prize check of the Technology Hackathon in front of the green event screen.",
    links: [
      {
        label: "News story in Hürriyet (TR)",
        url: "https://www.hurriyet.com.tr/egitim/universite-ogrencilerine-bm-odulu-41910191",
        hreflang: "tr",
      },
      {
        label: "News in Ekonomim (TR)",
        url: "https://www.ekonomim.com/genc-dunya/universite-ogrencilerine-birlesmis-milletlerden-odul-haberi-636094",
        hreflang: "tr",
      },
      {
        label: "My university’s announcement (TR)",
        url: "https://www.beykoz.edu.tr/haber/3541-yazilim-muhendisligi-ogrencileri-sosyal-uyum-ve-inovatif-cozumler-hackathonunda-birinci-oldu",
        hreflang: "tr",
      },
      {
        label: "My post on LinkedIn (TR)",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:6845384529444671488/",
        hreflang: "tr",
      },
      {
        label: "Sharing the news (TR)",
        url: "https://www.linkedin.com/feed/update/urn:li:activity:6853822120028315648/",
        hreflang: "tr",
      },
    ],
  },
];
