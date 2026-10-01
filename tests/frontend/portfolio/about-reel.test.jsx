// The 15-second intro reel on About (MKT-18 step 4) once the owner's files are
// in and INTRO_REEL.published is true: a native player that loads nothing
// until play, never starts by itself, has a poster, a name and captions, sits
// between the awards and the talks under its own h2. about-reel-off.test.jsx
// holds the state without the files. The TR pages are not live yet, so the
// route table is mocked as after SEO-11 Adım B.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import aboutStyles from "../../../src/pages/about/about.module.css";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});
vi.mock("../../../src/content/projects.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    INTRO_REEL: {
      ...actual.INTRO_REEL,
      published: true,
      captions: { en: "/media/cengizhan-kose-reel.en.vtt", tr: null },
    },
  };
});

const { About } = await import("../../../src/pages/about");
const { translate } = await import("../../../src/i18n/translate.js");

const renderAbout = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <About />
    </MemoryRouter>,
  );

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe.each([
  ["/about", "en"],
  ["/tr/about", "tr"],
])("%s with the reel published", (path, locale) => {
  const t = (key) => translate(locale, key);

  it("draws one video with controls, no autoplay and no preload (PERF: loads on play)", () => {
    renderAbout(path);

    const videos = document.querySelectorAll("video");
    expect(videos).toHaveLength(1);
    const video = videos[0];
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("preload", "none");
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(video.hasAttribute("loop")).toBe(false);
    expect(video.playsInline).toBe(true);
    expect(video).toHaveAttribute(
      "poster",
      "/media/cengizhan-kose-reel-poster.webp",
    );
    expect(video).toHaveAttribute("width", "1280");
    expect(video).toHaveAttribute("height", "720");
    expect(video).toHaveAttribute("aria-label", t("portfolio.reel.label"));
    expect(video.querySelector("source")).toHaveAttribute(
      "src",
      "/media/cengizhan-kose-reel.mp4",
    );
    expect(video.querySelector("source")).toHaveAttribute("type", "video/mp4");
  });

  it("has a captions track (the reel has a voice-over); TR falls back to the EN file", () => {
    renderAbout(path);

    const track = document.querySelector("video track");
    expect(track).toHaveAttribute("kind", "captions");
    expect(track).toHaveAttribute("src", "/media/cengizhan-kose-reel.en.vtt");
    expect(track).toHaveAttribute("srclang", "en");
  });

  it("sits between the awards and the talks under its own h2", () => {
    renderAbout(path);

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      t("about.intro"),
      t("about.proof"),
      t("about.timeline"),
      t("about.skills"),
      t("about.services"),
      t("about.awards"),
      t("portfolio.reel.title"),
      t("about.talks"),
      t("about.cta.title"),
    ]);
    const row = document.getElementById("reel");
    expect(row.contains(document.querySelector("video"))).toBe(true);
    expect(row.classList.contains(aboutStyles.anchor)).toBe(true);
  });
});
