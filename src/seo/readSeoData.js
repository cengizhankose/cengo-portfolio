// Reads the server's first data block (SEO-01, T-04): the JSON written into
// `<script id="__SEO_DATA__" type="application/json">` by src/seo/inject.ts.
// The block is data, not code: the browser never executes it and the CSP needs
// no hash for it. src/main.jsx passes the result through toSWRFallback()
// (src/lib/swrFallback.js) into <SWRConfig fallback>.
//
// Returns {} when there is no block (vite dev server, the plain shell of a 503
// or SEO_INJECT=off) or when it is not a JSON object.
export const SEO_DATA_ID = "__SEO_DATA__";

// `doc` is the document to read (the global one by default; tests pass their
// own).
export function readSeoData(doc = globalThis.document) {
  try {
    const text = doc?.getElementById(SEO_DATA_ID)?.textContent;
    if (!text) return {};
    const data = JSON.parse(text);
    return data !== null && typeof data === "object" && !Array.isArray(data)
      ? data
      : {};
  } catch {
    return {};
  }
}
