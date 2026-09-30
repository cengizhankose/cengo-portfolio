// EN/TR language switcher (T-12, FE-14 step 8, DSG-19 steps 5-7).
//
// The current language is a <span aria-current="true">, not a link to the
// page itself (no extra Tab stop). The other language is a real, crawlable
// <a href hreflang lang> to the matching URL (SEO-11), so it works without
// JavaScript too. Its accessible name starts with the visible label (WCAG
// 2.5.3) and is written in the target language, which the link's `lang`
// declares. Nothing is remembered (no cookie, no storage) and nothing
// redirects automatically (T-12).
//
// Rendered only while more than one language has live static pages
// (LIVE.static, SEO-11 Adım B / W11); until then it renders nothing.
import { Link } from "react-router-dom";
import { LIVE, LOCALES, translate, useRoute, useT } from "../../i18n";
import { usePostTranslations } from "./postTranslations";
import { currentLanguage, switchTarget } from "./target";
import "./style.css";

export function LanguageSwitcher() {
  const route = useRoute();
  const post = usePostTranslations();
  const t = useT();

  if (LIVE.static.length <= 1) return null;

  const current = currentLanguage(route);

  return (
    <nav className="lang-switch" aria-label={t("lang.label")}>
      <ul>
        {LOCALES.map((code) => {
          const visible = code.toUpperCase();
          const language = translate(code, "lang.name");

          if (code === current) {
            return (
              <li key={code}>
                <span
                  className="lang-switch__item"
                  aria-current="true"
                  lang={code}
                >
                  {visible}
                  <span className="visually-hidden">
                    {" – "}
                    {language}
                  </span>
                </span>
              </li>
            );
          }

          const { href, exact } = switchTarget(route, code, post);
          const label = translate(
            code,
            exact ? "lang.switchTo" : "lang.switchToBlog",
            { code: visible, language },
          );
          return (
            <li key={code}>
              <Link
                className="lang-switch__item"
                to={href}
                hrefLang={code}
                lang={code}
                aria-label={label}
              >
                {visible}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default LanguageSwitcher;
