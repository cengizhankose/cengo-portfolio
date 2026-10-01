// Handoff of W8-ANL-locale-segmentation, applied with the contact page change
// of W9-SEC-privacy-notice: the LinkedIn and booking links of /contact report
// outbound_link_clicked with location "contact_page" (not "other").
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@emailjs/browser", () => ({ default: { send: vi.fn() } }));

import { LOCATIONS } from "../../../src/lib/analytics/events.js";
import { outboundProps } from "../../../src/lib/analytics/outbound.js";
import { ContactUs } from "../../../src/pages/contact";

describe("/contact outbound links", () => {
  it("the LinkedIn link is an outbound click located at contact_page", () => {
    render(
      <MemoryRouter initialEntries={["/contact"]}>
        <ContactUs />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: /LinkedIn/ });
    expect(
      outboundProps(link, {
        baseUrl: "https://www.cengizhankose.com/contact",
        currentHost: "www.cengizhankose.com",
      }),
    ).toEqual({ network: "linkedin", location: LOCATIONS.CONTACT_PAGE });
  });
});
