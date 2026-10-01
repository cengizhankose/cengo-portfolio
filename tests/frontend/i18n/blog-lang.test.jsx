// Blog and languages (FE-14 criterion 4, DSG-19 criteria 1-2 and 6, SEO-21):
// language groups on /blog, the language badge, links to each post's own
// language path, <article lang>, dates in the page's language with an ISO
// <time dateTime>, and hyphenation only inside the post body.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BlogHome, { groupPosts } from "../../../src/pages/blog/BlogHome";
import BlogPost from "../../../src/pages/blog/BlogPost";
import { GLOBAL_CSS } from "../css-arch/global-css.js";

const EN_DATE =
  /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}$/;
const TR_DATE =
  /^\d{1,2} (Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık) \d{4}$/;

const POST_A = {
  id: 1,
  slug: "a",
  title: "Post A",
  excerpt: "An EN post.",
  lang: "en",
  translationKey: null,
  createdAt: "2026-09-29T09:00:00.000Z",
};
const POST_B = {
  id: 2,
  slug: "b",
  title: "Yazı B",
  excerpt: "Çevirisi olmayan TR yazı.",
  lang: "tr",
  translationKey: null,
  createdAt: "2026-09-29T09:00:00.000Z",
};
const PAIR_EN = { ...POST_A, id: 3, slug: "hello", translationKey: "k1" };
const PAIR_TR = {
  ...POST_B,
  id: 4,
  slug: "merhaba",
  title: "Merhaba",
  translationKey: "k1",
};

function stubFetch(body, status = 200) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/blog" element={<BlogHome />} />
        <Route path="/tr/blog" element={<BlogHome />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/tr/blog/:slug" element={<BlogPost />} />
      </Routes>
    </MemoryRouter>,
  );
}

const times = () => [...document.querySelectorAll("time")];

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
});

