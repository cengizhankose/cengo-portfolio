// MKT-10, MKT-12, ANL-02, rendered: the contact page in both languages. The
// TR pages are not live yet (LIVE.static = ['en']), so the route table is
// mocked as after SEO-11 Adım B to render /tr/contact. EmailJS and analytics
// are mocked: nothing leaves the test, and the events are read from the mock.
// The existing form behaviour (FE-15, SEC-24) is pinned in
// tests/frontend/contact/**.
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});
vi.mock("@emailjs/browser", () => ({ default: { send: vi.fn() } }));
vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

import emailjs from "@emailjs/browser";

const { ContactUs } = await import("../../../src/pages/contact/index.jsx");
const { getContent } = await import("../../../src/content/index.js");
const { email, emailjs: ids } = await import("../../../src/content/shared.js");
const { translate } = await import("../../../src/i18n/translate.js");
const { track } = await import("../../../src/lib/analytics/index.js");
const { PII_KEYS, PROJECT_TYPES, sanitizeProps } =
  await import("../../../src/lib/analytics/events.js");
const { SOCIAL_PROFILES } = await import("../../../src/seo/site.js");

const TYPED = {
  name: "Jane Doe",
  email: "jane@example.com",
  message: "Hi, I need an app.",
};

function renderContact(path = "/contact") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ContactUs />
    </MemoryRouter>,
  );
}

const select = () => document.querySelector('select[name="project_type"]');
const submit = () => document.querySelector("button[type=submit]");
const typeOf = (name) => document.querySelector(`[name="${name}"]`);
const events = (name) => track.mock.calls.filter(([n]) => n === name);

async function fillForm(user, { type = "web" } = {}) {
  await user.type(typeOf("name"), TYPED.name);
  await user.type(typeOf("email"), TYPED.email);
  if (type) await user.selectOptions(select(), type);
  await user.type(typeOf("message"), TYPED.message);
}

