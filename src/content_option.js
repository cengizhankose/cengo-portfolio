import { SOCIAL_PROFILES } from "./seo/site.js";

// Page titles and descriptions are not here: they come from src/seo/pages.js
// (T-03, SEO-09, MKT-21).
const logotext = "CENGO";

const introdata = {
  title: "I’m Cengizhan Köse",
  animated: {
    first: "I love coding and designing",
    second: "I have some startup projects",
    third: "I develop high-quality products",
  },
  description:
    "I’m a full-stack developer / part-time entrepreneur, currently working in Turkey.",
  your_img_url:
    "https://github.com/cengizhankose/cengo-portfolio/blob/main/src/assets/images/photo.JPG?raw=true",
};

const dataabout = {
  title: "A bit about myself",
  aboutme:
    "I’m a full-stack developer / part-time entrepreneur, currently working in Turkey. I love coding and designing. I won two hackathons and I have two startup projects that I work on with my partners and teams, and I’m the CTO of another one. I develop high-quality products and I love to work with new technologies.",
};
const worktimeline = [
  {
    jobtitle: "Frontend Developer",
    where: "Monster Notebook",
    date: "2021-current",
  },
  {
    jobtitle: "Co-Founder",
    where: "Profo",
    date: "2022-current",
  },
  {
    jobtitle: "Co-Founder",
    where: "Gamer Pair",
    date: "2021-2022",
  },
  {
    jobtitle: "React Native Developer",
    where: "Fitmondo",
    date: "2020-2021",
  },
  {
    jobtitle: "Mobile Team Lead & Product Manager",
    where: "MakasApp",
    date: "2020-2021",
  },
  {
    jobtitle: "React Native Bootcamp Student",
    where: "Kodluyoruz",
    date: "2020",
  },
];

const skills = [
  {
    name: "JavaScript",
    value: 90,
  },
  {
    name: "React Native",
    value: 85,
  },
  {
    name: "React",
    value: 80,
  },
  {
    name: "Flutter",
    value: 60,
  },
  {
    name: "Figma",
    value: 85,
  },
];

const services = [
  {
    title: "Cross-platform mobile app development",
    description:
      "Beautiful, high-quality mobile apps for both Android and iOS, built with React Native and Flutter.",
  },
  {
    title: "Management",
    description:
      "I can manage your projects and teams and help you achieve your goals.",
  },
  {
    title: "Full-stack web development",
    description:
      "Modern, high-quality websites and web apps built with React and Node.js.",
  },
  {
    title: "UI & UX design",
    description:
      "Cool and modern UI/UX designs for your mobile apps and websites.",
  },
];

const contactConfig = {
  YOUR_EMAIL: "kose651@gmail.com",
  description:
    "Feel free to contact me about web and mobile projects. I can develop high-quality products for your business needs.",
  // EmailJS IDs and the public key are public by design (they ship in the
  // bundle). Abuse is limited in the EmailJS panel (allowed domains) and by
  // the SDK options in src/pages/contact (SEC-24).
  YOUR_SERVICE_ID: "service_5i3xexc",
  YOUR_TEMPLATE_ID: "template_w4youof",
  YOUR_PUBLIC_KEY: "aPMkFJ3oavgGNOmn3",
  // Form status messages (MKT-09, FE-36, DSG-23). FE-14 moves them to the
  // i18n dictionaries under the same keys (contact.success, contact.error,
  // contact.rateLimited, contact.emailMe). `{emailMe}` is replaced by a
  // mailto: link whose text is `emailMe`.
  messages: {
    success: "Message sent. I’ll reply to your email shortly.",
    error: "Your message couldn’t be sent. Please try again or {emailMe}.",
    rateLimited:
      "You can send one message every 30 seconds. Wait a moment and try again, or {emailMe}.",
    emailMe: "email me directly",
  },
};

// { id: url } in K-11 order, derived from the single list in src/seo/site.js
// (no Facebook). `twitter` is a non-enumerable alias of `x` for components
// that still read the old key; it never shows up when iterating.
const socialprofils = Object.fromEntries(
  SOCIAL_PROFILES.map(({ id, url }) => [id, url]),
);
Object.defineProperty(socialprofils, "twitter", {
  value: socialprofils.x,
  enumerable: false,
});

export {
  dataabout,
  worktimeline,
  skills,
  services,
  introdata,
  contactConfig,
  socialprofils,
  logotext,
};
