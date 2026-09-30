import { SOCIAL_PROFILES } from "./seo/site.js";

// Page titles and descriptions are not here: they come from src/seo/pages.js
// (T-03, SEO-09, MKT-21).
const logotext = "CENGO";

const introdata = {
  title: "I’m Cengizhan Köse",
  animated: {
    first: "I love coding and designing",
    second: "I have some startup projects",
    third: "I develop high quality products",
  },
  description:
    "I’m a Full stack developer / Part time Entrepreneur ,currently working in Turkey",
  your_img_url:
    "https://github.com/cengizhankose/cengo-portfolio/blob/main/src/assets/images/photo.JPG?raw=true",
};

const dataabout = {
  title: "abit about my self",
  aboutme:
    "I’m a Full stack developer / Part time Entrepreneur ,currently working in Turkey. I love coding and designing. I won two hackathons and i have two startup projects that i work with my partners and teams and CTO of another one. I develop high quality products and i love to work with new technologies.",
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
    title: "Cross Platform Mobile App Development",
    description:
      "Beautiful and high quality mobile apps for both Android and iOS Built with React Native and Flutter",
  },
  {
    title: "Management",
    description:
      "I can manage your projects and teams and help you to achieve your goals",
  },
  {
    title: "Fullstack Web Development",
    description:
      "Modern and high quality websites and web apps built with React and Node.js",
  },
  {
    title: "UI & UX Design",
    description:
      "Cool and modern UI/UX designs for your mobile apps and websites",
  },
];

const dataportfolio = [
  {
    img: "https://picsum.photos/400/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
  {
    img: "https://picsum.photos/400/800/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
  {
    img: "https://picsum.photos/400/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
  {
    img: "https://picsum.photos/400/600/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
  {
    img: "https://picsum.photos/400/300/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
  {
    img: "https://picsum.photos/400/700/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },

  {
    img: "https://picsum.photos/400/600/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
  {
    img: "https://picsum.photos/400/300/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
  {
    img: "https://picsum.photos/400/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
  {
    img: "https://picsum.photos/400/550/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
  {
    img: "https://picsum.photos/400/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
  {
    img: "https://picsum.photos/400/700/?grayscale",
    desctiption:
      "The wisdom of life consists in the elimination of non-essentials.",
    link: "#",
  },
];

const contactConfig = {
  YOUR_EMAIL: "kose651@gmail.com",
  description:
    "Feel free to contact me about web to mobile project. I can develop high quality products for your business needs. ",
  YOUR_SERVICE_ID: "service_5i3xexc",
  YOUR_TEMPLATE_ID: "template_w4youof",
  YOUR_USER_ID: "aPMkFJ3oavgGNOmn3",
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
  dataportfolio,
  worktimeline,
  skills,
  services,
  introdata,
  contactConfig,
  socialprofils,
  logotext,
};
