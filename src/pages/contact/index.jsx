import { useEffect, useRef, useState } from "react";
import "./style.css";
import "../privacy/style.css";
import { Container, Row, Col, Alert } from "react-bootstrap";
import { Link, useSearchParams } from "react-router-dom";
import { email, emailjs } from "../../content/shared.js";
import {
  interpolate,
  useContent,
  useLocalePath,
  useRoute,
  useT,
} from "../../i18n";
import {
  formErrorCode,
  messageLengthBucket,
} from "../../lib/analytics/buckets.js";
import { LOCATIONS } from "../../lib/analytics/events.js";
import { track } from "../../lib/analytics/index.js";
import { getPageMeta } from "../../seo/pages.js";
import { SOCIAL_PROFILES } from "../../seo/site.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import { bookingHref } from "./config.js";

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

// The privacy note under the form, also the submit button's description.
const NOTE_ID = "contact-privacy-note";

// project_type is the qualifying field (MKT-10): empty until the visitor
// picks one, or until `?type=<id>` preselects it (services CTAs, MKT-13).
const EMPTY_FIELDS = {
  name: "",
  email: "",
  message: "",
  project_type: "",
  [HONEYPOT]: "",
};

const LINKEDIN_URL = SOCIAL_PROFILES.find(
  (profile) => profile.id === "linkedin",
)?.url;

// Every mailto: link of the page counts as one email_link_clicked (ANL-02).
const trackEmailClick = () =>
  track("email_link_clicked", { location: LOCATIONS.CONTACT_PAGE });

// Renders a status message (contact.success / error / rateLimited):
// `{emailMe}` becomes a mailto: link whose text is contact.emailMe and
// `{latestPost}` a link to the blog whose text is contact.latestPost.
// alert-link takes the alert's own text colour (the global link colour is the
// page text colour, unreadable on the light alert background).
function StatusMessage({ text, emailText, postText, postTo }) {
  const parts = text.split(/(\{emailMe\}|\{latestPost\})/);
  return (
    <>
      {parts.map((part, index) => {
        if (part === "{emailMe}") {
          return (
            <a
              key={index}
              className="alert-link"
              href={`mailto:${email}`}
              onClick={trackEmailClick}
            >
              {emailText}
            </a>
          );
        }
        if (part === "{latestPost}") {
          return (
            <Link key={index} className="alert-link" to={postTo}>
              {postText}
            </Link>
          );
        }
        return part;
      })}
    </>
  );
}

