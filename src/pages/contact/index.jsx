import { useEffect, useRef, useState } from "react";
import emailjs from "@emailjs/browser";
import "./style.css";
import { Container, Row, Col, Alert } from "react-bootstrap";
import { useLocation } from "react-router-dom";
import { contactConfig } from "../../content_option";
import { getPageMeta } from "../../seo/pages.js";
import { matchRoute } from "../../seo/routes.js";
import { usePageMeta } from "../../seo/usePageMeta.js";

// SEC-24: @emailjs/browser v4 options. blockHeadless rejects automated
// browsers, limitRate allows one send per 30 s per browser (localStorage).
const SEND_OPTIONS = {
  publicKey: contactConfig.YOUR_PUBLIC_KEY,
  blockHeadless: true,
  limitRate: { id: "contact-form", throttle: 30000 },
};

// EmailJS rejects with status 429 when limitRate blocks a send.
const RATE_LIMITED = 429;

const EMPTY_FIELDS = { name: "", email: "", message: "", company: "" };

const { messages } = contactConfig;

// Renders a status message; `{emailMe}` becomes a mailto: link. alert-link
// takes the alert's own text colour (the global link colour is the page
// text colour, unreadable on the light alert background).
function StatusMessage({ text }) {
  const [before, after] = text.split("{emailMe}");
  if (after === undefined) return before;
  return (
    <>
      {before}
      <a className="alert-link" href={`mailto:${contactConfig.YOUR_EMAIL}`}>
        {messages.emailMe}
      </a>
      {after}
    </>
  );
}

export const ContactUs = () => {
  const route = matchRoute(useLocation().pathname);
  usePageMeta(getPageMeta(route, route.locale));
  const [formData, setFormdata] = useState({
    ...EMPTY_FIELDS,
    loading: false,
    show: false,
    status: "success",
  });
  // Blocks a second send before React re-renders the disabled button
  // (double click in the same frame).
  const sending = useRef(false);
  const alertRef = useRef(null);
  const submitRef = useRef(null);

  // The result alert takes focus so keyboard and screen reader users land on
  // it (FE-15). Runs after render: the alert does not exist before.
  useEffect(() => {
    if (!formData.show) return;
    alertRef.current?.scrollIntoView?.({ block: "nearest" });
    alertRef.current?.focus();
  }, [formData.show, formData.status]);

  const showResult = (status, clearFields) =>
    setFormdata((prev) => ({
      ...prev,
      ...(clearFields ? EMPTY_FIELDS : {}),
      loading: false,
      show: true,
      status,
    }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (sending.current || formData.loading) return;

    // Honeypot (SEC-24): people never see the `company` field, bots fill
    // it. Nothing is sent, the bot still sees the success message.
    if (formData.company) {
      showResult("success", true);
      return;
    }

    // Built from the values at submit time, before any state update.
    const templateParams = {
      from_name: formData.email,
      user_name: formData.name,
      to_name: contactConfig.YOUR_EMAIL,
      message: formData.message,
    };

    sending.current = true;
    setFormdata((prev) => ({ ...prev, loading: true, show: false }));

    emailjs
      .send(
        contactConfig.YOUR_SERVICE_ID,
        contactConfig.YOUR_TEMPLATE_ID,
        templateParams,
        SEND_OPTIONS,
      )
      .then(
        () => {
          sending.current = false;
          // Fields are cleared only after a successful send.
          showResult("success", true);
        },
        (error) => {
          sending.current = false;
          // The raw EmailJS error stays in the console, never in the UI.
          console.error("Contact form: message not sent", error);
          showResult(
            error?.status === RATE_LIMITED ? "rateLimited" : "error",
            false,
          );
        },
      );
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormdata((prev) => ({ ...prev, [name]: value }));
  };

  const closeAlert = () => {
    setFormdata((prev) => ({ ...prev, show: false }));
    // The alert and its close button unmount: give focus back to the form.
    submitRef.current?.focus();
  };

  return (
    <>
      <Container>
        <Row className="mb-5 mt-3">
          <Col lg="8">
            <h1 className="display-4 mb-4">Contact me</h1>
            <hr className="t_border my-4 ms-0 text-start" />
          </Col>
        </Row>
        <Row className="sec_sp">
          <Col lg="12">
            <Alert
              ref={alertRef}
              show={formData.show}
              transition={false}
              variant={formData.status === "success" ? "success" : "danger"}
              className="rounded-0 co_alert"
              tabIndex={-1}
              onClose={closeAlert}
              dismissible
            >
              <p className="my-0">
                <StatusMessage text={messages[formData.status]} />
              </p>
            </Alert>
          </Col>
          <Col lg="5" className="mb-5">
            <h2 className="h3 color_sec py-4">Get in touch</h2>
            <address>
              <strong>Email:</strong>{" "}
              <a href={`mailto:${contactConfig.YOUR_EMAIL}`}>
                {contactConfig.YOUR_EMAIL}
              </a>
            </address>
            <p>{contactConfig.description}</p>
          </Col>
          <Col lg="7" className="d-flex align-items-center">
            <form onSubmit={handleSubmit} className="contact__form w-100">
              <Row>
                <Col lg="6" className="mb-3">
                  <label htmlFor="name" className="form-label">
                    Name
                  </label>
                  <input
                    className="form-control"
                    id="name"
                    name="name"
                    placeholder="Jane Doe…"
                    autoComplete="name"
                    value={formData.name}
                    type="text"
                    required
                    onChange={handleChange}
                  />
                </Col>
                <Col lg="6" className="mb-3">
                  <label htmlFor="email" className="form-label">
                    Email
                  </label>
                  <input
                    className="form-control rounded-0"
                    id="email"
                    name="email"
                    placeholder="you@example.com…"
                    autoComplete="email"
                    type="email"
                    value={formData.email}
                    required
                    onChange={handleChange}
                  />
                </Col>
              </Row>
              <div className="mb-3">
                <label htmlFor="message" className="form-label">
                  Message
                </label>
                <textarea
                  className="form-control rounded-0"
                  id="message"
                  name="message"
                  placeholder="Tell me about your project…"
                  rows="5"
                  value={formData.message}
                  onChange={handleChange}
                  required
                ></textarea>
              </div>
              {/* Honeypot (SEC-24): off screen, out of the tab order and the
                  accessibility tree; see handleSubmit. */}
              <div className="contact__hp" aria-hidden="true">
                <input
                  type="text"
                  id="company"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  value={formData.company}
                  onChange={handleChange}
                />
              </div>
              <button
                ref={submitRef}
                className="btn ac_btn"
                type="submit"
                disabled={formData.loading}
                aria-busy={formData.loading}
              >
                {formData.loading ? "Sending…" : "Send message"}
              </button>
            </form>
          </Col>
        </Row>
      </Container>
      <div className={formData.loading ? "loading-bar" : "d-none"}></div>
    </>
  );
};
