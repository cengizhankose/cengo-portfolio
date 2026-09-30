// ANL-15 acceptance criteria: blog API failures are visible and reported
// once as error_occurred { scope: 'blog_api', endpoint, status }; the empty
// state only follows a successful empty answer; a missing post is not an
// error. `track` is mocked; swr's real retry policy runs (fake timers) to
// show that retries do not send a second event.
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../../../src/lib/analytics";
import {
  RETRY_DELAY_MS,
  RETRY_LIMIT,
  onErrorRetry,
} from "../../../src/lib/swr.js";
import { POST_EN, json, renderBlog, testSWRValue } from "./support.jsx";

vi.mock("../../../src/lib/analytics", () => ({ track: vi.fn() }));

const errorEvents = () =>
  track.mock.calls.filter(([name]) => name === "error_occurred");

beforeEach(() => {
  track.mockClear();
  document.head.innerHTML = "<title>x</title>";
});

describe("list endpoint (ANL-15 criteria 1-3)", () => {
  it("500: error text + 'Try again', no 'No posts yet', one event despite retries", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchMock = vi.fn(async () =>
        json({ error: "Failed to fetch posts" }, 500),
      );
      vi.stubGlobal("fetch", fetchMock);
      // The production retry policy, not the tests' no-op.
      renderBlog("/blog", { swr: testSWRValue({ onErrorRetry }) });

      expect(
        await screen.findByText("Posts couldn't be loaded"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
      expect(screen.queryByText(/No posts yet/)).toBeNull();

      // Let every retry run (and fail).
      for (let i = 0; i < RETRY_LIMIT + 1; i++) {
        await act(async () => vi.advanceTimersByTime(RETRY_DELAY_MS + 10));
      }
      const ownListCalls = fetchMock.mock.calls.filter(
        ([url]) => url === "/api/posts?lang=en",
      );
      expect(ownListCalls).toHaveLength(1 + RETRY_LIMIT);

      // Each list key reports once: the page language's list and the
      // other-language group both failed.
      expect(errorEvents()).toEqual([
        [
          "error_occurred",
          { scope: "blog_api", endpoint: "list", status: "500" },
        ],
        [
          "error_occurred",
          { scope: "blog_api", endpoint: "list", status: "500" },
        ],
      ]);
      expect(screen.getByText("Posts couldn't be loaded")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("only the own list fails: exactly one event, status '500'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/posts?lang=en"
          ? json({ error: "Failed to fetch posts" }, 500)
          : json([]),
      ),
    );
    renderBlog("/blog");
    await screen.findByText("Posts couldn't be loaded");
    await waitFor(() => expect(errorEvents()).toHaveLength(1));
    expect(errorEvents()[0][1]).toEqual({
      scope: "blog_api",
      endpoint: "list",
      status: "500",
    });
  });

  it("fetch rejected: status 'network'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url === "/api/posts?lang=en")
          throw new TypeError("Failed to fetch");
        return json([]);
      }),
    );
    renderBlog("/blog");
    await screen.findByRole("button", { name: "Try again" });
    await waitFor(() => expect(errorEvents()).toHaveLength(1));
    expect(errorEvents()[0][1].status).toBe("network");
    expect(screen.getByText(/couldn't reach the server/i)).toBeInTheDocument();
  });

  it("200 with {}: status 'bad_shape'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        url === "/api/posts?lang=en" ? json({}) : json([]),
      ),
    );
    renderBlog("/blog");
    await screen.findByRole("button", { name: "Try again" });
    await waitFor(() => expect(errorEvents()).toHaveLength(1));
    expect(errorEvents()[0][1]).toEqual({
      scope: "blog_api",
      endpoint: "list",
      status: "bad_shape",
    });
    expect(screen.queryByText(/No posts yet/)).toBeNull();
  });

  it("200 with []: 'No posts yet' and no error_occurred", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([])),
    );
    renderBlog("/blog");
    expect(await screen.findByText("No posts yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(errorEvents()).toEqual([]);
  });

  it("'Try again' after the API recovers loads the posts (criterion 4, locally)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderBlog("/blog");
    const retry = await screen.findByRole("button", { name: "Try again" });

    fetchMock.mockImplementation(async (url) =>
      url === "/api/posts?lang=en" ? json([POST_EN]) : json([]),
    );
    await user.click(retry);
    expect(
      await screen.findByRole("link", { name: "Hello world" }),
    ).toBeInTheDocument();
    // The failure was reported once per key; the successful retry adds none.
    expect(errorEvents()).toHaveLength(2);
  });
});

describe("post endpoint (ANL-15 step 3, criterion 5)", () => {
  it("a missing slug (404) sends no error_occurred", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "Not found", code: "NOT_FOUND" }, 404)),
    );
    renderBlog("/blog/olmayan-yazi-xyz");
    await screen.findByRole("heading", { level: 1, name: "Post not found" });
    await act(async () => {});
    expect(errorEvents()).toEqual([]);
  });

  it("a 503 on a post: endpoint 'post', status '503', once", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "Unavailable" }, 503)),
    );
    renderBlog("/blog/hello-world");
    await screen.findByRole("heading", {
      level: 1,
      name: "This post could not be loaded",
    });
    await waitFor(() => expect(errorEvents()).toHaveLength(1));
    expect(errorEvents()[0][1]).toEqual({
      scope: "blog_api",
      endpoint: "post",
      status: "503",
    });
  });

  it("no error message or URL goes into the event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "secret detail at /x" }, 500)),
    );
    renderBlog("/blog/hello-world");
    await waitFor(() => expect(errorEvents()).toHaveLength(1));
    const [, props] = errorEvents()[0];
    expect(Object.keys(props).sort()).toEqual(["endpoint", "scope", "status"]);
  });
});
