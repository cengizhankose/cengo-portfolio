// src/lib/swr.js (T-04, FE-12 step 2, FE-03 step 1, ANL-15, PERF-14 step 3):
// keys are the API paths with the language parameter, the fetcher turns an
// unusable 2xx body into a 'bad_shape' error, errorStatus() gives the
// error_occurred status and only transient failures are retried.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  POSTS_PATH,
  RETRY_DELAY_MS,
  RETRY_LIMIT,
  UnexpectedPayloadError,
  blogFetcher,
  blogIndexKeys,
  errorStatus,
  isPostKey,
  isPostsKey,
  onErrorRetry,
  postKey,
  postsKey,
  shouldRetry,
  swrConfig,
} from "../../../src/lib/swr.js";
import { ApiError } from "../../../src/lib/api.js";

const respond = (body, status = 200) =>
  vi.fn(async () =>
    typeof body === "string"
      ? new Response(body, { status })
      : Response.json(body, { status }),
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("keys (T-04: the key is the API path, with ?lang=, T-12)", () => {
  it("list keys carry the language, and missingIn for the second group", () => {
    expect(postsKey("en")).toBe("/api/posts?lang=en");
    expect(postsKey("tr")).toBe("/api/posts?lang=tr");
    expect(postsKey("tr", { missingIn: "en" })).toBe(
      "/api/posts?lang=tr&missingIn=en",
    );
  });

  it("a blog index asks its own language, then the other untranslated one", () => {
    expect(blogIndexKeys("en")).toEqual([
      "/api/posts?lang=en",
      "/api/posts?lang=tr&missingIn=en",
    ]);
    expect(blogIndexKeys("tr")).toEqual([
      "/api/posts?lang=tr",
      "/api/posts?lang=en&missingIn=tr",
    ]);
  });

  it("post keys are the encoded slug path; no slug, no key", () => {
    expect(postKey("hello-world")).toBe("/api/posts/hello-world");
    expect(postKey("a b/c")).toBe("/api/posts/a%20b%2Fc");
    expect(postKey("")).toBeNull();
    expect(postKey(undefined)).toBeNull();
  });

  it("tells list keys from post keys", () => {
    expect(isPostsKey(POSTS_PATH)).toBe(true);
    expect(isPostsKey(postsKey("en"))).toBe(true);
    expect(isPostsKey(postKey("x"))).toBe(false);
    expect(isPostKey(postKey("x"))).toBe(true);
    expect(isPostKey(postsKey("en"))).toBe(false);
  });
});

describe("blogFetcher (FE-03 step 1: res.ok + shape checks)", () => {
  it("returns a list array and a post object as they are", async () => {
    vi.stubGlobal("fetch", respond([{ id: 1 }]));
    await expect(blogFetcher(postsKey("en"))).resolves.toEqual([{ id: 1 }]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/posts?lang=en",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );

    vi.stubGlobal("fetch", respond({ slug: "x" }));
    await expect(blogFetcher(postKey("x"))).resolves.toEqual({ slug: "x" });
  });

  it("a non-2xx answer rejects with the HTTP status (ApiError)", async () => {
    vi.stubGlobal("fetch", respond({ error: "Failed to fetch posts" }, 500));
    const error = await blogFetcher(postsKey("en")).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
  });

  it.each([
    ["a list that is an object", postsKey("en"), { error: "x" }],
    ["a list that is null", postsKey("en"), null],
    ["a post that is an array", postKey("x"), []],
    ["a post that is a string", postKey("x"), "hello"],
  ])("%s is 'bad_shape'", async (_, key, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(body)),
    );
    const error = await blogFetcher(key).catch((e) => e);
    expect(error).toBeInstanceOf(UnexpectedPayloadError);
    expect(error.status).toBe("bad_shape");
  });

  it("a 2xx body that is not JSON is 'bad_shape'", async () => {
    vi.stubGlobal("fetch", respond("<html>proxy error</html>"));
    const error = await blogFetcher(postsKey("en")).catch((e) => e);
    expect(error.status).toBe("bad_shape");
  });

  it("a network failure keeps the fetch error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const error = await blogFetcher(postsKey("en")).catch((e) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(errorStatus(error)).toBe("network");
  });
});

describe("errorStatus (ANL-15: '500' | 'network' | 'bad_shape')", () => {
  it.each([
    [new ApiError("x", { status: 500 }), "500"],
    [new ApiError("x", { status: 404 }), "404"],
    [new UnexpectedPayloadError(), "bad_shape"],
    [new TypeError("Failed to fetch"), "network"],
    [undefined, "network"],
  ])("%o -> %s", (error, status) => {
    expect(errorStatus(error)).toBe(status);
  });
});

describe("retries (FE-12 step 2: only transient failures, at most twice)", () => {
  it("retries no answer and 5xx, never a 4xx or a bad payload", () => {
    expect(shouldRetry(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(new ApiError("x", { status: 503 }))).toBe(true);
    expect(shouldRetry(new ApiError("x", { status: 404 }))).toBe(false);
    expect(shouldRetry(new ApiError("x", { status: 400 }))).toBe(false);
    expect(shouldRetry(new UnexpectedPayloadError())).toBe(false);
  });

  it("waits RETRY_DELAY_MS and stops after RETRY_LIMIT retries", () => {
    vi.useFakeTimers();
    const revalidate = vi.fn();
    const error = new ApiError("x", { status: 500 });

    for (let retryCount = 1; retryCount <= RETRY_LIMIT + 1; retryCount++) {
      onErrorRetry(error, "k", {}, revalidate, { retryCount, dedupe: true });
    }
    vi.advanceTimersByTime(RETRY_DELAY_MS - 1);
    expect(revalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revalidate).toHaveBeenCalledTimes(RETRY_LIMIT);
    expect(revalidate).toHaveBeenCalledWith({ retryCount: 1, dedupe: true });

    onErrorRetry(new ApiError("x", { status: 404 }), "k", {}, revalidate, {
      retryCount: 1,
    });
    vi.runAllTimers();
    expect(revalidate).toHaveBeenCalledTimes(RETRY_LIMIT);
  });

  it("shares one config: 5 min dedupe, no focus refetch, no previous data", () => {
    expect(swrConfig).toMatchObject({
      fetcher: blogFetcher,
      dedupingInterval: 300_000,
      revalidateOnFocus: false,
      keepPreviousData: false,
      onErrorRetry,
    });
    expect(Object.isFrozen(swrConfig)).toBe(true);
  });
});
