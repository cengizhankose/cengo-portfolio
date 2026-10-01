// Meta for unknown paths (T-11 soft-404 fix, SEO-02, FE-16). Always noindex.
// The server prints this title and robots into the 404 shell
// (src/server/static.ts) and the NotFound page (src/pages/notfound) sets the
// same values client-side. The TR entry is used once the TR static pages are
// live (SEO-11 Adım B); until then /tr/... 404s are EN.
import { buildTitle } from "../site.js";

export default {
  en: {
    title: buildTitle("Page not found"),
    description:
      "The page you are looking for does not exist or has moved. Go back to the home page or read the latest posts on the blog.",
    robots: "noindex",
  },
  tr: {
    title: buildTitle("Sayfa bulunamadı"),
    description:
      "Aradığın sayfa yok ya da taşınmış. Ana sayfaya dön ya da blogdaki son yazıları oku.",
    robots: "noindex",
  },
};
