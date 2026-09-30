// EN interface text, namespace "lang" (T-12, FE-14). Keys are used as
// t("lang.<key>"); nested objects add dotted segments.
// The switch labels are read from the TARGET language's dictionary (the
// link carries lang=<target>): {code} is "EN"/"TR", {language} is lang.name.
export default {
  label: "Language",
  name: "English",
  switchTo: "{code} – {language}",
  switchToBlog:
    "{code} – {language}, blog index (this post has no translation)",
};
