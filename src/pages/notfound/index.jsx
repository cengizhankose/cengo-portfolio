// NotFound page (FE-16, SEO-02, SEO-08). Rendered for paths the route table
// does not know (the server answers them with 404 + noindex) and, as
// variant="post", by BlogPost when the slug is missing or a draft.
//
// Language: a missing post speaks the language of its URL (/tr/blog/... TR);
// any other unknown path the language whose pages are live for its prefix
// (EN under /tr until the TR pages open, SEO-11 Adım B). Links go to that
// language's home page and blog.
import { Link, useLocation } from "react-router-dom";
import {
  displayLocale,
  getPageMeta,
  localePath,
  staticLocale,
} from "../../seo/pages.js";
import { matchRoute } from "../../seo/routes.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import { notFoundCopy } from "./copy.js";
import "./style.css";

export function NotFound({ variant = "page" }) {
  const route = matchRoute(useLocation().pathname);
  const locale = displayLocale(route);
  // Title "Page not found | …" / "Post not found | …" and robots noindex,
  // the same values the server wrote into the 404 shell.
  usePageMeta(getPageMeta(route, locale, { notFound: true }));

  const isPost = variant === "post";
  const copy = notFoundCopy(locale, isPost ? "post" : "page");
  const linkLocale = staticLocale(locale);
  const home = localePath(linkLocale, "/");
  const blog = localePath(linkLocale, "/blog");

  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <h1 id="not-found-title" className="not-found__title">
        {copy.title}
      </h1>
      <p className="not-found__text">{copy.text}</p>
      <ul className="not-found__links">
        {isPost ? (
          <>
            <li>
              <Link to={blog}>{copy.backToBlog}</Link>
            </li>
            <li>
              <Link to={home}>{copy.home}</Link>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link to={home}>{copy.home}</Link>
            </li>
            <li>
              <Link to={blog}>{copy.blog}</Link>
            </li>
          </>
        )}
      </ul>
    </section>
  );
}

export default NotFound;
