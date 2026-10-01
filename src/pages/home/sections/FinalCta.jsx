import { Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import button from "../../../components/actionbutton/button.module.css";
import { useContent, useLocalePath, useT } from "../../../i18n";
import styles from "./sections.module.css";

// The closing call to action of the home page (MKT-03 step 3). It repeats the
// value sentence of the hero (hero.lead, MKT-02), uses the hero's primary CTA
// label (cta.primary, MKT-19) and carries the same reply promise
// (contact.responseTime, D8). The click is not tracked yet: the cta_id
// catalogue (src/lib/analytics/events.js) has no id for this button, and
// sending the hero's id would count the two buttons together (handoff).
export function FinalCta() {
  const t = useT();
  const lp = useLocalePath();
  const { hero, contact } = useContent();
  return (
    <section
      id="cta"
      className={`${styles.section} ${styles.finalCta}`}
      aria-labelledby="home-cta-title"
    >
      <Container>
        <h2 className="h3" id="home-cta-title">
          {t("home.finalTitle")}
        </h2>
        <p className={styles.finalLead}>{hero.lead}</p>
        <Link to={lp("/contact")} className={`${button.button} btn`}>
          {t("cta.primary")}
        </Link>
        <p className={styles.finalNote}>
          {t("cta.note", { time: contact.responseTime })}
        </p>
      </Container>
    </section>
  );
}
