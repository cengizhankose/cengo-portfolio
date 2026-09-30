// EN interface dictionary (T-12, FE-14): the namespace files under
// src/i18n/en/ flattened into one frozen { "ns.key": text } object.
// Later packages edit only their namespace file, never this list.
import { defineDictionary } from "./dictionary.js";
import common from "./en/common.js";
import a11y from "./en/a11y.js";
import nav from "./en/nav.js";
import footer from "./en/footer.js";
import home from "./en/home.js";
import cta from "./en/cta.js";
import about from "./en/about.js";
import contact from "./en/contact.js";
import blog from "./en/blog.js";
import post from "./en/post.js";
import status from "./en/status.js";
import notFound from "./en/notFound.js";
import social from "./en/social.js";
import lang from "./en/lang.js";
import portfolio from "./en/portfolio.js";
import privacy from "./en/privacy.js";
import services from "./en/services.js";
import cv from "./en/cv.js";
import proof from "./en/proof.js";

export default defineDictionary({
  common,
  a11y,
  nav,
  footer,
  home,
  cta,
  about,
  contact,
  blog,
  post,
  status,
  notFound,
  social,
  lang,
  portfolio,
  privacy,
  services,
  cv,
  proof,
});
