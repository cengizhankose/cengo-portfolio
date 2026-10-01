// Bun side of the CSS Modules test environment (FE-20). The server tests run
// the real entry-server.jsx straight from source under Bun, and Bun's runtime
// answers `import styles from "./x.module.css"` with an empty object, which
// would print `class="undefined"`. This plugin answers with the identity map
// ({ siteHeader: "siteHeader" }), the same names Vitest produces when it runs
// with css.modules.classNameStrategy = "non-scoped" (vite.config.js, `test`),
// so the markup Bun draws and the markup the jsdom tests hydrate it with
// carry the same classes. Production does not use this: `vite build` hashes
// the names in both the client and the server bundle.
//
// Loaded by bunfig.toml ([test] preload) and, for the helper processes the
// hydration tests start, by an import at the top of those helpers.
import { plugin } from "bun";
import { readFileSync } from "node:fs";

/** Local class names of a CSS Module: every `.name` outside :global(...). */
export function localClassNames(css: string): string[] {
  const names = new Set<string>();
  const plain = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/:global\([^)]*\)/g, "");
  for (const match of plain.matchAll(/(?<!\d)\.(-?[_a-zA-Z][\w-]*)/g)) {
    names.add(match[1]);
  }
  return [...names];
}

plugin({
  name: "css-modules-identity",
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, ({ path }) => ({
      exports: {
        default: Object.fromEntries(
          localClassNames(readFileSync(path, "utf8")).map((name) => [
            name,
            name,
          ]),
        ),
      },
      loader: "object",
    }));
  },
});
