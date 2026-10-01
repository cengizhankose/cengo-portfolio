import { Container } from "react-bootstrap";
import { useContent, useT } from "../../../i18n";
import { ServiceLinks } from "./ServiceLinks.jsx";
import styles from "./sections.module.css";

// "How I can help" (MKT-03, MKT-13): four services, each with the outcome the
// client gets, one earlier piece of work and a link to the contact form with
// the project type preselected. One idea per section: what I can do for you.
export function Services() {
  const t = useT();
  const { services } = useContent();
  return (
    <section
      id="services"
      className={`${styles.section} section-gap`}
      aria-labelledby="home-services-title"
    >
      <Container>
        <h2 className="h3 py-4" id="home-services-title">
          {t("home.servicesTitle")}
        </h2>
        <ul className={`${styles.serviceGrid} list-unstyled`}>
          {services.map((service) => (
            <li key={service.id} className={styles.service}>
              <h3 className={`h5 ${styles.serviceTitle}`}>{service.title}</h3>
              <p className={styles.serviceOutcome}>{service.outcome}</p>
              <ServiceLinks service={service} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
