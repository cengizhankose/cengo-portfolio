// NotFound page copy (FE-16) in both languages. The headings match the
// not-found titles in src/seo/pages/{notFound,post}.js ("<heading> | Cengizhan
// Köse"). FE-14 (W4) moves these strings into the notFound namespace of the
// i18n dictionaries; the keys stay the same.
const COPY = Object.freeze({
  en: Object.freeze({
    page: Object.freeze({
      title: "Page not found",
      text: "The address may be mistyped, or the page has moved.",
    }),
    post: Object.freeze({
      title: "Post not found",
      text: "This post does not exist or is no longer published.",
    }),
    home: "Home",
    blog: "Blog",
    backToBlog: "Back to blog",
  }),
  tr: Object.freeze({
    page: Object.freeze({
      title: "Sayfa bulunamadı",
      text: "Adres yanlış yazılmış ya da sayfa taşınmış olabilir.",
    }),
    post: Object.freeze({
      title: "Yazı bulunamadı",
      text: "Bu yazı yok ya da artık yayında değil.",
    }),
    home: "Ana sayfa",
    blog: "Blog",
    backToBlog: "Bloga dön",
  }),
});

export const NOT_FOUND_COPY = COPY;

// notFoundCopy('tr', 'post') -> { title, text, home, blog, backToBlog }.
// Unknown languages fall back to EN, unknown variants to "page".
export function notFoundCopy(locale, variant = "page") {
  const strings = COPY[locale] ?? COPY.en;
  const kind = variant === "post" ? strings.post : strings.page;
  return {
    title: kind.title,
    text: kind.text,
    home: strings.home,
    blog: strings.blog,
    backToBlog: strings.backToBlog,
  };
}
