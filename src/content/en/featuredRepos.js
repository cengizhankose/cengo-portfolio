// EN page content, section "featuredRepos" (T-12, FE-14, MKT-18): the text of
// "Selected GitHub repos" on the portfolio page. Same ids and order as
// FEATURED_REPOS in src/content/projects.js (which holds the URLs) and as
// src/content/tr/featuredRepos.js.
//
//   name     the repository name
//   what     what it is, from the README (00-icerik-girdileri.md §4.2-F)
//   learned  one sentence on what the project taught; it can only come from
//            the owner, so it is left out until he writes it (never a
//            placeholder). The page prints it when it is there.
export default [
  {
    id: "voxly",
    name: "Voxly",
    what: "A macOS menu-bar dictation app that runs whisper.cpp locally (Swift, Metal).",
  },
  {
    id: "road_to_doomsday",
    name: "Road to Doomsday",
    what: "A PWA for two people to track the 63-title MCU catalogue together, with web push and account-free invites.",
  },
  {
    id: "bubble_writer",
    name: "Bubble Writer",
    what: "A terminal typing game written in Go with Bubble Tea.",
  },
];
