// Ambient types for dev-only packages that ship none, so `bun run typecheck`
// (BE-17) can check the server-side TypeScript that uses them.
//
// opentype.js 2.x has no bundled declarations, and @types/opentype.js
// describes 1.x (its Path.toPathData only takes a number, 2.x also takes an
// options object). Only the surface used by scripts/brand/build-brand-assets.ts
// and tests/server/brand/** is declared; extend it when more is needed.
declare module "opentype.js" {
  export interface PathCommand {
    type: "M" | "L" | "C" | "Q" | "Z";
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  export interface PathDataOptions {
    decimalPlaces?: number;
    flipY?: boolean;
    flipYBase?: number;
    optimize?: boolean;
  }

  export interface Path {
    commands: PathCommand[];
    getBoundingBox(): BoundingBox;
    toPathData(options?: number | PathDataOptions): string;
  }

  export interface RenderOptions {
    kerning?: boolean;
    letterSpacing?: number;
    tracking?: number;
    features?: Record<string, boolean>;
  }

  export interface Font {
    unitsPerEm: number;
    getPath(
      text: string,
      x: number,
      y: number,
      fontSize: number,
      options?: RenderOptions,
    ): Path;
  }

  export function parse(buffer: ArrayBuffer, options?: object): Font;
}
