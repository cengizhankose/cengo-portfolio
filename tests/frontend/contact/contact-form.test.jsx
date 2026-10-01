// Contact form behaviour: MKT-11 / DSG-05 / FE-15 (the typed text survives
// sending and errors, fields clear only after success, one send per click),
// DSG-04 (visible, bound labels), FE-36 / DSG-23 / MKT-09 (status messages,
// no raw EmailJS error, mailto fallback) and SEC-24 / FE-24 (@emailjs/browser
// v4 options, honeypot). EmailJS is mocked: nothing leaves the test. The page
// loads the SDK with import() when the form is sent; vi.mock covers that
// import too. Load failures are in sdk-load-failure.test.jsx.
import {
  act,
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

vi.mock("@emailjs/browser", () => ({ default: { send: vi.fn() } }));

import emailjs from "@emailjs/browser";
import { email, emailjs as ids } from "../../../src/content/shared.js";
import { ContactUs } from "../../../src/pages/contact";
import contact from "../../../src/pages/contact/contact.module.css";

const TYPED = { name: "Jane Doe", email: "jane@example.com", message: "Hi" };
const HONEYPOT = "subject";
const FIELD_IDS = ["name", "email", "message"];
const RATE_LIMIT_ID = "contact-form";
const SEND_OPTIONS = {
  publicKey: ids.publicKey,
  blockHeadless: true,
  limitRate: { id: RATE_LIMIT_ID, throttle: 30000 },
};

let consoleError;

beforeEach(() => {
  emailjs.send.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

function renderContact() {
  return render(
    <MemoryRouter initialEntries={["/contact"]}>
      <ContactUs />
    </MemoryRouter>,
  );
}

const values = () => FIELD_IDS.map((id) => document.getElementById(id).value);
const submitButton = () => document.querySelector("button[type=submit]");

async function fillForm(user) {
  await user.type(screen.getByLabelText("Name"), TYPED.name);
  await user.type(screen.getByLabelText("Email"), TYPED.email);
  await user.selectOptions(screen.getByLabelText("Project type"), "web");
  await user.type(screen.getByLabelText("Message"), TYPED.message);
}

// A promise the test settles by hand, to look at the form mid-request.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// React warnings about inputs switching between controlled and uncontrolled.
const controlledWarnings = () =>
  consoleError.mock.calls
    .map((args) => args.map(String).join(" "))
    .filter((text) => /uncontrolled|controlled input/i.test(text));

describe("labels (DSG-04, FE-15)", () => {
  it("binds a visible label to each of the four fields", () => {
    renderContact();

    for (const label of ["Name", "Email", "Project type", "Message"]) {
      expect(screen.getByLabelText(label)).toBeInstanceOf(HTMLElement);
    }
    const labels = [
      ...document.querySelectorAll(`.${contact.contactForm} label`),
    ];
    expect(labels.filter((label) => label.control)).toHaveLength(4);
    expect(
      FIELD_IDS.every((id) => document.getElementById(id).labels.length === 1),
    ).toBe(true);
  });

  it("focuses the email field when its label is clicked", async () => {
    const user = userEvent.setup();
    renderContact();

    await user.click(screen.getByText("Email", { selector: "label" }));

    expect(document.activeElement.id).toBe("email");
  });

  it("uses placeholders only as examples ending in an ellipsis", () => {
    renderContact();

    expect(
      FIELD_IDS.map((id) => document.getElementById(id).placeholder),
    ).toEqual(["Jane Doe…", "you@example.com…", "Tell me about your project…"]);
  });

  it("names the submit button after its action", () => {
    renderContact();

    expect(
      screen.getByRole("button", { name: "Send details" }),
    ).toHaveAttribute("type", "submit");
  });
});

describe("failed send (MKT-11, DSG-05, FE-15, FE-36)", () => {
  it("keeps the three values and shows the error without the raw EmailJS text", async () => {
    emailjs.send.mockRejectedValue({ status: 400, text: "Bad Request" });
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);

    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(values()).toEqual([TYPED.name, TYPED.email, TYPED.message]);
    expect(alert).toHaveClass("alert-danger");
    expect(alert).toHaveTextContent(
      "Your message couldn’t be sent. Please try again or email me directly.",
    );
    expect(alert.textContent).not.toContain("Bad Request");
    expect(alert.textContent).not.toContain("!");
    expect(screen.queryByText(/Bad Request/)).toBeNull();
    const link = within(alert).getByRole("link", { name: /email me/i });
    expect(link.getAttribute("href")).toMatch(/^mailto:/);
    expect(link).toHaveAttribute("href", `mailto:${email}`);
    // Readable on the alert background: Bootstrap's alert link colour.
    expect(link).toHaveClass("alert-link");
    // The raw error is only logged.
    expect(consoleError).toHaveBeenCalled();
  });

  it("moves focus to the result alert", async () => {
    emailjs.send.mockRejectedValue({ status: 0, text: "Network Error" });
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);

    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(document.activeElement).toBe(alert);
    expect(alert).toHaveAttribute("tabindex", "-1");
  });

  it("keeps the values when the error alert is closed and returns focus to the form", async () => {
    emailjs.send.mockRejectedValue({ status: 0, text: "Network Error" });
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);
    await user.click(submitButton());
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Close alert" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(values()).toEqual([TYPED.name, TYPED.email, TYPED.message]);
    expect(document.activeElement).toBe(submitButton());
  });

  it("can be retried after an error and then clears on success", async () => {
    emailjs.send
      .mockRejectedValueOnce({ status: 0, text: "Network Error" })
      .mockResolvedValueOnce({ status: 200, text: "OK" });
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);

    await user.click(submitButton());
    await screen.findByRole("alert");
    await user.click(submitButton());

    expect(emailjs.send).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("alert")).toHaveClass("alert-success");
    expect(values()).toEqual(["", "", ""]);
  });

  it("explains the 30 s limit when EmailJS rate-limits the send (SEC-24)", async () => {
    emailjs.send.mockRejectedValue({ status: 429, text: "Too Many Requests" });
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);

    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("alert-danger");
    expect(alert).toHaveTextContent(
      "You can send one message every 30 seconds. Wait a moment and try again, or email me directly.",
    );
    expect(alert.textContent).not.toContain("Too Many Requests");
    expect(
      within(alert).getByRole("link", { name: /email me/i }),
    ).toHaveAttribute("href", `mailto:${email}`);
    expect(values()).toEqual([TYPED.name, TYPED.email, TYPED.message]);
  });

  // limitRate writes its timestamp before the request. A send that fails for
  // another reason delivered nothing, so the timestamp is dropped and an
  // immediate retry is not answered with the 30 s message.
  it.each([
    ["drops", "a network error", { status: 0, text: "Network Error" }, null],
    ["drops", "an EmailJS error", { status: 400, text: "Bad Request" }, null],
    [
      "keeps",
      "a 429 rate limit",
      { status: 429, text: "Too Many Requests" },
      "1700000000000",
    ],
  ])(
    "%s the stored rate-limit timestamp after %s",
    async (_verb, _case, rejection, expected) => {
      window.localStorage.setItem(RATE_LIMIT_ID, "1700000000000");
      emailjs.send.mockRejectedValue(rejection);
      const user = userEvent.setup();
      renderContact();
      await fillForm(user);

      await user.click(submitButton());
      await screen.findByRole("alert");

      expect(window.localStorage.getItem(RATE_LIMIT_ID)).toBe(expected);
    },
  );

  it("leaves the rate-limit timestamp alone after a successful send", async () => {
    window.localStorage.setItem(RATE_LIMIT_ID, "1700000000000");
    emailjs.send.mockResolvedValue({ status: 200, text: "OK" });
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);

    await user.click(submitButton());
    await screen.findByRole("alert");

    expect(window.localStorage.getItem(RATE_LIMIT_ID)).toBe("1700000000000");
  });
});

