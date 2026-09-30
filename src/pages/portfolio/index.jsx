import "./style.css";
import { Container, Row, Col } from "react-bootstrap";
import { useLocation } from "react-router-dom";
import { getPageMeta } from "../../seo/pages.js";
import { matchRoute } from "../../seo/routes.js";
import { usePageMeta } from "../../seo/usePageMeta.js";

export const Portfolio = () => {
  const route = matchRoute(useLocation().pathname);
  usePageMeta(getPageMeta(route, route.locale));

  return (
    <Container>
      <Row className="mb-5 mt-3">
        <Col lg="8">
          <h1 className="display-4 mb-4"> Portfolio </h1>{" "}
          <hr className="t_border my-4 ms-0 text-start" />
          <h2 className="display-4 mt-4"> 🚧 Under Construction 🚧 </h2>{" "}
        </Col>
      </Row>
    </Container>
  );
};
