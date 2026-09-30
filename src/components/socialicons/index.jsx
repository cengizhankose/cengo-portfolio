import "./style.css";
import { DEFAULT_LOCALE, SOCIAL_PROFILES } from "../../seo/site.js";
import { translate } from "../../i18n/translate.js";
import { getSocialLinks } from "./icons";

// { id: url } in K-11 order, from the single list in src/seo/site.js
// (SEO-25). The header's menu footer uses the same map.
export const SOCIAL_PROFILE_URLS = Object.freeze(
  Object.fromEntries(SOCIAL_PROFILES.map(({ id, url }) => [id, url])),
);

// Icon-only profile links (FE-02): each link is named by its channel label
// (a brand name, the same in every language), the icon itself is decorative.
// `followLabel` is the translated caption: the parent inside the router
// passes t("social.follow"); a bare render gets the EN text.
export const Socialicons = ({
  followLabel = translate(DEFAULT_LOCALE, "social.follow"),
}) => {
  const links = getSocialLinks(SOCIAL_PROFILE_URLS);

  return (
    <div className="stick_follow_icon">
      <ul>
        {links.map(({ id, label, url, Icon }) => (
          <li key={id}>
            <a href={url} aria-label={label}>
              <Icon aria-hidden="true" focusable="false" />
            </a>
          </li>
        ))}
      </ul>
      <p>{followLabel}</p>
    </div>
  );
};
