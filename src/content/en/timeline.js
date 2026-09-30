// EN page content, section "timeline" (T-12, FE-14). Written in
// W6-MKT-about-positioning (MKT-05, MKT-15, SEO-18): rows from
// 00-icerik-girdileri.md §3.2, outcomes from §3.1 (CV). src/content/tr/timeline.js
// has the same shape, the same ids and the same order.
//
//   id        stable, identical in every language
//   jobtitle  title, `where` the employer or school, `date` the label shown
//   start/end years for machines (SEO-07 JSON-LD); `end` is left out while
//             the role is ongoing (the section has no null: parity checks
//             walk every value). Years only: the CV and LinkedIn disagree on
//             the Fitmondo start month (§3.1), so no row shows a month.
//   outcome   one line of result per row (MKT-15 step 3). Employer work is
//             text only: no screenshots, no usage numbers (§4.3).
// Left out on purpose: "Gamer Pair" (a hackathon project, see the awards),
// "React Native Bootcamp Student" (education, told in the story) and the
// "Product Manager" suffix at MakasApp (the CV says Mobile Team Lead).
export default [
  {
    id: "drivee-fullstack",
    jobtitle: "Fullstack Engineer",
    where: "Drivee Teknoloji",
    date: "2026 – present",
    start: 2026,
    outcome:
      "REST APIs, scheduled jobs and device-to-CDN video workflows in an event-driven fleet platform, plus AI features and deployment pipelines.",
  },
  {
    id: "drivee-react-native",
    jobtitle: "Senior React Native Developer",
    where: "Drivee Teknoloji",
    date: "2024 – 2025",
    start: 2024,
    end: 2025,
    outcome:
      "Built the SafeCall fleet-safety app from scratch as its sole developer: live tracking, vehicle details, alerts and camera playback.",
  },
  {
    id: "monster-notebook",
    jobtitle: "Frontend Developer",
    where: "Monster Notebook",
    date: "2021 – 2024",
    start: 2021,
    end: 2024,
    outcome:
      "Worked on the Next.js rebuild of the main e-commerce site, built a survey product end to end and co-developed a LangChain chatbot.",
  },
  {
    id: "aiavatarim",
    jobtitle: "Co-Founder",
    where: "aiavatarim",
    date: "2022 – 2023",
    start: 2022,
    end: 2023,
    outcome:
      "Co-founded a SaaS that trained diffusion models on user photos to generate avatars in different styles.",
  },
  {
    id: "profo",
    jobtitle: "Co-Founder",
    where: "Profo",
    date: "2022 – 2023",
    start: 2022,
    end: 2023,
    outcome:
      "Designed the architecture and led a five-person team building workforce and task-allocation software; a factory pilot removed the need for dedicated tracking hardware.",
  },
  {
    id: "makasapp",
    jobtitle: "Mobile Team Lead",
    where: "MakasApp",
    date: "2020 – 2021",
    start: 2020,
    end: 2021,
    outcome:
      "Led a six-person team through a full rewrite of the mobile app with a new design and clean architecture.",
  },
  {
    id: "fitmondo",
    jobtitle: "React Native Developer",
    where: "Fitmondo",
    date: "2020 – 2021",
    start: 2020,
    end: 2021,
    outcome:
      "Built the auth, state management and networking foundations of a fitness-event and private-lesson app.",
  },
  {
    id: "beykoz-university",
    jobtitle: "BSc Software Engineering",
    where: "Beykoz University",
    date: "2019 – 2024",
    start: 2019,
    end: 2024,
    outcome:
      "Theatre club president and vice president of the computer engineering society.",
  },
];
