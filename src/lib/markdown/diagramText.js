// The two interface strings a Mermaid diagram shows, in the language of the
// post that contains it (T-12: the <article> speaks the post's own language).
//
// These belong in the i18n dictionaries (blog.diagram, blog.diagramLoading);
// they live here only because src/i18n is outside the package that added the
// diagrams. Handoff: move them into src/i18n/{en,tr}/blog.js and read them
// with translate(lang, key). tests/frontend/markdown/diagram-text.test.js
// keeps the two languages in step until then.
export const DIAGRAM_TEXT = Object.freeze({
  en: Object.freeze({
    diagram: "Diagram",
    loading: "Loading diagram…",
  }),
  tr: Object.freeze({
    diagram: "Diyagram",
    loading: "Diyagram yükleniyor…",
  }),
});

/** The strings for `lang`; English for a language without its own. */
export function diagramText(lang) {
  return Object.hasOwn(DIAGRAM_TEXT, lang)
    ? DIAGRAM_TEXT[lang]
    : DIAGRAM_TEXT.en;
}

export default diagramText;
