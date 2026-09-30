// Social channels shown on the site (K-11), in display order, with the icon
// and the accessible name of each link (FE-02).
//
// The URLs are not kept here: they come from the `socialprofils` map in
// content_option.js (derived from SOCIAL_PROFILES in src/seo/site.js once
// SEO-25 lands). Labels are brand names, identical in EN and TR.
import {
  FaGithub,
  FaInstagram,
  FaLinkedin,
  FaTwitch,
  FaYoutube,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

export const SOCIAL_CHANNELS = [
  { id: "linkedin", label: "LinkedIn", Icon: FaLinkedin },
  { id: "github", label: "GitHub", Icon: FaGithub },
  // `twitter` is the older key for the same X profile.
  { id: "x", label: "X", Icon: FaXTwitter, aliases: ["twitter"] },
  { id: "youtube", label: "YouTube", Icon: FaYoutube },
  { id: "twitch", label: "Twitch", Icon: FaTwitch },
  { id: "instagram", label: "Instagram", Icon: FaInstagram },
];

// Profile key (id or alias) -> icon component.
export const SOCIAL_ICONS = Object.fromEntries(
  SOCIAL_CHANNELS.flatMap(({ id, aliases = [], Icon }) =>
    [id, ...aliases].map((key) => [key, Icon]),
  ),
);

// Resolves a `{ key: url }` profile map to the links to render, in K-11
// order. Channels without a URL are skipped, and keys that are not K-11
// channels (a dropped network left in the map) are ignored.
export function getSocialLinks(profiles = {}) {
  return SOCIAL_CHANNELS.flatMap(({ id, label, aliases = [], Icon }) => {
    const key = [id, ...aliases].find((candidate) => profiles[candidate]);
    return key ? [{ id, label, url: profiles[key], Icon }] : [];
  });
}
