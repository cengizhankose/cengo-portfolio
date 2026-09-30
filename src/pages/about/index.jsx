import "./style.css";
import { Container, Row, Col } from "react-bootstrap";
import { useContent, useRoute, useT } from "../../i18n";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";

// Heading outline (SEO-13, FE-27): one h1, an h2 per section, an h3 per
// service. `h3` / `h5` classes keep the previous visual sizes.
export const About = () => {
  const route = useRoute();
  const t = useT();
  const { about, timeline, skills, services } = useContent();
  usePageMeta(getPageMeta(route, route.locale));

  return (
    // `About-header` scopes the DSG-01 table rule in ./style.css.
    <Container className="About-header">
      <Row className="mb-5 mt-3">
        <Col lg="8">
          <h1 className="display-4 mb-4">{t("about.title")}</h1>
          <hr className="t_border my-4 ms-0 text-start" />
        </Col>
      </Row>
      <Row className="sec_sp">
        <Col lg="5">
          <h2 className="h3 color_sec py-4">{t("about.intro")}</h2>
        </Col>
        <Col lg="7" className="d-flex align-items-center">
          <div>
            <p>{about.summary}</p>
          </div>
        </Col>
      </Row>
      <Row className="sec_sp">
        <Col lg="5">
          <h2 className="h3 color_sec py-4">{t("about.timeline")}</h2>
        </Col>
        <Col lg="7">
          <table className="table caption-top">
            <tbody>
              {timeline.map((data) => (
                <tr key={`${data.jobtitle}|${data.where}`}>
                  <th scope="row">{data.jobtitle}</th>
                  <td>{data.where}</td>
                  <td>{data.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Col>
      </Row>
      <Row className="sec_sp">
        <Col lg="5">
          <h2 className="h3 color_sec py-4">{t("about.skills")}</h2>
        </Col>
        <Col lg="7">
          <ul className="skills-list progress-container list-unstyled mb-0">
            {skills.map((skill) => (
              <li key={skill.name} className="progress-item progress-title">
                {skill.name}
              </li>
            ))}
          </ul>
        </Col>
      </Row>
      <Row className="sec_sp">
        <Col lg="5">
          <h2 className="h3 color_sec py-4">{t("about.services")}</h2>
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
    </Container>
  );
};
