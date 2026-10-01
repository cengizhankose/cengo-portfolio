// EN interface text, namespace "cv" (T-12, FE-14; ANL-12). Keys are used as
// t("cv.<key>"); nested objects add dotted segments. The CV files are in
// src/content/en/cv.js; <CvLinks /> (src/components/cvlink) draws them.
export default {
  // The CV in the page's language.
  download: "Download my CV (PDF)",
  // The CV in the other language; `{language}` is cv.language.<code>.
  other: "CV in {language} (PDF)",
  language: {
    en: "English",
    tr: "Turkish",
  },
};
