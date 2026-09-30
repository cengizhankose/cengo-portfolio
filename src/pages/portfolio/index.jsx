import "./style.css";
import { Container, Row, Col } from "react-bootstrap";
import { Link } from "react-router-dom";
import ExternalLink from "../../components/ExternalLink.jsx";
import {
  FEATURED_REPOS,
  HACKATHON_ARCHIVE,
  publishedProjects,
} from "../../content/projects.js";
import { useContent, useLocalePath, useRoute, useT } from "../../i18n";
import { getPageMeta } from "../../seo/pages.js";
import { SOCIAL_PROFILES } from "../../seo/site.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import ProjectCard from "./ProjectCard.jsx";
import { projectLinkProps } from "./tracking.js";

const GITHUB = SOCIAL_PROFILES.find((profile) => profile.id === "github");

// The portfolio (FE-04 Aşama B, DSG-08, MKT-01, ANL-11, MKT-18): the
// published cases in registry order, the hackathon archive teaser, the
// selected GitHub repos and a closing call to action. What is published is
// decided in src/content/projects.js; a record waiting for permission or
// confirmation never reaches this page.
export const Portfolio = () => {
  const route = useRoute();
  const t = useT();
  const lp = useLocalePath();
  const { projects, featuredRepos, awards } = useContent();
  usePageMeta(getPageMeta(route, route.locale));

  // Cases that have their text; `position` counts the tracked items of the
  // page in order (cases, archive, repos).
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
          <hr className="t_border my-4 ms-0 text-start" />
          {cases.length > 0 && (
            <p className="portfolio__lead">{t("portfolio.lead")}</p>
          )}
        </Col>
      </Row>

      {cases.length === 0 ? (
        <Row className="sec_sp">
          <Col lg="8">
            <p className="portfolio__lead">{t("portfolio.empty")}</p>
            <ul className="portfolio__empty-links list-unstyled">
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
          <ul className="project-grid list-unstyled">
            {cases.map(({ project, text }, index) => (
              <li key={project.id}>
                <ProjectCard
                  project={project}
                  text={text}
                  position={index + 1}
                />
              </li>
            ))}
          </ul>

          <section
            className="portfolio-archive"
            aria-labelledby="portfolio-archive-title"
          >
            <h2 className="h4" id="portfolio-archive-title">
              {t("portfolio.archive.title", { count: awards.length })}
            </h2>
            <p>{t("portfolio.archive.text")}</p>
            <Link
              to={`${lp(HACKATHON_ARCHIVE.path)}#${HACKATHON_ARCHIVE.hash}`}
              {...projectLinkProps(
                HACKATHON_ARCHIVE.id,
                "case_study",
                archivePosition,
              )}
            >
              {t("portfolio.archive.cta")}
              <span aria-hidden="true"> →</span>
            </Link>
          </section>
        </>
      )}

      {repos.length > 0 && (
        <section className="portfolio-repos" aria-labelledby="portfolio-repos">
          <h2 className="h3 color_sec py-4" id="portfolio-repos">
            {t("portfolio.repos.title")}
          </h2>
          <ul className="repo-list list-unstyled">
            {repos.map(({ repo, text }, index) => (
              <li key={repo.id} className="repo-list__item">
                <ExternalLink
                  href={repo.href}
                  className="repo-list__name"
                  {...projectLinkProps(repo.id, "repo", repoPosition(index))}
                >
                  {text.name}
                </ExternalLink>
                <p className="repo-list__what">{text.what}</p>
                {text.learned && (
                  <p className="repo-list__learned">
                    <span className="repo-list__learned-label">
                      {t("portfolio.repos.learned")}
                    </span>{" "}
                    {text.learned}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="repo-list__all">
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

      <section className="portfolio-cta">
        <p>{t("portfolio.contact.text")}</p>
        <Link to={lp("/contact")} className="portfolio-cta__link">
          {t("portfolio.contact.cta")}
          <span aria-hidden="true"> →</span>
        </Link>
      </section>
    </Container>
  );
};
