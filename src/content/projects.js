// Language-independent project registry (FE-04 Aşama B, DSG-08, MKT-01,
// ANL-11, MKT-18). Pure ESM: the server reads it too (src/seo/pages/
// portfolio.js decides noindex from it, the server snapshot prints the same
// cards as the page).
//
// The card TEXT lives in src/content/{en,tr}/projects.js (one entry per
// published id, same order); this file holds only what does not change with
// the language: ids, order, status, permission, stack, links, image.
//
// T-10 exit. The page is indexable and in the menu exactly while at least one
// record is publishable (hasPublishedCases). A case that loses its status or
// permission drops out of the page, and when none is left the menu link goes
// and src/seo/pages/portfolio.js puts noindex back: one flag, both effects.
//
// Permission gate (K-12, 00-icerik-girdileri.md §4.2). A record whose work
// belongs to someone else stays `awaiting-permission` with no text, no links
// and no image in the repository until the written permission is on record
// (`permission.grantedAt`), and then text, image and status change in one
// commit. The employer's mobile app (id safecall_mobile) and its usage figure are
// such a case: nothing of it is stored here. tests/frontend/portfolio checks
// the rule in CI.

import { deepFreeze } from "./define.js";

/**
 * status
 *   live                   published once permission (if any) is on record
 *   awaiting-permission    somebody else's work; needs their written OK
 *   awaiting-confirmation  the owner still has to confirm role or result
 *
 * id     stable, lower case with underscores, one of PROJECT_IDS in
 *        src/lib/analytics/events.js (ANL-11: /^[a-z0-9_]+$/). The analytics
 *        project_id, the content key and data-project-id are all this value.
 * order  1..n position on the page; null for a candidate that is not shown.
 * image  null until the responsive set exists in public/img/projects (put
 *        the 1280x800 master in scripts/images/sources/projects/, run
 *        `bun run images:build portfolio-<name>`, then set it to
 *        { name: "<file name slug>" } and add `imageAlt` to both language
 *        files). A case without an image is a text case.
 * links  type: "repo" | "demo" | "post" | "case_study" (LINK_TYPES); the
 *        visible label is `cta.<type>` of the card text. `hreflang` is set
 *        when the target page is not in the site's language.
 */
export const PROJECTS = deepFreeze([
  {
    id: "salesgym",
    order: 1,
    status: "live",
    permission: { required: false },
    year: 2026,
    stack: ["Next.js", "React", "TypeScript", "Python", "Agora ConvoAI"],
    // README screenshot: the live session (W13).
    image: { name: "salesgym" },
    links: [
      {
        type: "repo",
        href: "https://github.com/AgoraIO-Community/Istanbul-Hackathon-Jan-2026/tree/main/submissions/salesgym",
      },
      { type: "demo", href: "https://screen.studio/share/j6tTOaIA" },
    ],
  },
  {
    id: "farmin",
    order: 2,
    status: "live",
    // Built with Efe Akkurt; the name is part of the card text in both
    // languages (role line).
    permission: { required: false },
    year: 2025,
    credits: ["Efe Akkurt"],
    stack: ["TypeScript", "Next.js", "Algorand", "TEAL"],
    // README screenshot: a pool's analysis page (W13).
    image: { name: "farmin" },
    links: [
      { type: "repo", href: "https://github.com/cengizhankose/farmin" },
      {
        type: "post",
        href: "https://www.risein.com/blog/algohack-istanbul-the-weekend-builders-took-over-the-city",
      },
    ],
  },
  {
    id: "effort_lab",
    order: 3,
    status: "live",
    permission: { required: false },
    year: 2026,
    stack: ["Claude Code", "Opus 5.5", "Sonnet 5.5"],
    // Capture of the live site in compare mode (W13).
    image: { name: "effort-lab" },
    links: [
      {
        type: "demo",
        href: "https://effort.cengizhankose.com",
        // The comparison site is written in Turkish.
        hreflang: "tr",
      },
    ],
  },

  // Candidates. No text, no links, no image until the condition is met.
  {
    id: "safecall_mobile",
    order: null,
    status: "awaiting-permission",
    permission: { required: true, from: "Drivee", grantedAt: null },
    year: null,
    stack: [],
    image: null,
    links: [],
  },
  {
    id: "trinqa",
    order: null,
    status: "awaiting-permission",
    permission: {
      required: true,
      from: "the co-founder",
      grantedAt: null,
    },
    year: null,
    stack: [],
    image: null,
    links: [],
  },
  {
    id: "atlas_steward",
    order: null,
    status: "awaiting-confirmation",
    permission: { required: false },
    year: null,
    stack: [],
    image: null,
    links: [],
  },
  {
    id: "cycase",
    order: null,
    status: "awaiting-confirmation",
    permission: { required: false },
    year: null,
    stack: [],
    image: null,
    links: [],
  },
]);

/** A record is shown when it is live and any permission it needs is on record. */
export const isPublishable = (project) =>
  project.status === "live" &&
  (!project.permission.required || Boolean(project.permission.grantedAt));

/** The publishable records in page order. */
export const publishedProjects = (projects = PROJECTS) =>
  projects
    .filter((project) => isPublishable(project) && project.order !== null)
    .sort((a, b) => a.order - b.order);

/** True while the page has cases to show (menu link, indexing). */
export const hasPublishedCases = (projects = PROJECTS) =>
  publishedProjects(projects).length > 0;

/**
 * The hackathon section that follows the cases (MKT-01 step 3, W13): the
 * podiums of src/content/awards.js with their photos, on this page under
 * #awards. Its evidence links send project_clicked with this analytics id
 * (link type "post"), at the section's place among the tracked items, and
 * with link_index, the link's place in its podium tile.
 */
export const HACKATHON_ARCHIVE = deepFreeze({
  id: "hackathon_archive",
  hash: "awards",
});

/**
 * "Selected GitHub repos" (MKT-18). Public, not forks, with a README and
 * pushed within two years (checked read-only with gh on 1 October 2026). The text
 * per language (`name`, `what`, optional `learned`) is in
 * src/content/{en,tr}/featuredRepos.js, same order.
 */
export const FEATURED_REPOS = deepFreeze([
  { id: "voxly", href: "https://github.com/cengizhankose/Voxly" },
  {
    id: "road_to_doomsday",
    href: "https://github.com/cengizhankose/road-to-doomsday",
  },
  {
    id: "bubble_writer",
    href: "https://github.com/cengizhankose/bubble-writer",
  },
]);

/**
 * The 15-second intro reel on the About page (MKT-18). The page shows it only
 * when `published` is true: the owner supplies the compressed file (<= 5 MB,
 * H.264, faststart) and the poster, and, while Drivee's permission for the
 * seconds that show the employer's app (00:06-00:08) is not on record, a cut without them.
 * `captions` holds the WebVTT file per language (site path); the reel has a
 * synthesised voice, so it is published only together with a captions file
 * (at least the EN one; the TR page falls back to it until a TR file exists).
 */
export const INTRO_REEL = deepFreeze({
  published: false,
  src: "/media/cengizhan-kose-reel.mp4",
  poster: "/media/cengizhan-kose-reel-poster.webp",
  width: 1280,
  height: 720,
  maxBytes: 5 * 1024 * 1024,
  captions: { en: null, tr: null },
});
