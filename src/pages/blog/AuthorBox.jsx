// The author box at the end of a post (SEO-16, MKT-07): portrait, name, role,
// a short bio, the About link and the LinkedIn / GitHub profiles. It is the
// human-author signal of the page (E-E-A-T) and matches the byline under the
// title and the `author` of the BlogPosting JSON-LD (same name, same About
// URL).
//
// It speaks the post's own language (`lang`: it sits inside <article lang>).
// Role: AUTHOR.jobTitles (src/seo/site.js, also the JSON-LD jobTitle); bio:
// content/<lang>/author.js; text: the "post" namespace. The server snapshot
// (src/seo/snapshot.ts) prints the same markup, so a crawler without scripts
// reads the same box.
import { Link } from "react-router-dom";
import ExternalLink from "../../components/ExternalLink.jsx";
import { getContent } from "../../content/index.js";
import { localePath, staticLocale, translate } from "../../i18n";
import { AUTHOR_PHOTO, AUTHOR_PROFILE_IDS } from "../../seo/pages/post.js";
import { AUTHOR, SOCIAL_PROFILES } from "../../seo/site.js";

export default function AuthorBox({ lang }) {
  const t = (key) => translate(lang, key);
  const { bio } = getContent(lang).author;
  const profiles = AUTHOR_PROFILE_IDS.map((id) =>
    SOCIAL_PROFILES.find((profile) => profile.id === id),
  ).filter(Boolean);

  return (
    <aside className="author-box" aria-label={t("post.aboutAuthor")}>
      <img
        className="author-box__photo"
        src={AUTHOR_PHOTO.src}
        srcSet={AUTHOR_PHOTO.srcSet}
        width={AUTHOR_PHOTO.width}
        height={AUTHOR_PHOTO.height}
        alt={t("post.authorPhotoAlt")}
        loading="lazy"
        decoding="async"
      />
      <div className="author-box__body">
        <p className="author-box__name">{AUTHOR.name}</p>
        <p className="author-box__role">{AUTHOR.jobTitles[lang]}</p>
        <p className="author-box__bio">{bio}</p>
        <ul className="author-box__links">
          <li>
            <Link to={localePath(staticLocale(lang), "/about")}>
              {t("post.readStory")}
            </Link>
          </li>
          {profiles.map(({ id, label, url }) => (
            <li key={id}>
              <ExternalLink href={url} me locale={lang}>
                {label}
              </ExternalLink>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
