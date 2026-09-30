// Ambient types for dev-only packages that ship none, so `bun run typecheck`
// can check scripts/lib/** (PERF-05). jsdom has no bundled declarations; only
// what the publish script uses is declared: a DOM window to hand to DOMPurify
// (src/lib/markdown/sanitizeSvg.js) and to parse an SVG string.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: { contentType?: string });
    readonly window: Window & typeof globalThis;
  }
}
