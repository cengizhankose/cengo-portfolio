// Meta for unknown paths (T-11 soft-404 fix, FE-16). Always noindex. The
// NotFound component itself arrives in W3 (FE-16); until then unknown paths
// render the home page with this meta.
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
      "Aradığınız sayfa yok ya da taşınmış. Ana sayfaya dönün ya da blogdaki son yazıları okuyun.",
    robots: "noindex",
  },
};
