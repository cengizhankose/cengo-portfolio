// Social channels shown on the site (K-11), in display order, with the icon
// of each channel (FE-02, DSG-30).
//
// The list itself is SOCIAL_PROFILES in src/seo/site.js (id, brand-name
// label, URL; the same list prints the JSON-LD sameAs, SEO-07). This file
// only adds the icon component of each id; labels are brand names,
// identical in EN and TR.
import {
  FaGithub,
  FaInstagram,
  FaLinkedin,
  FaTwitch,
  FaYoutube,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { SOCIAL_PROFILES } from "../../seo/site.js";

// Channel id -> icon component. `twitter` is the older key of the X
// profile, kept so a `{ twitter: url }` map still resolves.
export const SOCIAL_ICONS = Object.freeze({
  linkedin: FaLinkedin,
  github: FaGithub,
  x: FaXTwitter,
  twitter: FaXTwitter,
  youtube: FaYoutube,
  twitch: FaTwitch,
  instagram: FaInstagram,
});

const ALIASES = Object.freeze({ x: Object.freeze(["twitter"]) });

// SOCIAL_PROFILES with the icon of each channel:
// [{ id, label, url, Icon, aliases? }], in K-11 order. A profile whose id has
// no icon here is left out (tests/frontend/social checks that none is).
export const SOCIAL_CHANNELS = Object.freeze(
  SOCIAL_PROFILES.flatMap(({ id, label, url }) =>
    SOCIAL_ICONS[id]
      ? [
          Object.freeze({
            id,
            label,
            url,
            Icon: SOCIAL_ICONS[id],
            ...(ALIASES[id] ? { aliases: ALIASES[id] } : {}),
          }),
        ]
      : [],
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
