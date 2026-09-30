// @vitest-environment node
//
// ANL-01 / T-13: tracker configuration from build-time env.
import { describe, expect, it } from "vitest";
import {
  ANALYTICS,
  CANONICAL_HOST,
  DEFAULT_SCRIPT_SRC,
  readAnalyticsConfig,
} from "../../../src/lib/analytics/config.js";

const ID = "b59e9c65-ae32-47f1-8400-119fcf4861c4";

describe("readAnalyticsConfig", () => {
  it("is off without a website id (the default until the owner sets it)", () => {
    const config = readAnalyticsConfig({});
    expect(config.provider).toBe("none");
    expect(config.websiteId).toBe("");
    expect(config.scriptSrc).toBe(DEFAULT_SCRIPT_SRC);
  });

  it("turns Umami on with a valid website id", () => {
    const config = readAnalyticsConfig({ VITE_UMAMI_WEBSITE_ID: ` ${ID} ` });
    expect(config.provider).toBe("umami");
    expect(config.websiteId).toBe(ID);
  });

  it("stays off with a malformed id", () => {
    for (const bad of ["abc", "<script>", `${ID}x`]) {
      expect(readAnalyticsConfig({ VITE_UMAMI_WEBSITE_ID: bad }).provider).toBe(
        "none",
      );
    }
  });

  it("uses a custom https tracker URL and refuses anything else", () => {
    expect(
      readAnalyticsConfig({
        VITE_UMAMI_SRC: "https://stats.cengizhankose.com/s.js",
      }).scriptSrc,
    ).toBe("https://stats.cengizhankose.com/s.js");
    for (const bad of ["http://stats.cengizhankose.com/script.js", "js", " "]) {
      expect(readAnalyticsConfig({ VITE_UMAMI_SRC: bad }).scriptSrc).toBe(
        DEFAULT_SCRIPT_SRC,
      );
    }
  });

  it("only the canonical www host may send (K-03)", () => {
    const config = readAnalyticsConfig({ VITE_UMAMI_WEBSITE_ID: ID });
    expect(CANONICAL_HOST).toBe("www.cengizhankose.com");
    expect(config.domains).toEqual(["www.cengizhankose.com"]);
    expect(config.allowedHosts).toEqual(["www.cengizhankose.com"]);
    expect(config.respectDoNotTrack).toBe(true);
  });

  it("the default script is the self-hosted tracker (T-13)", () => {
    expect(DEFAULT_SCRIPT_SRC).toBe(
      "https://stats.cengizhankose.com/script.js",
    );
    // The test env sets no VITE_UMAMI_* value, so the app config is off.
    expect(ANALYTICS.provider).toBe("none");
  });
});
