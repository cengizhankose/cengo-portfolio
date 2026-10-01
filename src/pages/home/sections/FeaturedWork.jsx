import { FaTrophy } from "react-icons/fa";
import { Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import { publishedProjects } from "../../../content/projects.js";
import { useContent, useLocalePath, useT } from "../../../i18n";
import styles from "./sections.module.css";

// How many of the published cases the home page shows (MKT-03: three).
export const FEATURED_COUNT = 3;

// "Selected work" (MKT-03): the first three published cases (registry order,
// src/content/projects.js, the same records as the portfolio page), each with
// its title, the podium badge when there is one, the one-line result and a
// link to its card on /portfolio, then "All work". A case without card text in
// the page's language is skipped, and with no case at all the section is not
// drawn (T-10: the portfolio has no menu link then either).
export function FeaturedWork() {
  const t = useT();
  const lp = useLocalePath();
  const { projects } = useContent();

  const items = publishedProjects()
    .map((project) => ({
      project,
      text: projects.find((entry) => entry.id === project.id),
    }))
    .filter(({ text }) => text)
    .slice(0, FEATURED_COUNT);
  if (items.length === 0) return null;

  return (
    <section
      id="work"
      className={`${styles.section} section-gap`}
      aria-labelledby="home-work-title"
    >
      <Container>
        <h2 className="h3 py-4" id="home-work-title">
          {t("home.workTitle")}
        </h2>
        <ul className={`${styles.workGrid} list-unstyled`}>
          {items.map(({ project, text }) => (
            <li key={project.id} className={styles.workCard}>
              {text.awardLabel && (
                <p className={styles.workAward}>
                  <FaTrophy aria-hidden="true" focusable="false" />{" "}
                  {text.awardLabel}
                </p>
              )}
              <h3 className={`h5 ${styles.workTitle}`}>{text.title}</h3>
              <p className={styles.workResult}>{text.result}</p>
              <p className={styles.workLink}>
                <Link
                  to={`${lp("/portfolio")}#project-${project.id}`}
                  className={styles.textLink}
                >
                  {t("home.workCase")} <span aria-hidden="true">→</span>
                  <span className="visually-hidden"> {text.title}</span>
                </Link>
              </p>
            </li>
          ))}
        </ul>
        <p className={styles.sectionMore}>
          <Link to={lp("/portfolio")} className={styles.textLink}>
            {t("home.workAll")} <span aria-hidden="true">→</span>
          </Link>
        </p>
      </Container>
    </section>
  );
}
