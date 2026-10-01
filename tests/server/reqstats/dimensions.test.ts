// ANL-13: the dimensions a request is counted under. Pure functions, no app,
// no database. Every one is a small closed set (no full URL, no IP, no UA).
import { describe, expect, test } from "bun:test";
import {
  countryOf,
  hostGroup,
  isBotUserAgent,
  requestPathGroup,
  statusClass,
} from "../../../src/server/requestStats";

describe("hostGroup", () => {
  test.each<[string | undefined, string]>([
    ["www.cengizhankose.com", "www"],
    ["WWW.CengizhanKose.com:443", "www"],
    ["cengizhankose.com", "apex"],
    ["cengizhankose.com.", "apex"],
    ["cengoportfoliolhal-3000-abc123.outplane.app", "outplane"],
    ["localhost:3000", "other"],
    ["evil.example", "other"],
    ["www.cengizhankose.com.evil.example", "other"],
    [".outplane.app", "other"],
    ["", "other"],
    [undefined, "other"],
  ])("%p -> %p", (host, expected) => {
    expect<string>(hostGroup(host)).toBe(expected);
  });
});

describe("statusClass", () => {
  test.each([
    [200, "2xx"],
    [204, "2xx"],
    [301, "3xx"],
    [404, "4xx"],
    [429, "4xx"],
    [500, "5xx"],
    [503, "5xx"],
    [0, "5xx"],
    [999, "5xx"],
  ])("%p -> %p", (status, expected) => {
    expect(statusClass(status)).toBe(expected);
  });
});

describe("countryOf", () => {
  test("missing header -> XX", () => {
    expect(countryOf(undefined, "www")).toBe("XX");
    expect(countryOf("", "www")).toBe("XX");
  });
  test("two-character code, upper-cased, on the Cloudflare hosts", () => {
    expect(countryOf("tr", "www")).toBe("TR");
    expect(countryOf("DE", "apex")).toBe("DE");
    expect(countryOf("T1", "www")).toBe("T1"); // Cloudflare's Tor code
  });
  test("malformed values -> XX", () => {
    for (const bad of ["TUR", "T", "T R", "<s", "Tİ"])
      expect(countryOf(bad, "www")).toBe("XX");
  });
  test("not trusted off Cloudflare (outplane, other): a client can send anything", () => {
    expect(countryOf("TR", "outplane")).toBe("XX");
    expect(countryOf("TR", "other")).toBe("XX");
  });
});

describe("isBotUserAgent", () => {
  test.each([
    [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    ],
    ["Mozilla/5.0 (compatible; bingbot/2.0)"],
    ["curl/8.4.0"],
    ["python-requests/2.31"],
    ["Go-http-client/2.0"],
    ["Mozilla/5.0 HeadlessChrome/120"],
    ["Slackbot-LinkExpanding 1.0"],
    [""],
    [undefined],
  ])("bot: %p", (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });
  test.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
  ])("human: %p", (ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });
});

describe("requestPathGroup (ANL-05 classifyPath)", () => {
  test.each([
    ["/", "page"],
    ["/about", "page"],
    ["/tr/about", "page"],
    ["/blog", "page"],
    ["/blog/some-post", "page"],
    ["/assets/index-abc.js", "asset"],
    ["/og/default.jpg", "asset"],
    ["/api/posts", "api"],
    ["/robots.txt", "meta"],
    ["/sitemap.xml", "meta"],
    ["/.well-known/assetlinks.json", "meta"],
    ["/wp-login.php", "probe"],
    ["/.env", "probe"],
    ["/admin", "probe"],
    ["/something-unknown", "other"],
  ])("%p -> %p", (path, expected) => {
    expect(requestPathGroup(path)).toBe(expected);
  });

  test("the group never contains the path", () => {
    for (const path of ["/blog/secret-slug", "/.git/config", "/a/b/c?x=1"])
      expect(requestPathGroup(path)).toMatch(
        /^(page|asset|api|meta|probe|other|health)$/,
      );
  });
});
