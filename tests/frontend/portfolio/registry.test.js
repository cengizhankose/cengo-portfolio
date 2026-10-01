// @vitest-environment node
//
// The portfolio data (FE-04 Aşama B, DSG-08, MKT-01, ANL-11, MKT-18): the
// language-independent registry, the EN/TR card text, the permission gate and
// the files the registry points to. Everything runs on the real files.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT } from "../../../src/content/index.js";
import {
  FEATURED_REPOS,
  HACKATHON_ARCHIVE,
  INTRO_REEL,
  PROJECTS,
  hasPublishedCases,
  isPublishable,
  publishedProjects,
} from "../../../src/content/projects.js";
import {
  FEATURED_PROJECT_IDS,
  LINK_TYPES,
  PROJECT_IDS,
} from "../../../src/lib/analytics/events.js";
import {
  PROJECT_IMAGE,
  projectSrc,
} from "../../../src/pages/portfolio/projectImage.js";
import { ROOT, bytes, filesUnder, imageInfo, read } from "../hero/support.js";

const LANGS = ["en", "tr"];
const published = publishedProjects();
const unpublished = PROJECTS.filter((project) => !isPublishable(project));
const textOf = (lang, id) => CONTENT[lang].projects.find((p) => p.id === id);
const filled = (value) => typeof value === "string" && value.trim() !== "";

describe("registry shape (FE-04 step 12 e, ANL-11 criterion 2)", () => {
  it("ids are unique, lower case with underscores and known to analytics", () => {
    const ids = PROJECTS.map((project) => project.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9_]+$/);
      expect(PROJECT_IDS, id).toContain(id);
    }
    expect(PROJECT_IDS).toContain(HACKATHON_ARCHIVE.id);
  });

  it("publishes the three featured cases in the agreed order", () => {
    // K-12: SalesGym, Farmin (+ reset), Effort Lab. The analytics id of the
    // last one is effort_lab (underscore), as in events.js.
    expect(published.map((project) => project.id)).toEqual([
      "salesgym",
      "farmin",
      "effort_lab",
    ]);
    expect(published.map((project) => project.id)).toEqual([
      ...FEATURED_PROJECT_IDS,
    ]);
    expect(published.map((project) => project.order)).toEqual([1, 2, 3]);
    expect(hasPublishedCases()).toBe(true);
  });

  it("uses known statuses and a complete permission record", () => {
    for (const project of PROJECTS) {
      expect(
        ["live", "awaiting-permission", "awaiting-confirmation"],
        project.id,
      ).toContain(project.status);
      expect(typeof project.permission.required, project.id).toBe("boolean");
      if (project.permission.required) {
        expect(filled(project.permission.from), project.id).toBe(true);
      }
    }
  });

  it("is frozen, so a render cannot change it", () => {
    expect(Object.isFrozen(PROJECTS)).toBe(true);
    expect(Object.isFrozen(PROJECTS[0])).toBe(true);
    expect(Object.isFrozen(PROJECTS[0].links)).toBe(true);
    expect(Object.isFrozen(INTRO_REEL)).toBe(true);
  });
});

