import "./style.css";
import { Container, Row, Col } from "react-bootstrap";
import { useRoute, useT } from "../../i18n";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";

export const Portfolio = () => {
  const route = useRoute();
  const t = useT();
  usePageMeta(getPageMeta(route, route.locale));

  return (
    <Container>
      <Row className="mb-5 mt-3">
        <Col lg="8">
          <h1 className="display-4 mb-4">{t("portfolio.title")}</h1>
          <hr className="t_border my-4 ms-0 text-start" />
          <h2 className="display-4 mt-4">{t("portfolio.underConstruction")}</h2>
        </Col>
      </Row>
    </Container>
  );
};
