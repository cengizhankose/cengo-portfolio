// With today's route table (only EN static pages live) the switcher renders
// nothing: its code ships in Adım A, it appears when W11 opens the TR pages
// (FE-14 step 8, notes: "switcher renders only when LIVE.static.length > 1").
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LanguageSwitcher } from "../../../src/components/langswitch";
import Headermain from "../../../src/header";
import { LIVE } from "../../../src/seo/routes.js";

describe("language switcher while only EN is live", () => {
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
