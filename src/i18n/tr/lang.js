// TR interface text, namespace "lang" (T-12, FE-14). Same keys as
// src/i18n/en/lang.js; a missing or empty value falls back to EN until the
// strict parity test is switched on (W11, MKT-14 approves the TR voice).
// The switch labels are read from the TARGET language's dictionary (the
// link carries lang=<target>): {code} is "EN"/"TR", {language} is lang.name.
export default {
  label: "Dil",
  name: "Türkçe",
  switchTo: "{code} – {language}",
  switchToBlog: "{code} – {language}, blog sayfası (bu yazının çevirisi yok)",
};
