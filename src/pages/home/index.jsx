import { preload } from "react-dom";
import "./style.css";
import { Link } from "react-router-dom";
import { useContent, useLocalePath, useRoute, useT } from "../../i18n";
import { CTA } from "../../lib/analytics/events.js";
import { track } from "../../lib/analytics/index.js";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import { HERO_IMAGE, heroSrc, heroSrcSet } from "./heroImage.js";
import { heroStatusLine } from "./heroStatus.js";

// Hero photo (PERF-02, FE-18, SEO-26, DSG-29): AVIF, then WebP, then JPEG,
// each in 640/768/1000/1284w (./heroImage.js). Built once per module, not
// per render.
const AVIF_SRCSET = heroSrcSet("avif");
const WEBP_SRCSET = heroSrcSet("webp");
const JPEG_SRCSET = heroSrcSet("jpg");
const FALLBACK_SRC = heroSrc(HERO_IMAGE.fallbackWidth, "jpg");

export const Home = () => {
  const route = useRoute();
  const t = useT();
  const lp = useLocalePath();
  const { hero, contact } = useContent();
  const status = heroStatusLine(hero);
  usePageMeta(getPageMeta(route, route.locale));
  // LCP hint until the server writes it into the <head> (PERF-01, W7). Same
  // srcset and sizes as the AVIF <source>, so the browser picks the same file
  // for both; a browser without AVIF ignores it by its type.
  preload(FALLBACK_SRC, {
    as: "image",
    type: "image/avif",
    imageSrcSet: AVIF_SRCSET,
    imageSizes: HERO_IMAGE.sizes,
    fetchPriority: "high",
  });

  // FE-18 / DSG-11: the text comes first in the DOM, so below 992px the name,
  // the line and the CTAs are on the first screen and the photo follows;
  // from 992px the two columns sit side by side (text left, photo right).
  // PERF-07: the photo is drawn as soon as it decodes. No opacity:0 until
  // onLoad; its box is grey until then (./style.css).
  return (
    <section id="home" className="home">
      <div className="intro_sec d-block d-lg-flex align-items-center ">
        <div className="text h-100 d-lg-flex justify-content-center">
          <div className="align-self-center ">
            <div className="intro mx-auto">
              {/* K-06b (SEO-12, FE-23, DSG-09): one static h1, name + role,
                  complete in the first render. The role keeps its own
                  language when it differs from the page's (TR pages). */}
              <h1 className="intro__name">
                {hero.name}{" "}
                <span
                  className="intro__role"
                  lang={
                    hero.roleLang === route.locale ? undefined : hero.roleLang
                  }
                >
                  {hero.role}
                </span>
              </h1>
              {/* Subheadline (MKT-02, MKT-16): what he builds, then one short
                  line: where he works, or what he is open to once the owner
                  sets the availability (./heroStatus.js). */}
              <p className="intro__lead">{hero.lead}</p>
              <p className="intro__status" data-status={status.status}>
                {status.text}
              </p>
              {/* The line under it turns once and stops on its last phrase
                  (CSS only, ./style.css; still under reduced motion).
                  Screen readers skip the moving copy and read the sentence
                  once from the hidden text (DSG-09, FE-23). */}
              <p className="intro__tagline">
                <span className="rotator" aria-hidden="true">
                  {hero.phrases.map((phrase, index) => (
                    <span key={phrase} style={{ "--i": index }}>
                      {phrase}
                    </span>
                  ))}
                </span>
                <span className="visually-hidden">{hero.phrasesText}</span>
              </p>
              <p className="intro__proof">{hero.proofLine}</p>
              {/* One action, one evidence link (MKT-19). The button is the
                  link itself, with no block element inside it, so the focus
                  ring wraps the whole button (DSG-28). */}
              <div className="intro__cta pb-5">
                <div className="intro_btn-action">
                  <Link
                    to={lp("/contact")}
                    id="button_h"
                    className="ac_btn btn"
                    onClick={() =>
                      track("cta_clicked", { cta_id: CTA.HERO_CONTACT })
                    }
                  >
                    {t("cta.primary")}
                    <span className="ring one" aria-hidden="true" />
                    <span className="ring two" aria-hidden="true" />
                    <span className="ring three" aria-hidden="true" />
                  </Link>
                  <Link
                    to={lp("/portfolio")}
                    className="intro__textlink"
                    onClick={() =>
                      track("cta_clicked", { cta_id: CTA.HERO_PORTFOLIO })
                    }
                  >
                    {t("cta.secondary")} <span aria-hidden="true">→</span>
                  </Link>
                </div>
                <p className="intro__note">
                  {t("cta.note", { time: contact.responseTime })}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="h_bg-image position-relative">
          <picture>
            <source
              type="image/avif"
              srcSet={AVIF_SRCSET}
              sizes={HERO_IMAGE.sizes}
            />
            <source
              type="image/webp"
              srcSet={WEBP_SRCSET}
              sizes={HERO_IMAGE.sizes}
            />
            <img
              src={FALLBACK_SRC}
              srcSet={JPEG_SRCSET}
              sizes={HERO_IMAGE.sizes}
              width={HERO_IMAGE.width}
              height={HERO_IMAGE.height}
              alt={t("home.photoAlt")}
              fetchPriority="high"
              loading="eager"
            />
          </picture>
        </div>
      </div>
    </section>
  );
};
