#!/usr/bin/env bun
// Writes scripts/mermaid.light.json and scripts/mermaid.dark.json from
// publishConfig() (PERF-05). Run it after a change to the theme tokens
// (src/lib/mermaidTheme.js); tests/server/mermaid fails while the files and
// the code disagree.
//
//   bun scripts/lib/write-mermaid-config.ts
import { configPath, publishConfig, THEMES } from "./render-mermaid";

for (const theme of THEMES) {
  await Bun.write(
    configPath(theme),
    `${JSON.stringify(publishConfig(theme), null, 2)}\n`,
  );
  console.log(`wrote ${configPath(theme)}`);
}
