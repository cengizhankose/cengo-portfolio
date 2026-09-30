// FE-35 / DSG-06 / T-05: the Mermaid configuration, built from the site's
// theme tokens (src/index.css) instead of a hard-coded palette.
//
// Everything here is pure: it takes explicit hex tokens and returns plain
// data, so the blog page (<Mermaid>, reading the live CSS variables) and the
// publish script (stage B, PERF-05: one SVG per theme, from THEME_TOKENS)
// produce the same diagram for the same theme. Only readTokens() touches
// the DOM.
//
// Tokens (all hex, the contract Mermaid's colour maths needs):
//   bg      --bg-color     page background
//   text    --text-color   body text
//   muted   --text-muted   secondary text; AA on bg in both themes (DSG-04)
//   border  --border-color hairlines (DSG-06)
// --primary-color is not read: it equals the page background in both themes.
// Node fills and cluster backgrounds are a few percent of `text` mixed into
// `bg`, so they stay monochrome like the rest of the site and the label
// (`text`) keeps a contrast far above 4.5:1 on them.
//
// THEME_TOKENS repeats the two token sets for code that has no DOM; a test
// (tests/frontend/markdown/mermaid-theme.test.js) keeps them equal to
// src/index.css.

export const THEME_TOKENS = Object.freeze({
  dark: Object.freeze({
    bg: "#0c0c0c",
    text: "#ffffff",
    muted: "#a3a3a3",
    border: "#6e6e6e",
  }),
  light: Object.freeze({
    bg: "#ffffff",
    text: "#000000",
    muted: "#595959",
    border: "#6e6e6e",
  }),
});

const TOKEN_VARIABLES = Object.freeze({
  bg: "--bg-color",
  text: "--text-color",
  muted: "--text-muted",
  border: "--border-color",
});

export const FONT_FAMILY = "Raleway, sans-serif";

// Every diagram type that reads useMaxWidth: false keeps the natural size
// (scale 1) and lets the figure scroll, instead of shrinking a wide diagram
// to the column (DSG-06: 3px labels at 375px wide).
const DIAGRAM_TYPES = Object.freeze([
  "flowchart",
  "sequence",
  "gantt",
  "journey",
  "timeline",
  "class",
  "state",
  "er",
  "pie",
  "quadrantChart",
  "xyChart",
  "requirement",
  "architecture",
  "mindmap",
  "kanban",
  "gitGraph",
  "c4",
  "sankey",
  "packet",
  "block",
  "radar",
]);

const clamp = (value) => Math.min(255, Math.max(0, Math.round(value)));

/** "#abc", "#aabbcc", "rgb(1, 2, 3)" -> [r, g, b], or null. */
export function parseColor(value) {
  const text = String(value ?? "").trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? [...hex[1]].map((digit) => digit + digit).join("")
        : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text);
  return rgb ? rgb.slice(1, 4).map((part) => clamp(Number(part))) : null;
}

/** Any parseable colour -> "#rrggbb", or null. */
export function toHex(value) {
  const channels = parseColor(value);
  return channels
    ? `#${channels.map((part) => part.toString(16).padStart(2, "0")).join("")}`
    : null;
}

/** `amount` (0..1) of colour b mixed into colour a, as "#rrggbb". */
export function mix(a, b, amount) {
  const from = parseColor(a);
  const to = parseColor(b);
  return `#${from
    .map((part, i) => clamp(part + (to[i] - part) * amount))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** WCAG relative luminance of a colour. */
export function luminance(value) {
  const [r, g, b] = parseColor(value).map((part) => {
    const c = part / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The static token set of a theme; anything but "light" is dark. */
export function tokensForTheme(theme) {
  return theme === "light" ? THEME_TOKENS.light : THEME_TOKENS.dark;
}

/**
 * Reads the tokens from the CSS variables on `root` (default: <html>).
 * A variable that is missing or not a colour falls back to the static value
 * of the theme in root's data-theme (Mermaid needs valid colours).
 */
export function readTokens(root = globalThis.document?.documentElement) {
  const fallback = tokensForTheme(root?.getAttribute?.("data-theme"));
  const style = root ? globalThis.getComputedStyle?.(root) : null;
  return Object.fromEntries(
    Object.entries(TOKEN_VARIABLES).map(([name, variable]) => [
      name,
      toHex(style?.getPropertyValue(variable)) ?? fallback[name],
    ]),
  );
}

/** Mermaid `themeVariables` (theme "base") for a token set. */
export function themeVariables(tokens) {
  const { bg, text, muted, border } = tokens;
  const surface = mix(bg, text, 0.08);
  const surfaceHigh = mix(bg, text, 0.14);
  const surfaceLow = mix(bg, text, 0.04);
  return {
    darkMode: luminance(bg) < 0.5,
    background: bg,
    fontFamily: FONT_FAMILY,
    textColor: text,
    lineColor: muted,
    // Flowchart nodes, clusters, edge labels.
    primaryColor: surface,
    primaryTextColor: text,
    primaryBorderColor: muted,
    secondaryColor: surfaceHigh,
    secondaryTextColor: text,
    secondaryBorderColor: muted,
    tertiaryColor: surfaceLow,
    tertiaryTextColor: text,
    tertiaryBorderColor: border,
    mainBkg: surface,
    nodeBorder: muted,
    nodeTextColor: text,
    clusterBkg: surfaceLow,
    clusterBorder: border,
    titleColor: text,
    edgeLabelBackground: bg,
    // Notes, sequence diagrams.
    noteBkgColor: surfaceHigh,
    noteTextColor: text,
    noteBorderColor: border,
    actorBkg: surface,
    actorBorder: muted,
    actorTextColor: text,
    actorLineColor: muted,
    signalColor: muted,
    signalTextColor: text,
    labelBoxBkgColor: surface,
    labelBoxBorderColor: border,
    labelTextColor: text,
    loopTextColor: text,
  };
}

/** The argument of mermaid.initialize() for a token set. */
export function mermaidConfig(tokens) {
  return {
    startOnLoad: false,
    // Mermaid sanitizes its own SVG (DOMPurify) and refuses click handlers.
    securityLevel: "strict",
    // A parse error is thrown, not drawn into <body> (Mermaid's bomb SVG):
    // <Mermaid> shows the source block instead.
    suppressErrorRendering: true,
    fontFamily: FONT_FAMILY,
    theme: "base",
    themeVariables: themeVariables(tokens),
    ...Object.fromEntries(
      DIAGRAM_TYPES.map((type) => [type, { useMaxWidth: false }]),
    ),
  };
}