describe("permission gate (FE-04 step 12 a, b, d; DSG-08 step 8)", () => {
  it("every record with an order is publishable", () => {
    for (const project of PROJECTS.filter((p) => p.order !== null)) {
      expect(isPublishable(project), project.id).toBe(true);
    }
  });

  it("no live record waits for a permission it does not have", () => {
    const bad = PROJECTS.filter(
      (project) =>
        project.status === "live" &&
        project.permission.required &&
        !project.permission.grantedAt,
    );
    expect(bad).toEqual([]);
  });

  it("isPublishable needs live status and, where required, a recorded grant", () => {
    const base = { status: "live", permission: { required: false } };
    expect(isPublishable(base)).toBe(true);
    expect(isPublishable({ ...base, status: "awaiting-confirmation" })).toBe(
      false,
    );
    const needs = { required: true, from: "someone", grantedAt: null };
    expect(isPublishable({ ...base, permission: needs })).toBe(false);
    expect(
      isPublishable({
        ...base,
        permission: { ...needs, grantedAt: "2026-10-01" },
      }),
    ).toBe(true);
  });

  it("the candidates have an id only: no text, no links, no image, no order", () => {
    expect(unpublished.map((project) => project.id).sort()).toEqual([
      "atlas_steward",
      "cycase",
      "safecall_mobile",
      "trinqa",
    ]);
    for (const project of unpublished) {
      expect(project.order, project.id).toBeNull();
      expect(project.image, project.id).toBeNull();
      expect(project.links, project.id).toEqual([]);
      expect(project.stack, project.id).toEqual([]);
      for (const lang of LANGS) {
        expect(textOf(lang, project.id), `${lang} ${project.id}`).toBe(
          undefined,
        );
      }
    }
  });

  it("the employer's case waits for Drivee and the co-founder's for the co-founder", () => {
    const byId = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));
    expect(byId.safecall_mobile.permission).toMatchObject({
      required: true,
      from: "Drivee",
      grantedAt: null,
    });
    expect(byId.trinqa.permission).toMatchObject({
      required: true,
      grantedAt: null,
    });
    expect(hasPublishedCases(unpublished)).toBe(false);
  });

  it("no source file carries the employer's metric, a stub page title or placeholder data", () => {
    const hits = (pattern) =>
      filesUnder("src")
        .filter((file) => /\.(js|jsx|ts|css)$/.test(file))
        .filter((file) => pattern.test(read(file)));
    expect(hits(/daily visitors|günlük ziyaretçi/i)).toEqual([]);
    expect(hits(/Under Construction/)).toEqual([]);
    expect(hits(/picsum/)).toEqual([]);
    expect(hits(/desctiption/)).toEqual([]);
    expect(hits(/raw\.githubusercontent|media\.licdn/)).toEqual([]);
  });

  it("the portfolio's content files do not name the waiting cases (DSG-08 criterion)", () => {
    // About and the timeline name the employer's app in a role line; the rule
    // is about the portfolio's own files.
    const files = [
      "src/content/projects.js",
      ...LANGS.flatMap((lang) => [
        `src/content/${lang}/projects.js`,
        `src/content/${lang}/featuredRepos.js`,
      ]),
    ];
    const hits = files.filter((file) =>
      /SafeCall|Trinqa|CYCASE|1,000 daily|1\.000 günlük/.test(read(file)),
    );
    expect(hits).toEqual([]);
  });
});

