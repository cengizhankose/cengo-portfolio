// DEPRECATED compatibility shim (FE-14, W4). Nothing under src/ imports this
// file any more: page content lives in src/content/{en,tr}/, shared data in
// src/content/shared.js, interface text in src/i18n/{en,tr}/.
//
// It stays only because tests outside the W4 package's file scope still
// import it (tests/frontend/{contact,about,nav}/**, tests/server/seo/
// site.test.ts). The orchestrator deletes this file at the W4 merge together
// with those imports (handoff in claudedocs/.../impl/W4-FE-i18n-
// infrastructure.md). Values are the EN content, derived from the new
// modules, so the old shape cannot drift from what the site renders.
import { SOCIAL_PROFILES } from "./seo/site.js";
import { getContent } from "./content/index.js";
import { email, emailjs, logotext } from "./content/shared.js";
import { translate } from "./i18n/translate.js";

const en = getContent("en");
const t = (key) => translate("en", key);

const introdata = {
  title: en.hero.title,
  animated: {
    first: en.hero.phrases[0],
    second: en.hero.phrases[1],
    third: en.hero.phrases[2],
  },
  description: en.hero.description,
};

const dataabout = { title: t("about.intro"), aboutme: en.about.summary };
const worktimeline = en.timeline;
const skills = en.skills;
const services = en.services;

const contactConfig = {
  YOUR_EMAIL: email,
  description: en.contact.description,
  YOUR_SERVICE_ID: emailjs.serviceId,
  YOUR_TEMPLATE_ID: emailjs.templateId,
  YOUR_PUBLIC_KEY: emailjs.publicKey,
  messages: {
    success: t("contact.success"),
    error: t("contact.error"),
    rateLimited: t("contact.rateLimited"),
    emailMe: t("contact.emailMe"),
  },
};

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
