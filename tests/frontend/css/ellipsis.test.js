// @vitest-environment node
//
// DSG-31 step 1: progress texts end on the ellipsis character (U+2026), not
// on three full stops, in both languages. The contact and blog namespaces
// belong to this package; status.loading lives in src/i18n/*/status.js and
// is switched by the W9 merge patch together with the tests that pin it.
import { describe, expect, it } from "vitest";
import enBlog from "../../../src/i18n/en/blog.js";
import enContact from "../../../src/i18n/en/contact.js";
import trBlog from "../../../src/i18n/tr/blog.js";
import trContact from "../../../src/i18n/tr/contact.js";
import { read } from "./support.js";

const THREE_DOTS = /(Loading|Sending|Yükleniyor|Gönderiliyor)\.\.\./;

describe("ellipsis character (DSG-31)", () => {
  it("writes the sending state with … in EN and TR", () => {
    expect(enContact.sending).toBe("Sending…");
    expect(trContact.sending).toBe("Gönderiliyor…");
  });

  it("has no three-dot progress text in the contact and blog namespaces", () => {
    for (const text of [enBlog, trBlog, enContact, trContact].flatMap((ns) =>
      Object.values(ns).flatMap((value) =>
        typeof value === "string" ? [value] : Object.values(value),
      ),
    )) {
      expect(text).not.toMatch(THREE_DOTS);
      expect(text).not.toMatch(/\.\.\.$/);
    }
    for (const file of [
      "src/i18n/en/contact.js",
      "src/i18n/tr/contact.js",
      "src/i18n/en/blog.js",
      "src/i18n/tr/blog.js",
      "src/pages/blog/BlogHome.jsx",
      "src/pages/contact/style.css",
    ]) {
      expect(read(file), file).not.toMatch(THREE_DOTS);
    }
  });
});
