// Ambient types for the two dev-side packages the SSR tests use and that ship
// none here (no @types/jsdom, no @types/react-dom), so `bun run typecheck`
// (BE-17) can check them. Only the surface these tests call is declared.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: object);
    readonly window: Window & typeof globalThis;
  }
}

declare module "react-dom/server" {
  export function renderToStaticMarkup(element: unknown): string;
}
