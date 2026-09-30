// NotFound page (FE-16, SEO-02, SEO-08). Rendered for paths the route table
// does not know (the server answers them with 404 + noindex) and, as
// variant="post", by BlogPost when the slug is missing or a draft.
//
// Language: a missing post speaks the language of its URL (/tr/blog/... TR);
// any other unknown path the language whose pages are live for its prefix
// (EN under /tr until the TR pages open, SEO-11 Adım B). Links go to that
// language's home page and blog. Text: the notFound.* dictionary keys
// (src/i18n/{en,tr}/notFound.js).
import { Link } from "react-router-dom";
import {
  displayLocale,
  localePath,
  staticLocale,
  useRoute,
  useT,
} from "../../i18n";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import "./style.css";

export function NotFound({ variant = "page" }) {
  const route = useRoute();
  const locale = displayLocale(route);
  const t = useT(locale);
  // Title "Page not found | …" / "Post not found | …" and robots noindex,
  // the same values the server wrote into the 404 shell.
  usePageMeta(getPageMeta(route, locale, { notFound: true }));

  const isPost = variant === "post";
  const kind = isPost ? "post" : "page";
  const linkLocale = staticLocale(locale);
  const home = localePath(linkLocale, "/");
  const blog = localePath(linkLocale, "/blog");

  return (
    <section
      className="not-found"
      aria-labelledby="not-found-title"
      lang={locale}
    >
      <h1 id="not-found-title" className="not-found__title">
        {t(`notFound.${kind}.title`)}
      </h1>
      <p className="not-found__text">{t(`notFound.${kind}.text`)}</p>
      <ul className="not-found__links">
        {isPost ? (
          <>
            <li>
              <Link to={blog}>{t("notFound.backToBlog")}</Link>
            </li>
            <li>
              <Link to={home}>{t("notFound.home")}</Link>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link to={home}>{t("notFound.home")}</Link>
            </li>
            <li>
              <Link to={blog}>{t("notFound.blog")}</Link>
            </li>
          </>
        )}
      </ul>
    </section>
  );
}

export default NotFound;
