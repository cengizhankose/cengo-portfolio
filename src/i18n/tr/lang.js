// TR interface text, namespace "lang" (T-12, FE-14). Same keys as
// src/i18n/en/lang.js. TR is live (W11, MKT-14): the parity test is strict, so every key
// exists in both languages with a non-empty value. Voice: .agents/product-marketing.md
// ("Dil ve hitap": sen; "Terim sözlüğü").
// The switch labels are read from the TARGET language's dictionary (the
// link carries lang=<target>): {code} is "EN"/"TR", {language} is lang.name.
export default {
  label: "Dil",
  name: "Türkçe",
  switchTo: "{code} – {language}",
  switchToBlog: "{code} – {language}, blog sayfası (bu yazının çevirisi yok)",
};
