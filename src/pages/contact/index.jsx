import { useEffect, useRef, useState } from "react";
import "./style.css";
import { Container, Row, Col, Alert } from "react-bootstrap";
import { email, emailjs } from "../../content/shared.js";
import { useContent, useRoute, useT } from "../../i18n";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";

// SEC-24: @emailjs/browser v4 options. blockHeadless rejects automated
// browsers, limitRate allows one send per 30 s per browser (localStorage).
const RATE_LIMIT_ID = "contact-form";
const SEND_OPTIONS = {
  publicKey: emailjs.publicKey,
  blockHeadless: true,
  limitRate: { id: RATE_LIMIT_ID, throttle: 30000 },
};

// EmailJS rejects with status 429 when limitRate blocks a send.
const RATE_LIMITED = 429;

// The SDK is loaded when a message is sent, never with the page (SEC-24,
// FE-24). @emailjs/browser v4 reads `localStorage` while its module loads,
// and that read throws SecurityError when the browser blocks site data. In
// the main chunk the throw left every route blank; loaded here, it rejects
// like any failed send and the error message offers the mailto: link.
const loadEmailjs = () => import("@emailjs/browser").then((sdk) => sdk.default);

// limitRate stores its timestamp before the request goes out. When the send
// then fails, nothing was delivered: drop the timestamp so an immediate retry
// is not refused with the "one message every 30 seconds" message.
function forgetRateLimit() {
  try {
    window.localStorage.removeItem(RATE_LIMIT_ID);
  } catch {
    // Site data blocked: no timestamp was stored.
  }
}

// Honeypot field (SEC-24). Browser autofill must not fill it: that would drop
// a real visitor's message while showing "Message sent". Checked in Chrome
// 154: the name `company` is classified COMPANY_NAME, and a field with no
// label of its own takes its label from nearby text ("Email: …" in the left
// column) and becomes EMAIL_ADDRESS, even off screen. `subject` with its own
// aria-label stays UNKNOWN_TYPE, which autofill never fills. The wrapper is
// aria-hidden, so screen readers do not announce the label (contact.honeypot,
// a neutral text in every language).
const HONEYPOT = "subject";

const EMPTY_FIELDS = { name: "", email: "", message: "", [HONEYPOT]: "" };

// Renders a status message (contact.success / error / rateLimited);
// `{emailMe}` becomes a mailto: link whose text is contact.emailMe.
// alert-link takes the alert's own text colour (the global link colour is the
// page text colour, unreadable on the light alert background).
function StatusMessage({ text, linkText }) {
  const [before, after] = text.split("{emailMe}");
  if (after === undefined) return before;
  return (
    <>
      {before}
      <a className="alert-link" href={`mailto:${email}`}>
        {linkText}
      </a>
      {after}
    </>
  );
}

export const ContactUs = () => {
  const route = useRoute();
  const t = useT();
  const { contact } = useContent();
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

    // Honeypot (SEC-24): people never see this field, bots fill it. Nothing
    // is sent, the bot still sees the success message.
    if (formData[HONEYPOT]) {
      showResult("success", true);
      return;
    }

    // Built from the values at submit time, before any state update.
    const templateParams = {
      from_name: formData.email,
      user_name: formData.name,
      to_name: email,
      message: formData.message,
    };

    sending.current = true;
    setFormdata((prev) => ({ ...prev, loading: true, show: false }));

    loadEmailjs()
      .then((sdk) =>
        sdk.send(
          emailjs.serviceId,
          emailjs.templateId,
          templateParams,
          SEND_OPTIONS,
        ),
      )
      .then(
        () => {
          sending.current = false;
          // Fields are cleared only after a successful send.
          showResult("success", true);
        },
        // Every failure lands here: the SDK did not load (site data blocked,
        // chunk not fetched), EmailJS refused it, or the network failed.
        (error) => {
          sending.current = false;
          // The raw error stays in the console, never in the UI.
          console.error("Contact form: message not sent", error);
          const rateLimited = error?.status === RATE_LIMITED;
          if (!rateLimited) forgetRateLimit();
          showResult(rateLimited ? "rateLimited" : "error", false);
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
            <h1 className="display-4 mb-4">{t("contact.title")}</h1>
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
              closeLabel={t("contact.closeAlert")}
              dismissible
            >
              <p className="my-0">
                <StatusMessage
                  text={t(`contact.${formData.status}`)}
                  linkText={t("contact.emailMe")}
                />
              </p>
            </Alert>
          </Col>
          <Col lg="5" className="mb-5">
            <h2 className="h3 color_sec py-4">{t("contact.getInTouch")}</h2>
            <address>
              <strong>{t("contact.emailLabel")}</strong>{" "}
              <a href={`mailto:${email}`}>{email}</a>
            </address>
            <p>{contact.description}</p>
          </Col>
          <Col lg="7" className="d-flex align-items-center">
            <form onSubmit={handleSubmit} className="contact__form w-100">
              <Row>
                <Col lg="6" className="mb-3">
                  <label htmlFor="name" className="form-label">
                    {t("contact.form.name")}
                  </label>
                  <input
                    className="form-control"
                    id="name"
                    name="name"
                    placeholder={t("contact.placeholder.name")}
                    autoComplete="name"
                    value={formData.name}
                    type="text"
                    required
                    onChange={handleChange}
                  />
                </Col>
                <Col lg="6" className="mb-3">
                  <label htmlFor="email" className="form-label">
                    {t("contact.form.email")}
                  </label>
                  <input
                    className="form-control rounded-0"
                    id="email"
                    name="email"
                    placeholder={t("contact.placeholder.email")}
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
                  {t("contact.form.message")}
                </label>
                <textarea
                  className="form-control rounded-0"
                  id="message"
                  name="message"
                  placeholder={t("contact.placeholder.message")}
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
                  id={HONEYPOT}
                  name={HONEYPOT}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-label={t("contact.honeypot")}
                  data-1p-ignore
                  data-lpignore="true"
                  data-bwignore="true"
                  value={formData[HONEYPOT]}
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
                {formData.loading ? t("contact.sending") : t("contact.submit")}
              </button>
            </form>
          </Col>
        </Row>
      </Container>
      <div className={formData.loading ? "loading-bar" : "d-none"}></div>
    </>
  );
};
