// ANL-16: internal traffic stays out (prod only, host allowlist, opt-out).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyOptOutParam,
  OPT_OUT_KEY,
  readDoNotTrack,
  readOptOut,
  safeStorage,
  shouldTrack,
  UMAMI_DISABLED_KEY,
} from "../../../src/lib/analytics/guard.js";

const HOSTS = ["www.cengizhankose.com"];
const base = {
  isProd: true,
  hostname: "www.cengizhankose.com",
  optedOut: false,
  allowedHosts: HOSTS,
};

describe("shouldTrack truth table (ANL-16 criterion 1)", () => {
  it.each([
    ["prod, www, no opt-out", base, true],
    ["dev build", { ...base, isProd: false }, false],
    ["apex host", { ...base, hostname: "cengizhankose.com" }, false],
    [
      "*.outplane.app origin",
      { ...base, hostname: "cengoportfoliolhal.outplane.app" },
      false,
    ],
    ["localhost", { ...base, hostname: "localhost" }, false],
    ["opted out", { ...base, optedOut: true }, false],
    ["Do Not Track", { ...base, doNotTrack: true }, false],
    ["no allowlist", { ...base, allowedHosts: undefined }, false],
  ])("%s", (_label, input, expected) => {
    expect(shouldTrack(input)).toBe(expected);
  });
});

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const blockedStorage = {
  getItem() {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem() {
    throw new DOMException("blocked", "SecurityError");
  },
  removeItem() {
    throw new DOMException("blocked", "SecurityError");
  },
};

describe("opt-out flag (ANL-16 criterion 3)", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("?analytics=off sets both flags and cleans the address bar", () => {
    window.history.replaceState({ key: "k1" }, "", "/about?analytics=off#top");
    const storage = memoryStorage();

    const action = applyOptOutParam(window.location.search, {
      storage,
      history: window.history,
      location: window.location,
    });

    expect(action).toBe("off");
    expect(storage.getItem(OPT_OUT_KEY)).toBe("1");
    expect(storage.getItem(UMAMI_DISABLED_KEY)).toBe("1");
    expect(readOptOut(storage)).toBe(true);
    expect(window.location.pathname + window.location.search).toBe("/about");
    expect(window.location.hash).toBe("#top");
    expect(window.history.state).toEqual({ key: "k1" });
  });

  it("?analytics=on removes both flags and keeps other parameters", () => {
    window.history.replaceState(
      null,
      "",
      "/?utm_source=linkedin&analytics=on&utm_medium=social",
    );
    const storage = memoryStorage();
    storage.setItem(OPT_OUT_KEY, "1");
    storage.setItem(UMAMI_DISABLED_KEY, "1");

    const action = applyOptOutParam(window.location.search, {
      storage,
      history: window.history,
      location: window.location,
    });

    expect(action).toBe("on");
    expect(readOptOut(storage)).toBe(false);
    expect(window.location.search).toBe(
      "?utm_source=linkedin&utm_medium=social",
    );
  });

  it("does nothing without the parameter", () => {
    const history = { replaceState: vi.fn(), state: null };
    const storage = memoryStorage();
    expect(
      applyOptOutParam("?utm_source=x", {
        storage,
        history,
        location: window.location,
      }),
    ).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(readOptOut(storage)).toBe(false);
  });

  it("an opt-out made through Umami's own key also counts", () => {
    const storage = memoryStorage();
    storage.setItem(UMAMI_DISABLED_KEY, "1");
    expect(readOptOut(storage)).toBe(true);
  });
});

describe("blocked storage (ANL-16 criterion 4, FE-09)", () => {
  it("never throws and treats the browser as opted out", () => {
    window.history.replaceState(null, "", "/?analytics=off");
    expect(() =>
      applyOptOutParam(window.location.search, {
        storage: blockedStorage,
        history: window.history,
        location: window.location,
      }),
    ).not.toThrow();
    expect(readOptOut(blockedStorage)).toBe(true);
    expect(readOptOut(null)).toBe(true);
    window.history.replaceState(null, "", "/");
  });

  it("safeStorage returns null when the localStorage getter throws", () => {
    const win = {};
    Object.defineProperty(win, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    expect(safeStorage(win)).toBeNull();
    expect(safeStorage(window)).toBe(window.localStorage);
  });
});

describe("Do Not Track", () => {
  it.each([
    [{ doNotTrack: "1" }, true],
    [{ navigator: { doNotTrack: "1" } }, true],
    [{ navigator: { msDoNotTrack: "yes" } }, true],
    [{ navigator: { doNotTrack: "0" } }, false],
    [{ navigator: {} }, false],
  ])("%j -> %s", (win, expected) => {
    expect(readDoNotTrack(win)).toBe(expected);
  });
});
