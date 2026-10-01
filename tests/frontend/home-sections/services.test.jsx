// MKT-13, rendered: four outcome-based services, on the home page and on the
// About page, in both languages. Every service has a proof link and a call to
// action to /contact?type=<id>, which the contact form preselects (MKT-10).
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPage, stubFetch, json } from "./support.jsx";

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

const { Home } = await import("../../../src/pages/home/index.jsx");
const { About } = await import("../../../src/pages/about/index.jsx");
const { ContactUs } = await import("../../../src/pages/contact/index.jsx");
const { getContent, CONTENT } = await import("../../../src/content/index.js");
const { PROJECT_TYPES, CTA, sanitizeProps } =
  await import("../../../src/lib/analytics/events.js");
const { track } = await import("../../../src/lib/analytics/index.js");

const IDS = ["mobile", "web", "ai", "lead"];

beforeEach(() => {
  track.mockReset();
  document.head.innerHTML = "<title>x</title>";
  Element.prototype.scrollIntoView = vi.fn();
  stubFetch(() => json([]));
});

describe("content (MKT-13 steps 1-3)", () => {
  it("has the four services with the same ids, order and link targets in both languages", () => {
    for (const lang of ["en", "tr"]) {
      const { services } = CONTENT[lang];
      expect(services.map((s) => s.id)).toEqual(IDS);
      for (const service of services) {
        expect(service.title, `${lang} ${service.id}`).toBeTruthy();
        expect(service.outcome, `${lang} ${service.id}`).toBeTruthy();
        expect(service.proof.label).toBeTruthy();
        expect(service.proof.to).toBeTruthy();
        expect(service.cta.label).toBeTruthy();
        expect(service.cta.to).toBe(`/contact?type=${service.id}`);
      }
    }
    CONTENT.en.services.forEach((service, index) => {
      expect(CONTENT.tr.services[index].proof.to).toBe(service.proof.to);
      expect(CONTENT.tr.services[index].cta.to).toBe(service.cta.to);
    });
  });

  it("uses ids the contact form and the analytics catalogue know", () => {
    for (const id of IDS) {
      expect(PROJECT_TYPES).toContain(id);
      expect(getContent("en").contact.projectTypes.map((t) => t.id)).toContain(
        id,
      );
      expect(
        sanitizeProps("cta_clicked", {
          cta_id: CTA.SERVICE_CONTACT,
          project_type: id,
        }),
      ).toEqual({ cta_id: "service_contact", project_type: id });
    }
  });

  it("points at evidence that exists: the portfolio cards, the timeline, the store listing", () => {
    const targets = Object.fromEntries(
      CONTENT.en.services.map((s) => [s.id, s.proof.to]),
    );
    expect(targets).toEqual({
      mobile: "https://apps.apple.com/tr/app/drivee-safecall/id6741858026",
      web: "/portfolio#project-farmin",
      ai: "/portfolio#project-salesgym",
      lead: "/about#timeline",
    });
  });
});

describe.each([
  ["/", "en", "/contact"],
  ["/tr", "tr", "/tr/contact"],
])("home %s services", (path, locale, contactBase) => {
  const { services } = getContent(locale);

  it("shows four services with an outcome, a proof link and a contact link each", () => {
    renderPage(<Home />, path);

    const section = document.getElementById("services");
    const items = section.querySelectorAll("ul > li");
    expect(items).toHaveLength(4);
    items.forEach((item, index) => {
      const service = services[index];
      expect(item.querySelector("h3").textContent).toBe(service.title);
      expect(item.textContent).toContain(service.outcome);
      const links = item.querySelectorAll("a");
      expect(links).toHaveLength(2);
      expect(links[0].textContent).toContain(service.proof.label);
      expect(links[1].textContent).toContain(service.cta.label);
      expect(links[1].getAttribute("href")).toBe(
        `${contactBase}?type=${service.id}`,
      );
    });
    expect(section.querySelectorAll('a[href*="/contact?type="]')).toHaveLength(
      4,
    );
  });

  it("opens the store listing in a new tab and keeps site links in the app, with the language prefix", () => {
    renderPage(<Home />, path);

    const proofLinks = [
      ...document.querySelectorAll("#services li p:nth-of-type(2) a"),
    ];
    const hrefs = proofLinks.map((a) => a.getAttribute("href"));
    const prefix = locale === "tr" ? "/tr" : "";
    expect(hrefs).toEqual([
      "https://apps.apple.com/tr/app/drivee-safecall/id6741858026",
      `${prefix}/portfolio#project-farmin`,
      `${prefix}/portfolio#project-salesgym`,
      `${prefix}/about#timeline`,
    ]);
    expect(proofLinks[0].getAttribute("target")).toBe("_blank");
    expect(proofLinks[0].getAttribute("rel")).toContain("noopener");
    expect(proofLinks[1].getAttribute("target")).toBeNull();
  });

  it("each contact link reports service_contact with its project type, once per click", () => {
    renderPage(<Home />, path);

    const links = [...document.querySelectorAll('a[href*="/contact?type="]')];
    expect(links).toHaveLength(4);
    links.forEach((link, index) => {
      track.mockClear();
      fireEvent.click(link);
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith("cta_clicked", {
        cta_id: "service_contact",
        project_type: IDS[index],
      });
    });
  });
});

describe.each([
  ["/about", "en", "/contact"],
  ["/tr/about", "tr", "/tr/contact"],
])("about %s services", (path, locale, contactBase) => {
  const { services } = getContent(locale);

  it("shows the same four services with outcome, proof and contact links", () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <About />
      </MemoryRouter>,
    );

    const items = document.querySelectorAll(".service_");
    expect(items).toHaveLength(4);
    items.forEach((item, index) => {
      const service = services[index];
      expect(item.querySelector("h3").textContent).toBe(service.title);
      expect(item.querySelector(".service_desc").textContent).toBe(
        service.outcome,
      );
      expect(
        item.querySelector('a[href*="/contact?type="]').getAttribute("href"),
      ).toBe(`${contactBase}?type=${service.id}`);
    });
    expect(document.querySelectorAll('a[href*="/contact?type="]')).toHaveLength(
      4,
    );
    // The closing CTA of the page stays a plain link to the contact page.
    expect(document.querySelector(`a[href="${contactBase}"]`)).not.toBeNull();
  });

  it("reports service_contact from the About page too", () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <About />
      </MemoryRouter>,
    );

    fireEvent.click(document.querySelector('a[href$="/contact?type=ai"]'));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "service_contact",
      project_type: "ai",
    });
  });
});

describe.each([
  ["/contact?type=", "en"],
  ["/tr/contact?type=", "tr"],
])("contact preselect %s", (base) => {
  it.each(IDS)("%s is selected from the service link", (id) => {
    render(
      <MemoryRouter initialEntries={[`${base}${id}`]}>
        <ContactUs />
      </MemoryRouter>,
    );
    const select = document.getElementById("project_type");
    expect(select.value).toBe(id);
  });
});
