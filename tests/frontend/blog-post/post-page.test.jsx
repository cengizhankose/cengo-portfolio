// The blog post page after W8-SEO-blog-author-rss: byline and author box
// (SEO-16, MKT-17), the end-of-post block and its CTA event (MKT-07), the AI
// note once, the cover and date markup (FE-34, DSG-29), the skeleton
// (PERF-16) and the way back from an unknown slug (FE-34). Real BlogPost and
// swr; the data comes from swr's fallback, analytics is a stub.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  trackPageview: vi.fn(),
  setPageContext: vi.fn(),
  initAnalytics: vi.fn(),
}));
vi.mock("../../../src/lib/analytics/index.js", () => analytics);

const { renderBlog, testSWRValue, json, deferred } =
  await import("../blog/support.jsx");

const TR_POST = Object.freeze({
  id: 2,
  slug: "merhaba-dunya",
  title: "Merhaba dünya",
  excerpt: "Bir TR yazı.",
  content: "TR gövde\n\n## Bölüm\n\nMetin.",
  lang: "tr",
  translationKey: null,
  translations: [],
  coverImage: null,
  createdAt: "2026-09-30T10:00:00.000Z",
  publishedAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T10:00:00.000Z",
});
const EN_POST = Object.freeze({
  ...TR_POST,
  id: 1,
  slug: "hello-world",
  title: "Hello world",
  content: "EN body",
  lang: "en",
});

const withPost = (post) =>
  testSWRValue({ fallback: { [`/api/posts/${post.slug}`]: post } });

beforeEach(() => {
  analytics.track.mockClear();
});

describe("byline (SEO-16 criterion 2, MKT-17 criterion 2)", () => {
  it("TR post: right after the h1, 'Yazar:' + the About link with rel=author + the AI co-author", async () => {
    const { container } = renderBlog("/tr/blog/merhaba-dunya", {
      swr: withPost(TR_POST),
    });
    const heading = await screen.findByRole("heading", { level: 1 });
    const byline = heading.nextElementSibling;
    expect(byline).toHaveClass("blog-post-byline");
    expect(byline.textContent).toBe(
      "Yazar: Cengizhan Köse & Logan (AI asistanı)",
    );
    const link = within(byline).getByRole("link", { name: "Cengizhan Köse" });
    expect(link).toHaveAttribute("rel", "author");
    // The TR static pages are closed: the About link stays on the EN page.
    expect(link).toHaveAttribute("href", "/about");
    expect(container.querySelectorAll(".blog-post-byline")).toHaveLength(1);
  });

  it("EN post: 'By' + the same link + the English co-author", async () => {
    renderBlog("/blog/hello-world", { swr: withPost(EN_POST) });
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.nextElementSibling.textContent).toBe(
      "By Cengizhan Köse & Logan (AI assistant)",
    );
  });
});