describe("/blog language groups (FE-14 step 11, DSG-19 step 4)", () => {
  it("lists the page's language first and the other language in its own section", async () => {
    stubFetch([POST_B, POST_A]);
    renderAt("/blog");
    await screen.findByRole("link", { name: "Post A" });

    const grids = document.querySelectorAll(".blog-grid");
    expect(grids).toHaveLength(2);
    // First list: only the EN post.
    expect(
      within(grids[0])
        .getAllByRole("article")
        .map((a) => a.querySelector("a").textContent),
    ).toEqual(["Post A"]);

    // Other-language section with its heading.
    const section = screen.getByRole("region", { name: "Posts in Turkish" });
    expect(section).toHaveAttribute("aria-labelledby", "other-lang");
    expect(section.querySelector("h2#other-lang")).not.toBeNull();
    const card = within(section).getByRole("article");
    expect(card).toHaveAttribute("lang", "tr");
    expect(card.querySelector(".lang-badge").textContent).toBe("TR");
    expect(card.querySelector(".lang-badge")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(card.querySelector(".visually-hidden").textContent.trim()).toBe(
      "in Turkish",
    );
    expect(within(card).getByRole("link", { name: "Yazı B" })).toHaveAttribute(
      "href",
      "/tr/blog/b",
    );
    // Card headings stay under the section heading.
    expect(card.querySelector("h3.blog-post-title")).not.toBeNull();
    expect(screen.queryByText(/No posts yet/)).toBeNull();
  });

  it("only other-language posts: no 'No posts yet', the section is shown", async () => {
    stubFetch([POST_B]);
    renderAt("/blog");
    await screen.findByRole("link", { name: "Yazı B" });
    expect(screen.queryByText(/No posts yet/)).toBeNull();
    expect(
      screen.getByRole("region", { name: "Posts in Turkish" }),
    ).toBeInTheDocument();
  });

  it("no posts at all: the empty state, no section", async () => {
    stubFetch([]);
    renderAt("/blog");
    expect(await screen.findByText(/No posts yet/)).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("a translated post is not listed again in the other-language group", () => {
    expect(groupPosts([PAIR_EN, PAIR_TR, POST_B], "en")).toEqual({
      own: [PAIR_EN],
      other: [POST_B],
    });
    expect(groupPosts([PAIR_EN, PAIR_TR, POST_A], "tr")).toEqual({
      own: [PAIR_TR],
      other: [POST_A],
    });
    // A row without lang counts as EN (API before the migration).
    const legacy = { id: 9, slug: "old", title: "Old" };
    expect(groupPosts([legacy], "en").own).toEqual([legacy]);
  });

  it("dates are in the page's language with an ISO dateTime (SEO-21, DSG-19 criterion 2)", async () => {
    stubFetch([POST_A, POST_B]);
    renderAt("/blog");
    await screen.findByRole("link", { name: "Post A" });

    expect(times()).toHaveLength(2);
    for (const time of times()) {
      expect(time.textContent.trim()).toMatch(EN_DATE);
      expect(time.getAttribute("dateTime")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Number.isNaN(Date.parse(time.dateTime))).toBe(false);
    }
    // The EN date inside the TR card declares its own language.
    const trCard = screen
      .getByRole("link", { name: "Yazı B" })
      .closest("article");
    expect(trCard.querySelector("time")).toHaveAttribute("lang", "en");
    expect(screen.getAllByText("September 29, 2026")).toHaveLength(2);
  });

  it("asks the relative API path, one request per language group (FE-33, BE-09, T-12)", async () => {
    const fetchMock = stubFetch([]);
    renderAt("/blog");
    await screen.findByText(/No posts yet/);
    // W5 (FE-12, T-04): swr keys are the API paths with ?lang= (BE-07).
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/posts?lang=en",
      "/api/posts?lang=tr&missingIn=en",
    ]);
  });
});

describe("a TR post page (FE-14 criterion 4, DSG-19 criteria 1-2, SEO-21)", () => {
  const TR_POST = {
    ...POST_B,
    content: "Uzun bir paragraf.",
    translations: [],
    updatedAt: "2026-09-30T10:00:00.000Z",
  };

  it("article lang, TR dates with ISO dateTime, labels in the post's language", async () => {
    stubFetch(TR_POST);
    renderAt("/tr/blog/b");
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Yazı B",
    });

    const article = heading.closest("article");
    expect(article).toHaveAttribute("lang", "tr");
    expect(document.querySelector("article").lang).toBe("tr");
    expect(document.querySelector(".blog-content").closest("[lang]").lang).toBe(
      "tr",
    );
    await waitFor(() => expect(document.documentElement.lang).toBe("tr"));

    expect(times()).toHaveLength(2);
    for (const time of times()) {
      expect(time.textContent.trim()).toMatch(TR_DATE);
      expect(time.getAttribute("dateTime")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(times()[0].textContent).toBe("29 Eylül 2026");
    expect(times()[1].textContent).toBe("30 Eylül 2026");
    const meta = article.querySelector(".blog-post-date").textContent;
    expect(meta).toMatch(
      /^Yayınlandı: 29 Eylül 2026 · Güncellendi: 30 Eylül 2026$/,
    );
  });

  it("the back link sits above the article, in the interface language, to the live blog", async () => {
    stubFetch(TR_POST);
    renderAt("/tr/blog/b");
    await screen.findByRole("heading", { level: 1, name: "Yazı B" });

    const back = screen.getByRole("link", { name: "Back to Blog" });
    expect(back).toHaveAttribute("href", "/blog");
    expect(back.closest("article")).toBeNull();
    expect(back.closest("[lang]")).toHaveAttribute("lang", "en");
    expect(back.querySelector('[aria-hidden="true"]').textContent).toBe("←");
  });

  it("an EN post keeps English dates and labels", async () => {
    stubFetch({ ...POST_A, content: "Body", translations: [] });
    renderAt("/blog/a");
    await screen.findByRole("heading", { level: 1, name: "Post A" });
    expect(times()).toHaveLength(1);
    expect(times()[0].textContent).toBe("September 29, 2026");
    expect(document.querySelector(".blog-post-date").textContent).toBe(
      "Published: September 29, 2026",
    );
  });

  it("no <time> and no 'Invalid date' when the post has no valid date", async () => {
    stubFetch({ ...POST_A, createdAt: "not a date", content: "Body" });
    renderAt("/blog/a");
    await screen.findByRole("heading", { level: 1, name: "Post A" });
    expect(times()).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/Invalid date/);
  });

  it("asks the relative API path with the slug encoded", async () => {
    const fetchMock = stubFetch({ ...POST_A, content: "Body" });
    renderAt("/blog/a");
    await screen.findByRole("heading", { level: 1, name: "Post A" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/posts/a");
  });
});

describe("hyphenation (FE-14 step 10, DSG-19 step 3; checked on the CSS source)", () => {
  const css = GLOBAL_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (selector) => {
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (match[1].trim() === selector) return match[2];
    }
    return null;
  };

  it("paragraphs are not hyphenated automatically outside the post body", () => {
    expect(rule("p")).toMatch(/(^|;)\s*hyphens:\s*manual/);
    expect(css).not.toMatch(/(^|\n)p\s*\{[^}]*\bhyphens:\s*auto/);
  });

  it("the post body hyphenates by its own language", () => {
    const body = rule(".markdown-body :is(p, li, blockquote)");
    expect(body).toMatch(/(^|;)\s*hyphens:\s*auto/);
    expect(body).toMatch(/hyphenate-limit-chars:\s*6 3 3/);
  });
});
