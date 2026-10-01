import styles from "./portfolio.module.css";
import { useEffect, useRef } from "react";
import { Container, Row, Col } from "react-bootstrap";
import { Link, useLocation } from "react-router-dom";
import ExternalLink from "../../components/ExternalLink.jsx";
import { FEATURED_REPOS, publishedProjects } from "../../content/projects.js";
import { useContent, useLocalePath, useRoute, useT } from "../../i18n";
import { usePrefersReducedMotion } from "../../lib/useMediaQuery.js";
import { getPageMeta } from "../../seo/pages.js";
import { SOCIAL_PROFILES } from "../../seo/site.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import { Awards } from "./Awards.jsx";
import ProjectCard from "./ProjectCard.jsx";
import { projectLinkProps } from "./tracking.js";

const GITHUB = SOCIAL_PROFILES.find((profile) => profile.id === "github");

// The portfolio (FE-04 Aşama B, DSG-08, MKT-01, ANL-11, MKT-18, W13): the
// published cases in registry order, each with the project's own screenshot,
// then the hackathon podiums with the photos of the owner's posts (#awards),
// the selected GitHub repos and a closing call to action. What is published
// is decided in src/content/projects.js; a record waiting for permission or
// confirmation never reaches this page.
export const Portfolio = () => {
  const route = useRoute();
  const t = useT();
  const lp = useLocalePath();
  const { projects, featuredRepos } = useContent();
  const { hash } = useLocation();
  // Read when the hash changes; turning the setting on or off by itself must
  // not scroll the page again.
  const reducedMotion = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    reducedMotion.current = prefersReducedMotion;
  }, [prefersReducedMotion]);
  usePageMeta(getPageMeta(route, route.locale));

  // The router does not scroll to a hash: the home work cards and the service
  // proof links (/portfolio#project-<id>) land on their case through this,
  // and links to the podiums on #awards. Reduced motion: no smooth
  // scrolling, the page jumps.
  useEffect(() => {
    if (!hash) return;
    let target = hash.slice(1);
    try {
      target = decodeURIComponent(target);
    } catch {
      // A malformed escape: look the raw text up as it is.
    }
    document.getElementById(target)?.scrollIntoView?.({
      behavior: reducedMotion.current ? "auto" : "smooth",
    });
  }, [hash]);

  // Cases that have their text; `position` counts the tracked items of the
  // page in order (cases, the hackathon section, repos).
  const cases = publishedProjects()
    .map((project) => ({
      project,
      text: projects.find((entry) => entry.id === project.id),
    }))
    .filter(({ text }) => text);
  const archivePosition = cases.length + 1;
  const repoPosition = (index) => archivePosition + 1 + index;
  const repos = FEATURED_REPOS.map((repo) => ({
    repo,
    text: featuredRepos.find((entry) => entry.id === repo.id),
  })).filter(({ text }) => text);

  return (
    <Container className="portfolio">
      <Row className="mb-5 mt-3">
        <Col lg="8">
          <h1 className="display-4 mb-4">{t("portfolio.title")}</h1>
          <hr className="section-rule my-4 ms-0 text-start" />
          {cases.length > 0 && (
            <p className={styles.lead}>{t("portfolio.lead")}</p>
          )}
        </Col>
      </Row>

      {cases.length === 0 ? (
        <Row className="section-gap">
          <Col lg="8">
            <p className={styles.lead}>{t("portfolio.empty")}</p>
            <ul className={`${styles.emptyLinks} list-unstyled`}>
              <li>
                <Link to={lp("/blog")}>{t("portfolio.emptyBlog")}</Link>
              </li>
              <li>
                <ExternalLink href={GITHUB.url} me>
                  {t("portfolio.emptyGithub")}
                </ExternalLink>
              </li>
            </ul>
          </Col>
        </Row>
      ) : (
        <>
          <ol className={`${styles.cases} list-unstyled section-gap`}>
            {cases.map(({ project, text }, index) => (
              <li key={project.id}>
                <ProjectCard
                  project={project}
                  text={text}
                  position={index + 1}
                  eager={index === 0}
                />
              </li>
            ))}
          </ol>

          <Awards position={archivePosition} />
        </>
      )}

      {repos.length > 0 && (
        <section className="section-gap" aria-labelledby="portfolio-repos">
          <h2 className={styles.sectionTitle} id="portfolio-repos">
            {t("portfolio.repos.title")}
          </h2>
          <ul className={`${styles.repoList} list-unstyled`}>
            {repos.map(({ repo, text }, index) => (
              <li key={repo.id} className="repo-list__item">
                <ExternalLink
                  href={repo.href}
                  className={styles.repoName}
                  {...projectLinkProps(repo.id, "repo", repoPosition(index))}
                >
                  {text.name}
                </ExternalLink>
                <p className={styles.repoWhat}>{text.what}</p>
                {text.learned && (
                  <p className={styles.repoLearned}>
                    <span className={styles.repoLearnedLabel}>
                      {t("portfolio.repos.learned")}
                    </span>{" "}
                    {text.learned}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className={styles.repoAll}>
            <ExternalLink
              href={GITHUB.url}
              me
              data-analytics-location="portfolio"
            >
              {t("portfolio.repos.all")}
              <span aria-hidden="true"> →</span>
            </ExternalLink>
          </p>
        </section>
      )}

      <section className={styles.cta}>
        <p>{t("portfolio.contact.text")}</p>
        <Link to={lp("/contact")} className={styles.ctaLink}>
          {t("portfolio.contact.cta")}
          <span aria-hidden="true"> →</span>
        </Link>
      </section>
    </Container>
  );
};
