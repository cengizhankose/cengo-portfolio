// Language switcher (FE-14 criterion 5, DSG-19 steps 5-8 / criteria 3-4,
// SEO-11 step 11). The route table is mocked with every language open (the
// switcher is hidden until then; see the last block for today's table).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import switcherStyles from "../../../src/components/langswitch/langswitch.module.css";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

const { LanguageSwitcher } =
  await import("../../../src/components/langswitch/index.jsx");
const { setPostTranslations } =
  await import("../../../src/components/langswitch/postTranslations.js");
const { switchTarget } =
  await import("../../../src/components/langswitch/target.js");
const { matchRoute } = await import("../../../src/seo/routes.js");
const { default: Headermain } = await import("../../../src/header");
const { default: BlogPost } =
  await import("../../../src/pages/blog/BlogPost.jsx");

let location;
function Probe() {
  location = useLocation();
  return null;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route path="*" element={<LanguageSwitcher />} />
      </Routes>
    </MemoryRouter>,
  );
}

const nav = () => screen.getByRole("navigation", { name: /Language|Dil/ });
const current = () => nav().querySelector('[aria-current="true"]');
const other = () => nav().querySelector(`a.${switcherStyles.item}`);
const attrs = (el) => [
  el.getAttribute("href"),
  el.getAttribute("hreflang"),
  el.getAttribute("lang"),
];

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("theme", "dark");
});

afterEach(() => {
  act(() => setPostTranslations(null));
});

describe("static pages (FE-14 criterion 5, DSG-19 criterion 3)", () => {
  it("/about: EN is current, TR links to /tr/about", () => {
    renderAt("/about");

    expect(current().tagName).toBe("SPAN");
    expect(current().textContent).toMatch(/^EN/);
    expect(current()).toHaveAttribute("lang", "en");
    expect(attrs(other())).toEqual(["/tr/about", "tr", "tr"]);
    expect(other().getAttribute("aria-label")).toBe("TR – Türkçe");
    expect(other().getAttribute("aria-label")).toMatch(/^TR/);
    expect(nav()).toHaveAttribute("aria-label", "Language");
  });

  it("/tr/about: TR is current, EN links to /about", () => {
    renderAt("/tr/about");

    expect(current().textContent).toMatch(/^TR/);
    expect(attrs(other())).toEqual(["/about", "en", "en"]);
    expect(other().getAttribute("aria-label")).toBe("EN – English");
    expect(nav()).toHaveAttribute("aria-label", "Dil");
  });

  it("keeps the order EN, TR in both languages and has one link only", () => {
    for (const path of ["/", "/tr"]) {
      const { unmount } = renderAt(path);
      const items = [...nav().querySelectorAll(`.${switcherStyles.item}`)];
      expect(items.map((item) => item.textContent.slice(0, 2))).toEqual([
        "EN",
        "TR",
      ]);
      expect(within(nav()).getAllByRole("link")).toHaveLength(1);
      unmount();
    }
    renderAt("/tr");
    expect(attrs(other())).toEqual(["/", "en", "en"]);
  });

  it("the home page and the blog list map to their counterparts", () => {
    expect(switchTarget(matchRoute("/"), "tr")).toEqual({
      href: "/tr",
      exact: true,
    });
    expect(switchTarget(matchRoute("/tr/blog"), "en")).toEqual({
      href: "/blog",
      exact: true,
    });
    expect(switchTarget(matchRoute("/tr/nope"), "en")).toEqual({
      href: "/",
      exact: true,
    });
  });
});

