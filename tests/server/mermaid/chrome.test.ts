// PERF-05: finding the browser that draws the diagrams (no browser is started
// here; chrome-render.test.ts does that when one is installed).
import { describe, expect, test } from "bun:test";
import {
  ChromeError,
  findChrome,
  NO_CHROME_MESSAGE,
} from "../../../scripts/lib/chrome";

const MAC_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe("findChrome", () => {
  test("CHROME_PATH wins when it exists", () => {
    expect(
      findChrome({
        env: { CHROME_PATH: "/opt/chrome/chrome" },
        exists: (path) => path === "/opt/chrome/chrome" || path === MAC_CHROME,
        which: () => "/usr/bin/chromium",
      }),
    ).toBe("/opt/chrome/chrome");
  });

  test("a CHROME_PATH that does not exist is an error, never another browser", () => {
    expect(() =>
      findChrome({
        env: { CHROME_PATH: "/typo/chrome" },
        exists: (path) => path === MAC_CHROME,
        which: () => null,
      }),
    ).toThrow(new ChromeError("CHROME_PATH does not exist: /typo/chrome"));
  });

  test("a blank CHROME_PATH is ignored", () => {
    expect(
      findChrome({
        env: { CHROME_PATH: "  " },
        exists: (path) => path === MAC_CHROME,
        which: () => null,
      }),
    ).toBe(MAC_CHROME);
  });

  test("the usual macOS locations, then PATH names in order", () => {
    expect(
      findChrome({
        env: {},
        exists: (path) => path === MAC_CHROME,
        which: () => null,
      }),
    ).toBe(MAC_CHROME);
    const asked: string[] = [];
    expect(
      findChrome({
        env: {},
        exists: () => false,
        which: (name) => {
          asked.push(name);
          return name === "chromium" ? "/usr/bin/chromium" : null;
        },
      }),
    ).toBe("/usr/bin/chromium");
    expect(asked).toEqual([
      "google-chrome",
      "google-chrome-stable",
      "chromium",
    ]);
  });

  test("none found -> null, and the message says what to do", () => {
    expect(
      findChrome({ env: {}, exists: () => false, which: () => null }),
    ).toBeNull();
    expect(NO_CHROME_MESSAGE).toContain("CHROME_PATH");
  });
});
