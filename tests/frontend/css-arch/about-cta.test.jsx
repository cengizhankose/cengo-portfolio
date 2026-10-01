// W8-ANL-locale-segmentation handoff, applied in W10 (src/pages/about is in
// this package's scope): the link that closes the About page sends
// cta_clicked with cta_id about_contact, EN and TR.
import { fireEvent, render, screen } from "@testing-library/react";
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
vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const { About } = await import("../../../src/pages/about");
const { track } = await import("../../../src/lib/analytics/index.js");
const { CTA, sanitizeProps } =
  await import("../../../src/lib/analytics/events.js");
const aboutStyles = (await import("../../../src/pages/about/about.module.css"))
  .default;

beforeEach(() => {
  track.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

describe.each([
  ["/about", "/contact"],
  ["/tr/about", "/tr/contact"],
])("%s", (path, contactHref) => {
  it("the closing link goes to the contact page and reports about_contact once per click", () => {
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <About />
      </MemoryRouter>,
    );
    const link = container.querySelector(`a.${aboutStyles.ctaButton}`);
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe(contactHref);
    expect(screen.getAllByRole("link", { name: link.textContent })).toContain(
      link,
    );
    expect(track).not.toHaveBeenCalled();

    fireEvent.click(link);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("cta_clicked", {
      cta_id: CTA.ABOUT_CONTACT,
    });
    // the catalogue accepts exactly this payload
    expect(sanitizeProps("cta_clicked", { cta_id: CTA.ABOUT_CONTACT })).toEqual(
      { cta_id: "about_contact" },
    );
  });
});