describe("posts (FE-14 criterion 5, DSG-19 step 6)", () => {
  it("a TR post without translation: EN goes to /blog and says so", () => {
    renderAt("/tr/blog/sadece-turkce");
    act(() =>
      setPostTranslations({
        lang: "tr",
        slug: "sadece-turkce",
        translations: [],
      }),
    );

    expect(attrs(other())).toEqual(["/blog", "en", "en"]);
    expect(other().getAttribute("aria-label")).toBe(
      "EN – English, blog index (this post has no translation)",
    );
  });

  it("an EN post without translation: TR goes to /tr/blog (çevirisi yok)", () => {
    renderAt("/blog/hello-world");
    act(() =>
      setPostTranslations({
        lang: "en",
        slug: "hello-world",
        translations: [],
      }),
    );
    expect(attrs(other())).toEqual(["/tr/blog", "tr", "tr"]);
    expect(other().getAttribute("aria-label")).toContain("çevirisi yok");
  });

  it("a post with a translation links to the translated post", () => {
    renderAt("/blog/hello-world");
    act(() =>
      setPostTranslations({
        lang: "en",
        slug: "hello-world",
        translations: [{ lang: "tr", slug: "merhaba-dunya" }],
      }),
    );
    expect(attrs(other())).toEqual(["/tr/blog/merhaba-dunya", "tr", "tr"]);
    expect(other().getAttribute("aria-label")).toBe("TR – Türkçe");
  });

  it("ignores another post's translations and unsafe slugs", () => {
    const route = matchRoute("/blog/hello-world");
    expect(
      switchTarget(route, "tr", {
        lang: "en",
        slug: "other-post",
        translations: [{ lang: "tr", slug: "baska" }],
      }),
    ).toEqual({ href: "/tr/blog", exact: false });
    expect(
      switchTarget(route, "tr", {
        lang: "en",
        slug: "hello-world",
        translations: [{ lang: "tr", slug: "../../evil" }],
      }),
    ).toEqual({ href: "/tr/blog", exact: false });
  });
});

describe("in the header (DSG-19 step 5)", () => {
  it("sits in the right group, just left of the theme toggle", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <Headermain />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole("button", { name: "Dark theme" });
    const switcher = screen.getByRole("navigation", { name: "Language" });
    expect(switcher.parentElement).toBe(toggle.parentElement);
    expect(switcher.nextElementSibling).toBe(toggle);
  });

  it("follows the open post to its translation (BlogPost publishes it)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: 1,
          slug: "hello-world",
          title: "Hello world",
          content: "Body",
          lang: "en",
          translationKey: "hello",
          translations: [{ lang: "tr", slug: "merhaba-dunya" }],
          createdAt: "2026-01-15T12:00:00.000Z",
        }),
      ),
    );
    render(
      <MemoryRouter initialEntries={["/blog/hello-world"]}>
        <Headermain />
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>,
    );
    // Before the post has loaded: the TR blog index (not exact).
    expect(attrs(other())).toEqual(["/tr/blog", "tr", "tr"]);
    await screen.findByRole("heading", { level: 1, name: "Hello world" });
    expect(attrs(other())).toEqual(["/tr/blog/merhaba-dunya", "tr", "tr"]);
  });
});

describe("no remembered preference (T-12)", () => {
  it("following the link sets no cookie and no new storage key", async () => {
    const user = userEvent.setup();
    const before = Object.keys(window.localStorage);
    renderAt("/about");

    await user.click(other());

    expect(location.pathname).toBe("/tr/about");
    expect(document.cookie).toBe("");
    expect(Object.keys(window.localStorage)).toEqual(before);
    expect(Object.keys(window.localStorage)).toEqual(["theme"]);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("styles (DSG-19 step 7, criteria 3-4; checked on the CSS source)", () => {
  const css = readFileSync(
    join(process.cwd(), "src/components/langswitch/langswitch.module.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  const rule = (selector) => {
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (match[1].trim() === selector) return match[2];
    }
    return "";
  };

  // FE-01: the two items are header tabs: --header-height (50px) tall at
  // every width, at least --tap-touch (44px) wide.
  it("every item is at least 44px wide and a 50px header tab tall", () => {
    expect(rule(".item")).toMatch(/min-width:\s*var\(--tap-touch\)/);
    expect(rule(".item")).toMatch(/min-height:\s*var\(--header-height\)/);
    const tokens = readFileSync(
      join(process.cwd(), "src/styles/tokens.css"),
      "utf8",
    );
    expect(tokens).toMatch(/--tap-touch:\s*44px;/);
    expect(tokens).toMatch(/--header-height:\s*50px;/);
  });

  it("marks the current language by weight and underline, the other at 400", () => {
    expect(rule(".item")).toMatch(/font:\s*400 /);
    expect(rule(".item[aria-current]")).toMatch(/font-weight:\s*700/);
    expect(rule(".item[aria-current]")).toMatch(
      /box-shadow:\s*inset 0 -2px 0 var\(--text-color\)/,
    );
  });

  it("shows a 2px solid focus ring in the text colour", () => {
    expect(rule("a.item:focus-visible")).toMatch(
      /outline:\s*2px solid var\(--text-color\)/,
    );
  });
});
