/**
 * DSG-01: the About work-timeline table must not inherit Bootstrap 5.3's white
 * --bs-body-bg cell background. The computed-style half of the criterion (dark:
 * transparent cell + white text, light: black text) needs a real browser and is
 * checked on a local build; this guards the rule itself.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const css = readFileSync(
  join(ROOT, "src", "pages", "about", "style.css"),
  "utf8",
);
const about = readFileSync(
  join(ROOT, "src", "pages", "about", "index.jsx"),
  "utf8",
);

function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  expect(block).not.toBeNull();
  return Object.fromEntries(
    block![1]
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
      }),
  );
}

describe("About timeline table (DSG-01)", () => {
  test("table variables are bound to the theme, cell background is transparent", () => {
    const decl = declarations(".About-header .table");
    expect(decl["--bs-table-bg"]).toBe("transparent");
    expect(decl["--bs-table-color"]).toBe("var(--text-color)");
    expect(decl["--bs-table-border-color"]).toContain("var(--text-color)");
    expect(Object.values(decl).join(" ")).not.toContain("!important");
  });

  test("the colour-only override that left the white cell background is gone", () => {
    expect(css).not.toMatch(/\.table td,\s*\.table th\s*\{/);
  });

  test("the rule is scoped to the page that renders the table", () => {
    expect(about).toContain('className="About-header"');
    expect(about).toMatch(/<table className="table\b/);
  });
});