describe("successful send (MKT-11, DSG-05, FE-15)", () => {
  it("shows the success alert and clears the three fields", async () => {
    emailjs.send.mockResolvedValue({ status: 200, text: "OK" });
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);

    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("alert-success");
    expect(alert).toHaveTextContent(
      "Got it. I’ll reply to your email within 2 business days. Meanwhile, have a look at my latest post.",
    );
    expect(alert.textContent).not.toContain("!");
    expect(values()).toEqual(["", "", ""]);
    expect(document.activeElement).toBe(alert);
  });

  it("leaves the fields unchanged when the success alert is closed", async () => {
    emailjs.send.mockResolvedValue({ status: 200, text: "OK" });
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);
    await user.click(submitButton());
    await screen.findByRole("alert");
    await user.type(screen.getByLabelText("Name"), "Next");

    await user.click(screen.getByRole("button", { name: "Close alert" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(values()).toEqual(["Next", "", ""]);
  });

  it("sends the typed values with the @emailjs/browser v4 options as the 4th argument (SEC-24, FE-24)", async () => {
    emailjs.send.mockResolvedValue({ status: 200, text: "OK" });
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);

    await user.click(submitButton());

    expect(emailjs.send).toHaveBeenCalledTimes(1);
    expect(emailjs.send).toHaveBeenCalledWith(
      ids.serviceId,
      ids.templateId,
      {
        from_name: TYPED.email,
        user_name: TYPED.name,
        to_name: email,
        to_email: email,
        message: TYPED.message,
        project_type: "web",
        project_type_label: "Web app",
        locale: "en",
      },
      SEND_OPTIONS,
    );
    expect(typeof emailjs.send.mock.calls[0][3].publicKey).toBe("string");
    expect(emailjs.send.mock.calls[0][3].publicKey.length).toBeGreaterThan(0);
  });
});