beforeEach(() => {
  emailjs.send.mockReset();
  emailjs.send.mockResolvedValue({ status: 200, text: "OK" });
  track.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  ["/contact", "en", "/blog"],
  ["/tr/contact", "tr", "/tr/blog"],
])("%s", (path, locale, blogHref) => {
  const { contact } = getContent(locale);
  const t = (key, vars) => translate(locale, key, vars);
  const typeLabels = contact.projectTypes.map((type) => type.label);

  describe("qualification (MKT-10)", () => {
    it("has a required, labelled project type select with the six choices", () => {
      renderContact(path);

      const field = screen.getByLabelText(t("contact.form.projectType"));
      expect(field).toBe(select());
      expect(field).toBeRequired();
      expect(field).toHaveAttribute("id", "project_type");
      expect(field.labels).toHaveLength(1);
      const options = [...field.options];
      expect(options.map((option) => option.value)).toEqual([
        "",
        ...PROJECT_TYPES,
      ]);
      expect(options.map((option) => option.textContent)).toEqual([
        t("contact.form.projectTypeChoose"),
        ...typeLabels,
      ]);
      expect(field.value).toBe("");
    });

    it("sits between the name/email row and the message", () => {
      renderContact(path);

      const order = ["name", "email", "project_type", "message"].map((name) =>
        typeOf(name),
      );
      for (let i = 1; i < order.length; i += 1) {
        expect(order[i - 1].compareDocumentPosition(order[i])).toBe(
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }
    });

    it("does not send, and reports nothing, while no type is chosen", async () => {
      const user = userEvent.setup();
      renderContact(path);
      await fillForm(user, { type: null });

      expect(select().validity.valueMissing).toBe(true);
      await user.click(submit());

      expect(emailjs.send).not.toHaveBeenCalled();
      expect(events("contact_form_submitted")).toHaveLength(0);
    });

    it.each(PROJECT_TYPES)("preselects ?type=%s", (id) => {
      renderContact(`${path}?type=${id}`);
      expect(select().value).toBe(id);
    });

    it("ignores a type that is not in the list, or an empty one", () => {
      for (const query of ["?type=zzz", "?type=", "?type=AI", "?other=ai"]) {
        const { unmount } = renderContact(`${path}${query}`);
        expect(select().value, query).toBe("");
        unmount();
      }
    });

    it("the submit button says what it sends", () => {
      renderContact(path);
      expect(screen.getByRole("button", { name: t("contact.submit") })).toBe(
        submit(),
      );
      expect(submit().textContent).not.toBe("Send");
    });

    it("puts the reply promise and the three steps above the form, from the content", () => {
      renderContact(path);

      const intro = document.querySelector(".contact__intro");
      const form = document.querySelector("form");
      expect(intro.compareDocumentPosition(form)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(intro.querySelector("p").textContent).toBe(
        contact.description.replace("{time}", contact.responseTime),
      );
      expect(intro.querySelector("p").textContent).toContain(
        contact.responseTime,
      );
      expect(
        [...intro.querySelectorAll("ol > li")].map((li) => li.textContent),
      ).toEqual(contact.steps);
      expect(intro.textContent).not.toMatch(/[[\]{}]/);
    });
  });

  describe("a sent message (MKT-10, ANL-02)", () => {
    it("hands EmailJS the project type, its label and the page language", async () => {
      const user = userEvent.setup();
      renderContact(path);
      await fillForm(user, { type: "ai" });

      await user.click(submit());

      await waitFor(() => expect(emailjs.send).toHaveBeenCalledTimes(1));
      const [serviceId, templateId, params, options] =
        emailjs.send.mock.calls[0];
      expect([serviceId, templateId]).toEqual([ids.serviceId, ids.templateId]);
      expect(params).toEqual({
        from_name: TYPED.email,
        user_name: TYPED.name,
        to_name: email,
        message: TYPED.message,
        project_type: "ai",
        project_type_label: contact.projectTypes.find((x) => x.id === "ai")
          .label,
        locale,
      });
      expect(options.publicKey).toBe(ids.publicKey);
    });

    it("confirms with the promise and a link to the blog, then clears every field", async () => {
      const user = userEvent.setup();
      renderContact(path);
      await fillForm(user);

      await user.click(submit());

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveClass("alert-success");
      expect(alert.textContent).toBe(
        t("contact.success", { time: contact.responseTime }).replace(
          "{latestPost}",
          t("contact.latestPost"),
        ),
      );
      expect(alert.textContent).toContain(contact.responseTime);
      expect(alert.textContent).not.toMatch(/[{}[\]]/);
      const link = within(alert).getByRole("link", {
        name: t("contact.latestPost"),
      });
      expect(link).toHaveAttribute("href", blogHref);
      expect(link).toHaveClass("alert-link");
      expect(
        ["name", "email", "message", "project_type"].map(
          (n) => typeOf(n).value,
        ),
      ).toEqual(["", "", "", ""]);
    });

    it("reports one contact_form_submitted with the bucket and the type, nothing typed", async () => {
      const user = userEvent.setup();
      renderContact(path);
      await fillForm(user, { type: "web" });

      await user.click(submit());
      await screen.findByRole("alert");

      expect(events("contact_form_submitted")).toEqual([
        [
          "contact_form_submitted",
          {
            result: "success",
            message_length_bucket: "lt_200",
            project_type: "web",
          },
        ],
      ]);
    });

    it.each([
      [1, "lt_200"],
      [199, "lt_200"],
      [200, "200_1000"],
      [1000, "200_1000"],
      [1001, "gt_1000"],
    ])("a %i character message is reported as %s", async (length, bucket) => {
      const user = userEvent.setup();
      renderContact(path);
      await user.type(typeOf("name"), TYPED.name);
      await user.type(typeOf("email"), TYPED.email);
      await user.selectOptions(select(), "other");
      fireEvent.change(typeOf("message"), {
        target: { value: "x".repeat(length) },
      });

      await user.click(submit());
      await screen.findByRole("alert");

      expect(events("contact_form_submitted")[0][1].message_length_bucket).toBe(
        bucket,
      );
    });
  });

  describe("a failed message (ANL-02 step 3)", () => {
    it.each([
      [{ status: 412, text: "Gmail_API: Invalid grant" }, "412"],
      [{ status: 400, text: "Bad Request" }, "400"],
      [{ status: 0, text: "Network Error" }, "0"],
      [new TypeError("Failed to fetch"), "unknown"],
    ])(
      "%o is reported as error_code %s, keeping what was typed",
      async (rejection, code) => {
        emailjs.send.mockRejectedValue(rejection);
        const user = userEvent.setup();
        renderContact(path);
        await fillForm(user, { type: "mobile" });

        await user.click(submit());

        expect(await screen.findByRole("alert")).toHaveClass("alert-danger");
        expect(events("contact_form_submitted")).toEqual([
          [
            "contact_form_submitted",
            {
              result: "error",
              error_code: code,
              message_length_bucket: "lt_200",
              project_type: "mobile",
            },
          ],
        ]);
        // FE-15: nothing the visitor typed is lost, the chosen type included.
        expect(
          ["name", "email", "message", "project_type"].map(
            (n) => typeOf(n).value,
          ),
        ).toEqual([TYPED.name, TYPED.email, TYPED.message, "mobile"]);
      },
    );

    it("a rate-limited send (429) is an error event with code 429", async () => {
      emailjs.send.mockRejectedValue({
        status: 429,
        text: "Too Many Requests",
      });
      const user = userEvent.setup();
      renderContact(path);
      await fillForm(user);

      await user.click(submit());
      await screen.findByRole("alert");

      expect(events("contact_form_submitted")[0][1]).toMatchObject({
        result: "error",
        error_code: "429",
      });
    });
  });

  describe("what the events may carry (ANL-02)", () => {
    it("never a name, an address or message text, and every property passes the catalogue", async () => {
      const user = userEvent.setup();
      renderContact(path);
      await fillForm(user);
      await user.click(submit());
      await screen.findByRole("alert");
      const mail = screen.getByRole("link", { name: email });
      mail.addEventListener("click", (event) => event.preventDefault());
      await user.click(mail);

      expect(track.mock.calls.length).toBeGreaterThanOrEqual(3);
      const serialised = JSON.stringify(track.mock.calls);
      for (const typed of Object.values(TYPED)) {
        expect(serialised).not.toContain(typed);
      }
      for (const [name, props = {}] of track.mock.calls) {
        for (const key of PII_KEYS) expect(props).not.toHaveProperty(key);
        expect(sanitizeProps(name, props)).toEqual(props);
      }
    });

    it("contact_form_started once, on the first focus of a real field", async () => {
      const user = userEvent.setup();
      renderContact(path);
      expect(events("contact_form_started")).toHaveLength(0);

      await user.click(typeOf("name"));
      await user.click(typeOf("email"));
      await user.click(typeOf("name"));
      await user.click(select());

      expect(events("contact_form_started")).toEqual([
        ["contact_form_started"],
      ]);
    });

    it("the honeypot is no start, and a bot's fill sends nothing at all", async () => {
      const user = userEvent.setup();
      renderContact(path);
      fireEvent.focus(typeOf("subject"));
      expect(events("contact_form_started")).toHaveLength(0);

      await user.type(typeOf("name"), TYPED.name);
      await user.type(typeOf("email"), TYPED.email);
      await user.selectOptions(select(), "web");
      await user.type(typeOf("message"), TYPED.message);
      fireEvent.change(typeOf("subject"), { target: { value: "Cheap offer" } });
      track.mockClear();

      await user.click(submit());

      expect(await screen.findByRole("alert")).toHaveClass("alert-success");
      expect(emailjs.send).not.toHaveBeenCalled();
      expect(events("contact_form_submitted")).toHaveLength(0);
    });

    it("the mailto link reports email_link_clicked from the contact page", async () => {
      const user = userEvent.setup();
      renderContact(path);

      const link = screen.getByRole("link", { name: email });
      expect(link).toHaveAttribute("href", `mailto:${email}`);
      // jsdom does not follow mailto: links.
      link.addEventListener("click", (event) => event.preventDefault());
      await user.click(link);

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith("email_link_clicked", {
        location: "contact_page",
      });
    });

    it("the mailto link of the error message reports it too", async () => {
      emailjs.send.mockRejectedValue({ status: 500 });
      const user = userEvent.setup();
      renderContact(path);
      await fillForm(user);
      await user.click(submit());
      const alert = await screen.findByRole("alert");
      track.mockClear();

      const link = within(alert).getByRole("link", {
        name: t("contact.emailMe"),
      });
      link.addEventListener("click", (event) => event.preventDefault());
      await user.click(link);

      expect(track).toHaveBeenCalledWith("email_link_clicked", {
        location: "contact_page",
      });
    });
  });

  describe("other ways in (MKT-12)", () => {
    it("shows the address on the site's domain, never a gmail address", () => {
      renderContact(path);

      const address = document.querySelector("address");
      const mail = within(address).getByRole("link", { name: email });
      expect(mail.getAttribute("href")).toMatch(
        /^mailto:[^@]+@cengizhankose\.com$/,
      );
      expect(document.body.textContent).not.toMatch(/gmail\.com/i);
    });

    it("links LinkedIn in a new tab, with the label of the page language", () => {
      renderContact(path);

      const linkedin = SOCIAL_PROFILES.find(
        (profile) => profile.id === "linkedin",
      );
      const link = document.querySelector(`address a[href="${linkedin.url}"]`);
      expect(link).not.toBeNull();
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toMatch(/\bnoopener\b/);
      expect(link.textContent).toContain(t("contact.linkedin"));
      expect(link.textContent).toContain(t("contact.newTab"));
    });

    it("shows no booking link while no booking page is set", () => {
      renderContact(path);

      expect(
        screen.queryByRole("link", { name: new RegExp(t("contact.bookCall")) }),
      ).toBeNull();
      expect(document.querySelectorAll("address a")).toHaveLength(2);
    });

    it("has the column heading of the page language", () => {
      renderContact(path);
      expect(
        screen.getByRole("heading", { level: 2, name: t("contact.reachMe") }),
      ).toBeInTheDocument();
    });
  });

  it("passes the axe form, label and link rules", async () => {
    const { container } = renderContact(`${path}?type=ai`);

    const results = await axe.run(container, {
      runOnly: {
        type: "rule",
        values: [
          "label",
          "select-name",
          "form-field-multiple-labels",
          "aria-hidden-focus",
          "button-name",
          "link-name",
          "duplicate-id",
          "heading-order",
          "empty-heading",
          "nested-interactive",
          "aria-allowed-attr",
          "aria-valid-attr-value",
          "list",
          "listitem",
        ],
      },
      resultTypes: ["violations"],
    });

    expect(results.violations.map(({ id }) => id)).toEqual([]);
  });
});