export const ContactUs = () => {
  const route = useRoute();
  const t = useT();
  const lp = useLocalePath();
  const { contact } = useContent();
  const [searchParams] = useSearchParams();
  const booking = bookingHref();
  usePageMeta(getPageMeta(route, route.locale));
  const [formData, setFormdata] = useState(() => {
    // `?type=ai` preselects the project type; a value that is not in the list
    // is ignored (MKT-10 step 7).
    const requested = searchParams.get("type");
    const known = contact.projectTypes.some((type) => type.id === requested);
    return {
      ...EMPTY_FIELDS,
      project_type: known ? requested : "",
      loading: false,
      show: false,
      status: "success",
    };
  });
  // Blocks a second send before React re-renders the disabled button
  // (double click in the same frame).
  const sending = useRef(false);
  // contact_form_started fires once per visit to the page (ANL-02).
  const started = useRef(false);
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
    // project_type is the language independent id, project_type_label its
    // text in the visitor's language, locale the page language: the owner's
    // EmailJS template prints them (MKT-10).
    const projectType = contact.projectTypes.find(
      (type) => type.id === formData.project_type,
    );
    const templateParams = {
      from_name: formData.email,
      user_name: formData.name,
      to_name: email,
      message: formData.message,
      project_type: formData.project_type,
      project_type_label: projectType?.label ?? "",
      locale: route.locale,
    };
    // What the analytics plan may keep of this send (ANL-02): a length
    // bucket and the chosen type, never the typed text.
    const eventProps = {
      message_length_bucket: messageLengthBucket(formData.message.length),
      project_type: formData.project_type,
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
          track("contact_form_submitted", { result: "success", ...eventProps });
          // Fields are cleared only after a successful send.
          showResult("success", true);
        },
        // Every failure lands here: the SDK did not load (site data blocked,
        // chunk not fetched), EmailJS refused it, or the network failed.
        (error) => {
          sending.current = false;
          // The raw error stays in the console, never in the UI.
          console.error("Contact form: message not sent", error);
          track("contact_form_submitted", {
            result: "error",
            error_code: formErrorCode(error),
            ...eventProps,
          });
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

  // The first focus on a real field starts the form (focus bubbles in
  // React). The honeypot is not a field anyone uses.
  const handleFormFocus = (e) => {
    if (started.current || e.target.name === HONEYPOT) return;
    started.current = true;
    track("contact_form_started");
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
            <hr className="section-rule my-4 ms-0 text-start" />
          </Col>
        </Row>
        <Row className="section-gap">
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
                  text={t(`contact.${formData.status}`, {
                    time: contact.responseTime,
                  })}
                  emailText={t("contact.emailMe")}
                  postText={t("contact.latestPost")}
                  postTo={lp("/blog")}
                />
              </p>
            </Alert>
          </Col>
          <Col lg="5" className="mb-5">
            <h2 className="h3 py-4">{t("contact.reachMe")}</h2>
            {/* Low-friction ways in besides the form (MKT-12): the domain
                address, a booking link once the owner has one, LinkedIn. */}
            {/* data-analytics-location: the LinkedIn and booking clicks are
                outbound_link_clicked with location contact_page, not "other"
                (W8-ANL-locale-segmentation handoff). */}
            <address
              className="contact__ways"
              data-analytics-location={LOCATIONS.CONTACT_PAGE}
            >
              <p>
                <strong>{t("contact.emailLabel")}</strong>{" "}
                <a href={`mailto:${email}`} onClick={trackEmailClick}>
                  {email}
                </a>
              </p>
              {booking && (
                <p>
                  <a href={booking} target="_blank" rel="noopener noreferrer">
                    {t("contact.bookCall")} <span aria-hidden="true">→</span>
                    <span className="visually-hidden">
                      {" "}
                      {t("contact.newTab")}
                    </span>
                  </a>
                </p>
              )}
              <p>
                <a
                  href={LINKEDIN_URL}
                  target="_blank"
                  rel="me noopener noreferrer"
                >
                  {t("contact.linkedin")} <span aria-hidden="true">→</span>
                  <span className="visually-hidden">
                    {" "}
                    {t("contact.newTab")}
                  </span>
                </a>
              </p>
            </address>
          </Col>
          <Col lg="7">
            {/* The promise and the process come before the form (MKT-10). */}
            <div className="contact__intro">
              <p>
                {interpolate(contact.description, {
                  time: contact.responseTime,
                })}
              </p>
              <ol>
                {contact.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <form
              onSubmit={handleSubmit}
              onFocus={handleFormFocus}
              className="contact__form w-100"
            >
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
                <label htmlFor="project_type" className="form-label">
                  {t("contact.form.projectType")}
                </label>
                <select
                  className="form-control contact__select"
                  id="project_type"
                  name="project_type"
                  autoComplete="off"
                  value={formData.project_type}
                  required
                  onChange={handleChange}
                >
                  <option value="">
                    {t("contact.form.projectTypeChoose")}
                  </option>
                  {contact.projectTypes.map(({ id, label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
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
                aria-describedby={NOTE_ID}
              >
                {formData.loading ? t("contact.sending") : t("contact.submit")}
              </button>
              {/* Privacy notice (SEC-25, ANL-04): what happens to the data,
                  in the page's language, with the link to the privacy page. */}
              <p className="privacy-note" id={NOTE_ID}>
                {t("privacy.formNote")}{" "}
                <Link to={lp("/privacy")}>{t("privacy.formLink")}</Link>
              </p>
            </form>
          </Col>
        </Row>
      </Container>
      <div className={formData.loading ? "loading-bar" : "d-none"}></div>
    </>
  );
};
