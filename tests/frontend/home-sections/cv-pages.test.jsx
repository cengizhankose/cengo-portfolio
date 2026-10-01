// ANL-12 acceptance criteria 2 and 3 on the real pages: with the two CV files
// on (the content flags mocked as they will read once the owner supplies the
// PDFs), /about, /contact, /tr/about and /tr/contact each have the CV in their
// own language first and the other one second, and a click on the Turkish CV
// of /tr/about is one cv_downloaded { cv_language: 'tr', location: 'about' }.
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubFetch, json } from "./support.jsx";

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
const ON = {
  links: [
    { language: "en", href: "/cv/cengizhan-kose-cv-en.pdf", available: true },
    { language: "tr", href: "/cv/cengizhan-kose-cv-tr.pdf", available: true },
  ],
};
vi.mock("../../../src/content/en/cv.js", () => ({ default: ON }));
vi.mock("../../../src/content/tr/cv.js", () => ({ default: ON }));

const { About } = await import("../../../src/pages/about/index.jsx");
const { ContactUs } = await import("../../../src/pages/contact/index.jsx");
const { track } = await import("../../../src/lib/analytics/index.js");

const cvAnchors = () => [...document.querySelectorAll('a[href$=".pdf"]')];

beforeEach(() => {
  track.mockReset();
  document.head.innerHTML = "<title>x</title>";
  Element.prototype.scrollIntoView = vi.fn();
  stubFetch(() => json([]));
});

describe.each([
  ["/about", "en", About, "about"],
  ["/tr/about", "tr", About, "about"],
  ["/contact", "en", ContactUs, "contact"],
  ["/tr/contact", "tr", ContactUs, "contact"],
])("%s", (path, locale, Page, location) => {
  const other = locale === "en" ? "tr" : "en";

  it("has the page language's CV first and the other language's CV second", () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Page />
      </MemoryRouter>,
    );

    expect(cvAnchors().map((a) => a.getAttribute("href"))).toEqual([
      `/cv/cengizhan-kose-cv-${locale}.pdf`,
      `/cv/cengizhan-kose-cv-${other}.pdf`,
    ]);
  });

  it(`sends cv_downloaded with location '${location}' for the Turkish and English file`, () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Page />
      </MemoryRouter>,
    );

    for (const language of ["tr", "en"]) {
      track.mockClear();
      fireEvent.click(
        document.querySelector(
          `a[href="/cv/cengizhan-kose-cv-${language}.pdf"]`,
        ),
      );
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith("cv_downloaded", {
        cv_language: language,
        location,
      });
    }
  });
});

describe("placement", () => {
  it("About: the CV links sit in the closing section, after the contact button", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <About />
      </MemoryRouter>,
    );
    const last = [...document.querySelectorAll("section")].at(-1);
    const anchors = [...last.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(anchors).toEqual([
      "/contact",
      "/cv/cengizhan-kose-cv-en.pdf",
      "/cv/cengizhan-kose-cv-tr.pdf",
    ]);
  });

  it("Contact: the CV links sit in the 'Reach me directly' column", () => {
    render(
      <MemoryRouter initialEntries={["/contact"]}>
        <ContactUs />
      </MemoryRouter>,
    );
    const column = document.querySelector("address").parentElement;
    expect(column.querySelectorAll('a[href$=".pdf"]')).toHaveLength(2);
  });
});
