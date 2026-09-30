// @vitest-environment node
//
// Static checks for the conversion package that jsdom cannot make: the CSS
// source (DSG-28 focus ring, the anchor button), the page sources (no block
// inside the link, no 'Send' literal, tracking through track() only, no
// static EmailJS import) and the analytics catalogue (no event that does not
// exist).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import {
  CTA_IDS,
  EVENT_NAMES,
  isKnownEvent,
} from "../../../src/lib/analytics/events.js";

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), "utf8");

// Declarations of the first rule whose selector list contains `selector`.
function declarations(css, selector) {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((part) => part.trim());
    if (selectors.includes(selector)) {
      return Object.fromEntries(
        match[2]
          .split(";")
          .map((decl) => decl.trim())
          .filter(Boolean)
          .map((decl) => {
            const colon = decl.indexOf(":");
            return [decl.slice(0, colon).trim(), decl.slice(colon + 1).trim()];
          }),
      );
    }
  }
  return null;
}

const HOME_CSS = read("src/pages/home/style.css");
const HOME = read("src/pages/home/index.jsx");
const CONTACT = read("src/pages/contact/index.jsx");

describe("hero button (DSG-28)", () => {
  it("has a 2px solid text-colour focus ring outside the button box", () => {
    expect(
      declarations(HOME_CSS, ".intro_btn-action .ac_btn:focus-visible"),
    ).toEqual({
      outline: "2px solid var(--text-color)",
      "outline-offset": "3px",
    });
  });

  it("the evidence link has the same ring", () => {
    expect(declarations(HOME_CSS, ".intro__textlink:focus-visible")).toEqual({
      outline: "2px solid var(--text-color)",
      "outline-offset": "3px",
    });
  });

  it("the ring is more specific than Bootstrap's .btn:focus-visible (0,2,0)", () => {
    // `.intro_btn-action .ac_btn:focus-visible` is three classes/pseudos.
    const selector = ".intro_btn-action .ac_btn:focus-visible";
    const specificity = selector.match(/[.:][\w-]+/g).length;
    expect(specificity).toBeGreaterThanOrEqual(3);
  });

  it("the button does not animate its outline (no `transition: all`)", () => {
    const rule = declarations(HOME_CSS, ".ac_btn");
    expect(rule["transition-property"]).toBeDefined();
    expect(rule["transition-property"]).not.toMatch(/all|outline/);
    expect(rule.transition).toBeUndefined();
  });

  it("the ring layers are blocks, so they fill a span as they filled a div", () => {
    expect(declarations(HOME_CSS, ".ac_btn .ring")).toMatchObject({
      display: "block",
      position: "absolute",
    });
  });

  it("the old About button style is gone", () => {
    expect(HOME_CSS).not.toContain("#button_p");
  });
});

describe("hero markup (DSG-28, MKT-19)", () => {
  it("the button is the Link itself: no <div> between its tags", () => {
    const start = HOME.indexOf('id="button_h"');
    const button = HOME.slice(start, HOME.indexOf("</Link>", start));
    expect(start).toBeGreaterThan(0);
    expect(button).not.toMatch(/<div\b/);
    expect(button).toContain('className="ac_btn btn"');
    expect(HOME).not.toContain("button_p");
  });

  it("uses no timer or animation frame (the hero stays CSS-only)", () => {
    expect(HOME).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
  });
});

describe("contact page source (MKT-10, ANL-02)", () => {
  it("has no 'Send' literal (MKT-10 criterion 1)", () => {
    expect(CONTACT).not.toMatch(/"Send"/);
  });

  it("does not import the EmailJS SDK statically (W3: it is loaded on send)", () => {
    expect(CONTACT).not.toMatch(/^import .*@emailjs\/browser/m);
  });

  it("drops console.log of form results (ANL-02 step 3)", () => {
    expect(CONTACT).not.toMatch(/console\.log/);
  });

  it("the project type field is named project_type, never 'subject' (the honeypot's name)", () => {
    expect(CONTACT).toContain('name="project_type"');
    expect(CONTACT).not.toContain('name="subject"');
  });

  it("never passes the typed text or address to track()", () => {
    const calls = CONTACT.match(/track\([\s\S]*?\);/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      expect(call).not.toMatch(/formData\.(name|email|message)\b/);
      expect(call).not.toMatch(/\berror\.text\b|\.text\b/);
    }
  });
});

describe("events of this package exist in the catalogue (ANL-02, W2 handoff)", () => {
  it("every track('…') name in the two pages is a known event", () => {
    const names = [
      ...HOME.matchAll(/track\(\s*"([a-z_]+)"/g),
      ...CONTACT.matchAll(/track\(\s*"([a-z_]+)"/g),
    ].map((match) => match[1]);
    expect(new Set(names)).toEqual(
      new Set([
        "cta_clicked",
        "email_link_clicked",
        "contact_form_started",
        "contact_form_submitted",
      ]),
    );
    for (const name of names) expect(isKnownEvent(name)).toBe(true);
  });

  it("a failed send is contact_form_submitted with result 'error', not a second event", () => {
    expect(EVENT_NAMES).not.toContain("contact_form_failed");
    expect(`${HOME}${CONTACT}`).not.toContain("contact_form_failed");
  });

  it("the hero ids are registered CTA ids", () => {
    expect(CTA_IDS).toContain("hero_contact");
    expect(CTA_IDS).toContain("hero_portfolio");
    expect(HOME).toContain("CTA.HERO_CONTACT");
    expect(HOME).toContain("CTA.HERO_PORTFOLIO");
  });
});

describe("lint (jsx-no-literals covers the new markup)", () => {
  it("the two pages and the helpers report nothing", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const results = await eslint.lintFiles([
      "src/pages/home",
      "src/pages/contact",
      "src/lib/analytics/buckets.js",
    ]);
    const messages = results.flatMap((result) =>
      result.messages.map((m) => `${result.filePath}:${m.line} ${m.ruleId}`),
    );
    expect(messages).toEqual([]);
  });
});
