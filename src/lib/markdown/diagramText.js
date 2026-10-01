// The two interface strings a Mermaid diagram shows, in the language of the
// post that contains it (T-12: the <article> speaks the post's own language).
//
// The words live in the i18n dictionaries (blog.diagram, blog.diagramLoading,
// src/i18n/{en,tr}/blog.js, W11); this module reads them, so the diagram is
// named in the same voice as the rest of the interface and the strict parity
// test covers both languages.
import { DICTIONARIES } from "../../i18n/translate.js";

const strings = (lang) =>
  Object.freeze({
    diagram: DICTIONARIES[lang]["blog.diagram"],
    loading: DICTIONARIES[lang]["blog.diagramLoading"],
  });

export const DIAGRAM_TEXT = Object.freeze({
  en: strings("en"),
  tr: strings("tr"),
});

/** The strings for `lang`; English for a language without its own. */
export function diagramText(lang) {
  return Object.hasOwn(DIAGRAM_TEXT, lang)
    ? DIAGRAM_TEXT[lang]
    : DIAGRAM_TEXT.en;
}

export default diagramText;