describe("while sending (DSG-05, MKT-11)", () => {
  it("disables the button, keeps the text and sends once on a double click", async () => {
    const pending = deferred();
    emailjs.send.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);

    await user.dblClick(submitButton());

    // send runs after the SDK import resolves.
    await waitFor(() => expect(emailjs.send).toHaveBeenCalled());
    expect(emailjs.send).toHaveBeenCalledTimes(1);
    expect(document.querySelector("button[type=submit][disabled]")).toBe(
      submitButton(),
    );
    expect(submitButton()).toHaveAttribute("aria-busy", "true");
    expect(submitButton()).toHaveTextContent("Sending…");
    expect(values()).toEqual([TYPED.name, TYPED.email, TYPED.message]);
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => pending.resolve({ status: 200, text: "OK" }));

    expect(submitButton()).not.toBeDisabled();
    expect(submitButton()).toHaveAttribute("aria-busy", "false");
    expect(submitButton()).toHaveTextContent("Send details");
  });

  it("ignores a second submit fired before React re-renders", async () => {
    const pending = deferred();
    emailjs.send.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);
    const form = document.querySelector(`.${contact.contactForm}`);

    act(() => {
      form.requestSubmit();
      form.requestSubmit();
    });

    await waitFor(() => expect(emailjs.send).toHaveBeenCalled());
    expect(emailjs.send).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject({ status: 0, text: "Network Error" }));
    expect(values()).toEqual([TYPED.name, TYPED.email, TYPED.message]);
  });

  it("logs no controlled/uncontrolled input warnings on the error and success paths", async () => {
    emailjs.send
      .mockRejectedValueOnce({ status: 0, text: "Network Error" })
      .mockResolvedValueOnce({ status: 200, text: "OK" });
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);

    await user.click(submitButton());
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Close alert" }));
    await user.click(submitButton());
    await screen.findByRole("alert");
    await user.type(screen.getByLabelText("Message"), "again");

    expect(controlledWarnings()).toEqual([]);
  });
});

describe("honeypot (SEC-24)", () => {
  it("is out of the tab order and the accessibility tree, and has no label", () => {
    renderContact();

    const trap = document.getElementById(HONEYPOT);
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap).toHaveAttribute("autocomplete", "off");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
    expect(trap.labels).toHaveLength(0);
    expect(screen.queryByRole("textbox", { name: /subject/i })).toBeNull();
  });

  // A real visitor's autofill must not fill the trap: that would drop the
  // message while showing "Message sent". In Chrome 154 a field named
  // `company` is COMPANY_NAME, and a trap without a label of its own takes
  // "Email: …" from the left column and becomes EMAIL_ADDRESS. `subject`
  // with its own aria-label is UNKNOWN_TYPE. Password managers skip it.
  it("uses a name and label autofill does not classify, and opts out of password managers", () => {
    renderContact();

    const trap = document.getElementById(HONEYPOT);
    expect(trap).toHaveAttribute("name", "subject");
    expect(document.getElementById("company")).toBeNull();
    expect(trap).toHaveAttribute("aria-label", "Leave this field empty");
    expect(trap).toHaveAttribute("data-1p-ignore");
    expect(trap).toHaveAttribute("data-lpignore", "true");
    expect(trap).toHaveAttribute("data-bwignore", "true");
  });

  it("does not call send when the hidden field is filled, and still reports success", async () => {
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);
    fireEvent.change(document.getElementById(HONEYPOT), {
      target: { value: "Cheap offer" },
    });

    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveClass("alert-success");
    expect(emailjs.send).toHaveBeenCalledTimes(0);
    expect(values()).toEqual(["", "", ""]);
    expect(document.getElementById(HONEYPOT).value).toBe("");
  });
});

describe("page semantics", () => {
  it("has one h1 and an h2 section heading, no skipped level", () => {
    renderContact();

    expect(
      [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
        (heading) => heading.tagName,
      ),
    ).toEqual(["H1", "H2"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Let’s work together",
    );
  });

  it.each([
    ["idle", null],
    ["error", { status: 0, text: "Network Error" }],
  ])(
    "passes the axe form/label rules (%s state)",
    async (_state, rejection) => {
      if (rejection) emailjs.send.mockRejectedValue(rejection);
      const user = userEvent.setup();
      const { container } = renderContact();
      if (rejection) {
        await fillForm(user);
        await user.click(submitButton());
        await screen.findByRole("alert");
      }

      const results = await axe.run(container, {
        runOnly: {
          type: "rule",
          values: [
            "label",
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
          ],
        },
        resultTypes: ["violations"],
      });

      expect(results.violations.map(({ id }) => id)).toEqual([]);
    },
  );
});
