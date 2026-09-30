// Dictionary builder for the interface text (T-12, FE-14).
//
// Each language keeps one file per namespace under src/i18n/<lang>/<ns>.js.
// A later package edits only its own namespace files; src/i18n/en.js and
// src/i18n/tr.js aggregate them with defineDictionary(). Pure ESM: the Bun
// server (SSR/snapshot) imports the same dictionaries as the client.

// The namespaces every language has (a file per language, possibly empty).
export const NAMESPACES = Object.freeze([
  "common",
  "a11y",
  "nav",
  "footer",
  "home",
  "cta",
  "about",
  "contact",
  "blog",
  "post",
  "status",
  "notFound",
  "social",
  "lang",
  "portfolio",
  "privacy",
  "services",
  "cv",
  "proof",
]);

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  Object.getPrototypeOf(value) === Object.prototype;

function flatten(prefix, value, out) {
  if (typeof value === "string") {
    out[prefix] = value;
    return;
  }
  if (!isPlainObject(value)) {
    throw new TypeError(
      `i18n: "${prefix}" must be a string or an object of strings`,
    );
  }
  for (const [key, child] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_]+$/.test(key)) {
      throw new TypeError(`i18n: invalid key segment "${prefix}.${key}"`);
    }
    flatten(`${prefix}.${key}`, child, out);
  }
}

// defineDictionary({ nav: { about: "About" }, contact: { form: { name } } })
//   -> frozen { "nav.about": "About", "contact.form.name": ... }
// Keys are the namespace plus the dotted path inside it. Only strings are
// allowed as values (no arrays, numbers or functions), so every key is a
// piece of text a translator can see.
export function defineDictionary(namespaces) {
  const out = {};
  for (const [namespace, values] of Object.entries(namespaces)) {
    if (!NAMESPACES.includes(namespace)) {
      throw new TypeError(`i18n: unknown namespace "${namespace}"`);
    }
    if (!isPlainObject(values)) {
      throw new TypeError(`i18n: namespace "${namespace}" must be an object`);
    }
    for (const [key, child] of Object.entries(values)) {
      if (!/^[A-Za-z0-9_]+$/.test(key)) {
        throw new TypeError(`i18n: invalid key segment "${namespace}.${key}"`);
      }
      flatten(`${namespace}.${key}`, child, out);
    }
  }
  return Object.freeze(out);
}
