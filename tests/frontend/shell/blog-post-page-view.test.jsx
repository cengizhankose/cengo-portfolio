// ANL-07 step 4 / ANL-05 step 7: a blog post's page_view waits for the post
// and reads it from the same swr entry BlogPost renders (BlogPost itself is
// not involved): title and language of the loaded post, one view per visit,
// not_found for an API 404, a blog_post view with the blog title for any other
// failure. Real BlogPost chunk and swr cache; the analytics API, `fetch` and
// the static pages are stubs.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, useNavigate } from "react-router-dom";
import { SWRConfig, useSWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { swrConfig } from "../../../src/lib/swr.js";

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  trackPageview: vi.fn(),
  setPageContext: vi.fn(),
  initAnalytics: vi.fn(),
}));

vi.mock("../../../src/lib/analytics/index.js", () => analytics);

function stubPage(name) {
  const Page = () => <h1>{name}</h1>;
  Page.displayName = name.replace(/\s+/g, "");
  return Page;
}
vi.mock("../../../src/pages/home", () => ({ Home: stubPage("Home page") }));
vi.mock("../../../src/pages/about", () => ({ About: stubPage("About page") }));
vi.mock("../../../src/pages/portfolio", () => ({
  Portfolio: stubPage("Portfolio page"),
}));
vi.mock("../../../src/pages/contact", () => ({
  ContactUs: stubPage("Contact page"),
}));

