// Rendered pages only carry Bootstrap classes the subset compiles (PERF-09,
// FE-21). react-bootstrap builds class names at runtime (col-lg-8, alert-danger,
// alert-dismissible, btn-close), which the source scan in subset.test.js
// cannot see, so every page, the blog post and both contact alerts are
// rendered and their DOM classes are checked against the compiled CSS (or a
// local rule, such as .navbar-brand in src/header/style.css).
// EmailJS and the posts API are stubbed: nothing leaves the test.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@emailjs/browser", () => ({ default: { send: vi.fn() } }));

import emailjs from "@emailjs/browser";
import App from "../../../src/app/App";
import { ContactUs } from "../../../src/pages/contact";
import {
  classSelectors,
  compileSubset,
  fullBootstrapClasses,
  localClasses,
} from "./support.js";

const POST = {
  id: 1,
  slug: "fixture-post",
  lang: "en",
  title: "Fixture post",
  excerpt: "Excerpt.",
  content: "Body with a table.\n\n| a | b |\n| - | - |\n| 1 | 2 |",
  translations: [],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const PAGES = [
  "/",
  "/about",
  "/contact",
  "/portfolio",
  "/blog",
  "/blog/fixture-post",
  "/no-such-page",
];

let bootstrap;
let compiled;
let local;
const seen = new Map();

beforeAll(async () => {
  bootstrap = fullBootstrapClasses();
  compiled = classSelectors((await compileSubset()).css);
  local = localClasses();
}, 30_000);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      // List keys carry ?lang= since W5 (FE-12); posts are /api/posts/<slug>.
      const body = /\/api\/posts(\?|$)/.test(String(url)) ? [POST] : POST;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

// Records the Bootstrap class names in the current DOM under `where` and
// returns those that neither the subset nor a local stylesheet defines.
function collect(where) {
  const missing = new Set();
  for (const element of document.querySelectorAll("[class]")) {
    for (const name of element.classList) {
      if (!bootstrap.has(name)) continue;
      if (!seen.has(name)) seen.set(name, where);
      if (!compiled.has(name) && !local.has(name)) missing.add(name);
    }
  }
  return [...missing];
}

async function fillAndSend(user) {
  await user.type(screen.getByLabelText("Name"), "Jane Doe");
  await user.type(screen.getByLabelText("Email"), "jane@example.com");
  await user.type(screen.getByLabelText("Message"), "Hi");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  return screen.findByRole("alert");
}

describe("rendered Bootstrap classes (FE-21)", () => {
  it.each(PAGES)("renders %s", async (path) => {
    window.history.replaceState(null, "", path);
    render(<App />);
    expect(
      await screen.findByRole("heading", { level: 1 }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector(".blog-loading")).toBeNull(),
    );
    expect(collect(path)).toEqual([]);
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("renders the contact success and error alerts", async () => {
    const user = userEvent.setup();

    emailjs.send.mockResolvedValueOnce({ status: 200, text: "OK" });
    render(
      <MemoryRouter initialEntries={["/contact"]}>
        <ContactUs />
      </MemoryRouter>,
    );
    expect(await fillAndSend(user)).toHaveClass("alert-success");
    expect(collect("/contact success alert")).toEqual([]);
    cleanup();

    emailjs.send.mockRejectedValueOnce({ status: 500, text: "fail" });
    render(
      <MemoryRouter initialEntries={["/contact"]}>
        <ContactUs />
      </MemoryRouter>,
    );
    const alert = await fillAndSend(user);
    expect(alert).toHaveClass("alert-danger", "alert-dismissible");
    expect(collect("/contact error alert")).toEqual([]);

    // FE-21 criterion 4: the close button (.btn-close) closes the alert.
    const close = screen.getByRole("button", { name: "Close alert" });
    expect(close).toHaveClass("btn-close");
    await user.click(close);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reached the react-bootstrap output in the renders above", () => {
    expect([...seen.keys()]).toEqual(
      expect.arrayContaining([
        "container",
        "row",
        "col-lg-8",
        "alert",
        "alert-success",
        "alert-danger",
        "alert-dismissible",
        "btn-close",
        "table",
        "form-control",
        "fixed-top",
        "navbar-brand",
      ]),
    );
  });
});
