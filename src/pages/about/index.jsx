import "./style.css";
import { useEffect, useId } from "react";
import { Container, Row, Col } from "react-bootstrap";
import { Link, useLocation } from "react-router-dom";
import { AwardLine, DotLine, ProofStrip } from "../../components/proofstrip";
import { INTRO_REEL } from "../../content/projects.js";
import {
  useContent,
  useLocale,
  useLocalePath,
  useRoute,
  useT,
} from "../../i18n";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";

// Heading outline (SEO-13, FE-27, MKT-15): one h1, an h2 per section, an h3
// per service, per proof label and for the side projects. `h3` / `h5` classes
// keep the visual sizes. Order: story, proof, work timeline, skills,
// services, the hackathon archive (#awards), the intro reel (MKT-18, only
// while INTRO_REEL.published), talks, and the contact call to action in the
// last <section>.
export const About = () => {
  const route = useRoute();
  const t = useT();
  const lp = useLocalePath();
  const { hash } = useLocation();
  const { about, timeline, skills, services, awards } = useContent();
  const ids = useId();
  const locale = useLocale();
  // The reel has a voice-over: it is published only with a captions file
  // (tests/frontend/portfolio), so the track below always has its source.
  const captions = INTRO_REEL.captions[locale] ?? INTRO_REEL.captions.en;
  usePageMeta(getPageMeta(route, route.locale));

  // The router does not scroll to a hash: "10 podiums since 2021 → See all"
  // (ProofStrip) and links from other pages land on #awards through this.
  useEffect(() => {
    if (!hash) return;
    let target = hash.slice(1);
    try {
      target = decodeURIComponent(target);
    } catch {
      // A malformed escape: look the raw text up as it is.
    }
    document.getElementById(target)?.scrollIntoView?.();
  }, [hash]);

  return (
    // `About-header` scopes the DSG-01 table rule in ./style.css.
    <Container className="About-header">
      <Row className="mb-5 mt-3">
        <Col lg="8">
          <h1 className="display-4 mb-4">{t("about.title")}</h1>
          <hr className="section-rule my-4 ms-0 text-start" />
        </Col>
      </Row>
      <Row className="section-gap">
        <Col lg="5">
          <h2 className="h3 py-4">{t("about.intro")}</h2>
        </Col>
        <Col lg="7" className="d-flex align-items-center">
          <div>
            <p className="about-lead">{about.title}</p>
            {about.story.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </Col>
      </Row>
      <Row className="section-gap">
        <Col lg="5">
          <h2 className="h3 py-4">{t("about.proof")}</h2>
        </Col>
        <Col lg="7">
          <ProofStrip />
        </Col>
      </Row>
      <Row className="section-gap about-anchor" id="timeline">
        <Col lg="5">
          <h2 className="h3 py-4">{t("about.timeline")}</h2>
        </Col>
        <Col lg="7">
          {/* One body per role: the row with title, employer and dates, then
              the row with the outcome (MKT-15, SEO-18). The DSG-01 rule keeps
              the cells on the theme colours. The caption names the table for
              assistive technology; the h2 beside it is the visible title. */}
          <table className="table caption-top timeline">
            <caption className="visually-hidden">{t("about.timeline")}</caption>
            {timeline.map((data) => (
              <tbody key={data.id}>
                <tr className="timeline__role">
                  <th scope="row" id={`${ids}-${data.id}`}>
                    {data.jobtitle}
                  </th>
                  <td>{data.where}</td>
                  <td className="timeline__date">{data.date}</td>
                </tr>
                <tr className="timeline__outcome">
                  <td colSpan={3} headers={`${ids}-${data.id}`}>
                    {data.outcome}
                  </td>
                </tr>
              </tbody>
            ))}
          </table>
          <h3 className="h5 about-ventures__title">{t("about.ventures")}</h3>
          <ul className="about-ventures list-unstyled">
            {about.ventures.map((venture) => (
              <li key={venture.id}>
                <p className="about-venture__head">
                  <span className="about-venture__name">{venture.name}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{venture.role}</span>
                </p>
                {venture.description && (
                  <p className="about-venture__text">{venture.description}</p>
                )}
              </li>
            ))}
          </ul>
        </Col>
      </Row>
      <Row className="section-gap">
        <Col lg="5">
          <h2 className="h3 py-4">{t("about.skills")}</h2>
        </Col>
        <Col lg="7">
          <ul className="skill-groups list-unstyled mb-0">
            {skills.map((group) => (
              <li key={group.id} className="skill-group">
                <p className="skill-group__name" id={`${ids}-${group.id}`}>
                  {group.name}
                </p>
                <ul
                  className="skill-group__items list-unstyled"
                  aria-labelledby={`${ids}-${group.id}`}
                >
                  {group.items.map((item) => (
                    <li key={item} className="skill-chip">
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Col>
      </Row>
      <Row className="section-gap">
        <Col lg="5">
          <h2 className="h3 py-4">{t("about.services")}</h2>
        </Col>
        <Col lg="7">
          {services.map((service) => (
            <div className="service_ py-4" key={service.id}>
              <h3 className="h5 service__title">{service.title}</h3>
              <p className="service_desc">{service.description}</p>
            </div>
          ))}
        </Col>
      </Row>
      <Row className="section-gap about-anchor" id="awards">
        <Col lg="5">
          <h2 className="h3 py-4">{t("about.awards")}</h2>
        </Col>
        <Col lg="7">
          <ol className="awards-archive list-unstyled mb-0">
            {awards
              .filter((award) => !award.hidden)
              .map((award) => (
                <li key={award.id}>
                  <AwardLine award={award} />
                </li>
              ))}
          </ol>
        </Col>
      </Row>
      {INTRO_REEL.published && (
        <Row className="section-gap about-anchor" id="reel">
          <Col lg="5">
            <h2 className="h3 py-4">{t("portfolio.reel.title")}</h2>
          </Col>
          <Col lg="7">
            {/* 15 seconds, no autoplay (reduced motion, data use): the file
                loads only when the visitor presses play (preload="none"). */}
            <video
              className="about-reel"
              controls
              preload="none"
              playsInline
              poster={INTRO_REEL.poster}
              width={INTRO_REEL.width}
              height={INTRO_REEL.height}
              aria-label={t("portfolio.reel.label")}
            >
              <source src={INTRO_REEL.src} type="video/mp4" />
              <track
                kind="captions"
                src={captions}
                srcLang={INTRO_REEL.captions[locale] ? locale : "en"}
                label={
                  INTRO_REEL.captions[locale] ? locale.toUpperCase() : "EN"
                }
                default
              />
              {t("portfolio.reel.fallback")}
            </video>
          </Col>
        </Row>
      )}
      <Row className="section-gap about-anchor" id="talks">
        <Col lg="5">
          <h2 className="h3 py-4">{t("about.talks")}</h2>
        </Col>
        <Col lg="7">
          <ul className="about-talks list-unstyled mb-0">
            {about.talks.map((talk) => (
              <li key={talk.id}>
                <DotLine parts={[talk.event, talk.year]} href={talk.url} />
              </li>
            ))}
          </ul>
        </Col>
      </Row>
      <section className="about-cta" aria-labelledby={`${ids}-cta`}>
        <h2 className="h3" id={`${ids}-cta`}>
          {t("about.cta.title")}
        </h2>
        <p>{t("about.cta.text")}</p>
        <Link to={lp("/contact")} className="about-cta__button">
          {t("about.cta.button")}
        </Link>
      </section>
    </Container>
  );
};