const { default: AppRoutes } = await import("../../../src/app/routes.jsx");

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const POST = Object.freeze({
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
const OTHER = Object.freeze({
  ...POST,
  id: 2,
  slug: "second-post",
  title: "Second post",
  seoTitle: "Second",
});
const TR_POST = Object.freeze({
  ...POST,
  id: 3,
  slug: "merhaba-dunya",
  title: "Merhaba dünya",
  lang: "tr",
  translationKey: "merhaba",
});

let navigate;
let mutateAll;
function Probe() {
  navigate = useNavigate();
  mutateAll = useSWRConfig().mutate;
  return (
    <nav aria-label="test links">
      <Link to="/blog/hello-world">first</Link>
      <Link to="/blog/second-post">second</Link>
      <Link to="/about">about</Link>
    </nav>
  );
}

// Answers by URL; a slug with no entry is a network failure.
function stubFetch(responses) {
  const fetchMock = vi.fn(async (url) => {
    const answer = responses[String(url)];
    if (answer === undefined) throw new TypeError("network down");
    return typeof answer === "function" ? answer() : answer;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const requests = (fetchMock, url) =>
  fetchMock.mock.calls.filter(([called]) => String(called) === url).length;

function renderAt(path, swr = {}) {
  const value = {
    ...swrConfig,
    provider: () => new Map(),
    onErrorRetry: () => {},
    ...swr,
  };
  return render(
    <SWRConfig value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <AppRoutes />
      </MemoryRouter>
    </SWRConfig>,
  );
}

const views = () => analytics.trackPageview.mock.calls.map(([view]) => view);
const contexts = () =>
  analytics.setPageContext.mock.calls.map(([context]) => context);
const article = () => screen.findByRole("heading", { level: 1 });

beforeEach(() => {
  analytics.trackPageview.mockReset();
  analytics.setPageContext.mockReset();
  analytics.track.mockReset();
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
});

describe("a post that loads", () => {
  it("sends one page_view, after the post arrives, with the post's own title and language", async () => {
    const gate = deferred();
    const fetchMock = stubFetch({
      "/api/posts/hello-world": () => gate.promise,
    });
    renderAt("/blog/hello-world");

    // Loading: no view yet, and the page context already says blog_post
    // (no stale type from the previous page, no content language yet).
    await screen.findByRole("status");
    expect(views()).toEqual([]);
    expect(contexts().at(-1)).toEqual({
      page_type: "blog_post",
      ui_locale: "en",
      content_language: null,
    });

    await act(async () => gate.resolve(json(POST)));
    expect((await article()).textContent).toBe("Hello world");

    expect(views()).toHaveLength(1);
    expect(views()[0]).toEqual({
      path: "/blog/hello-world",
      search: "",
      pageType: "blog_post",
      postSlug: "hello-world",
      uiLocale: "en",
      contentLanguage: "en",
      title: "Hello world | Cengizhan Köse",
    });
    expect(requests(fetchMock, "/api/posts/hello-world")).toBe(1);
  });

  it("uses the post's seoTitle in the title (T-07, SEO-10)", async () => {
    stubFetch({ "/api/posts/second-post": json(OTHER) });
    renderAt("/blog/second-post");
    await article();

    expect(views()).toHaveLength(1);
    expect(views()[0].title).toBe("Second | Cengizhan Köse");
  });

  it("does not send another view when the entry revalidates", async () => {
    stubFetch({ "/api/posts/hello-world": () => json(POST) });
    renderAt("/blog/hello-world");
    await article();
    expect(views()).toHaveLength(1);

    await act(async () => {
      await mutateAll("/api/posts/hello-world");
    });

    expect(views()).toHaveLength(1);
  });

  it("sends at once, and asks for nothing, when the post is already in the cache (server fallback)", async () => {
    const fetchMock = stubFetch({});
    renderAt("/blog/hello-world", {
      fallback: { "/api/posts/hello-world": POST },
    });
    await article();

    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({
      pageType: "blog_post",
      postSlug: "hello-world",
      title: "Hello world | Cengizhan Köse",
    });
    expect(requests(fetchMock, "/api/posts/hello-world")).toBe(0);
  });

  it("moving from one post to another sends one view each, never the old post's title for the new one", async () => {
    stubFetch({
      "/api/posts/hello-world": json(POST),
      "/api/posts/second-post": json(OTHER),
    });
    renderAt("/blog/hello-world");
    await screen.findByText("Hello world");

    fireEvent.click(screen.getByRole("link", { name: "second" }));
    await screen.findByText("Second post");

    expect(views().map((view) => view.path)).toEqual([
      "/blog/hello-world",
      "/blog/second-post",
    ]);
    expect(views().map((view) => view.postSlug)).toEqual([
      "hello-world",
      "second-post",
    ]);
    expect(views().map((view) => view.title)).toEqual([
      "Hello world | Cengizhan Köse",
      "Second | Cengizhan Köse",
    ]);
  });

  it("sends nothing for a post the visitor left before it arrived", async () => {
    const gate = deferred();
    stubFetch({ "/api/posts/hello-world": () => gate.promise });
    renderAt("/blog/hello-world");
    await screen.findByRole("status");

    fireEvent.click(screen.getByRole("link", { name: "about" }));
    await act(async () => gate.resolve(json(POST)));

    expect(views().map((view) => view.pageType)).toEqual(["about"]);
  });
});

describe("a post that does not load", () => {
  it("an API 404 is a not_found view (what BlogPost shows) without a post slug", async () => {
    const fetchMock = stubFetch({
      "/api/posts/hello-world": json(
        { error: "Not found", code: "not_found" },
        404,
      ),
    });
    renderAt("/blog/hello-world");
    await screen.findByRole("heading", { level: 1, name: /not found/i });

    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({
      path: "/blog/hello-world",
      pageType: "not_found",
      uiLocale: "en",
      title: "Post not found | Cengizhan Köse",
    });
    expect(views()[0].postSlug).toBeUndefined();
    expect(contexts().at(-1)).toMatchObject({ page_type: "not_found" });
    expect(requests(fetchMock, "/api/posts/hello-world")).toBe(1);
  });

  it("a server error is a blog_post view with the blog title, and BlogPost reports the failure once", async () => {
    stubFetch({
      "/api/posts/hello-world": json({ error: "boom", code: "internal" }, 500),
    });
    renderAt("/blog/hello-world");
    await screen.findByRole("alert");

    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({
      pageType: "blog_post",
      postSlug: "hello-world",
      contentLanguage: "unknown",
      title: "Blog | Cengizhan Köse",
    });
    const errors = analytics.track.mock.calls.filter(
      ([name]) => name === "error_occurred",
    );
    expect(errors).toEqual([
      [
        "error_occurred",
        { scope: "blog_api", endpoint: "post", status: "500" },
      ],
    ]);
  });

  it("a network failure is the same blog_post view", async () => {
    stubFetch({});
    renderAt("/blog/hello-world");
    await screen.findByRole("alert");

    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({
      pageType: "blog_post",
      contentLanguage: "unknown",
    });
  });
});

describe("a post under the other language's prefix", () => {
  it("is redirected by BlogPost and only the final path gets a view", async () => {
    stubFetch({ "/api/posts/merhaba-dunya": json(TR_POST) });
    renderAt("/blog/merhaba-dunya");
    await screen.findByText("Merhaba dünya");

    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({
      path: "/tr/blog/merhaba-dunya",
      pageType: "blog_post",
      postSlug: "merhaba-dunya",
      uiLocale: "tr",
      contentLanguage: "tr",
      title: "Merhaba dünya | Cengizhan Köse",
    });
  });

  it("a TR post opened at its own path is one view in tr", async () => {
    stubFetch({ "/api/posts/merhaba-dunya": json(TR_POST) });
    renderAt("/tr/blog/merhaba-dunya");
    await screen.findByText("Merhaba dünya");

    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({
      path: "/tr/blog/merhaba-dunya",
      uiLocale: "tr",
      contentLanguage: "tr",
    });
  });
});

describe("other pages are unaffected", () => {
  it("a static page next to the blog asks the API for nothing", async () => {
    const fetchMock = stubFetch({});
    renderAt("/about");
    await screen.findByText("About page");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({ pageType: "about" });
  });

  it("leaving a post for a static page stops asking for it", async () => {
    stubFetch({ "/api/posts/hello-world": json(POST) });
    renderAt("/blog/hello-world");
    await screen.findByText("Hello world");

    await act(async () => navigate("/about"));

    expect(views().map((view) => view.pageType)).toEqual([
      "blog_post",
      "about",
    ]);
  });
});
