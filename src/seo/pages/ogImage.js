// og:image:alt of the default share image (public/og/default.jpg), per
// language (SEO-06, MKT-06 step 1). The picture is the same for both languages
// because it only carries the name, the role and the domain; the alt text is
// written per language so a TR role change stays a one-line edit.
import { AUTHOR, SITE_NAME } from "../site.js";

export default {
  en: { alt: `${SITE_NAME} — ${AUTHOR.jobTitles.en}` },
  tr: { alt: `${SITE_NAME} — ${AUTHOR.jobTitles.tr}` },
};
