// EN interface text, namespace "cta" (T-12, FE-14). Keys are used as
// t("cta.<key>"); nested objects add dotted segments.
// The hero buttons (MKT-19): one action that says what happens, and one
// evidence link. `{time}` in `note` is the reply promise, written once in
// src/content/en/contact.js (responseTime) so the hero, the form intro and
// the success message cannot disagree.
export default {
  primary: "Tell me what you’re building",
  secondary: "See selected work",
  note: "I reply within {time}.",
};
