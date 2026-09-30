// @vitest-environment node
//
// Quality-net guards (FE-22, FE-31, SEC-27, T-02): the lint config really
// rejects an inaccessible click target, and package.json keeps the agreed
// scripts and dependency split. Pure Node checks, no DOM. The probes take
// their text as a prop: a literal would trip react/jsx-no-literals (FE-14,
// covered in tests/frontend/i18n/extraction.test.js).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));

async function lintSource(code) {
  const eslint = new ESLint({ cwd: ROOT });
  // Any path under src/**/*.jsx picks up the app config; the file need not exist.
  const [result] = await eslint.lintText(code, {
    filePath: `${ROOT}src/components/quality-net-probe/index.jsx`,
  });
  return result;
}

describe("ESLint config (FE-22)", () => {
  it("fails a click handler on a static <div> with jsx-a11y errors", async () => {
    const result = await lintSource(
      [
        "export const Toggle = ({ onToggle, label }) => (",
        '  <div className="nav_ac" onClick={onToggle}>',
        "    {label}",
        "  </div>",
        ");",
        "",
      ].join("\n"),
    );

    const errors = result.messages
      .filter((message) => message.severity === 2)
      .map((message) => message.ruleId);
    expect(errors).toEqual(
      expect.arrayContaining([
        "jsx-a11y/click-events-have-key-events",
        "jsx-a11y/no-static-element-interactions",
      ]),
    );
  });

  it("accepts the same control written as a native <button>", async () => {
    const result = await lintSource(
      [
        "export const Toggle = ({ onToggle, label }) => (",
        '  <button type="button" onClick={onToggle}>',
        "    {label}",
        "  </button>",
        ");",
        "",
      ].join("\n"),
    );

    expect(result.messages).toEqual([]);
  });
});

describe("package.json (T-02, FE-22, FE-31, SEC-27)", () => {
  it("runs both test layers from one script", () => {
    expect(pkg.scripts.test).toMatch(
      /^bun test tests\/server( --pass-with-no-tests)? && vitest run$/,
    );
  });

  it("exposes lint and format commands", () => {
    expect(pkg.scripts.lint).toMatch(/^eslint src( --max-warnings=\d+)?$/);
    expect(pkg.scripts["format:check"]).toBe("prettier --check .");
    expect(pkg.scripts.format).toBe("prettier --write .");
  });

  it("drops CRA and GitHub Pages leftovers", () => {
    expect(pkg).not.toHaveProperty("eslintConfig");
    expect(pkg).not.toHaveProperty("browserslist");
    expect(pkg.scripts).not.toHaveProperty("deploy");
    expect(pkg.scripts).not.toHaveProperty("predeploy");
  });

  it("keeps build and test tooling out of runtime dependencies", () => {
    const runtime = Object.keys(pkg.dependencies ?? {});
    const dev = Object.keys(pkg.devDependencies ?? {});

    expect(
      runtime.filter((name) =>
        /^(@babel\/core|@testing-library\/|gh-pages|postcss|eslint|prettier|vitest|jsdom)/.test(
          name,
        ),
      ),
    ).toEqual([]);
    expect(dev).not.toContain("gh-pages");
    expect(dev).not.toContain("postcss-safe-parser");
    expect(dev).toEqual(
      expect.arrayContaining([
        "@testing-library/jest-dom",
        "@testing-library/react",
        "@testing-library/user-event",
        "eslint",
        "prettier",
        "vitest",
        "jsdom",
      ]),
    );
  });

  it("keeps web-vitals for real-user metrics (PERF-23, T-13)", () => {
    expect(pkg.dependencies).toHaveProperty("web-vitals");
  });
});
