// The readable snapshot the server writes into <div id="root"> (SEO-01,
// T-06 Aşama 1).
//
// A crawler that does not run JavaScript, a reader with scripts off and the
// first paint before the bundle arrives all get the page's real content as
// HTML: one <h1>, the text, the links to the language's other pages, and for a
// post the complete article. The browser then opens the app, which replaces
// this markup (createRoot, not hydrateRoot: the snapshot is not React output).
//
// It is not a second version of the page: it is built from the data the page
// itself shows (src/content/<lang>, src/i18n/<lang> through translate(), the
// post the API returns) and mirrors the page components' markup and class
// names, so the stylesheet that is already loaded draws it the same way. Only
// the parts a reader cannot use without scripts are left out (the header, the
// contact form, the theme and language controls).
//
// Text is escaped by default (the `markup` template below); the only raw HTML
// is the markdown of a post, which goes through the sanitiser first
// (src/seo/markdown.ts). Dates use the page language (Intl, SEO-21).
//
// The template tag is deliberately not called `html`: Prettier re-formats the
// contents of an `html` template and would insert whitespace into the inline
// markup below.
//
// PERF-03 (T-06 Aşama 2) replaces this file with a real server render of the
// same components.
import { getContent, shared } from "../content/index.js";
import {
  FEATURED_REPOS,
  HACKATHON_ARCHIVE,
  INTRO_REEL,
  publishedProjects,
} from "../content/projects.js";
import { interpolate, translate } from "../i18n/translate.js";
import { heroStatusLine } from "../pages/home/heroStatus.js";
import { formatDate, toDate, toIsoDate } from "../lib/format.js";
import {
  groupPostsForLocale,
  mergePostLists,
  postLanguage,
} from "../lib/postGroups.js";
import { HERO_IMAGE, heroSrc, heroSrcSet } from "../pages/home/heroImage.js";
import {
  PROJECT_IMAGE,
  projectSrc,
  projectSrcSet,
} from "../pages/portfolio/projectImage.js";
import { escapeHtml } from "./head";
import { renderMarkdown } from "./markdown";
import {
  displayLocale,
  getPageMeta,
  localePath,
  staticLocale,
} from "./pages.js";
import {
  AUTHOR_PHOTO,
  AUTHOR_PROFILE_IDS,
  FEED_PATH,
  FOLLOW_PROFILE_ID,
  FOOTER_LOCATION,
} from "./pages/post.js";
import { LIVE, matchRoute } from "./routes.js";
import { AUTHOR, LOCALES, SOCIAL_PROFILES } from "./site.js";

// ------------------------------------------------------------- markup text

