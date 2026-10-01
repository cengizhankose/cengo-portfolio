import { Link } from "react-router-dom";
import ExternalLink from "../../../components/ExternalLink.jsx";
import { useLocalePath, useT } from "../../../i18n";
import { CTA } from "../../../lib/analytics/events.js";
import { track } from "../../../lib/analytics/index.js";
import styles from "./sections.module.css";

const isExternal = (to) => /^https?:\/\//i.test(to);

// The two links under a service (MKT-13): the earlier work that backs it up,
// and the call to action. Shared by the home page (Services.jsx) and the About
// page, so both draw the same links from the same content.
//   proof  { label, to }: `to` is a site path (the page adds the language
//          prefix) or an https URL, which opens in a new tab (ExternalLink).
//   cta    { label, to: "/contact?type=<id>" }; the contact form preselects
//          that project type (MKT-10). A click is one
//          cta_clicked { cta_id: service_contact, project_type: <id> }.
export function ServiceLinks({ service }) {
  const t = useT();
  const lp = useLocalePath();
  const { proof, cta } = service;
  const proofLine = (
    <>
      {proof.label} <span aria-hidden="true">→</span>
    </>
  );
  return (
    <>
      <p className={styles.serviceProof}>
        <span className="visually-hidden">{t("services.proofLabel")} </span>
        {isExternal(proof.to) ? (
          <ExternalLink href={proof.to} className={styles.textLink}>
            {proofLine}
          </ExternalLink>
        ) : (
          <Link to={lp(proof.to)} className={styles.textLink}>
            {proofLine}
          </Link>
        )}
      </p>
      <p className={styles.serviceCta}>
        <Link
          to={lp(cta.to)}
          className={styles.ctaLink}
          onClick={() =>
            track("cta_clicked", {
              cta_id: CTA.SERVICE_CONTACT,
              project_type: service.id,
            })
          }
        >
          {cta.label} <span aria-hidden="true">→</span>
        </Link>
      </p>
    </>
  );
}
