// PERF-25 / T-09: one flag (CF_WEB_ANALYTICS, default on) controls the
// Cloudflare Web Analytics beacon hosts in the CSP and the processor entry in
// the privacy notice. Umami's host is never touched by it.
import { afterEach, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/api/app";
import {
  buildCsp,
  cfWebAnalyticsFromEnv,
  CF_BEACON_REPORT_ORIGIN,
  CF_BEACON_SCRIPT_ORIGIN,
  UMAMI_ORIGIN,
} from "../../../src/api/middleware/csp";
import { fakeQueries } from "../api/fake-queries";
import { silenceLogs } from "../helpers";

silenceLogs();

const BEACON_HOSTS = [CF_BEACON_SCRIPT_ORIGIN, CF_BEACON_REPORT_ORIGIN];

describe("cfWebAnalyticsFromEnv", () => {
  test("on by default: unset, empty and anything that is not an off value", () => {
    for (const value of [
      undefined,
      "",
      " ",
      "on",
      "1",
      "true",
      "yes",
      "maybe",
    ]) {
      expect(cfWebAnalyticsFromEnv(value), String(value)).toBe(true);
    }
  });

  test("off values (any case, trimmed)", () => {
    for (const value of [
      "off",
      "OFF",
      " off ",
      "0",
      "false",
      "False",
      "no",
      "disabled",
    ]) {
      expect(cfWebAnalyticsFromEnv(value), value).toBe(false);
    }
  });
});

describe("buildCsp with the flag", () => {
  const hosts = (csp: ReturnType<typeof buildCsp>) =>
    [...(csp.scriptSrc ?? []), ...(csp.connectSrc ?? [])].map(String);

  test("on: both beacon hosts and Umami are in the policy", () => {
    const csp = buildCsp({ mode: "report-only", cfWebAnalytics: true });
    expect(csp.scriptSrc).toContain(CF_BEACON_SCRIPT_ORIGIN);
    expect(csp.connectSrc).toContain(CF_BEACON_REPORT_ORIGIN);
    expect(csp.scriptSrc).toContain(UMAMI_ORIGIN);
    expect(csp.connectSrc).toContain(UMAMI_ORIGIN);
  });

  test("off: no cloudflareinsights host anywhere, Umami and EmailJS stay", () => {
    const csp = buildCsp({ mode: "enforce", cfWebAnalytics: false });
    const all = hosts(csp).join(" ");
    expect(all).not.toContain("cloudflareinsights");
    expect(csp.scriptSrc).toEqual(["'self'", UMAMI_ORIGIN]);
    expect(csp.connectSrc).toEqual([
      "'self'",
      UMAMI_ORIGIN,
      "https://api.emailjs.com",
    ]);
  });

  test("the default reads CF_WEB_ANALYTICS from the process environment", () => {
    const before = process.env.CF_WEB_ANALYTICS;
    try {
      delete process.env.CF_WEB_ANALYTICS;
      expect(hosts(buildCsp({ mode: "report-only" }))).toEqual(
        expect.arrayContaining(BEACON_HOSTS),
      );
      process.env.CF_WEB_ANALYTICS = "off";
      expect(hosts(buildCsp({ mode: "report-only" })).join(" ")).not.toContain(
        "cloudflareinsights",
      );
    } finally {
      if (before === undefined) delete process.env.CF_WEB_ANALYTICS;
      else process.env.CF_WEB_ANALYTICS = before;
    }
  });
});

describe("the served header", () => {
  const original = process.env.CF_WEB_ANALYTICS;
  afterEach(() => {
    if (original === undefined) delete process.env.CF_WEB_ANALYTICS;
    else process.env.CF_WEB_ANALYTICS = original;
  });

  async function csp(flag: string | undefined): Promise<string> {
    if (flag === undefined) delete process.env.CF_WEB_ANALYTICS;
    else process.env.CF_WEB_ANALYTICS = flag;
    const res = await createApp({ queries: fakeQueries(), env: {} }).request(
      "/api/posts",
    );
    return res.headers.get("content-security-policy-report-only") ?? "";
  }

  test("default: the beacon hosts are in the header", async () => {
    const header = await csp(undefined);
    expect(header).toContain("https://static.cloudflareinsights.com");
    expect(header).toContain("https://cloudflareinsights.com");
  });

  test("off: `grep -c cloudflareinsights` is 0 and Umami's host is still there once per directive", async () => {
    const header = await csp("off");
    expect(header.match(/cloudflareinsights/g)).toBeNull();
    expect(header.match(/stats\.cengizhankose\.com/g)).toHaveLength(2);
  });
});

describe("the privacy notice (EN and TR)", () => {
  const original = process.env.VITE_CF_WEB_ANALYTICS;
  afterEach(() => {
    if (original === undefined) delete process.env.VITE_CF_WEB_ANALYTICS;
    else process.env.VITE_CF_WEB_ANALYTICS = original;
  });

  async function processors(lang: "en" | "tr", flag: string | undefined) {
    if (flag === undefined) delete process.env.VITE_CF_WEB_ANALYTICS;
    else process.env.VITE_CF_WEB_ANALYTICS = flag;
    // A query string gives the module a fresh evaluation under each flag value.
    const module = (await import(
      `../../../src/content/${lang}/privacy.js?cf=${String(flag)}-${lang}`
    )) as { privacyProcessors: { id: string; name: string }[] };
    return module.privacyProcessors;
  }

  for (const lang of ["en", "tr"] as const) {
    test(`${lang}: listed by default and with an empty value`, async () => {
      for (const flag of [undefined, "", "on"]) {
        const ids = (await processors(lang, flag)).map((entry) => entry.id);
        expect(ids, String(flag)).toContain("cloudflare_web_analytics");
      }
    });

    test(`${lang}: off drops only the Cloudflare Web Analytics entry`, async () => {
      const ids = (await processors(lang, "off")).map((entry) => entry.id);
      expect(ids).toEqual(["emailjs", "umami", "cloudflare", "out_plane"]);
    });
  }

  test("off: the whole notice no longer mentions Cloudflare Web Analytics", async () => {
    for (const lang of ["en", "tr"] as const) {
      process.env.VITE_CF_WEB_ANALYTICS = "off";
      const module = (await import(
        `../../../src/content/${lang}/privacy.js?text=off-${lang}`
      )) as { default: unknown };
      expect(JSON.stringify(module.default), lang).not.toContain(
        "Cloudflare Web Analytics",
      );
    }
  });

  test("EN and TR keep the same ids in the same order under both settings", async () => {
    for (const flag of [undefined, "off"]) {
      const en = (await processors("en", flag)).map((entry) => entry.id);
      const tr = (await processors("tr", flag)).map((entry) => entry.id);
      expect(tr, String(flag)).toEqual(en);
    }
  });
});