/** Markup that is already safe (the output of `markup`, the sanitised markdown). */
class Safe {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

/** Marks `value` as trusted markup. Only for sanitiser output and other Safe text. */
const raw = (value: string) => new Safe(value);

function part(value: unknown): string {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(part).join("");
  return escapeHtml(value);
}

/** Tagged template: every interpolated value is escaped unless it is Safe. */
function markup(strings: TemplateStringsArray, ...values: unknown[]): Safe {
  let out = strings[0];
  values.forEach((value, index) => {
    out += part(value) + strings[index + 1];
  });
  return new Safe(out);
}

/** ` name="value"`, or nothing when there is no value (React leaves such an attribute out). */
function attr(name: string, value: unknown): Safe {
  return value === null || value === undefined || value === ""
    ? new Safe("")
    : new Safe(` ${name}="${escapeHtml(value)}"`);
}

// ------------------------------------------------------------------- types

/** matchRoute()'s result (JS module, loose shape). */
export interface SnapshotRoute {
  type: string;
  locale: string;
  path: string;
  slug?: string;
}

/** Loose record: a post or a card as the API sends it. */
type Row = Record<string, any>;

/** The data a page's snapshot is built from. */
export interface SnapshotData {
  /** A post page: the post as getPublishedPostBySlug() returns it. */
  post?: Row | null;
  /**
   * The /blog page: the lists of blogIndexLists() (src/lib/swrFallback.js) in
   * that order: the page language's posts, then the other language's posts
   * without a translation.
   */
  lists?: Row[][];
}

type Live = typeof LIVE;

const translator = (locale: string) => (key: string, vars?: object) =>
  translate(locale, key, vars as Record<string, unknown> | undefined);

// Same rule as DotLine in src/components/proofstrip: the parts joined by a
// middle dot (decoration, hidden from screen readers), optionally one link
// around the whole line.
function dotLine(parts: unknown[], href?: string) {
  const line = parts.map((value, index) =>
    index > 0
      ? markup`<span aria-hidden="true"> · </span>${value}`
      : markup`${value}`,
  );
  return href
    ? markup`<a href="${href}">${line}</a>`
    : markup`<span>${line}</span>`;
}

// A cover image URL is written only when it is an https URL or a site path
// (the publish tool enforces the same, src/db/post-input.ts); anything else is
// left out rather than printed.
const isSafeImageUrl = (value: unknown): value is string =>
  typeof value === "string" && /^(https:\/\/|\/(?![/\\]))/.test(value);

const isRecord = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// -------------------------------------------------------------------- pages

// The menu's entries (src/header/index.jsx NAV_ITEMS) and their nav.* keys.
const NAV_ITEMS = [
  { path: "/", key: "home" },
  { path: "/portfolio", key: "portfolio" },
  { path: "/about", key: "about" },
  { path: "/blog", key: "blog" },
  { path: "/contact", key: "contact" },
] as const;

// Links to the language's other indexable pages, so a crawler that does not run
// the app can reach them from every page. The menu itself is part of the app;
// a page that is noindex (T-10 portfolio) is not offered.
function navigation(ui: string, live: Live) {
  const t = translator(ui);
  const items = NAV_ITEMS.filter(({ path }) => {
    const target = matchRoute(localePath(ui, path), live);
    return (
      target.type === "static" && !getPageMeta(target, ui, {}, live).robots
    );
  }).map(
    ({ path, key }) =>
      markup`<li><a href="${localePath(ui, path)}">${t(`nav.${key}`)}</a></li>`,
  );
  return markup`<nav aria-label="${t("nav.label")}" lang="${ui}"><ul>${items}</ul></nav>`;
}

// The app's layout shell: .s_c > main#main (src/app/routes.jsx).
function shell(page: Safe, ui: string, live: Live): string {
  return markup`<div class="s_c"><main id="main" tabindex="-1">${page}</main>${navigation(ui, live)}</div>`
    .value;
}

// Home (src/pages/home/index.jsx). The text comes first, then the photo, with
// the <picture> the page draws: the AVIF <source> carries the same srcset and
// sizes as the preload hint in the <head> (src/seo/pages/home.js), which is
// what keeps the browser from downloading the photo twice.
function homePage(route: SnapshotRoute, live: Live): Safe {
  const ui = staticLocale(route.locale, live);
  const t = translator(ui);
  const { hero } = getContent(route.locale) as Row;
  const phrases = hero.phrases as string[];
  const { sizes } = HERO_IMAGE;
  const rotator = phrases.map(
    (phrase, index) => markup`<span style="--i: ${index}">${phrase}</span>`,
  );
  const rings = markup`<span class="ring one" aria-hidden="true"></span><span class="ring two" aria-hidden="true"></span><span class="ring three" aria-hidden="true"></span>`;
  const roleLang = hero.roleLang === route.locale ? null : hero.roleLang;

  // Mirrors src/pages/home/index.jsx after W7-MKT (MKT-02/16/19) and DSG-28:
  // lead, status line, one-shot tagline, proof line, one button + one text link.
  const status = heroStatusLine(hero) as { status: string; text: string };
  const { contact } = getContent(route.locale) as Row;
  const text = markup`<div class="text h-100 d-lg-flex justify-content-center"><div class="align-self-center "><div class="intro mx-auto"><h1 class="intro__name">${hero.name} <span class="intro__role"${attr("lang", roleLang)}>${hero.role}</span></h1><p class="intro__lead">${hero.lead}</p><p class="intro__status" data-status="${status.status}">${status.text}</p><p class="intro__tagline"><span class="rotator" aria-hidden="true">${rotator}</span><span class="visually-hidden">${hero.phrasesText ?? phrases.at(-1)}</span></p><p class="intro__proof">${hero.proofLine}</p><div class="intro__cta pb-5"><div class="intro_btn-action"><a href="${localePath(ui, "/contact")}" id="button_h" class="ac_btn btn">${t("cta.primary")}${rings}</a><a href="${localePath(ui, "/portfolio")}" class="intro__textlink">${t("cta.secondary")} <span aria-hidden="true">→</span></a></div><p class="intro__note">${t("cta.note", { time: contact.responseTime })}</p></div></div></div></div>`;
  const photo = markup`<div class="h_bg-image position-relative"><picture><source type="image/avif" srcset="${heroSrcSet("avif")}" sizes="${sizes}"><source type="image/webp" srcset="${heroSrcSet("webp")}" sizes="${sizes}"><img src="${heroSrc(HERO_IMAGE.fallbackWidth, "jpg")}" srcset="${heroSrcSet("jpg")}" sizes="${sizes}" width="${HERO_IMAGE.width}" height="${HERO_IMAGE.height}" alt="${t("home.photoAlt")}" fetchpriority="high" loading="eager"></picture></div>`;
  return markup`<section id="home" class="home"><div class="intro_sec d-block d-lg-flex align-items-center ">${text}${photo}</div></section>`;
}

// The ProofStrip (src/components/proofstrip/index.jsx, variant "full").
// References render only from this many complete entries, like the component.
const MIN_TESTIMONIALS = 2;
const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";
const isCompleteTestimonial = (item: Row) =>
  hasText(item?.quote) &&
  hasText(item?.name) &&
  hasText(item?.role) &&
  hasText(item?.company);

function awardLine(award: Row) {
  const parts = [award.event, award.year, award.place, award.project].filter(
    (value) => value !== undefined && value !== "",
  );
  return dotLine(parts, award.url);
}

function proofStrip(content: Row, ui: string) {
  const t = translator(ui);
  const { proof, awards } = content;
  const references = (proof.testimonials as Row[]).filter(
    isCompleteTestimonial,
  );
  const companies = (proof.companies as Row[]).map(
    (company) => markup`<li>${company.name}</li>`,
  );
  const wins = (proof.awards as Row[]).map(
    (award) => markup`<li>${awardLine(award)}</li>`,
  );
  const quotes = references.map(
    (item) =>
      markup`<figure class="proof-testimonial"><blockquote><p>${item.quote}</p></blockquote><figcaption><span class="proof-testimonial__name">${item.name}</span><span class="proof-testimonial__role">${item.role} — ${item.company}</span></figcaption></figure>`,
  );
  const testimonials =
    references.length >= MIN_TESTIMONIALS
      ? markup`<div class="proofstrip__group"><h3 class="proofstrip__label">${t("proof.testimonials")}</h3><div class="proof-testimonials">${quotes}</div></div>`
      : "";
  const podiums = t("proof.podiums", { count: (awards as Row[]).length });
  return markup`<div class="proofstrip proofstrip--full"><div class="proofstrip__group"><h3 class="proofstrip__label">${t("proof.companies")}</h3><ul class="proof-companies list-unstyled">${companies}</ul></div><div class="proofstrip__group"><h3 class="proofstrip__label">${t("proof.awards")}</h3><ul class="proof-awards list-unstyled">${wins}</ul><p class="proofstrip__more"><a href="${localePath(ui, "/about")}#awards">${podiums}</a></p></div>${testimonials}</div>`;
}

// A two-column row of the About page: the h2 on the left, the content right.
function aboutRow(
  heading: unknown,
  body: Safe,
  { id, anchor = false, flex = false }: Row = {},
) {
  const cls = `sec_sp ${anchor ? "about-anchor " : ""}row`;
  const bodyCls = `${flex ? "d-flex align-items-center " : ""}col-lg-7`;
  return markup`<div class="${cls}"${attr("id", id)}><div class="col-lg-5"><h2 class="h3 color_sec py-4">${heading}</h2></div><div class="${bodyCls}">${body}</div></div>`;
}

// About (src/pages/about/index.jsx): one h1, an h2 per section, h3 for
// services, proof labels and side projects; the order of the page.
function aboutPage(route: SnapshotRoute, live: Live): Safe {
  const ui = staticLocale(route.locale, live);
  const t = translator(ui);
  const content = getContent(route.locale) as Row;
  const { about, timeline, skills, services, awards } = content;

  const paragraphs = (about.story as string[]).map(
    (paragraph) => markup`<p>${paragraph}</p>`,
  );
  const story = markup`<div><p class="about-lead">${about.title}</p>${paragraphs}</div>`;

  const roles = (timeline as Row[]).map(
    (data) =>
      markup`<tbody><tr class="timeline__role"><th scope="row" id="about-role-${data.id}">${data.jobtitle}</th><td>${data.where}</td><td class="timeline__date">${data.date}</td></tr><tr class="timeline__outcome"><td colspan="3" headers="about-role-${data.id}">${data.outcome}</td></tr></tbody>`,
  );
  const ventures = (about.ventures as Row[]).map(
    (venture) =>
      markup`<li><p class="about-venture__head"><span class="about-venture__name">${venture.name}</span><span aria-hidden="true"> · </span><span>${venture.role}</span></p>${venture.description ? markup`<p class="about-venture__text">${venture.description}</p>` : ""}</li>`,
  );
  const work = markup`<table class="table caption-top timeline"><caption class="visually-hidden">${t("about.timeline")}</caption>${roles}</table><h3 class="h5 about-ventures__title">${t("about.ventures")}</h3><ul class="about-ventures list-unstyled">${ventures}</ul>`;

  const groups = (skills as Row[]).map((group) => {
    const items = (group.items as string[]).map(
      (item) => markup`<li class="skill-chip">${item}</li>`,
    );
    return markup`<li class="skill-group"><p class="skill-group__name" id="about-skill-${group.id}">${group.name}</p><ul class="skill-group__items list-unstyled" aria-labelledby="about-skill-${group.id}">${items}</ul></li>`;
  });
  const skillList = markup`<ul class="skill-groups list-unstyled mb-0">${groups}</ul>`;

  const offers = (services as Row[]).map(
    (service) =>
      markup`<div class="service_ py-4"><h3 class="h5 service__title">${service.title}</h3><p class="service_desc">${service.description}</p></div>`,
  );

  const archive = (awards as Row[])
    .filter((award) => !award.hidden)
    .map((award) => markup`<li>${awardLine(award)}</li>`);
  const archiveList = markup`<ol class="awards-archive list-unstyled mb-0">${archive}</ol>`;

  const talks = (about.talks as Row[]).map(
    (talk) => markup`<li>${dotLine([talk.event, talk.year], talk.url)}</li>`,
  );
  const talkList = markup`<ul class="about-talks list-unstyled mb-0">${talks}</ul>`;

  const title = markup`<div class="mb-5 mt-3 row"><div class="col-lg-8"><h1 class="display-4 mb-4">${t("about.title")}</h1><hr class="t_border my-4 ms-0 text-start"></div></div>`;
  const cta = markup`<section class="about-cta" aria-labelledby="about-cta"><h2 class="h3 color_sec" id="about-cta">${t("about.cta.title")}</h2><p>${t("about.cta.text")}</p><a href="${localePath(ui, "/contact")}" class="about-cta__button">${t("about.cta.button")}</a></section>`;

  // The intro reel (MKT-18) between the awards and the talks, only while the
  // owner's files are published (INTRO_REEL.published); TR falls back to the
  // EN captions file like the page does.
  const captions = INTRO_REEL.captions[route.locale as "en" | "tr"];
  const reel = INTRO_REEL.published
    ? [
        aboutRow(
          t("portfolio.reel.title"),
          markup`<video class="about-reel" controls="" preload="none" playsinline="" poster="${INTRO_REEL.poster}" width="${INTRO_REEL.width}" height="${INTRO_REEL.height}" aria-label="${t("portfolio.reel.label")}"><source src="${INTRO_REEL.src}" type="video/mp4"><track kind="captions" src="${captions ?? INTRO_REEL.captions.en}" srclang="${captions ? route.locale : "en"}" label="${captions ? route.locale.toUpperCase() : "EN"}" default="">${t("portfolio.reel.fallback")}</video>`,
          { id: "reel", anchor: true },
        ),
      ]
    : [];

  const rows = [
    aboutRow(t("about.intro"), story, { flex: true }),
    aboutRow(t("about.proof"), proofStrip(content, ui)),
    aboutRow(t("about.timeline"), work, { id: "timeline", anchor: true }),
    aboutRow(t("about.skills"), skillList),
    aboutRow(t("about.services"), markup`${offers}`),
    aboutRow(t("about.awards"), archiveList, { id: "awards", anchor: true }),
    ...reel,
    aboutRow(t("about.talks"), talkList, { id: "talks", anchor: true }),
  ];
  return markup`<div class="container About-header">${title}${rows}${cta}</div>`;
}

// Contact (src/pages/contact/index.jsx): the heading, the address and the
// description. The form needs the app and is not part of the snapshot.
function contactPage(route: SnapshotRoute, live: Live): Safe {
  const ui = staticLocale(route.locale, live);
  const t = translator(ui);
  const { contact } = getContent(route.locale) as Row;
  const email = (shared as Row).email as string;
  return markup`<div class="container"><div class="mb-5 mt-3 row"><div class="col-lg-8"><h1 class="display-4 mb-4">${t("contact.title")}</h1><hr class="t_border my-4 ms-0 text-start"></div></div><div class="sec_sp row"><div class="mb-5 col-lg-5"><h2 class="h3 color_sec py-4">${t("contact.reachMe")}</h2><address><strong>${t("contact.emailLabel")}</strong> <a href="mailto:${email}">${email}</a></address><p>${interpolate(contact.description as string, { time: contact.responseTime as string })}</p></div></div></div>`;
}

// A link to another site (src/components/ExternalLink.jsx): new tab, noopener
// noreferrer (plus me on the owner's own profiles) and a hidden new-tab note in
// the language of the link text.
function externalLink(
  ui: string,
  href: string,
  label: Safe | string,
  {
    me = false,
    className,
    hreflang,
    track,
    location,
  }: {
    me?: boolean;
    className?: string;
    hreflang?: string;
    track?: string;
    location?: string;
  } = {},
) {
  const rel = me ? "me noopener noreferrer" : "noopener noreferrer";
  const note = translate(ui, "social.newTab");
  return markup`<a${attr("class", className)}${attr("data-analytics-location", location)}${attr("data-track", track)} href="${href}"${attr("hreflang", hreflang)} target="_blank" rel="${rel}">${label}<span class="visually-hidden"> ${note}</span></a>`;
}

const ARROW = markup`<span aria-hidden="true"> →</span>`;

// react-icons' FaTrophy as the page renders it (the badge's decoration); the
// parity test in tests/server/ssr/snapshot.test.ts compares it with the
// component's own output.
const TROPHY = raw(
  '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" aria-hidden="true" focusable="false" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M552 64H448V24c0-13.3-10.7-24-24-24H152c-13.3 0-24 10.7-24 24v40H24C10.7 64 0 74.7 0 88v56c0 35.7 22.5 72.4 61.9 100.7 31.5 22.7 69.8 37.1 110 41.7C203.3 338.5 240 360 240 360v72h-48c-35.3 0-64 20.7-64 56v12c0 6.6 5.4 12 12 12h296c6.6 0 12-5.4 12-12v-12c0-35.3-28.7-56-64-56h-48v-72s36.7-21.5 68.1-73.6c40.3-4.6 78.6-19 110-41.7 39.3-28.3 61.9-65 61.9-100.7V88c0-13.3-10.7-24-24-24zM99.3 192.8C74.9 175.2 64 155.6 64 144v-16h64.2c1 32.6 5.8 61.2 12.8 86.2-15.1-5.2-29.2-12.4-41.7-21.4zM512 144c0 16.1-17.7 36.1-35.3 48.8-12.5 9-26.7 16.2-41.8 21.4 7-25 11.8-53.6 12.8-86.2H512v16z"></path></svg>',
);

// One case (src/pages/portfolio/ProjectCard.jsx): image when the record has
// one, badge, h2, problem / role / result, stack tags, links.
function projectCard(project: Row, text: Row, ui: string) {
  const t = translator(ui);
  const image = project.image as { name: string } | null;
  const picture =
    image && text.imageAlt
      ? markup`<picture class="project-card__media"><source type="image/avif" srcset="${projectSrcSet(image.name, "avif")}" sizes="${PROJECT_IMAGE.sizes}"><source type="image/webp" srcset="${projectSrcSet(image.name, "webp")}" sizes="${PROJECT_IMAGE.sizes}"><img src="${projectSrc(image.name, PROJECT_IMAGE.fallbackWidth, "webp")}" srcset="${projectSrcSet(image.name, "webp")}" sizes="${PROJECT_IMAGE.sizes}" width="${PROJECT_IMAGE.width}" height="${PROJECT_IMAGE.height}" alt="${text.imageAlt}" loading="lazy" decoding="async"></picture>`
      : "";
  const badge = text.awardLabel
    ? markup`<p class="project-card__award">${TROPHY} ${text.awardLabel}</p>`
    : "";
  const facts = ["problem", "role", "result"].map(
    (key) =>
      markup`<div class="project-card__fact"><dt>${t(`portfolio.${key}`)}</dt><dd>${text[key]}</dd></div>`,
  );
  const tags = (project.stack as string[])
    .slice(0, 5)
    .map((tag) => markup`<li>${tag}</li>`);
  const links = (project.links as Row[]).map(
    (link) =>
      markup`<li>${externalLink(ui, link.href, markup`${text.cta[link.type]}${ARROW}`, { hreflang: link.hreflang, track: "project" })}</li>`,
  );
  return markup`<article class="project-card" data-project-id="${project.id}" aria-labelledby="project-${project.id}">${picture}<div class="project-card__body">${badge}<h2 class="project-card__title h4" id="project-${project.id}">${text.title}</h2><dl class="project-card__facts">${facts}</dl><ul class="project-card__tags list-unstyled" aria-label="${t("portfolio.stack")}">${tags}</ul><ul class="project-card__links list-unstyled">${links}</ul></div></article>`;
}

// Portfolio (src/pages/portfolio/index.jsx): the published cases, the archive
// teaser, the selected repos and the closing link; a short note while no case
// is publishable (T-10 interim state).
function portfolioPage(route: SnapshotRoute, live: Live): Safe {
  const ui = staticLocale(route.locale, live);
  const t = translator(ui);
  const { projects, featuredRepos, awards } = getContent(route.locale) as Row;
  const github = SOCIAL_PROFILES.find((profile) => profile.id === "github")!;

  const cases = (publishedProjects() as Row[]).flatMap((project) => {
    const text = (projects as Row[]).find((entry) => entry.id === project.id);
    return text ? [{ project, text }] : [];
  });
  const repos = (FEATURED_REPOS as Row[]).flatMap((repo) => {
    const text = (featuredRepos as Row[]).find((entry) => entry.id === repo.id);
    return text ? [{ repo, text }] : [];
  });

  const lead =
    cases.length > 0
      ? markup`<p class="portfolio__lead">${t("portfolio.lead")}</p>`
      : "";
  const head = markup`<div class="mb-5 mt-3 row"><div class="col-lg-8"><h1 class="display-4 mb-4">${t("portfolio.title")}</h1><hr class="t_border my-4 ms-0 text-start">${lead}</div></div>`;

  const body =
    cases.length === 0
      ? markup`<div class="sec_sp row"><div class="col-lg-8"><p class="portfolio__lead">${t("portfolio.empty")}</p><ul class="portfolio__empty-links list-unstyled"><li><a href="${localePath(ui, "/blog")}">${t("portfolio.emptyBlog")}</a></li><li>${externalLink(ui, github.url, t("portfolio.emptyGithub"), { me: true })}</li></ul></div></div>`
      : markup`<ul class="project-grid list-unstyled">${cases.map(({ project, text }) => markup`<li>${projectCard(project, text, ui)}</li>`)}</ul><section class="portfolio-archive" aria-labelledby="portfolio-archive-title"><h2 class="h4" id="portfolio-archive-title">${t("portfolio.archive.title", { count: (awards as Row[]).length })}</h2><p>${t("portfolio.archive.text")}</p><a data-track="project" href="${localePath(ui, HACKATHON_ARCHIVE.path)}#${HACKATHON_ARCHIVE.hash}">${t("portfolio.archive.cta")}${ARROW}</a></section>`;

  const repoSection =
    repos.length > 0
      ? markup`<section class="portfolio-repos" aria-labelledby="portfolio-repos"><h2 class="h3 color_sec py-4" id="portfolio-repos">${t("portfolio.repos.title")}</h2><ul class="repo-list list-unstyled">${repos.map(({ repo, text }) => markup`<li class="repo-list__item">${externalLink(ui, repo.href, text.name, { className: "repo-list__name", track: "project" })}<p class="repo-list__what">${text.what}</p>${text.learned ? markup`<p class="repo-list__learned"><span class="repo-list__learned-label">${t("portfolio.repos.learned")}</span> ${text.learned}</p>` : ""}</li>`)}</ul><p class="repo-list__all">${externalLink(ui, github.url, markup`${t("portfolio.repos.all")}${ARROW}`, { me: true, location: "portfolio" })}</p></section>`
      : "";
  const cta = markup`<section class="portfolio-cta"><p>${t("portfolio.contact.text")}</p><a class="portfolio-cta__link" href="${localePath(ui, "/contact")}">${t("portfolio.contact.cta")}${ARROW}</a></section>`;

  return markup`<div class="portfolio container">${head}${body}${repoSection}${cta}</div>`;
}

// Cover images are drawn 1200x630 and are decoration (alt ""), like BlogHome
// and BlogPost print them (MKT-20, FE-34, DSG-29).
const COVER_SIZE = { width: 1200, height: 630 } as const;

// One card of the blog index (BlogHome's PostCard): the card speaks the post's
// language, the date the page's; the link goes to the post's own path.
function postCard(post: Row, locale: string, heading: "h2" | "h3", ui: string) {
  const t = translator(ui);
  const lang = postLanguage(post);
  const foreign = lang !== locale;
  const date = post.publishedAt ?? post.createdAt;
  const iso = toIsoDate(date);
  const cover = isSafeImageUrl(post.coverImage)
    ? markup`<img src="${post.coverImage}" alt="" width="${COVER_SIZE.width}" height="${COVER_SIZE.height}" loading="lazy" decoding="async" class="blog-cover">`
    : "";
  const badge = foreign
    ? markup` <span class="lang-badge" aria-hidden="true">${lang.toUpperCase()}</span><span class="visually-hidden"${attr("lang", locale)}> ${t("blog.inOtherLanguage")}</span>`
    : "";
  const link = markup`<a href="${localePath(lang, `/blog/${post.slug}`)}">${post.title}</a>${badge}`;
  const headline =
    heading === "h2"
      ? markup`<h2 class="blog-post-title">${link}</h2>`
      : markup`<h3 class="blog-post-title">${link}</h3>`;
  const excerpt = post.excerpt
    ? markup`<p class="blog-excerpt">${post.excerpt}</p>`
    : "";
  const time = iso
    ? markup`<time class="blog-date" datetime="${iso}"${attr("lang", foreign ? locale : null)}>${formatDate(date, locale)}</time>`
    : "";
  return markup`<article class="blog-card" lang="${lang}">${cover}${headline}${excerpt}${time}</article>`;
}

// The blog index (src/pages/blog/BlogHome.jsx): the page's own posts, then the
// other language's untranslated posts in a group of their own (T-12).
function blogPage(route: SnapshotRoute, data: SnapshotData, live: Live): Safe {
  const locale = route.locale;
  const ui = staticLocale(locale, live);
  const t = translator(ui);
  const posts = mergePostLists(data.lists ?? []);
  const { own, other } = groupPostsForLocale(posts, locale);
  const empty = own.length === 0 && other.length === 0;

  const emptyState = empty
    ? markup`<div class="status-state status-state--inline blog-empty"><h2 class="status-state__title">${t("blog.empty")}</h2><p class="status-state__text">${t("blog.emptyText")}</p><div class="status-state__actions"><ul class="status-state__links"><li><a href="${localePath(ui, "/")}">${t("blog.home")}</a></li><li><a href="${localePath(ui, "/contact")}">${t("blog.contact")}</a></li></ul></div></div><p class="blog-empty-feed"><a href="${localePath(locale, FEED_PATH)}">${t("blog.emptyFeed")}</a></p>`
    : "";
  const ownGrid =
    own.length > 0
      ? markup`<div class="blog-grid">${own.map((post: Row) => postCard(post, locale, "h2", ui))}</div>`
      : "";
  const otherGroup =
    other.length > 0
      ? markup`<section class="blog-other" aria-labelledby="other-lang"><h2 id="other-lang" class="blog-other__title">${t("blog.otherLanguage")}</h2><div class="blog-grid">${other.map((post: Row) => postCard(post, locale, "h3", ui))}</div></section>`
      : "";
  return markup`<div class="blog-container"><h1 class="blog-title">${t("blog.title")}</h1><p class="blog-tagline">${t("blog.tagline")}</p>${emptyState}${ownGrid}${otherGroup}</div>`;
}

// "Edited" only when the post changed on a later day than it was published
// (same rule as editedDate() in src/pages/blog/BlogPost.jsx).
function editedDate(post: Row, published: unknown): string {
  const updated = toDate(post.updatedAt);
  const base = toDate(published);
  if (!updated || !base || updated <= base) return "";
  return formatDate(updated) === formatDate(base) ? "" : toIsoDate(updated);
}

// The author box at the end of a post (src/pages/blog/AuthorBox.jsx): the
// portrait, name, role, bio, the About link and the profiles, in the post's
// language. External links open in a new tab and say so, like ExternalLink.
function authorBox(lang: string, live: Live) {
  const t = translator(lang);
  const { bio } = (getContent(lang) as Row).author as Row;
  const profiles = AUTHOR_PROFILE_IDS.map((id) =>
    SOCIAL_PROFILES.find((profile) => profile.id === id),
  ).filter((profile) => profile !== undefined);
  const links = profiles.map(
    ({ label, url }) => markup`<li>${profileLink(url, label, lang)}</li>`,
  );
  const { src, srcSet, width, height } = AUTHOR_PHOTO;
  return markup`<aside class="author-box" aria-label="${t("post.aboutAuthor")}"><img class="author-box__photo" src="${src}" srcset="${srcSet}" width="${width}" height="${height}" alt="${t("post.authorPhotoAlt")}" loading="lazy" decoding="async"><div class="author-box__body"><p class="author-box__name">${AUTHOR.name}</p><p class="author-box__role">${(AUTHOR.jobTitles as Record<string, string>)[lang]}</p><p class="author-box__bio">${bio}</p><ul class="author-box__links"><li><a href="${localePath(staticLocale(lang, live), "/about")}">${t("post.readStory")}</a></li>${links}</ul></div></aside>`;
}

// A link to one of the owner's profiles (src/components/ExternalLink.jsx, `me`;
// named profileLink so it does not clash with the W8-MKT externalLink helper):
// new tab, rel me noopener noreferrer, and the hidden "(opens in a new tab)".
function profileLink(url: string, text: string, lang: string) {
  const t = translator(lang);
  return markup`<a href="${url}" target="_blank" rel="me noopener noreferrer">${text}<span class="visually-hidden"> ${t("social.newTab")}</span></a>`;
}

// The end of a post (src/pages/blog/PostFooter.jsx): author box, the one AI
// note, the follow line (the language's RSS feed, LinkedIn) and the contact link.
function postFooter(lang: string, live: Live) {
  const t = translator(lang);
  const follow = SOCIAL_PROFILES.find(({ id }) => id === FOLLOW_PROFILE_ID);
  const linkedin = follow
    ? markup`<span aria-hidden="true"> · </span>${profileLink(follow.url, t("post.footer.linkedin"), lang)}`
    : "";
  return markup`<footer class="post-footer" aria-label="${t("post.footer.label")}" data-analytics-location="${FOOTER_LOCATION}">${authorBox(lang, live)}<p class="ai-disclosure">${t("post.aiDisclosure")}</p><p class="post-footer__follow">${t("post.footer.follow")} <a href="${localePath(lang, FEED_PATH)}">${t("post.footer.rss")}</a>${linkedin}</p><p class="post-footer__cta"><a href="${localePath(staticLocale(lang, live), "/contact")}">${t("post.footer.cta")}</a></p></footer>`;
}

// A post page (src/pages/blog/BlogPost.jsx, the success state): the interface
// text speaks the interface language, the <article> the post's own (its lang,
// date labels and dates, SEO-21). The body is the sanitised markdown.
function postPage(route: SnapshotRoute, post: Row, live: Live): Safe {
  const lang = LOCALES.includes(post.lang)
    ? (post.lang as string)
    : route.locale;
  const ui = staticLocale(route.locale, live);
  const t = translator(ui);
  const blogPath = localePath(
    staticLocale(post.lang ?? route.locale, live),
    "/blog",
  );
  const publishedValue = post.publishedAt ?? post.createdAt;
  const published = toIsoDate(publishedValue);
  const edited = editedDate(post, publishedValue);
  const cover = isSafeImageUrl(post.coverImage)
    ? markup`<img src="${post.coverImage}" alt="" width="${COVER_SIZE.width}" height="${COVER_SIZE.height}" decoding="async" class="blog-post-cover">`
    : "";
  const editedPart = edited
    ? markup` · ${translate(lang, "post.edited")} <time datetime="${edited}">${formatDate(edited, lang)}</time>`
    : "";
  const date = published
    ? markup`<p class="blog-post-date">${translate(lang, "post.published")} <time datetime="${published}">${formatDate(publishedValue, lang)}</time>${editedPart}</p>`
    : "";
  const byline = markup`<p class="blog-post-byline">${translate(lang, "post.byline.by")} <a href="${localePath(staticLocale(lang, live), "/about")}" rel="author">${AUTHOR.name}</a> ${translate(lang, "post.byline.with")}</p>`;
  const body = raw(renderMarkdown(post.content));
  return markup`<div class="blog-post-container" lang="${ui}"><a href="${blogPath}" class="blog-back"><span aria-hidden="true">←</span> ${t("post.backToBlog")}</a><article class="blog-post" lang="${lang}">${cover}<h1 class="blog-post-title-full">${post.title}</h1>${byline}${date}<div class="blog-post-body"><div class="blog-content markdown-body" data-analytics-location="blog_body">${body}</div></div>${postFooter(lang, live)}</article></div>`;
}

// ---------------------------------------------------------------- public API

/**
 * The snapshot for `route` as the inner HTML of <div id="root">, or "" for a
 * route it has nothing to say about. `locale` is the language the page is
 * written in (the route's, the post's own for a post). `live` is the route
 * table (tests pass ALL_LIVE to check the state once the TR pages are open).
 */
export function renderSnapshot(
  route: SnapshotRoute,
  locale: string,
  data: SnapshotData = {},
  live: Live = LIVE,
): string {
  const ui = staticLocale(locale, live);

  if (route.type === "post") {
    return isRecord(data.post)
      ? shell(postPage(route, data.post, live), ui, live)
      : "";
  }
  if (route.type !== "static") return "";

  switch (route.path) {
    case "/":
      return shell(homePage(route, live), ui, live);
    case "/about":
      return shell(aboutPage(route, live), ui, live);
    case "/contact":
      return shell(contactPage(route, live), ui, live);
    case "/portfolio":
      return shell(portfolioPage(route, live), ui, live);
    case "/blog":
      return shell(blogPage(route, data, live), ui, live);
    default:
      return "";
  }
}

/**
 * The 404 page (src/pages/notfound/index.jsx): "Page not found" for an unknown
 * path, "Post not found" for a missing post, with the links back to the home
 * page and the blog in the language the 404 is written in.
 */
export function renderNotFoundSnapshot(
  route: SnapshotRoute,
  { post = false, live = LIVE }: { post?: boolean; live?: Live } = {},
): string {
  const locale = post ? route.locale : displayLocale(route, live);
  const t = translator(locale);
  const linkLocale = staticLocale(locale, live);
  const key = post ? "post" : "page";
  const home = {
    to: localePath(linkLocale, "/"),
    label: t("notFound.home"),
  };
  const blog = {
    to: localePath(linkLocale, "/blog"),
    label: t(post ? "notFound.backToBlog" : "notFound.blog"),
  };
  const links = (post ? [blog, home] : [home, blog]).map(
    ({ to, label }) => markup`<li><a href="${to}">${label}</a></li>`,
  );
  const page = markup`<section class="status-state status-state--page not-found" aria-labelledby="not-found-title" lang="${locale}"><h1 id="not-found-title" class="status-state__title">${t(`notFound.${key}.title`)}</h1><p class="status-state__text">${t(`notFound.${key}.text`)}</p><div class="status-state__actions"><ul class="status-state__links">${links}</ul></div></section>`;
  return shell(page, staticLocale(locale, live), live);
}
