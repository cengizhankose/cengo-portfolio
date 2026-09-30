// EN interface text, namespace "social" (T-12, FE-14). Keys are used as
// t("social.<key>"); nested objects add dotted segments.
export default {
  label: "Social links",
  follow: "Follow Me",
  // Accessible name of a social profile link (SEO-24, DSG-12, MKT-23). The
  // name comes first so it matches the visible label (WCAG 2.5.3) and the
  // new-tab note ends it. {name} is the channel's brand name.
  profile: "{name} profile (opens in a new tab)",
  // Visually hidden note after the text of any other link that opens in a
  // new tab (ExternalLink, MKT-23 step 3).
  newTab: "(opens in a new tab)",
};
