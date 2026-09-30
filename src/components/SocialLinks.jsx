// The social profile links (K-11; SEO-24, DSG-12, DSG-30, MKT-23).
//
// One component for both placements, both from SOCIAL_PROFILES
// (src/seo/site.js, through SOCIAL_CHANNELS) in K-11 order: LinkedIn, GitHub,
// X, YouTube, Twitch, Instagram.
//   variant="icons"  the side rail: icon-only links, the icon aria-hidden
//   variant="text"   the menu footer: the channel name as visible text
//
// Every link opens in a new tab (ExternalLink), carries rel="me" (profile
// ownership, SEO-24) with noopener noreferrer, and is named in the interface
// language by social.profile: "LinkedIn profile (opens in a new tab)" /
// "LinkedIn profili (yeni sekmede açılır)". The name starts with the visible
// label (WCAG 2.5.3). `location` becomes data-analytics-location on the list,
// the placement that outbound_link_clicked reports (ANL-09).
import ExternalLink, { UiLocale } from "./ExternalLink.jsx";
import { SOCIAL_CHANNELS } from "./socialicons/icons.js";
import { translate } from "../i18n/translate.js";

export default function SocialLinks({
  variant = "icons",
  locale,
  location,
  className,
}) {
  return (
    <UiLocale locale={locale}>
      {(lang) => (
        <ul className={className} data-analytics-location={location}>
          {SOCIAL_CHANNELS.map(({ id, label, url, Icon }) => (
            <li key={id}>
              <ExternalLink
                href={url}
                me
                aria-label={translate(lang, "social.profile", { name: label })}
              >
                {variant === "text" ? (
                  label
                ) : (
                  <Icon aria-hidden="true" focusable="false" />
                )}
              </ExternalLink>
            </li>
          ))}
        </ul>
      )}
    </UiLocale>
  );
}
