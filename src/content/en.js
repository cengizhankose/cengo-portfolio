// EN page content (T-12, FE-14): one file per section under
// src/content/en/. Later packages edit only their section files.
import { defineContent } from "./define.js";
import hero from "./en/hero.js";
import about from "./en/about.js";
import timeline from "./en/timeline.js";
import skills from "./en/skills.js";
import services from "./en/services.js";
import projects from "./en/projects.js";
import featuredRepos from "./en/featuredRepos.js";
import contact from "./en/contact.js";
import privacy from "./en/privacy.js";
import proof from "./en/proof.js";
import awards from "./en/awards.js";
import cv from "./en/cv.js";
import author from "./en/author.js";
import home from "./en/home.js";

export default defineContent({
  hero,
  about,
  timeline,
  skills,
  services,
  projects,
  featuredRepos,
  contact,
  privacy,
  proof,
  awards,
  cv,
  author,
  home,
});
