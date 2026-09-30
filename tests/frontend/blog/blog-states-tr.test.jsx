// DSG-20 criteria 1, 4 and 6 in Turkish: with the TR pages live (SEO-11
// Adım B, LIVE = ALL_LIVE), the same states speak Turkish and link to the TR
// paths. The route table is mocked the way
// tests/frontend/routing/not-found-tr-live.test.jsx does it, so every module
// that imports it (pages.js, i18n, swr keys) sees the same table.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
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

const { POST_EN, POST_TR, calls, json, renderBlog } =
  await import("./support.jsx");

async function violations() {
  const results = await axe.run(document, {
    rules: {
      "color-contrast": { enabled: false },
      "target-size": { enabled: false },
    },
    resultTypes: ["violations"],
  });
  return results.violations.map(({ id }) => id);
}

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
});

describe("TR states (DSG-20 criteria 1, 4, 6)", () => {
  it("/tr/blog/olmayan-yazi-xyz: 'Yazı bulunamadı', links /tr/blog and /tr", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "Not found", code: "NOT_FOUND" }, 404)),
    );
    renderBlog("/tr/blog/olmayan-yazi-xyz");
    await screen.findByRole("heading", { level: 1, name: "Yazı bulunamadı" });

    expect(
      document.querySelectorAll(
        '.status-state a[href="/tr/blog"], .status-state a[href="/tr"]',
      ),
    ).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Bloga dön" })).toHaveAttribute(
      "href",
      "/tr/blog",
    );
    await waitFor(() =>
      expect(document.title).toBe("Yazı bulunamadı | Cengizhan Köse"),
    );
    expect(
      document.head
        .querySelector('meta[name="robots"]')
        .getAttribute("content"),
    ).toMatch(/noindex/);
    expect(document.documentElement.lang).toBe("tr");
    expect(await violations()).toEqual([]);
  });

  it("/tr/blog with no posts: 'Henüz yazı yok', links to /tr and /tr/contact", async () => {
    const fetchMock = vi.fn(async () => json([]));
    vi.stubGlobal("fetch", fetchMock);
    renderBlog("/tr/blog");

    await screen.findByRole("heading", { level: 2, name: "Henüz yazı yok" });
    const state = document.querySelector(".status-state");
    expect(
      within(state)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Ana sayfa", "/tr"],
      ["İletişim", "/tr/contact"],
    ]);
    expect(calls(fetchMock)).toEqual([
      "/api/posts?lang=tr",
      "/api/posts?lang=en&missingIn=tr",
    ]);
    await waitFor(() => expect(document.documentElement.lang).toBe("tr"));
    expect(await violations()).toEqual([]);
  });

  it("/tr/blog when the API fails: TR error and 'Tekrar dene'", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => json({ error: "x" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    renderBlog("/tr/blog");

    const retry = await screen.findByRole("button", { name: "Tekrar dene" });
    expect(
      screen.getByRole("heading", { level: 2, name: "Yazılar yüklenemedi" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sunucu şu anda yanıt veremedi/)).toBeVisible();
    expect(screen.queryByText(/Henüz yazı yok/)).toBeNull();
    expect(await violations()).toEqual([]);

    fetchMock.mockImplementation(async (url) =>
      url === "/api/posts?lang=tr" ? json([POST_TR]) : json([POST_EN]),
    );
    await user.click(retry);
    await screen.findByRole("link", { name: "Merhaba dünya" });
    // The EN post has no TR translation: it is listed in the second group.
    expect(
      screen.getByRole("region", { name: "İngilizce yazılar" }),
    ).toBeInTheDocument();
  });

  it("a TR post that fails: 'Bu yazı yüklenemedi', back to /tr/blog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    renderBlog("/tr/blog/merhaba-dunya");
    await screen.findByRole("heading", {
      level: 1,
      name: "Bu yazı yüklenemedi",
    });
    expect(screen.getByRole("link", { name: "Bloga dön" })).toHaveAttribute(
      "href",
      "/tr/blog",
    );
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeVisible();
    expect(
      screen.getByText(/Tarayıcın sunucuya ulaşamadı/),
    ).toBeInTheDocument();
    expect(await violations()).toEqual([]);
  });
});
