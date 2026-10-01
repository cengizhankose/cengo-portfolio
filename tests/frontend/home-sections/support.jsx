// Shared helpers for the home-sections tests (MKT-03, SEO-17, MKT-13, ANL-12).
// The route table is mocked as after SEO-11 Adım B (LIVE.static and LIVE.post
// = ['en', 'tr']) so /tr pages render; analytics is mocked, so a test reads
// exactly what a click would send.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { vi } from "vitest";

export const post = (id, lang, extra = {}) => ({
  id,
  slug: `post-${id}`,
  title: `Post ${id} title`,
  excerpt: `Excerpt of post ${id}`,
  lang,
  translationKey: null,
  coverImage: null,
  publishedAt: `2026-0${(id % 9) + 1}-10T09:00:00.000Z`,
  createdAt: `2026-0${(id % 9) + 1}-09T09:00:00.000Z`,
  ...extra,
});

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// A fetch that answers every blog list with `lists[url]` (default: []), or
// with a failure.
export function stubFetch(handler) {
  const fetchMock = vi.fn(async (input) => handler(String(input)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// <Home /> (or any page) in a fresh swr cache; `fallback` is the swr data the
// server writes into the page (src/lib/swrFallback.js).
export function renderPage(element, path, { fallback = {} } = {}) {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), fallback, dedupingInterval: 0 }}
    >
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </SWRConfig>,
  );
}

export const sectionIds = () =>
  [...document.querySelectorAll("section[id]")].map((section) => section.id);
