// Automated accessibility check of the site shell with axe-core, the engine
// behind the Lighthouse accessibility audits named in FE-02/FE-10 and the
// "V5 axe" checks in DSG-02/DSG-14. jsdom has no layout, so colour contrast
// and target size stay with the Lighthouse run on a real browser.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { renderSite } from "./support/site";

vi.mock("../../../src/pages/home", async () => ({
  Home: (await import("./support/pages.jsx")).Home,
}));
vi.mock("../../../src/pages/about", async () => ({
  About: (await import("./support/pages.jsx")).About,
}));
vi.mock("../../../src/pages/portfolio", async () => ({
  Portfolio: (await import("./support/pages.jsx")).Portfolio,
}));
vi.mock("../../../src/pages/contact", async () => ({
  ContactUs: (await import("./support/pages.jsx")).ContactUs,
}));
vi.mock("../../../src/pages/blog/BlogHome", async () => ({
  default: (await import("./support/pages.jsx")).BlogHome,
}));
vi.mock("../../../src/pages/blog/BlogPost", async () => ({
  default: (await import("./support/pages.jsx")).BlogPost,
}));

const RULES = [
  // FE-02 / DSG-02
  "button-name",
  "link-name",
  "aria-toggle-field-name",
  // FE-10 / DSG-14
  "landmark-one-main",
  "landmark-no-duplicate-main",
  "landmark-main-is-top-level",
  "landmark-complementary-is-top-level",
  "landmark-unique",
  "region",
  "bypass",
  // FE-11 / DSG-03
  "aria-allowed-attr",
  "aria-valid-attr",
  "aria-valid-attr-value",
  "aria-hidden-focus",
  "nested-interactive",
  "duplicate-id-aria",
];

async function violations() {
  const results = await axe.run(document, {
    runOnly: { type: "rule", values: RULES },
    resultTypes: ["violations"],
  });
  return results.violations.map(({ id, nodes }) => ({
    id,
    targets: nodes.map((node) => node.target.join(" ")),
  }));
}

describe("axe-core on the site shell", () => {
  it.each([
    "/",
    "/about",
    "/portfolio",
    "/contact",
    "/blog",
    "/blog/some-post",
  ])("%s has no violations with the menu closed", async (path) => {
    renderSite(path);

    expect(await violations()).toEqual([]);
  });

  it("has no violations with the menu open", async () => {
    const user = userEvent.setup();
    renderSite("/");

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(await violations()).toEqual([]);
  });
});
