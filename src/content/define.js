// Section registry and helpers for the page content files (T-12, FE-14).
// Pure ESM (the server reads the same content for SSR/snapshots).

// Sections every language has (one file per language, possibly empty).
export const SECTIONS = Object.freeze([
  "hero",
  "about",
  "timeline",
  "skills",
  "services",
  "projects",
  "featuredRepos",
  "contact",
  "privacy",
  "proof",
  "awards",
  "cv",
  "author",
  "home",
]);

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  Object.getPrototypeOf(value) === Object.prototype;

export function deepFreeze(value) {
  if (Array.isArray(value) || isPlainObject(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// defineContent({ hero, about, ... }) -> the frozen content of one language.
// Every section listed in SECTIONS must be present, and no other.
export function defineContent(sections) {
  const names = Object.keys(sections);
  const unknown = names.filter((name) => !SECTIONS.includes(name));
  const missing = SECTIONS.filter((name) => !names.includes(name));
  if (unknown.length || missing.length) {
    throw new TypeError(
      `content: unknown sections [${unknown}] / missing sections [${missing}]`,
    );
  }
  return deepFreeze({ ...sections });
}

const isMissing = (value) =>
  value === undefined || value === null || value === "";

// mergeContent(en, tr): `tr` over `en`, field by field.
//   objects: merged per key; keys only in `tr` are kept;
//   arrays:  merged per index over the base items (an empty or shorter TR
//            list keeps the remaining EN items, so ids and order come from
//            EN until the TR list is complete);
//   values:  the override unless it is missing (undefined, null or "").
// Untranslated TR fields therefore show the EN text (FE-14 Adım A); the
// strict parity test (Adım B) makes sure nothing falls back once TR is live.
export function mergeContent(base, override) {
  if (isMissing(override)) return base;
  if (Array.isArray(base) && Array.isArray(override)) {
    const length = Math.max(base.length, override.length);
    return Array.from({ length }, (_, index) =>
      index < base.length
        ? mergeContent(base[index], override[index])
        : override[index],
    );
  }
  if (isPlainObject(base) && isPlainObject(override)) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(override)) {
      merged[key] = Object.hasOwn(base, key)
        ? mergeContent(base[key], value)
        : value;
    }
    return merged;
  }
  // A list or object replaced by a different kind of value is a shape error
  // in the TR file (the parity test reports it); keep the EN value meanwhile.
  if (Array.isArray(base) || isPlainObject(base)) return base;
  return override;
}
