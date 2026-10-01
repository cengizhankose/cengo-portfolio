// @vitest-environment node
//
// Static guards for this package (FE-02, DSG-02, DSG-03, FE-10, DSG-14):
// - the focus ring and skip-link rules exist in the CSS (jsdom does not load
//   stylesheets, so computed-style criteria are checked on the source), and
// - ESLint (jsx-a11y + react-hooks) reports nothing in the files this
//   package owns.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { BASE_CSS, TOKENS_CSS } from "../css-arch/global-css.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (file) => readFileSync(`${ROOT}${file}`, "utf8");

// Declarations of the first rule whose selector list contains `selector`.
function declarations(css, selector) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((part) => part.trim());
    if (selectors.includes(selector)) {
      return Object.fromEntries(
        match[2]
          .split(";")
          .map((decl) => decl.trim())
          .filter(Boolean)
          .map((decl) => {
            const colon = decl.indexOf(":");
            return [decl.slice(0, colon).trim(), decl.slice(colon + 1).trim()];
          }),
      );
    }
  }
  return null;
}

describe("header focus styles (DSG-02, DSG-03, FE-02)", () => {
  const css = read("src/header/header.module.css");

  it("draws a 2px solid focus-visible ring on header controls", () => {
    expect(declarations(css, ".navAction:focus-visible")).toMatchObject({
      outline: "2px solid var(--text-color)",
    });
  });

  it("uses the same ring on the menu and social strip links", () => {
    expect(declarations(css, ".siteNavigation a:focus-visible")).toMatchObject({
      outline: "2px solid var(--text-color)",
    });
    expect(
      declarations(
        read("src/components/socialicons/socialicons.module.css"),
        ".rail a:focus-visible",
      ),
    ).toMatchObject({ outline: "2px solid var(--text-color)" });
  });

  it("no longer resets the menu button on :focus", () => {
    expect(declarations(css, ".menuButton:focus")).toBeNull();
    expect(css).not.toMatch(/:focus\s*[,{][^}]*box-shadow:\s*unset/);
  });

  it("shows the opened menu panel at once so its first link can take focus (FE-11)", () => {
    // A transitioned visibility keeps the links hidden (unfocusable) at the
    // start of the slide-down; closing may still delay it.
    expect(declarations(css, ".menuOpen .menuPanel").transition).toMatch(
      /visibility 0s(?! linear 0\.)/,
    );
    expect(declarations(css, ".menuPanel").transition).not.toMatch(/\ball\b/);
  });

  it("gives button controls a pointer and centres the theme icon", () => {
    expect(declarations(css, "button.navAction")).toMatchObject({
      cursor: "pointer",
    });
    expect(declarations(css, ".themeToggle")).toMatchObject({
      display: "inline-flex",
      "align-items": "center",
    });
  });
});

describe("skip link and <main> styles (FE-10, DSG-14)", () => {
  const css = BASE_CSS;

  it("keeps the skip link off screen until focused, above the page frame", () => {
    const base = declarations(css, ".skip-link");
    expect(base).toMatchObject({ position: "fixed", top: "16px" });
    // The skip link sits on the --z-skip-link layer, above the page frame.
    expect(base["z-index"]).toBe("var(--z-skip-link)");
    const z = (name) =>
      Number(new RegExp(`--z-${name}:\\s*(\\d+)`).exec(TOKENS_CSS)[1]);
    expect(z("skip-link")).toBeGreaterThan(z("frame"));
    expect(base.transform).toMatch(/^translateY\(/);
    expect(declarations(css, ".skip-link:focus")).toMatchObject({
      transform: "none",
    });
  });

  it("does not draw a ring around the programmatically focused <main>", () => {
    expect(declarations(css, "#main:focus")).toMatchObject({
      outline: "none",
    });
  });
});

describe("lint (package acceptance: zero jsx-a11y / hooks findings)", () => {
  it("reports no errors or warnings in the nav, header and social files", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const results = await eslint.lintFiles([
      "src/header/index.jsx",
      "src/components/themetoggle/index.jsx",
      "src/components/socialicons/index.jsx",
      "src/components/socialicons/icons.js",
      "src/app/routes.jsx",
    ]);

    const findings = results.flatMap(({ filePath, messages }) =>
      messages.map(
        ({ ruleId, line }) =>
          `${filePath.slice(ROOT.length)}:${line} ${ruleId}`,
      ),
    );
    expect(findings).toEqual([]);
  });
});
