// @vitest-environment node
//
// MKT-16: the second sentence of the hero subheadline. Closed (the default)
// shows the location; open or limited shows the availability text, but never
// a text that still has the draft's brackets.
import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_STATUSES,
  heroStatusLine,
} from "../../../src/pages/home/heroStatus.js";

const hero = (availability) => ({
  location: "Based in Istanbul, Türkiye.",
  availability,
});

describe("heroStatusLine", () => {
  it("knows exactly the three statuses", () => {
    expect([...AVAILABILITY_STATUSES]).toEqual(["open", "limited", "closed"]);
  });

  it("closed shows the location, whatever the text says", () => {
    expect(
      heroStatusLine(hero({ status: "closed", text: "Open to work." })),
    ).toEqual({ status: "closed", text: "Based in Istanbul, Türkiye." });
  });

  it.each(["open", "limited"])("%s shows the availability text", (status) => {
    expect(
      heroStatusLine(
        hero({
          status,
          text: "Based in Istanbul, open to freelance projects from March.",
        }),
      ),
    ).toEqual({
      status,
      text: "Based in Istanbul, open to freelance projects from March.",
    });
  });

  it("never shows a text with draft brackets: the location comes instead", () => {
    for (const text of [
      "Open to [freelance projects / full-time roles] from [month year].",
      "Open from [March",
      "Open from March]",
    ]) {
      expect(heroStatusLine(hero({ status: "open", text }))).toEqual({
        status: "closed",
        text: "Based in Istanbul, Türkiye.",
      });
    }
  });

  it("falls back to the location for a missing or unknown status or an empty text", () => {
    const location = { status: "closed", text: "Based in Istanbul, Türkiye." };
    expect(heroStatusLine(hero({ status: "busy", text: "x" }))).toEqual(
      location,
    );
    expect(heroStatusLine(hero({ status: "open", text: "   " }))).toEqual(
      location,
    );
    expect(heroStatusLine(hero({ status: "open" }))).toEqual(location);
    expect(heroStatusLine(hero(undefined))).toEqual(location);
  });
});
