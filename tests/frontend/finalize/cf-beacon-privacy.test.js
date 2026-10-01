// PERF-25 / T-09: VITE_CF_WEB_ANALYTICS (filled from CF_WEB_ANALYTICS by the
// Docker build) drops the Cloudflare Web Analytics entry from the privacy
// notice in both languages. The same module is bundled for the browser and for
// the prerender, so this is the build-time half of the switch-off.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function ids(lang, flag) {
  vi.resetModules();
  if (flag === undefined) vi.unstubAllEnvs();
  else vi.stubEnv("VITE_CF_WEB_ANALYTICS", flag);
  const module = await import(`../../../src/content/${lang}/privacy.js`);
  return module.privacyProcessors.map((entry) => entry.id);
}

describe.each(["en", "tr"])("privacy processors (%s)", (lang) => {
  it("lists Cloudflare Web Analytics by default and for an empty value", async () => {
    expect(await ids(lang, undefined)).toContain("cloudflare_web_analytics");
    expect(await ids(lang, "")).toContain("cloudflare_web_analytics");
  });

  it("drops it when the flag is off, and nothing else", async () => {
    for (const flag of ["off", "0", "false", "OFF", " disabled "]) {
      expect(await ids(lang, flag), flag).toEqual([
        "emailjs",
        "umami",
        "cloudflare",
        "out_plane",
      ]);
    }
  });
});

describe.each(["en", "tr"])("privacy text (%s)", (lang) => {
  async function text(flag) {
    vi.resetModules();
    if (flag === undefined) vi.unstubAllEnvs();
    else vi.stubEnv("VITE_CF_WEB_ANALYTICS", flag);
    const module = await import(`../../../src/content/${lang}/privacy.js`);
    return JSON.stringify(module.default);
  }

  it("mentions Cloudflare Web Analytics by default", async () => {
    expect(await text(undefined)).toContain("Cloudflare Web Analytics");
  });

  it("does not mention it anywhere once the flag is off (T-09 criterion)", async () => {
    expect(await text("off")).not.toContain("Cloudflare Web Analytics");
  });
});
