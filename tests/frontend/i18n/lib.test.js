// @vitest-environment node
//
// FE-33 / SEO-21 / DSG-19: the shared src/lib helpers (formatDate, toIsoDate,
// getJson) and the grep criteria that keep the old copies from coming back.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, API_BASE, apiUrl, getJson } from "../../../src/lib/api.js";
import {
  DATE_TIME_ZONE,
  formatDate,
  localeTag,
  toIsoDate,
} from "../../../src/lib/format.js";

const ROOT = process.cwd();

function sourceFiles(dir = "src") {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(jsx?|tsx?)$/.test(entry.name) ? [path] : [];
    },
  );
}

// `grep -rn <pattern> <dir>` as "file:line" strings.
function grep(pattern, dir = "src") {
  return sourceFiles(dir).flatMap((file) =>
    readFileSync(join(ROOT, file), "utf8")
      .split("\n")
      .flatMap((line, index) =>
        pattern.test(line) ? [`${file}:${index + 1}`] : [],
      ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("formatDate(value, locale) (FE-33 criterion 5, SEO-21, DSG-19)", () => {
  it("writes the date in the page's language", () => {
    expect(formatDate("2026-09-30T10:00:00Z", "tr")).toBe("30 Eylül 2026");
    expect(formatDate("2026-09-30T10:00:00Z", "en")).toBe("September 30, 2026");
    expect(formatDate("2026-09-29T09:00:00Z", "tr")).toBe("29 Eylül 2026");
  });

  it("says 'Invalid date' for something that is not a date", () => {
    expect(formatDate("x", "en")).toBe("Invalid date");
    expect(formatDate(null, "en")).toBe("Invalid date");
    expect(formatDate("", "tr")).toBe("Invalid date");
  });

  it("uses the Istanbul calendar day, whatever the reader's time zone", () => {
    expect(DATE_TIME_ZONE).toBe("Europe/Istanbul");
    // 22:30 UTC on the 29th is already the 30th in Istanbul (UTC+3).
    expect(formatDate("2026-09-29T22:30:00Z", "en")).toBe("September 30, 2026");
    expect(formatDate("2026-09-29T22:30:00Z", "tr")).toBe("30 Eylül 2026");
  });

  it("maps languages to Intl tags and defaults to EN", () => {
    expect(localeTag("tr")).toBe("tr-TR");
    expect(localeTag("en")).toBe("en-US");
    expect(localeTag("de")).toBe("en-US");
    expect(formatDate("2026-01-15T12:00:00Z")).toBe("January 15, 2026");
  });

  it("every TR month name matches the DSG-19 pattern", () => {
    const pattern =
      /^\d{1,2} (Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık) \d{4}$/;
    for (let month = 0; month < 12; month += 1) {
      const iso = new Date(Date.UTC(2026, month, 15, 12)).toISOString();
      expect(formatDate(iso, "tr")).toMatch(pattern);
    }
  });
});

describe("toIsoDate(value) (SEO-21 <time dateTime>)", () => {
  it("returns the full ISO timestamp, or '' for a non-date", () => {
    expect(toIsoDate("2026-09-30T10:00:00Z")).toBe("2026-09-30T10:00:00.000Z");
    expect(toIsoDate(new Date(Date.UTC(2026, 0, 1)))).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(toIsoDate("x")).toBe("");
    expect(toIsoDate(undefined)).toBe("");
  });
});

describe("getJson(path) (FE-33 step 2, BE-09)", () => {
  it("asks the same origin under /api for JSON", async () => {
    const fetchMock = vi.fn(async () => Response.json([{ id: 1 }]));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(
      getJson("/posts", { signal: controller.signal }),
    ).resolves.toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/posts");
    expect(init.signal).toBe(controller.signal);
    expect(init.headers).toEqual({ Accept: "application/json" });
  });

  it("builds relative URLs only", () => {
    expect(API_BASE).toBe("/api");
    expect(apiUrl("/posts/a")).toBe("/api/posts/a");
    expect(apiUrl("posts")).toBe("/api/posts");
    expect(apiUrl("/api/posts?lang=en")).toBe("/api/posts?lang=en");
  });

  it("rejects with status and the T-01 error code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "Not found", code: "not_found" },
          { status: 404 },
        ),
      ),
    );
    const error = await getJson("/posts/nope").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe("not_found");
    expect(error.message).toBe("Not found");
  });

  it("rejects with the status when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html>bad gateway</html>", { status: 502 }),
      ),
    );
    const error = await getJson("/posts").catch((e) => e);
    expect(error.status).toBe(502);
    expect(error.message).toBe("HTTP 502");
    expect(error).not.toHaveProperty("code");
  });

  it("passes network errors through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(getJson("/posts")).rejects.toThrow("Failed to fetch");
  });
});

describe("grep criteria (FE-33, SEO-21, DSG-19)", () => {
  it("no absolute dev API URL and no VITE_API_URL (FE-33 criterion 1)", () => {
    expect(grep(/localhost:3001|VITE_API_URL/)).toEqual([]);
  });

  it("one formatDate definition, in src/lib/format.js (FE-33 criterion 2, DSG-19)", () => {
    const files = (hits) => hits.map((hit) => hit.split(":")[0]);
    expect(files(grep(/const formatDate/))).toEqual(["src/lib/format.js"]);
    expect(grep(/export const formatDate/)).toHaveLength(1);
  });

  it("no DOM queries on the contact page (FE-33 criterion 3)", () => {
    expect(
      grep(/getElementsByClassName|getElementById/, "src/pages/contact"),
    ).toEqual([]);
  });

  it("no hard-coded en-US date formatting (SEO-21 criterion 4, DSG-19)", () => {
    expect(grep(/toLocaleDateString\(['"]en-US['"]/)).toEqual([]);
  });

  it("no automatic language detection (T-12, FE-14 criterion 1)", () => {
    // Code only: src/server/static.ts has a comment saying there is none.
    const code =
      /^(?!\s*(\/\/|\*|\/\*)).*(navigator\.language|accept-language)/i;
    expect(grep(code)).toEqual([]);
    expect(grep(/navigator\.language|accept-language/i, "src/i18n")).toEqual(
      [],
    );
  });
});