describe("author box and post footer (SEO-16 criteria 1 and 3, MKT-07 criterion 4)", () => {
  async function renderTr() {
    const view = renderBlog("/tr/blog/merhaba-dunya", {
      swr: withPost(TR_POST),
    });
    await screen.findByRole("heading", { level: 1 });
    return view;
  }

  it("exactly one aside.author-box with the name, the role, a Turkish bio of 60+ characters, the About link and the profiles", async () => {
    const { container } = await renderTr();
    const boxes = container.querySelectorAll("aside.author-box");
    expect(boxes).toHaveLength(1);
    const box = boxes[0];
    expect(box).toHaveAttribute("aria-label", "Yazar hakkında");
    expect(within(box).getByText("Cengizhan Köse")).toBeInTheDocument();
    expect(
      within(box).getByText("Senior Fullstack Engineer"),
    ).toBeInTheDocument();
    const bio = box.querySelector(".author-box__bio").textContent;
    expect(bio.length).toBeGreaterThanOrEqual(60);
    expect(bio).toContain("Dört hackathon kazandı");
    expect(
      within(box).getByRole("link", { name: "Hikâyemi oku →" }),
    ).toHaveAttribute("href", "/about");
    const profiles = [...box.querySelectorAll('a[rel~="me"]')];
    expect(profiles.map((a) => a.getAttribute("href"))).toEqual([
      "https://www.linkedin.com/in/cengizhankose",
      "https://github.com/cengizhankose",
    ]);
    for (const a of profiles) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("the portrait has width, height, alt and lazy loading", async () => {
    const { container } = await renderTr();
    const photo = container.querySelector(".author-box__photo");
    expect(photo).toHaveAttribute("width", "96");
    expect(photo).toHaveAttribute("height", "96");
    expect(photo).toHaveAttribute("loading", "lazy");
    expect(photo.getAttribute("alt")).toBe("Cengizhan Köse portresi");
    expect(photo.getAttribute("src")).toBe("/blog/author-96.webp");
    expect(photo.getAttribute("srcset")).toContain("/blog/author-192.webp 2x");
  });

  it("the AI note appears exactly once, in the post's language", async () => {
    const { container } = await renderTr();
    const notes = container.querySelectorAll(".ai-disclosure");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe(
      "Bu yazı yapay zekâ asistanı Logan ile yazıldı; sistem tasarımı, içerik ve son düzenleme Cengizhan Köse’ye aittir.",
    );
  });

  it("the footer has one contact, one About and one RSS link (the TR feed), and follows in Turkish", async () => {
    const { container } = await renderTr();
    const footer = container.querySelector(".post-footer");
    expect(
      footer.querySelectorAll(
        'a[href$="/contact"], a[href$="/about"], a[href$="rss.xml"]',
      ),
    ).toHaveLength(3);
    expect(footer.querySelector('a[href$="rss.xml"]')).toHaveAttribute(
      "href",
      "/tr/rss.xml",
    );
    expect(footer.textContent).toContain("Yeni yazıları kaçırma");
    expect(
      within(footer).getByRole("link", { name: /LinkedIn’de takip et/ }),
    ).toHaveAttribute("href", "https://www.linkedin.com/in/cengizhankose");
    expect(footer).toHaveAttribute("data-analytics-location", "blog_footer");
    // Inside the article, after the text, and nothing is a newsletter form.
    expect(footer.closest("article")).not.toBeNull();
    expect(footer.querySelector("form, input")).toBeNull();
  });

  it("an EN post links to the EN feed and speaks English", async () => {
    const { container } = renderBlog("/blog/hello-world", {
      swr: withPost(EN_POST),
    });
    await screen.findByRole("heading", { level: 1 });
    const footer = container.querySelector(".post-footer");
    expect(footer.querySelector('a[href$="rss.xml"]')).toHaveAttribute(
      "href",
      "/rss.xml",
    );
    expect(footer.textContent).toContain("Get new posts:");
    expect(container.querySelector(".ai-disclosure").textContent).toContain(
      "written with the AI assistant Logan",
    );
  });

  it("the contact link sends cta_clicked blog_end_contact", async () => {
    const { container } = await renderTr();
    const cta = container.querySelector('.post-footer a[href$="/contact"]');
    expect(cta.textContent).toBe(
      "Benzer bir şey mi geliştiriyorsun? Konuşalım →",
    );
    fireEvent.click(cta);
    expect(analytics.track).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "blog_end_contact",
    });
  });
});

describe("cover and dates (FE-34, DSG-29)", () => {
  it("a cover is decoration with its size reserved; every <time> has an ISO dateTime", async () => {
    const edited = {
      ...TR_POST,
      coverImage: "/blog/merhaba-dunya.png",
      updatedAt: "2026-10-03T10:00:00.000Z",
    };
    const { container } = renderBlog("/tr/blog/merhaba-dunya", {
      swr: withPost(edited),
    });
    await screen.findByRole("heading", { level: 1 });
    const cover = container.querySelector(".blog-post-cover");
    expect(cover).toHaveAttribute("alt", "");
    expect(cover).toHaveAttribute("width", "1200");
    expect(cover).toHaveAttribute("height", "630");
    const times = [...container.querySelectorAll("time")];
    expect(times).toHaveLength(2);
    expect(
      times.every((node) => /^\d{4}-\d{2}-\d{2}/.test(node.dateTime)),
    ).toBe(true);
  });

  it("a post without a cover prints no image of its own besides the portrait", async () => {
    const { container } = renderBlog("/blog/hello-world", {
      swr: withPost(EN_POST),
    });
    await screen.findByRole("heading", { level: 1 });
    expect(container.querySelector(".blog-post-cover")).toBeNull();
    expect(
      [...container.querySelectorAll("img")].map((img) => img.className),
    ).toEqual(["author-box__photo"]);
  });
});

describe("skeleton (PERF-16)", () => {
  it("while the post loads: aria-busy container, hidden polite status text, no real content", async () => {
    const gate = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => gate.promise),
    );
    const { container } = renderBlog("/blog/hello-world");
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy).toHaveClass("blog-post-container");
    const status = within(busy).getByRole("status");
    expect(status).toHaveTextContent("Loading...");
    expect(status).toHaveClass("visually-hidden");
    expect(status).toHaveAttribute("aria-live", "polite");
    // A heading bar, a date bar and six paragraph bars, all decoration.
    const bars = busy.querySelectorAll(".blog-skeleton__bar");
    expect(bars.length).toBeGreaterThanOrEqual(10);
    expect(
      [...bars].every((bar) => bar.getAttribute("aria-hidden") === "true"),
    ).toBe(true);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    gate.resolve(json({ ...EN_POST }));
    await screen.findByRole("heading", { level: 1, name: "Hello world" });
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("an unknown slug (FE-34 criterion 3)", () => {
  it("offers the way back to the blog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "not found" }, 404)),
    );
    renderBlog("/blog/nope");
    const back = await screen.findByRole("link", { name: /back to blog/i });
    await waitFor(() => expect(back).toHaveAttribute("href", "/blog"));
    vi.unstubAllGlobals();
  });
});
