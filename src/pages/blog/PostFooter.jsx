// The end of a post (MKT-07, SEO-16): the author box, the one AI contribution
// note, the ways to follow (the language's RSS feed, LinkedIn) and the contact
// call to action. Inside the <article>, after the text, so it speaks the post's
// own language (`lang`). There is no e-mail newsletter (D4 is open): following
// is RSS or LinkedIn.
//
// The contact link sends `cta_clicked { cta_id: "blog_end_contact" }` (ANL-10,
// MKT-07). The profile links carry the placement "blog_footer" for
// outbound_link_clicked (ANL-09), read from data-analytics-location.
// The server snapshot (src/seo/snapshot.ts) prints the same markup.
import { Link } from "react-router-dom";
import ExternalLink from "../../components/ExternalLink.jsx";
import { localePath, staticLocale, translate } from "../../i18n";
import { CTA } from "../../lib/analytics/events.js";
import { track } from "../../lib/analytics/index.js";
import {
  FEED_PATH,
  FOLLOW_PROFILE_ID,
  FOOTER_LOCATION,
} from "../../seo/pages/post.js";
import { SOCIAL_PROFILES } from "../../seo/site.js";
import AuthorBox from "./AuthorBox.jsx";

export default function PostFooter({ lang }) {
  const t = (key) => translate(lang, key);
  const follow = SOCIAL_PROFILES.find(({ id }) => id === FOLLOW_PROFILE_ID);

  return (
    <footer
      className="post-footer"
      aria-label={t("post.footer.label")}
      data-analytics-location={FOOTER_LOCATION}
    >
      <AuthorBox lang={lang} />
      <p className="ai-disclosure">{t("post.aiDisclosure")}</p>
      <p className="post-footer__follow">
        {t("post.footer.follow")}{" "}
        <a href={localePath(lang, FEED_PATH)}>{t("post.footer.rss")}</a>
        {follow && (
          <>
            <span aria-hidden="true"> · </span>
            <ExternalLink href={follow.url} me locale={lang}>
              {t("post.footer.linkedin")}
            </ExternalLink>
          </>
        )}
      </p>
      <p className="post-footer__cta">
        <Link
          to={localePath(staticLocale(lang), "/contact")}
          onClick={() => track("cta_clicked", { cta_id: CTA.BLOG_END_CONTACT })}
        >
          {t("post.footer.cta")}
        </Link>
      </p>
    </footer>
  );
}
