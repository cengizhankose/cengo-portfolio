// A link that leaves the site and opens in a new tab (MKT-23 step 3, DSG-12).
//
// Every such link goes through here, so target="_blank" always comes with
// rel="noopener noreferrer" (plus "me" on the owner's own profiles, SEO-24)
// and the link's accessible name always says that a new tab opens: a
// visually hidden "(opens in a new tab)" follows the link text, in the
// language of that text (social.newTab). A caller that names the link with
// aria-label (SocialLinks: icon-only links) puts the note into the label
// itself, because aria-label replaces the text as the accessible name; the
// hidden note is then left out.
//
// rel is one of two literals on purpose: react/jsx-no-target-blank can only
// verify a literal (or a conditional of literals), and noreferrer is what
// that rule and DSG-30 ask for. The trade-off: the sites we link to see no
// cengizhankose.com referrer. Our own outbound count comes from ANL-09.
//
// Language: the `locale` prop (MarkdownLink passes the post's own language),
// else the interface language of the current route (useUiLocale), else EN
// when the link renders outside a router (a bare component in a test).
//
// Click tracking needs nothing here: the delegated listener of
// src/lib/analytics/outbound.js reads the href and the nearest
// data-analytics-location of any external link (ANL-09).
import { useInRouterContext } from "react-router-dom";
import { useUiLocale } from "../i18n";
import { translate } from "../i18n/translate.js";
import { DEFAULT_LOCALE } from "../seo/site.js";

function RoutedUiLocale({ children }) {
  return children(useUiLocale());
}

/**
 * Render prop that resolves the language for link text: `locale` when given,
 * the route's interface language inside a router, EN outside one.
 *   <UiLocale>{(locale) => ...}</UiLocale>
 */
export function UiLocale({ locale, children }) {
  const inRouter = useInRouterContext();
  if (locale) return children(locale);
  if (!inRouter) return children(DEFAULT_LOCALE);
  return <RoutedUiLocale>{children}</RoutedUiLocale>;
}

// `me`: the link points to one of the owner's own profiles (rel="me").
export default function ExternalLink({
  href,
  me = false,
  locale,
  children,
  "aria-label": ariaLabel,
  ...rest
}) {
  return (
    <UiLocale locale={locale}>
      {(lang) => {
        const note = ariaLabel ? null : ` ${translate(lang, "social.newTab")}`;
        return (
          <a
            {...rest}
            href={href}
            target="_blank"
            rel={me ? "me noopener noreferrer" : "noopener noreferrer"}
            aria-label={ariaLabel}
          >
            {children}
            {note && <span className="visually-hidden">{note}</span>}
          </a>
        );
      }}
    </UiLocale>
  );
}
