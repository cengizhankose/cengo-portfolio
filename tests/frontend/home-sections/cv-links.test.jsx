// ANL-12, rendered: the CV links. The page language's file first, the other
// language second, one cv_downloaded per click and never an outbound click,
// and nothing at all while the owner has not supplied the files.
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

const { CvLinks, orderedCvLinks } =
  await import("../../../src/components/cvlink/index.jsx");
const { About } = await import("../../../src/pages/about/index.jsx");
const { ContactUs } = await import("../../../src/pages/contact/index.jsx");
const { outboundProps } =
  await import("../../../src/lib/analytics/outbound.js");
const { sanitizeProps } = await import("../../../src/lib/analytics/events.js");
const { track } = await import("../../../src/lib/analytics/index.js");
const { translate } = await import("../../../src/i18n/translate.js");

const LINKS = [
  { language: "en", href: "/cv/cengizhan-kose-cv-en.pdf", available: true },
  { language: "tr", href: "/cv/cengizhan-kose-cv-tr.pdf", available: true },
];

const renderLinks = (path, props) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <CvLinks {...props} />
    </MemoryRouter>,
  );

beforeEach(() => {
  track.mockReset();
  document.head.innerHTML = "<title>x</title>";
  Element.prototype.scrollIntoView = vi.fn();
  stubFetch(() => json([]));
});

describe("orderedCvLinks", () => {
  it("puts the page language first and drops what is not available", () => {
    expect(orderedCvLinks(LINKS, "tr").map((l) => l.language)).toEqual([
      "tr",
      "en",
    ]);
    expect(orderedCvLinks(LINKS, "en").map((l) => l.language)).toEqual([
      "en",
      "tr",
    ]);
    expect(
      orderedCvLinks([LINKS[0], { ...LINKS[1], available: false }], "tr").map(
        (l) => l.language,
      ),
    ).toEqual(["en"]);
    expect(orderedCvLinks([], "en")).toEqual([]);
    expect(orderedCvLinks(undefined, "en")).toEqual([]);
  });
});

describe.each([
  ["/about", "en", ["en", "tr"]],
  ["/tr/about", "tr", ["tr", "en"]],
  ["/contact", "en", ["en", "tr"]],
  ["/tr/contact", "tr", ["tr", "en"]],
])("%s", (path, locale, order) => {
  const t = (key, vars) => translate(locale, key, vars);

  it("lists the page language's CV first, the other language's second", () => {
    const { container } = renderLinks(path, { links: LINKS });

    const anchors = [...container.querySelectorAll("a")];
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual(
      order.map((language) => `/cv/cengizhan-kose-cv-${language}.pdf`),
    );
    expect(anchors.map((a) => a.getAttribute("hreflang"))).toEqual(order);
    expect(anchors[0].textContent).toContain(t("cv.download"));
    expect(anchors[1].textContent).toContain(
      t("cv.other", { language: t(`cv.language.${order[1]}`) }),
    );
  });

  it("opens the PDF in a new tab, marked as a PDF and as a CV for analytics", () => {
    const { container } = renderLinks(path, { links: LINKS });

    for (const anchor of container.querySelectorAll("a")) {
      expect(anchor.getAttribute("type")).toBe("application/pdf");
      expect(anchor.getAttribute("target")).toBe("_blank");
      expect(anchor.getAttribute("rel")).toContain("noopener");
      expect(anchor.getAttribute("data-track")).toBe("cv");
      // The new tab is announced in the page's language.
      expect(anchor.textContent).toContain(t("social.newTab"));
    }
  });

  it("one click is one cv_downloaded with the file's language and the placement, and no outbound click", () => {
    const { container } = renderLinks(path, {
      links: LINKS,
      location: "about",
    });
    const anchors = container.querySelectorAll("a");

    fireEvent.click(anchors[1]);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("cv_downloaded", {
      cv_language: order[1],
      location: "about",
    });
    // The catalogue keeps exactly these two properties.
    expect(
      sanitizeProps("cv_downloaded", {
        cv_language: order[1],
        location: "about",
      }),
    ).toEqual({ cv_language: order[1], location: "about" });
    // The delegated outbound listener skips CV links.
    expect(
      outboundProps(anchors[1], {
        baseUrl: "https://elsewhere.example/",
        currentHost: "www.cengizhankose.com",
      }),
    ).toBeNull();
  });
});

describe("no files yet (the default until the owner supplies the PDFs)", () => {
  it("renders nothing", () => {
    const { container } = renderLinks("/about", {});
    expect(container.innerHTML).toBe("");
    const unavailable = renderLinks("/about", {
      links: LINKS.map((l) => ({ ...l, available: false })),
    });
    expect(unavailable.container.innerHTML).toBe("");
  });

  it.each(["/about", "/tr/about"])("%s has no CV link", (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <About />
      </MemoryRouter>,
    );
    expect(document.querySelectorAll('a[href$=".pdf"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[data-track="cv"]')).toHaveLength(0);
  });

  it.each(["/contact", "/tr/contact"])("%s has no CV link", (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <ContactUs />
      </MemoryRouter>,
    );
    expect(document.querySelectorAll('a[href$=".pdf"]')).toHaveLength(0);
  });
});
