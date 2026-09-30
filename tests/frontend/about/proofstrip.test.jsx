// The ProofStrip component (MKT-04, src/components/proofstrip): variants,
// references that appear only when two complete ones exist, links only where
// a record has public evidence. The home page sections of W11 reuse it.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/content/index.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getContent: vi.fn(actual.getContent) };
});

const { getContent } = await import("../../../src/content/index.js");
const {
  AwardLine,
  DotLine,
  MIN_TESTIMONIALS,
  ProofStrip,
  isCompleteTestimonial,
} = await import("../../../src/components/proofstrip");

const real = getContent.getMockImplementation();

const reference = (n, extra = {}) => ({
  id: `ref-${n}`,
  quote: `Quote number ${n} with a concrete result.`,
  name: `Name ${n}`,
  role: `Role ${n}`,
  company: `Company ${n}`,
  ...extra,
});

// Gives the EN content these references, nothing else changed.
function withReferences(testimonials) {
  getContent.mockImplementation((locale) => {
    const content = real(locale);
    return { ...content, proof: { ...content.proof, testimonials } };
  });
}

const renderStrip = (props) =>
  render(
    <MemoryRouter initialEntries={["/about"]}>
      <ProofStrip {...props} />
    </MemoryRouter>,
  );

afterEach(() => getContent.mockImplementation(real));

describe("references (MKT-04 step 6)", () => {
  it("need two complete entries before the block is rendered", () => {
    expect(MIN_TESTIMONIALS).toBe(2);

    withReferences([]);
    const none = renderStrip();
    expect(none.container.querySelectorAll("figure")).toHaveLength(0);
    none.unmount();

    withReferences([reference(1)]);
    const one = renderStrip();
    expect(one.container.querySelectorAll("figure")).toHaveLength(0);
    expect(screen.queryByText("References")).toBeNull();
    one.unmount();

    // Two entries, but one is incomplete: still one short.
    withReferences([reference(1), reference(2, { company: "" })]);
    const partial = renderStrip();
    expect(partial.container.querySelectorAll("figure")).toHaveLength(0);
  });

  it("render as figures with quote, name, role and company", () => {
    withReferences([reference(1), reference(2), reference(3, { name: " " })]);
    const { container } = renderStrip();

    expect(
      screen.getByRole("heading", { level: 3, name: "References" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("figure blockquote")).toHaveLength(2);
    const first = container.querySelector("figure");
    expect(
      within(first).getByText("Quote number 1 with a concrete result."),
    ).toBeInTheDocument();
    expect(first.querySelector("figcaption").textContent).toBe(
      "Name 1Role 1 — Company 1",
    );
  });

  it("isCompleteTestimonial wants quote, name, role and company", () => {
    expect(isCompleteTestimonial(reference(1))).toBe(true);
    for (const field of ["quote", "name", "role", "company"]) {
      expect(isCompleteTestimonial(reference(1, { [field]: "" }))).toBe(false);
      expect(isCompleteTestimonial(reference(1, { [field]: undefined }))).toBe(
        false,
      );
    }
    expect(isCompleteTestimonial(null)).toBe(false);
  });
});

describe("variants", () => {
  it("defaults to the full strip; compact is the same content, tighter", () => {
    const full = renderStrip();
    expect(full.container.firstElementChild).toHaveClass(
      "proofstrip",
      "proofstrip--full",
    );
    const fullText = full.container.textContent;
    full.unmount();

    const compact = renderStrip({ variant: "compact" });
    expect(compact.container.firstElementChild).toHaveClass(
      "proofstrip--compact",
    );
    expect(compact.container.textContent).toBe(fullText);
    compact.unmount();

    const other = renderStrip({ variant: "huge" });
    expect(other.container.firstElementChild).toHaveClass("proofstrip--full");
  });

  it("labels its lists with its own h3s and leaves the section title to the page", () => {
    renderStrip();

    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Worked with", "Hackathon wins"]);
    for (const list of screen.getAllByRole("list")) {
      expect(list).toHaveAccessibleName();
    }
  });

  it("points the archive link at /about#awards in the page language", () => {
    renderStrip();
    expect(screen.getByRole("link", { name: /See all/ })).toHaveAttribute(
      "href",
      "/about#awards",
    );
  });
});

describe("AwardLine and DotLine", () => {
  it("links the whole line only when the record has a URL", () => {
    const linked = render(
      <AwardLine
        award={{
          event: "Event",
          year: 2026,
          place: "1st place",
          project: "P",
          url: "https://example.com/x",
        }}
      />,
    );
    expect(linked.container.textContent).toBe("Event · 2026 · 1st place · P");
    expect(linked.container.querySelector("a")).toHaveAttribute(
      "href",
      "https://example.com/x",
    );
    linked.unmount();

    const text = render(
      <AwardLine award={{ event: "Event", year: 2024, place: "2nd place" }} />,
    );
    expect(text.container.textContent).toBe("Event · 2024 · 2nd place");
    expect(text.container.querySelector("a")).toBeNull();
  });

  it("hides the separators from assistive technology", () => {
    const { container } = render(<DotLine parts={["a", 2024]} />);

    expect(container.textContent).toBe("a · 2024");
    expect(container.querySelector('[aria-hidden="true"]').textContent).toBe(
      " · ",
    );
  });
});
