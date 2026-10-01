// Home hero photo markup (PERF-02, FE-18, SEO-26, DSG-29, DSG-11, PERF-07):
// <picture> with AVIF and WebP sources and a JPEG <img>, width/height and
// sizes, LCP hints, no load-gated opacity, text before the photo in the DOM
// (mobile shows the name and CTAs first), in EN and TR. The TR pages are
// not live yet, so the route table is mocked as after SEO-11 Adım B (as in
// tests/frontend/motion/hero.test.jsx).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT } from "./support.js";
import home from "../../../src/pages/home/home.module.css";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

const { Home } = await import("../../../src/pages/home/index.jsx");

const SIZES = "(max-width: 991.98px) 100vw, 50vw";
const srcset = (ext) =>
  [640, 768, 1000, 1284]
    .map((w) => `/img/hero/cengizhan-kose-v1-${w}.${ext} ${w}w`)
    .join(", ");

function renderHome(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Home />
    </MemoryRouter>,
  );
}

const box = () => document.querySelector(`.${home.heroImage}`);
const photo = () => screen.getByRole("img", { name: "Cengizhan Köse" });

beforeEach(() => {
  // Reset what usePageMeta writes, but keep React's own preload <link>: React
  // dedupes preloads per document and would not insert it again.
  document.head
    .querySelectorAll(':not(link[rel="preload"])')
    .forEach((element) => element.remove());
});

describe.each(["/", "/tr"])("%s hero photo", (path) => {
  it("is a <picture>: AVIF, then WebP, then the JPEG <img> (PERF-02, FE-18)", () => {
    renderHome(path);

    const picture = box().querySelector("picture");
    expect(picture).not.toBeNull();
    expect(
      [...picture.children].map((el) => [el.tagName, el.getAttribute("type")]),
    ).toEqual([
      ["SOURCE", "image/avif"],
      ["SOURCE", "image/webp"],
      ["IMG", null],
    ]);
    const [avif, webp] = picture.querySelectorAll("source");
    expect(avif).toHaveAttribute("srcset", srcset("avif"));
    expect(avif).toHaveAttribute("sizes", SIZES);
    expect(webp).toHaveAttribute("srcset", srcset("webp"));
    expect(webp).toHaveAttribute("sizes", SIZES);
  });

  it("the <img> carries the JPEG srcset, a 768w src, its size and the alt text (DSG-29, SEO-26)", () => {
    renderHome(path);

    const img = photo();
    expect(img.closest("picture")).not.toBeNull();
    expect(img).toHaveAttribute("src", "/img/hero/cengizhan-kose-v1-768.jpg");
    expect(img).toHaveAttribute("srcset", srcset("jpg"));
    expect(img).toHaveAttribute("sizes", SIZES);
    expect(img).toHaveAttribute("width", "1284");
    expect(img).toHaveAttribute("height", "1654");
    expect(img).toHaveAttribute("alt", "Cengizhan Köse");
  });

  it("asks for the photo early: fetchpriority high, loading eager (PERF-02 step 3, PERF-07 step 4)", () => {
    renderHome(path);

    expect(photo()).toHaveAttribute("fetchpriority", "high");
    expect(photo()).toHaveAttribute("loading", "eager");
  });

  it("draws the photo from its first frame: no inline opacity, no placeholder element, no onLoad gate (PERF-07, FE-18)", () => {
    renderHome(path);

    expect(photo()).not.toHaveAttribute("style");
    expect(document.querySelector(".img-placeholder")).toBeNull();
    expect(box().children).toHaveLength(1);
    // Nothing changes when the bytes arrive.
    const before = box().outerHTML;
    photo().dispatchEvent(new Event("load"));
    expect(box().outerHTML).toBe(before);
  });

  it("puts the text before the photo in the DOM, so phones show the name and CTAs first (FE-18 step 5, DSG-11 step 4)", () => {
    renderHome(path);

    const text = document.querySelector(`.${home.hero} > .${home.heroText}`);
    const image = document.querySelector(`.${home.hero} > .${home.heroImage}`);
    expect([...document.querySelector(`.${home.hero}`).children]).toEqual([
      text,
      image,
    ]);
    expect(
      text.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // h-100 (height:100% !important) overrode the mobile box size (DSG-11
    // step 1); since FE-01 the hero is a CSS grid and neither half carries a
    // Bootstrap helper: the module classes are the whole class list.
    expect(image.className).toBe(home.heroImage);
    expect(text.className).toBe(home.heroText);
  });

  it("every file the markup lists exists under public/", () => {
    renderHome(path);

    const urls = [
      photo().getAttribute("src"),
      ...[...box().querySelectorAll("[srcset]")].flatMap((el) =>
        el
          .getAttribute("srcset")
          .split(",")
          .map((candidate) => candidate.trim().split(" ")[0]),
      ),
    ];
    expect(urls).toHaveLength(13);
    for (const url of urls) {
      expect(existsSync(join(ROOT, "public", url)), url).toBe(true);
    }
  });
});

describe("LCP preload hint until the server writes it (PERF-01 in W7)", () => {
  it("preloads the AVIF srcset with the same sizes, type and high priority", () => {
    renderHome("/");

    const links = document.head.querySelectorAll(
      'link[rel="preload"][as="image"]',
    );
    expect(links).toHaveLength(1);
    const [link] = links;
    expect(link).toHaveAttribute("imagesrcset", srcset("avif"));
    expect(link).toHaveAttribute("imagesizes", SIZES);
    expect(link).toHaveAttribute("type", "image/avif");
    expect(link).toHaveAttribute("fetchpriority", "high");
    // With imagesrcset the browser picks the candidate itself; an href
    // would make browsers without imagesrcset support fetch a second file.
    expect(link).not.toHaveAttribute("href");
  });
});
