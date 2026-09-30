// FE-16 / SEO-02 client half: unknown paths render the NotFound page (not
// Home) inside the real route table (src/app/routes.jsx), with the
// "Page not found | Cengizhan Köse" title and robots noindex from
// src/seo/pages.js. Languages that are not live yet (/tr/*) behave the same.
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppRoutes from "../../../src/app/routes";
import { NotFound } from "../../../src/pages/notfound";
import {
  NOT_FOUND_COPY,
  notFoundCopy,
} from "../../../src/pages/notfound/copy.js";
import { pages } from "../../../src/seo/pages.js";

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

const robots = () =>
  document.head.querySelector('meta[name="robots"]')?.getAttribute("content");
const main = () => screen.getByRole("main");

beforeEach(() => {
  document.head.innerHTML =
    "<title>Cengizhan Köse | Senior Fullstack Engineer</title>";
  document.documentElement.lang = "en";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200 })),
  );
});

describe("unknown paths (FE-16 criteria 1-3)", () => {
  it("/nope: 'Page not found' with links to / and /blog, no Home content", async () => {
    renderAt("/nope");

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Page not found",
    });
    expect(heading).toBeInTheDocument();
    const page = within(main());
    expect(page.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(page.getByRole("link", { name: "Blog" })).toHaveAttribute(
      "href",
      "/blog",
    );
    // Home's hero never renders on an unknown path.
    expect(main()).not.toHaveTextContent(/I’m Cengizhan|I'm Cengizhan/);
    // The only page content is the NotFound section (one h1, no Home hero).
    expect(main().querySelectorAll("h1")).toHaveLength(1);
    expect(main().querySelector(".not-found")).toBeInTheDocument();
  });

  it("sets the document title and robots noindex", async () => {
    renderAt("/bu-sayfa-yok");
    await waitFor(() =>
      expect(document.title).toBe("Page not found | Cengizhan Köse"),
    );
    expect(robots()).toBe("noindex");
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe(pages.notFound.en.title);
  });

  it("a TR path is EN NotFound with EN links while the TR pages are closed", async () => {
    renderAt("/tr/yok");
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
    expect(within(main()).getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    await waitFor(() => expect(robots()).toBe("noindex"));
    expect(document.documentElement.lang).toBe("en");
  });

  it.each(["/tr", "/tr/about", "/tr/blog"])(
    "%s (closed language) renders NotFound",
    async (path) => {
      renderAt(path);
      await screen.findByRole("heading", { level: 1, name: "Page not found" });
      await waitFor(() => expect(robots()).toBe("noindex"));
    },
  );

  it("a case variant (/About) is NotFound on the client, like the route table", async () => {
    renderAt("/About");
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
  });

  it("known pages still render (no NotFound on /about)", async () => {
    renderAt("/about");
    await waitFor(() => expect(document.title).toBe(pages["/about"].en.title));
    expect(
      screen.queryByRole("heading", { name: "Page not found" }),
    ).not.toBeInTheDocument();
    expect(robots()).toBeUndefined();
  });
});

describe("NotFound copy", () => {
  it("has the same keys in both languages and matches the meta titles", () => {
    const shape = (copy) =>
      JSON.stringify(copy, (key, value) =>
        typeof value === "string" ? "" : value,
      );
    expect(shape(NOT_FOUND_COPY.tr)).toBe(shape(NOT_FOUND_COPY.en));
    for (const locale of ["en", "tr"]) {
      expect(`${notFoundCopy(locale).title} | Cengizhan Köse`).toBe(
        pages.notFound[locale].title,
      );
      expect(`${notFoundCopy(locale, "post").title} | Cengizhan Köse`).toBe(
        pages.postNotFound[locale].title,
      );
    }
    expect(notFoundCopy("de").title).toBe("Page not found");
  });

  it("variant='post' on a TR post URL: TR heading, links to the live blog", async () => {
    render(
      <MemoryRouter initialEntries={["/tr/blog/bu-yazi-yok"]}>
        <NotFound variant="post" />
      </MemoryRouter>,
    );
    screen.getByRole("heading", { level: 1, name: "Yazı bulunamadı" });
    expect(screen.getByRole("link", { name: "Bloga dön" })).toHaveAttribute(
      "href",
      "/blog",
    );
    await waitFor(() =>
      expect(document.title).toBe("Yazı bulunamadı | Cengizhan Köse"),
    );
    expect(robots()).toBe("noindex");
    expect(document.documentElement.lang).toBe("tr");
  });
});
