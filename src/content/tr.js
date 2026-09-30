// TR page content (T-12, FE-14): one file per section under
// src/content/tr/. Later packages edit only their section files.
import { defineContent } from "./define.js";
import hero from "./tr/hero.js";
import about from "./tr/about.js";
import timeline from "./tr/timeline.js";
import skills from "./tr/skills.js";
import services from "./tr/services.js";
import projects from "./tr/projects.js";
import featuredRepos from "./tr/featuredRepos.js";
import contact from "./tr/contact.js";
import privacy from "./tr/privacy.js";
import proof from "./tr/proof.js";
import awards from "./tr/awards.js";
import cv from "./tr/cv.js";
import author from "./tr/author.js";
import home from "./tr/home.js";

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