describe("card text (FE-04 step 12 c, DSG-08 step 3, MKT-01)", () => {
  it.each(LANGS)(
    "%s has a card for every published case, same order",
    (lang) => {
      expect(CONTENT[lang].projects.map((card) => card.id)).toEqual(
        published.map((project) => project.id),
      );
    },
  );

  it.each(LANGS)(
    "%s cards are complete and inside the length limits",
    (lang) => {
      for (const project of published) {
        const card = textOf(lang, project.id);
        // W13: a one-sentence summary and problem / what I built / result.
        for (const key of ["title", "summary", "problem", "built", "result"]) {
          expect(filled(card[key]), `${lang} ${project.id}.${key}`).toBe(true);
        }
        // The old "role" line became "built" (my part in it is its start).
        expect(card.role, `${lang} ${project.id}.role`).toBeUndefined();
        expect(
          card.title.length,
          `${lang} ${project.id} title`,
        ).toBeLessThanOrEqual(60);
        expect(
          card.summary.length,
          `${lang} ${project.id} summary`,
        ).toBeLessThanOrEqual(180);
        if (card.awardLabel !== undefined) {
          expect(filled(card.awardLabel), `${lang} ${project.id} badge`).toBe(
            true,
          );
          expect(card.awardLabel.length).toBeLessThanOrEqual(56);
        }
        // One label per link type of the record, each short.
        for (const link of project.links) {
          const label = card.cta?.[link.type];
          expect(filled(label), `${lang} ${project.id} cta.${link.type}`).toBe(
            true,
          );
          expect(label.length).toBeLessThanOrEqual(28);
        }
        expect(Object.keys(card.cta).sort()).toEqual(
          project.links.map((link) => link.type).sort(),
        );
      }
    },
  );

  it("only the two podium cases carry a badge; the comparison has none", () => {
    for (const lang of LANGS) {
      expect(
        CONTENT[lang].projects
          .filter((card) => card.awardLabel)
          .map((c) => c.id),
      ).toEqual(["salesgym", "farmin"]);
    }
  });

  it("uses the agreed award wording (00-icerik-girdileri.md section 5)", () => {
    expect(textOf("en", "salesgym").awardLabel).toBe(
      "1st place · ConvoAI World Istanbul · 2026",
    );
    expect(textOf("tr", "salesgym").awardLabel).toBe(
      "Birincilik · ConvoAI World Istanbul · 2026",
    );
    expect(textOf("en", "farmin").awardLabel).toBe(
      "1st place · AlgoHack Istanbul, Open Innovation · 2025",
    );
    expect(textOf("tr", "farmin").awardLabel).toBe(
      "Birincilik · AlgoHack Istanbul, Open Innovation · 2025",
    );
    // The organizer's wording, never "first among 25 teams".
    for (const lang of LANGS) {
      const all = JSON.stringify(CONTENT[lang].projects);
      expect(all).not.toMatch(/25 (teams|takım)/i);
    }
    // SalesGym's event is named both ways in the result line.
    expect(textOf("en", "salesgym").result).toContain(
      "ConvoAI World Istanbul (Agora Voice AI Hackathon)",
    );
    expect(textOf("tr", "salesgym").result).toContain(
      "ConvoAI World Istanbul’da (Agora Voice AI Hackathon)",
    );
  });

  it("names the co-developer of Farmin in both languages", () => {
    const credits = PROJECTS.find((p) => p.id === "farmin").credits;
    expect(credits).toEqual(["Efe Akkurt"]);
    for (const lang of LANGS) {
      for (const name of credits) {
        expect(textOf(lang, "farmin").built).toContain(name);
      }
    }
  });

  it("states the follow-up project and the effort site's language honestly", () => {
    expect(textOf("en", "farmin").result).toContain("reset");
    expect(textOf("tr", "farmin").result).toContain("reset");
    // The comparison site is Turkish: the EN label says so, the link says it.
    expect(textOf("en", "effort_lab").cta.demo).toMatch(/\(TR\)$/);
    expect(textOf("tr", "effort_lab").cta.demo).not.toMatch(/\(TR\)/);
    const link = PROJECTS.find((p) => p.id === "effort_lab").links[0];
    expect(link.hreflang).toBe("tr");
  });

  it("uses typographic apostrophes and no exclamation marks", () => {
    for (const lang of LANGS) {
      const all =
        JSON.stringify(CONTENT[lang].projects) +
        JSON.stringify(CONTENT[lang].featuredRepos);
      expect(all, lang).not.toMatch(/[A-Za-zÇĞİÖŞÜçğıöşü]'[A-Za-zçğıöşü]/);
      expect(all, lang).not.toContain("!");
    }
  });
});

describe("links (ANL-11 criterion 4, MKT-01)", () => {
  const links = PROJECTS.flatMap((project) =>
    project.links.map((link) => ({ id: project.id, ...link })),
  );

  it("are absolute https URLs with a known link type, none a stub", () => {
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const link of links) {
      expect(LINK_TYPES, `${link.id} ${link.href}`).toContain(link.type);
      expect(link.href).toMatch(/^https:\/\/[a-z0-9.-]+(\/|$)/i);
      expect(link.href).not.toMatch(/#$|picsum|localhost/);
    }
  });

  it("one record never has two links of the same type (the label key)", () => {
    for (const project of PROJECTS) {
      const types = project.links.map((link) => link.type);
      expect(new Set(types).size, project.id).toBe(types.length);
    }
  });

  it("point at the sources of 00-icerik-girdileri.md section 4.1", () => {
    const hrefs = links.map((link) => link.href);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "https://github.com/AgoraIO-Community/Istanbul-Hackathon-Jan-2026/tree/main/submissions/salesgym",
        "https://screen.studio/share/j6tTOaIA",
        "https://github.com/cengizhankose/farmin",
        "https://www.risein.com/blog/algohack-istanbul-the-weekend-builders-took-over-the-city",
        "https://effort.cengizhankose.com",
      ]),
    );
  });

  it("keep at most five stack tags that fit a card", () => {
    for (const project of published) {
      expect(project.stack.length, project.id).toBeGreaterThan(0);
      expect(project.stack.length, project.id).toBeLessThanOrEqual(5);
    }
  });
});

