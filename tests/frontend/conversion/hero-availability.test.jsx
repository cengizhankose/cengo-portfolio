// MKT-16 criterion 3: changing `availability.status` changes what the hero
// says. The content is mocked field by field, the way the owner will edit it.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({ status: "closed", text: "" }));

vi.mock("../../../src/content/index.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getContent: (locale) => {
      const content = actual.getContent(locale);
      return {
        ...content,
        hero: { ...content.hero, availability: { ...availability } },
      };
    },
  };
});
vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const { Home } = await import("../../../src/pages/home/index.jsx");
const { getContent } = await import("../../../src/content/index.js");

const { location } = getContent("en").hero;

function status() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Home />
    </MemoryRouter>,
  );
  const line = document.querySelector(".intro__status");
  return [line.textContent, line.getAttribute("data-status")];
}

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  Object.assign(availability, { status: "closed", text: "" });
});

describe("hero status line", () => {
  it("closed: the location", () => {
    availability.text = "Open to work from March 2027.";
    expect(status()).toEqual([location, "closed"]);
  });

  it.each(["open", "limited"])(
    "%s: the availability text, without brackets",
    (value) => {
      Object.assign(availability, {
        status: value,
        text: "Based in Istanbul, open to freelance projects from March 2027.",
      });
      expect(status()).toEqual([
        "Based in Istanbul, open to freelance projects from March 2027.",
        value,
      ]);
      expect(document.querySelector("#home").textContent).not.toMatch(/[[\]]/);
    },
  );

  it("open with the draft's brackets still in the text: the location, not the draft", () => {
    Object.assign(availability, {
      status: "open",
      text: "Based in Istanbul, open to [freelance projects / full-time roles] from [month year].",
    });
    expect(status()).toEqual([location, "closed"]);
    expect(document.querySelector("#home").textContent).not.toMatch(/[[\]]/);
  });
});
