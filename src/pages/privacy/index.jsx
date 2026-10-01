import "./style.css";
import { Container, Row, Col } from "react-bootstrap";
import { email } from "../../content/shared.js";
import {
  useContent,
  useLocale,
  useLocalePath,
  useRoute,
  useT,
} from "../../i18n";
import { formatDate } from "../../lib/format.js";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import { LAST_UPDATED } from "./updated.js";

// The dictionary group of the statements about the visit statistics, in the
// order the page shows them. The key is composed here so that the tool's name
// followed by a dot never appears in page code: the analytics tests allow it
// only in src/lib/analytics.
const UMAMI = "privacy.umami";
const UMAMI_STATEMENTS = [
  "noCookies",
  "noIpStorage",
  "salt",
  "noThirdParty",
  "dnt",
];

// Renders `{email}` in a content text as a mailto: link.
function WithEmail({ text }) {
  return text.split(/(\{email\})/).map((part, index) =>
    part === "{email}" ? (
      <a key={index} href={`mailto:${email}`}>
        {email}
      </a>
    ) : (
      part
    ),
  );
}

function Section({ id, title, children }) {
  return (
    <Row className="privacy__section">
      <Col lg="5">
        <h2 className="h3 color_sec py-4" id={id}>
          {title}
        </h2>
      </Col>
      <Col lg="7">{children}</Col>
    </Row>
  );
}

const endSentence = (label) => `${label}.`;

// A list of { id, label, text } entries: the label in bold, the text after it.
function LabelledList({ items }) {
  return (
    <ul className="privacy__labelled list-unstyled">
      {items.map(({ id, label, text }) => (
        <li key={id}>
          <strong>{endSentence(label)}</strong> {text}
        </li>
      ))}
    </ul>
  );
}

// The privacy notice (SEC-25, ANL-04): one page in two languages (/privacy,
// /tr/privacy), everything from src/content/<lang>/privacy.js and the privacy
// namespace of the dictionary. The recipients come from privacyProcessors,
// the one list (same ids in both languages).
export const Privacy = () => {
  const route = useRoute();
  const t = useT();
  const lp = useLocalePath();
  const locale = useLocale();
  const { privacy } = useContent();
  usePageMeta(getPageMeta(route, route.locale));
  // Full page loads: the opt-out is applied once, when the page starts
  // (src/lib/analytics/guard.js), and the parameter is then removed.
  const optOutHref = `${lp("/")}?analytics=off`;
  const optInHref = `${lp("/")}?analytics=on`;

  return (
    <Container className="privacy__page">
      <Row className="mb-5 mt-3">
        <Col lg="8">
          <h1 className="display-4 mb-4">{t("privacy.title")}</h1>
          <hr className="t_border my-4 ms-0 text-start" />
          <p className="privacy__lead">{privacy.intro}</p>
          <p className="privacy__updated">
            <time dateTime={LAST_UPDATED}>
              {t("privacy.updated", { date: formatDate(LAST_UPDATED, locale) })}
            </time>
          </p>
        </Col>
      </Row>

      <Section id="privacy-controller" title={t("privacy.section.controller")}>
        <p>
          <WithEmail text={privacy.controller} />
        </p>
      </Section>

      <Section id="privacy-data" title={t("privacy.section.data")}>
        <LabelledList items={privacy.data} />
      </Section>

      <Section id="privacy-purposes" title={t("privacy.section.purposes")}>
        <LabelledList items={privacy.purposes} />
      </Section>

      <Section id="privacy-recipients" title={t("privacy.section.recipients")}>
        <ul className="privacy__processors list-unstyled">
          {privacy.privacyProcessors.map(
            ({ id, name, purpose, data, location }) => (
              <li key={id} data-processor={id}>
                <h3 className="h5">{name}</h3>
                <dl className="privacy__facts">
                  <dt>{t("privacy.processor.purpose")}</dt>
                  <dd>{purpose}</dd>
                  <dt>{t("privacy.processor.data")}</dt>
                  <dd>{data}</dd>
                  <dt>{t("privacy.processor.location")}</dt>
                  <dd>{location}</dd>
                </dl>
              </li>
            ),
          )}
        </ul>
      </Section>

      <Section id="privacy-analytics" title={t("privacy.section.analytics")}>
        <p>{privacy.analytics.text}</p>
        <ul className="privacy__list">
          {UMAMI_STATEMENTS.map((name) => (
            <li key={name}>{t(`${UMAMI}.${name}`)}</li>
          ))}
        </ul>
        <p>
          {t(`${UMAMI}.optOutLead`)}{" "}
          <a href={optOutHref}>{t(`${UMAMI}.optOut`)}</a> ·{" "}
          <a href={optInHref}>{t(`${UMAMI}.optIn`)}</a>
        </p>
      </Section>

      <Section id="privacy-retention" title={t("privacy.section.retention")}>
        <LabelledList items={privacy.retention} />
      </Section>

      <Section id="privacy-rights" title={t("privacy.section.rights")}>
        <p>{privacy.rights.intro}</p>
        <ul className="privacy__list">
          {privacy.rights.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>{privacy.rights.gdpr}</p>
        <p>
          <WithEmail text={privacy.rights.how} />
        </p>
        <p>{privacy.rights.complaint}</p>
      </Section>

      <Section id="privacy-changes" title={t("privacy.section.changes")}>
        <p>{privacy.changes}</p>
        <p className="privacy__updated">{t("privacy.disclaimer")}</p>
      </Section>
    </Container>
  );
};
