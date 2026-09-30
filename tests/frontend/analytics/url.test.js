// @vitest-environment node
//
// ANL-03: only campaign parameters reach the analytics tool.
import { describe, expect, it } from "vitest";
import {
  buildTrackedUrl,
  cleanPath,
  TRACKED_QUERY_PARAMS,
  trackedReferrer,
} from "../../../src/lib/analytics/url.js";

describe("buildTrackedUrl (ANL-03 criterion 1)", () => {
  it("keeps UTM parameters and drops everything else (plan example)", () => {
    expect(
      buildTrackedUrl(
        "/",
        "?utm_source=linkedin&utm_medium=social&email=a%40b.c",
      ),
    ).toBe("/?utm_source=linkedin&utm_medium=social");
  });

  it("keeps all five UTM keys and ref, in their original order", () => {
    expect(
      buildTrackedUrl(
        "/blog/x",
        "?ref=cv&gclid=1&utm_term=t&utm_content=c&utm_campaign=profile&utm_medium=social&utm_source=x",
      ),
    ).toBe(
      "/blog/x?ref=cv&utm_term=t&utm_content=c&utm_campaign=profile&utm_medium=social&utm_source=x",
    );
    expect(TRACKED_QUERY_PARAMS).toEqual([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "ref",
    ]);
  });

  it("returns the bare path when nothing is tracked", () => {
    expect(buildTrackedUrl("/about", "")).toBe("/about");
    expect(buildTrackedUrl("/about", undefined)).toBe("/about");
    expect(buildTrackedUrl("/contact", "?name=Jane&email=a%40b.c")).toBe(
      "/contact",
    );
    expect(buildTrackedUrl("/tr", "?utm_source=")).toBe("/tr");
  });

  it("keeps the first value of a repeated key and caps long values", () => {
    expect(buildTrackedUrl("/", "?utm_source=a&utm_source=b")).toBe(
      "/?utm_source=a",
    );
    const long = "x".repeat(500);
    expect(buildTrackedUrl("/", `?utm_campaign=${long}`)).toBe(
      `/?utm_campaign=${"x".repeat(200)}`,
    );
  });

  it("ignores upper-case keys (Umami reads lower-case utm_* only)", () => {
    expect(buildTrackedUrl("/", "?UTM_SOURCE=linkedin")).toBe("/");
  });
});

describe("cleanPath", () => {
  it.each([
    ["/about?x=1#y", "/about"],
    ["about", "/about"],
    ["", "/"],
    [undefined, "/"],
    ["/tr/blog/slug", "/tr/blog/slug"],
  ])("%s -> %s", (input, expected) => {
    expect(cleanPath(input)).toBe(expected);
  });
});

describe("trackedReferrer", () => {
  it("keeps origin and path of an external referrer, never its query", () => {
    expect(
      trackedReferrer("https://www.linkedin.com/in/someone?trk=abc#x"),
    ).toBe("https://www.linkedin.com/in/someone");
    expect(trackedReferrer("https://github.com/")).toBe("https://github.com/");
  });

  it("drops empty, invalid and non-http referrers", () => {
    expect(trackedReferrer("")).toBe("");
    expect(trackedReferrer(undefined)).toBe("");
    expect(trackedReferrer("not a url")).toBe("");
    expect(trackedReferrer("android-app://com.slack/")).toBe("");
  });
});
