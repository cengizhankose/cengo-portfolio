// Loading placeholders of the blog (PERF-16). They hold the size of the page
// that replaces them, so nothing below them (the fixed social icons on a phone,
// the footer) moves when the data arrives:
//   PostSkeleton  a whole post page: at least one screen high, with the back
//                 link, a two-line title, the date and six paragraph bars;
//   ListSkeleton  the blog index under its own heading: three card bars.
// The bars are decoration (aria-hidden); the container is aria-busy and a
// visually hidden, polite status line says "Loading..." in the interface
// language. Motion is a slow opacity pulse, switched off for
// prefers-reduced-motion (src/pages/blog/style.css, FE-06).
import { useT, useUiLocale } from "../../i18n";

const POST_PARAGRAPHS = 6;
const LIST_CARDS = 3;

const Bar = ({ className }) => (
  <span className={`blog-skeleton__bar ${className}`} aria-hidden="true" />
);

export function PostSkeleton() {
  const t = useT();
  const uiLocale = useUiLocale();
  return (
    <div
      className="blog-post-container blog-skeleton blog-skeleton--post"
      aria-busy="true"
      lang={uiLocale}
    >
      <p className="visually-hidden" role="status" aria-live="polite">
        {t("status.loading")}
      </p>
      <Bar className="blog-skeleton__back" />
      <Bar className="blog-skeleton__title" />
      <Bar className="blog-skeleton__title blog-skeleton__title--short" />
      <Bar className="blog-skeleton__date" />
      {Array.from({ length: POST_PARAGRAPHS }, (_, index) => (
        <Bar
          key={index}
          className={`blog-skeleton__line${index % 3 === 2 ? " blog-skeleton__line--short" : ""}`}
        />
      ))}
    </div>
  );
}

export function ListSkeleton() {
  const t = useT();
  return (
    <div className="blog-skeleton blog-skeleton--list" aria-busy="true">
      <p className="visually-hidden" role="status" aria-live="polite">
        {t("status.loading")}
      </p>
      <div className="blog-grid" aria-hidden="true">
        {Array.from({ length: LIST_CARDS }, (_, index) => (
          <div key={index} className="blog-skeleton__card">
            <Bar className="blog-skeleton__card-title" />
            <Bar className="blog-skeleton__line" />
            <Bar className="blog-skeleton__line blog-skeleton__line--short" />
            <Bar className="blog-skeleton__date" />
          </div>
        ))}
      </div>
    </div>
  );
}
