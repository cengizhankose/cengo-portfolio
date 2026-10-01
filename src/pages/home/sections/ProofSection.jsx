import { Container } from "react-bootstrap";
import { ProofStrip } from "../../../components/proofstrip";
import { useT } from "../../../i18n";
import styles from "./sections.module.css";

// "Where I've worked and what I've won" (MKT-03, MKT-04): the compact proof
// strip right under the hero. The strip draws no title of its own; this
// section owns the h2.
export function ProofSection() {
  const t = useT();
  return (
    <section
      id="proof"
      className={`${styles.section} section-gap`}
      aria-labelledby="home-proof-title"
    >
      <Container>
        <h2 className="h3 py-4" id="home-proof-title">
          {t("home.proofTitle")}
        </h2>
        <ProofStrip variant="compact" />
      </Container>
    </section>
  );
}
