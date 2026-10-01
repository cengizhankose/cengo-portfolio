// MKT-12 step 4: the booking row appears once the owner sets a booking URL
// (src/pages/contact/config.js) and opens in a new tab.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/pages/contact/config.js", () => ({
  BOOKING_URL: "https://cal.com/cengizhankose/intro",
  bookingHref: () => "https://cal.com/cengizhankose/intro",
}));
vi.mock("@emailjs/browser", () => ({ default: { send: vi.fn() } }));
vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const { ContactUs } = await import("../../../src/pages/contact/index.jsx");

describe("booking link", () => {
  it("is the second way in: new tab, noopener, visible label, hidden note", () => {
    render(
      <MemoryRouter initialEntries={["/contact"]}>
        <ContactUs />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", {
      name: /Book a 20-minute intro call/,
    });
    expect(link).toHaveAttribute("href", "https://cal.com/cengizhankose/intro");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/\bnoopener\b/);
    expect(link.querySelector(".visually-hidden").textContent.trim()).toBe(
      "(opens in a new tab)",
    );
    const links = [...document.querySelectorAll("address a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toEqual([
      "mailto:me@cengizhankose.com",
      "https://cal.com/cengizhankose/intro",
      "https://www.linkedin.com/in/cengizhankose",
    ]);
  });
});
