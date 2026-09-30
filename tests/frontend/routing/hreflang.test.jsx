// usePageMeta's hreflang and <html lang> handling (SEO-11 step 5): the head
// ends up with exactly getPageMeta()'s alternates, reused when unchanged,
// rebuilt on change, removed when a page has none. Other rel="alternate"
// links (a feed) are left alone.
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPageMeta,
  setAlternates,
  upsertMeta,
  usePageMeta,
} from "../../../src/seo/usePageMeta.js";

const WWW = "https://www.cengizhankose.com";
const PAIR = [
  { hreflang: "en", href: `${WWW}/blog/hello-world` },
  { hreflang: "tr", href: `${WWW}/tr/blog/merhaba-dunya` },
  { hreflang: "x-default", href: `${WWW}/blog/hello-world` },
];

const links = () => [
  ...document.head.querySelectorAll('link[rel="alternate"][hreflang]'),
];
const pairs = () =>
  links().map((l) => [l.getAttribute("hreflang"), l.getAttribute("href")]);

function Probe({ meta }) {
  usePageMeta(meta);
  return null;
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.documentElement.lang = "";
});

describe("setAlternates", () => {
  it("writes the list in order, marked data-seo", () => {
    setAlternates(PAIR);
    expect(pairs()).toEqual(PAIR.map((a) => [a.hreflang, a.href]));
    for (const link of links()) expect(link).toHaveAttribute("data-seo");
  });

  it("keeps the same nodes when the list does not change", () => {
    setAlternates(PAIR);
    const before = links();
    setAlternates(PAIR.map((a) => ({ ...a })));
    expect(links()).toEqual(before);
  });

  it("replaces server-printed or stale links and removes them for an empty list", () => {
    document.head.innerHTML =
      '<link rel="alternate" hreflang="en" href="https://old.example/a">' +
      '<link rel="alternate" type="application/rss+xml" href="/rss.xml">';
    setAlternates(PAIR);
    expect(pairs()).toHaveLength(3);
    expect(pairs()[0][1]).toBe(`${WWW}/blog/hello-world`);

    setAlternates([]);
    expect(links()).toHaveLength(0);
    // The feed link has no hreflang and stays.
    expect(
      document.head.querySelector('link[type="application/rss+xml"]'),
    ).not.toBeNull();
  });

  it("ignores malformed entries and non-arrays", () => {
    setAlternates([{ hreflang: "en" }, { href: "x" }, null, PAIR[0]]);
    expect(pairs()).toEqual([["en", PAIR[0].href]]);
    setAlternates(undefined);
    expect(links()).toHaveLength(0);
  });
});

describe("applyPageMeta / usePageMeta", () => {
  it("writes lang and alternates, and a meta without alternates clears them", () => {
    applyPageMeta({ title: "T", lang: "tr", alternates: PAIR });
    expect(document.documentElement.lang).toBe("tr");
    expect(links()).toHaveLength(3);

    applyPageMeta({ title: "About", lang: "en" });
    expect(document.documentElement.lang).toBe("en");
    expect(links()).toHaveLength(0);
  });

  it("re-renders with an equal (new) array do not rebuild the links", () => {
    const { rerender } = render(
      <Probe meta={{ title: "T", lang: "en", alternates: PAIR }} />,
    );
    const before = links();
    rerender(
      <Probe
        meta={{
          title: "T",
          lang: "en",
          alternates: PAIR.map((a) => ({ ...a })),
        }}
      />,
    );
    expect(links()).toEqual(before);

    rerender(<Probe meta={{ title: "T", lang: "en", alternates: [] }} />);
    expect(links()).toHaveLength(0);
  });

  it("a meta key with quotes cannot break the selector", () => {
    expect(() => upsertMeta("name", 'odd"key\\', "value")).not.toThrow();
    expect(document.head.querySelector("meta").getAttribute("content")).toBe(
      "value",
    );
    upsertMeta("name", 'odd"key\\', "second");
    expect(document.head.querySelectorAll("meta")).toHaveLength(1);
  });
});