describe("images (DSG-08 criterion 3, FE-04 step 9)", () => {
  const dir = join(ROOT, "public/img/projects");
  const files = existsSync(dir) ? readdirSync(dir) : [];

  it("a record with an image has its full set, 16:10, each file <= 150 KB, and alt text", () => {
    for (const project of PROJECTS.filter((p) => p.image)) {
      const { name } = project.image;
      for (const width of PROJECT_IMAGE.widths) {
        for (const ext of ["avif", "webp"]) {
          const file = `public${projectSrc(name, width, ext)}`;
          expect(existsSync(join(ROOT, file)), file).toBe(true);
          expect(statSync(join(ROOT, file)).size, file).toBeLessThanOrEqual(
            PROJECT_IMAGE.maxBytes,
          );
          const info = imageInfo(bytes(file));
          expect(info.width, file).toBe(width);
          expect(info.height, file).toBe(Math.round((width * 10) / 16));
        }
      }
      for (const lang of LANGS) {
        expect(
          filled(textOf(lang, project.id).imageAlt),
          `${lang} ${project.id} imageAlt`,
        ).toBe(true);
      }
    }
  });

  it("public/img/projects holds only files of published records that say they have an image", () => {
    const names = new Set(
      published.filter((p) => p.image).map((p) => p.image.name),
    );
    for (const file of files) {
      const owner = [...names].find((name) => file.startsWith(`${name}-`));
      expect(owner, file).toBeDefined();
      expect(statSync(join(dir, file)).size, file).toBeLessThanOrEqual(
        PROJECT_IMAGE.maxBytes,
      );
    }
  });

  it("an image never belongs to a record that is not published", () => {
    for (const project of unpublished) expect(project.image).toBeNull();
  });

  it("every published case shows its own picture (W13), with its master in the repository", () => {
    expect(published.map((project) => project.image?.name)).toEqual([
      "salesgym",
      "farmin",
      "effort-lab",
    ]);
    for (const { image } of published) {
      const master = `scripts/images/sources/projects/${image.name}.jpg`;
      expect(existsSync(join(ROOT, master)), master).toBe(true);
      const info = imageInfo(bytes(master));
      // The master is the largest output: nothing is upscaled, no metadata.
      expect([info.width, info.height], master).toEqual([1280, 800]);
      expect(info.exif, master).toBeFalsy();
    }
  });
});

describe("selected repos (MKT-18)", () => {
  it("lists the three repos of the content inputs, in order", () => {
    expect(FEATURED_REPOS.map((repo) => repo.href)).toEqual([
      "https://github.com/cengizhankose/Voxly",
      "https://github.com/cengizhankose/road-to-doomsday",
      "https://github.com/cengizhankose/bubble-writer",
    ]);
    for (const repo of FEATURED_REPOS) expect(PROJECT_IDS).toContain(repo.id);
  });

  it.each(LANGS)("%s text matches the registry ids and order", (lang) => {
    expect(CONTENT[lang].featuredRepos.map((repo) => repo.id)).toEqual(
      FEATURED_REPOS.map((repo) => repo.id),
    );
    for (const repo of CONTENT[lang].featuredRepos) {
      expect(filled(repo.name), repo.id).toBe(true);
      expect(filled(repo.what), repo.id).toBe(true);
    }
  });

  it("'what I learned' is the owner's: present in both languages or in neither, never a placeholder", () => {
    for (const repo of FEATURED_REPOS) {
      const [en, tr] = LANGS.map(
        (lang) =>
          CONTENT[lang].featuredRepos.find((entry) => entry.id === repo.id)
            .learned,
      );
      expect(en === undefined, repo.id).toBe(tr === undefined);
      for (const learned of [en, tr].filter((value) => value !== undefined)) {
        expect(filled(learned), repo.id).toBe(true);
        expect(learned, repo.id).not.toMatch(/[[\]]/);
      }
    }
    for (const lang of LANGS) {
      const texts = CONTENT[lang].featuredRepos.flatMap((repo) =>
        Object.values(repo),
      );
      for (const text of texts) expect(text).not.toMatch(/[[\]]/);
    }
  });
});

describe("intro reel (MKT-18)", () => {
  const file = (site) => `public${site}`;

  it("is off until the owner supplies the files", () => {
    // Flip INTRO_REEL.published only together with the video, the poster and
    // a captions file; the next test holds the flag to that.
    expect(typeof INTRO_REEL.published).toBe("boolean");
    expect(INTRO_REEL.src).toBe("/media/cengizhan-kose-reel.mp4");
    expect(INTRO_REEL.maxBytes).toBe(5 * 1024 * 1024);
  });

  it("when published: video <= 5 MB, a poster, and captions for the voice-over", () => {
    if (!INTRO_REEL.published) {
      expect(existsSync(join(ROOT, file(INTRO_REEL.src)))).toBe(false);
      return;
    }
    expect(existsSync(join(ROOT, file(INTRO_REEL.src)))).toBe(true);
    expect(statSync(join(ROOT, file(INTRO_REEL.src))).size).toBeLessThanOrEqual(
      INTRO_REEL.maxBytes,
    );
    expect(existsSync(join(ROOT, file(INTRO_REEL.poster)))).toBe(true);
    expect(filled(INTRO_REEL.captions.en)).toBe(true);
    expect(existsSync(join(ROOT, file(INTRO_REEL.captions.en)))).toBe(true);
    expect(read(file(INTRO_REEL.captions.en))).toMatch(/^WEBVTT/);
  });
});
