// EN page content, section "about" (T-12, FE-14). Written in W6-MKT-about-positioning
// (MKT-05, MKT-15, SEO-18) from 00-icerik-girdileri.md; src/content/tr/about.js has
// the same shape. First person, facts only from the inputs file (§ in comments).
//
//   title     the lead line under the page title (MKT-15 step 1; §2.3, §5)
//   story     three short paragraphs: why, how, today (<= 60 words each;
//             MKT-15 step 2; §2.2, §3.1). No Drivee metric and no internal
//             system names until Drivee gives permission (§4.3, §10).
//   ventures  undated side projects under "Additional ventures" (recommended
//             default, §10): §3.1 rows "Tarihsiz". 777senselabs has no
//             description in the CV, so it has none here.
//   talks     talks and workshops, newest first (§5, last table)
export default {
  title:
    "6+ years of web and mobile products, startups I co-founded and 10 hackathon podiums.",
  story: [
    "I like owning a product end to end: the screen a user touches, the API behind it and the pipeline that ships it. That is why most of my work sits where web, mobile and backend meet.",
    "I started with React Native in 2020 at Fitmondo and a Kodluyoruz bootcamp, led a six-person mobile rewrite at MakasApp, spent almost four years on Monster Notebook’s e-commerce frontend and co-founded Profo and aiavatarim along the way.",
    "Today I am a Fullstack Engineer at Drivee Teknoloji. I built its SafeCall mobile app as the sole developer and now work on APIs, video workflows and AI features. Outside work I build hackathon prototypes: ten podiums since 2021, four of them first place.",
  ],
  ventures: [
    {
      id: "hypercut",
      name: "HyperCut",
      role: "Technical Co-Founder",
      description:
        "A template-based video editing product: mobile app, backend, template render flows and an admin panel, built by a two-person engineering team.",
    },
    {
      id: "courline",
      name: "Courline",
      role: "Courliner mobile app",
      description:
        "An on-device location cache for outdoor advertising on motorcycles that syncs once a connection returns, deployed end to end with Dokploy.",
    },
    {
      id: "777senselabs",
      name: "777senselabs",
      role: "CTO",
    },
  ],
  talks: [
    {
      id: "veta-2026",
      event:
        "Yeditepe University IEEE CS, VETA Summit: workshop “Build Your Personal Brand in the Age of AI”",
      year: 2026,
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7458085657467355136/",
    },
    {
      id: "beykoz-job-fair-2024",
      event: "Beykoz University Job Fair’24: speaker",
      year: 2024,
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7278289690711969792/",
    },
    {
      id: "emkariyer-2024",
      event:
        "İSÜ Energy and Engineering Club, EMKariyer: “Effective GitHub Usage”",
      year: 2024,
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7257713806200500224/",
    },
    {
      id: "eestec-ideathon-2024",
      event: "İTÜ EESTEC LC Istanbul Ideathon: instructor on MVPs and roadmaps",
      year: 2024,
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7174777771032788992/",
    },
    {
      id: "ieee-frontend-2024",
      event: "IEEE Yeditepe CS: three-week frontend course",
      year: 2024,
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7171789878475538432/",
    },
    {
      id: "dau-git-2023",
      event: "DAÜ Software and AI Club: Git and GitHub training as instructor",
      year: 2023,
      url: "https://www.linkedin.com/feed/update/urn:li:share:7139996070100611072/",
    },
  ],
};
