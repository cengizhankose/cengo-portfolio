// Contact form behaviour: MKT-11 / DSG-05 / FE-15 (the typed text survives
// sending and errors, fields clear only after success, one send per click),
// DSG-04 (visible, bound labels), FE-36 / DSG-23 / MKT-09 (status messages,
// no raw EmailJS error, mailto fallback) and SEC-24 / FE-24 (@emailjs/browser
// v4 options, honeypot). EmailJS is mocked: nothing leaves the test.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@emailjs/browser", () => ({ default: { send: vi.fn() } }));

import emailjs from "@emailjs/browser";
import { contactConfig } from "../../../src/content_option";
import { ContactUs } from "../../../src/pages/contact";

const TYPED = { name: "Jane Doe", email: "jane@example.com", message: "Hi" };
const FIELD_IDS = ["name", "email", "message"];
const SEND_OPTIONS = {
  publicKey: contactConfig.YOUR_PUBLIC_KEY,
  blockHeadless: true,
  limitRate: { id: "contact-form", throttle: 30000 },
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
  it("binds a visible label to each of the three fields", () => {
    renderContact();

    for (const label of ["Name", "Email", "Message"]) {
      expect(screen.getByLabelText(label)).toBeInstanceOf(HTMLElement);
    }
    const labels = [...document.querySelectorAll(".contact__form label")];
    expect(labels.filter((label) => label.control)).toHaveLength(3);
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
      screen.getByRole("button", { name: "Send message" }),
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
    expect(link).toHaveAttribute("href", `mailto:${contactConfig.YOUR_EMAIL}`);
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
    ).toHaveAttribute("href", `mailto:${contactConfig.YOUR_EMAIL}`);
    expect(values()).toEqual([TYPED.name, TYPED.email, TYPED.message]);
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
      "Message sent. I’ll reply to your email shortly.",
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
      contactConfig.YOUR_SERVICE_ID,
      contactConfig.YOUR_TEMPLATE_ID,
      {
        from_name: TYPED.email,
        user_name: TYPED.name,
        to_name: contactConfig.YOUR_EMAIL,
        message: TYPED.message,
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
    expect(submitButton()).toHaveTextContent("Send message");
  });

  it("ignores a second submit fired before React re-renders", async () => {
    const pending = deferred();
    emailjs.send.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);
    const form = document.querySelector(".contact__form");

    act(() => {
      form.requestSubmit();
      form.requestSubmit();
    });

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

    const trap = document.getElementById("company");
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap).toHaveAttribute("autocomplete", "off");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
    expect(trap.labels).toHaveLength(0);
    expect(screen.queryByRole("textbox", { name: /company/i })).toBeNull();
  });

  it("does not call send when the hidden field is filled, and still reports success", async () => {
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);
    fireEvent.change(document.getElementById("company"), {
      target: { value: "ACME" },
    });

    await user.click(submitButton());

    expect(emailjs.send).toHaveBeenCalledTimes(0);
    expect(await screen.findByRole("alert")).toHaveClass("alert-success");
    expect(values()).toEqual(["", "", ""]);
    expect(document.getElementById("company").value).toBe("");
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
      "Contact me",
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
