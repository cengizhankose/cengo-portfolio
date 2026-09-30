// @vitest-environment node
//
// PERF-04 step 5 / FE-05 step 4: a lazy page chunk that is gone after a deploy
// reloads the page once, never in a loop, and never when the stamp cannot be
// kept (src/components/routefallback/lazyPage.js).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RELOAD_STAMP_KEY,
  RELOAD_WINDOW_MS,
  guardedLoader,
  lazyPage,
} from "../../../src/components/routefallback/lazyPage.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
  };
}

const chunkError = () =>
  new TypeError("Failed to fetch dynamically imported module");

// True when `promise` has not settled after a few turns of the event loop.
async function staysPending(promise) {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  return !settled;
}

afterEach(() => {
  delete globalThis.sessionStorage;
});

describe("guardedLoader", () => {
  it("returns the module and clears an old stamp", async () => {
    const storage = memoryStorage({ [RELOAD_STAMP_KEY]: "123" });
    const reload = vi.fn();
    const module = { default: () => null };
    const load = guardedLoader(async () => module, { storage, reload });

    await expect(load()).resolves.toBe(module);
    expect(storage.data.has(RELOAD_STAMP_KEY)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once when the chunk fails, and the lazy promise never settles (the fallback stays)", async () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const load = guardedLoader(
      async () => {
        throw chunkError();
      },
      { storage, reload, now: () => 1_000_000 },
    );

    const pending = load();
    expect(await staysPending(pending)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.data.get(RELOAD_STAMP_KEY)).toBe("1000000");
  });

  it("does not reload a second time within the window: the error goes to the boundary", async () => {
    const error = chunkError();
    const storage = memoryStorage({ [RELOAD_STAMP_KEY]: "1000000" });
    const reload = vi.fn();
    const load = guardedLoader(
      async () => {
        throw error;
      },
      { storage, reload, now: () => 1_000_000 + RELOAD_WINDOW_MS - 1 },
    );

    await expect(load()).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
  });

  it("may reload again once the window has passed (a later deploy in the same tab)", async () => {
    const storage = memoryStorage({ [RELOAD_STAMP_KEY]: "1000000" });
    const reload = vi.fn();
    const load = guardedLoader(
      async () => {
        throw chunkError();
      },
      { storage, reload, now: () => 1_000_000 + RELOAD_WINDOW_MS + 1 },
    );

    expect(await staysPending(load())).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a chunk that loads after the reload clears the stamp, so the next failure can reload", async () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    let fail = true;
    const load = guardedLoader(
      async () => {
        if (fail) throw chunkError();
        return { default: null };
      },
      { storage, reload, now: () => 5 },
    );

    expect(await staysPending(load())).toBe(true); // reload #1
    fail = false;
    await load(); // the page after the reload
    fail = true;
    expect(await staysPending(load())).toBe(true); // reload #2
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when the stamp cannot be written (storage blocked), it rethrows", async () => {
    const error = chunkError();
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem: () => {},
    };
    const reload = vi.fn();
    const load = guardedLoader(
      async () => {
        throw error;
      },
      { storage, reload },
    );

    await expect(load()).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
  });

  it("a blocked sessionStorage getter neither throws at setup nor breaks a successful load", async () => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    const module = { default: null };
    let load;
    expect(() => {
      load = guardedLoader(async () => module);
    }).not.toThrow();
    await expect(load()).resolves.toBe(module);

    const error = chunkError();
    const failing = guardedLoader(async () => {
      throw error;
    });
    await expect(failing()).rejects.toBe(error);
  });
});

describe("lazyPage", () => {
  it("returns a React.lazy component", () => {
    const Page = lazyPage(async () => ({ default: () => null }));
    expect(Page.$$typeof).toBe(Symbol.for("react.lazy"));
  });
});
