// Helpers for the blog data-layer tests (W5-FE-blog-data-layer: FE-03,
// FE-12, ANL-15, DSG-20, PERF-14). Not a test file itself.
//
// Every render gets its own swr cache (FE-12 step 8):
//   <SWRConfig value={{ ...swrConfig, provider: () => new Map(),
//                       onErrorRetry: () => {} }}>
// and `fetch` is a vi.fn() the test controls.
import { act, render } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { SWRConfig } from "swr";
import BlogHome from "../../../src/pages/blog/BlogHome";
import BlogPost from "../../../src/pages/blog/BlogPost";
import { swrConfig } from "../../../src/lib/swr.js";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// A promise the test resolves or rejects by hand.
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// A fresh cache per call; `overrides` go on top (e.g. a real onErrorRetry,
// a fallback).
export function testSWRValue(overrides = {}) {
  return {
    ...swrConfig,
    provider: () => new Map(),
    onErrorRetry: () => {},
    ...overrides,
  };
}

// The request URLs fetch was called with, in order.
export const calls = (fetchMock) =>
  fetchMock.mock.calls.map(([url]) => String(url));

export const router = { navigate: null, location: null };
function Probe() {
  router.navigate = useNavigate();
  router.location = useLocation();
  return null;
}

// The blog routes in both languages, as src/app/pageRoutes.jsx maps them,
// without the page transition (routes.jsx has its own tests).
export function blogRoutes(extra = null) {
  return (
    <Routes>
      <Route path="/blog" element={<BlogHome />} />
      <Route path="/tr/blog" element={<BlogHome />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/tr/blog/:slug" element={<BlogPost />} />
      {extra}
    </Routes>
  );
}

export function renderBlog(
  path,
  { swr = testSWRValue(), extra = null, children = null } = {},
) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      {children}
      <main>{blogRoutes(extra)}</main>
    </MemoryRouter>
  );
  return render(swr ? <SWRConfig value={swr}>{tree}</SWRConfig> : tree);
}

export async function go(path) {
  await act(async () => router.navigate(path));
}

// routes.jsx swaps pages on animationend, which jsdom never fires (same
// helper as tests/frontend/smoke/app.test.jsx).
export async function finishPageTransition() {
  const transition = document.querySelector(".page-transition");
  if (!transition) return;
  await act(async () => {
    for (const type of ["animationend", "webkitAnimationEnd"]) {
      transition.dispatchEvent(new Event(type, { bubbles: true }));
    }
  });
}

export const POST_EN = Object.freeze({
  id: 1,
  slug: "hello-world",
  title: "Hello world",
  excerpt: "An EN post.",
  content: "EN body",
  lang: "en",
  translationKey: "hello",
  translations: [],
  createdAt: "2026-01-15T12:00:00.000Z",
});

export const POST_TR = Object.freeze({
  id: 2,
  slug: "merhaba-dunya",
  title: "Merhaba dünya",
  excerpt: "Bir TR yazı.",
  content: "TR gövde",
  lang: "tr",
  translationKey: null,
  translations: [],
  createdAt: "2026-01-16T12:00:00.000Z",
});

export const POST_B = Object.freeze({
  ...POST_EN,
  id: 3,
  slug: "second-post",
  title: "Second post",
  translationKey: null,
});
