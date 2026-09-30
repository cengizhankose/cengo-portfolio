// FE-16 criterion 3, second half: once the TR pages are live (SEO-11 Adım B,
// LIVE.static = ['en', 'tr']), /tr/yok renders "Sayfa bulunamadı" with a /tr
// link. The route table is mocked with every language open; everything that
// imports it (routes.jsx, pages.js, NotFound) sees the same table.
import { render, screen, waitFor, within } from "@testing-library/react";
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

const { default: AppRoutes } = await import("../../../src/app/routes");

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200 })),
  );
});

describe("with the TR pages live", () => {
  it("/tr/yok: 'Sayfa bulunamadı', links to /tr and /tr/blog, lang tr", async () => {
    render(
      <MemoryRouter initialEntries={["/tr/yok"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1, name: "Sayfa bulunamadı" });
    const page = within(screen.getByRole("main"));
    expect(page.getByRole("link", { name: "Ana sayfa" })).toHaveAttribute(
      "href",
      "/tr",
    );
    expect(page.getByRole("link", { name: "Blog" })).toHaveAttribute(
      "href",
      "/tr/blog",
    );
    await waitFor(() =>
      expect(document.title).toBe("Sayfa bulunamadı | Cengizhan Köse"),
    );
    expect(document.documentElement.lang).toBe("tr");
  });

  it("/nope stays EN", async () => {
    render(
      <MemoryRouter initialEntries={["/nope"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
  });
});
