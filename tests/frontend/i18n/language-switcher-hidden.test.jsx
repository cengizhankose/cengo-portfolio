// Rollback check (FE-14 step 8, "switcher renders only when
// LIVE.static.length > 1"): the TR pages are open since W11, so this test
// closes them again with a mocked route table and expects the switcher to
// disappear with them. The live table is checked in language-switcher.test.jsx
// and i18n-routing-tr-live.test.jsx.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "../../../src/components/langswitch";
import Headermain from "../../../src/header";
import { LIVE } from "../../../src/seo/routes.js";

// Rollback check: the route table with the TR static pages closed again (the
// shape LIVE had before W11, SEO-11 Adım A).
vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  const closed = Object.freeze({
    static: Object.freeze(["en"]),
    post: actual.LIVE.post,
  });
  return {
    ...actual,
    LIVE: closed,
    matchRoute: (pathname, live = closed) => actual.matchRoute(pathname, live),
  };
});

describe("language switcher while the TR pages are closed (rollback)", () => {
  it("renders nothing", () => {
    expect(LIVE.static).toEqual(["en"]);
    const { container } = render(
      <MemoryRouter initialEntries={["/about"]}>
        <LanguageSwitcher />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("the header has no language navigation and no hreflang link", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <Headermain />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("navigation", { name: "Language" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector("a[hreflang]")).toBeNull();
  });
});
