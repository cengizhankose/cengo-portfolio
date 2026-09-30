// @vitest-environment node
//
// FE-14 criterion 2 (text extraction): react/jsx-no-literals guards
// src/{pages,header,components}, the whole src/ lints clean, and nothing
// under src/ reads the old src/content_option.js any more (the file itself
// is a deprecated shim until the W4 merge deletes it; handoff).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function sourceFiles(dir = "src") {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(jsx?|tsx?)$/.test(entry.name) ? [path] : [];
    },
  );
}

async function lintText(code, file) {
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(code, {
    filePath: join(ROOT, file),
  });
  return result.messages.map((message) => message.ruleId);
}

describe("react/jsx-no-literals (FE-14 step 5)", () => {
  it.each([
    "src/pages/probe/index.jsx",
    "src/header/probe.jsx",
    "src/components/probe/index.jsx",
  ])("rejects visible literal text in %s", async (file) => {
    const rules = await lintText(
      "export const P = () => <p>Hello there</p>;\n",
      file,
    );
    expect(rules).toContain("react/jsx-no-literals");
  });

  it("allows props, punctuation and translated text", async () => {
    const rules = await lintText(
      [
        "export const P = ({ t }) => (",
        '  <p className="x" aria-label={t("a")}>',
        "    <span>©</span> <span>·</span> <span>—</span> <span>–</span>",
        '    <span>→</span> <span>←</span> <span>|</span> {t("b")}',
        "  </p>",
        ");",
        "",
      ].join("\n"),
      "src/pages/probe/index.jsx",
    );
    expect(rules).toEqual([]);
  });

  it("is configured for exactly those folders", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const config = await eslint.calculateConfigForFile(
      join(ROOT, "src/pages/about/index.jsx"),
    );
    expect(config.rules["react/jsx-no-literals"]).toEqual([
      2,
      expect.objectContaining({ noStrings: true, ignoreProps: true }),
    ]);
    const app = await eslint.calculateConfigForFile(
      join(ROOT, "src/app/routes.jsx"),
    );
    expect(app.rules["react/jsx-no-literals"]).toBeUndefined();
  });
});

describe("the whole of src lints clean (FE-14 criterion 2: bun run lint)", () => {
  it("reports no errors or warnings", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const results = await eslint.lintFiles(["src"]);
    const findings = results.flatMap(({ filePath, messages }) =>
      messages.map(
        ({ ruleId, line }) =>
          `${filePath.slice(ROOT.length)}:${line} ${ruleId}`,
      ),
    );
    expect(findings).toEqual([]);
  }, 60_000);
});

describe("content_option.js is no longer read (FE-14 step 6)", () => {
  it("no module under src imports it", () => {
    const importers = sourceFiles().filter((file) =>
      /(from\s+|import\(\s*)["'][^"']*content_option/.test(
        readFileSync(join(ROOT, file), "utf8"),
      ),
    );
    expect(importers).toEqual([]);
  });

  it("no other file names it (except one out-of-scope comment)", () => {
    // After the merge deletes the shim, the literal FE-14 grep
    // (grep -rn "content_option" src) can only hit one comment line in
    // src/components/socialicons/icons.js (outside W4's scope; handoff).
    const mentions = sourceFiles().filter(
      (file) =>
        file !== "src/components/socialicons/icons.js" &&
        /content_option/.test(readFileSync(join(ROOT, file), "utf8")),
    );
    expect(mentions).toEqual([]);
  });

  it("pages and chrome read content and text from the new modules", () => {
    const read = (file) => readFileSync(join(ROOT, file), "utf8");
    expect(read("src/header/index.jsx")).toMatch(/\buseT\(/);
    for (const file of [
      "src/pages/home/index.jsx",
      "src/pages/about/index.jsx",
      "src/pages/contact/index.jsx",
      "src/pages/portfolio/index.jsx",
      "src/pages/blog/BlogHome.jsx",
      "src/pages/blog/BlogPost.jsx",
      "src/pages/notfound/index.jsx",
    ]) {
      expect(read(file), file).toMatch(/\buseT\(/);
      expect(read(file), file).toMatch(/\buseRoute\(\)/);
    }
    expect(read("src/pages/notfound/index.jsx")).not.toMatch(/copy\.js/);
  });
});
