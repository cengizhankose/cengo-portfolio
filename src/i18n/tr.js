// TR interface dictionary (T-12, FE-14): the namespace files under
// src/i18n/tr/ flattened into one frozen { "ns.key": text } object.
// Later packages edit only their namespace file, never this list.
import { defineDictionary } from "./dictionary.js";
import common from "./tr/common.js";
import a11y from "./tr/a11y.js";
import nav from "./tr/nav.js";
import footer from "./tr/footer.js";
import home from "./tr/home.js";
import cta from "./tr/cta.js";
import about from "./tr/about.js";
import contact from "./tr/contact.js";
import blog from "./tr/blog.js";
import post from "./tr/post.js";
import status from "./tr/status.js";
import notFound from "./tr/notFound.js";
import social from "./tr/social.js";
import lang from "./tr/lang.js";
import portfolio from "./tr/portfolio.js";
import privacy from "./tr/privacy.js";
import services from "./tr/services.js";
import cv from "./tr/cv.js";
import proof from "./tr/proof.js";

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
