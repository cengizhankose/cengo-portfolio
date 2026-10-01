// @vitest-environment node
//
// Static checks for the contact package. jsdom loads no stylesheets, so the
// DSG-04 / DSG-13 computed-style criteria are checked on the CSS source; the
// grep criteria of MKT-11, MKT-09, SEC-24 and FE-24 run on the files.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

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

describe("contact form styles (DSG-04, DSG-13)", () => {
  const css = read("src/pages/contact/style.css");

  it("colours labels with the text token", () => {
    expect(declarations(css, ".contact__form .form-label")).toMatchObject({
      color: "var(--text-color)",
    });
  });

  it("colours placeholders with the --text-muted token at full opacity", () => {
    expect(
      declarations(css, ".contact__form .form-control::placeholder"),
    ).toEqual({ color: "var(--text-muted)", opacity: "1" });
  });

  it("keeps the focused field on the theme colours without the blue glow", () => {
    expect(declarations(css, ".contact__form .form-control:focus")).toEqual({
      color: "var(--text-color)",
      "background-color": "var(--bg-color)",
      "border-color": "var(--text-color)",
      "box-shadow": "none",
    });
  });

  it("draws a 2px solid text-colour ring on focus-visible fields and the button", () => {
    expect(
      declarations(css, ".contact__form .form-control:focus-visible"),
    ).toEqual({
      outline: "2px solid var(--text-color)",
      "outline-offset": "2px",
    });
    expect(declarations(css, ".contact__form .ac_btn:focus-visible")).toEqual({
      outline: "2px solid var(--text-color)",
      "outline-offset": "3px",
    });
    expect(declarations(css, ".co_alert:focus-visible")).toEqual({
      outline: "2px solid var(--text-color)",
      "outline-offset": "2px",
    });
  });

  it("leaves field spacing to the mb-3 wrappers (DSG-34)", () => {
    const inputs = declarations(css, ".contact__form input.form-control");
    expect(inputs).not.toHaveProperty("margin-bottom");
  });

  it("moves the honeypot off screen instead of display:none", () => {
    const trap = declarations(css, ".contact__hp");
    expect(trap).toMatchObject({ position: "absolute", left: "-10000px" });
    expect(trap).not.toHaveProperty("display");
  });
});

describe("contact source (MKT-11, MKT-09, FE-36, W1 lint handoff)", () => {
  const page = read("src/pages/contact/index.jsx");

  it("updates the form state only with functional updates", () => {
    // MKT-11: grep -nE "setFormdata\(\{" → 0 lines
    expect(page).not.toMatch(/setFormdata\(\{/);
  });

  it("never renders the raw EmailJS error text", () => {
    const lines = page.split("\n").filter((line) => /error\.text/.test(line));
    expect(lines.every((line) => /console\./.test(line))).toBe(true);
    expect(page).not.toMatch(/`[^`]*\$\{error/);
  });

  it("has no prototype-builtins call and no phone-number branch", () => {
    expect(page).not.toMatch(/hasOwnProperty/);
    expect(page).not.toMatch(/YOUR_FONE/);
  });

  it("keeps the status messages free of exclamation marks and typos", async () => {
    // FE-14: the messages live in src/i18n/{en,tr}/contact.js.
    const { DICTIONARIES } = await import("../../../src/i18n/translate.js");
    for (const dict of Object.values(DICTIONARIES)) {
      const texts = ["success", "error", "rateLimited", "emailMe"].map(
        (key) => dict[`contact.${key}`],
      );
      for (const text of texts) {
        expect(text).not.toContain("!");
        expect(text).not.toMatch(/thankyou|messege|faild/i);
      }
      expect(dict["contact.error"]).toContain("{emailMe}");
      expect(dict["contact.rateLimited"]).toContain("{emailMe}");
    }
  });
});

describe("EmailJS SDK (SEC-24, FE-24)", () => {
  const pkg = JSON.parse(read("package.json"));

  it("depends on @emailjs/browser and no longer on emailjs-com", () => {
    expect(pkg.dependencies["@emailjs/browser"]).toBeTruthy();
    expect(Object.keys(pkg.dependencies)).not.toContain("emailjs-com");
    expect(read("package.json")).not.toContain("emailjs-com");
    expect(read("bun.lock")).not.toContain("emailjs-com");
  });

  // v4 reads localStorage while its module loads and throws SecurityError
  // when site data is blocked. A static import put it in the main chunk and
  // blanked every route, so the contact page loads it with import() on send.
  it("loads the v4 SDK on demand, never with a static import", () => {
    const page = read("src/pages/contact/index.jsx");
    expect(page).toMatch(/import\(\s*"@emailjs\/browser"\s*\)/);
    expect(page).not.toMatch(/from\s+["']@emailjs\/browser["']/);
    expect(page).not.toMatch(/^\s*import\s+["']@emailjs\/browser["']/m);
    expect(page).not.toContain("emailjs-com");
  });

  it("is not imported statically anywhere in src", () => {
    const sources = readdirSync(`${ROOT}src`, { recursive: true }).filter(
      (file) => /\.(jsx?|tsx?|mjs)$/.test(file),
    );
    const staticImports = sources.filter((file) =>
      /(from\s+|^\s*import\s+)["']@emailjs\//m.test(read(`src/${file}`)),
    );
    expect(sources.length).toBeGreaterThan(20);
    expect(staticImports).toEqual([]);
  });
});

describe("lint (W3 gate: zero findings in this package's files)", () => {
  it("reports no errors or warnings", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const results = await eslint.lintFiles([
      "src/pages/contact/index.jsx",
      "src/pages/about/index.jsx",
      "src/pages/home/index.jsx",
      "src/pages/portfolio/index.jsx",
      "src/header/index.jsx",
      "src/content/shared.js",
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
