import styles from "./socialicons.module.css";
import { SOCIAL_PROFILES } from "../../seo/site.js";
import { translate } from "../../i18n/translate.js";
import { LOCATIONS } from "../../lib/analytics/events.js";
import { UiLocale } from "../ExternalLink.jsx";
import SocialLinks from "../SocialLinks.jsx";

// { id: url } in K-11 order, from the single list in src/seo/site.js
// (SEO-25). Kept for callers that look a profile up by id.
export const SOCIAL_PROFILE_URLS = Object.freeze(
  Object.fromEntries(SOCIAL_PROFILES.map(({ id, url }) => [id, url])),
);

// The side rail (DSG-12, DSG-30): the icon variant of SocialLinks and the
// vertical caption. Links and caption speak `locale`, else the route's
// interface language, else EN outside a router. `followLabel` overrides the
// caption (routes.jsx passes t("social.follow")).
export const Socialicons = ({ followLabel, locale }) => (
  <UiLocale locale={locale}>
    {(lang) => (
      <div className={styles.rail}>
        <SocialLinks
          variant="icons"
          locale={lang}
          location={LOCATIONS.SOCIAL_RAIL}
        />
        <p>{followLabel ?? translate(lang, "social.follow")}</p>
      </div>
    )}
  </UiLocale>
);
