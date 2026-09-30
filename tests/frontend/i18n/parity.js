// Parity checks between the EN and TR dictionaries / content files (FE-14
// criterion 3). Shared by i18n-parity.test.js; not a test file itself.
//
// Lenient (Adım A, TR not live): TR may be incomplete, but it may not invent
// anything: TR keys and content paths are subsets of EN's, lists are not
// longer than EN's, a value never changes kind (list/object/text) and list
// items keep EN's id at the same index.
// Strict (Adım B, LIVE.static has 'tr'; W11 turns it on by opening TR): the
// key and path sets are equal, lists have the same length and no text is
// empty.

const kindOf = (value) =>
  Array.isArray(value)
    ? "array"
    : value !== null && typeof value === "object"
      ? "object"
      : typeof value;

// Every node of a content tree: path -> { kind, length?, value? }.
// Paths: "about.summary", "timeline[0].where".
export function contentNodes(value, path = "", out = new Map()) {
  const kind = kindOf(value);
  if (kind === "array") {
    out.set(path, { kind, length: value.length });
    value.forEach((item, index) =>
      contentNodes(item, `${path}[${index}]`, out),
    );
  } else if (kind === "object") {
    out.set(path, { kind });
    for (const [key, child] of Object.entries(value)) {
      contentNodes(child, path ? `${path}.${key}` : key, out);
    }
  } else {
    out.set(path, { kind, value });
  }
  return out;
}

export function dictionaryGaps(en, tr, { strict }) {
  const gaps = [];
  const enKeys = new Set(Object.keys(en));
  const trKeys = new Set(Object.keys(tr));
  for (const key of trKeys) {
    if (!enKeys.has(key)) gaps.push(`tr has a key EN lacks: ${key}`);
  }
  if (strict) {
    for (const key of enKeys) {
      if (!trKeys.has(key)) gaps.push(`tr is missing: ${key}`);
    }
    for (const [lang, dict] of [
      ["en", en],
      ["tr", tr],
    ]) {
      for (const [key, value] of Object.entries(dict)) {
        if (typeof value !== "string" || value.trim() === "") {
          gaps.push(`${lang} has an empty text: ${key}`);
        }
      }
    }
  }
  return gaps;
}

export function contentGaps(en, tr, { strict }) {
  const gaps = [];
  const enNodes = contentNodes(en);
  const trNodes = contentNodes(tr);

  for (const [path, node] of trNodes) {
    const base = enNodes.get(path);
    if (!base) {
      gaps.push(`tr has a path EN lacks: ${path}`);
      continue;
    }
    if (base.kind !== node.kind) {
      gaps.push(`tr changes the kind at ${path}: ${base.kind} -> ${node.kind}`);
    }
    if (node.kind === "array" && node.length > base.length) {
      gaps.push(`tr list is longer than EN at ${path}`);
    }
    if (
      path.endsWith(".id") &&
      node.value !== undefined &&
      node.value !== base.value
    ) {
      gaps.push(`tr id differs at ${path}: ${base.value} -> ${node.value}`);
    }
  }

  if (strict) {
    for (const [path, node] of enNodes) {
      const other = trNodes.get(path);
      if (!other) gaps.push(`tr is missing: ${path}`);
      else if (node.kind === "array" && other.length !== node.length) {
        gaps.push(`list length differs at ${path}`);
      }
    }
    for (const [lang, nodes] of [
      ["en", enNodes],
      ["tr", trNodes],
    ]) {
      for (const [path, node] of nodes) {
        if (node.kind === "string" && node.value.trim() === "") {
          gaps.push(`${lang} has an empty text: ${path}`);
        }
      }
    }
  }
  return gaps;
}
