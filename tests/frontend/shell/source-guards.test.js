// @vitest-environment node
//
// Static guards for the route shell (PERF-13, FE-17, ANL-07, ANL-05): the
// acceptance greps of the plans, kept as tests so the old transition machinery
// cannot come back and the page-type vocabulary keeps one source.
import { describe, expect, it } from "vitest";
import { read, sourceFiles, stripComments } from "./support.js";

const SRC = sourceFiles("src");
const code = (file) => stripComments(read(file));

describe("no exit animation machinery left (FE-17, PERF-13 criteria)", () => {
  it("no file in src/ mentions fadeOut, displayLocation or transitionStage", () => {
    const offenders = SRC.filter((file) =>
      /fadeOut|displayLocation|transitionStage/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("routes.jsx has no displayLocation, transitionStage, onAnimationEnd or animationend", () => {
    expect(read("src/app/routes.jsx")).not.toMatch(
      /displayLocation|transitionStage|onAnimationEnd|animationend/i,
    );
  });

  it("App.css has no fadeOut and no 400 ms", () => {
    expect(read("src/app/App.css")).not.toMatch(/fadeOut|400ms/);
  });
});

describe("one scroll point (PERF-13 step 5)", () => {
  it("window.scrollTo is called from src/app/routes.jsx only", () => {
    const callers = SRC.filter(
      (file) => /\.jsx?$/.test(file) && /\bscrollTo\(/.test(code(file)),
    );
    expect(callers).toEqual(["src/app/routes.jsx"]);
  });

  it("the shell has a single scrollTo call", () => {
    const calls = code("src/app/routes.jsx").match(/\bscrollTo\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it("App.jsx no longer wraps the app in a scroll component", () => {
    expect(code("src/app/App.jsx")).not.toMatch(/ScrollToTop|scrollTo/);
  });
});

describe("the shell keeps its landmark contract (FE-10)", () => {
  const shell = code("src/app/routes.jsx");

  it("keeps <main id=main tabIndex={-1}> and the focus-to-main effect on the pathname", () => {
    expect(shell).toMatch(/<main id="main" tabIndex=\{-1\}/);
    expect(shell).toMatch(/focus\(\{ preventScroll: true \}\)/);
    expect(shell).toMatch(/\[pathname, hash, focusTargetRef\]/);
  });

  it("calls the page view hook once, from the shell", () => {
    expect(shell.match(/usePageViewTracking\(\)/g)).toHaveLength(1);
    const callers = SRC.filter((file) =>
      /usePageViewTracking\(\)/.test(code(file)),
    ).filter((file) => !file.endsWith("usePageViewTracking.js"));
    expect(callers).toEqual(["src/app/routes.jsx"]);
  });
});

describe("one page-type source (ANL-07, ANL-06)", () => {
  it("webVitals.js takes page_type and ui_locale from pageType.js, with no route table", () => {
    const source = code("src/lib/webVitals.js");

    expect(source).toMatch(/from "\.\/analytics\/pageType\.js"/);
    expect(source).toMatch(/getPageType\(/);
    expect(source).toMatch(/getUiLocale\(/);
    expect(source).not.toMatch(/STATIC_PAGE_TYPES|splitLocalePrefix|blog_post/);
  });

  it("no other file keeps a pathname -> page_type table", () => {
    const tables = SRC.filter((file) => /\.jsx?$/.test(file))
      .filter((file) => !file.endsWith("analytics/pageType.js"))
      .filter((file) => !file.endsWith("analytics/events.js"))
      .filter((file) => /["']blog_index["']\s*[,:}]/.test(code(file)));
    expect(tables).toEqual([]);
  });

  it("the not-found page reports through the one track() API", () => {
    const source = code("src/pages/notfound/index.jsx");
    expect(source).toMatch(/track\("not_found_viewed"/);
    expect(source).not.toMatch(/trackPageview|page_view/);
    expect(source).not.toMatch(/window\.umami/);
  });
});
